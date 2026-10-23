import { BOUNDARY_STYLE } from '../map/map-colors';
import type { InaviMap, InaviNamespace, LngLatLike } from '../map/inavi';
import type { RouteCoord, ToolPayload } from '../shared/payload';
import { featureList, type MapFeature } from './result';
import type { RenderResult } from './result';

/**
 * 행정구역 경계 렌더링. (기반 예제: shapes-polygon)
 *
 * 행정구역 하나가 섬 때문에 폴리곤 여러 개로 온다. 하나로 이으면 없는 땅이 생기므로 따로 그린다.
 * 좌표는 `restore-coords.ts`가 그리기 전에 되꽂으므로 본문만 보면 된다.
 */

export function renderBoundary(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
): RenderResult {
  const groups = payload.data?.polygondata ?? [];
  const coordinates: LngLatLike[] = [];
  const features: MapFeature[] = [];
  let polygonCount = 0;

  groups.forEach((group) => {
    const rings = (group.polygonlist ?? [])
      .map((entry) => toLngLatList(entry.polygon))
      .filter((ring) => ring.length > 0);
    if (rings.length === 0) return;

    rings.forEach((path) => {
      new inavi.maps.Polygon({ map, path, style: BOUNDARY_STYLE });
      coordinates.push(...path);
    });

    polygonCount += rings.length;
    features.push(toFeature(group.admincode, rings));
  });

  return {
    coordinates,
    // **핀은 세우지 않는다.** 면이 곧 결과이고, 그 위에 핀까지 세우면 경계가 가려진다.
    // 그래서 순번 배지도 핀 모양으로 그리지 않는다.
    listHtml: featureList(features, { marker: false }),
    summary: buildSummary(groups.length, features.length, polygonCount),
  };
}

function buildSummary(groupCount: number, drawnCount: number, polygonCount: number): string {
  if (drawnCount > 0) {
    return `행정구역 ${drawnCount}곳 · 폴리곤 ${polygonCount}개`;
  }
  // 경계는 왔는데 좌표만 비어 있는 경우를 가른다. 호스트가 `_meta`를 걸러내면 이렇게 된다.
  return groupCount > 0 ? '경계를 그릴 좌표가 없습니다.' : '표시할 행정구역 경계가 없습니다.';
}

function toLngLatList(polygon: RouteCoord[] | undefined): LngLatLike[] {
  return (polygon ?? []).map((coord) => [coord.x, coord.y] as LngLatLike);
}

function toFeature(admincode: string | undefined, rings: LngLatLike[][]): MapFeature {
  const points = rings.reduce((total, ring) => total + ring.length, 0);

  return {
    position: boundsCenter(rings),
    title: admincode ?? '(코드 없음)',
    chip: '행정구역',
    note: `폴리곤 ${rings.length}개 · 좌표 ${points}개`,
    showCoordinate: true,
  };
}

/** 꼭짓점 평균이 아니라 외곽 사각형의 가운데. 평균은 해안선이 촘촘한 쪽으로 끌려간다. */
function boundsCenter(rings: LngLatLike[][]): LngLatLike {
  const points = rings.flat();
  const lngs = points.map(([lng]) => lng);
  const lats = points.map(([, lat]) => lat);

  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}
