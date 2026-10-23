import { inaviHttpClient, type INaviHttpClient } from '@/clients/inavi-http.client';
import type { INaviDistanceMatrixResponse } from '@/types/inavi-api.types';

/** `POST /route-distance-matrix` 요청 본문. */
export interface GetDistanceMatrixParams {
  /** 출발 지점들. **2곳 이상**이어야 한다 (API 제약). */
  points: { x: number; y: number }[];
  /** 도착 지점들. 비우면 `points`끼리의 행렬이 된다. */
  dests?: { x: number; y: number }[];
  /** 0=교통 정보 미사용(기본), 1=실시간 반영. */
  traffic?: 0 | 1;
  /**
   * 차량 총 중량(kg). 중량 제한 교량·도로를 피한다.
   *
   * `find_route`의 `carWeight`와 같은 뜻이지만 원본 이름이 `weight`다. 다만 RDM에는
   * `carType`이 없어 "대형화물차" 같은 차종 지정은 못 하고 숫자만 받는다.
   */
  weight?: number;
  /** 차량 높이(cm). 높이 제한 지하차도를 피한다. `find_route`의 `carHeight`와 같은 뜻이다. */
  height?: number;
}

const MIN_POINTS = 2;
const MAX_POINTS = 100;

/** 매트릭스 계열. */
export class MatrixClient {
  constructor(private readonly http: INaviHttpClient = inaviHttpClient) {}

  /**
   * RDM — 여러 지점 사이의 거리·시간을 행렬로 받는다.
   *
   * ⚠️ 무료 요금제의 일 호출 한도가 10건이다. 도구 설명에는 적지 않는다(모델이 그것으로 도구를 고른다).
   *
   * 응답만 **본문 래퍼 키가 없이** 평평하게 온다(`{ header, mode, origins, destinations, rows }`).
   * `origins`·`destinations`는 좌표 객체가 아니라 `"경도,위도"` 문자열 배열이다.
   *
   * 정렬이나 상위 N개 절삭이 없어 전체 행렬이 그대로 온다. 지점 수가 곧 응답 크기다.
   */
  async getDistanceMatrix(params: GetDistanceMatrixParams): Promise<INaviDistanceMatrixResponse> {
    const { points, dests = [], ...rest } = params;

    if (points.length < MIN_POINTS || points.length > MAX_POINTS) {
      throw new Error(
        `points must hold between ${MIN_POINTS} and ${MAX_POINTS} origins, but ` +
          `${points.length} were given. For one origin to many destinations, call find_route ` +
          'once per destination instead.',
      );
    }
    if (dests.length > MAX_POINTS) {
      throw new Error(
        `dests takes at most ${MAX_POINTS} destinations, but ${dests.length} were given.`,
      );
    }

    return this.http.post<INaviDistanceMatrixResponse>('/route-distance-matrix', {
      ...rest,
      points: points.map(toPos),
      ...(dests.length > 0 ? { dests: dests.map(toPos) } : {}),
    });
  }
}

function toPos(point: { x: number; y: number }): { posX: string; posY: string } {
  return { posX: String(point.x), posY: String(point.y) };
}

export const matrixClient = new MatrixClient();
