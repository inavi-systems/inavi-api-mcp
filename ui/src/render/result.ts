import type {
  InaviInfoWindow,
  InaviMap,
  InaviMarker,
  InaviNamespace,
  LngLatLike,
} from '../map/inavi';
import { escapeHtml } from '../shared/dom';
import { formatPosition } from '../route-pick/map-picks';
import { focusFromMap, highlight } from '../panel/marker-link';
import { infoCardHtml } from './info-card';
import { clusterOptions, individualMarkerIndex } from './cluster';
import { arrowSvgDataUri, createPinElement, pinSvgDataUri, PIN_COLORS } from './pin';
import { seriesColor } from '../map/map-colors';

/**
 * 결과를 지도와 목록에 **같은 규칙으로** 내보내는 한 자리.
 *
 * 렌더러마다 마커·목록·정보창을 직접 짜면 같은 뜻인데 자리마다 모양이 갈리고, 한쪽을
 * 고치면 나머지가 옛 모양으로 남는다. 그래서 렌더러가 하는 일은 **"응답을 읽어
 * `MapFeature`로 옮기는 것"까지다.**
 * 마커를 어떻게 생기게 할지, 정보창에 무엇을 어떤 꼴로 적을지, 목록 한 줄을 어떤 마크업으로
 * 짤지는 전부 여기서 한 번만 정한다. 색은 map-colors.ts, 핀 모양은 pin.ts, 정보창 카드는
 * info-card.ts가 각각 한 자리를 맡고, 이 파일이 셋을 묶는다.
 *
 * ## 두 가지 줄
 *
 * - `MapFeature` → **지점**이다. 지도에 핀이 서고 목록에 `.result-item` 한 줄이 된다.
 *   목록과 핀은 **만든 순서**로 짝지어진다 (marker-link.ts).
 * - `StatRow` → **지표**다. 지도에 자리가 없는 값(총 거리, 행렬 한 칸)이라 `.stat-item`
 *   한 줄로만 적는다.
 *
 * 결과 하나가 둘을 함께 쓸 수 있다 — 거리 행렬은 지점에 핀을 세우고 칸은 지표로 적는다.
 */

/** 핀 색의 이름. 실제 색은 map-colors.ts가 쥔다. */
export type PinRole = keyof typeof PIN_COLORS;

/**
 * 주소 한 벌.
 *
 * **목록은 대표 한 줄, 정보창은 도로명·지번을 따로** 적는다. 어느 쪽을 대표로 삼을지는
 * `primaryAddress`가 한 번만 정한다 — 렌더러마다 고르면 또 갈린다.
 */
export interface FeatureAddress {
  road?: string;
  lot?: string;
  /** 동·호처럼 주소 뒤에 붙는 상세. 대표 줄에만 붙인다. */
  detail?: string;
}

/** 지도에 찍는 지점 하나. 마커·정보창·목록 한 줄이 모두 여기서 나온다. */
export interface MapFeature {
  /** 핀을 세울 자리. POI라면 지도 표출용 좌표다. */
  position: LngLatLike;
  /** 경로 탐색에 넘길 자리. POI라면 **차량 진입로 좌표**다 (map-picks.ts). */
  routePosition?: LngLatLike;
  /** 핀 색. 생략하면 장소 색. */
  role?: PinRole;
  /**
   * 역할이 아니라 **순번으로 색을 고른다.** 지점이 여럿인데 역할이 모두 같은 결과에 쓴다.
   *
   * 거리 행렬처럼 핀이 전부 한 색이고 번호만 다르면 지도에서 어느 것이 몇 번인지 짚기
   * 어렵다(실기 피드백). 값을 주면 `role`보다 먼저 쓰이고, 목록의 순번 배지도 같은 색이
   * 되어 목록과 지도가 색으로 이어진다. 열 가지를 넘으면 처음 색으로 돌아간다.
   */
  seriesIndex?: number;
  /** 핀 안에 넣을 글자. 생략하면 순번, 빈 문자열이면 글자 없는 핀. */
  label?: string;
  title: string;
  /** 분류·종류를 한마디로. 목록은 제목 아래 흐린 줄, 정보창은 칩. */
  chip?: string;
  address?: FeatureAddress;
  tel?: string;
  /** 거리·우편번호처럼 짧은 값. 빈 값은 저절로 빠진다. */
  meta?: (string | undefined | false)[];
  /** 목록 본문에 한 줄 더. 각도·구간처럼 주소가 아닌 설명. */
  note?: string;
  /** 좌표를 작은 글씨로 덧붙인다. 주소가 없는 결과에서 쓴다. */
  showCoordinate?: boolean;
  /**
   * 목록에 `대화로` 버튼을 단다. 참이면 제목·분류·주소로 문장을 짓고,
   * 문자열을 주면 그 문장을 그대로 보낸다.
   */
  send?: boolean | string;
  /** 핀을 감싸 꾸민다 (진출입 지점의 방향 화살표). */
  decorate?: (pin: HTMLElement) => HTMLElement;
  /**
   * 이 지점을 가리키는 **그림**. 기본은 물방울 핀이다.
   *
   * 목록의 순번 배지는 지도 마커 그림을 그대로 깐다. 그러므로 지도에서 핀을 쓰지 않는
   * 결과는 여기서도 같은 그림이어야 한다 — 진출입 지점은 둘 다 화살표다.
   */
  art?: 'pin' | 'arrow';
}

