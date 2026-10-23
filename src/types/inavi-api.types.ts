/**
 * iNavi Maps Open API 공통 타입.
 *
 * 클라이언트 계층은 iNavi 응답을 그대로 받아 넘긴다(봉투 통일·절삭은 도구 계층의 일이다).
 * 그래서 본문은 **최상위 봉투 키만** 고정하고
 * 나머지는 `unknown`으로 둔다. 모델에게 나갈 응답의 구조 선언은 도구 쪽
 * `outputSchema`가 맡는다.
 *
 * 봉투 키가 API마다 다른 것이 곧 `EnvelopeShape`의 근거다 (`tools/common/envelope.ts`).
 */

/** 모든 iNavi 응답에 붙는 헤더. 실패해도 HTTP 200으로 오므로 이 값을 반드시 확인해야 한다. */
export interface INaviResponseHeader {
  isSuccessful: boolean;
  resultCode: number;
  resultMessage: string;
}

export interface INaviBaseResponse {
  header?: INaviResponseHeader;
  [key: string]: unknown;
}

/** 통합 검색 (`GET /searches`) · 다국어 통합 검색 (`GET /g-searches`) */
export interface INaviSearchResponse extends INaviBaseResponse {
  search?: Record<string, unknown>;
}

/** 주변 카테고리 검색 (`GET /nearby-category-searches`) */
export interface INaviNearbyCategoryResponse extends INaviBaseResponse {
  cate?: Record<string, unknown>;
}

/** 최적 지점 검색 (`GET /optimal-position-searches`). 유일하게 본문 키가 이미 `data`다. */
export interface INaviOptimalPositionResponse extends INaviBaseResponse {
  data?: Record<string, unknown>;
}

/** 지오코딩 (`GET /coordinates`) */
export interface INaviGeocodeResponse extends INaviBaseResponse {
  address?: Record<string, unknown>;
}

/** 리버스 지오코딩 (`GET /addresses`) */
export interface INaviReverseGeocodeResponse extends INaviBaseResponse {
  /** 결과가 없으면 이 키 자체가 오지 않는다 (바다 위 좌표 등). */
  location?: Record<string, unknown>;
}

/** 공간 검색 (`POST /adminToPolygon`) */
export interface INaviPolygonResponse extends INaviBaseResponse {
  polygon?: Record<string, unknown>;
}

/**
 * 경로 계열 응답. 본문이 `route.data`로 **두 겹**이다.
 *
 * 자동차(`route-normal`) · 예측(`route-time`) · 도보/PM(`route-pedestrian`) ·
 * TSP(`route-optimize-points-10`)가 모두 이 모양이다.
 */
export interface INaviRouteResponse extends INaviBaseResponse {
  route?: { data?: Record<string, unknown> };
}

/**
 * RDM (`POST /route-distance-matrix`). **본문 래퍼 키가 없다.**
 *
 * `{ header, mode, origins, destinations, rows }`로 평평하게 온다. 이런 봉투는 RDM뿐이다.
 */
export interface INaviDistanceMatrixResponse extends INaviBaseResponse {
  mode?: string;
  origins?: string[];
  destinations?: string[];
  rows?: unknown[];
}

/** 쿼리스트링으로 나갈 수 있는 값. `undefined`는 전송에서 제외된다. */
export type QueryValue = string | number | boolean | undefined;
