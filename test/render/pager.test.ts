// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pageTotal, renderPager } from '../../ui/src/panel/pager';

/**
 * 쪽 넘기기 — 예전에는 **프롬프트를 다시 적어야만** 다음 결과를 볼 수 있었다 (261016 리뷰).
 */

let host: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '<div id="pager" hidden></div>';
  host = document.getElementById('pager') as HTMLElement;
});

const range = () => document.querySelector('.pager-range')?.textContent;
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.pager-button')];

describe('renderPager', () => {
  it('한 쪽에 다 들어오면 만들지 않는다', () => {
    // 알려 주는 것 없이 자리만 차지한다.
    renderPager(host, { start: 0, count: 30, total: 12, onMove: vi.fn() });

    expect(host.hidden).toBe(true);
    expect(buttons()).toHaveLength(0);
  });

  it('사람이 세는 번호(1부터)로 지금 쪽을 적는다', () => {
    renderPager(host, { start: 20, count: 20, total: 263, onMove: vi.fn() });

    expect(host.hidden).toBe(false);
    expect(range()).toBe('21–40 / 263건');
  });

  it('첫 쪽에서는 이전이 눌리지 않는다', () => {
    renderPager(host, { start: 0, count: 20, total: 263, onMove: vi.fn() });

    expect(buttons()[0]?.disabled).toBe(true);
    expect(buttons()[1]?.disabled).toBe(false);
  });

  it('마지막 쪽에서는 다음이 눌리지 않는다', () => {
    // 끝에서 한 번 더 부르면 빈 결과가 오고 "결과 없음"이 뜬다 — 넘어간 것도 아닌 상태다.
    renderPager(host, { start: 260, count: 20, total: 263, onMove: vi.fn() });

    expect(range()).toBe('261–263 / 263건');
    expect(buttons()[1]?.disabled).toBe(true);
  });

  it('쪽을 넘기면 시작 번호로 다시 부른다', () => {
    const onMove = vi.fn();
    renderPager(host, { start: 20, count: 20, total: 263, onMove });

    buttons()[1]?.click();
    expect(onMove).toHaveBeenLastCalledWith(40);

    buttons()[0]?.click();
    expect(onMove).toHaveBeenLastCalledWith(0);
  });

  it('값이 없으면 자리를 비운다', () => {
    renderPager(host, { start: 0, count: 20, total: 263, onMove: vi.fn() });
    renderPager(host, undefined);

    expect(host.hidden).toBe(true);
    expect(host.innerHTML).toBe('');
  });
});

describe('pageTotal', () => {
  it('지오코딩은 totalcount로 센다 — admtotalcount는 이번에 받은 건수다', () => {
    // `남양` 10건 요청의 실제 응답 (2026-10-20). admtotalcount를 믿으면 쪽 넘김 줄이 사라진다.
    const data = { totalcount: 17, admtotalcount: 10, admcount: 10 };

    expect(pageTotal(data, 'address', 'geocode_address')).toBe(17);
  });

  it('통합 검색은 보고 있는 종류의 것으로 센다', () => {
    const data = { totalcount: 120, poitotalcount: 100, admtotalcount: 20 };

    expect(pageTotal(data, 'place', 'search_places')).toBe(100);
    expect(pageTotal(data, 'address', 'search_places')).toBe(20);
  });

  it('종류별 건수가 없으면 totalcount로 센다 — 주변 분류 검색', () => {
    expect(pageTotal({ totalcount: 119 }, 'place', 'search_nearby_category')).toBe(119);
  });
});
