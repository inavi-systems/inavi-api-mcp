// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  routeOptionSelects,
  walkingOptionSelects,
  type RouteArguments,
  type WalkingArguments,
} from '../../ui/src/rail/route-options';
import { mountMapRail } from '../../ui/src/rail/map-rail';

/**
 * 레일의 고르는 줄 — **자동차 경로 편** (route-options.ts).
 *
 * 가르는 기준은 통합 검색과 같다 (261016 리뷰). 출발·도착·경유지는 필수라 `대화로` 넘기고,
 * 탐색 기준과 차종만 여기서 바꾼다.
 */

const ROUTE: RouteArguments = {
  startX: 127.11,
  startY: 37.4,
  endX: 127.02,
  endY: 37.49,
  option: 'free_road',
  carType: 3,
};

const mount = (selects = routeOptionSelects(ROUTE, () => undefined)) => {
  document.body.innerHTML = '<div id="map-host"></div>';
  mountMapRail(document.getElementById('map-host') as HTMLElement, {
    onStyleChange: () => undefined,
    selects,
  });
  document.querySelector<HTMLElement>('[data-rail="panel"]')?.click();
};

const choose = (option: string, value: string) => {
  const field = [...document.querySelectorAll<HTMLSelectElement>('.option-select')].find(
    (select) => select.previousElementSibling?.textContent === option,
  );
  if (!field) throw new Error(`없는 줄: ${option}`);
  field.value = value;
  field.dispatchEvent(new Event('change'));
};

describe('routeOptionSelects', () => {
  it('바꿀 수 있는 것은 탐색 기준과 차종뿐이다', () => {
    expect(routeOptionSelects(ROUTE, vi.fn()).map((select) => select.label)).toEqual([
      '탐색',
      '차종',
    ]);
  });

  it('지금 값을 고른 것으로 보인다', () => {
    const [search, car] = routeOptionSelects(ROUTE, vi.fn());

    expect(search?.value).toBe('free_road');
    expect(car?.value).toBe('3');
  });

  it('인자에 없으면 도구 기본값이 고른 것으로 보인다', () => {
    const [search, car] = routeOptionSelects({ startX: 127 }, vi.fn());

    expect(search?.value).toBe('default');
    expect(car?.value).toBe('1');
  });

  it('출발·도착은 그대로 두고 옵션만 갈아 끼운다', () => {
    const apply = vi.fn();
    mount(routeOptionSelects(ROUTE, apply));

    choose('탐색', 'highway');

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      startX: 127.11,
      endY: 37.49,
      option: 'highway',
      carType: 3,
    });
  });

  it('차종은 숫자로 넘긴다 — 도구가 숫자를 받는다', () => {
    const apply = vi.fn();
    mount(routeOptionSelects(ROUTE, apply));

    choose('차종', '6');

    expect(apply.mock.calls[0]?.[0]).toMatchObject({ carType: 6 });
  });

  it('줄이 둘이어도 꼬리표가 제 칸을 가리킨다', () => {
    // id가 겹치면 꼬리표를 눌렀을 때 엉뚱한 칸이 열린다.
    mount();

    const ids = [...document.querySelectorAll<HTMLSelectElement>('.option-select')].map(
      (select) => select.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * 도보 편. 자동차와 옵션 체계가 달라 줄도 따로다 (walking.tool.ts).
 */
const WALK: WalkingArguments = {
  startX: 127.11,
  startY: 37.4,
  endX: 127.1,
  endY: 37.41,
  mode: 'pm',
  option: 'easy',
};

describe('walkingOptionSelects', () => {
  it('바꿀 수 있는 것은 이동 수단과 탐색 기준뿐이다', () => {
    expect(walkingOptionSelects(WALK, vi.fn()).map((select) => select.label)).toEqual([
      '이동',
      '탐색',
    ]);
  });

  it('지금 값을 고른 것으로 보인다', () => {
    const [mode, option] = walkingOptionSelects(WALK, vi.fn());

    expect(mode?.value).toBe('pm');
    expect(option?.value).toBe('easy');
  });

  it('인자에 없으면 도구 기본값이 고른 것으로 보인다', () => {
    const [mode, option] = walkingOptionSelects({ startX: 127 }, vi.fn());

    expect(mode?.value).toBe('walk');
    expect(option?.value).toBe('recommended');
  });

  it('이동 수단은 도구가 받는 두 값뿐이다 — 자전거는 pm에 들어 있다', () => {
    const [mode] = walkingOptionSelects(WALK, vi.fn());

    expect(mode?.choices.map((choice) => choice.value)).toEqual(['walk', 'pm']);
  });

  it('출발·도착은 그대로 두고 옵션만 갈아 끼운다', () => {
    const apply = vi.fn();
    mount(walkingOptionSelects(WALK, apply));

    choose('탐색', 'main_road');

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      startX: 127.11,
      endY: 37.41,
      mode: 'pm',
      option: 'main_road',
    });
  });

  it('이동 수단을 바꿔도 탐색 기준은 그대로다', () => {
    const apply = vi.fn();
    mount(walkingOptionSelects(WALK, apply));

    choose('이동', 'walk');

    expect(apply.mock.calls[0]?.[0]).toMatchObject({ mode: 'walk', option: 'easy' });
  });
});
