// @vitest-environment happy-dom
import { enveloped } from './envelope';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import routeFixture from '../fixtures/route.response.json';
import searchFixture from '../fixtures/search.response.json';

import { rectanglePath, toSearchArea } from '../../ui/src/host/tool-context';
import { drawSearchArea } from '../../ui/src/map/overlays';
import { findNearestSegment, segmentRows, trafficLabel } from '../../ui/src/render/route-segments';
import { renderRoute } from '../../ui/src/render/route';
import { attachDetailToggles } from '../../ui/src/panel/result-detail';
import { renderSearch } from '../../ui/src/render/search';
import { mountResultFilters, type ResultFilterOptions } from '../../ui/src/panel/controls';
import { markActiveMode, mountMapRail, type MapRailOptions } from '../../ui/src/rail/map-rail';
import { applyStoredMapStyle, MAP_STYLES } from '../../ui/src/map/map-style';
import { createFakeInavi } from './fake-inavi';

const routePayload = enveloped(routeFixture, 'unwrap');
const searchPayload = enveloped(searchFixture, 'rename');

describe('toSearchArea (도구 인자 → 지도에 그릴 영역)', () => {
  it('반경 검색(area=radius)은 원이 된다. m로 온 반경을 km로 바꾼다', () => {
    const area = toSearchArea({ area: 'radius', x1: 127.1, y1: 37.4, radius: 500 });

    expect(area).toEqual({ kind: 'circle', center: [127.1, 37.4], radiusKm: 0.5 });
  });

  it('사각 검색(area=bbox)은 좌상단·우하단으로 닫힌 사각형이 된다', () => {
    const area = toSearchArea({ area: 'bbox', x1: 127.0, y1: 37.5, x2: 127.2, y2: 37.3 });

    expect(area?.kind).toBe('polygon');
    // 첫 점과 끝 점이 같아야 도형이 닫힌다.
    const path = area?.kind === 'polygon' ? area.path : [];
    expect(path[0]).toEqual([127.0, 37.5]);
    expect(path[path.length - 1]).toEqual([127.0, 37.5]);
    expect(path).toHaveLength(5);
  });

  it('API 이름(spopt)은 읽지 않는다 — 호스트가 주는 것은 도구 인자(area)다', () => {
    // `spopt`만 보고 있어서 검색 영역이 한 번도 그려지지 않았던 자리다. 도구 입력에는 없다.
    expect(toSearchArea({ spopt: '2', x1: 127.1, y1: 37.4, radius: 500 } as never)).toBeUndefined();
  });

  it('전체 검색이거나 좌표가 모자라면 그릴 영역이 없다', () => {
    expect(toSearchArea({ x1: 127.1, y1: 37.4 })).toBeUndefined();
    expect(toSearchArea({ area: 'radius', x1: 127.1, y1: 37.4 })).toBeUndefined();
    expect(toSearchArea({ area: 'bbox', x1: 127.1, y1: 37.4 })).toBeUndefined();
    expect(toSearchArea({})).toBeUndefined();
  });
});

describe('drawSearchArea', () => {
  it('원 영역은 Circle로, 사각 영역은 Polygon으로 그린다', () => {
    const { inavi, map, shapes } = createFakeInavi();

    drawSearchArea(inavi, map, { kind: 'circle', center: [127.1, 37.4], radiusKm: 0.5 });
    drawSearchArea(inavi, map, { kind: 'polygon', path: rectanglePath(127, 37.5, 127.2, 37.3) });

    expect(shapes.map((shape) => shape.kind)).toEqual(['circle', 'polygon']);
    expect(shapes[0]?.radius).toBe(0.5);
    // 요청으로 온 영역이든 사용자가 그린 영역이든 같은 "검색 범위"다. 색을 가르지 않는다.
    expect(shapes[0]?.style.fillColor).toBe(shapes[1]?.style.fillColor);
  });
});

describe('findNearestSegment (경로 클릭 판정)', () => {
  const paths = routePayload.data?.paths ?? [];

  it('경로 위를 누르면 그 구간을 찾아낸다', () => {
    const first = paths[0]?.coords?.[0];
    expect(first).toBeDefined();

    const hit = findNearestSegment(paths, { lng: first?.x ?? 0, lat: first?.y ?? 0 });

    expect(hit?.path).toBe(paths[0]);
    expect(hit?.meters).toBeLessThan(1);
  });

  it('경로에서 먼 곳을 누르면 아무것도 잡히지 않는다', () => {
    const first = paths[0]?.coords?.[0];

    // 위도로 0.05도면 5km가 넘는다. 허용 범위(80m) 밖이다.
    const hit = findNearestSegment(paths, { lng: first?.x ?? 0, lat: (first?.y ?? 0) + 0.05 });

    expect(hit).toBeUndefined();
  });
});