/** 지도에 자리가 없는 값 한 줄. */
export interface StatRow {
  label: string;
  /** 값이 없으면 **묶음의 머리글**이다 — 아래 줄들이 여기 딸린다. */
  value?: string;
  /** 줄 앞의 동그란 번호. **지도 핀과 같은 색**이라 목록과 지도가 색으로 이어진다. */
  badge?: { text: string; color: string };
  /** 바로 위 머리글에 딸린 줄. 들여써서 묶음을 보인다. */
  child?: boolean;
  /**
   * **접어 두는 줄.** 목록 한 줄의 `상세`와 같은 규칙이다 — 훑는 데 쓰는 값만 펴 두고
   * 고른 뒤에 보는 값은 눌러서 편다. 경로의 탐색 옵션·택시 요금·예측 시각이 그렇다.
   */
  detail?: boolean;
}

/**
 * 렌더러 하나가 돌려주는 것. **여덟 렌더러가 모두 이 모양으로 답한다.**
 *
 * `coordinates`는 화면을 맞출 대상이고(fit-area.ts), `listHtml`은 사이드바에 꽂을 줄들,
 * `summary`는 요약 한 줄이다.
 */
export interface RenderResult {
  coordinates: LngLatLike[];
  listHtml: string;
  summary: string;
}

/** 정보창을 띄울 높이. 핀(36px) 위에 뜨도록 올린다. */
const INFO_OFFSET: [number, number] = [0, -40];

export interface DrawFeatureOptions {
  /** 지점이 많을 때 뭉쳐 올린다 (통합검색). */
  cluster?: boolean;
}

/**
 * 지점들을 지도에 올린다. **마커와 정보창은 여기서만 만든다.**
 *
 * 뭉치든 아니든 정보창은 하나를 돌려 쓴다 — 지점마다 만들면 떠 있는 창이 쌓인다.
 * 뭉쳤을 때는 클러스터러가 아이콘 노드를 복제하는 바람에 핀에 건 리스너가 돌지 않아
 * 클러스터러 이벤트에서 대신 받는다 (marker-link.ts의 `focusFromMap` 주석).
 */
export function drawFeatures(
  inavi: InaviNamespace,
  map: InaviMap,
  features: MapFeature[],
  options: DrawFeatureOptions = {},
): void {
  if (features.length === 0) return;

  const infoWindow = new inavi.maps.InfoWindow({
    content: '',
    offset: INFO_OFFSET,
    zIndexOffSet: 999,
    closeButton: false,
  });

  const markers = features.map((feature, index) => {
    const pin = buildPin(feature, index);
    if (!options.cluster) attachHover(pin, map, infoWindow, feature);

    return new inavi.maps.Marker({
      // 뭉칠 때는 지도에 직접 붙이지 않는다. 클러스터러가 대신 올린다.
      ...(options.cluster ? {} : { map }),
      position: feature.position,
      icon: pin,
      title: feature.title,
    });
  });

  if (options.cluster) attachClusterer(inavi, map, markers, features, infoWindow);
}

/** 핀 하나. 글자를 주지 않으면 순번이 들어간다. */
function buildPin(feature: MapFeature, index: number): HTMLElement {
  const label = feature.label ?? String(index + 1);
  const pin = createPinElement(label, featureColor(feature));
  return feature.decorate ? feature.decorate(pin) : pin;
}

