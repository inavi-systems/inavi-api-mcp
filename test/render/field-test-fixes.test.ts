// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import routeFixture from '../fixtures/route.response.json';
import { renderRoute } from '../../ui/src/render/route';
import { renderSearch } from '../../ui/src/render/search';
import { renderBoundary } from '../../ui/src/render/boundary';
import { FIT_PADDING, fitPadding, fitTarget } from '../../ui/src/map/fit-area';
import { enveloped } from './envelope';
import { createFakeInavi } from './fake-inavi';
import { drawSearchArea } from '../../ui/src/map/overlays';
import { BOUNDARY_STYLE } from '../../ui/src/map/map-colors';
import { clusterIconDataUri } from '../../ui/src/render/pin';

/** Claude Desktop 실기 검증에서 드러난 것들을 고정한다. */

const routePayload = enveloped(routeFixture, 'unwrap');

describe('경유지 핀 (F12)', () => {
  // 자동차 경로는 `point_type`에 `V`를 싣지 않는다. 핀은 요청에서 끌어온다.
  it('자동차 경로는 요청한 경유지를 경로 위에 붙여 찍는다', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderRoute(
      inavi,
      map,
      {
        data: {
          paths: [
            {
              point_type: 'S',
              coords: [
                { x: 127.1, y: 37.4 },
                { x: 127.2, y: 37.4 },
              ],
            },
          ],
        },
      },
      // 경로에서 벗어난 요청 좌표. 선 위로 붙여야 한다.
      { vias: [[127.15, 37.405]] },
    );

    expect(markers.map((marker) => marker.title)).toEqual(['출발지', '경유지', '도착지']);
    expect(markers[1]?.position).toEqual([127.15, 37.4]);
  });

  it('요청 경유지가 없으면 point_type으로 찾아본다 (도보 경로)', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderRoute(inavi, map, {
      data: {
        paths: [
          { point_type: 'S', coords: [{ x: 127.1, y: 37.4 }] },
          { point_type: 'V1', coords: [{ x: 127.11, y: 37.41 }] },
          { point_type: 'V2', coords: [{ x: 127.12, y: 37.42 }] },
          { point_type: 'E', coords: [{ x: 127.13, y: 37.43 }] },
        ],
      },
    });

    // 출발 + 경유 2 + 도착
    expect(markers).toHaveLength(4);
    expect(markers.map((marker) => marker.title)).toEqual([
      '출발지',
      '경유지 1',
      '경유지 2',
      '도착지',
    ]);
  });

  it('번호 없는 V도 그대로 센다', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderRoute(inavi, map, {
      data: {
        paths: [
          { point_type: 'S', coords: [{ x: 127.1, y: 37.4 }] },
          { point_type: 'V', coords: [{ x: 127.11, y: 37.41 }] },
          { point_type: 'E', coords: [{ x: 127.12, y: 37.42 }] },
        ],
      },
    });

    expect(markers).toHaveLength(3);
  });

  it('경유지가 없으면 출발·도착만 찍는다', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderRoute(inavi, map, routePayload);

    expect(markers.map((marker) => marker.title)).toEqual(['출발지', '도착지']);
  });
});

