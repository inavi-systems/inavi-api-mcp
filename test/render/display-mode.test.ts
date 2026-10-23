// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  context: undefined as Record<string, unknown> | undefined,
  requestDisplayMode: vi.fn((params: { mode: string }) => Promise.resolve({ mode: params.mode })),
}));

vi.mock('../../ui/src/host/app-instance', () => ({
  app: {
    getHostContext: () => host.context,
    requestDisplayMode: host.requestDisplayMode,
  },
}));

const {
  canToggleFullscreen,
  currentDisplayMode,
  fullscreenButtonLabel,
  noteHostDisplayMode,
  toggleFullscreen,
} = await import('../../ui/src/host/display-mode');

beforeEach(() => {
  host.context = undefined;
  host.requestDisplayMode.mockClear();
  // 앞 테스트에서 받아 둔 허락 값을 내려놓는다 (모듈 변수).
  noteHostDisplayMode('inline');
});

describe('canToggleFullscreen', () => {
  it('호스트가 알려 줄 때만 참', () => {
    host.context = { availableDisplayModes: ['inline', 'fullscreen'] };
    expect(canToggleFullscreen()).toBe(true);
  });

  it('전체화면이 목록에 없으면 거짓', () => {
    host.context = { availableDisplayModes: ['inline'] };
    expect(canToggleFullscreen()).toBe(false);
  });

  it('호스트가 아무것도 알려 주지 않으면 거짓', () => {
    // Optional이라 안 알려 주는 호스트가 있다. 그때 버튼을 만들면 안 된다.
    expect(canToggleFullscreen()).toBe(false);

    host.context = {};
    expect(canToggleFullscreen()).toBe(false);
  });
});

describe('currentDisplayMode', () => {
  it('모르면 인라인으로 본다', () => {
    expect(currentDisplayMode()).toBe('inline');
  });

  it('호스트가 알려 준 값을 쓴다', () => {
    host.context = { displayMode: 'fullscreen' };
    expect(currentDisplayMode()).toBe('fullscreen');
  });
});

describe('toggleFullscreen', () => {
  it('인라인이면 전체화면을 요청한다', async () => {
    host.context = { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] };

    await toggleFullscreen();

    expect(host.requestDisplayMode).toHaveBeenCalledWith({ mode: 'fullscreen' });
  });

  it('전체화면이면 인라인으로 되돌린다', async () => {
    host.context = { displayMode: 'fullscreen', availableDisplayModes: ['inline', 'fullscreen'] };

    await toggleFullscreen();

    expect(host.requestDisplayMode).toHaveBeenCalledWith({ mode: 'inline' });
  });

  it('지도가 크기를 다시 재도록 resize를 흘린다', async () => {
    host.context = { displayMode: 'inline' };
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);

    await toggleFullscreen();

    expect(onResize).toHaveBeenCalled();
    window.removeEventListener('resize', onResize);
  });
});

describe('표시 모드는 요청 응답을 앞세운다', () => {
  // 호스트 컨텍스트는 요청이 끝난 뒤에도 한동안 옛 값이다. 그 값만 읽으면 전체화면으로
  // 넘어가고도 버튼이 `전체화면`인 채로 남고, 엉뚱한 버튼을 눌러 다시 그릴 때 뒤늦게
  // 뒤집힌다 (실기에서 발견).
  it('응답으로 받은 모드를 곧바로 쓴다', async () => {
    host.context = { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] };

    await toggleFullscreen();

    expect(currentDisplayMode()).toBe('fullscreen');
    expect(fullscreenButtonLabel()).toBe('창 모드');
  });

  it('호스트가 컨텍스트로 알려 오면 그쪽이 사실이 된다', async () => {
    host.context = { displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] };
    await toggleFullscreen();

    // 사용자가 호스트 UI로 창 모드로 되돌린 경우.
    host.context = { displayMode: 'inline' };
    noteHostDisplayMode('inline');

    expect(currentDisplayMode()).toBe('inline');
  });
});

describe('fullscreenButtonLabel', () => {
  it('현재 모드의 반대를 가리킨다', () => {
    host.context = { displayMode: 'inline' };
    expect(fullscreenButtonLabel()).toBe('전체화면');

    host.context = { displayMode: 'fullscreen' };
    expect(fullscreenButtonLabel()).toBe('창 모드');
  });
});
