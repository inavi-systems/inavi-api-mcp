// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { InaviMap, InaviNamespace } from '../../ui/src/map/inavi';
import type { ToolPayload } from '../../ui/src/shared/payload';
import { renderSearch } from '../../ui/src/render/search';
import { renderGeocode } from '../../ui/src/render/geocode';
import { renderReverse } from '../../ui/src/render/reverse';
import { renderRoute } from '../../ui/src/render/route';
import { renderBoundary } from '../../ui/src/render/boundary';
import { renderEntryPoints } from '../../ui/src/render/entry-points';
import { renderOptimize } from '../../ui/src/render/optimize';
import { renderMatrix } from '../../ui/src/render/matrix';
import { areaSearchBlockReason, renderInto } from '../../ui/src/render-host';
import { searchToolOf } from '../../ui/src/shared/payload';
import { setLastToolArguments } from '../../ui/src/host/tool-context';
import { createFakeInavi } from './fake-inavi';
import { PIN_COLORS, pinSvgDataUri } from '../../ui/src/render/pin';

/**
 * **결과 종류가 달라도 같아야 하는 것들.**
 *
 * 도구가 열한 종이 되는 동안 렌더러마다 목록·마커·정보창을 따로 짰고, 한쪽을 고치면 다른
 * 쪽이 옛 모양으로 남아 같은 지적이 되풀이됐다. 공통 규칙을 render/result.ts 한 자리로
 * 모은 뒤, **그 규칙이 모든 렌더러에 걸려 있는지를 여기서 한꺼번에** 본다.
 *
 * 새 렌더러를 더하면 아래 표에 한 줄을 더한다. 빠뜨리면 이 파일이 먼저 깨진다.
 */

type Render = (
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
) => {
  coordinates: unknown[];
  listHtml: string;
  summary: string;
};

/** 지점을 핀으로 세우는 결과. 목록 한 줄과 핀이 1:1로 맞는다. */
const PIN_RESULTS: { name: string; render: Render; payload: ToolPayload }[] = [
  {
    name: 'search',
    render: renderSearch,
    payload: {
      data: {
        poi: [
          {
            name1: '판교역',
            dpx: '127.111',
            dpy: '37.395',
            roadname: '경기도 성남시 분당구 판교역로',
            roadjibun: '160',
            address: '경기도 성남시 분당구 백현동',
            jibun: '541',
            catename: '지하철역',
            tel: '031-000-0000',
            distance: 120,
          },
        ],
      },
    },
  },
  {
    name: 'geocode',
    render: renderGeocode,
    payload: {
      data: {
        adm: [
          {
            posx: '127.111',
            posy: '37.395',
            roadname: '경기도 성남시 분당구 판교역로',
            roadjibun: '160',
            postcode: '13494',
          },
        ],
      },
    },
  },
  {
    name: 'entry-points',
    render: renderEntryPoints,
    payload: { data: { entrypoints: [{ x: 127.111, y: 37.395, type: 1, angle: 90 }] } },
  },
  {
    name: 'optimize',
    render: renderOptimize,
    payload: {
      data: {
        optimize: [
          { index: 0, x: 127.111, y: 37.395 },
          { index: 1, x: 127.112, y: 37.396, distance: 400, spend_time: 90 },
        ],
      },
    },
  },
];

/** 지점이 아니라 지표를 적는 결과. 목록은 `.stat-item`만 쓴다. */
const STAT_RESULTS: { name: string; render: Render; payload: ToolPayload }[] = [
  {
    name: 'route',
    render: renderRoute,
    payload: {
      data: {
        distance: 1000,
        spend_time: 600,
        paths: [
          {
            coords: [
              { x: 127.111, y: 37.395 },
              { x: 127.112, y: 37.396 },
            ],
            traffic_color: '#00ff60',
            distance: 1000,
            spend_time: 600,
          },
        ],
      },
    },
  },
  {
    name: 'reverse',
    render: renderReverse,
    payload: {
      data: {
        adm: {
          posx: '127.111',
          posy: '37.395',
          roadname: '경기도 성남시 분당구 판교역로',
          roadjibun: '160',
          bldname: '삼환하이펙스',
        },
      },
    },
  },
  {
    name: 'matrix',
    render: renderMatrix,
    payload: {
      data: {
        origins: ['127.111,37.395'],
        destinations: ['127.112,37.396'],
        rows: [{ elements: [{ distance: { value: 1000 }, duration: { value: 600 } }] }],
      },
    },
  },
];

