import { isDarkTheme } from './theme';

/**
 * 지도에 칠하는 색을 **한 곳에 모은다.**
 *
 * 파일마다 색을 들고 있었더니 같은 뜻인데 자리마다 색이 갈렸다. "같은 뜻이면 같은 색"을
 * 지키려고 여기 모은다. **지도 위에 색을 더할 일이 생기면 이 파일에 먼저 적고 가져다 쓴다.**
 *
 * ## 테마
 *
 * 지도는 밝은 지도와 야간 지도 두 벌이다. 테마를 타는 색은 `light`·`dark`를 짝으로 두고
 * `themed()`로 고른다. 핀처럼 흰 테가 둘러 어느 바탕에서도 보이는 것은 한 값만 둔다.
 */

/** 테마를 타는 값. 밝은 지도와 야간 지도에서 다른 색을 쓴다. */
export interface Themed<T> {
  light: T;
  dark: T;
}

export function themed<T>(pair: Themed<T>): T {
  return isDarkTheme() ? pair.dark : pair.light;
}

/**
 * 마커 색. 역할마다 다르되 **모양은 하나**다 (render/pin.ts).
 *
 * 전부 중간 채도·중간 명도라 밝은 지도에서도 야간 지도에서도 바탕에 묻히지 않는다.
 * 출발·경유·도착은 iNavi 지도의 배색(빨강·주황·남색)을 따랐다.
 */
export const PIN_COLORS = {
  /** 통합검색·주변검색의 장소 */
  place: '#3F62E0',
  /** 검색 결과 중 주소, 지오코딩 후보 */
  address: '#0E9488',
  start: '#E0402E',
  via: '#EE9A1F',
  end: '#2A4BB0',
  /** 진출입 지점 */
  entry: '#8046D8',
  /** 리버스 지오코딩 결과 */
  point: '#C13A7A',
} as const;

/**
 * **번호로 가리키는 지점들의 색.** 순번마다 다른 색을 돌려 쓴다.
 *
 * 거리 행렬처럼 지점이 여럿인데 역할이 모두 같은 결과는 핀이 전부 한 색이고 번호만 달라서,
 * 지도만 봐서는 어느 것이 몇 번인지 한눈에 들어오지 않았다(실기 피드백). 색이 다르면
 * 목록의 `판교역 → 서현역`을 지도에서 바로 짚을 수 있다.
 *
 * 열 가지를 두고 **열한 번째부터는 처음으로 돌아간다.** 더 늘려 봐야 서로 구별되지 않는
 * 색이 생기고, 그 지경이면 색으로 짚을 수 있는 개수를 이미 넘어선다.
 *
 * 모두 중간 명도다 — 핀 안의 글자가 **핀과 같은 색**이라(render/pin.ts) 옅은 색을 쓰면
 * 흰 속 원에서 글자가 사라진다. 이웃한 번호끼리 멀어지도록 늘어놓았다.
 */
export const PIN_SERIES = [
  '#3F62E0', // 파랑
  '#E0402E', // 빨강
  '#0E9488', // 청록
  '#EE9A1F', // 주황
  '#8046D8', // 보라
  '#2F8F4E', // 초록
  '#C13A7A', // 자주
  '#0B6FA8', // 감청
  '#8A6A3C', // 갈색
  '#5A6275', // 잿빛
] as const;

/** 순번에 해당하는 색. 열 가지를 넘으면 처음으로 돌아간다. */
export function seriesColor(index: number): string {
  return PIN_SERIES[index % PIN_SERIES.length] as string;
}

/**
 * 뭉친 정도별 클러스터 풍선.
 *
 * `from`은 **몇 개부터 이 단계인지**, `size`는 후광까지 포함한 전체 지름이다.
 * 많이 뭉칠수록 크고 짙은 남색, 적게 뭉칠수록 작고 옅은 파랑 — 장소 핀과 같은 계열이라
 * 한 덩어리로 읽힌다.
 */
