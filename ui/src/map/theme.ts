import { applyDocumentTheme } from '@modelcontextprotocol/ext-apps';
import type { McpUiTheme } from '@modelcontextprotocol/ext-apps';

/**
 * 템플릿 테마.
 *
 * 기본은 호스트를 따라가되(`auto`), 사용자가 직접 바꿀 수도 있다.
 * 호스트가 테마를 바꿔 알려와도 사용자가 고른 값이 있으면 그쪽이 이긴다.
 *
 * 조작 UI에서는 **밝게 ↔ 어둡게 두 상태로만** 보인다(`toggleTheme`). 아이콘 버튼 하나로
 * 세 상태를 돌리면 지금 무엇이 켜진 것인지 알 수 없기 때문이다. `auto`는 사용자가 한 번도
 * 누르지 않은 처음 상태로만 남는다.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';

let preference: ThemePreference = 'auto';
let hostTheme: McpUiTheme | undefined;

/**
 * 마지막으로 반영한 실효 테마. 바뀔 때만 구독자에게 알린다.
 *
 * 처음 값을 비워 두면 안 된다. 호스트 컨텍스트는 **첫 결과를 그린 뒤에 오는 일이 있어**,
 * 첫 적용을 알리지 않으면 호스트가 어둡다고 알려와도 지도가 밝은 채로 남는다.
 */
let applied: McpUiTheme = systemTheme();

/**
 * 실효 테마가 바뀌었을 때 알림을 받는다.
 *
 * 지도 스타일이 테마를 따라가기 때문에 필요하다 — 어두운 테마에서는 야간 스타일을 쓰는데,
 * 이미 그려 둔 지도에 `setStyle`을 걸면 마커가 사라지므로 **처음부터 다시 그려야** 한다
 * (map-style.ts의 `applyStoredMapStyle` 주석 참고).
 */
const listeners = new Set<() => void>();

export function onEffectiveThemeChange(listener: () => void): void {
  listeners.add(listener);
}

/**
 * 호스트가 알려준 테마. `auto`일 때만 쓰인다.
 *
 * **모른다고 알려 오면 알던 값을 지우지 않는다.** 표시 모드를 바꿀 때 오는 컨텍스트에
 * `theme`이 빠져 있는 경우가 있는데, 그대로 받으면 어둡게 보던 화면이 전체화면으로
 * 넘어가는 순간 밝게로 떨어진다 (실기에서 확인).
 */
export function setHostTheme(theme: McpUiTheme | undefined): void {
  if (theme === undefined) return;

  hostTheme = theme;
  applyTheme();
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  applyTheme();
}

export function getThemePreference(): ThemePreference {
  return preference;
}

/** 지금 보이는 테마. 호스트 추종(`auto`)까지 풀어 둘 중 하나로 답한다. */
export function resolvedTheme(): McpUiTheme {
  return preference === 'auto' ? (hostTheme ?? systemTheme()) : preference;
}

export function isDarkTheme(): boolean {
  return resolvedTheme() === 'dark';
}

/** 지금의 반대로 뒤집는다. 누르는 순간부터 호스트 추종을 그만두고 사용자 선택이 된다. */
export function toggleTheme(): void {
  setThemePreference(isDarkTheme() ? 'light' : 'dark');
}

function applyTheme(): void {
  const next = resolvedTheme();
  applyDocumentTheme(next);
  // **`body`에도 표시한다.** `applyDocumentTheme`은 `:root`에 `data-theme`를 걸지만,
  // 호스트도 `:root`에 자기 변수를 인라인으로 꽂는다(`applyHostStyleVariables`).
  // 한 칸 안쪽인 `body`에서 정한 값은 그 인라인보다 가까워 확실히 이긴다.
  document.body.classList.toggle('theme-dark', next === 'dark');

  if (next === applied) return;

  applied = next;
  listeners.forEach((listener) => listener());
}

/** 호스트가 한 번도 알려 주지 않았을 때. 밝게로 못박는 것보다 기기 설정을 따르는 편이 낫다. */
function systemTheme(): McpUiTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