function listOf(html: string): HTMLUListElement {
  const list = document.createElement('ul');
  list.innerHTML = html;
  return list;
}

describe('목록 한 줄은 어느 결과든 같은 마크업이다', () => {
  it.each(PIN_RESULTS)('$name', ({ render, payload }) => {
    const { inavi, map } = createFakeInavi();

    const list = listOf(render(inavi, map, payload).listHtml);
    const items = [...list.querySelectorAll<HTMLElement>('.result-item[data-pick-lng]')];

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      // 순번 배지 · 본문 · 경로로 고를 좌표. 셋은 render/result.ts가 한 번만 짠다.
      const badge = item.querySelector('.result-index');
      expect(badge).not.toBeNull();
      // 마커를 세우는 결과이므로 배지에도 그림이 깔린다 (동그라미로 두는 `is-plain`이 아니다).
      expect(badge?.classList.contains('is-plain')).toBe(false);
      // **번호는 지도 마커를 따른다.** 번호 핀이면 배지에도 숫자가 있고, 번호가 없는
      // 화살표 마커(진출입 지점)면 배지에도 없다. 둘이 어긋나면 같은 그림으로 안 읽힌다.
      const numbered = !badge?.classList.contains('is-arrow');
      expect(Boolean(badge?.querySelector('b')?.textContent)).toBe(numbered);
      // 배지에는 **지도 마커와 같은 그림**이 깔리고 글자는 핀과 같은 색이다.
      const style = badge?.getAttribute('style') ?? '';
      // 따옴표를 두르면 `style="...url("data:...")"`에서 속성이 끊긴다.
      expect(style).toContain('background-image:url(data:image/svg+xml');
      expect(style).toMatch(/color:#[0-9A-Fa-f]{6}/);
      expect(item.querySelector('.result-body strong')).not.toBeNull();
      // **이름·주소만 펴 두고 나머지는 접는다.** 어느 결과든 같은 규칙이다 — 목록은
      // 어느 것을 고를지 훑는 자리이고, 분류·전화·거리·좌표는 고른 뒤에 보는 값이다.
      const detail = item.querySelector<HTMLElement>('.result-detail');
      const more = item.querySelector<HTMLElement>('[data-detail]');
      expect(detail?.hidden ?? true).toBe(true);
      // 접을 것이 있을 때만 손잡이를 만든다. 둘은 늘 짝이다.
      expect(Boolean(more)).toBe(Boolean(detail));
      expect(more?.textContent ?? '상세').toBe('상세');
      expect(Number(item.dataset.pickLat)).toBeTypeOf('number');
      expect(item.dataset.pickName).toBeTruthy();
      // 핀이 선 자리. 경로에 넘길 좌표(`pick`)와 다를 수 있어 따로 싣는다 (map-picks.ts).
      expect(Number(item.dataset.pinLat)).toBeTypeOf('number');
    }
  });

  it('행정구역 경계는 핀을 세우지 않지만 목록 줄은 같은 모양이다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderBoundary(inavi, map, {
      data: {
        polygondata: [
          {
            admincode: '41135109',
            polygonlist: [
              {
                polygon: [
                  { x: 127.1, y: 37.4 },
                  { x: 127.2, y: 37.5 },
                ],
              },
            ],
          },
        ],
      },
    });

    // 면이 곧 결과다. 그 위에 핀까지 세우면 경계가 가려진다.
    expect(markers).toHaveLength(0);
    const item = listOf(result.listHtml).querySelector('.result-item');
    const badge = item?.querySelector('.result-index');
    expect(badge).not.toBeNull();
    // 가리킬 마커가 없으므로 순번 배지를 동그라미로 둔다.
    expect(badge?.classList.contains('is-plain')).toBe(true);
    expect(badge?.querySelector('b')?.textContent).toBe('1');
    expect(badge?.getAttribute('style')).toBeNull();
    expect(item?.querySelector('.result-body strong')?.textContent).toBe('41135109');
  });

  it('지표 나열도 목록과 같은 규칙으로 접는다', () => {
    // 훑는 데 쓰는 값만 펴 둔다 — 경로는 거리·시간·요금이고, 탐색 옵션·택시 요금·예측
    // 시각은 고른 뒤에 보는 값이다 (261016 리뷰 후속).
    const { inavi, map } = createFakeInavi();
    const route = STAT_RESULTS.find((result) => result.name === 'route');
    const list = listOf(route!.render(inavi, map, route!.payload).listHtml);

    const hidden = [...list.querySelectorAll<HTMLElement>('.stat-item.is-detail')];
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((row) => row.hidden)).toBe(true);
    // 접을 것이 있을 때만 손잡이를 만든다. 둘은 늘 짝이다.
    expect(list.querySelector('[data-stat-detail]')?.textContent).toBe('상세');

    const open = [...list.querySelectorAll<HTMLElement>('.stat-item:not(.is-detail)')]
      .filter((row) => !row.classList.contains('stat-more'))
      .map((row) => row.querySelector('.stat-label')?.textContent);
    expect(open).toContain('총 거리');
    expect(open).toContain('예상 소요 시간');
    expect(open).not.toContain('탐색 옵션');
  });

  it.each(STAT_RESULTS)('$name은 지표 나열이라 .stat-item만 쓴다', ({ render, payload }) => {
    const { inavi, map } = createFakeInavi();

    const list = listOf(render(inavi, map, payload).listHtml);

    expect(list.querySelectorAll('.stat-item').length).toBeGreaterThan(0);
    // 예전에는 리버스 지오코딩만 `result-item stat-item`을 함께 달아 혼자 여백·호버가 달랐다.
    expect(list.querySelectorAll('.result-item')).toHaveLength(0);
    // 접고 펴는 손잡이는 값이 아니라 손잡이다. 지표 줄에서 세지 않는다.
    for (const row of list.querySelectorAll('.stat-item:not(.stat-more)')) {
      expect(row.querySelector('.stat-label')).not.toBeNull();
      // 묶음의 머리글은 값이 없다 — 거리 행렬이 출발지를 한 번만 적을 때 쓴다.
      if (!row.classList.contains('is-heading')) {
        expect(row.querySelector('.stat-value')).not.toBeNull();
      }
    }
  });
});

