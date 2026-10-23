import { describe, expect, it, vi } from 'vitest';
import type { INaviHttpClient } from '@/clients/inavi-http.client';
import { SearchClient } from '@/clients/search.client';
import { GeocodingClient } from '@/clients/geocoding.client';
import { SpatialClient } from '@/clients/spatial.client';
import { RouteClient } from '@/clients/route.client';
import { OptimizeClient } from '@/clients/optimize.client';
import { MatrixClient } from '@/clients/matrix.client';

const OK = { header: { isSuccessful: true, resultCode: 0, resultMessage: 'Success' } };

function stubHttp() {
  const get = vi.fn().mockResolvedValue(OK);
  const post = vi.fn().mockResolvedValue(OK);
  return { http: { get, post } as unknown as INaviHttpClient, get, post };
}

describe('SearchClient', () => {
  it('GET /searches 로 파라미터를 그대로 전달한다', async () => {
    const { http, get } = stubHttp();

    await new SearchClient(http).searchPlaces({
      query: '판교역',
      reqcount: 20,
      spopt: '2',
      radius: 500,
    });

    expect(get).toHaveBeenCalledWith('/searches', {
      query: '판교역',
      reqcount: 20,
      spopt: '2',
      radius: 500,
    });
  });

  it('다국어 검색은 g-searches를 부르고 lang을 붙인다', async () => {
    const { http, get } = stubHttp();

    await new SearchClient(http).searchPlacesGlobal({ query: '판교역', lang: 'en', reqcount: 5 });

    expect(get).toHaveBeenCalledWith('/g-searches', { query: '판교역', lang: 'en', reqcount: 5 });
  });

  it('주변 카테고리 검색은 값을 그대로 전달한다', async () => {
    const { http, get } = stubHttp();
    const params = { catecode: '100600', spopt: '2', x1: 127.1, y1: 37.4, radius: 500 } as const;

    await new SearchClient(http).searchNearbyCategory(params);

    expect(get).toHaveBeenCalledWith('/nearby-category-searches', { ...params });
  });

  it('최적 지점 검색은 좌표를 그대로 전달한다', async () => {
    const { http, get } = stubHttp();

    await new SearchClient(http).findOptimalPositions({ posX: 127.1, posY: 37.4, type: '0' });

    expect(get).toHaveBeenCalledWith('/optimal-position-searches', {
      posX: 127.1,
      posY: 37.4,
      type: '0',
    });
  });
});

describe('GeocodingClient', () => {
  it('GET /coordinates 로 파라미터를 그대로 전달한다', async () => {
    const { http, get } = stubHttp();

    await new GeocodingClient(http).geocodeAddress({
      query: '판교역로 240',
      posX: 127.1,
      posY: 37.4,
    });

    expect(get).toHaveBeenCalledWith('/coordinates', {
      query: '판교역로 240',
      posX: 127.1,
      posY: 37.4,
    });
  });

  it('GET /addresses 로 좌표를 그대로 전달한다', async () => {
    const { http, get } = stubHttp();

    await new GeocodingClient(http).reverseGeocode({ posX: 127.110762, posY: 37.402184 });

    expect(get).toHaveBeenCalledWith('/addresses', { posX: 127.110762, posY: 37.402184 });
  });
});

describe('SpatialClient', () => {
  it('POST /adminToPolygon 으로 본문을 보낸다', async () => {
    const { http, post } = stubHttp();

    await new SpatialClient(http).getAdminBoundary({ query: '4113510900', mode: 3 });

    expect(post).toHaveBeenCalledWith('/adminToPolygon', { query: '4113510900', mode: 3 });
  });
});

