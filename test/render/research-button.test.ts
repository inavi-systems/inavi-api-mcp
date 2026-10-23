// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountResearchButton } from '../../ui/src/rail/research-button';
import { createFakeInavi, FAKE_BOUNDS } from './fake-inavi';
import type { InaviBounds } from '../../ui/src/map/inavi';

/**
 * `현재 지도에서 재검색` — 지도 아래 가운데의 알약 버튼.
 *
 * 레일의 접힌 목록 안에 있던 것을 꺼냈다. 지도를 옮기는 일과 다시 찾는 일은 한 동작처럼
 * 이어져야 한다. **처음 화면의 네 귀와 견주어 한 변이라도 어긋나면** 뜬다 (261016 리뷰 후속).
 */

/** 화면의 1/4만큼 동쪽으로 민 화면. 가장자리에 찾지 않은 데가 들어온다. */
const MOVED: InaviBounds = {
  south: FAKE_BOUNDS.south,
  north: FAKE_BOUNDS.north,
  west: FAKE_BOUNDS.west + 0.005,
  east: FAKE_BOUNDS.east + 0.005,
};

/** 손이 떨린 정도(폭의 2.5%). 같은 화면으로 본다. */
const NUDGED: InaviBounds = {
  south: FAKE_BOUNDS.south + 0.0005,
  north: FAKE_BOUNDS.north + 0.0005,
  west: FAKE_BOUNDS.west + 0.0005,
  east: FAKE_BOUNDS.east + 0.0005,
};

/** 세 배 넓게 본 화면. 찾지 않은 데가 화면의 대부분이다. */
const ZOOMED_OUT: InaviBounds = {
  south: FAKE_BOUNDS.south - 0.02,
  north: FAKE_BOUNDS.north + 0.02,
  west: FAKE_BOUNDS.west - 0.02,
  east: FAKE_BOUNDS.east + 0.02,
};

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="map-host"></div>';
  host = document.getElementById('map-host') as HTMLElement;
  // `fitCoordinates`가 화면을 맞추는 동안을 지나친 뒤부터 센다 (research-button.ts).
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const button = () => document.querySelector<HTMLElement>('.research-button');
const visible = () => button()?.classList.contains('is-visible') ?? false;

/** 화면 맞추기가 끝난 뒤로 시계를 돌린다. */
const settled = () => vi.advanceTimersByTime(1000);

describe('mountResearchButton', () => {
  it('지도를 움직이기 전에는 보이지 않는다', () => {
    // 늘 떠 있으면 방금 받은 결과를 두고도 다시 찾으라고 권하는 꼴이다.
    const { map } = createFakeInavi();
    mountResearchButton(host, map, { onClick: vi.fn() });

    expect(button()).not.toBeNull();
    expect(visible()).toBe(false);
  });

  it('그리면서 화면을 맞추는 움직임은 세지 않는다', () => {
    // 결과가 뜨자마자 버튼이 따라 뜨면 "방금 찾은 걸 또 찾으라"는 말이 된다.
    const fake = createFakeInavi();
    mountResearchButton(host, fake.map, { onClick: vi.fn() });

    fake.moveMap(MOVED);

    expect(visible()).toBe(false);
  });

  it('화면이 처음 자리에서 밀리면 뜬다', () => {
    const fake = createFakeInavi();
    mountResearchButton(host, fake.map, { onClick: vi.fn() });
    settled();

    fake.moveMap(MOVED);

    expect(visible()).toBe(true);
  });

  it('손이 떨린 정도로는 뜨지 않는다', () => {
    // 1~2px 밀린 것까지 띄우면 깜빡인다.
    const fake = createFakeInavi();
    mountResearchButton(host, fake.map, { onClick: vi.fn() });
    settled();

    fake.moveMap(NUDGED);

    expect(visible()).toBe(false);
  });

  it('훨씬 넓게 보면 뜬다 — 찾지 않은 데가 화면의 대부분이다', () => {
    const fake = createFakeInavi();
    mountResearchButton(host, fake.map, { onClick: vi.fn() });
    settled();

    fake.moveMap(ZOOMED_OUT);

    expect(visible()).toBe(true);
  });

  it('되돌아오면 다시 숨는다', () => {
    const fake = createFakeInavi();
    mountResearchButton(host, fake.map, { onClick: vi.fn() });
    settled();

    fake.moveMap(MOVED);
    fake.moveMap(FAKE_BOUNDS);

    expect(visible()).toBe(false);
  });

  it('누르면 다시 찾고 스스로 숨는다', () => {
    // 같은 자리를 다시 찾으라고 또 권하지 않는다.
    const fake = createFakeInavi();
    const onClick = vi.fn();
    mountResearchButton(host, fake.map, { onClick });
    settled();
    fake.moveMap(MOVED);

    button()?.click();

    expect(onClick).toHaveBeenCalledOnce();
    expect(visible()).toBe(false);
  });

  it('걷으면 버튼도 핸들러도 남지 않는다', () => {
    // 지도를 다시 만들 때마다 갈아 끼운다. 남으면 옛 지도의 영역으로 찾는다.
    const fake = createFakeInavi();
    const mounted = mountResearchButton(host, fake.map, { onClick: vi.fn() });

    mounted.destroy();

    expect(button()).toBeNull();
    expect(fake.moveHandlers.size).toBe(0);
  });

  it('두 번 얹어도 버튼은 하나다', () => {
    const fake = createFakeInavi();
    mountResearchButton(host, fake.map, { onClick: vi.fn() });
    mountResearchButton(host, fake.map, { onClick: vi.fn() });

    expect(document.querySelectorAll('.research-button')).toHaveLength(1);
  });
});