describe('목록 배지는 지도 마커와 같은 그림을 쓴다', () => {
  it('검색 결과의 배지 그림이 장소 핀 그림과 글자까지 같다', () => {
    const { inavi, map } = createFakeInavi();

    const list = listOf(renderSearch(inavi, map, PIN_RESULTS[0]!.payload).listHtml);
    const style = list.querySelector('.result-index')?.getAttribute('style') ?? '';

    // 흉내 낸 모양이 아니라 render/pin.ts가 만든 **바로 그 그림**이어야 한다.
    expect(style).toContain(pinSvgDataUri(PIN_COLORS.place));
    expect(style).toContain(`color:${PIN_COLORS.place}`);
  });

  it('그림이 사는 칸(viewBox)은 32×44 그대로고 화면 크기만 줄인다', () => {
    // 물방울 경로가 32×44 좌표로 그려져 있다. `viewBox`까지 줄이면 **작아지는 대신
    // 왼쪽 위만 남고 잘린다** — 지도 핀과 목록 배지가 한꺼번에 깨졌다 (실기 피드백).
    const svg = decodeURIComponent(pinSvgDataUri(PIN_COLORS.place).split(',')[1] ?? '');

    expect(svg).toContain('viewBox="0 0 32 44"');
    expect(svg).toMatch(/width="\d+" height="\d+"/);
    expect(svg).not.toContain('width="32" height="44"');
  });

  it('그림 주소에 생따옴표가 없다 — 있으면 CSS가 값을 통째로 버린다', () => {
    // `encodeURIComponent`는 작은따옴표를 인코딩하지 않는다. SVG 속성을 작은따옴표로 적으면
    // 따옴표 없는 `url(...)` 안에서 값이 무시돼 배지 그림이 사라진다 (실기에서 확인).
    const uri = pinSvgDataUri(PIN_COLORS.place);

    expect(uri).not.toMatch(/['"()]/);
  });
});

describe('핀을 세우는 결과는 모두 같은 정보창을 띄운다', () => {
  it.each([...PIN_RESULTS, ...STAT_RESULTS])('$name', ({ name, render, payload }) => {
    const { inavi, map, markers, infoWindowContents, clusterHandlers } = createFakeInavi();

    render(inavi, map, payload);
    expect(markers.length).toBeGreaterThan(0);

    if (name === 'search') {
      // 뭉쳐 올린 결과는 핀 노드가 복제되어 클러스터러 이벤트로 받는다 (marker-link.ts).
      clusterHandlers.get('mouseenter')?.({
        target: { id: 'cluster_1_0s' },
        lngLat: { lng: 127.111, lat: 37.395 },
      });
    } else {
      const icon = markers[0]?.icon;
      expect(icon).toBeInstanceOf(HTMLElement);
      (icon as HTMLElement).dispatchEvent(new Event('mouseenter'));
    }

    // 정보창 카드는 info-card.ts 한 벌뿐이다. 겉모양이 어긋나면 여기서 먼저 걸린다.
    expect(infoWindowContents[0]).toContain('class="iw"');
    expect(infoWindowContents[0]).toContain('iw-title');
  });
});

describe('영역 검색 잠금은 "어느 도구에서 온 결과인가"로 정한다', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.className = '';
    document.body.innerHTML = `
      <div class="layout">
        <div id="map-host"></div>
        <div class="panel" id="panel"><div id="summary"></div><ul id="result-list"></ul></div>
        <p id="collapsed-note" hidden></p>
      </div>`;
  });

  /** SDK는 테스트에서 뜨지 않는다. 결과를 받아 둔 상태까지만 만들면 판정은 확인할 수 있다. */
  const show = async (kind: string, data: ToolPayload['data']) => {
    await renderInto({ data }, { kind });
  };

  it('통합 검색 결과에서는 열려 있다', async () => {
    await show('search', { poi: [{ name1: '판교역', dpx: '127.111', dpy: '37.395' }] });

    expect(areaSearchBlockReason()).toBeUndefined();
  });

  it('주변 분류 검색에는 물려받을 검색어가 없어 막는다', async () => {
    // 결과 모양이 통합검색과 같아 같은 렌더러를 쓴다. 그래도 분류 코드로 찾는 다른 도구다.
    await show('nearby', { poi: [{ name1: '주유소', dpx: '127.111', dpy: '37.395' }] });

    expect(areaSearchBlockReason()).toBeTruthy();
  });

  it('행정구역 경계 조회도 막는다 — 입력의 `query`는 찾을 말이 아니라 구역 이름이다', async () => {
    // 도구 인자의 필드 이름으로 갈랐다가 여기서 뚫렸다. 경계 조회의 `query`는
    // "성남시 분당구"라 장소 검색에 그대로 넘기면 `100 Result Not Found`가 온다 (실기 피드백).
    setLastToolArguments({ query: '성남시 분당구', level: 'sigungu' });
    await show('boundary', { polygondata: [] });

    expect(areaSearchBlockReason()).toBeTruthy();
  });

  it('쪽 넘기기는 결과를 만든 검색 도구를 다시 부른다 — 장소 목록이 아니면 없다', () => {
    expect(searchToolOf({ kind: 'search' })).toBe('search_places');
    expect(searchToolOf({ kind: 'nearby' })).toBe('search_nearby_category');
    expect(searchToolOf({ kind: 'geocode' })).toBe('geocode_address');
    expect(searchToolOf({ kind: 'reverse' })).toBeUndefined();
    expect(searchToolOf({ kind: 'boundary' })).toBeUndefined();
    expect(searchToolOf({ kind: 'route' })).toBeUndefined();
  });

  it('경로 탐색 결과에서도 막는다', async () => {
    await show('route', { paths: [] });

    expect(areaSearchBlockReason()).toBeTruthy();
  });
});