describe('RouteClient', () => {
  const base = {
    option: 'real_traffic',
    startX: 127.1,
    startY: 37.4,
    endX: 127.02,
    endY: 37.49,
  } as const;

  it('POST /route-normal 로 본문을 보내며 좌표계를 고정한다', async () => {
    const { http, post } = stubHttp();

    await new RouteClient(http).findRoute({ ...base });

    expect(post).toHaveBeenCalledWith('/route-normal', { ...base, coordType: 'wgs84' });
  });

  it('경유지 배열을 via1X/via1Y … 평평한 키로 펼친다', async () => {
    const { http, post } = stubHttp();

    await new RouteClient(http).findRoute({
      ...base,
      vias: [
        { x: 127.05, y: 37.45 },
        { x: 127.03, y: 37.47 },
      ],
    });

    expect(post).toHaveBeenCalledWith('/route-normal', {
      ...base,
      coordType: 'wgs84',
      via1X: 127.05,
      via1Y: 37.45,
      via2X: 127.03,
      via2Y: 37.47,
    });
  });

  it('경유지가 5개를 넘으면 호출 전에 거부한다', async () => {
    const { http, post } = stubHttp();
    const vias = Array.from({ length: 6 }, (_, i) => ({ x: 127 + i, y: 37 + i }));

    await expect(new RouteClient(http).findRoute({ ...base, vias })).rejects.toThrow(
      /At most 5 waypoints/,
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('예측 탐색은 route-time으로 시각 인자를 함께 보낸다', async () => {
    const { http, post } = stubHttp();

    await new RouteClient(http).findPredictedRoute({
      ...base,
      option: 'stats',
      type: 'start',
      year: 2026,
      month: 9,
      day: 30,
      hour: 8,
      minutes: 0,
      beforeCount: 1,
      afterCount: 1,
      interval: 30,
    });

    expect(post).toHaveBeenCalledWith(
      '/route-time',
      expect.objectContaining({
        option: 'stats',
        type: 'start',
        year: 2026,
        interval: 30,
        coordType: 'wgs84',
      }),
    );
  });

  it('도보 경로는 좌표를 문자열로 바꾸고 경유지를 viaList로 보낸다', async () => {
    const { http, post } = stubHttp();

    await new RouteClient(http).findPedestrianRoute({
      option: '1',
      type: 1,
      startX: 127.111,
      startY: 37.3947,
      endX: 127.110762,
      endY: 37.402184,
      vias: [{ x: 127.1107, y: 37.3974 }],
    });

    expect(post).toHaveBeenCalledWith('/route-pedestrian', {
      option: '1',
      type: 1,
      startX: '127.111',
      startY: '37.3947',
      endX: '127.110762',
      endY: '37.402184',
      viaList: [{ viaX: '127.1107', viaY: '37.3974' }],
    });
  });

  it('도보 경유지도 5개를 넘으면 거부한다', async () => {
    const { http, post } = stubHttp();
    const vias = Array.from({ length: 6 }, (_, i) => ({ x: 127 + i, y: 37 + i }));

    await expect(
      new RouteClient(http).findPedestrianRoute({
        option: '1',
        startX: 127.1,
        startY: 37.4,
        endX: 127.2,
        endY: 37.5,
        vias,
      }),
    ).rejects.toThrow(/At most 5 waypoints/);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('OptimizeClient', () => {
  const vias = [
    { x: 127.12, y: 37.38 },
    { x: 127.1, y: 37.36 },
  ];

  it('POST /route-optimize-points-10 으로 좌표를 문자열로 보낸다', async () => {
    const { http, post } = stubHttp();

    await new OptimizeClient(http).optimizeWaypointOrder({
      routeType: 2,
      startX: 127.11,
      startY: 37.4,
      endX: 127.02,
      endY: 37.49,
      vias,
    });

    expect(post).toHaveBeenCalledWith('/route-optimize-points-10', {
      routeType: 2,
      startX: '127.11',
      startY: '37.4',
      endX: '127.02',
      endY: '37.49',
      viaList: [
        { viaX: '127.12', viaY: '37.38' },
        { viaX: '127.1', viaY: '37.36' },
      ],
    });
  });

  it('경유지가 10곳을 넘으면 호출 전에 거부한다', async () => {
    const { http, post } = stubHttp();
    const many = Array.from({ length: 11 }, (_, i) => ({ x: 127 + i, y: 37 + i }));

    await expect(
      new OptimizeClient(http).optimizeWaypointOrder({ routeType: 0, vias: many }),
    ).rejects.toThrow(/Between 1 and 10 stops/);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('MatrixClient', () => {
  const points = [
    { x: 127.11, y: 37.4 },
    { x: 127.12, y: 37.39 },
  ];

  it('POST /route-distance-matrix 로 좌표를 posX/posY 문자열로 보낸다', async () => {
    const { http, post } = stubHttp();

    await new MatrixClient(http).getDistanceMatrix({
      points,
      dests: [{ x: 127.02, y: 37.49 }],
      traffic: 1,
    });

    expect(post).toHaveBeenCalledWith('/route-distance-matrix', {
      traffic: 1,
      points: [
        { posX: '127.11', posY: '37.4' },
        { posX: '127.12', posY: '37.39' },
      ],
      dests: [{ posX: '127.02', posY: '37.49' }],
    });
  });

  it('도착 지점이 없으면 dests를 보내지 않는다', async () => {
    const { http, post } = stubHttp();

    await new MatrixClient(http).getDistanceMatrix({ points });

    expect(post).toHaveBeenCalledWith(
      '/route-distance-matrix',
      expect.not.objectContaining({ dests: expect.anything() }),
    );
  });

  it('출발 지점이 2곳 미만이면 대안을 알려 주며 거부한다', async () => {
    const { http, post } = stubHttp();

    await expect(
      new MatrixClient(http).getDistanceMatrix({ points: [{ x: 127.1, y: 37.4 }] }),
    ).rejects.toThrow('find_route');
    expect(post).not.toHaveBeenCalled();
  });
});
