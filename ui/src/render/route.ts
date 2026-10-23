import type { InaviMap, InaviNamespace, LngLatLike } from '../map/inavi';
import type { RoutePath, ToolPayload, WaypointPlace, WaypointPlaces } from '../shared/payload';
import { formatCurrency, formatDistance, formatDuration } from '../shared/dom';
import { findNearestSegment, segmentRows, snapToRoute } from './route-segments';
import { predictedTimeRows } from './route-times';
import { drawFeatures, statList, type MapFeature, type PinRole, type StatRow } from './result';
import type { RenderResult } from './result';
import { infoCardHtml } from './info-card';
import { ROUTE_OUTLINE, TRAFFIC_FALLBACK, TRAFFIC_TONE, themed } from '../map/map-colors';

/*
 * 핀 안에 넣는 글자.
 *
 * 흰 속 원의 지름이 14px이라 **한글 두 자(`출발`)는 줄여도 깨진다**(실기 확인).
 * 한 글자 영문으로 줄인다 — 자리 이름은 마커의 `title`과 결과 목록이 말해 준다.
 */
const START_LABEL = 'S';
const END_LABEL = 'E';

const OUTLINE_WIDTH = 7;
const SEGMENT_WIDTH = 5;

/**
 * 교통 색을 **그릴 때만** 차분한 톤으로 옮긴다. 모르는 값은 그대로 쓴다 —
 * 지어내는 것보다 원본이 낫다. 짝은 map-colors.ts에 모아 두었다.
 */
export function trafficTone(color: string): string {
  return themed(TRAFFIC_TONE)[color.toLowerCase()] ?? color;
}

export interface RouteRenderOptions {
  /** 요청에 담겨 온 경유지. 응답으로는 알 수 없다 (CLAUDE.md의 `point_type` 항목). */
  vias?: LngLatLike[];
  /**
   * 자리마다 **어떤 장소인지.** 경로 API는 좌표만 돌려주므로 응답에는 없다.
   * 모델이 도구 입력에 적어 보낸 것이 `_meta.places`로 온다. 없으면 좌표만 보여 준다.
   */
  places?: WaypointPlaces;
}

/**
 * 경로 탐색 결과 렌더링.
 *
 * 교통 상황 색상이 같은 인접 구간을 하나로 합쳐 폴리라인 개수를 줄이고,
 * 그 뒤에 어두운 외곽선을 깔아 경로를 도드라지게 한다.
 * (기반 예제: shapes-polyline, marker-numbering)
 */
export function renderRoute(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
  options: RouteRenderOptions = {},
): RenderResult {
  const data = payload.data;
  const paths = (data?.paths ?? []).filter((path) => (path.coords?.length ?? 0) > 0);

  const allCoordinates = paths.flatMap(toLngLatList);
  if (allCoordinates.length === 0) {
    return { coordinates: [], listHtml: '', summary: '경로 좌표가 없습니다.' };
  }

  // 외곽선을 먼저 깔고(zIndex 0) 그 위에 색상 구간을 얹는다(zIndex 1).
  new inavi.maps.Polyline({
    map,
    path: allCoordinates,
    style: {
      lineCap: 'round',
      lineColor: themed(ROUTE_OUTLINE),
      lineJoin: 'round',
      lineWidth: OUTLINE_WIDTH,
    },
    zIndex: 0,
  });

  mergeByTrafficColor(paths).forEach((segment) => {
    new inavi.maps.Polyline({
      map,
      path: segment.coordinates,
      style: {
        lineCap: 'round',
        lineColor: trafficTone(segment.color),
        lineJoin: 'round',
        lineWidth: SEGMENT_WIDTH,
      },
      zIndex: 1,
    });
  });

  drawEndpointMarkers(inavi, map, paths, allCoordinates, options.vias ?? [], options.places);
  attachSegmentInfoWindow(inavi, map, paths);

  return {
    coordinates: allCoordinates,
    listHtml: statList(buildSummaryRows(payload, options.places)),
    summary: `${formatDistance(data?.distance)} · ${formatDuration(data?.spend_time)}`,
  };
}

/**
 * 경로 위를 클릭하면 그 구간의 교통 상황·거리·소요 시간을 정보창으로 띄운다.
 *
 * 마커가 아니라 **선 위의 한 점**을 가리키므로 출발·도착 핀의 정보창과 따로 둔다.
 * 카드는 같은 것을 쓴다 — `segmentInfoContent` 참고.
 * (기반 예제: infowindow-basic, dynamic-distance-calculation)
 */
function attachSegmentInfoWindow(inavi: InaviNamespace, map: InaviMap, paths: RoutePath[]): void {
  const infoWindow = new inavi.maps.InfoWindow({
    content: '',
    offset: [0, -12],
    zIndexOffSet: 999,
    closeButton: false,
  });

  map.on('click', (e) => {
    const hit = findNearestSegment(paths, e.lngLat);
    // 경로에서 먼 곳을 누르면 닫는다.
    if (!hit) {
      infoWindow.setMap();
      return;
    }

    infoWindow.setPosition(hit.position);
    infoWindow.setContent(segmentInfoContent(hit.path));
    infoWindow.setMap(map);
  });
}

