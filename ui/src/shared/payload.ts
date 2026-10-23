/**
 * 도구가 돌려주는 응답의 최소 형태.
 *
 * 서버는 본문 전체를 `data` 한 칸에 담는다. 최상위 키가 전부 같아졌으므로
 * **종류 판별은 `_meta.kind`로 한다.**
 *
 * 좌표 배열은 본문에서 빠져 `_meta`로 따로 오므로, 그리기 전에 되꽂는다
 * (`restore-coords.ts`).
 */

export interface SearchPoi {
  poiid?: number;
  name1?: string;
  name2?: string;
  /** 지도 표출용 좌표(건물 중심). 마커를 찍는 데 쓴다. */
  dpx?: string;
  dpy?: string;
  /**
   * 차량 진입로 좌표. **경로 탐색에는 반드시 이쪽을 넘긴다.**
   * 표출용 좌표는 건물 중심이라 도로 위 지점이 아니고, 그대로 넘기면 불필요한 우회·U턴이 생긴다.
   */
  rpx?: string;
  rpy?: string;
  routepoints?: { rpx?: string; rpy?: string }[];
  address?: string;
  roadname?: string;
  roadjibun?: string;
  jibun?: string;
  detailaddress?: string;
  catename?: string;
  tel?: string;
  distance?: number;
}

export interface AddressAdm {
  posx?: string;
  posy?: string;
  address?: string;
  roadname?: string;
  roadjibun?: string;
  jibun?: string;
  buildname?: string;
  postcode?: string;
  distance?: number;
}

export interface RouteCoord {
  x: number;
  y: number;
}

export interface RoutePath {
  coords?: RouteCoord[];
  /** 도보 경로에도 온다. 다만 전 구간이 한 값이라 사실상 단색이다 (실측). */
  traffic_color?: string;
  /** 스펙 enum은 S/V/E/N이지만 도보는 `V1`처럼 경유지에 번호를 붙인다 (실측). */
  point_type?: string;
  road_code?: number;
  distance?: number;
  spend_time?: number;
  speed?: number;
}

/**
 * 경로 예측 탐색의 후보 시각 한 칸.
 *
 * 원본은 `start_time`·`end_time`을 연·월·일·시·분 다섯 숫자로 나눠 보내는데, 서버가
 * 입력과 같은 ISO 한 줄로 합쳐 보낸다 (`src/tools/route/kst-time.ts`).
 * **시각은 언제나 한국 시각이다** — 오프셋이 `+09:00`으로 붙어 온다.
 */
export interface RouteTimeSlot {
  /** 요청한 기준 칸이 0. `compareNearby`를 켜면 앞뒤로 -1·1이 붙는다. */
  index?: number;
  spend_time?: number;
  departAt?: string;
  arriveAt?: string;
}

/**
 * 리버스 지오코딩의 지점 정보.
 *
 * 지오코딩(`data.adm[]`)과 달리 **배열이 아니라 객체 하나**다.
 * `bldname`은 그 지점의 상호가 아니라 **가장 가까운 건물** 이름이다 —
 * 도로 위 좌표에도 근처 건물 이름이 온다. 실측으로 확인했다.
 */
export interface LocationAdm {
  posx?: string;
  posy?: string;
  address?: string;
  jibun?: string;
  roadname?: string;
  roadjibun?: string;
  postcode?: string;
  bldname?: string;
  bldnum?: string;
}

/**
 * 진출입 지점 (최적 지점 검색).
 *
 * 좌표가 **숫자**다 — 검색·지오코딩만 문자열이다.
 * `rpx`/`rpy`(차량 진입로)와도 또 다른 자리이니 섞지 않는다.
 */
export interface EntryPoint {
  x?: number;
  y?: number;
  /** 입구 종류. */
  type?: number;
  /** 진입 각도. 정북 0도 기준 시계 방향이다. */
  angle?: number;
}

/**
 * 경유지 순서 최적화의 한 지점.
 *
 * **배열에 담긴 순서가 방문 순서**이고 `index`는 요청할 때 넣었던 순서다. 둘을 섞지 않는다.
 * `distance`·`spend_time`은 **이전 지점으로부터**라 첫 원소(출발지)는 0이다.
 */
export interface OptimizedPoint {
  index?: number;
  x?: number;
  y?: number;
  distance?: number;
  spend_time?: number;
}

/**
 * 거리 행렬 한 칸의 수치.
 *
 * `text`는 도구가 떼고 내보낸다 — 같은 칸 `value`에서 그대로 나오는 중복이다
 * (`src/tools/common/drop-duplicates.ts`). 픽스처에는 남아 있어 선언만 해 둔다.
 */
export interface MatrixMeasure {
  value?: number;
  text?: string;
}

export interface MatrixElement {
  distance?: MatrixMeasure;
  duration?: MatrixMeasure;
  status?: string;
}