describe('경로 요약 줄 (F9·F10·F11)', () => {
  it('고속도로 포함 줄을 만들지 않는다 (서버가 isHighWay를 떼어 낸다)', () => {
    const { inavi, map } = createFakeInavi();

    const rendered = renderRoute(inavi, map, {
      data: { toll_fee: 800, paths: [{ coords: [{ x: 127.1, y: 37.4 }] }] },
    });

    // 고속도로를 14km 달려도 false로 오던 값이라 응답에서 뺐다 (drop-ishighway.ts).
    // 근거가 없으므로 화면에도 줄을 만들지 않는다 — `-`를 적으면 자리만 차지한다.
    expect(rendered.listHtml).not.toContain('고속도로 포함');
  });

  it('통행료는 자동차에만 적는다 — 도보 응답에는 toll_fee가 아예 없다', () => {
    const { inavi, map } = createFakeInavi();
    const paths = [{ coords: [{ x: 127.1, y: 37.4 }] }];

    expect(renderRoute(inavi, map, { data: { toll_fee: 0, paths } }).listHtml).toContain(
      '통행 요금',
    );
    expect(renderRoute(inavi, map, { data: { paths } }).listHtml).not.toContain('통행 요금');
  });

  it('택시 요금을 안 물었으면 0원 줄을 만들지 않고, 두 값은 갈라 적는다', () => {
    const { inavi, map } = createFakeInavi();
    const paths = [{ coords: [{ x: 127.1, y: 37.4 }] }];

    expect(renderRoute(inavi, map, { data: { totalTaxiFare: '0', paths } }).listHtml).not.toContain(
      '택시',
    );

    // `"일반,모범"`을 그대로 찍으면 `6500,11500원`이 되어 한 금액으로 읽힌다 (실기 확인).
    const both = renderRoute(inavi, map, {
      data: { totalTaxiFare: '21100,28600', paths },
    }).listHtml;
    expect(both).toContain('일반 택시');
    expect(both).toContain('21,100원');
    expect(both).toContain('모범 택시');
    expect(both).toContain('28,600원');
    expect(both).not.toContain('21100,28600');

    // 한 칸만 오면 어느 쪽인지 알 수 없어 꼬리표를 붙이지 않는다.
    const one = renderRoute(inavi, map, { data: { totalTaxiFare: '6500', paths } }).listHtml;
    expect(one).toContain('예상 택시 요금');
    expect(one).toContain('6,500원');
  });

  it('탐색 옵션 코드를 읽을 수 있는 말로 바꾸되 모르는 값은 그대로 둔다', () => {
    const { inavi, map } = createFakeInavi();
    const paths = [{ coords: [{ x: 127.1, y: 37.4 }] }];

    expect(renderRoute(inavi, map, { data: { option: 'real_traffic', paths } }).listHtml).toContain(
      '실시간 교통',
    );
    expect(renderRoute(inavi, map, { data: { option: 'stats', paths } }).listHtml).toContain(
      '통계 예측',
    );
    expect(renderRoute(inavi, map, { data: { option: 'brand_new', paths } }).listHtml).toContain(
      'brand_new',
    );
  });
});

