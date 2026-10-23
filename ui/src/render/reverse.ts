import type { InaviMap, InaviNamespace, LngLatLike } from '../map/inavi';
import type { LocationAdm, ToolPayload } from '../shared/payload';
import { describeLocation, readLocationAdm, toNumber } from '../shared/payload';
import { formatPosition } from '../route-pick/map-picks';
import { drawFeatures, statList, type MapFeature } from './result';
import type { RenderResult } from './result';

/**
 * 리버스 지오코딩 결과 렌더링. (기반 예제: marker-basic)
 *
 * 지점 하나에 마커를 찍는다. 지오코딩과 달리 후보가 여럿이 아니라 **한 곳**이다
 * (`data.adm`은 객체). 응답의 좌표(`posx`/`posy`)는 요청한 좌표가 아니라 **매칭된 주소
 * 지점**이라 미세하게 다르다.
 *
 * 목록은 지점 하나를 **필드별로** 풀어 적는 지표 나열이다. "여기가 어디인가"에 답하는
 * 도구라 항목을 늘어놓을 것이 없다.
 */
export function renderReverse(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
): RenderResult {
  const adm = readLocationAdm(payload.data);
  const lng = toNumber(adm?.posx);
  const lat = toNumber(adm?.posy);

  if (!adm || lng === undefined || lat === undefined) {
    return { coordinates: [], listHtml: '', summary: '이 좌표의 주소를 찾지 못했습니다.' };
  }

  const position: LngLatLike = [lng, lat];
  drawFeatures(inavi, map, [toFeature(adm, position)]);

  return {
    coordinates: [position],
    listHtml: statList(statRows(adm, position)),
    summary: describeLocation(adm) || '주소를 찾았습니다.',
  };
}

function toFeature(adm: LocationAdm, position: LngLatLike): MapFeature {
  const building = adm.bldname?.trim();

  return {
    position,
    role: 'point',
    // 하나뿐인 지점이라 순번이 뜻이 없다. 글자 없는 핀을 쓴다.
    label: '',
    title: describeLocation(adm) || '(주소 없음)',
    // **상호가 아니라 가장 가까운 건물 이름**이다. 단정하지 않도록 칩으로 알린다.
    chip: building ? '가까운 건물' : '좌표 조회',
    address: { road: roadOf(adm), lot: lotOf(adm) },
    meta: [adm.postcode && `우 ${adm.postcode}`],
    showCoordinate: true,
  };
}

function statRows(adm: LocationAdm, position: LngLatLike): [string, string][] {
  const rows: [string, string][] = [];
  const building = adm.bldname?.trim();
  const road = roadOf(adm);
  const lot = lotOf(adm);

  if (building) rows.push(['가까운 건물', building]);
  if (road) rows.push(['도로명', road]);
  if (lot) rows.push(['지번', lot]);
  if (adm.postcode) rows.push(['우편번호', adm.postcode]);
  rows.push(['좌표', formatPosition(position)]);

  return rows;
}

function roadOf(adm: LocationAdm): string | undefined {
  return [adm.roadname, adm.roadjibun].filter(Boolean).join(' ') || undefined;
}

function lotOf(adm: LocationAdm): string | undefined {
  return [adm.address, adm.jibun].filter(Boolean).join(' ') || undefined;
}
