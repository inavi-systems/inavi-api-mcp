// @vitest-environment happy-dom
import { enveloped, meta } from './envelope';
import { describe, expect, it } from 'vitest';
import reverseFixture from '../fixtures/reverse-geocode.response.json';
import { renderReverse } from '../../ui/src/render/reverse';
import { describeLocation, detectKind, readLocationAdm } from '../../ui/src/shared/payload';
import { createFakeInavi } from './fake-inavi';

const payload = enveloped(reverseFixture, 'rename');

describe('detectKind', () => {
  it('리버스 지오코딩 응답을 location으로 가린다', () => {
    expect(detectKind(meta('reverse'))).toBe('reverse');
  });

  it('결과가 없으면 판별하지 못한다', () => {
    // 국내 육지 밖 좌표에서는 location 키 자체가 오지 않는다. 실측으로 확인했다.
    expect(detectKind({})).toBeUndefined();
  });
});

describe('describeLocation', () => {
  it('건물명이 있으면 건물명을 쓴다', () => {
    expect(describeLocation(readLocationAdm(payload.data))).toBe('삼환하이펙스A동');
  });

  it('건물명이 비어 있으면 도로명 주소로 대신한다', () => {
    // 판교역 지하처럼 건물명이 빈 문자열로 오는 지점이 있다.
    const name = describeLocation({
      bldname: '',
      roadname: '경기도 성남시 분당구 판교역로',
      roadjibun: '지하160',
      address: '경기도 성남시 분당구 백현동',
      jibun: '534-1',
    });

    expect(name).toBe('경기도 성남시 분당구 판교역로 지하160');
  });

  it('도로명도 없으면 지번 주소로 대신한다', () => {
    expect(describeLocation({ address: '경기도 성남시', jibun: '1' })).toBe('경기도 성남시 1');
  });

  it('아무것도 없으면 빈 문자열', () => {
    expect(describeLocation(undefined)).toBe('');
    expect(describeLocation({})).toBe('');
  });
});

describe('renderReverse (실제 iNavi 리버스 지오코딩 응답 기준)', () => {
  it('매칭된 주소 지점에 마커를 하나 찍는다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderReverse(inavi, map, payload);

    expect(markers).toHaveLength(1);
    // 요청한 좌표가 아니라 응답의 좌표를 쓴다. 매칭된 주소 지점이라 미세하게 다르다.
    expect(markers[0]?.position).toEqual([127.11046759, 37.40210215]);
    expect(markers[0]?.title).toBe('삼환하이펙스A동');
    expect(result.coordinates).toHaveLength(1);
  });

  it('요약에 지점 이름을 쓴다', () => {
    const { inavi, map } = createFakeInavi();

    expect(renderReverse(inavi, map, payload).summary).toBe('삼환하이펙스A동');
  });

  it('건물명·도로명·지번·우편번호·좌표를 목록에 담는다', () => {
    const { inavi, map } = createFakeInavi();

    const { listHtml } = renderReverse(inavi, map, payload);

    expect(listHtml).toContain('가까운 건물');
    expect(listHtml).toContain('삼환하이펙스A동');
    expect(listHtml).toContain('경기도 성남시 분당구 판교역로 240');
    expect(listHtml).toContain('경기도 성남시 분당구 삼평동 678');
    expect(listHtml).toContain('13493');
    expect(listHtml).toContain('127.110468, 37.402102');
  });

  it('결과가 없으면 마커를 찍지 않고 그대로 알린다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderReverse(inavi, map, { data: {} });

    expect(markers).toHaveLength(0);
    expect(result.coordinates).toEqual([]);
    expect(result.summary).toContain('찾지 못했습니다');
  });
});
