import type { FitPadding, LngLatLike } from './inavi';
import type { SearchArea } from '../host/tool-context';

/**
 * 요청한 검색 영역이 있으면 결과가 아니라 그 영역에 맞춘다.
 *
 * 반경·영역은 `poi`에만 걸려서(CLAUDE.md), 500m를 물어도 수백 km 밖 주소가 섞여 올 수 있다.
 * 결과에 맞추면 그 한 점 때문에 화면이 전국으로 벌어진다. 영역 밖 결과를 지우지는 않는다.
 */
export function fitTarget(coordinates: LngLatLike[], area: SearchArea | undefined): LngLatLike[] {
  if (!area) return coordinates;

  const corners = area.kind === 'circle' ? circleCorners(area.center, area.radiusKm) : area.path;
  return corners.length > 0 ? corners : coordinates;
}

/** 위도 1도는 어디서나 약 111km다. 경도는 위도가 올라갈수록 좁아진다. */
const KM_PER_DEGREE_LAT = 111;

/** 원에 외접하는 사각형. `fitCoordinates`가 점 목록만 받아 원을 그대로 넘길 수 없다. */
function circleCorners(center: LngLatLike, radiusKm: number): LngLatLike[] {
  const [lng, lat] = center;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !(radiusKm > 0)) return [];

  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  // 위도가 높을수록 경도 한 도의 실제 거리가 짧아진다. 보정하지 않으면 동서가 좁게 잡힌다.
  const shrink = Math.cos((lat * Math.PI) / 180);
  const dLng = shrink > 0.01 ? dLat / shrink : dLat;

  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
  ];
}

/** 결과 둘레에 남기는 여백. 핀이 화면 가장자리에 붙지 않게 한다. */
export const FIT_PADDING = 70;

/** 패널 오른쪽 끝에서 결과까지 띄울 거리. 핀 그림이 패널 테에 걸치지 않을 만큼. */
const PANEL_GAP = 24;

/** 패널을 비키고도 결과에 남아야 하는 너비. 이보다 좁으면 비키지 않는다. */
const MIN_FIT_WIDTH = 160;

/**
 * 펼친 결과 패널을 비켜서 맞춘다.
 *
 * 패널이 지도의 왼쪽을 위에서 아래까지 덮는데, 지도 전체에 맞추면 **왼쪽에 놓인 결과가
 * 처음부터 패널 밑에 깔린다**(실기 피드백). 패널 오른쪽 끝을 지도의 왼쪽 끝으로 보고
 * 남은 자리의 가운데에 결과를 둔다. 남은 자리가 너무 좁으면 SDK가 맞추지 못하므로
 * 그때는 그대로 둔다 — 결과가 일부 가리는 편이 엉뚱한 자리로 가는 것보다 낫다.
 *
 * @param panelRight 지도 왼쪽 끝에서 잰 패널 오른쪽 끝. 패널을 접었으면 넘기지 않는다.
 */
export function fitPadding(mapWidth: number, panelRight: number | undefined): FitPadding {
  if (panelRight === undefined || panelRight <= 0) return FIT_PADDING;

  const left = Math.max(FIT_PADDING, panelRight + PANEL_GAP);
  if (mapWidth - left - FIT_PADDING < MIN_FIT_WIDTH) return FIT_PADDING;

  return { top: FIT_PADDING, bottom: FIT_PADDING, left, right: FIT_PADDING };
}
