import type { InaviMap, InaviNamespace, LngLatLike } from '../map/inavi';
import type { OptimizedPoint, ToolPayload, WaypointPlace, WaypointPlaces } from '../shared/payload';
import { formatDistance, formatDuration, formatShortDuration } from '../shared/dom';
import {
  actionItem,
  drawFeatures,
  featureList,
  featurePositions,
  type MapFeature,
  type PinRole,
} from './result';
import type { RenderResult } from './result';

export interface OptimizeRenderOptions {
  /**
   * 방문지가 **어떤 장소인지.** 응답은 좌표와 순서만 주므로 모델이 도구 입력에 적어 보낸
   * 것이 `_meta.places.points`로 온다. **응답 순서에 맞춰** 서버가 줄을 세워 보낸다.
   */
  places?: WaypointPlaces;
}

/**
 * 경유지 순서 최적화 렌더링. (기반 예제: marker-numbering)
 *
 * **선은 긋지 않는다.** 응답에 주행 경로선이 없어 직선으로 이으면 실제 경로로 오해된다.
 * 실제 경로는 `find_route`의 몫이라 순서를 대화로 넘기는 버튼만 둔다.
 *
 * `optimize[]`에 담긴 순서가 방문 순서이고 `index`는 요청 순서다. 섞지 않는다.
 * `distance`·`spend_time`은 이전 지점으로부터라 첫 원소는 0이다.
 */
export function renderOptimize(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
  options: OptimizeRenderOptions = {},
): RenderResult {
  const data = payload.data;
  const placed = (data?.optimize ?? []).filter(
    (point) => point.x !== undefined && point.y !== undefined,
  );

  if (placed.length === 0) {
    return { coordinates: [], listHtml: '', summary: '최적화된 방문 순서가 없습니다.' };
  }

  const features = placed.map((point, index) =>
    toFeature(point, index, placed.length, options.places?.points?.[index]),
  );
  drawFeatures(inavi, map, features);

  const coordinates = featurePositions(features);

  return {
    coordinates,
    listHtml: routePromptItem(coordinates) + featureList(features),
    summary:
      `방문 ${placed.length}곳 · ${formatDistance(data?.distance)} · ` +
      formatDuration(data?.spend_time),
  };
}

const ROLE_NAMES: Record<string, string> = {
  start: '출발',
  via: '경유',
  end: '마지막 방문지',
};

function roleOf(index: number, total: number): PinRole {
  if (index === 0) return 'start';
  return index === total - 1 ? 'end' : 'via';
}

/**
 * 방문지 하나.
 *
 * 이름을 알면 상호가 제목, 자리 이름이 칩이 되고 요청 순서는 작은 줄로 내려간다 — 다른
 * 결과의 정보창과 같은 짜임이다. 모르면 자리 이름을 제목에 적고 좌표를 보여 준다.
 */
function toFeature(
  point: OptimizedPoint,
  index: number,
  total: number,
  place: WaypointPlace | null | undefined,
): MapFeature {
  const role = roleOf(index, total);
  const noun = ROLE_NAMES[role] ?? '방문지';
  // 방문 순서가 결과의 전부다. 역할 색(빨강·주황·남색)으로는 가운데가 전부 같은 색이 된다.
  const series = { seriesIndex: index };
  const order = point.index === undefined ? undefined : `요청 순서 ${point.index + 1}번째`;
  // 첫 지점은 이전 지점이 없어 0으로 온다. 0을 "0m 걸렸다"로 보이면 거짓말이다.
  const note =
    index === 0
      ? '출발 지점'
      : `이전 지점에서 ${formatDistance(point.distance)} · ` +
        formatShortDuration(point.spend_time);
  const position: LngLatLike = [point.x as number, point.y as number];
  const name = place?.name?.trim();

  if (!name) {
    return { position, ...series, role, title: noun, chip: order, note, showCoordinate: true };
  }

  return {
    position,
    ...series,
    role,
    title: name,
    chip: noun,
    address: { road: place?.roadAddress, lot: place?.lotAddress },
    tel: place?.tel,
    note,
    meta: [order, place?.category],
  };
}

/** 템플릿이 `find_route`를 직접 부르지 않고 문장만 넘긴다. */
function routePromptItem(coordinates: LngLatLike[]): string {
  const sequence = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(' → ');

  return actionItem({
    title: '실제 주행 경로가 필요하면',
    detail: '이 순서를 그대로 경로 탐색에 넘깁니다.',
    button: '경로 찾기',
    send: `최적화된 이 순서 그대로 경로를 찾아줘: ${sequence}`,
  });
}
