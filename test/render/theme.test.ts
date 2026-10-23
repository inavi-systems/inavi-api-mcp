// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applied = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('@modelcontextprotocol/ext-apps', () => ({
  applyDocumentTheme: (theme: string) => {
    applied.calls.push(theme);
  },
}));

/** theme.ts는 모듈 변수에 상태를 들고 있다. 매번 새로 불러 서로 영향을 주지 않게 한다. */
async function freshTheme() {
  vi.resetModules();
  applied.calls = [];
  return import('../../ui/src/map/theme');
}

function stubSystemTheme(dark: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: dark,
    media: query,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  stubSystemTheme(false);
});

describe('setHostTheme', () => {
  it('호스트가 알려 준 테마를 따른다', async () => {
    const { setHostTheme } = await freshTheme();

    setHostTheme('dark');

    expect(applied.calls.at(-1)).toBe('dark');
  });

  it('모른다고 알려 오면 알던 값을 지우지 않는다', async () => {
    // 표시 모드를 바꿀 때 오는 컨텍스트에 theme이 빠져 있는 경우가 있다.
    // 그대로 받으면 어둡게 보던 화면이 전체화면으로 넘어가며 밝게로 떨어진다.
    const { setHostTheme } = await freshTheme();

    setHostTheme('dark');
    setHostTheme(undefined);

    expect(applied.calls.at(-1)).toBe('dark');
  });
});

describe('setThemePreference', () => {
  it('사용자가 고른 값이 호스트보다 우선한다', async () => {
    const { setHostTheme, setThemePreference } = await freshTheme();

    setHostTheme('dark');
    setThemePreference('light');

    expect(applied.calls.at(-1)).toBe('light');

    // 호스트가 다시 알려 와도 고른 값이 이긴다.
    setHostTheme('dark');
    expect(applied.calls.at(-1)).toBe('light');
  });

  it('자동으로 되돌리면 호스트 값을 다시 따른다', async () => {
    const { setHostTheme, setThemePreference } = await freshTheme();

    setHostTheme('dark');
    setThemePreference('light');
    setThemePreference('auto');

    expect(applied.calls.at(-1)).toBe('dark');
  });
});

describe('호스트가 한 번도 알려 주지 않았을 때', () => {
  it('기기 설정을 따른다', async () => {
    stubSystemTheme(true);
    const { setThemePreference } = await freshTheme();

    setThemePreference('auto');

    expect(applied.calls.at(-1)).toBe('dark');
  });

  it('기기가 밝게면 밝게', async () => {
    stubSystemTheme(false);
    const { setThemePreference } = await freshTheme();

    setThemePreference('auto');

    expect(applied.calls.at(-1)).toBe('light');
  });
});
