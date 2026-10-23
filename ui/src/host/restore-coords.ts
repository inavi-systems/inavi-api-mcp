import type { RouteCoord, ToolPayload } from '../shared/payload';

/**
 * 서버가 `_meta`로 따로 보낸 좌표를 본문에 되꽂는다.
 *
 * 좌표 배열은 대화 부담이 커서 기본으로 본문에서 빠진다. 대신 `_meta`에 담겨 오는데,
 * `_meta`는 템플릿까지만 오고 모델에게는 가지 않는다 (좌표 7,357개까지 실측).
 * 서버 쪽 짝은 `src/tools/common/split-coords.ts`.
 *
 * 되꽂는 위치는 **순서**다. 서버가 같은 순서·같은 길이로 보낸다.
 *
 * 렌더러가 좌표 없는 응답을 따로 알 필요가 없도록 그리기 전에 여기서 메운다.
 */
export function restoreCoords(
  payload: ToolPayload | undefined,
  meta: Record<string, unknown> | undefined,
): ToolPayload | undefined {
  if (!payload) return payload;

  restoreInto(pathHolders(payload), meta?.routeCoords, 'coords');
  restoreInto(polygonHolders(payload), meta?.polygonCoords, 'polygon');

  return payload;
}

/** 경로 구간들. 자동차·예측·도보가 같은 구조다. */
function pathHolders(payload: ToolPayload): CoordHolder[] | undefined {
  const paths = payload.data?.paths;
  return Array.isArray(paths) ? (paths as CoordHolder[]) : undefined;
}

/**
 * 폴리곤들. 행정구역 하나가 섬을 포함해 여럿으로 올 수 있어 **평탄하게 펼친 순서**다.
 * 서버가 같은 순서로 떼어 낸다.
 */
function polygonHolders(payload: ToolPayload): CoordHolder[] | undefined {
  const groups = payload.data?.polygondata;
  if (!Array.isArray(groups)) return undefined;

  const holders: CoordHolder[] = [];
  for (const group of groups) {
    if (!Array.isArray(group?.polygonlist)) return undefined;
    holders.push(...(group.polygonlist as CoordHolder[]));
  }
  return holders;
}

interface CoordHolder {
  [key: string]: unknown;
}

function restoreInto(holders: CoordHolder[] | undefined, stored: unknown, key: string): void {
  if (!holders || !Array.isArray(stored)) return;

  holders.forEach((holder, index) => {
    // includeCoords로 본문에 이미 담겨 온 경우엔 그대로 둔다.
    const existing = holder[key];
    if (Array.isArray(existing) && existing.length > 0) return;

    const list: unknown = stored[index];
    if (Array.isArray(list)) holder[key] = list as RouteCoord[];
  });
}
