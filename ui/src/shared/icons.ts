/**
 * 지도 위에 쓰는 아이콘.
 *
 * **이모지를 쓰지 않는다.** OS마다 모양·크기·색이 제각각이라(Windows에서 특히 튄다)
 * SDK 컨트롤 옆에 세워 두면 식구로 보이지 않는다. 선 굵기까지 맞춘 인라인 SVG로 고정하고
 * 색은 `currentColor`로 받아 CSS가 정한다.
 *
 * 경로만 상수로 들고 있으므로 값을 끼워 넣는 자리가 없다 — `innerHTML`에 그대로 써도 된다.
 */

export type IconName =
  | 'map-normal'
  | 'map-satellite'
  | 'map-hybrid'
  | 'map-terrain'
  | 'chevron-up'
  | 'chevron-down'
  | 'more'
  | 'moon'
  | 'sun'
  | 'expand'
  | 'compress'
  | 'refresh'
  | 'route'
  | 'filter'
  | 'chevron-left'
  | 'chevron-right';

const PATHS: Record<IconName, string> = {
  /*
   * 지도 유형 넷.
   *
   * **유형마다 그 유형다운 그림을 그린다.** 쌓인 마름모(레이어)도, 2×2 칸을 골라 칠하는
   * 방식도 칠한 칸의 조합을 외우지 않으면 읽히지 않았다.
   *
   * 레일 버튼은 **지금 고른 유형의 아이콘**을 쓰므로 목록을 열지 않아도 무엇으로 보고
   * 있는지 알 수 있다. 16px로 그려지니 획을 서넛 안쪽으로 둔다.
   */
  // 일반 — 접힌 종이 지도. 세 면이 번갈아 접힌 모양이 곧 "지도"다.
  'map-normal':
    '<path d="M3 6.6 9 4.1l6 2.5 6-2.5v13L15 19.6l-6-2.5-6 2.5Z"/>' +
    '<path d="M9 4.1v13M15 6.6v13"/>',
  // 항공 — 지구본. 위에서 내려다본 사진이라는 뜻을 경선·위선으로 말한다.
  'map-satellite':
    '<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/>' +
    '<ellipse cx="12" cy="12" rx="4.1" ry="8.4"/>',
  // 하이브리드 — 지구본 위에 길을 얹는다. 그게 이 유형이 하는 일이다(사진 + 도로·지명).
  'map-hybrid':
    '<circle cx="12" cy="12" r="8.4"/>' +
    '<path d="M4.6 8.4c3 0 3 3.6 6 3.6s4-3.6 7-3.6"/>' +
    '<path d="M6.2 17.2c2.4 0 2.4-2.4 5-2.4s2.6 2.4 5 2.4"/>',
  // 지형 — 산줄기. 높낮이를 보여주는 지도라는 뜻이다.
  'map-terrain': '<path d="M2.4 18.6 8 9.2l3.3 5.3 2.9-3.9 7.4 8Z"/>' + '<path d="M6.4 12.9h3.2"/>',
  // 지도에서 하기 — 커서 화살표는 "위치 표시"로 읽혔다. 메뉴라는 것만 분명히 한다.
  more:
    '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sun:
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2v2M12 20v2M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5' +
    'M2 12h2M20 12h2M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/>',
  expand:
    '<path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/>',
  compress:
    '<path d="M3 9h4a2 2 0 0 0 2-2V3M21 9h-4a2 2 0 0 1-2-2V3M3 15h4a2 2 0 0 1 2 2v4M21 15h-4a2 2 0 0 0-2 2v4"/>',
  refresh: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5v5h-5"/>',
  route:
    '<circle cx="6" cy="18.5" r="2.5"/><circle cx="18" cy="5.5" r="2.5"/>' +
    '<path d="M8.5 18.5h5a3.5 3.5 0 0 0 0-7h-3a3.5 3.5 0 0 1 0-7h5"/>',
  filter: '<path d="M3.5 5h17l-6.5 7.5V20l-4 1.5v-9Z"/>',
  'chevron-left': '<path d="m14.5 5-7 7 7 7"/>',
  'chevron-right': '<path d="m9.5 5 7 7-7 7"/>',
  // 목록 손잡이. 펼침=위로 접기, 접힘=아래로 펼치기.
  'chevron-up': '<path d="m5 14.5 7-7 7 7"/>',
  'chevron-down': '<path d="m5 9.5 7 7 7-7"/>',
};

export function icon(name: IconName): string {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`
  );
}
