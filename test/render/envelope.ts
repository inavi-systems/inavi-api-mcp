import type { ToolPayload, ToolPayloadData } from '../../ui/src/shared/payload';

/**
 * 픽스처(iNavi 원본)를 도구가 내보내는 봉투로 옮긴다.
 *
 * 픽스처는 **API별 원본**을 그대로 둔다 — "iNavi가 이렇게 준다"는 사실의 기록이라
 * 도구 응답 모양으로 바꿔 두면 원본을 확인할 길이 사라진다 (설계 1.11).
 * 그래서 서버가 하는 일(`src/tools/common/envelope.ts`)을 테스트 쪽에서 한 번 더 한다.
 *
 * 서버 코드를 그대로 못 쓰는 이유는 `tsconfig.test-ui.json`에 `@/*`가 닿지 않아서다.
 * 바꿀 때는 **양쪽을 함께** 본다.
 */

/**
 * 원본 봉투의 네 모양. 서버의 `EnvelopeShape`와 같은 이름을 쓴다.
 *
 * | 모양 | API | 원본 |
 * |---|---|---|
 * | `rename` | 통합·다국어·주변 카테고리·지오코딩·리버스·공간 검색 | `{ header, search: {…} }` |
 * | `asIs`   | 최적 지점 검색 | `{ header, data: {…} }` |
 * | `unwrap` | 경로 탐색·예측·도보·TSP | `{ header, route: { data: {…} } }` |
 * | `wrap`   | RDM | `{ header, mode, origins, … }` |
 */
export type EnvelopeShape = 'rename' | 'asIs' | 'unwrap' | 'wrap';

/** 봉투를 씌운 뒤 도구가 더 하는 일. `schema-portability.test.ts`의 다섯 번째 자리와 같다. */
type AfterEnvelope = (payload: ToolPayload) => ToolPayload;

export function enveloped(raw: unknown, shape: EnvelopeShape, after?: AfterEnvelope): ToolPayload {
  const { header, ...rest } = structuredClone(raw) as Record<string, unknown>;

  const inner = readBody(rest, shape);
  const { result: _dropped, ...data } = inner;

  const payload: ToolPayload = {
    header: header as ToolPayload['header'],
    data: data as ToolPayloadData,
  };
  return after ? after(payload) : payload;
}

/** `wrap`만 래퍼 키가 없다. `asIs`는 키가 이미 `data`라 `rename`과 하는 일이 같다. */
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

/** 도구가 `dropMatrixText`로 떼고 내보내므로 테스트도 떼고 넣어야 실제와 같아진다. */
export function droppedMatrixText(payload: ToolPayload): ToolPayload {
  for (const row of payload.data?.rows ?? []) {
    for (const element of row.elements ?? []) {
      delete element.distance?.text;
      delete element.duration?.text;
    }
  }
  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 호스트가 함께 주는 `_meta`. 종류 판별이 여기로 옮겨졌다 (설계 1.7). */
export function meta(kind: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind, showMap: true, ...extra };
}
