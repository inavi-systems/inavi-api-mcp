// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clusterThresholds } from '../../ui/src/render/cluster';
import { createPinElement } from '../../ui/src/render/pin';
import {
  focusFromMap,
  focusZoom,
  highlight,
  linkMarkersToList,
  resetMarkerLinks,
} from '../../ui/src/panel/marker-link';

describe('focusZoom (목록을 눌렀을 때 당겨 볼 배율)', () => {
  it('멀리서 보고 있으면 건물이 구분되는 정도로 당긴다', () => {
    // 가운데로 옮기기만 하면 결과가 몰려 있을 때 어느 핀인지 집어내지 못한다 (실기 피드백).
    expect(focusZoom(13)).toBeGreaterThan(13);
    expect(focusZoom(15)).toBe(focusZoom(13));
  });

  it('이미 더 당겨 봤으면 그대로 둔다 — 눌렀더니 멀어지면 안 된다', () => {
    expect(focusZoom(19)).toBe(19);
  });
});

describe('clusterThresholds (뭉친 개수 → 단계)', () => {
  // `steps`는 개수가 아니라 **전체 중 몇 %가 뭉쳤는지**를 받는다. SDK 기본값은 마커가
  // 수백 개일 때를 가정한 값이라, 47개짜리 결과에서는 7개 뭉친 것도 10%를 넘어 전부
  // 같은 단계로 떨어졌다 — 크기가 다 같아 보이던 이유다 (실기 피드백).
  it('마커 수에 맞춰 문턱을 되돌린다', () => {
    const steps = clusterThresholds(47);

    expect(steps).toHaveLength(4);
    // 20개부터 가장 큰 단계. 47개 중 20개면 약 43%다.
    expect(steps[0]).toBeCloseTo(20 / 47, 5);
    expect(steps[3]).toBeCloseTo(2 / 47, 5);
  });

  it('내림차순을 지킨다 — 마커가 적어 문턱이 겹쳐도', () => {
    for (const total of [2, 3, 6, 12, 47, 100]) {
      const steps = clusterThresholds(total);
      const descending = steps.every(
        (step, index) => index === 0 || step < (steps[index - 1] ?? 1),
      );

      expect({ total, descending, inRange: steps.every((s) => s > 0 && s < 1) }).toEqual({
        total,
        descending: true,
        inRange: true,
      });
    }
  });
});

