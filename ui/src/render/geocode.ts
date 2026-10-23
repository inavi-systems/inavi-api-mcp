import type { InaviMap, InaviNamespace } from '../map/inavi';
import type { AddressAdm, ToolPayload } from '../shared/payload';
import { readAdmList, toNumber } from '../shared/payload';
import { formatDistance } from '../shared/dom';
import { drawFeatures, featureList, featurePositions, type MapFeature } from './result';
import type { RenderResult } from './result';

/**
 * 지오코딩 결과 렌더링. (기반 예제: marker-basic)
 *
 * 후보가 여러 개일 수 있으므로 각 후보에 마커를 찍는다. 검색의 `주소` 보기와 **같은 모양**이
 * 되도록 같은 자리를 채운다 — 둘 다 주소 한 건을 가리키는 결과다 (render/result.ts).
 */
export function renderGeocode(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
): RenderResult {
  const features = readAdmList(payload.data)
    .map(toFeature)
    .filter((feature): feature is MapFeature => feature !== undefined);

  drawFeatures(inavi, map, features);

  const total = payload.data?.totalcount;
  const summary =
    features.length === 0
      ? '변환된 좌표가 없습니다.'
      : `좌표 후보 ${features.length}건` +
        (total !== undefined && total > features.length ? ` (전체 ${total}건 중)` : '');

  return {
    coordinates: featurePositions(features),
    listHtml: featureList(features),
    summary,
  };
}

function toFeature(adm: AddressAdm): MapFeature | undefined {
  const lng = toNumber(adm.posx);
  const lat = toNumber(adm.posy);
  if (lng === undefined || lat === undefined) return undefined;

  const road = adm.roadname ? [adm.roadname, adm.roadjibun].filter(Boolean).join(' ') : undefined;
  const lot = [adm.address, adm.jibun].filter(Boolean).join(' ') || undefined;

  return {
    position: [lng, lat],
    role: 'address',
    title: adm.buildname || road || lot || '(주소 없음)',
    chip: '주소',
    address: { road, lot },
    meta: [
      adm.postcode && `우 ${adm.postcode}`,
      adm.distance !== undefined && adm.distance > 0 ? formatDistance(adm.distance) : undefined,
    ],
    // 좌표로 바꾸는 것이 이 도구의 답이다. 목록에서 바로 보이게 둔다.
    showCoordinate: true,
  };
}
