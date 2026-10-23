/**
 * 지도를 쓰는 도구들이 공유하는 단일 지도 뷰의 리소스 URI.
 *
 * 봉투 통일로 본문 최상위 키가 전부 `data`가 되어, 템플릿은 응답의 `_meta.kind`로 무엇을
 * 그릴지 판단한다. 도구마다 별도 리소스를 둘 필요가 없다.
 */
export const MAP_UI_URI = 'ui://inavi-maps/map.html';
