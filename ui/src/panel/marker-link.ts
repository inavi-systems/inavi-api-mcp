import type { LngLatLike } from '../map/inavi';

/**
 * 목록 ↔ 마커 잇기.
 *
 * 한쪽에 마우스를 올리면 다른 쪽이 함께 도드라지고, **누르면 그쪽으로 간다** —
 * 목록을 누르면 지도가 그 마커로 날아가고, 마커를 누르면 목록이 그 줄로 굴러간다.
 *
 * ## 짝은 "만든 순서"로 맞춘다
 *
 * 렌더러는 저마다 다른 코드로 목록을 짜지만, **핀을 만드는 순서와 목록 항목의 순서가 같다**
 * (검색·지오코딩·경유지 최적화·진출입). 그래서 핀은 `createPinElement`가 만들어질 때
 * 차례로 등록하고, 목록은 `fillPanel`이 꽂은 뒤 `.result-item` 순서로 센다.
 *
 * 개수가 다르면(경로·행렬처럼 목록이 지표 나열인 결과) **아무것도 잇지 않는다** —
 * 엉뚱한 핀을 가리키느니 아무 일도 안 하는 편이 낫다.
 */

const LINKED = 'is-linked';

/**
 * 목록에서 한 줄을 눌렀을 때 당겨 볼 배율.
 *
 * 가운데로 옮기기만 하면 **결과가 몰려 있을 때 어느 핀인지 집어내지 못한다**
 * (실기 피드백 — "이동은 되는데 줌인이 안 된다"). 건물 하나가 구분되는 정도로 당긴다.
 */
const FOCUS_ZOOM = 17;

/**
 * 그 자리로 갈 때 쓸 배율. **이미 더 당겨 본 상태면 그대로 둔다** —
 * 눌렀더니 오히려 멀어지면 고른 곳을 놓친다.
 */
export function focusZoom(current: number): number {
  return Math.max(current, FOCUS_ZOOM);
}

export interface MarkerLinkOptions {
  /** 핀과 같은 순서의 좌표. 목록을 누르면 이 자리로 지도를 옮긴다. */
  positions: LngLatLike[];
  /** 지도를 그 자리로 옮긴다. */
  focusOnMap: (position: LngLatLike) => void;
  /** 접혀 있는 목록을 펼친다. 마커를 눌렀을 때 보여 줄 곳이 있어야 한다. */
  revealList: () => void;
}

let pins: HTMLElement[] = [];
let items: HTMLElement[] = [];
let linkOptions: MarkerLinkOptions | undefined;

/** 결과를 다시 그리기 전에 부른다. 지난 화면의 핀이 섞이지 않게 비운다. */
export function resetMarkerLinks(): void {
  pins = [];
  items = [];
}

/**
 * 핀이 만들어질 때마다 차례로 담는다 (render/pin.ts가 부른다).
 *
 * **번호를 요소에도 적어 둔다.** 클러스터러가 아이콘 노드를 **복제해서** 지도에 올리므로
 * (`icon.cloneNode(true)` — SDK 실물 확인), 우리가 든 원본에 표시를 걸어도 화면의 마커는
 * 그대로다. 복제본은 속성을 함께 데려가니, 그 번호로 **화면에 있는 쪽**을 찾는다.
 */
export function registerMarkerPin(pin: HTMLElement): void {
  pin.dataset.pinIndex = String(pins.length);
  pins.push(pin);
}

/**
 * 목록이 다 꽂힌 뒤에 부른다. 개수가 맞을 때만 양쪽을 잇는다.
 *
 * @returns 이었으면 참.
 */
export function linkMarkersToList(list: HTMLElement, options?: MarkerLinkOptions): boolean {
  items = [...list.querySelectorAll<HTMLElement>('.result-item')];
  linkOptions = options;

  items.forEach((item, index) => {
    item.dataset.index = String(index);
  });

  if (pins.length === 0 || pins.length !== items.length) {
    items = [];
    linkOptions = undefined;
    return false;
  }

  attachListListeners(list);
  pins.forEach((pin, index) => {
    pin.addEventListener('mouseenter', () => {
      highlight(index, 'map');
    });
    pin.addEventListener('mouseleave', () => {
      highlight(undefined, 'map');
    });
    // 클러스터를 쓰는 렌더러에서는 이 리스너가 돌지 않는다 — `focusFromMap` 주석 참고.
    pin.addEventListener('click', () => {
      focusFromMap(index);
    });
  });
  return true;
}

