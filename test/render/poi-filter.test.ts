// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORIES,
  filterPoiByCategory,
  listPoiCategories,
} from '../../ui/src/panel/poi-filter';
import type { ToolPayload } from '../../ui/src/shared/payload';

function payloadOf(...categories: (string | undefined)[]): ToolPayload {
  return {
    data: {
      totalcount: categories.length,
      poi: categories.map((catename, index) => ({
        poiid: index,
        name1: `장소 ${index}`,
        dpx: '127.1',
        dpy: '37.4',
        catename,
      })),
    },
  };
}

describe('listPoiCategories', () => {
  it('결과에 실제로 등장한 분류만 중복 없이 추린다', () => {
    expect(listPoiCategories(payloadOf('카페', '음식점', '카페'))).toEqual(['음식점', '카페']);
  });

  it('분류가 없는 항목은 세지 않는다', () => {
    expect(listPoiCategories(payloadOf('카페', undefined, '  '))).toEqual(['카페']);
  });

  it('검색 결과가 아니면 빈 목록', () => {
    expect(listPoiCategories(undefined)).toEqual([]);
    expect(listPoiCategories({ data: { adm: [] } })).toEqual([]);
  });
});

describe('filterPoiByCategory', () => {
  it('고른 분류만 남긴다', () => {
    const filtered = filterPoiByCategory(payloadOf('카페', '음식점', '카페'), '카페');

    expect(filtered?.data?.poi?.map((p) => p.catename)).toEqual(['카페', '카페']);
  });

  it('건수는 손대지 않는다 — 요약이 "N건 · 전체 M건"으로 짝을 맞춘다', () => {
    const filtered = filterPoiByCategory(payloadOf('카페', '음식점', '쇼핑'), '카페');

    // 거른 수는 `poi.length`가, 원본 수는 `totalcount`·`poitotalcount`가 말한다.
    // 여기서 건수까지 줄이면 "19건 중 4건을 보는 중"을 말할 수 없다.
    expect(filtered?.data?.poi).toHaveLength(1);
    expect(filtered?.data?.totalcount).toBe(3);
  });

  it('원본을 건드리지 않는다', () => {
    const payload = payloadOf('카페', '음식점');
    filterPoiByCategory(payload, '카페');

    expect(payload.data?.poi).toHaveLength(2);
    expect(payload.data?.totalcount).toBe(2);
  });

  it('전체를 고르면 원본을 그대로 돌려준다', () => {
    const payload = payloadOf('카페', '음식점');

    expect(filterPoiByCategory(payload, ALL_CATEGORIES)).toBe(payload);
  });

  it('걸러 낼 것이 없으면 같은 객체를 돌려준다', () => {
    // render-host가 객체 동일성으로 필터 유지 여부를 판단한다.
    const payload = payloadOf('카페', '카페');

    expect(filterPoiByCategory(payload, '카페')).toBe(payload);
  });

  it('없는 분류를 고르면 빈 목록이 된다', () => {
    const filtered = filterPoiByCategory(payloadOf('카페'), '주유소');

    expect(filtered?.data?.poi).toEqual([]);
    expect(filtered?.data?.totalcount).toBe(1);
  });

  it('검색 결과가 아니면 손대지 않는다', () => {
    const payload: ToolPayload = { data: { adm: [] } };

    expect(filterPoiByCategory(payload, '카페')).toBe(payload);
  });
});
