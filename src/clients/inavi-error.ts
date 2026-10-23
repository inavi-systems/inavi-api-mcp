/**
 * iNavi 실패 응답에 **행동 힌트**를 붙인다.
 *
 * 원문(`300 - Authentication Failed`)만 올리면 모델이 할 수 있는 게 없다. 원문은 그대로 두고
 * "이제 무엇을 하라"를 한 문장 덧붙인다. 갈래는 넷이면 충분하다.
 *
 * 힌트는 **모델이 읽는 문자열이라 영문으로 쓴다** — 한국어는 토큰 단가가 2~3배다.
 *
 * 에러 코드를 전부 문장으로 옮기지는 않는다. 코드 표는 형제 서버의 `get_api_spec`으로 조회할 수
 * 있고, 우리가 쓰는 카테고리는 6종이다(장소/지오코딩/공간/탐색/최적화/매트릭스).
 * 여기 적은 것은 **대화에서 실제로 마주칠 만한 것들**이다.
 *
 * 힌트는 모델 전용이다. 템플릿은 이 문자열을 화면에 띄우지 않고 결과 코드로 문구를 고른다
 * (`ui/src/host/error-text.ts`).
 */

/** 실패를 만났을 때 모델이 취할 행동. */
export type INaviErrorKind =
  /** 일시적 실패. 같은 인자로 한 번 더 부를 만하다. */
  | 'retryable'
  /** 인자가 잘못됐다. 고쳐서 다시 부른다. */
  | 'bad-argument'
  /** 서버·권한 문제. 재시도가 무의미하니 사용자에게 알린다. */
  | 'tell-user'
  /** 호출 한도 소진. 재시도해도 소용없고 사용자에게 알려야 한다. */
  | 'quota';

interface ErrorAdvice {
  kind: INaviErrorKind;
  hint: string;
}

const RETRY = (hint: string): ErrorAdvice => ({ kind: 'retryable', hint });
const ARG = (hint: string): ErrorAdvice => ({ kind: 'bad-argument', hint });
const TELL = (hint: string): ErrorAdvice => ({ kind: 'tell-user', hint });

/** 코드별 힌트. 없는 코드는 아래 기본 갈래로 떨어진다. */
const ADVICE: Record<number, ErrorAdvice> = {
  100: ARG('Nothing matched. Broaden the search or try different wording, then call again.'),
  101: ARG(
    'An argument is invalid. Check the required arguments and coordinate ranges, then retry.',
  ),
  102: RETRY(
    'Temporary INAVI Maps server error. Retrying once with the same arguments is reasonable.',
  ),

  201: TELL('This is a restricted site that cannot be searched. Suggest a different location.'),
  202: ARG(
    'The longitude or latitude is out of range. Check it falls inside South Korea ' +
      '(longitude 124 to 132, latitude 33 to 39).',
  ),
  204: ARG('The query is not usable. Rephrase it and call again.'),
  205: ARG('No results inside that district. Drop admcode or widen it to a larger district.'),
  206: ARG('No results inside that area. Widen the radius or the bounding box.'),
  207: ARG('No results in that category. Change catecode or drop it and call again.'),
  208: ARG('Only a nearby search is possible here. Supply a centre coordinate and a radius.'),

  300: TELL(
    'App key authentication failed. Retrying will not help — tell the user this is a ' +
      'configuration problem on the server side.',
  ),
  301: TELL('The request path is not permitted. Retrying will not help. Tell the user.'),
  302: {
    kind: 'quota',
    hint:
      'The daily call quota for this API is used up. Retrying will not help. Tell the user the ' +
      'limit has been reached, and fall back to another tool if one can answer the question.',
  },

  400: ARG('The request was malformed. Fix the arguments and call again.'),
  401: TELL('Authentication is required. This is a configuration problem — tell the user.'),
  403: TELL('Access denied. This app key lacks permission for that API. Tell the user.'),
  404: TELL('No such API. This is a server configuration problem. Tell the user.'),
  500: RETRY(
    'Internal INAVI Maps server error. Retrying once with the same arguments is reasonable.',
  ),

  501: ARG(
    'No route was found. Try the road-entrance coordinates (rpx/rpy) for the origin and ' +
      'destination instead.',
  ),
  505: ARG('Every route attempt failed. Move the origin or destination closer to a road.'),
  510: ARG('An argument is invalid. Check the coordinates and option values.'),
  532: ARG('A request argument is invalid. Check the coordinate format and option values.'),
  533: ARG('The origin is not usable. Correct it with find_entry_points and call again.'),
  534: ARG('The destination is not usable. Correct it with find_entry_points and call again.'),
  535: ARG('A waypoint is not usable. Check its coordinates or drop it.'),
  537: TELL(
    'The trip exceeds the routable distance (1,000 km driving, 20 km walking). Split it into ' +
      'shorter legs.',
  ),
  543: TELL(
    'The destination is an island with no ferry route. Tell the user no driving route exists.',
  ),
  544: TELL('The origin or destination is an island, so no route can be built. Tell the user.'),

  670: ARG('The origin did not match the road network. Correct it with find_entry_points.'),
  671: ARG('The destination did not match the road network. Correct it with find_entry_points.'),
  672: ARG('A waypoint did not match the road network. Correct or remove that point.'),
  690: TELL('The routing range was exceeded. Reduce the distance between the points.'),
  691: RETRY('Routing timed out. Reduce the number of points and try again.'),
};

/** 코드에 맞는 갈래와 힌트를 고른다. 표에 없으면 코드 대역으로 판단한다. */
export function adviseError(resultCode: number): ErrorAdvice {
  const known = ADVICE[resultCode];
  if (known) return known;

  // 탐색·최적화·매트릭스의 세부 실패는 종류가 많지만 모델이 할 일은 같다.
  if (resultCode >= 500) {
    return ARG(
      'Routing failed. Check the origin, destination and waypoint coordinates, then call again.',
    );
  }
  if (resultCode >= 400) {
    return ARG('The request was rejected. Check the arguments and call again.');
  }
  return TELL('Unknown failure. Pass the original message through to the user as it is.');
}
