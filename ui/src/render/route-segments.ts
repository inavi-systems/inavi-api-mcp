import type { InaviLngLat, LngLatLike } from '../map/inavi';
import type { RoutePath } from '../shared/payload';
import { formatDistance, formatShortDuration } from '../shared/dom';

/**
 * 경로 위를 클릭했을 때 어떤 구간인지 찾아낸다.
 *
 * 폴리라인 자체에 클릭 이벤트를 다는 방법은 검증된 예제에 없다. 대신 지도 클릭
 * (`map.on("click")`, dynamic-distance-calculation 예제)을 받아 가장 가까운 구간을
 * 직접 고른다. SDK 호출 패턴을 건드리지 않으면서 같은 결과를 낸다.
 */

/** 이보다 멀리 떨어진 클릭은 경로를 겨냥한 것으로 보지 않는다. */
export const CLICK_TOLERANCE_METERS = 80;

const METERS_PER_DEGREE = 111_320;

export interface RouteSegmentHit {
  path: RoutePath;
  /** 클릭 지점에서 가장 가까운, 선 위의 점. 정보창을 여기에 띄운다. */
  position: LngLatLike;
  meters: number;
}

export function findNearestSegment(
  paths: RoutePath[],
  point: InaviLngLat,
): RouteSegmentHit | undefined {
  const best = closestOnRoute(paths, point);
  return best && best.meters <= CLICK_TOLERANCE_METERS ? best : undefined;
}

/** 선 위에서 가장 가까운 점. 경유지 핀을 붙이는 데 쓰므로 톨러런스를 걸지 않는다. */
export function snapToRoute(paths: RoutePath[], point: InaviLngLat): LngLatLike | undefined {
  return closestOnRoute(paths, point)?.position;
}

function closestOnRoute(paths: RoutePath[], point: InaviLngLat): RouteSegmentHit | undefined {
  let best: RouteSegmentHit | undefined;

  paths.forEach((path) => {
    const coords = path.coords ?? [];
    for (let i = 0; i < coords.length - 1; i += 1) {
      const from = coords[i];
      const to = coords[i + 1];
      if (!from || !to) continue;

      const hit = projectOntoSegment(point, [from.x, from.y], [to.x, to.y]);
      if (!best || hit.meters < best.meters) {
        best = { path, position: hit.position, meters: hit.meters };
      }
    }
  });

  return best;
}

/**
 * 점을 선분에 수직으로 내린다.
 *
 * 도(degree)를 그대로 빼면 경도 쪽이 위도만큼 길지 않아 왜곡된다. 위도 코사인을 곱해
 * 미터에 가깝게 맞춘 평면에서 계산한다 (짧은 구간에서는 충분하다).
 */
function projectOntoSegment(
  point: InaviLngLat,
  from: LngLatLike,
  to: LngLatLike,
): { position: LngLatLike; meters: number } {
  const scale = Math.cos((point.lat * Math.PI) / 180);

  const ax = (from[0] - point.lng) * scale;
  const ay = from[1] - point.lat;
  const bx = (to[0] - point.lng) * scale;
  const by = to[1] - point.lat;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // 두 끝점이 같은 자리면 선분이 아니라 점이다.
  const t = lengthSquared === 0 ? 0 : clamp01(-(ax * dx + ay * dy) / lengthSquared);

  const nearestX = ax + dx * t;
  const nearestY = ay + dy * t;
  const meters = Math.hypot(nearestX, nearestY) * METERS_PER_DEGREE;

  return {
    position: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
    meters,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 경로 응답의 교통 색상. 실제 응답에서 확인한 네 가지. */
const TRAFFIC_LABELS: Record<string, string> = {
  '#00ff60': '원활',
  '#fff000': '서행',
  '#fb3a76': '정체',
  '#989898': '정보 없음',
};

export function trafficLabel(color: string | undefined): string {
  if (!color) return '정보 없음';
  return TRAFFIC_LABELS[color.toLowerCase()] ?? '정보 없음';
}

export function segmentRows(path: RoutePath): [string, string][] {
  const rows: [string, string][] = [
    ['교통 상황', trafficLabel(path.traffic_color)],
    ['구간 거리', formatDistance(path.distance)],
    ['구간 소요', formatShortDuration(path.spend_time)],
  ];

  // 속도는 값이 없을 때 -1로 온다.
  if (path.speed !== undefined && path.speed >= 0) {
    rows.push(['평균 속도', `${path.speed}km/h`]);
  }
  return rows;
}