describe('trafficLabel', () => {
  it('실제 응답에 오는 교통 색상을 사람 말로 바꾼다', () => {
    expect(trafficLabel('#00ff60')).toBe('원활');
    expect(trafficLabel('#fff000')).toBe('서행');
    expect(trafficLabel('#fb3a76')).toBe('정체');
    expect(trafficLabel('#989898')).toBe('정보 없음');
    expect(trafficLabel(undefined)).toBe('정보 없음');
  });
});

describe('segmentRows', () => {
  it('몇 초짜리 구간을 분으로 반올림해 0분으로 뭉개지 않는다', () => {
    const rows = Object.fromEntries(segmentRows({ spend_time: 15, distance: 233, speed: 56 }));

    expect(rows['구간 소요']).toBe('15초');
    expect(rows['평균 속도']).toBe('56km/h');
  });

  it('1분이 넘으면 분으로 보여준다', () => {
    const rows = Object.fromEntries(segmentRows({ spend_time: 137 }));

    expect(rows['구간 소요']).toBe('2분');
  });

  it('속도가 없으면(-1) 줄 자체를 빼서 잘못된 값을 보여주지 않는다', () => {
    const labels = segmentRows({ spend_time: 4, speed: -1 }).map(([label]) => label);

    expect(labels).not.toContain('평균 속도');
  });
});

describe('경로 구간 정보창', () => {
  it('경로 위를 클릭하면 그 구간의 교통 상황을 정보창에 담는다', () => {
    const { inavi, map, mapHandlers, infoWindowContents, infoWindowPositions } = createFakeInavi();
    renderRoute(inavi, map, routePayload);

    const first = routePayload.data?.paths?.[0]?.coords?.[0];
    mapHandlers.get('click')?.({ lngLat: { lng: first?.x ?? 0, lat: first?.y ?? 0 } });

    expect(infoWindowContents[0]).toContain('경로 구간');
    expect(infoWindowContents[0]).toContain('정보 없음'); // 첫 구간은 #989898
    expect(infoWindowPositions).toHaveLength(1);
  });

  it('경로에서 먼 곳을 클릭하면 정보창을 열지 않는다', () => {
    const { inavi, map, mapHandlers, infoWindowContents } = createFakeInavi();
    renderRoute(inavi, map, routePayload);

    mapHandlers.get('click')?.({ lngLat: { lng: 129, lat: 35 } });

    expect(infoWindowContents).toHaveLength(0);
  });
});

describe('검색 결과 인터랙션', () => {
  // 브라우저에서 iNavi를 직접 부르던 주변 조회를 걷어냈다 (queries.ts).
  it('개별 마커 클릭은 지도를 바꾸지 않는다', () => {
    const { inavi, map, clusterHandlers } = createFakeInavi();

    renderSearch(inavi, map, searchPayload);
    clusterHandlers.get('click')?.({
      target: { id: 'cluster_3_2s' },
      lngLat: { lng: 127.1, lat: 37.4 },
    });

    expect(map.flyTo).not.toHaveBeenCalled();
  });

  it('클러스터 클릭은 한 단계 확대다', () => {
    const { inavi, map, clusterHandlers } = createFakeInavi();

    renderSearch(inavi, map, searchPayload);
    clusterHandlers.get('click')?.({ target: { cluster: true }, lngLat: { lng: 127, lat: 37 } });

    expect(map.flyTo).toHaveBeenCalled();
  });

  it('`상세`를 눌러야 분류·전화·거리가 펴진다', () => {
    // 한 줄이 다섯 행이라 한 화면에 두 줄 반밖에 들어가지 않았다 (실기 피드백).
    const { inavi, map } = createFakeInavi();
    const result = renderSearch(inavi, map, searchPayload);

    document.body.innerHTML = `
      <div id="map-host"></div>
      <div class="panel"><div id="summary"></div><ul id="result-list"></ul></div>`;
    const list = document.getElementById('result-list') as HTMLElement;
    list.innerHTML = result.listHtml;
    attachDetailToggles(list);

    const detail = list.querySelector<HTMLElement>('.result-detail');
    const more = list.querySelector<HTMLButtonElement>('[data-detail]');
    expect(detail?.hidden).toBe(true);

    more?.click();
    expect(detail?.hidden).toBe(false);
    expect(more?.textContent).toBe('접기');

    more?.click();
    expect(detail?.hidden).toBe(true);
    expect(more?.textContent).toBe('상세');
  });

  it('결과 항목마다 대화로 보낼 문장을 실어 둔다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderSearch(inavi, map, searchPayload);
    document.body.innerHTML = `<ul>${result.listHtml}</ul>`;

    const buttons = document.querySelectorAll<HTMLElement>('[data-send]');
    expect(buttons).toHaveLength(result.coordinates.length);
    expect(buttons[0]?.dataset.send).toContain(searchPayload.data?.poi?.[0]?.name1 ?? '');
  });
});