describe('목록 ↔ 마커 잇기', () => {
  const buildList = (count: number) => {
    const list = document.createElement('ul');
    list.innerHTML = Array.from(
      { length: count },
      (_, i) => `<li class="result-item">${i}</li>`,
    ).join('');
    document.body.append(list);
    return list;
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    resetMarkerLinks();
  });

  it('핀 수와 항목 수가 같을 때만 잇는다', () => {
    createPinElement('1', '#000');
    createPinElement('2', '#000');

    expect(linkMarkersToList(buildList(2))).toBe(true);

    resetMarkerLinks();
    createPinElement('1', '#000');
    // 경로·행렬처럼 목록이 지표 나열이면 짝이 맞지 않는다. 엉뚱한 핀을 가리키지 않는다.
    expect(linkMarkersToList(buildList(3))).toBe(false);
  });

  it('한쪽을 가리키면 양쪽이 함께 도드라진다', () => {
    const pins = [createPinElement('1', '#000'), createPinElement('2', '#000')];
    const list = buildList(2);
    linkMarkersToList(list);

    highlight(1, 'list');

    const items = [...list.querySelectorAll('.result-item')];
    expect(pins[1]?.classList.contains('is-linked')).toBe(true);
    expect(items[1]?.classList.contains('is-linked')).toBe(true);
    expect(pins[0]?.classList.contains('is-linked')).toBe(false);

    highlight(undefined, 'list');
    expect(pins[1]?.classList.contains('is-linked')).toBe(false);
  });

  it('목록을 누르면 지도가 그 마커로 간다', () => {
    const focused: unknown[] = [];
    createPinElement('1', '#000');
    createPinElement('2', '#000');
    const list = buildList(2);

    linkMarkersToList(list, {
      positions: [
        [127.1, 37.4],
        [127.2, 37.5],
      ],
      focusOnMap: (position) => focused.push(position),
      revealList: () => undefined,
    });

    [...list.querySelectorAll<HTMLElement>('.result-item')][1]?.click();

    expect(focused).toEqual([[127.2, 37.5]]);
  });

  it('마커를 누르면 접힌 목록을 펼쳐 그 줄을 보여 준다', () => {
    let revealed = 0;
    const pins = [createPinElement('1', '#000'), createPinElement('2', '#000')];
    const list = buildList(2);

    linkMarkersToList(list, {
      positions: [
        [127.1, 37.4],
        [127.2, 37.5],
      ],
      focusOnMap: () => undefined,
      revealList: () => {
        revealed += 1;
      },
    });

    pins[0]?.click();

    expect(revealed).toBe(1);
    expect([...list.querySelectorAll('.result-item')][0]?.classList.contains('is-linked')).toBe(
      true,
    );
  });

  it('지도 쪽에서 불러도 목록을 펼쳐 그 줄을 가리킨다', () => {
    // 클러스터러는 아이콘 노드를 **복제**해서 올리므로 원본 핀에 건 리스너가 돌지 않는다.
    // 클러스터를 쓰는 렌더러는 클러스터러 이벤트에서 이 통로를 부른다 (render/search.ts).
    let revealed = 0;
    createPinElement('1', '#000');
    createPinElement('2', '#000');
    const list = buildList(2);

    linkMarkersToList(list, {
      positions: [
        [127.1, 37.4],
        [127.2, 37.5],
      ],
      focusOnMap: () => undefined,
      revealList: () => {
        revealed += 1;
      },
    });

    focusFromMap(1);

    expect(revealed).toBe(1);
    expect([...list.querySelectorAll('.result-item')][1]?.classList.contains('is-linked')).toBe(
      true,
    );
  });

  it('목록에 마우스를 올리면 **화면에 있는** 마커가 켜진다', () => {
    // 뭉쳐 올린 결과에서는 클러스터러가 아이콘을 **복제해** 지도에 올린다. 우리가 든 원본만
    // 칠하면 화면에서는 아무 일도 일어나지 않았다 (실기 피드백 — 반대 방향만 돌고 있었다).
    const pins = [createPinElement('1', '#000'), createPinElement('2', '#000')];
    const list = buildList(2);
    linkMarkersToList(list);

    // 지도에 올라간 것은 복제본이다. 원본은 어디에도 붙어 있지 않다.
    const onMap = pins.map((pin) => pin.cloneNode(true) as HTMLElement);
    onMap.forEach((clone) => document.body.append(clone));

    const items = [...list.querySelectorAll<HTMLElement>('.result-item')];
    items[1]?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(onMap[1]?.classList.contains('is-linked')).toBe(true);
    expect(onMap[0]?.classList.contains('is-linked')).toBe(false);
  });

  it('마커에 마우스를 올리면 목록이 따라 켜지고 그 줄로 굴러간다', () => {
    // 켜기만 하면 목록 밖에 있는 줄은 티가 나지 않아 "마커에 올려도 목록이 반응하지
    // 않는다"로 읽힌다 (실기 피드백 — Claude Desktop 기본 지도는 양쪽이 다 된다).
    const pins = [createPinElement('1', '#000'), createPinElement('2', '#000')];
    const list = buildList(2);
    const items = [...list.querySelectorAll<HTMLElement>('.result-item')];
    const scrolled = vi.fn();
    items.forEach((item) => {
      item.scrollIntoView = scrolled;
    });
    linkMarkersToList(list);

    pins[1]?.dispatchEvent(new MouseEvent('mouseenter'));

    expect(items[1]?.classList.contains('is-linked')).toBe(true);
    expect(scrolled).toHaveBeenCalledOnce();
  });
});