/** 핀과 목록 배지가 **같은 색**이어야 둘이 이어져 읽힌다. 고르는 자리는 여기 하나다. */
function featureColor(feature: MapFeature): string {
  return feature.seriesIndex === undefined
    ? PIN_COLORS[feature.role ?? 'place']
    : seriesColor(feature.seriesIndex);
}

function attachHover(
  pin: HTMLElement,
  map: InaviMap,
  infoWindow: InaviInfoWindow,
  feature: MapFeature,
): void {
  pin.addEventListener('mouseenter', () => {
    infoWindow.setPosition(feature.position);
    infoWindow.setContent(featureCardHtml(feature));
    infoWindow.setMap(map);
  });
  pin.addEventListener('mouseleave', () => {
    infoWindow.setMap();
  });
}

function attachClusterer(
  inavi: InaviNamespace,
  map: InaviMap,
  markers: InaviMarker[],
  features: MapFeature[],
  infoWindow: InaviInfoWindow,
): void {
  const clusterer = new inavi.maps.MarkerClusterer(map, markers, clusterOptions(markers.length));

  // 클러스터를 누르면 한 단계 확대해 안을 펼치고, 개별 마커를 누르면 목록의 그 줄로 간다.
  clusterer.on('click', (e) => {
    if (e.target.cluster) {
      map.flyTo(e.lngLat, { zoom: map.getZoom() + 1, duration: 600 });
      return;
    }

    const index = individualMarkerIndex(e.target.id);
    if (index !== undefined) focusFromMap(index);
  });

  clusterer.on('mouseenter', (e) => {
    const index = individualMarkerIndex(e.target.id);
    const feature = index === undefined ? undefined : features[index];
    if (!feature) return;

    infoWindow.setPosition(e.lngLat);
    infoWindow.setContent(featureCardHtml(feature));
    infoWindow.setMap(map);

    // **목록 줄을 켜고 그 자리로 굴린다.** 켜기만 하면 목록 밖에 있는 줄은 티가 나지
    // 않아 "마커에 올려도 목록이 반응하지 않는다"로 읽혔다(실기 피드백).
    highlight(index, 'map');
  });

  clusterer.on('mouseleave', (e) => {
    if (individualMarkerIndex(e.target.id) !== undefined) {
      infoWindow.setMap();
      highlight(undefined, 'list');
    }
  });
}

/** 정보창 한 장. **지도 위 정보창은 모두 이 카드를 쓴다** (info-card.ts). */
export function featureCardHtml(feature: MapFeature): string {
  return infoCardHtml({
    title: feature.title,
    chip: feature.chip,
    rows: addressRows(feature.address),
    tel: feature.tel,
    meta: [...smallValues(feature), coordinateLine(feature)].filter((line): line is string =>
      Boolean(line),
    ),
  });
}

export interface FeatureListOptions {
  /**
   * 이 목록의 줄이 **지도의 핀과 1:1로 맞는지.** 기본은 참.
   *
   * 참이면 순번 배지를 **핀 모양**으로 그려 목록과 지도를 눈으로 잇는다. 행정구역 경계처럼
   * 면만 그리고 핀을 세우지 않는 결과는 거짓을 줘야 한다 — 없는 마커를 가리키는 꼴이 된다.
   */
  marker?: boolean;
}

export function featureList(features: MapFeature[], options: FeatureListOptions = {}): string {
  const marker = options.marker !== false;
  return features.map((feature, index) => featureItem(feature, index, marker)).join('');
}

/**
 * 배지에 **지도 핀 그림을 그대로** 깐다.
 *
 * 흰 테와 흰 속 원까지 같은 그림이라야 목록 줄과 지도 마커가 한눈에 맞물린다
 * (실기 피드백 — 윤곽만 오려 색으로 채웠더니 "마커와 다르다"고 했다).
 * 글자는 흰 원 안에 앉으므로 **핀과 같은 색**으로 적는다 — 지도 마커와 같은 규칙이다.
 */
function pinBadgeStyle(color: string, art: 'pin' | 'arrow'): string {
  const uri = art === 'arrow' ? arrowSvgDataUri(color) : pinSvgDataUri(color);
  // **따옴표를 두르지 않는다.** `style="...url("data:...")"`는 안쪽 큰따옴표에서 속성이
  // 끊긴다. data URI는 퍼센트 인코딩이라 공백·따옴표가 없어 맨몸으로 써도 된다.
  return `background-image:url(${uri});color:${color}`;
}

