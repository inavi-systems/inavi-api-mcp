import { vi } from 'vitest';
import type {
  InaviBounds,
  InaviClusterEvent,
  InaviMap,
  InaviMapMouseEvent,
  InaviNamespace,
  InaviShapeStyle,
  LngLatLike,
  InaviPolylineStyle,
  PositionLike,
} from '../../ui/src/map/inavi';

export interface RecordedPolyline {
  path: LngLatLike[];
  style: InaviPolylineStyle;
  zIndex?: number;
}

export interface RecordedMarker {
  position: PositionLike;
  title?: string;
  icon?: string | HTMLElement;
  attachedToMap: boolean;
}

export interface RecordedShape {
  kind: 'circle' | 'polygon';
  style: InaviShapeStyle;
  /** circle일 때만 */
  position?: PositionLike;
  /** circle일 때만. 단위는 km. */
  radius?: number;
  /** polygon일 때만 */
  path?: LngLatLike[];
}

export const FAKE_BOUNDS: InaviBounds = {
  south: 37.39,
  west: 127.1,
  north: 37.41,
  east: 127.12,
};

/**
 * iNavi Web SDK를 흉내 내는 테스트 대역.
 * 렌더러가 "무엇을 그렸는지"를 기록해 검증할 수 있게 한다.
 */
export function createFakeInavi() {
  const polylines: RecordedPolyline[] = [];
  const markers: RecordedMarker[] = [];
  const shapes: RecordedShape[] = [];
  const clusterHandlers = new Map<string, (e: InaviClusterEvent) => void>();
  const mapHandlers = new Map<string, (e: InaviMapMouseEvent) => void>();
  /** 지도 움직임 핸들러. 인자가 없어 클릭 쪽과 따로 담는다. */
  const moveHandlers = new Set<() => void>();
  const fitCalls: LngLatLike[][] = [];
  const infoWindowContents: string[] = [];
  const infoWindowPositions: PositionLike[] = [];
  const styleUrls: string[] = [];
  const clustererOptions: unknown[] = [];

  /** 지금 보고 있는 화면. 테스트가 `panTo`로 옮긴다. */
  let view: InaviBounds = FAKE_BOUNDS;

  const map = {
    getCenter: () => ({
      lng: (view.west + view.east) / 2,
      lat: (view.south + view.north) / 2,
    }),
    getZoom: () => 13,
    getBounds: () => view,
    setStyle: (url: string) => {
      styleUrls.push(url);
    },
    on: (event: string, handler: (e: InaviMapMouseEvent) => void) => {
      // 지도 움직임은 인자가 없어 따로 담는다. 여럿이 함께 들을 수 있다.
      if (event === 'moveend') {
        moveHandlers.add(handler as unknown as () => void);
        return;
      }
      mapHandlers.set(event, handler);
    },
    off: (event: string, handler?: (e: InaviMapMouseEvent) => void) => {
      if (event === 'moveend') {
        moveHandlers.delete(handler as unknown as () => void);
        return;
      }
      mapHandlers.delete(event);
    },
    flyTo: vi.fn(),
    fitCoordinates: (coordinates: LngLatLike[]) => {
      fitCalls.push(coordinates);
    },
  } as unknown as InaviMap;

  const inavi = {
    maps: {
      Map: class {
        constructor() {
          return map;
        }
      },
      Marker: class {
        private readonly at: PositionLike;
        /** 자기 기록을 들고 있는다. 붙이고 떼는 것까지 기록해야 "걷었는지"를 볼 수 있다. */
        private readonly record: RecordedMarker;
        constructor(options: {
          map?: InaviMap;
          position: PositionLike;
          title?: string;
          icon?: string | HTMLElement;
        }) {
          this.at = options.position;
          this.record = {
            position: options.position,
            title: options.title,
            icon: options.icon,
            attachedToMap: options.map !== undefined,
          };
          markers.push(this.record);
        }
        getPosition() {
          return this.at;
        }
        setMap(map: InaviMap | null) {
          this.record.attachedToMap = map !== null && map !== undefined;
        }
      },
      Polyline: class {
        constructor(options: { path: LngLatLike[]; style: InaviPolylineStyle; zIndex?: number }) {
          polylines.push({ path: options.path, style: options.style, zIndex: options.zIndex });
        }
        setMap() {}
      },
      Circle: class {
        constructor(options: { position: PositionLike; radius: number; style: InaviShapeStyle }) {
          shapes.push({
            kind: 'circle',
            position: options.position,
            radius: options.radius,
            style: options.style,
          });
        }
        setMap() {}
      },
      Polygon: class {
        constructor(options: { path: LngLatLike[]; style: InaviShapeStyle }) {
          shapes.push({ kind: 'polygon', path: options.path, style: options.style });
        }
        setMap() {}
      },
      InfoWindow: class {
        setPosition(position: PositionLike) {
          infoWindowPositions.push(position);
        }
        setContent(content: string) {
          infoWindowContents.push(content);
        }
        setMap() {}
      },
      MarkerClusterer: class {
        constructor(_map: InaviMap, _markers: unknown[], options?: unknown) {
          clustererOptions.push(options);
        }
        on(event: string, handler: (e: InaviClusterEvent) => void) {
          clusterHandlers.set(event, handler);
        }
      },
    },
  } as unknown as InaviNamespace;

  return {
    inavi,
    map,
    clustererOptions,
    polylines,
    markers,
    shapes,
    clusterHandlers,
    mapHandlers,
    /** 지도를 다 옮긴 척한다. 영역을 주면 그 영역으로 옮긴 뒤 알린다. */
    moveMap: (next?: InaviBounds) => {
      if (next) view = next;
      moveHandlers.forEach((handler) => {
        handler();
      });
    },
    moveHandlers,
    fitCalls,
    infoWindowContents,
    infoWindowPositions,
    styleUrls,
  };
}