/** 구간 정보도 **마커 정보창과 같은 카드**를 쓴다 (render/info-card.ts). */
function segmentInfoContent(path: RoutePath): string {
  return infoCardHtml({ title: '경로 구간', rows: segmentRows(path) });
}

function toLngLatList(path: RoutePath): LngLatLike[] {
  return (path.coords ?? []).map((coord) => [coord.x, coord.y] as LngLatLike);
}

interface ColoredSegment {
  color: string;
  coordinates: LngLatLike[];
}

/**
 * 교통 색상이 같은 인접 구간을 이어 붙인다.
 * 색이 바뀌는 지점에서는 이전 구간의 마지막 좌표를 다음 구간이 이어받아 선이 끊기지 않게 한다.
 */
function mergeByTrafficColor(paths: RoutePath[]): ColoredSegment[] {
  const segments: ColoredSegment[] = [];

  paths.forEach((path) => {
    const coordinates = toLngLatList(path);
    if (coordinates.length === 0) return;

    const color = path.traffic_color ?? themed(TRAFFIC_FALLBACK);
    const previous = segments[segments.length - 1];

    if (previous && previous.color === color) {
      previous.coordinates.push(...coordinates);
      return;
    }

    const bridge = previous?.coordinates[previous.coordinates.length - 1];
    segments.push({ color, coordinates: bridge ? [bridge, ...coordinates] : coordinates });
  });

  return segments;
}

/** 출발·경유·도착 지점. 마커·정보창은 다른 결과와 **같은 자리**에서 만든다 (result.ts). */
function drawEndpointMarkers(
  inavi: InaviNamespace,
  map: InaviMap,
  paths: RoutePath[],
  allCoordinates: LngLatLike[],
  requested: LngLatLike[],
  places: WaypointPlaces | undefined,
): void {
  const start = allCoordinates[0];
  const end = allCoordinates[allCoordinates.length - 1];
  if (!start || !end) return;

  const vias = requested.length > 0 ? snapRequested(paths, requested) : viasFromPathTypes(paths);

  drawFeatures(inavi, map, [
    waypoint(start, 'start', START_LABEL, START_NOUN, places?.start),
    ...vias.map((position, index) =>
      waypoint(
        position,
        'via',
        String(index + 1),
        viaNoun(index, vias.length),
        places?.vias?.[index],
      ),
    ),
    waypoint(end, 'end', END_LABEL, END_NOUN, places?.end),
  ]);
}

/**
 * 자리를 가리키는 말. 이름을 알 때는 칩으로, 모를 때는 제목으로 쓴다.
 *
 * 칩에 `출발`을 넣고 제목에 상호를 쓰는 것이 기본이고, 이름이 없으면 칩을 만들지 않고
 * 제목을 `출발지`로 적는다 — 제목이 `출발지`인데 칩에 또 `출발`이 붙으면 같은 말이 두 번이다.
 */
interface WaypointNoun {
  chip: string;
  fallbackTitle: string;
}

const START_NOUN: WaypointNoun = { chip: '출발', fallbackTitle: '출발지' };
const END_NOUN: WaypointNoun = { chip: '도착', fallbackTitle: '도착지' };

/** 경유지가 하나뿐이면 번호를 붙이지 않는다 — 셀 것이 없는데 `경유지 1`은 군더더기다. */
function viaNoun(index: number, total: number): WaypointNoun {
  const noun = total > 1 ? `경유지 ${index + 1}` : '경유지';
  return { chip: noun, fallbackTitle: noun };
}

/**
 * 한 자리의 핀.
 *
 * 장소를 알면 **검색 결과와 같은 카드**가 된다 — 상호가 제목, 자리 이름이 칩, 그 아래
 * 도로명·지번 주소와 전화번호. 이때 좌표는 적지 않는다. 좌표는 이름을 모를 때 보여 줄
 * 것이 그것뿐이라 적는 값이지, 늘 쓸모 있는 값이 아니다 (실기 피드백).
 *
 * **없는 이름을 지어내지 않는다.** 모델이 안 적어 보냈으면 자리 이름과 좌표만 적는다.
 */
function waypoint(
  position: LngLatLike,
  role: PinRole,
  label: string,
  noun: WaypointNoun,
  place: WaypointPlace | null | undefined,
): MapFeature {
  const name = place?.name?.trim();
  if (!name) {
    return { position, role, label, title: noun.fallbackTitle, showCoordinate: true };
  }

  return {
    position,
    role,
    label,
    title: name,
    chip: noun.chip,
    address: { road: place?.roadAddress, lot: place?.lotAddress },
    tel: place?.tel,
    meta: [place?.category],
  };
}