export function featurePositions(features: MapFeature[]): LngLatLike[] {
  return features.map((feature) => feature.position);
}

/**
 * 목록 한 줄. **모든 결과가 이 마크업을 쓴다.**
 *
 * **이름과 주소만 펴 두고 나머지는 접는다**(`상세`). 한 줄이 다섯 행(이름 두 줄 + 분류 +
 * 주소 두 줄 + 전화·거리)이라 한 화면에 두 줄 반밖에 들어가지 않았다(실기 피드백).
 * 목록은 **어느 것을 고를지 훑는 자리**이므로 고르는 데 쓰는 두 가지만 남긴다. 나머지는
 * 고른 뒤에 보는 값이라 눌러서 편다. 접을 것이 없으면 버튼도 만들지 않는다.
 *
 * `data-pick-*`는 경로 탐색에 넘길 좌표(POI라면 차량 진입로)이고, `data-pin-*`는 **이 줄의
 * 번호 핀이 선 자리**다. 둘이 100m쯤 떨어질 수 있어 경로 만들기에서 S·E 핀은 후자에 세운다.
 * `data-pick-*`는 경로 만들기 모드에서 출발·도착으로 고를 때 쓰고(render-host.ts),
 * `data-send`는 대화로 넘길 때 쓴다(conversation.ts). 둘 다 위임으로 받으므로 여기서는
 * 값만 실어 둔다.
 */
function featureItem(feature: MapFeature, index: number, marker = true): string {
  const route = feature.routePosition ?? feature.position;
  // 주소 자체가 제목인 결과(지오코딩)에서 같은 줄을 두 번 적지 않는다.
  const primary = primaryAddress(feature.address);
  const address = primary === feature.title ? '' : primary;
  // 전화번호는 제 줄을 받을 만큼 길지 않다. 작은 값들과 같은 줄에 잇는다.
  const meta = [feature.tel, ...smallValues(feature)].filter(Boolean).join(' · ');
  const coordinate = coordinateLine(feature);

  const detail = [
    feature.chip ? `<em>${escapeHtml(feature.chip)}</em>` : '',
    feature.note ? `<span>${escapeHtml(feature.note)}</span>` : '',
    meta ? `<span class="result-meta">${escapeHtml(meta)}</span>` : '',
    coordinate ? `<span class="result-coord">${escapeHtml(coordinate)}</span>` : '',
  ]
    .filter(Boolean)
    .join('');

  return `
    <li class="result-item" data-pick-name="${escapeHtml(feature.title)}"
        data-pick-lng="${route[0]}" data-pick-lat="${route[1]}"
        data-pin-lng="${feature.position[0]}" data-pin-lat="${feature.position[1]}">
      ${badgeHtml(
        'result-index',
        // 지도의 화살표에는 번호가 없다. 배지도 같아야 둘이 한 그림으로 읽힌다.
        feature.art === 'arrow' ? '' : String(index + 1),
        marker ? featureColor(feature) : undefined,
        feature.art,
      )}
      <span class="result-body">
        <strong>${escapeHtml(feature.title)}</strong>
        ${address ? `<span class="result-address">${escapeHtml(address)}</span>` : ''}
        ${detail ? `<span class="result-detail" hidden>${detail}</span>` : ''}
        ${detail ? '<button type="button" class="result-more" data-detail>상세</button>' : ''}
      </span>
      ${sendButton(feature)}
    </li>
  `;
}

/**
 * 순번 배지 한 벌. 목록과 거리 행렬이 같은 것을 쓴다.
 *
 * `color`를 주면 **지도 핀 그림**을 깐다. 주지 않으면(가리킬 마커가 없는 행정구역 경계)
 * 동그라미로 둔다 — 없는 마커를 가리키는 꼴이 되지 않게.
 * 글자가 둘 이상이면 흰 원 안에 들어가도록 줄인다 (지도 마커의 `small-text`와 같은 규칙).
 */
