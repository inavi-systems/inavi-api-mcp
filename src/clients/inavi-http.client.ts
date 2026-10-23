import { config } from '@/config/env.config';
import { logger } from '@/utils/logger';
import { adviseError, type INaviErrorKind } from '@/clients/inavi-error';
import type { INaviBaseResponse, QueryValue } from '@/types/inavi-api.types';

/**
 * iNavi가 반환한 실패 헤더를 그대로 담아 올리는 에러.
 *
 * **원문을 유지하되 행동 힌트를 덧붙인다.** 원문만 올리면 모델이 할 수 있는 게 없다.
 */
export class INaviApiError extends Error {
  readonly kind: INaviErrorKind;
  readonly hint: string;

  constructor(
    readonly resultCode: number,
    readonly resultMessage: string,
  ) {
    const { kind, hint } = adviseError(resultCode);
    super(`INAVI Maps API 호출 실패: ${resultCode} - ${resultMessage}\n${hint}`);
    this.name = 'INaviApiError';
    this.kind = kind;
    this.hint = hint;
  }
}

/**
 * 이 서버에서 나간 호출임을 밝히는 쿼리 파라미터.
 *
 * Maps API 서버의 액세스 로그에 쿼리스트링째 남으므로, 로그만 읽어 이 프로젝트의 호출량을
 * 앱키·경로별로 따로 셀 수 있다 (API 서버 변경 없음). 헤더가 아니라 쿼리인 까닭은 지도 SDK
 * 로더가 `<script src>`라 헤더를 달 수 없어서다 — `ui/src/map/inavi-loader.ts`도 같은 값을 붙인다.
 * 모르는 파라미터를 붙여도 GET·POST·로더 모두 응답이 같음을 실측했다 (2026-10-20).
 */
const CLIENT_QUERY = { client: 'api-mcp' } as const;

/**
 * iNavi Maps Open API 공통 HTTP 클라이언트.
 *
 * 이 API는 인증이 헤더가 아니라 URL 경로(`/appkeys/{APPKEY}/...`)에 있고,
 * 인증 실패·잘못된 요청조차 **HTTP 200**으로 내려온다. 따라서 상태 코드만으로는
 * 성공을 판단할 수 없고 본문의 `header.isSuccessful`을 반드시 확인해야 한다.
 */
export class INaviHttpClient {
  constructor(
    private readonly baseUrl: string = config.inavi.fullUrl,
    private readonly timeoutMs: number = config.inavi.timeoutMs,
  ) {}

  async get<T extends INaviBaseResponse>(
    path: string,
    query: Record<string, QueryValue>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}?${toQueryString({ ...query, ...CLIENT_QUERY })}`;
    return this.request<T>(url, { method: 'GET' });
  }

  async post<T extends INaviBaseResponse>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(`${this.baseUrl}${path}?${toQueryString(CLIENT_QUERY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stripUndefined(body)),
    });
  }

  private async request<T extends INaviBaseResponse>(url: string, init: RequestInit): Promise<T> {
    const safeUrl = maskAppkey(url);
    logger.log('info', { message: 'INAVI Maps API 호출', url: safeUrl, method: init.method });

    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });

    if (!response.ok) {
      throw new Error(
        `INAVI Maps API HTTP 오류: ${response.status} ${response.statusText} (${safeUrl})`,
      );
    }

    const data = (await response.json()) as T;

    if (!data.header) {
      throw new Error(`INAVI Maps API 응답에 header가 없습니다 (${safeUrl})`);
    }
    if (!data.header.isSuccessful) {
      const error = new INaviApiError(data.header.resultCode, data.header.resultMessage);
      logger.log('error', {
        message: 'INAVI Maps API가 실패를 반환했습니다',
        url: safeUrl,
        resultCode: error.resultCode,
        resultMessage: error.resultMessage,
        kind: error.kind,
      });
      throw error;
    }

    logger.log('info', { message: 'INAVI Maps API 응답 수신', url: safeUrl });
    return data;
  }
}

/** `undefined` 값을 제외하고 쿼리스트링을 만든다. */
function toQueryString(query: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function stripUndefined(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

/** 앱키는 자격 증명이다. 로그·에러 메시지에 원문이 남지 않도록 가린다. */
export function maskAppkey(url: string): string {
  return url.replace(/\/appkeys\/[^/?]+/, '/appkeys/***');
}

export const inaviHttpClient = new INaviHttpClient();
