import type { InaviMap, InaviNamespace, LngLatLike } from '../map/inavi';
import type { MatrixElement, ToolPayload, WaypointPlace, WaypointPlaces } from '../shared/payload';
import { formatDistance, formatDuration } from '../shared/dom';
import { drawFeatures, statList, type MapFeature, type StatRow } from './result';
import { seriesColor } from '../map/map-colors';
import type { RenderResult } from './result';

export interface MatrixRenderOptions {
  /**
   * 지점이 **어떤 장소인지.** 응답은 좌표 문자열만 주므로 모델이 도구 입력에 적어 보낸
   * 것이 `_meta.places`로 온다. 요청 순서가 곧 `origins`·`destinations`의 순서다.
   */
  places?: WaypointPlaces;
}

/**
 * 거리 행렬(RDM) 렌더링. 표는 사이드바, 지도에는 지점만. (기반 예제: marker-numbering)
 *
 * **선은 긋지 않는다** — 직선은 실제 주행 경로가 아닌데 경로처럼 보인다.
 *
 * `origins`·`destinations`는 `"경도,위도"` **문자열** 배열이다. `rows`는 `points` 순서,
 * `elements`는 `dests` 순서(없으면 `points` 순서). `text`는 도구가 떼므로 `value`에서 만든다.
 *
 * 목록은 칸의 수치를 늘어놓는 지표 나열이라 지점과 줄이 1:1로 맞지 않는다. 그래서 목록과
 * 마커를 잇지 않는다 (marker-link.ts가 개수를 보고 스스로 비켜선다).
 */
export function renderMatrix(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
  options: MatrixRenderOptions = {},
): RenderResult {
  const data = payload.data;
  const origins = parsePoints(data?.origins);
  // `destinations`가 없으면 출발지끼리의 행렬이다. 같은 지점에 마커를 두 번 찍지 않는다.
  const destinations = data?.destinations ? parsePoints(data.destinations) : undefined;

  if (origins.length === 0) {
    return { coordinates: [], listHtml: '', summary: '행렬의 지점 좌표가 없습니다.' };
  }

  const originPlaces = options.places?.origins;
  // `destinations`가 없으면 열도 출발지라 같은 이름을 쓴다.
  const columnPlaces = destinations ? options.places?.destinations : originPlaces;

  // 핀 글자는 한글 두 자면 깨진다 (route.ts의 `START_LABEL`). `S1`·`E1`로 적는다.
  const features = [
    ...pointFeatures(origins, destinations ? 'S' : '', '출발', originPlaces, 0),
    ...(destinations ? pointFeatures(destinations, 'E', '도착', columnPlaces, origins.length) : []),
  ];
  drawFeatures(inavi, map, features);

  const columnPoints = destinations ?? origins;
  const columnOffset = destinations ? origins.length : 0;
  const rows: StatRow[] = [];
  let legs = 0;

  /*
   * **출발지로 묶는다.** 칸마다 `판교역(신분당선) → 서현역(수인분당선)`을 통째로 적으면 같은
   * 이름이 n번 되풀이되고, 역 이름 둘이 한 줄에 안 들어가 줄이 접힌다(실기 피드백).
   * 출발지는 머리글로 한 번만 적고 그 아래에 도착지만 늘어놓는다.
   */
  (data?.rows ?? []).forEach((row, rowIndex) => {
    const cells = (row.elements ?? [])
      .map((element, columnIndex) => ({ element, columnIndex }))
      // 자기 자신으로 가는 칸은 늘 `0m · 0분`이다. 알려 주는 것 없이 자리만 차지한다.
      .filter(({ columnIndex }) => !samePoint(origins[rowIndex], columnPoints[columnIndex]));

    if (cells.length === 0) return;

    rows.push({
      label: `${pointName(rowIndex, originPlaces, destinations ? '출발' : '지점')} →`,
      badge: badge(rowIndex, destinations ? 'S' : '', rowIndex),
    });

    cells.forEach(({ element, columnIndex }) => {
      legs += 1;
      rows.push({
        label: pointName(columnIndex, columnPlaces, destinations ? '도착' : '지점'),
        value: measure(element),
        badge: badge(columnIndex, destinations ? 'E' : '', columnOffset + columnIndex),
        child: true,
      });
    });
  });

  return {
    coordinates: [...origins, ...(destinations ?? [])],
    listHtml: statList(rows),
    // `mode`는 적지 않는다. 실제로 오는 값이 `tms`라 읽는 사람에게 아무 뜻이 없다.
    summary: destinations
      ? `출발 ${origins.length}곳 → 도착 ${destinations.length}곳 · ${legs}개 구간`
      : `방문지 ${origins.length}곳 · ${legs}개 구간`,
  };
}

