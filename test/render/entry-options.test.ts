// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { entryPointSelects, type EntryPointArguments } from '../../ui/src/rail/entry-options';
import { mountMapRail } from '../../ui/src/rail/map-rail';

/**
 * 레일의 고르는 줄 — **진입 지점 편** (entry-options.ts).
 *
 * `종류` 하나만 연다. `count`는 진입로가 몇 개뿐이라 고를 일이 없다 (261020 피드백).
 */

const ENTRY: EntryPointArguments = { posX: 127.11, posY: 37.4, kind: 'car', count: 5 };

const choose = (value: string) => {
  document.body.innerHTML = '<div id="map-host"></div>';
  const apply = vi.fn();
  mountMapRail(document.getElementById('map-host') as HTMLElement, {
    onStyleChange: () => undefined,
    selects: entryPointSelects(ENTRY, apply),
  });
  document.querySelector<HTMLElement>('[data-rail="panel"]')?.click();

  const field = document.querySelector<HTMLSelectElement>('.option-select');
  if (!field) throw new Error('줄이 없다');
  field.value = value;
  field.dispatchEvent(new Event('change'));
  return apply;
};

describe('entryPointSelects', () => {
  it('바꿀 수 있는 것은 종류뿐이다', () => {
    expect(entryPointSelects(ENTRY, vi.fn()).map((select) => select.label)).toEqual(['종류']);
  });

  it('지금 값을 고른 것으로 보이고, 없으면 도구 기본값(전체)이다', () => {
    expect(entryPointSelects(ENTRY, vi.fn())[0]?.value).toBe('car');
    expect(entryPointSelects({ posX: 127 }, vi.fn())[0]?.value).toBe('all');
  });

  it('좌표·건수는 그대로 두고 종류만 갈아 끼운다', () => {
    const apply = choose('taxi-building');

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[0]).toEqual({ ...ENTRY, kind: 'taxi-building' });
  });
});