/** 아는 코드만 옮겨 적고 **모르는 값은 그대로 보여 준다** — 덮으면 무엇이 왔는지 알 수 없다. */
const OPTION_NAMES: Record<string, string> = {
  real_traffic: '실시간 교통',
  stats: '통계 예측',
  free_road: '무료 도로',
  highway: '고속도로 우선',
  short_distance_priority: '최단 거리',
  recommendation: '추천 경로',
  easy_way: '편한 경로',
  time_priority: '최소 시간',
  main_road: '큰길 위주',
};

function describeOption(option: string | undefined): string {
  if (!option) return '-';
  return OPTION_NAMES[option] ?? option;
}

/** 요청 좌표는 도로 위가 아닐 수 있어 그대로 찍으면 핀이 선에서 떨어져 보인다. */
function snapRequested(paths: RoutePath[], requested: LngLatLike[]): LngLatLike[] {
  return requested.map(
    ([lng, lat]) => snapToRoute(paths, { lng, lat }) ?? ([lng, lat] as LngLatLike),
  );
}

/** 응답으로 찾는 폴백. `V`로 못박지 않는다 — `V1`·`V2`처럼 번호가 붙는다. */
function viasFromPathTypes(paths: RoutePath[]): LngLatLike[] {
  return paths
    .filter((path) => path.point_type?.startsWith('V'))
    .map((path) => toLngLatList(path)[0])
    .filter((position): position is LngLatLike => position !== undefined);
}

/** 요약 맨 위의 출발·도착 이름. 모델이 적어 보낸 것이 있을 때만 생긴다. */
function namedEndpointRows(places: WaypointPlaces | undefined): StatRow[] {
  const rows: StatRow[] = [];
  if (places?.start?.name) rows.push({ label: '출발지', value: places.start.name });
  if (places?.end?.name) rows.push({ label: '도착지', value: places.end.name });
  return rows;
}

/** 접어 둘 줄로 바꾼다. */
function detailRow([label, value]: [string, string]): StatRow {
  return { label, value, detail: true };
}

/**
 * 예상 택시 요금.
 *
 * `totalTaxiFare`는 **두 값을 쉼표로 이어 붙인 문자열**이다 (`useTaxifare: "3"`이면
 * `"21100,28600"` = 일반,모범). 원문을 그대로 찍고 `원`만 붙였더니 화면에
 * `21100,28600원`이 되어 **천 단위 쉼표가 들어간 한 개의 금액으로 읽혔다**(실기 확인).
 *
 * 요청하지 않으면 `"0"`으로 온다. 문자열이라 truthy이므로 값으로 가른다.
 */
function taxiFareRows(fare: string | undefined): [string, string][] {
  const amounts = (fare ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (amounts.length === 0) return [];

  // 한 칸만 오면 어느 쪽인지 알 수 없다. 꼬리표를 붙이지 않는다.
  const labels = amounts.length > 1 ? ['일반 택시', '모범 택시'] : ['예상 택시 요금'];
  return amounts.map((amount, index) => [
    labels[index] ?? `예상 택시 요금 ${index + 1}`,
    `${amount.toLocaleString('ko-KR')}원`,
  ]);
}

/**
 * 왼쪽 패널의 지표 줄.
 *
 * **훑는 데 쓰는 값만 펴 둔다** — 어디서 어디까지인지와 거리·시간·요금이다. 탐색 옵션과
 * 택시 요금, 예측 시각은 `상세`로 접는다. 자동차 경로는 줄이 열까지 늘어 패널이 지도를
 * 그만큼 가렸다.
 */
function buildSummaryRows(payload: ToolPayload, places: WaypointPlaces | undefined): StatRow[] {
  const data = payload.data;
  const rows: StatRow[] = [
    // 어디서 어디까지인지가 먼저다. 모르면 줄을 만들지 않는다 — 좌표를 적어 봐야 읽히지 않는다.
    ...namedEndpointRows(places),
    { label: '총 거리', value: formatDistance(data?.distance) },
    { label: '예상 소요 시간', value: formatDuration(data?.spend_time) },
  ];

  // **도보·PM 응답에는 통행료가 아예 없다.** 없는 값을 `-`로 적으면 걸어가는 길에 요금 줄이
  // 생긴다. 자동차는 유료도로를 안 타도 `0`으로 오므로 `0원`이 제대로 찍힌다.
  if (data?.toll_fee !== undefined) {
    rows.push({ label: '통행 요금', value: formatCurrency(data.toll_fee) });
  }

  // 아래부터는 접어 둔다 — 고른 뒤에 보는 값이다.
  rows.push({ label: '탐색 옵션', value: describeOption(data?.option), detail: true });

  // `고속도로 포함` 줄은 없다. 근거인 `isHighWay`를 서버가 응답에서 떼어 냈다
  // (src/tools/route/drop-ishighway.ts) — 고속도로를 14km 달려도 false로 오던 값이다.

  rows.push(...taxiFareRows(data?.totalTaxiFare).map(detailRow));

  // 예측 탐색에만 온다. 실시간 탐색에서는 빈 배열이라 줄이 하나도 늘지 않는다.
  rows.push(...predictedTimeRows(data).map(detailRow));

  return rows;
}
