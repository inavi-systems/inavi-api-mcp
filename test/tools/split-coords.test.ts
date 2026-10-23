import { describe, expect, it } from 'vitest';
import { toDataEnvelope, type DataEnvelope } from '@/tools/common/envelope';
import { splitPathCoords, splitPolygonCoords } from '@/tools/common/split-coords';
import routeFixture from '../fixtures/route.response.json';
import pedestrianFixture from '../fixtures/route-pedestrian.response.json';
import polygonFixture from '../fixtures/admin-to-polygon.response.json';
import searchFixture from '../fixtures/search.response.json';

const size = (value: unknown): number => JSON.stringify(value).length;

function routeEnvelope(): DataEnvelope {
  return toDataEnvelope(structuredClone(routeFixture), 'unwrap');
}

function pathsOf(envelope: DataEnvelope): { coords?: unknown }[] {
  return envelope.data.paths as { coords?: unknown }[];
}

describe('splitPathCoords', () => {
  it('좌표 배열만 떼어 내고 나머지 필드는 그대로 둔다', () => {
    const before = routeEnvelope();
    const { body, coords } = splitPathCoords(routeEnvelope());

    expect(pathsOf(body)).toHaveLength(pathsOf(before).length);
    pathsOf(body).forEach((path) => {
      expect(path).not.toHaveProperty('coords');
    });

    // 구간별 교통 상황·거리는 모델이 답을 만드는 근거라 남긴다.
    expect(pathsOf(body)[0]).toMatchObject({
      traffic_color: (pathsOf(before)[0] as { traffic_color: string }).traffic_color,
      distance: (pathsOf(before)[0] as { distance: number }).distance,
    });

    // 요약값도 그대로.
    expect(body.data).toMatchObject({
      distance: routeFixture.route.data.distance,
      spend_time: routeFixture.route.data.spend_time,
      toll_fee: routeFixture.route.data.toll_fee,
    });

    expect(coords).toBeDefined();
  });

  it('떼어 낸 좌표를 paths와 같은 순서·같은 길이로 돌려준다', () => {
    const before = routeEnvelope();
    const { coords } = splitPathCoords(routeEnvelope());

    expect(coords).toHaveLength(pathsOf(before).length);
    pathsOf(before).forEach((path, index) => {
      expect(coords?.[index]).toEqual(path.coords ?? []);
    });
  });

  it('원본을 건드리지 않는다', () => {
    const input = routeEnvelope();
    splitPathCoords(input);

    expect(pathsOf(input)[0]).toHaveProperty('coords');
    expect(input).toEqual(routeEnvelope());
  });

  it('응답을 그대로 되살릴 수 있다', () => {
    const { body, coords } = splitPathCoords(routeEnvelope());

    const restored = structuredClone(body);
    pathsOf(restored).forEach((path, index) => {
      path.coords = coords?.[index];
    });

    expect(restored).toEqual(routeEnvelope());
  });

  it('도보 경로도 같은 구조라 그대로 처리된다', () => {
    const envelope = toDataEnvelope(structuredClone(pedestrianFixture), 'unwrap');
    const { body, coords } = splitPathCoords(envelope);

    expect(coords).toHaveLength(pedestrianFixture.route.data.paths.length);
    pathsOf(body).forEach((path) => {
      expect(path).not.toHaveProperty('coords');
    });

    // 스펙에 없지만 실제로 오는 값들이다. 자동차 렌더러가 그대로 쓸 수 있다.
    expect(pathsOf(body)[0]).toHaveProperty('traffic_color');
  });

  it('경로 응답이 아니면 원본을 그대로 통과시킨다', () => {
    const input = toDataEnvelope(structuredClone(searchFixture), 'rename');
    const { body, coords } = splitPathCoords(input);

    expect(body).toBe(input);
    expect(coords).toBeUndefined();
  });

  it('뗄 좌표가 없으면 원본을 그대로 통과시킨다', () => {
    const input = toDataEnvelope(
      { header: {}, route: { data: { paths: [{ traffic_color: '#06B010' }] } } },
      'unwrap',
    );
    const { body, coords } = splitPathCoords(input);

    expect(body).toBe(input);
    expect(coords).toBeUndefined();
  });

  it('모르는 모양이면 아무것도 하지 않는다', () => {
    for (const raw of [undefined, null, {}, { route: {} }, { route: { data: { paths: 3 } } }]) {
      const input = toDataEnvelope(raw, 'unwrap');
      const { body, coords } = splitPathCoords(input);
      expect(body).toBe(input);
      expect(coords).toBeUndefined();
    }
  });

  it('대화에 실리는 양이 실제로 줄어든다', () => {
    const { body } = splitPathCoords(routeEnvelope());
    expect(size(body)).toBeLessThan(size(routeEnvelope()) / 2);
  });
});

