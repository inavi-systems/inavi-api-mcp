// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { matrixOptionSelects, type MatrixArguments } from '../../ui/src/rail/matrix-options';
import { mountMapRail } from '../../ui/src/rail/map-rail';

/**
 * 레일의 고르는 줄 — **거리 행렬 편** (matrix-options.ts).
 *
 * `교통` 하나만 연다. 차량 제원은 숫자라 고르는 줄로 만들 수 없다.
 */

const MATRIX: MatrixArguments = {
  points: [
    { x: 127.11, y: 37.4 },
    { x: 127.12, y: 37.38 },
  ],
  carWeight: 12000,
};

const choose = (args: MatrixArguments, value: string) => {
  document.body.innerHTML = '<div id="map-host"></div>';
  const apply = vi.fn();
  mountMapRail(document.getElementById('map-host') as HTMLElement, {
    onStyleChange: () => undefined,
    selects: matrixOptionSelects(args, apply),
  });
  document.querySelector<HTMLElement>('[data-rail="panel"]')?.click();

  const field = document.querySelector<HTMLSelectElement>('.option-select');
  if (!field) throw new Error('줄이 없다');
  field.value = value;
  field.dispatchEvent(new Event('change'));
  return apply;
};

describe('matrixOptionSelects', () => {
  it('바꿀 수 있는 것은 교통뿐이다', () => {
    expect(matrixOptionSelects(MATRIX, vi.fn()).map((select) => select.label)).toEqual(['교통']);
  });

  it('인자에 없으면 도구 기본값(미반영)이 고른 것으로 보인다', () => {
    expect(matrixOptionSelects(MATRIX, vi.fn())[0]?.value).toBe('off');
    expect(matrixOptionSelects({ ...MATRIX, traffic: true }, vi.fn())[0]?.value).toBe('on');
  });

  it('지점·차량 제원은 그대로 두고 교통만 불리언으로 갈아 끼운다', () => {
    const apply = choose(MATRIX, 'on');

    expect(apply.mock.calls[0]?.[0]).toEqual({ ...MATRIX, traffic: true });
  });

  it('미반영으로 되돌리면 false를 보낸다', () => {
    const apply = choose({ ...MATRIX, traffic: true }, 'off');

    expect(apply.mock.calls[0]?.[0]).toMatchObject({ traffic: false });
  });
});
