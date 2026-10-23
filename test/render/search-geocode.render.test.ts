// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import searchFixture from '../fixtures/search.response.json';
import geocodeFixture from '../fixtures/geocode.response.json';
import { renderSearch } from '../../ui/src/render/search';
import { renderGeocode } from '../../ui/src/render/geocode';
import { detectKind, readAdmList } from '../../ui/src/shared/payload';
import { enveloped, meta } from './envelope';
import { createFakeInavi } from './fake-inavi';

const searchPayload = enveloped(searchFixture, 'rename');
const geocodePayload = enveloped(geocodeFixture, 'rename');

describe('detectKind', () => {
  it('원본 응답의 최상위 키만으로 도구를 판별한다', () => {
    expect(detectKind(meta('search'))).toBe('search');
    expect(detectKind(meta('geocode'))).toBe('geocode');
    expect(detectKind(meta('walking-route'))).toBe('route');
    expect(detectKind(meta('boundary'))).toBe('boundary');
    expect(detectKind(meta('entry-points'))).toBe('entry-points');
    expect(detectKind(undefined)).toBeUndefined();
    expect(detectKind(meta('something-new'))).toBeUndefined();
  });
});

describe('renderSearch (실제 통합검색 응답 기준)', () => {
  it('POI의 dpx/dpy 문자열 좌표를 숫자로 바꿔 마커를 만든다', () => {
    const { inavi, map, markers } = createFakeInavi();
    const pois = searchPayload.data?.poi ?? [];

    const result = renderSearch(inavi, map, searchPayload);

    expect(markers).toHaveLength(pois.length);
    expect(result.coordinates).toHaveLength(pois.length);
    expect(result.coordinates[0]).toEqual([Number(pois[0]?.dpx), Number(pois[0]?.dpy)]);
    expect(
      result.coordinates.every(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)),
    ).toBe(true);
  });

  it('클러스터 마커는 지도에 직접 붙이지 않고 클러스터러에 넘긴다', () => {
    const { inavi, map, markers, clusterHandlers } = createFakeInavi();

    renderSearch(inavi, map, searchPayload);

    expect(markers.every((m) => m.attachedToMap === false)).toBe(true);
    expect([...clusterHandlers.keys()].sort()).toEqual(['click', 'mouseenter', 'mouseleave']);
  });

  it('개별 마커 hover 시 해당 POI 정보로 InfoWindow를 채운다', () => {
    const { inavi, map, clusterHandlers, infoWindowContents } = createFakeInavi();
    renderSearch(inavi, map, searchPayload);

    // 클러스터러는 개별 마커에 `cluster_<n>_<index>s` 형태의 id를 준다.
    clusterHandlers.get('mouseenter')?.({
      target: { id: 'cluster_12_1s' },
      lngLat: { lng: 0, lat: 0 },
    });

    const name = searchPayload.data?.poi?.[1]?.name1 ?? '';
    expect(infoWindowContents[0]).toContain(name);
  });

  it('클러스터 클릭은 한 단계 확대한다', () => {
    const { inavi, map, clusterHandlers } = createFakeInavi();
    renderSearch(inavi, map, searchPayload);

    clusterHandlers.get('click')?.({ target: { cluster: true }, lngLat: { lng: 127, lat: 37 } });

    expect(map.flyTo).toHaveBeenCalledWith({ lng: 127, lat: 37 }, { zoom: 14, duration: 600 });
  });

  it('목록 HTML에 POI 이름을 이스케이프해 넣는다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderSearch(inavi, map, {
      data: { poi: [{ name1: '<script>bad</script>', dpx: '127.1', dpy: '37.4' }] },
    });

    expect(result.listHtml).not.toContain('<script>');
    expect(result.listHtml).toContain('&lt;script&gt;');
  });

  it('좌표가 없는 항목은 건너뛴다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderSearch(inavi, map, {
      data: { poi: [{ name1: '좌표 없음' }, { name1: '정상', dpx: '127.1', dpy: '37.4' }] },
    });

    expect(markers).toHaveLength(1);
    expect(result.coordinates).toEqual([[127.1, 37.4]]);
  });

  it('장소와 주소가 함께 오면 장소만 지도에 올린다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderSearch(inavi, map, {
      data: {
        poi: [{ name1: '판교역', dpx: '127.1', dpy: '37.4' }],
        adm: [{ address: '경상남도 김해시', posx: '128.8', posy: '35.1' }],
      },
    });

    expect(markers).toHaveLength(1);
    expect(result.coordinates).toEqual([[127.1, 37.4]]);
    // 숨긴 쪽도 건수로는 알린다.
    expect(result.summary).toBe('장소 1건');
  });
});

describe('renderGeocode (실제 지오코딩 응답 기준)', () => {
  it('후보마다 지도에 붙은 마커를 만든다', () => {
    const { inavi, map, markers } = createFakeInavi();
    const candidates = readAdmList(geocodePayload.data);

    const result = renderGeocode(inavi, map, geocodePayload);

    expect(markers).toHaveLength(candidates.length);
    expect(markers.every((m) => m.attachedToMap)).toBe(true);
    expect(result.coordinates[0]).toEqual([
      Number(candidates[0]?.posx),
      Number(candidates[0]?.posy),
    ]);
  });

  it('목록에 도로명 주소와 좌표를 함께 보여 준다', () => {
    const { inavi, map } = createFakeInavi();
    const first = readAdmList(geocodePayload.data)[0];

    const result = renderGeocode(inavi, map, geocodePayload);

    expect(result.listHtml).toContain(String(first?.roadname));
    expect(result.listHtml).toContain(Number(first?.posx).toFixed(6));
    expect(result.summary).toContain('좌표 후보');
  });

  it('결과가 없으면 안내 문구를 돌려준다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderGeocode(inavi, map, { data: { adm: [] } });

    expect(result.coordinates).toHaveLength(0);
    expect(result.summary).toBe('변환된 좌표가 없습니다.');
  });
});