/**
 * 봉투 안의 본문. 도구마다 채워지는 키가 다르다.
 *
 * 어느 키를 볼지는 `_meta.kind`가 정한다. `adm`만 종류에 따라 모양이 갈린다 —
 * 검색·지오코딩은 배열, 리버스 지오코딩은 객체 하나다.
 */
export interface ToolPayloadData {
  /** 검색·주변 분류 검색 */
  poi?: SearchPoi[];
  totalcount?: number;
  /** 장소(POI)만의 전체 건수. `totalcount`는 주소까지 합친 값이라 따로 본다. */
  poitotalcount?: number;
  /**
   * 통합 검색에서는 주소(adm)만의 전체 건수. **지오코딩에서는 이번에 받은 건수**라 전체는
   * `totalcount`를 본다 (pager.ts).
   */
  admtotalcount?: number;
  /** 검색·지오코딩은 배열, 리버스 지오코딩은 객체 하나. */
  adm?: AddressAdm[] | LocationAdm;
  /** 행정구역 경계·진출입 지점이 함께 쓴다. 담긴 것의 개수. */
  count?: number;
  /** 행정구역 경계 (공간 검색) */
  polygondata?: {
    /** 요청은 10자리인데 응답은 8자리로 온다 (실측). */
    admincode?: string;
    count?: number;
    /** 스펙은 객체로 선언하지만 실제 응답은 배열이다 (실측). */
    polygonlist?: { count?: number; polygon?: RouteCoord[] }[];
  }[];
  /** 진출입 지점 (최적 지점 검색) */
  entrypoints?: EntryPoint[];
  /** 경유지 순서 최적화 (TSP). 담긴 순서가 방문 순서다. */
  optimize?: OptimizedPoint[];
  /** 거리 행렬 (RDM) */
  mode?: string;
  /** **좌표 한 쌍을 이어붙인 `"경도,위도"` 문자열**이다. 객체가 아니다. */
  origins?: string[];
  destinations?: string[];
  /** `rows`는 `points` 순서, `elements`는 `dests` 순서(없으면 `points` 순서)다. */
  rows?: { elements?: MatrixElement[] }[];
  /** 경로 (자동차·예측·도보) */
  option?: string;
  distance?: number;
  spend_time?: number;
  toll_fee?: number;
  totalTaxiFare?: string;
  paths?: RoutePath[];
  /** 경로 예측 탐색에만 온다. 시각(`departAt`·`arriveAt`)을 지정했을 때만 채워진다. */
  times?: RouteTimeSlot[];
}

export interface ToolPayload {
  header?: { isSuccessful?: boolean; resultCode?: number; resultMessage?: string };
  data?: ToolPayloadData;
}

/** 템플릿이 그릴 수 있는 결과 종류. */
export type PayloadKind =
  'search' | 'geocode' | 'reverse' | 'route' | 'boundary' | 'entry-points' | 'optimize' | 'matrix';

/**
 * 서버가 `_meta.kind`에 실어 보낸 값을 렌더러로 옮긴다.
 *
 * 도구가 내보내는 `kind`는 10종이고 렌더러는 여덟이다. 모양이 같은 것끼리 한 렌더러가
 * 받는다 — 주변 분류 검색은 `poi[]` 38개 필드가 통합 검색과 완전히 같고,
 * 도보 경로는 `paths[].coords`가 자동차와 같은 구조다.
 *
 * 모르는 값은 `undefined`를 돌려준다. 그릴 수 없다고 알리는 편이 엉뚱하게 그리는 것보다 낫다.
 */
const KIND_BY_META: Record<string, PayloadKind> = {
  search: 'search',
  nearby: 'search',
  geocode: 'geocode',
  reverse: 'reverse',
  route: 'route',
  'walking-route': 'route',
  boundary: 'boundary',
  'entry-points': 'entry-points',
  optimize: 'optimize',
  matrix: 'matrix',
};

export function detectKind(meta: Record<string, unknown> | undefined): PayloadKind | undefined {
  const kind = meta?.kind;
  return typeof kind === 'string' ? KIND_BY_META[kind] : undefined;
}

/**
 * 이 목록이 **어느 검색 도구**에서 왔는지. 쪽을 넘길 목록이 아니면 `undefined`.
 *
 * `detectKind`는 모양이 같은 둘을 한 렌더러로 보내므로(`nearby` → `search`) 여기서는
 * **서버가 적어 보낸 원래 값**을 본다. 영역을 바꿔 다시 찾는 일은 `search_places`를
 * 그대로 다시 부르는 것이라, 그 도구에서 온 결과에서만 뜻이 있다.
 * 쪽 넘기기는 둘 다 되지만 **온 도구를 다시** 불러야 한다.
 *
 * **도구 인자의 필드 이름으로 가르면 안 된다.** `query`는 `search_places`에서는 찾을 말이지만
 * `get_admin_boundary`에서는 행정구역 코드·이름이다. 이름만 같고 뜻이 달라, 경계 조회
 * 결과에서 영역 재검색이 열린 채 `100 Result Not Found`를 뱉었다.
 */