export const CLUSTER_STEPS = [
  { from: 20, size: 104, color: '#1B3A96' },
  { from: 10, size: 92, color: '#2A4FC8' },
  { from: 5, size: 82, color: '#3F62E0' },
  { from: 2, size: 72, color: '#5C7DF0' },
  { from: 0, size: 64, color: '#7D99F4' },
] as const;

/**
 * 검색 영역.
 *
 * **요청으로 온 영역(반경 원·사각)과 화면 영역 재검색은 같은 색이다.** 둘을 갈라
 * 칠했더니 같은 "검색 범위"인데 하나는 붉고 하나는 푸르러 이질감이 들었다(실기 피드백).
 *
 * `InaviShapeStyle`에는 선 굵기가 없어 **외곽선이 1px 고정**이다. 면 색과 투명도가 전부라
 * 옅게 주면 특히 야간 지도에서 거의 보이지 않는다.
 */
export const SEARCH_AREA_STYLE: Themed<{
  fillOpacity: number;
  fillColor: string;
  fillOutlineColor: string;
}> = {
  light: { fillOpacity: 0.18, fillColor: '#3F62E0', fillOutlineColor: '#1E327F' },
  dark: { fillOpacity: 0.32, fillColor: '#6B8AF0', fillOutlineColor: '#C3D0FF' },
};

/**
 * 행정구역 경계.
 *
 * **녹색 계열 금지** — 기본 지도의 공원·산림과 겹쳐 도시에서는 통째로 묻힌다(실측).
 * **경계와 검색 영역은 같은 화면에 함께 뜨지 않으므로**(행정구역 조회에는 검색 영역이 없다)
 * 같은 푸른 계열로 맞추되, 한 단계 짙은 남색을 쓴다.
 */
export const BOUNDARY_STYLE = {
  fillOpacity: 0.32,
  fillColor: '#2A4FC8',
  fillOutlineColor: '#16296B',
} as const;

/**
 * 교통 상황 색을 **그릴 때만** 옮긴다.
 *
 * API가 주는 `traffic_color`는 형광에 가까운 원색이라(원활 `#00ff60` · 서행 `#fff000` ·
 * 정체 `#fb3a76`) 지도 위에서 만화처럼 보인다. 의미는 그대로 두고 톤만 낮춘다.
 * **응답 값은 손대지 않는다** — 구간을 합치는 기준도, 정보창의 `trafficLabel`도 원본을 본다.
 */
export const TRAFFIC_TONE: Themed<Record<string, string>> = {
  light: {
    '#00ff60': '#15B35C', // 원활
    '#fff000': '#E8A800', // 서행
    '#fb3a76': '#E8415C', // 정체
    '#989898': '#8B929B', // 정보 없음
    '#d73a76': '#C25694', // 도보 경로 전 구간 단일값
  },
  dark: {
    '#00ff60': '#36A86B',
    '#fff000': '#D6A33C',
    '#fb3a76': '#D1544F',
    '#989898': '#8B929B',
    '#d73a76': '#B06A93',
  },
};

/** 교통 색을 모르면 쓰는 값(원활에 해당). */
export const TRAFFIC_FALLBACK: Themed<string> = { light: '#15B35C', dark: '#36A86B' };

/**
 * 경로 아래에 까는 외곽선.
 *
 * 밝은 지도에서는 어두운 테가 선을 또렷하게 하지만, 야간 지도에서는 먹색 테가 바탕에 묻혀
 * 경로가 가늘어 보인다. 야간에는 밝은 테로 뒤집어 선 둘레를 띄운다.
 */
export const ROUTE_OUTLINE: Themed<string> = { light: '#1C2127', dark: '#EEF1F5' };

/** `#rrggbb` + 투명도 → `rgba()`. 캔버스에 그릴 때 쓴다. */
export function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 0xff}, ${(value >> 8) & 0xff}, ${value & 0xff}, ${alpha})`;
}
