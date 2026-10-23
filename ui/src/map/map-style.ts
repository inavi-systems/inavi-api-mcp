import type { InaviMap } from './inavi';
import { isDarkTheme } from './theme';

/**
 * 지도 유형별 스타일 URL.
 *
 * 값이 난수 문자열이라 추측할 수 없다. `get_map_example({ id: "dynamic-map-type" })` 예제에서
 * 그대로 옮겨 왔다. 임의로 만들어 내지 말 것.
 *
 * 예제의 "하이브리드 지형"은 "하이브리드"와 URL이 같아 눌러도 달라지는 것이 없다.
 * 버튼이 무반응으로 보이므로 뺐다.
 *
 * `darkUrl`은 **어두운 테마일 때 대신 쓰는 짝**이다. SDK 유형 목록에는 어두운 스타일이
 * 없어 템플릿만 어두워지고 지도는 밝은 채로 남았다. 야간 스타일은 유형 목록에 따로 세우지
 * 않는다 — 사용자가 고르는 것은 `일반/항공/하이브리드/지형` 넷이고, 밝기는 테마가 정한다.
 * 항공·하이브리드·지형에는 짝이 없어 테마와 무관하게 그대로 간다(위성 사진은 원래 명암
 * 개념이 다르다).
 */
export interface MapStyleOption {
  id: string;
  label: string;
  url: string;
  /** 어두운 테마에서 쓸 짝. 없으면 테마와 무관하게 `url`을 쓴다. */
  darkUrl?: string;
}

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'normal',
    label: '일반',
    url: 'https://timbase.inavi.com/resources/web/inavi_5595128678a34daabf6dc772dad1e7e4.json',
    darkUrl: 'https://timbase.inavi.com/resources/inaviMap2601/web/custom/pastel_night.json',
  },
  {
    id: 'satellite',
    label: '항공',
    url: 'https://timbase.inavi.com/resources/web/type/S9f2K8mQ1r6Z4xB3nH7jL5pW2vR9dT3u.json',
  },
  {
    id: 'hybrid',
    label: '하이브리드',
    url: 'https://timbase.inavi.com/resources/web/type/H32sateghkqwlxptzyrjdbvmcdfinavi.json',
  },
  {
    id: 'dem',
    label: '지형',
    url: 'https://timbase.inavi.com/resources/web/type/inavi_DNK9f7D8k34lQ8sNfB2jM6xT5rH0uQ3y1bZ4.json',
  },
];

export const DEFAULT_MAP_STYLE_ID = 'normal';

export function findMapStyle(id: string): MapStyleOption | undefined {
  return MAP_STYLES.find((style) => style.id === id);
}

/**
 * 사용자가 고른 지도 유형. 결과가 다시 오면 지도를 새로 만들기 때문에(render-host의
 * createMap) 고른 값을 모듈 변수에 남겨 두고 새 지도에 다시 입힌다.
 */
let currentStyleId = DEFAULT_MAP_STYLE_ID;
let styleChosen = false;

export function getMapStyleId(): string {
  return currentStyleId;
}

/** 고른 유형을 기억한다. 아는 유형이 아니면 아무것도 하지 않는다. */
export function setMapStyleId(id: string): boolean {
  if (!findMapStyle(id)) return false;

  currentStyleId = id;
  styleChosen = true;
  return true;
}

/**
 * 새로 만든 지도에 지금 적용해야 할 스타일을 입힌다. **렌더러가 그리기 전에** 불러야 한다.
 *
 * `setStyle`은 스타일을 통째로 갈아끼우면서 그 위에 얹힌 소스·레이어를 버린다.
 * 이미 그려 둔 지도에 대고 부르면 도형은 SDK가 다시 붙여 주지만 마커·클러스터러는 사라진다
 * (그것도 바로가 아니라 줌·이동으로 다시 그려질 때 — 실기 확인에서 관찰).
 * 그래서 유형이나 테마가 바뀌면 지도부터 새로 만들고, 스타일을 먼저 입힌 뒤, 그다음 그린다.
 */
export function applyStoredMapStyle(map: InaviMap): void {
  const url = storedStyleUrl();
  if (url) map.setStyle(url);
}

/**
 * 지금 입혀야 할 스타일 URL. 입힐 것이 없으면 `undefined`.
 *
 * 밝은 테마에서 아직 아무것도 고르지 않았다면 손대지 않는다 — 기본 스타일에 굳이
 * `setStyle`을 한 번 더 걸어 스타일 재적재를 일으킬 이유가 없다. 어두운 테마는 기본값과
 * 다른 스타일을 써야 하므로 고른 적이 없어도 입힌다.
 */
function storedStyleUrl(): string | undefined {
  const style = findMapStyle(currentStyleId);
  if (!style) return undefined;

  if (isDarkTheme() && style.darkUrl) return style.darkUrl;
  return styleChosen ? style.url : undefined;
}