describe('장소 ↔ 주소 전환 (F1)', () => {
  const bothKinds = {
    data: {
      poi: [{ name1: '일프레소', dpx: '127.111', dpy: '37.3948' }],
      // 반경 500m를 물었는데 289km 밖에서 딸려 온 실제 사례.
      adm: [{ address: '경상남도 김해시 관동동', posx: '128.806485', posy: '35.176094' }],
    },
  };

  it('기본은 장소다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderSearch(inavi, map, bothKinds);

    expect(result.coordinates).toEqual([[127.111, 37.3948]]);
    expect(result.summary).toBe('장소 1건');
  });

  it('주소로 바꾸면 주소만 올라간다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderSearch(inavi, map, bothKinds, { view: 'address' });

    expect(result.coordinates).toEqual([[128.806485, 35.176094]]);
    expect(result.summary).toBe('주소 1건');
  });

  it('주소 마커는 장소와 모양이 다르다', () => {
    const { inavi, map, markers } = createFakeInavi();

    // 모양은 하나로 통일하고 **색만** 바꾼다. 세 가지 문법이 섞여 보인다는 피드백을 받아
    // 작은 점·SDK 기본 마커를 걷어내고 전부 같은 물방울 핀으로 모았다 (render/pin.ts).
    renderSearch(inavi, map, bothKinds, { view: 'address' });
    const addressIcon = markers[0]?.icon as HTMLElement | undefined;
    expect(addressIcon?.className).toBe('map-pin');

    const places = createFakeInavi();
    renderSearch(places.inavi, places.map, bothKinds, { view: 'place' });
    const placeIcon = places.markers[0]?.icon as HTMLElement | undefined;
    expect(placeIcon?.className).toBe('map-pin');

    // 모양이 같으므로 **색**으로 갈린다.
    const colorOf = (icon: HTMLElement | undefined) =>
      icon?.querySelector('span')?.style.color ?? '';
    expect(colorOf(placeIcon)).not.toBe(colorOf(addressIcon));
  });

  it('전체 건수는 보고 있는 종류의 것만 쓴다', () => {
    // `totalcount`는 장소와 주소를 합친 값이라 "전체 116건"이 무엇의 116인지 알 수 없었다.
    const { inavi, map } = createFakeInavi();
    const payload = {
      data: {
        totalcount: 116,
        poitotalcount: 115,
        admtotalcount: 1,
        poi: [{ name1: '가', dpx: '127.1', dpy: '37.4' }],
        adm: [{ address: '경상남도', posx: '128.8', posy: '35.2' }],
      },
    };

    expect(renderSearch(inavi, map, payload, { view: 'place' }).summary).toBe(
      '장소 1건 · 전체 115건',
    );
    // 주소는 1건이 전부다. 전체를 덧붙일 것이 없다.
    expect(renderSearch(inavi, map, payload, { view: 'address' }).summary).toBe('주소 1건');
  });

  it('정보창은 도로명·지번을 꼬리표를 달아 따로 적는다', () => {
    // 목록은 좁아서 한 줄로 잇지만, 정보창은 폭이 있으니 필드를 나눈다
    // (사내 `imps-guide-app`의 정보창 구조를 따랐다).
    const { inavi, map, clusterHandlers, infoWindowContents } = createFakeInavi();

    renderSearch(inavi, map, {
      data: {
        poi: [
          {
            name1: '보평고등학교',
            dpx: '127.1',
            dpy: '37.4',
            catename: '초중고',
            roadname: '경기도 성남시 분당구 동판교로',
            roadjibun: '124',
            address: '경기도 성남시 분당구 백현동',
            jibun: '544',
            tel: '031-8017-0466',
          },
        ],
      },
    });
    clusterHandlers.get('mouseenter')?.({
      target: { id: 'cluster_1_0s' },
      lngLat: { lng: 127.1, lat: 37.4 },
    });

    document.body.innerHTML = infoWindowContents[0] ?? '';
    const rows = [...document.querySelectorAll('.iw-row')].map((row) => [
      row.querySelector('.iw-label')?.textContent,
      row.querySelector('.iw-value')?.textContent,
    ]);

    expect(document.querySelector('.iw-chip')?.textContent).toBe('초중고');
    expect(rows).toEqual([
      ['도로명', '경기도 성남시 분당구 동판교로 124'],
      ['지번', '경기도 성남시 분당구 백현동 544'],
    ]);
    expect(document.querySelector('.iw-tel')?.textContent).toBe('031-8017-0466');
  });

  it('주소 줄에 거리를 섞지 않는다', () => {
    // 한 줄에 몰면 "…분당내곡로 117 · 87m"처럼 꼬리가 어중간하게 끊긴다 (실기 피드백).
    const { inavi, map } = createFakeInavi();
    const result = renderSearch(inavi, map, {
      data: {
        poi: [
          {
            name1: '가',
            dpx: '127.1',
            dpy: '37.4',
            roadname: '경기도 성남시 분당구 분당내곡로',
            roadjibun: '117',
            distance: 87,
          },
        ],
      },
    });

    document.body.innerHTML = `<ul>${result.listHtml}</ul>`;
    const address = document.querySelector('.result-address')?.textContent ?? '';
    const meta = document.querySelector('.result-meta')?.textContent ?? '';

    expect(address).toContain('분당내곡로 117');
    expect(address).not.toContain('87m');
    expect(meta).toBe('87m');
  });

  it('한쪽만 왔으면 그쪽을 보여 주고 "더 있음"을 붙이지 않는다', () => {
    const { inavi, map } = createFakeInavi();

    const onlyPoi = renderSearch(inavi, map, {
      data: { poi: [{ name1: '가', dpx: '127.1', dpy: '37.4' }] },
    });
    expect(onlyPoi.summary).toBe('장소 1건');

    const onlyAdm = renderSearch(inavi, map, {
      data: { adm: [{ address: '경기도', posx: '127.2', posy: '37.5' }] },
    });
    expect(onlyAdm.summary).toBe('주소 1건');
  });

  it('없는 쪽을 골라도 있는 쪽으로 넘어간다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderSearch(
      inavi,
      map,
      { data: { poi: [{ name1: '가', dpx: '127.1', dpy: '37.4' }] } },
      { view: 'address' },
    );

    expect(result.coordinates).toEqual([[127.1, 37.4]]);
    expect(result.summary).toBe('장소 1건');
  });

  it('둘 다 없으면 안내 문구를 돌려준다', () => {
    const { inavi, map } = createFakeInavi();

    expect(renderSearch(inavi, map, { data: {} }).summary).toBe('검색 결과가 없습니다.');
  });
});

