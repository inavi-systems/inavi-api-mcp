// @vitest-environment happy-dom
import { enveloped } from './envelope';
import { describe, expect, it } from 'vitest';
import routeFixture from '../fixtures/route.response.json';
import polygonFixture from '../fixtures/admin-to-polygon.response.json';
import { restoreCoords } from '../../ui/src/host/restore-coords';
import { renderRoute } from '../../ui/src/render/route';
import type { RouteCoord, ToolPayload } from '../../ui/src/shared/payload';
import { createFakeInavi } from './fake-inavi';

function fixture(): ToolPayload {
  return enveloped(routeFixture, 'unwrap');
}

/**
 * 서버가 하는 일을 그대로 흉내 낸다 — 본문에서 좌표를 빼고 따로 들고 있는다.
 * 서버 코드는 tsconfig가 달라 여기서 import할 수 없어 같은 규칙을 손으로 적었다.
 */
function stripCoords(payload: ToolPayload): { body: ToolPayload; coords: RouteCoord[][] } {
  const body = structuredClone(payload);
  const paths = body.data?.paths ?? [];
  const coords = paths.map((path) => path.coords ?? []);
  paths.forEach((path) => {
    delete path.coords;
  });
  return { body, coords };
}

describe('restoreCoords', () => {
  it('_meta로 온 좌표를 본문에 되꽂는다', () => {
    const { body, coords } = stripCoords(fixture());

    const restored = restoreCoords(body, { showMap: true, routeCoords: coords });

    expect(restored?.data?.paths).toEqual(fixture().data?.paths);
  });

  it('되꽂은 응답이 원본과 똑같이 그려진다', () => {
    const { body, coords } = stripCoords(fixture());
    const restored = restoreCoords(body, { routeCoords: coords });

    const before = createFakeInavi();
    const expected = renderRoute(before.inavi, before.map, fixture());

    const after = createFakeInavi();
    const actual = renderRoute(after.inavi, after.map, restored as ToolPayload);

    expect(actual.coordinates).toEqual(expected.coordinates);
    expect(actual.summary).toEqual(expected.summary);
    expect(actual.listHtml).toEqual(expected.listHtml);
    expect(after.polylines).toEqual(before.polylines);
  });

  it('본문에 좌표가 이미 있으면 덮어쓰지 않는다', () => {
    const payload = fixture();

    const restored = restoreCoords(payload, { routeCoords: [[{ x: 0, y: 0 }]] });

    expect(restored?.data?.paths).toEqual(fixture().data?.paths);
  });

  it('_meta에 좌표가 없으면 본문을 그대로 둔다', () => {
    const { body } = stripCoords(fixture());

    expect(restoreCoords(body, { showMap: true })).toBe(body);
    expect(restoreCoords(body, undefined)).toBe(body);
  });

  it('경로 응답이 아니면 손대지 않는다', () => {
    const payload: ToolPayload = { data: { adm: [] } };

    expect(restoreCoords(payload, { routeCoords: [[{ x: 1, y: 2 }]] })).toBe(payload);
  });
});

/**
 * 공간 검색의 폴리곤 좌표도 경로와 같은 통로로 온다.
 *
 * 행정구역 하나가 섬을 포함해 폴리곤 여럿으로 오므로, 서버가 평탄하게 펼쳐 보내고
 * 템플릿이 같은 순서로 다시 꽂는다.
 */
function polygonFixturePayload(): ToolPayload {
  return enveloped(polygonFixture, 'rename');
}

function polygonLists(payload: ToolPayload): { polygon?: RouteCoord[] }[] {
  return (payload.data?.polygondata ?? []).flatMap((group) => group.polygonlist ?? []);
}

function stripPolygons(payload: ToolPayload): { body: ToolPayload; coords: RouteCoord[][] } {
  const body = structuredClone(payload);
  const lists = polygonLists(body);
  const coords = lists.map((list) => list.polygon ?? []);
  lists.forEach((list) => {
    delete list.polygon;
  });
  return { body, coords };
}

describe('restoreCoords — 공간 검색 폴리곤', () => {
  it('_meta로 온 폴리곤 좌표를 본문에 되꽂는다', () => {
    const { body, coords } = stripPolygons(polygonFixturePayload());

    expect(polygonLists(body)[0]?.polygon).toBeUndefined();

    const restored = restoreCoords(body, { showMap: true, polygonCoords: coords });

    expect(restored).toEqual(polygonFixturePayload());
  });

  it('평탄하게 펼친 순서 그대로 꽂는다', () => {
    const { body, coords } = stripPolygons(polygonFixturePayload());
    const restored = restoreCoords(body, { polygonCoords: coords });

    polygonLists(restored!).forEach((list, index) => {
      expect(list.polygon).toEqual(coords[index]);
      // 개수 정보는 본문에 그대로 남아 있어야 한다.
      expect(list.polygon).toHaveLength(coords[index]?.length ?? -1);
    });
  });

  it('includeCoords로 이미 담겨 온 좌표는 덮지 않는다', () => {
    const payload = polygonFixturePayload();
    const before = polygonLists(payload)[0]?.polygon;

    restoreCoords(payload, { polygonCoords: [[{ x: 0, y: 0 }]] });

    expect(polygonLists(payload)[0]?.polygon).toBe(before);
  });

  it('경로와 폴리곤이 서로를 건드리지 않는다', () => {
    const { body, coords } = stripCoords(fixture());
    const restored = restoreCoords(body, {
      routeCoords: coords,
      polygonCoords: [[{ x: 0, y: 0 }]],
    });

    expect(restored).toEqual(fixture());
    expect(restored?.data?.polygondata).toBeUndefined();
  });

  it('폴리곤 응답이 아니면 아무것도 하지 않는다', () => {
    const payload = fixture();
    expect(restoreCoords(payload, { polygonCoords: [[{ x: 0, y: 0 }]] })).toBe(payload);
  });
});
