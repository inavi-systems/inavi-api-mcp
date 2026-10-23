// @vitest-environment happy-dom
import { enveloped } from './envelope';
import { describe, expect, it } from 'vitest';
import routeFixture from '../fixtures/route.response.json';
import { renderRoute, trafficTone } from '../../ui/src/render/route';
import { createFakeInavi } from './fake-inavi';

const payload = enveloped(routeFixture, 'unwrap');

describe('renderRoute (실제 iNavi 경로 응답 기준)', () => {
  it('모든 구간 좌표를 모아 외곽선 폴리라인을 먼저 깐다', () => {
    const { inavi, map, polylines } = createFakeInavi();

    const result = renderRoute(inavi, map, payload);

    const totalCoords = (payload.data?.paths ?? []).reduce(
      (n, p) => n + (p.coords?.length ?? 0),
      0,
    );
    expect(result.coordinates).toHaveLength(totalCoords);

    const outline = polylines[0];
    expect(outline?.zIndex).toBe(0);
    expect(outline?.style.lineColor).toBe('#1C2127');
    expect(outline?.style.lineWidth).toBe(7);
    expect(outline?.path).toHaveLength(totalCoords);
  });

  it('교통 색상을 차분한 톤으로 옮겨 그린다', () => {
    // API가 주는 색은 형광에 가까운 원색이라 지도 위에서 만화처럼 보였다. 뜻(원활·서행·
    // 정체)은 그대로 두고 **그릴 때만** 톤을 낮춘다. 응답 값은 손대지 않는다.
    const { inavi, map, polylines } = createFakeInavi();

    renderRoute(inavi, map, payload);

    const segments = polylines.slice(1);
    const fixtureColors = (payload.data?.paths ?? []).map((p) => p.traffic_color ?? '');

    expect(segments.every((s) => s.zIndex === 1 && s.style.lineWidth === 5)).toBe(true);
    expect(segments.map((s) => s.style.lineColor)).toEqual(fixtureColors.map(trafficTone));
    // 옮긴 색이 원본과 달라야 톤을 낮춘 것이다.
    expect(segments.map((s) => s.style.lineColor)).not.toEqual(fixtureColors);
  });

  it('교통 색은 테마를 따른다', async () => {
    // 밝은 지도에서는 가라앉은 톤이 칙칙해 보이고, 야간 지도에서는 밝은 톤이 눈을 찌른다.
    const { setThemePreference } = await import('../../ui/src/map/theme');

    const light = trafficTone('#00ff60');
    setThemePreference('dark');
    const dark = trafficTone('#00ff60');
    setThemePreference('light');

    expect(dark).not.toBe(light);
    expect(trafficTone('#00ff60')).toBe(light);
  });

  it('모르는 교통 색상은 원본 그대로 쓴다', () => {
    // 지어내는 것보다 원본이 낫다.
    expect(trafficTone('#123456')).toBe('#123456');
  });

  it('인접한 같은 색 구간은 하나의 폴리라인으로 합친다', () => {
    const { inavi, map, polylines } = createFakeInavi();

    renderRoute(inavi, map, {
      data: {
        paths: [
          {
            traffic_color: '#00ff60',
            coords: [
              { x: 1, y: 1 },
              { x: 2, y: 2 },
            ],
          },
          { traffic_color: '#00ff60', coords: [{ x: 3, y: 3 }] },
          { traffic_color: '#fb3a76', coords: [{ x: 4, y: 4 }] },
        ],
      },
    });

    const segments = polylines.slice(1);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.style.lineColor).toBe(trafficTone('#00ff60'));
    expect(segments[0]?.path).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
    // 색이 바뀌는 지점에서 선이 끊기지 않도록 이전 마지막 좌표를 이어받는다.
    expect(segments[1]?.path).toEqual([
      [3, 3],
      [4, 4],
    ]);
  });

  it('출발지와 도착지에 마커를 찍는다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderRoute(inavi, map, payload);

    expect(markers).toHaveLength(2);
    expect(markers[0]?.title).toBe('출발지');
    expect(markers[0]?.position).toEqual(result.coordinates[0]);
    expect(markers[1]?.title).toBe('도착지');
    expect(markers[1]?.position).toEqual(result.coordinates[result.coordinates.length - 1]);
  });

  it('경유지(point_type=V)마다 순번 마커를 추가한다', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderRoute(inavi, map, {
      data: {
        paths: [
          { point_type: 'S', coords: [{ x: 1, y: 1 }] },
          { point_type: 'V', coords: [{ x: 2, y: 2 }] },
          { point_type: 'E', coords: [{ x: 3, y: 3 }] },
        ],
      },
    });

    expect(markers.map((m) => m.title)).toEqual(['출발지', '경유지', '도착지']);
    expect(markers[1]?.position).toEqual([2, 2]);
  });

  it('요약에 거리·시간을 담고 통행료를 목록에 넣는다', () => {
    const { inavi, map } = createFakeInavi();
    const data = payload.data;

    const result = renderRoute(inavi, map, payload);

    expect(result.summary).toContain(`${((data?.distance ?? 0) / 1000).toFixed(1)}km`);
    expect(result.listHtml).toContain('통행 요금');
    expect(result.listHtml).toContain('총 거리');
  });

  it('좌표가 없으면 아무것도 그리지 않는다', () => {
    const { inavi, map, polylines, markers } = createFakeInavi();

    const result = renderRoute(inavi, map, { data: { paths: [] } });

    expect(polylines).toHaveLength(0);
    expect(markers).toHaveLength(0);
    expect(result.summary).toBe('경로 좌표가 없습니다.');
  });
});

