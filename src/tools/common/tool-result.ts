import type { DataEnvelope, PayloadKind } from '@/tools/common/envelope';
import type { Coord } from '@/tools/common/split-coords';
import type { WaypointPlaces } from '@/tools/common/schema/waypoint-place.input.schema';

/**
 * 도구 응답을 조립한다.
 *
 * `content`(문자열)와 `structuredContent`(객체)에 **같은 것**을 담는다. SDK v1은 `outputSchema`가
 * 있으면 `structuredContent`를 요구하고, 검증은 통과 여부만 보므로 원본이 그대로 나간다.
 *
 * `_meta`는 **템플릿까지만 가고 모델 컨텍스트에는 오지 않는다** (Claude Desktop 실측, 좌표
 * 7,357개까지 확인). 그래서 지도 품질은 그대로 두고 대화 부담만 줄일 수 있다.
 */
export interface ToolResultOptions {
  /** 템플릿이 무엇을 그릴지 고르는 값. 봉투 통일로 최상위 키가 전부 `data`가 되어 대신 쓴다. */
  kind: PayloadKind;
  /** 지도를 그릴지 접을지. 기본이 꺼짐이라 중간 단계 조회로 지도가 쌓이지 않는다. */
  showMap: boolean;
  /** 응답에서 뺀 경로 좌표. 템플릿이 되꽂아 그린다. */
  routeCoords?: Coord[][];
  /** 응답에서 뺀 폴리곤 좌표. 폴리곤 목록을 평탄하게 펼친 순서다. */
  polygonCoords?: Coord[][];
  /**
   * 좌표로 받은 각 자리(출발·경유·도착, 행렬·최적 순서의 지점)가 **어떤 장소인지**.
   * 응답이 아니라 **입력**에서 온다.
   *
   * API는 좌표만 돌려주므로, 모델이 적어 보낸 것을 그대로 템플릿에 넘긴다
   * (`waypoint-place.input.schema.ts`). 본문은 손대지 않는다.
   */
  places?: WaypointPlaces;
}

export function toolResult(body: DataEnvelope, options: ToolResultOptions) {
  const { kind, showMap, routeCoords, polygonCoords, places } = options;

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
    _meta: {
      kind,
      showMap,
      ...(routeCoords ? { routeCoords } : {}),
      ...(polygonCoords ? { polygonCoords } : {}),
      ...(places ? { places } : {}),
    },
  };
}