function badgeHtml(
  className: string,
  label: string,
  color: string | undefined,
  art: 'pin' | 'arrow' = 'pin',
): string {
  const classes = [
    className,
    color ? '' : 'is-plain',
    art === 'arrow' ? 'is-arrow' : '',
    label.length > 1 ? 'is-small' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = color ? ` style="${pinBadgeStyle(color, art)}"` : '';

  return `<span class="${classes}"${style}><b>${escapeHtml(label)}</b></span>`;
}

/**
 * 지표 나열. 지도에 자리가 없는 값은 이쪽으로 적는다.
 *
 * **`detail` 줄은 접어 둔다.** 목록 한 줄의 `상세`와 같은 규칙이고, 접을 것이 있을 때만
 * 손잡이를 만든다 (result-detail.ts가 둘을 함께 받는다).
 */
export function statList(rows: ([string, string] | StatRow)[]): string {
  const normalized = rows.map((row) =>
    Array.isArray(row) ? { label: row[0], value: row[1] } : row,
  );
  const toggle = normalized.some((row) => row.detail)
    ? '<li class="stat-item stat-more">' +
      '<button type="button" class="result-more" data-stat-detail>상세</button></li>'
    : '';

  return (
    normalized
      .map((row) => {
        const classes = [
          'stat-item',
          row.value === undefined && 'is-heading',
          row.child && 'is-child',
          row.detail && 'is-detail',
        ]
          .filter(Boolean)
          .join(' ');
        // 색은 map-colors.ts의 팔레트에서만 온다 (seriesColor).
        const badge = row.badge ? badgeHtml('stat-badge', row.badge.text, row.badge.color) : '';
        const value =
          row.value === undefined ? '' : `<span class="stat-value">${escapeHtml(row.value)}</span>`;

        return (
          `<li class="${classes}"${row.detail ? ' hidden' : ''}>${badge}` +
          `<span class="stat-label">${escapeHtml(row.label)}</span>${value}</li>`
        );
      })
      .join('') + toggle
  );
}

/**
 * 목록 맨 위에 붙는 행동 한 줄.
 *
 * 템플릿이 다음 도구를 직접 부르지 않고 **문장만 대화로 넘긴다** (경유지 최적화 → 경로 탐색).
 */
export function actionItem(row: {
  title: string;
  detail: string;
  button: string;
  send: string;
}): string {
  return `
    <li class="result-item">
      <span class="result-body">
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.detail)}</span>
      </span>
      <button type="button" class="send-button" data-send="${escapeHtml(row.send)}"
              title="${escapeHtml(row.title)}">${escapeHtml(row.button)}</button>
    </li>
  `;
}

/**
 * 목록에 적을 대표 주소 한 줄.
 *
 * 도로명이 있으면 도로명, 없으면 지번. 상세(동·호)는 **대표 줄에만** 붙인다 —
 * 정보창에서도 같은 줄에 붙으므로 두 화면이 어긋나지 않는다 (`addressRows`).
 */
export function primaryAddress(address: FeatureAddress | undefined): string {
  if (!address) return '';
  return [address.road || address.lot, address.detail].filter(Boolean).join(' ');
}

/** 정보창의 꼬리표 줄. 값이 빈 줄은 info-card가 만들지 않는다. */
function addressRows(address: FeatureAddress | undefined): [string, string | undefined][] {
  if (!address) return [];

  const { road, lot, detail } = address;
  const withDetail = (value: string | undefined): string | undefined =>
    value && detail ? `${value} ${detail}` : value;

  return road
    ? [
        ['도로명', withDetail(road)],
        ['지번', lot],
      ]
    : [['지번', withDetail(lot)]];
}

function smallValues(feature: MapFeature): string[] {
  return (feature.meta ?? []).filter((value): value is string => Boolean(value));
}

function coordinateLine(feature: MapFeature): string | undefined {
  return feature.showCoordinate ? formatPosition(feature.position) : undefined;
}

function sendButton(feature: MapFeature): string {
  if (!feature.send) return '';

  const message = typeof feature.send === 'string' ? feature.send : defaultMessage(feature);
  return (
    `<button type="button" class="send-button" data-send="${escapeHtml(message)}"` +
    ` title="이 결과를 대화로 보내기">대화로</button>`
  );
}

/** 대화로 넘길 기본 문장. 목록에 보이는 것을 그대로 잇는다. */
function defaultMessage(feature: MapFeature): string {
  return [feature.title, feature.chip, primaryAddress(feature.address), ...smallValues(feature)]
    .filter(Boolean)
    .join(' · ');
}
