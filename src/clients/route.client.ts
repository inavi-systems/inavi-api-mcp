import { inaviHttpClient, type INaviHttpClient } from '@/clients/inavi-http.client';
import type { INaviRouteResponse } from '@/types/inavi-api.types';

/** 자동차 실시간 탐색 옵션 (`route-normal`). */
export const REALTIME_ROUTE_OPTIONS = [
  'real_traffic',
  'real_traffic_freeroad',
  'highway_priority',
] as const;

/** 자동차 통계 예측 탐색 옵션 (`route-time`). 위 셋과 1:1로 대응한다. */
export const PREDICTED_ROUTE_OPTIONS = ['stats', 'stats_freeroad', 'stats_highway'] as const;

/** 도보/PM 탐색 옵션. 요청은 숫자 문자열인데 응답은 이름 문자열로 온다. */
export const PEDESTRIAN_ROUTE_OPTIONS = ['0', '1', '2', '3', '4'] as const;

export type RealtimeRouteOption = (typeof REALTIME_ROUTE_OPTIONS)[number];
export type PredictedRouteOption = (typeof PREDICTED_ROUTE_OPTIONS)[number];
export type PedestrianRouteOption = (typeof PEDESTRIAN_ROUTE_OPTIONS)[number];

/** 경유지 한 곳. */
export interface Via {
  x: number;
  y: number;
}

const MAX_VIA_COUNT = 5;

/** `POST /route-normal` 요청 본문. */
export interface FindRouteParams {
  option: RealtimeRouteOption;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  vias?: Via[];
  carType?: 1 | 2 | 3 | 4 | 5 | 6;
  carHeight?: number;
  carWeight?: number;
  groupByTrafficColor?: boolean;
  useTaxifare?: '0' | '1' | '2' | '3';
}

/** `POST /route-time` 요청 본문. 실시간 탐색에 시각 인자와 비교 개수가 더해진 모양이다. */
export interface FindPredictedRouteParams extends Omit<FindRouteParams, 'option'> {
  option: PredictedRouteOption;
  /** 기준 시각의 의미. `start`=출발 시각, `end`=도착 시각. */
  type: 'start' | 'end';
  year: number;
  month: number;
  day: number;
  hour: number;
  minutes: number;
  /** 기준 시각 이전으로 추가 탐색할 개수. */
  beforeCount?: number;
  /** 기준 시각 이후로 추가 탐색할 개수. */
  afterCount?: number;
  /** 추가 탐색의 시간 간격(분). */
  interval?: number;
}

/** `POST /route-pedestrian` 요청 본문. */
export interface FindPedestrianRouteParams {
  option: PedestrianRouteOption;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  vias?: Via[];
  /** 0=PM(킥보드·자전거), 1=보행자. */
  type?: 0 | 1;
}

/** 탐색 계열. API마다 메서드 하나로 1:1을 유지한다. */
export class RouteClient {
  constructor(private readonly http: INaviHttpClient = inaviHttpClient) {}

  /** 자동차 실시간 경로 탐색. */
  async findRoute(params: FindRouteParams): Promise<INaviRouteResponse> {
    const { vias, ...rest } = params;
    return this.http.post<INaviRouteResponse>('/route-normal', {
      ...rest,
      coordType: 'wgs84',
      ...flattenVias(vias),
    });
  }

  /**
   * 자동차 통계 예측 경로 탐색.
   *
   * ⚠️ 무료 요금제의 일 호출 한도가 30건이다(실시간 탐색 500건). 시각이 필요할 때만 부른다.
   *
   * 응답 `route.data.times[]`의 시각 필드는 **`start_time`·`end_time`**이다.
   * 스펙은 `startTime`·`endTime`으로 선언하지만 실제와 다르다 (실측).
   */
  async findPredictedRoute(params: FindPredictedRouteParams): Promise<INaviRouteResponse> {
    const { vias, ...rest } = params;
    return this.http.post<INaviRouteResponse>('/route-time', {
      ...rest,
      coordType: 'wgs84',
      ...flattenVias(vias),
    });
  }

  /**
   * 도보/PM 경로 탐색.
   *
   * 경유지는 `via1X` 같은 평평한 키가 아니라 `viaList` 배열로 보낸다.
   * 응답 `paths[]`에 스펙에 없는 `speed`·`road_code`·`traffic_color`가 함께 온다 (실측).
   */
  async findPedestrianRoute(params: FindPedestrianRouteParams): Promise<INaviRouteResponse> {
    const { vias = [], ...rest } = params;
    assertViaCount(vias);
    return this.http.post<INaviRouteResponse>('/route-pedestrian', {
      ...rest,
      startX: String(rest.startX),
      startY: String(rest.startY),
      endX: String(rest.endX),
      endY: String(rest.endY),
      viaList: vias.map((via) => ({ viaX: String(via.x), viaY: String(via.y) })),
    });
  }
}

/** 자동차 계열은 경유지를 `via1X`/`via1Y` … `via5X`/`via5Y` 형태의 평평한 키로 받는다. */
function flattenVias(vias: Via[] = []): Record<string, number> {
  assertViaCount(vias);
  return Object.fromEntries(
    vias.flatMap((via, index) => [
      [`via${index + 1}X`, via.x],
      [`via${index + 1}Y`, via.y],
    ]),
  );
}

/**
 * 경유지 한도는 자동차·도보 모두 5개로 맞춘다.
 *
 * 도보 스펙은 `viaList`의 `maxItems`를 100으로 적어 두었으나 API 설명은 "최대 5개"라 서로
 * 모순이다. 실측하지 않고 작은 값을 따른다 — 도보로 경유지 6곳 이상을 지정하는 질의가
 * 현실에 거의 없고, 양쪽을 5로 맞추면 도구 설명도 단순해진다.
 */
function assertViaCount(vias: Via[]): void {
  if (vias.length > MAX_VIA_COUNT) {
    throw new Error(
      `At most ${MAX_VIA_COUNT} waypoints are allowed, but ${vias.length} were given. ` +
        'Drop the extras, or split the trip into several routes.',
    );
  }
}

export const routeClient = new RouteClient();