/**
 * 지도에서 마커를 눌렀을 때. 접힌 목록을 펼치고 그 줄로 굴린다.
 *
 * **클러스터러는 아이콘 노드를 복제해서 지도에 올린다**(`icon.cloneNode(true)` — SDK 실물
 * 확인). 그래서 우리가 원본 핀에 건 클릭 리스너는 화면의 마커에서 영영 일어나지 않는다.
 * 클러스터를 쓰는 렌더러는 **클러스터러의 이벤트**에서 이 함수를 부른다 (render/result.ts).
 */
export function focusFromMap(index: number): void {
  linkOptions?.revealList();
  highlight(index, 'map');
}

/**
 * 한 쌍을 도드라지게 한다. 번호가 없으면 모두 푼다.
 *
 * @param from 어디서 일어난 일인지. 지도에서 왔을 때만 목록을 그 자리로 굴린다 —
 *             목록에서 마우스를 움직이는데 목록이 스스로 굴러가면 따라가기 어렵다.
 */
export function highlight(index: number | undefined, from: 'map' | 'list'): void {
  paintPins(index);
  items.forEach((item, at) => {
    item.classList.toggle(LINKED, at === index);
  });

  if (index === undefined || from !== 'map') return;
  items[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * 목록 **항목이 아니라 목록에** 위임해 건다. 항목은 결과마다 통째로 다시 꽂히기 때문이다
 * (`대화로` 버튼과 같은 방식). 어느 항목인지는 `data-index`에서 읽는다.
 *
 * 건 적이 있는지는 **요소 자신에** 표시한다. 모듈 변수로 두면 목록 요소가 바뀌었을 때
 * 옛 요소에만 걸린 채로 남는다.
 */
function attachListListeners(list: HTMLElement): void {
  if (list.dataset.linkAttached) return;

  list.addEventListener('mouseover', (event) => {
    highlight(indexOf(event.target), 'list');
  });
  list.addEventListener('mouseleave', () => {
    highlight(undefined, 'list');
  });
  list.addEventListener('click', (event) => {
    const target = event.target;
    // `대화로`·`상세` 버튼은 제 할 일이 따로 있다.
    if (target instanceof Element && target.closest('[data-send], [data-detail]')) return;

    const index = indexOf(target);
    if (index === undefined) return;

    highlight(index, 'list');

    // 경로 만들기 모드에서는 목록을 눌러 출발·도착을 고른다. 지도까지 움직이면 방해가 된다.
    if (document.body.classList.contains('route-mode')) return;

    const position = linkOptions?.positions[index];
    if (position) linkOptions?.focusOnMap(position);
  });

  list.dataset.linkAttached = 'true';
}

/**
 * 핀에 표시를 건다. **원본과 복제본 둘 다** 칠한다.
 *
 * 뭉쳐 올린 결과에서는 화면의 마커가 **복제본**이라 원본만 칠해서는 아무 일도 일어나지
 * 않는다(실기 피드백).
 */
function paintPins(index: number | undefined): void {
  const mark = (pin: HTMLElement): void => {
    pin.classList.toggle(LINKED, Number(pin.dataset.pinIndex) === index);
  };

  pins.forEach(mark);
  // 복제본은 우리 손에 없다. 번호로 화면에서 찾는다.
  document.querySelectorAll<HTMLElement>('.map-pin[data-pin-index]').forEach(mark);
}

function indexOf(target: EventTarget | null): number | undefined {
  if (!(target instanceof Element)) return undefined;

  const item = target.closest<HTMLElement>('.result-item[data-index]');
  const index = Number(item?.dataset.index);
  return Number.isInteger(index) ? index : undefined;
}
