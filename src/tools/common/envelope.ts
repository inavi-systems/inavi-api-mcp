/**
 * 응답 봉투를 `{ header, data }`로 통일한다.
 *
 * iNavi 원본 봉투는 네 모양이다. 한 문장 — **본문 전체를 `data` 한 칸에 담는다** — 이 넷을 덮는다.
 *
 * | 모양 | API | 원본 | 조작 |
 * |---|---|---|---|
 * | `rename` | 통합·다국어·주변 카테고리·지오코딩·리버스·공간 검색 | `{ header, search: {…} }` | 이름 바꾸기 |
 * | `asIs`   | 최적 지점 검색 | `{ header, data: {…} }` | 없음 |
 * | `unwrap` | 경로 탐색·예측·도보·TSP | `{ header, route: { data: {…} } }` | 껍질 벗기기 |
 * | `wrap`   | RDM | `{ header, mode, origins, … }` | 껍질 씌우기 |
 *
 * `unwrap`은 `route`를 벗기고 `route.data`를 끌어올린다. 그냥 이름만 바꾸면 `data.data`가 된다.
 * `wrap`은 RDM만 본문 래퍼 키가 없어 없던 껍질을 만든다.
 *
 * **네 조작 모두 입력값 없이 원본으로 되돌릴 수 있다.** 도구와 API가 1:1이라 어느 모양이었는지는
 * 도구 이름만으로 안다.
 */

import type { INaviResponseHeader } from '@/types/inavi-api.types';

/** 원본 봉투의 모양. 도구마다 하나씩 고정으로 정해진다. */
export type EnvelopeShape = 'rename' | 'asIs' | 'unwrap' | 'wrap';

/** 템플릿이 무엇을 그릴지 고르는 값(`_meta.kind`). 최상위 키가 전부 `data`가 되어 대신 쓴다. */
export type PayloadKind =
  | 'search'
  | 'nearby'
  | 'geocode'
  | 'reverse'
  | 'entry-points'
  | 'boundary'
  | 'route'
  | 'walking-route'
  | 'optimize'
  | 'matrix';

export interface DataEnvelope {
  header: INaviResponseHeader;
  data: Record<string, unknown>;
  // SDK의 structuredContent가 인덱스 시그니처를 요구한다.
  [key: string]: unknown;
}

/**
 * 원본 응답을 `{ header, data }`로 옮긴다.
 *
 * 아는 모양이 아니면 본문을 있는 그대로 `data`에 담는다. 응답 구조가 바뀌었을 때 값을 잃는 것보다
 * 봉투가 어긋나는 편이 알아차리기 쉽다.
 */
export function toDataEnvelope(raw: unknown, shape: EnvelopeShape): DataEnvelope {
  const { header, ...rest } = (raw ?? {}) as {
    header?: INaviResponseHeader;
    [key: string]: unknown;
  };

  return {
    header: header ?? { isSuccessful: false, resultCode: -1, resultMessage: '헤더 없음' },
    data: dropResult(readBody(rest, shape)),
  };
}

function readBody(rest: Record<string, unknown>, shape: EnvelopeShape): Record<string, unknown> {
  if (shape === 'wrap') return rest;

  const [firstKey] = Object.keys(rest);
  // 결과가 없으면 본문 키 자체가 오지 않는다 (리버스 지오코딩의 바다 위 좌표 등).
  if (firstKey === undefined) return {};

  const body = rest[firstKey];
  if (!isRecord(body)) return {};

  if (shape === 'unwrap') {
    return isRecord(body.data) ? body.data : body;
  }
  return body;
}

/**
 * 본문의 `result`(boolean)를 뺀다.
 *
 * `header.isSuccessful`과 중복이고 `INaviHttpClient`는 이미 후자만 본다.
 * `data.result`라는 이름 충돌도 피한다. 최상위 한 겹에만 적용한다.
 */
function dropResult(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.result !== 'boolean') return body;
  const { result: _dropped, ...rest } = body;
  return rest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