describe('화면을 맞출 대상 (F8)', () => {
  const near: LngLat[] = [
    [127.111, 37.3947],
    [127.112, 37.3948],
  ];
  type LngLat = [number, number];
  const far: LngLat = [128.88, 35.19];

  it('반경을 물었으면 먼 결과가 섞여도 그 반경에 맞춘다', () => {
    const fit = fitTarget([...near, far], {
      kind: 'circle',
      center: [127.1112, 37.3947],
      radiusKm: 0.5,
    });

    const lngs = fit.map(([lng]) => lng);
    expect(Math.max(...lngs)).toBeLessThan(127.13);
    expect(lngs).not.toContain(far[0]);
  });

  it('원 전체가 화면에 들어온다', () => {
    const fit = fitTarget([], { kind: 'circle', center: [127, 37.5], radiusKm: 1 });
    const lats = fit.map(([, lat]) => lat);
    const lngs = fit.map(([lng]) => lng);

    expect(Math.max(...lats) - 37.5).toBeCloseTo(1 / 111, 4);
    expect(Math.max(...lngs) - 127).toBeGreaterThan(1 / 111);
  });

  it('영역을 그린 검색이면 그 영역에 맞춘다', () => {
    const path: LngLat[] = [
      [127.0, 37.4],
      [127.2, 37.4],
      [127.2, 37.5],
      [127.0, 37.5],
      [127.0, 37.4],
    ];

    expect(fitTarget([...near, far], { kind: 'polygon', path })).toEqual(path);
  });

  it('영역 없이 부른 검색은 결과 전체에 맞춘다', () => {
    expect(fitTarget([...near, far], undefined)).toEqual([...near, far]);
  });

  it('영역이 쓸 수 없는 값이면 결과로 돌아간다', () => {
    expect(fitTarget(near, { kind: 'circle', center: [127, 37], radiusKm: 0 })).toEqual(near);
    expect(fitTarget(near, { kind: 'polygon', path: [] })).toEqual(near);
  });
});

describe('펼친 패널을 비켜 맞추기', () => {
  // 패널(왼쪽 8px + 286px)이 덮은 자리에 결과가 깔리지 않게 왼쪽 여백만 늘린다 (실기 피드백).
  it('패널 오른쪽 끝 너머에서부터 결과를 맞춘다', () => {
    const padding = fitPadding(1300, 294);
    expect(padding).toEqual({
      top: FIT_PADDING,
      bottom: FIT_PADDING,
      left: 318,
      right: FIT_PADDING,
    });
  });

  it('패널을 접었거나 아직 없으면 네 변 같은 여백이다', () => {
    expect(fitPadding(1300, undefined)).toBe(FIT_PADDING);
    expect(fitPadding(1300, 0)).toBe(FIT_PADDING);
  });

  it('비키고 남은 자리가 좁으면 비키지 않는다 — SDK가 맞추지 못한다', () => {
    expect(fitPadding(500, 294)).toBe(FIT_PADDING);
  });
});

