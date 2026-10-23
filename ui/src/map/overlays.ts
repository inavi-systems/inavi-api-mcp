import type { InaviMap, InaviNamespace, InaviOverlay } from './inavi';
import type { SearchArea } from '../host/tool-context';
import { SEARCH_AREA_STYLE, themed } from './map-colors';

/**
 * 검색 영역·반경을 지도에 그린다 (기반 예제: shapes-circle, shapes-polygon).
 * 원이든 사각이든 같은 "검색 범위"라 색은 하나다 (map-colors.ts).
 */
export function drawSearchArea(
  inavi: InaviNamespace,
  map: InaviMap,
  area: SearchArea,
): InaviOverlay {
  const style = themed(SEARCH_AREA_STYLE);

  if (area.kind === 'circle') {
    return new inavi.maps.Circle({
      map,
      position: area.center,
      radius: area.radiusKm,
      style,
    });
  }

  return new inavi.maps.Polygon({ map, path: area.path, style });
}
