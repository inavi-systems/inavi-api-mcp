import type { InaviMap, InaviNamespace } from '../map/inavi';
import type { AddressAdm, SearchPoi, ToolPayload } from '../shared/payload';
import { readAdmList, toNumber } from '../shared/payload';
import { routePositionOf } from '../route-pick/map-picks';
import { formatDistance } from '../shared/dom';
import { drawFeatures, featureList, featurePositions, type MapFeature } from './result';
import type { RenderResult } from './result';

/**
 * 통합 검색 결과 렌더링. (기반 예제: infowindow-clustered-markers)
 *
 * **장소(`poi`)와 주소(`adm`)를 한 지도에 섞지 않는다.** 성격이 다른 결과이고, 공간 조건이
 * `adm`에는 안 걸려서 섞으면 수백 km 밖 주소가 화면을 끌고 간다. 한 번에 한 종류만 올리고
 * 둘 다 왔을 때만 전환 스위치를 만든다 (`controls.ts`). 숨긴 쪽은 요약에 건수로 남긴다.
 *
 * 마커·정보창·목록 마크업은 이 파일이 만들지 않는다 — 응답을 `MapFeature`로 옮기는 데까지만
 * 하고 나머지는 render/result.ts가 모든 결과에 같은 규칙으로 처리한다.
 */

/** 통합 검색이 돌려주는 두 가지 결과. 지도에는 **한 번에 한 종류만** 올린다. */
export type SearchView = 'place' | 'address';

/** 각 종류의 건수. 전환 스위치를 만들지 말지는 부르는 쪽이 이것으로 정한다. */
export interface SearchCounts {
  place: number;
  address: number;
}

export interface SearchRenderOptions {
  /** 지도에 올릴 종류. 기본은 장소다. */
  view?: SearchView;
}

/** 어느 종류를 보여줄지 고른다. 고른 쪽이 비어 있으면 있는 쪽으로 넘어간다. */
export function resolveSearchView(
  counts: SearchCounts,
  wanted: SearchView | undefined,
): SearchView {
  if (wanted === 'address' && counts.address > 0) return 'address';
  if (wanted === 'place' && counts.place > 0) return 'place';
  return counts.place > 0 ? 'place' : 'address';
}

export function countSearchResults(payload: ToolPayload | undefined): SearchCounts {
  return {
    place: (payload?.data?.poi ?? []).length,
    address: readAdmList(payload?.data).length,
  };
}

export function renderSearch(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
  options: SearchRenderOptions = {},
): RenderResult {
  const pois = payload.data?.poi ?? [];
  const adms = readAdmList(payload.data);
  const counts = { place: pois.length, address: adms.length };
  const view = resolveSearchView(counts, options.view);

  const features = (view === 'place' ? pois.map(poiFeature) : adms.map(admFeature)).filter(
    (feature): feature is MapFeature => feature !== undefined,
  );

  // 결과가 수십 건이라 뭉쳐 올린다. 뭉치는 규칙은 render/cluster.ts가 쥔다.
  drawFeatures(inavi, map, features, { cluster: true });

  return {
    coordinates: featurePositions(features),
    listHtml: featureList(features),
    summary: buildSummary(counts, view, payload.data ?? {}),
  };
}

/**
 * 요약 한 줄.
 *
 * 숨긴 쪽 건수는 **보기 스위치가 이미 양쪽을 다 적어 주므로**(둘 다 있을 때만 생긴다)
 * 여기서 뺀다.
 *
 * 전체 건수는 **보고 있는 종류의 것만** 쓴다. `totalcount`는 장소와 주소를 합친 값이라
 * "전체 116건"이 무엇의 116인지 알 수 없었다 — `poitotalcount`·`admtotalcount`로 가른다.
 */
function buildSummary(counts: SearchCounts, view: SearchView, data: SearchTotals): string {
  if (counts.place === 0 && counts.address === 0) return '검색 결과가 없습니다.';

  const place = view === 'place';
  const shown = place ? counts.place : counts.address;
  const total = (place ? data.poitotalcount : data.admtotalcount) ?? data.totalcount;
  const label = place ? '장소' : '주소';

  return total !== undefined && total > shown
    ? `${label} ${shown}건 · 전체 ${total}건`
    : `${label} ${shown}건`;
}

/** 요약에 쓰는 건수 필드만 따로 받는다. */
interface SearchTotals {
  totalcount?: number;
  poitotalcount?: number;
  admtotalcount?: number;
}

function poiFeature(poi: SearchPoi): MapFeature | undefined {
  const lng = toNumber(poi.dpx);
  const lat = toNumber(poi.dpy);
  if (lng === undefined || lat === undefined) return undefined;

  return {
    position: [lng, lat],
    // 경로에 넘길 때는 **차량 진입로 좌표**를 쓴다 (map-picks.ts).
    routePosition: routePositionOf(poi) ?? [lng, lat],
    role: 'place',
    title: poi.name1 ?? '(이름 없음)',
    chip: poi.catename,
    address: { road: roadAddressOf(poi), lot: lotAddressOf(poi), detail: poi.detailaddress },
    tel: poi.tel,
    meta: [distanceText(poi.distance)],
    send: true,
  };
}

function admFeature(adm: AddressAdm): MapFeature | undefined {
  const lng = toNumber(adm.posx);
  const lat = toNumber(adm.posy);
  if (lng === undefined || lat === undefined) return undefined;

  return {
    position: [lng, lat],
    role: 'address',
    title: adm.buildname ?? adm.address ?? '(주소)',
    chip: '주소',
    address: { road: roadAddressOf(adm), lot: lotAddressOf(adm) },
    meta: [adm.postcode && `우 ${adm.postcode}`, distanceText(adm.distance)],
    send: true,
  };
}

/** 도로명 주소 한 줄. 없으면 비워 둔다 — 정보창은 줄 자체를 만들지 않는다. */
function roadAddressOf(item: SearchPoi | AddressAdm): string | undefined {
  return item.roadname ? [item.roadname, item.roadjibun].filter(Boolean).join(' ') : undefined;
}

/** 지번 주소 한 줄. `address`는 동까지, `jibun`이 번지다. */
function lotAddressOf(item: SearchPoi | AddressAdm): string | undefined {
  return [item.address, item.jibun].filter(Boolean).join(' ') || undefined;
}

function distanceText(distance: number | undefined): string {
  return distance !== undefined && distance > 0 ? formatDistance(distance) : '';
}