export function searchToolOf(meta: Record<string, unknown> | undefined): SearchTool | undefined {
  if (meta?.kind === 'search') return 'search_places';
  if (meta?.kind === 'nearby') return 'search_nearby_category';
  if (meta?.kind === 'geocode') return 'geocode_address';
  return undefined;
}

/**
 * 쪽을 넘길 수 있는 목록을 돌려주는 세 도구. 쪽을 넘길 때는 **결과를 만든 도구를 그대로**
 * 다시 부른다 — 인자 체계가 달라(`query` ↔ `catecode`, 정렬 값) 서로 바꿔 부를 수 없다.
 *
 * 앞의 둘은 **장소** 목록이라 `경로 만들기`도 된다. 지오코딩은 주소 후보라 쪽 넘기기만 연다.
 */
export type SearchTool = 'search_places' | 'search_nearby_category' | 'geocode_address';

/**
 * 이 결과가 **자동차 경로(`find_route`)의 것인지.**
 *
 * `detectKind`는 자동차와 도보를 한 렌더러로 보내므로(둘 다 `route`), 옵션처럼 **도구마다
 * 다른 것**을 고를 때는 서버가 적어 보낸 원래 값을 봐야 한다. 도보는 탐색 옵션이 따로다.
 */
export function isCarRoute(meta: Record<string, unknown> | undefined): boolean {
  return meta?.kind === 'route';
}

/**
 * 경로의 한 자리가 **어떤 장소인지.**
 *
 * 경로 API는 좌표만 돌려주므로 응답에서는 알 수 없다. 모델이 도구 입력에 적어 보낸 것을
 * 서버가 `_meta.places`로 넘겨 준다.
 * 없으면 자리 이름과 좌표만 보여 준다 — 지어내지 않는다.
 */
export interface WaypointPlace {
  name?: string;
  roadAddress?: string;
  lotAddress?: string;
  tel?: string;
  category?: string;
}

/**
 * 도구마다 자리의 짜임이 달라 쓰는 칸이 다르다.
 * 경로는 `start`·`end`·`vias`, 순서 최적화는 `points`(응답 순서), 거리 행렬은
 * `origins`·`destinations`(요청 순서)를 쓴다. 배열은 길이를 지키고 빈 자리는 `null`이다.
 */
export interface WaypointPlaces {
  start?: WaypointPlace;
  end?: WaypointPlace;
  /** 경유지는 **순서가 핀과 맞는다.** 모르는 자리는 `null`이다. */
  vias?: (WaypointPlace | null)[];
  points?: (WaypointPlace | null)[];
  origins?: (WaypointPlace | null)[];
  destinations?: (WaypointPlace | null)[];
}

export function readWaypointPlaces(
  meta: Record<string, unknown> | undefined,
): WaypointPlaces | undefined {
  const places = meta?.places;
  return places && typeof places === 'object' ? (places as WaypointPlaces) : undefined;
}

/** 검색·지오코딩의 주소 목록. 리버스 지오코딩의 객체 하나와 섞이지 않게 가른다. */
export function readAdmList(data: ToolPayloadData | undefined): AddressAdm[] {
  return Array.isArray(data?.adm) ? data.adm : [];
}

/** 리버스 지오코딩의 지점 정보. 배열로 오면 그 지점이 아니므로 무시한다. */
export function readLocationAdm(data: ToolPayloadData | undefined): LocationAdm | undefined {
  const adm = data?.adm;
  return adm && !Array.isArray(adm) ? adm : undefined;
}

/**
 * 지점의 이름으로 쓸 것을 고른다.
 *
 * 건물명이 있으면 건물명, 없으면 도로명 주소, 그것도 없으면 지번 주소.
 * **건물명은 가장 가까운 건물의 이름**이므로 "여기가 그곳"이라고 단정하면 안 된다.
 */
export function describeLocation(adm: LocationAdm | undefined): string {
  if (!adm) return '';

  const road = [adm.roadname, adm.roadjibun].filter(Boolean).join(' ');
  const jibun = [adm.address, adm.jibun].filter(Boolean).join(' ');
  return adm.bldname?.trim() || road || jibun || '';
}

/** 검색·지오코딩 좌표는 문자열, 경로 좌표는 숫자로 온다. 숫자로 통일한다. */
export function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 서버가 도구 응답 `_meta.showMap`에 표시 여부를 싣는다 (도구 입력 `showMap`이 그대로 온다).
 *
 * 명시적으로 `false`일 때만 접는다. 키가 아예 없으면 호스트가 `_meta`를 걸러낸 경우이므로
 * 표시한다 — 빈 화면만 남는 것보다 낫다.
 */
export function shouldShowMap(meta: Record<string, unknown> | undefined): boolean {
  return meta?.showMap !== false;
}
