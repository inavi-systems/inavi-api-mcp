import { inaviHttpClient, type INaviHttpClient } from '@/clients/inavi-http.client';
import type { INaviRouteResponse } from '@/types/inavi-api.types';

/** `POST /route-optimize-points-10` 요청 본문. */
export interface OptimizeWaypointOrderParams {
  /** 0=출발지 고정, 1=도착지 고정, 2=출-도착지 고정. */
  routeType: 0 | 1 | 2;
  /** 순서를 정할 경유지 목록. 최대 10곳. */
  vias: { x: number; y: number }[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
}

const MAX_VIA_COUNT = 10;

/** 최적화 계열. */
export class OptimizeClient {
  constructor(private readonly http: INaviHttpClient = inaviHttpClient) {}

  /**
   * TSP — 경유지 방문 순서를 최적화해 전체 이동거리를 최소화한다.
   *
   * ⚠️ 무료 요금제의 일 호출 한도가 10건이다.
   *
   * 엔드포인트가 10/30/50/100 네 가지인데 **10만 쓴다.** 한도가 같은 수준이라 더 큰 것을 둘
   * 실익이 없다. 응답은 순서와 구간별 거리·시간뿐이고 좌표가 없어 매우 가볍다(약 0.5KB).
   */
  async optimizeWaypointOrder(params: OptimizeWaypointOrderParams): Promise<INaviRouteResponse> {
    const { vias, ...rest } = params;

    if (vias.length < 1 || vias.length > MAX_VIA_COUNT) {
      throw new Error(
        `Between 1 and ${MAX_VIA_COUNT} stops are allowed, but ${vias.length} were given. ` +
          'Origin, destination and stops together must come to at least three points.',
      );
    }

    return this.http.post<INaviRouteResponse>('/route-optimize-points-10', {
      ...rest,
      startX: optionalString(rest.startX),
      startY: optionalString(rest.startY),
      endX: optionalString(rest.endX),
      endY: optionalString(rest.endY),
      viaList: vias.map((via) => ({ viaX: String(via.x), viaY: String(via.y) })),
    });
  }
}

function optionalString(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

export const optimizeClient = new OptimizeClient();
