import type { ToolPayload } from '../shared/payload';

/**
 * 검색 결과를 분류로 거른다. **서버도 모델도 부르지 않는다** — 받아 둔 것만 다시 그린다.
 *
 * 거리 필터는 넣지 않았다. 응답의 `distance`는 **기준점이 있는 검색에서만** 채워지고
 * (`spopt=1`/`2`), 대화에서 모델이 처음 부르는 키워드 검색에서는 전부 `0`으로 온다(실측).
 */

/** 아무것도 거르지 않는 상태. 드롭다운의 "전체"에 해당한다. */
export const ALL_CATEGORIES = '';

/** 결과에 실제로 등장한 분류만 추린다. 없는 분류를 고르게 두지 않는다. */
export function listPoiCategories(payload: ToolPayload | undefined): string[] {
  const names = new Set<string>();
  for (const poi of payload?.data?.poi ?? []) {
    const name = poi.catename?.trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 고른 분류만 남긴 결과를 새로 만든다. 원본은 건드리지 않는다.
 *
 * 걸러 낼 것이 없으면 원본을 그대로 돌려준다 — 지도를 다시 그릴 때 같은 객체인지로
 * 필터 유지 여부를 판단하기 때문에(render-host) 불필요한 새 객체를 만들지 않는다.
 */
export function filterPoiByCategory(
  payload: ToolPayload | undefined,
  category: string,
): ToolPayload | undefined {
  if (!payload || category === ALL_CATEGORIES) return payload;

  const poi = payload.data?.poi;
  if (!Array.isArray(poi)) return payload;

  const kept = poi.filter((item) => item.catename?.trim() === category);
  if (kept.length === poi.length) return payload;

  // **건수는 손대지 않는다.** 요약은 `장소 4건 · 전체 19건`처럼 거른 수와 원본 수를 함께
  // 적어(render/search.ts의 `buildSummary`) "19건 중 4건을 보는 중"을 말한다. 여기서
  // 건수까지 줄이면 그 짝이 깨진다.
  return { ...payload, data: { ...payload.data, poi: kept } };
}