function polygonEnvelope(): DataEnvelope {
  return toDataEnvelope(structuredClone(polygonFixture), 'rename');
}

function polygonListsOf(envelope: DataEnvelope): { polygon?: unknown }[] {
  return (envelope.data.polygondata as { polygonlist: { polygon?: unknown }[] }[]).flatMap(
    (group) => group.polygonlist,
  );
}

describe('splitPolygonCoords', () => {
  it('경계 좌표만 떼어 내고 개수 정보는 남긴다', () => {
    const { body, coords } = splitPolygonCoords(polygonEnvelope());

    polygonListsOf(body).forEach((list) => {
      expect(list).not.toHaveProperty('polygon');
      // count가 남아 모델이 규모를 알 수 있다.
      expect(list).toHaveProperty('count');
    });

    expect(coords).toHaveLength(polygonListsOf(polygonEnvelope()).length);
    const firstList = polygonFixture.polygon.polygondata[0]?.polygonlist[0];
    expect(coords?.[0]).toHaveLength(firstList?.count ?? 0);
  });

  it('폴리곤 목록을 평탄하게 펼친 순서로 돌려준다', () => {
    const before = polygonListsOf(polygonEnvelope());
    const { coords } = splitPolygonCoords(polygonEnvelope());

    before.forEach((list, index) => {
      expect(coords?.[index]).toEqual(list.polygon ?? []);
    });
  });

  it('응답을 그대로 되살릴 수 있다', () => {
    const { body, coords } = splitPolygonCoords(polygonEnvelope());

    const restored = structuredClone(body);
    polygonListsOf(restored).forEach((list, index) => {
      list.polygon = coords?.[index];
    });

    expect(restored).toEqual(polygonEnvelope());
  });

  it('원본을 건드리지 않는다', () => {
    const input = polygonEnvelope();
    splitPolygonCoords(input);

    expect(input).toEqual(polygonEnvelope());
  });

  it('대화에 실리는 양이 실제로 줄어든다', () => {
    const { body } = splitPolygonCoords(polygonEnvelope());
    expect(size(body)).toBeLessThan(size(polygonEnvelope()) / 10);
  });

  it('폴리곤 응답이 아니면 원본을 그대로 통과시킨다', () => {
    const input = toDataEnvelope(structuredClone(searchFixture), 'rename');
    const { body, coords } = splitPolygonCoords(input);

    expect(body).toBe(input);
    expect(coords).toBeUndefined();
  });

  it('polygonlist가 배열이 아니면 아무것도 하지 않는다', () => {
    // 스펙은 객체로 선언한다. 그 모양이 실제로 오더라도 값을 잃지 않아야 한다.
    const input = toDataEnvelope(
      { header: {}, polygon: { polygondata: [{ polygonlist: { count: 1, polygon: [] } }] } },
      'rename',
    );
    const { body, coords } = splitPolygonCoords(input);

    expect(body).toBe(input);
    expect(coords).toBeUndefined();
  });
});
