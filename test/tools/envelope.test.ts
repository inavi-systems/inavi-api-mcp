import { describe, expect, it } from 'vitest';
import { toDataEnvelope, type EnvelopeShape } from '@/tools/common/envelope';
import searchFixture from '../fixtures/search.response.json';
import globalSearchFixture from '../fixtures/global-search.response.json';
import nearbyFixture from '../fixtures/nearby-category-search.response.json';
import geocodeFixture from '../fixtures/geocode.response.json';
import reverseFixture from '../fixtures/reverse-geocode.response.json';
import entryPointsFixture from '../fixtures/optimal-position-search.response.json';
import polygonFixture from '../fixtures/admin-to-polygon.response.json';
import routeFixture from '../fixtures/route.response.json';
import routeTimeFixture from '../fixtures/route-time.response.json';
import pedestrianFixture from '../fixtures/route-pedestrian.response.json';
import optimizeFixture from '../fixtures/route-optimize-points-10.response.json';
import matrixFixture from '../fixtures/route-distance-matrix.response.json';

/** 도구 12종이 쓰는 봉투 모양. 원본이 넷이라 한 문장으로 덮는지 여기서 확인한다. */
const CASES: { label: string; raw: unknown; shape: EnvelopeShape; keys: string[] }[] = [
  { label: '통합 검색', raw: searchFixture, shape: 'rename', keys: ['totalcount', 'poi'] },
  { label: '다국어 검색', raw: globalSearchFixture, shape: 'rename', keys: ['lang', 'poi'] },
  { label: '주변 카테고리', raw: nearbyFixture, shape: 'rename', keys: ['totalcount', 'poi'] },
  { label: '지오코딩', raw: geocodeFixture, shape: 'rename', keys: ['adm'] },
  {
    label: '리버스 지오코딩',
    raw: reverseFixture,
    shape: 'rename',
    keys: ['adm', 'legal_address'],
  },
  { label: '최적 지점', raw: entryPointsFixture, shape: 'asIs', keys: ['entrypoints'] },
  { label: '공간 검색', raw: polygonFixture, shape: 'rename', keys: ['polygondata'] },
  { label: '경로 탐색', raw: routeFixture, shape: 'unwrap', keys: ['distance', 'paths'] },
  { label: '경로 예측', raw: routeTimeFixture, shape: 'unwrap', keys: ['times', 'paths'] },
  { label: '도보 경로', raw: pedestrianFixture, shape: 'unwrap', keys: ['distance', 'paths'] },
  { label: 'TSP', raw: optimizeFixture, shape: 'unwrap', keys: ['optimize'] },
  { label: 'RDM', raw: matrixFixture, shape: 'wrap', keys: ['mode', 'origins', 'rows'] },
];

describe('toDataEnvelope', () => {
  it.each(CASES)('$label — 본문을 data 한 칸에 담는다', ({ raw, shape, keys }) => {
    const envelope = toDataEnvelope(raw, shape);

    expect(Object.keys(envelope).sort()).toEqual(['data', 'header']);
    expect(envelope.header).toEqual((raw as { header: unknown }).header);
    keys.forEach((key) => {
      expect(envelope.data).toHaveProperty(key);
    });
  });

  it.each(CASES)('$label — 본문의 result를 뺀다', ({ raw, shape }) => {
    expect(toDataEnvelope(raw, shape).data).not.toHaveProperty('result');
  });

  it('경로는 껍질을 벗겨 data.data가 생기지 않는다', () => {
    const envelope = toDataEnvelope(routeFixture, 'unwrap');

    expect(envelope.data).not.toHaveProperty('data');
    expect(envelope.data).toEqual(routeFixture.route.data);
  });

  it('RDM은 없던 껍질을 씌워 네 키를 모두 담는다', () => {
    const envelope = toDataEnvelope(matrixFixture, 'wrap');
    const { header: _header, ...body } = matrixFixture;

    expect(envelope.data).toEqual(body);
  });

  it('원본을 건드리지 않는다', () => {
    const input = structuredClone(searchFixture);
    toDataEnvelope(input, 'rename');

    expect(input).toEqual(searchFixture);
    expect(input.search).toHaveProperty('result');
  });

  it('본문 키가 없으면 data를 비워 둔다', () => {
    // 리버스 지오코딩은 결과가 없으면 location 키 자체가 오지 않는다.
    const envelope = toDataEnvelope({ header: { isSuccessful: true } }, 'rename');

    expect(envelope.data).toEqual({});
  });

  it('헤더가 없으면 실패 헤더를 채운다', () => {
    expect(toDataEnvelope({}, 'rename').header.isSuccessful).toBe(false);
    expect(toDataEnvelope(null, 'rename').header.isSuccessful).toBe(false);
  });

  it('본문 필드를 골라내지 않는다', () => {
    // 절삭 대상은 좌표 배열뿐이다 (설계 1.3). 인기 지표·별칭·subpoi 같은 것은 그대로 남는다.
    const poi = (toDataEnvelope(searchFixture, 'rename').data.poi as Record<string, unknown>[])[0];

    expect(Object.keys(poi ?? {})).toEqual(Object.keys(searchFixture.search.poi[0] ?? {}));
  });
});