describe('지도 조작 UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="map-host"></div><div id="filter-host"></div>';
  });

  /** ①③ 지도 위 레일. 지도 컨테이너를 받는다 (SDK 컨트롤 컨테이너를 그 안에서 찾는다). */
  const mountRail = (extra: Partial<MapRailOptions> = {}) =>
    mountMapRail(document.getElementById('map-host') as HTMLElement, {
      onStyleChange: () => undefined,
      ...extra,
    });

  /** ② 결과 좁히기. 사이드바 안에 따로 붙는다. */
  const mountFilters = (extra: ResultFilterOptions = {}) =>
    mountResultFilters(document.getElementById('filter-host') as HTMLElement, extra);

  const click = (selector: string) => document.querySelector<HTMLElement>(selector)?.click();

  it('보기 설정은 결과 종류와 무관하게 늘 레일에 있다', () => {
    mountRail();

    expect(document.querySelector('[data-rail="style"]')).not.toBeNull();
    expect(document.querySelector('[data-rail="theme"]')).not.toBeNull();
    // 지도 옵션은 넣을 것이 있을 때만 생긴다.
    expect(document.querySelector('[data-rail="panel"]')).toBeNull();
  });

  it('지도에서 하는 일은 접혀 있다가 눌러야 펼쳐진다', () => {
    // 첫 화면에 아이콘을 늘어놓지 않는 것이 이 레일의 핵심이다.
    mountRail({ onRoutePick: () => undefined });

    expect(document.querySelectorAll('.rail-item')).toHaveLength(0);

    click('[data-rail="panel"]');

    const labels = [...document.querySelectorAll('.rail-item')].map((item) => item.textContent);
    expect(labels).toEqual(['경로 만들기']);
  });

  it('아이콘을 눌러도 목록이 열린다', () => {
    // 버튼 안의 SVG를 누르면 event.target이 SVGElement다. 바깥 클릭 판정을 HTMLElement로
    // 좁혀 두었더니 레일 바깥으로 오판해, 버튼이 연 목록을 같은 클릭이 곧바로 닫았다.
    // 여백을 누르면 열리고 아이콘을 누르면 안 열려 "최초 1회만 열린다"처럼 보였다.
    mountRail({ onRoutePick: () => undefined });

    const svg = document.querySelector('[data-rail="panel"] svg');
    svg?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelectorAll('.rail-item')).toHaveLength(1);
  });

  it('레일 바깥을 누르면 목록이 닫힌다', () => {
    mountRail({ onRoutePick: () => undefined });
    click('[data-rail="panel"]');
    expect(document.querySelectorAll('.rail-item')).toHaveLength(1);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelectorAll('.rail-item')).toHaveLength(0);
  });

  it('장소·주소가 둘 다 왔을 때만 전환 스위치를 만든다', () => {
    mountFilters({
      resultViews: {
        selected: 'place',
        counts: { place: 20, address: 1 },
        onChange: () => undefined,
      },
    });

    // 건수는 요약 줄이 말해 준다. 탭에는 종류만 적는다 (실기 피드백).
    const labels = [...document.querySelectorAll('.view-switch-button')].map((b) => b.textContent);
    expect(labels).toEqual(['장소', '주소']);
    expect(document.querySelector('.view-switch-button.is-active')?.textContent).toBe('장소');

    const made = mountFilters({
      resultViews: {
        selected: 'place',
        counts: { place: 20, address: 0 },
        onChange: () => undefined,
      },
    });
    expect(document.querySelector('.view-switch')).toBeNull();
    // 만든 것이 없으면 여닫는 손잡이까지 감출 수 있도록 알려 준다.
    expect(made).toBe(false);
  });

  it('분류 필터는 고를 것이 둘 이상일 때만 만든다', () => {
    const categories = {
      options: ['카페', '편의점'],
      selected: '전체',
      onChange: () => undefined,
    };

    expect(mountFilters({ categories })).toBe(true);
    expect(document.querySelectorAll('select')).toHaveLength(1);

    expect(mountFilters({ categories: { ...categories, options: ['카페'] } })).toBe(false);
    expect(document.querySelectorAll('select')).toHaveLength(0);
  });

  it('지도 클릭 모드 버튼에는 어떤 모드인지 표식을 단다', () => {
    mountRail({ onRoutePick: () => undefined, activeMode: 'route' });
    click('[data-rail="panel"]');

    // 표식은 지도 클릭을 가져가는 모드에만 붙는다. 지금은 경로 만들기 하나다.
    const modes = [...document.querySelectorAll<HTMLElement>('[data-mode]')].map(
      (item) => item.dataset.mode,
    );
    expect(modes).toEqual(['route']);
    expect(document.querySelector('[data-mode].is-active')?.getAttribute('data-mode')).toBe(
      'route',
    );
  });

  it('모드를 끄면 눌린 표시도 사라진다', () => {
    // 레일은 결과를 다시 그릴 때만 새로 만든다. 모드는 그 사이에도 바뀌므로
    // 이 통로가 없으면 앞 버튼이 눌린 채로 남는다 (실기에서 발견).
    mountRail({ onRoutePick: () => undefined, activeMode: 'route' });
    click('[data-rail="panel"]');

    markActiveMode('none');

    expect(document.querySelectorAll('[data-mode].is-active')).toHaveLength(0);
  });

  it('모드가 켜져 있으면 목록을 접어도 레일 버튼이 그것을 보인다', () => {
    // 접힌 상태에서 모드가 도는 줄 모르면 지도 클릭이 왜 다르게 먹는지 알 수 없다.
    mountRail({ onRoutePick: () => undefined, activeMode: 'route' });

    expect(document.querySelector('[data-rail="panel"]')?.classList.contains('is-active')).toBe(
      true,
    );

    markActiveMode('none');

    expect(document.querySelectorAll('.is-active')).toHaveLength(0);
  });

  it('영역 재검색은 레일에 없다 — 지도 아래 알약 버튼이 맡는다', () => {
    // 접힌 목록 안에서는 두 번 눌러야 닿았고, 지도를 옮긴 사람이 그 다음에 할 일이 거기
    // 있는 줄 몰랐다 (261016 리뷰 후속 · research-button.ts).
    mountRail({ onRoutePick: () => undefined });
    click('[data-rail="panel"]');

    const actions = [...document.querySelectorAll<HTMLElement>('.rail-item')].map(
      (item) => item.dataset.action,
    );
    expect(actions).toEqual(['route']);
  });

  it('목록에서 누르면 실행된다', () => {
    const onRoutePick = vi.fn();

    mountRail({ onRoutePick });
    click('[data-rail="panel"]');
    click('[data-action="route"]');

    expect(onRoutePick).toHaveBeenCalledOnce();
  });

  it('지도 유형을 고르면 setStyle을 바로 부르지 않고 다시 그리게 한다', () => {
    // 이미 그려 둔 지도에 setStyle을 걸면 마커가 사라진다. 지도를 새로 만들어
    // 스타일을 먼저 입히고 그 위에 다시 그려야 한다.
    const { styleUrls } = createFakeInavi();
    const onStyleChange = vi.fn();
    mountRail({ onStyleChange });

    click('[data-rail="style"]');
    click('[data-style="satellite"]');

    expect(onStyleChange).toHaveBeenCalledOnce();
    expect(styleUrls).toEqual([]);
  });

  it('다시 그릴 때 고른 유형을 그리기 전에 입힌다', () => {
    const fresh = createFakeInavi();

    // 앞 테스트에서 satellite를 골라 둔 상태가 모듈 변수에 남아 있다.
    applyStoredMapStyle(fresh.map);

    expect(fresh.styleUrls).toEqual([MAP_STYLES[1]?.url]);
  });
});