/**
 * **출발·경유·도착이 어떤 장소인지.**
 *
 * 경로 API는 좌표만 돌려주므로 정보창에 좌표밖에 띄울 것이 없었다 — 사용자가
 * `티스테이션 걸포점에서 부천소사경찰서까지`라고 물었는데 핀을 누르면 `127.11, 37.39`가
 * 떴다(실기 피드백). 이름은 모델이 도구 입력에 적어 보내고 `_meta.places`로 온다.
 */
describe('경로 자리의 장소 정보', () => {
  const WAYPOINTS = {
    data: {
      paths: [
        { point_type: 'S', coords: [{ x: 127.111, y: 37.395 }] },
        { point_type: 'V1', coords: [{ x: 127.155, y: 37.455 }] },
        { point_type: 'E', coords: [{ x: 127.222, y: 37.495 }] },
      ],
    },
  };

  let fake: ReturnType<typeof createFakeInavi>;

  /** 핀에 마우스를 올렸을 때 뜨는 카드. 클러스터를 쓰지 않으므로 핀에서 바로 받는다. */
  function cardOf(index: number): string {
    const icon = fake.markers[index]?.icon;
    if (icon instanceof HTMLElement) icon.dispatchEvent(new Event('mouseenter'));
    return fake.infoWindowContents[fake.infoWindowContents.length - 1] ?? '';
  }

  it('장소를 받으면 검색 결과와 같은 카드가 되고 좌표는 적지 않는다', () => {
    fake = createFakeInavi();

    renderRoute(fake.inavi, fake.map, WAYPOINTS, {
      places: {
        start: {
          name: '티스테이션 걸포점',
          roadAddress: '김포시 김포한강4로 123',
          tel: '031-000-0000',
          category: '자동차정비',
        },
        end: { name: '부천소사경찰서' },
        vias: [{ name: '야탑역' }],
      },
    });

    expect(fake.markers.map((m) => m.title)).toEqual([
      '티스테이션 걸포점',
      '야탑역',
      '부천소사경찰서',
    ]);

    const start = cardOf(0);
    expect(start).toContain('티스테이션 걸포점');
    expect(start).toContain('iw-chip">출발<');
    expect(start).toContain('김포시 김포한강4로 123');
    expect(start).toContain('031-000-0000');
    expect(start).toContain('자동차정비');
    // 이름을 알면 좌표는 군더더기다. 좌표는 그것밖에 보여 줄 게 없을 때만 적는다.
    expect(start).not.toContain('127.111');

    expect(cardOf(1)).toContain('iw-chip">경유지<');
    expect(cardOf(2)).toContain('iw-chip">도착<');
  });

  it('장소를 안 받으면 자리 이름과 좌표를 적는다 — 지어내지 않는다', () => {
    fake = createFakeInavi();

    renderRoute(fake.inavi, fake.map, WAYPOINTS);

    expect(fake.markers.map((m) => m.title)).toEqual(['출발지', '경유지', '도착지']);

    const start = cardOf(0);
    expect(start).toContain('출발지');
    expect(start).toContain('127.111');
    // 제목이 이미 `출발지`인데 칩에 또 `출발`이 붙으면 같은 말이 두 번이다.
    expect(start).not.toContain('iw-chip');
  });

  it('경유지가 둘 이상일 때만 번호를 붙인다', () => {
    fake = createFakeInavi();

    renderRoute(
      fake.inavi,
      fake.map,
      {
        data: {
          paths: [
            { point_type: 'S', coords: [{ x: 127.111, y: 37.395 }] },
            { point_type: 'V1', coords: [{ x: 127.14, y: 37.42 }] },
            { point_type: 'V2', coords: [{ x: 127.18, y: 37.46 }] },
            { point_type: 'E', coords: [{ x: 127.222, y: 37.495 }] },
          ],
        },
      },
      { places: { vias: [{ name: '야탑역' }, { name: '이매역' }] } },
    );

    expect(cardOf(1)).toContain('iw-chip">경유지 1<');
    expect(cardOf(2)).toContain('iw-chip">경유지 2<');
  });

  it('요약 맨 위에 출발·도착 이름을 적는다', () => {
    fake = createFakeInavi();

    const result = renderRoute(fake.inavi, fake.map, WAYPOINTS, {
      places: { start: { name: '판교역' }, end: { name: '서현역' } },
    });

    expect(result.listHtml.indexOf('출발지')).toBeLessThan(result.listHtml.indexOf('총 거리'));
    expect(result.listHtml).toContain('판교역');
    expect(result.listHtml).toContain('서현역');
  });
});
