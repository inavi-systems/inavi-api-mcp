/**
 * iNavi Maps Web JS SDK의 최소 타입 선언.
 *
 * 공식 타입 패키지가 없으므로, 검증된 예제에서 실제로 쓰는 표면만 옮겨 적었다.
 * (marker-basic · marker-movable · marker-numbering · shapes-polyline · shapes-circle ·
 *  shapes-polygon · infowindow-basic · infowindow-clustered-markers · dynamic-map-type ·
 *  dynamic-map-info · dynamic-distance-calculation)
 *
 * 여기 없는 옵션은 임의로 추가하지 말 것 — iNavi Maps API는 Google Maps API와 다르다.
 */

export type LngLatLike = [number, number];

/** SDK가 좌표를 돌려줄 때의 형태 (`getCenter`, 이벤트의 `lngLat`). */
export interface InaviLngLat {
  lng: number;
  lat: number;
}

/** 위치를 넘길 때는 배열과 SDK 좌표 객체 둘 다 받는다. */
export type PositionLike = LngLatLike | InaviLngLat;

/** `getBounds()`가 돌려주는 현재 화면 영역. */
export interface InaviBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface InaviMapMouseEvent {
  lngLat: InaviLngLat;
}

export interface InaviMap {
  getCenter(): InaviLngLat;
  getZoom(): number;
  getBounds(): InaviBounds;
  setStyle(styleUrl: string): void;
  on(event: 'click', handler: (e: InaviMapMouseEvent) => void): void;
  off(event: 'click', handler: (e: InaviMapMouseEvent) => void): void;
  /** 지도를 다 옮긴 뒤. 끌고 다니는 동안에는 오지 않는다 (`move`와 다르다). */
  on(event: 'moveend', handler: () => void): void;
  off(event: 'moveend', handler: () => void): void;
  flyTo(center: PositionLike, options?: { zoom?: number; duration?: number }): void;
  fitCoordinates(
    coordinates: LngLatLike[],
    options?: { duration?: number; padding?: FitPadding },
  ): void;
}

/** 여백 하나면 네 변에 같이, 객체면 변마다 (SDK `PaddingOptions`). 단위는 픽셀. */
export type FitPadding = number | { top: number; bottom: number; left: number; right: number };

export interface InaviMarker {
  setMap(map?: InaviMap | null): void;
  getPosition(): InaviLngLat;
}

export interface InaviInfoWindow {
  setPosition(position: PositionLike): void;
  setContent(content: string): void;
  setMap(map?: InaviMap | null): void;
}

export interface InaviClusterEvent {
  target: { id?: string; cluster?: boolean };
  lngLat: InaviLngLat;
}

/** 클러스터 풍선의 모양. `icons`는 이미지 URL만 받아 data URI로 넘긴다 (render/pin.ts). */
export interface InaviClustererOptions {
  /** 뭉치기 시작하는 마커 사이 거리(px). SDK 기본 80. */
  gridSize?: number;
  /** 이 배율을 넘으면 뭉치지 않는다. SDK 기본 18. */
  maxZoom?: number;
  styles?: {
    steps?: number[];
    icons?: { url: string; size: [number, number]; position: [number, number] }[];
    textColor?: string;
    textSize?: number;
  };
}

export interface InaviMarkerClusterer {
  on(event: 'click' | 'mouseenter' | 'mouseleave', handler: (e: InaviClusterEvent) => void): void;
}

export interface InaviPolylineStyle {
  lineCap: 'round' | 'butt' | 'square';
  lineColor: string;
  lineJoin: 'round' | 'bevel' | 'miter';
  lineWidth: number;
}

/** Circle · Polygon 공통 스타일 (shapes-circle / shapes-polygon 예제). */
export interface InaviShapeStyle {
  fillOpacity: number;
  fillColor: string;
  fillOutlineColor: string;
}

export interface InaviOverlay {
  setMap(map?: InaviMap | null): void;
}

export interface InaviNamespace {
  maps: {
    Map: new (options: { center: LngLatLike; container: string; zoom: number }) => InaviMap;
    Marker: new (options: {
      map?: InaviMap;
      position: PositionLike;
      icon?: string | HTMLElement;
      title?: string;
    }) => InaviMarker;
    Polyline: new (options: {
      map: InaviMap;
      path: LngLatLike[];
      style: InaviPolylineStyle;
      zIndex?: number;
    }) => InaviOverlay;
    Circle: new (options: {
      map: InaviMap;
      position: PositionLike;
      /** 단위는 km다. 500m를 그리려면 0.5를 넘긴다. */
      radius: number;
      style: InaviShapeStyle;
    }) => InaviOverlay;
    Polygon: new (options: {
      map: InaviMap;
      path: LngLatLike[];
      style: InaviShapeStyle;
    }) => InaviOverlay;
    InfoWindow: new (options: {
      content: string;
      position?: PositionLike;
      offset?: [number, number];
      zIndexOffSet?: number;
      closeButton?: boolean;
    }) => InaviInfoWindow;
    MarkerClusterer: new (
      map: InaviMap,
      markers: InaviMarker[],
      options?: InaviClustererOptions,
    ) => InaviMarkerClusterer;
  };
}

declare global {
  interface Window {
    inavi?: InaviNamespace;
  }
}