describe('경계 폴리곤 색 (F4)', () => {
  it('클러스터 풍선은 base64 PNG로만 만든다', () => {
    // 퍼센트 인코딩한 SVG data URI를 주면 SDK가 인라인 스타일의 background-image에 끼워
    // 넣는 과정에서 그림이 뜨지 않고 **개수 숫자만 남는다** (실기에서 발견).
    // SDK 기본 아이콘도 base64 PNG다.
    const canvas = document.createElement('canvas');
    const context = {
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillRect: () => {},
      stroke: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
    };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(
      Object.assign(canvas, {
        getContext: () => context,
        toDataURL: () => 'data:image/png;base64,AAAA',
      }) as unknown as HTMLElement,
    );

    expect(clusterIconDataUri(44, '#3F62E0')).toMatch(/^data:image\/png;base64,/);
    vi.restoreAllMocks();
  });

  it('풍선 그림을 못 만들면 SDK 기본으로 물러난다 — 마커까지 잃지 않는다', () => {
    const { inavi, map, markers, clustererOptions } = createFakeInavi();

    // happy-dom에는 2D 컨텍스트가 없어 그림을 만들 수 없다. 그래도 마커는 남아야 한다.
    renderSearch(
      inavi,
      map,
      { data: { poi: [{ name1: '가', dpx: '127.1', dpy: '37.4' }] } },
      { view: 'place' },
    );

    expect(markers.length).toBeGreaterThan(0);
    // 뭉치는 간격은 그대로 넘기고, 못 만든 **그림만** 뺀다.
    const options = clustererOptions[0] as { gridSize?: number; styles?: unknown };
    expect(options.gridSize).toBeGreaterThan(0);
    expect(options.styles).toBeUndefined();
  });

  it('검색 영역은 테마에 따라 진하기가 달라진다', async () => {
    // 외곽선이 1px 고정이라 면 색이 전부다. 옅게 주면 야간 지도에서 거의 보이지 않는다.
    const { setThemePreference } = await import('../../ui/src/map/theme');
    const area = {
      kind: 'circle' as const,
      center: [127.1, 37.4] as [number, number],
      radiusKm: 1,
    };

    const light = createFakeInavi();
    drawSearchArea(light.inavi, light.map, area);

    setThemePreference('dark');
    const dark = createFakeInavi();
    drawSearchArea(dark.inavi, dark.map, area);
    setThemePreference('light');

    const lightOpacity = light.shapes[0]?.style.fillOpacity ?? 0;
    expect(dark.shapes[0]?.style.fillOpacity ?? 0).toBeGreaterThan(lightOpacity);
    expect(lightOpacity).toBeGreaterThan(0.15);
  });

  it('기본 지도의 녹지와 겹치지 않는 색을 쓴다', () => {
    const { inavi, map, shapes } = createFakeInavi();

    renderBoundary(inavi, map, {
      data: { polygondata: [{ polygonlist: [{ polygon: [{ x: 127.1, y: 37.4 }] }] }] },
    });

    const style = shapes[0]?.style;
    // 녹색만 아니면 된다 — 공원·산림과 겹쳐 도시에서는 통째로 묻힌다(실측).
    // 색 자체는 map-colors.ts 한 곳에서 정한다.
    expect(style?.fillColor).toBe(BOUNDARY_STYLE.fillColor);
    expect(style?.fillOpacity).toBeGreaterThanOrEqual(0.3);
  });
});
