// @vitest-environment happy-dom
import { enveloped } from './envelope';
import { describe, expect, it } from 'vitest';
import {
  buildRoutePrompt,
  formatPosition,
  pickFromLocation,
  routePositionOf,
} from '../../ui/src/route-pick/map-picks';
import type { SearchPoi } from '../../ui/src/shared/payload';
import searchFixture from '../fixtures/search.response.json';
import reverseFixture from '../fixtures/reverse-geocode.response.json';

describe('routePositionOf', () => {
  it('차량 진입로 좌표를 표출용보다 먼저 쓴다', () => {
    // CLAUDE.md 규칙 — 표출용 좌표는 건물 중심이라 도로 위 지점이 아니다.
    const poi: SearchPoi = { dpx: '127.1', dpy: '37.4', rpx: '127.2', rpy: '37.5' };

    expect(routePositionOf(poi)).toEqual([127.2, 37.5]);
  });

  it('rpx가 없으면 routepoints[0]으로 물러선다', () => {
    const poi: SearchPoi = {
      dpx: '127.1',
      dpy: '37.4',
      routepoints: [{ rpx: '127.3', rpy: '37.6' }],
    };

    expect(routePositionOf(poi)).toEqual([127.3, 37.6]);
  });

  it('진입로 좌표가 전혀 없을 때만 표출용을 쓴다', () => {
    expect(routePositionOf({ dpx: '127.1', dpy: '37.4' })).toEqual([127.1, 37.4]);
  });

  it('좌표가 아예 없으면 undefined', () => {
    expect(routePositionOf({})).toBeUndefined();
  });

  it('실제 검색 응답의 POI에서 진입로 좌표를 뽑는다', () => {
    const poi = enveloped(searchFixture, 'rename').data?.poi?.[0];
    const position = routePositionOf(poi ?? {});

    expect(position).toBeDefined();
    // 픽스처의 표출용 좌표와 다른 값이어야 진입로 좌표를 쓴 것이다.
    expect(position).not.toEqual([Number(poi?.dpx), Number(poi?.dpy)]);
  });
});

describe('pickFromLocation', () => {
  it('건물명과 매칭된 주소 지점을 쓴다', () => {
    const pick = pickFromLocation(enveloped(reverseFixture, 'rename'), [127.9, 37.9]);

    expect(pick.name).toBe('삼환하이펙스A동');
    expect(pick.position).toEqual([127.11046759, 37.40210215]);
  });

  it('주소를 못 얻으면 클릭한 좌표를 그대로 쓴다', () => {
    // 이름이 없어도 좌표는 있다. 경로 탐색에는 그것으로 충분하다.
    const pick = pickFromLocation(undefined, [127.9, 37.9]);

    expect(pick.position).toEqual([127.9, 37.9]);
    expect(pick.name).toBe('127.900000, 37.900000');
  });
});

describe('buildRoutePrompt', () => {
  it('이름과 좌표를 함께 넘겨 모델이 바로 경로를 부를 수 있게 한다', () => {
    const prompt = buildRoutePrompt(
      { name: '판교역(KTX)', position: [127.110862, 37.394834] },
      { name: '강남역', position: [127.027621, 37.497942] },
    );

    expect(prompt).toBe(
      '판교역(KTX)(127.110862, 37.394834)에서 ' +
        '강남역(127.027621, 37.497942)까지 자동차 경로를 알려줘.',
    );
  });
});

describe('formatPosition', () => {
  it('소수점 6자리로 고정한다', () => {
    expect(formatPosition([127.1, 37.4])).toBe('127.100000, 37.400000');
  });
});