/** `"127.110762,37.402184"` → `[127.110762, 37.402184]`. 못 읽는 것은 버린다. */
function parsePoints(values: string[] | undefined): LngLatLike[] {
  return (values ?? []).reduce<LngLatLike[]>((points, value) => {
    const [lng, lat] = value.split(',').map(Number);
    if (lng !== undefined && lat !== undefined && Number.isFinite(lng) && Number.isFinite(lat)) {
      points.push([lng, lat]);
    }
    return points;
  }, []);
}

/**
 * 지점 핀.
 *
 * 이름을 알면 상호가 제목이 되고 좌표는 적지 않는다. 모르면 `S1`처럼 자리 번호를 제목에
 * 적고 좌표를 보여 준다 — 그것밖에 보여 줄 것이 없을 때만 쓰는 값이다.
 */
function pointFeatures(
  points: LngLatLike[],
  prefix: string,
  noun: string,
  places: (WaypointPlace | null)[] | undefined,
  offset: number,
): MapFeature[] {
  return points.map((position, index) => {
    const place = places?.[index];
    const name = place?.name?.trim();
    // 지점끼리 역할이 같아 **순번으로 색을 가른다**. 출발 다음에 도착이 이어지도록 센다.
    const base = {
      position,
      seriesIndex: offset + index,
      label: `${prefix}${index + 1}`,
      chip: `${noun} 지점`,
    };

    if (!name) {
      return { ...base, title: `${prefix || '지점'}${index + 1}`, showCoordinate: true };
    }

    return {
      ...base,
      title: name,
      address: { road: place?.roadAddress, lot: place?.lotAddress },
      tel: place?.tel,
      meta: [place?.category],
    };
  });
}

/** 줄에 적을 이름. 이름을 알면 `출발1` 대신 상호를 적는다 — 그게 묻고 싶었던 것이다. */
function pointName(
  index: number,
  places: (WaypointPlace | null)[] | undefined,
  noun: string,
): string {
  return places?.[index]?.name?.trim() || `${noun}${index + 1}`;
}

/** 줄 앞의 번호 배지. **핀에 적힌 글자와 색을 그대로** 쓴다. */
function badge(index: number, prefix: string, colorIndex: number) {
  return { text: `${prefix}${index + 1}`, color: seriesColor(colorIndex) };
}

/** 자기 자신인지. 좌표가 같으면 같은 자리다 — 출발·도착 목록이 따로여도 걸린다. */
function samePoint(a: LngLatLike | undefined, b: LngLatLike | undefined): boolean {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/**
 * 한 칸의 값. `status`가 `OK`가 아니면 수치 대신 그것을 보여 준다.
 *
 * 길이 없어 못 잰 칸을 `0m`로 적으면 "바로 옆"으로 읽힌다.
 */
function measure(element: MatrixElement): string {
  const ok = element.status === undefined || element.status === 'OK';
  return ok
    ? `${formatDistance(element.distance?.value)} · ${formatDuration(element.duration?.value)}`
    : (element.status ?? '-');
}
