import { app } from './app-instance';

/**
 * 표시 모드 전환.
 *
 * 호스트가 템플릿에 주는 영역은 어느 서버든 같은 크기다 — TomTom·Mapbox·내장 지도 도구를
 * 실연동해 확인했다. 지도처럼 넓이가 곧 쓸모인 화면에는 그 기본 크기가 좁다.
 *
 * 규격의 `표시 모드 전환`(Optional)이 유일한 통로다. **Optional이라 보장이 없어**
 * 호스트가 `availableDisplayModes`로 알려 줄 때만 버튼을 만든다.
 */

type DisplayMode = 'inline' | 'fullscreen' | 'pip';

interface DisplayContext {
  displayMode?: DisplayMode;
  availableDisplayModes?: DisplayMode[];
}

function context(): DisplayContext {
  return (app.getHostContext() ?? {}) as DisplayContext;
}

/**
 * 호스트가 **허락한** 표시 모드. `requestDisplayMode`의 응답에서 온다.
 *
 * 호스트 컨텍스트의 `displayMode`만 믿으면 안 된다 — 요청이 끝난 직후에도 아직 옛 값이라
 * 전체화면으로 넘어간 뒤에도 버튼이 `전체화면`인 채로 남는다. 그러다 아무 버튼이나 눌러
 * 레일을 다시 그리는 순간 뒤늦게 바뀐다. 그래서 응답 값을 앞세우고, 호스트가 컨텍스트로
 * 알려 오면 그때 내려놓는다.
 */
let grantedMode: DisplayMode | undefined;

export function currentDisplayMode(): DisplayMode {
  return grantedMode ?? context().displayMode ?? 'inline';
}

/** 호스트가 컨텍스트로 표시 모드를 알려 왔다. 이제 그쪽이 사실이다. */
export function noteHostDisplayMode(mode: DisplayMode | undefined): void {
  if (mode === undefined) return;
  grantedMode = undefined;
}

/** 호스트가 전체화면을 열어 줄 때만 참. */
export function canToggleFullscreen(): boolean {
  return context().availableDisplayModes?.includes('fullscreen') ?? false;
}

export function fullscreenButtonLabel(): string {
  return currentDisplayMode() === 'fullscreen' ? '창 모드' : '전체화면';
}

/**
 * 전체화면 ↔ 인라인을 오간다.
 *
 * 영역이 바뀌어도 지도 캔버스는 스스로 크기를 다시 재지 않는다. `resize`를 한 번 흘려
 * 다시 재게 한다 — SDK 호출이 아니라 창 이벤트라 검증된 표면을 벗어나지 않는다.
 */
export async function toggleFullscreen(): Promise<void> {
  const next: DisplayMode = currentDisplayMode() === 'fullscreen' ? 'inline' : 'fullscreen';
  // 호스트가 요청한 모드를 그대로 준다는 보장이 없다. 돌려준 값을 사실로 삼는다.
  const result = await app.requestDisplayMode({ mode: next });
  grantedMode = result.mode;
  notifyResize();
}

export function notifyResize(): void {
  window.dispatchEvent(new Event('resize'));
}
