import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describeToolError } from './tool-result';

/**
 * 사용자에게 보일 실패 문구를 **결과 코드로** 고른다.
 *
 * 서버가 올리는 에러 메시지에는 `src/clients/inavi-error.ts`가 붙인 **모델용 행동 힌트**가
 * 영문으로 따라온다 — `INAVI Maps API 호출 실패: 100 - Result Not Found\nNothing matched. Broaden
 * the search...`. 그건 모델이 다음 수를 고르라고 준 것이지 사람이 읽을 문장이 아닌데, 템플릿이
 * 그대로 띄워 지도 아래 띠에 영문 지시문이 떴다.
 *
 * **모델 쪽 힌트는 그대로 둔다** — 모델이 그걸 읽고 검색어를 바꿔 다시 불러 성공한 것을
 * 실측했다. 고치는 곳은 템플릿 표시뿐이고, 그래서 **사용자 문구는 여기 한 곳에서만** 고른다.
 *
 * 표에 적는 것은 템플릿이 실제로 마주칠 코드다. 검색·주소 쪽 재호출(queries.ts)에서 1xx·2xx가,
 * 어느 도구에서나 3xx가 온다. 경로 쪽 5xx·6xx는 모델이 부른 결과를 그릴 때와 옵션 재호출에서
 * 오므로 갈래만 적고 나머지는 대역으로 떨군다.
 */

/**
 * **어디서 물었는지.** 같은 코드라도 쓸 말이 다르다 — 결과 없음(`100`)을 지도 클릭 한 번 한
 * 사람에게 "영역을 다시 설정하라"고 말할 수는 없다. 부르는 자리가 이 짝을 골라 넘긴다.
 */
export interface ErrorPlace {
  /** `{where}` 자리에 들어갈 이름. */
  where: string;
  /** 결과 없음(`100`)일 때 쓸 문구. */
  empty: string;
}

/**
 * 지도 영역에서 찾았을 때 (현재 지도에서 재검색).
 *
 * **없다는 말만 한다.** `영역을 다시 설정해주세요`까지 붙였더니 오른쪽 아래 띠의 좁은 폭에서
 * `설정해주 / 세요`로 꺾였다. 할 일은 알약 버튼이 이미 말한다.
 */
export const SEARCH_AREA: ErrorPlace = {
  where: '이 영역',
  empty: '검색 결과가 존재하지 않습니다.',
};

/** 지도에서 한 지점을 클릭했을 때 (경로 만들기에서 고른 자리). */
export const CLICKED_POINT: ErrorPlace = {
  where: '그 지점',
  empty: '주소가 존재하지 않습니다. 다른 지점을 클릭해주세요.',
};

/**
 * 코드별 사용자 문구. `{where}`는 어디를 찾았는지로 바뀐다.
 *
 * 결과 없음(`100`)은 여기 없다 — 자리마다 쓸 말이 달라 `ErrorPlace.empty`가 가지고 있다.
 */
const USER_TEXT: Record<number, string> = {
  101: '요청 값이 올바르지 않아 조회하지 못했습니다.',
  102: 'INAVI Maps 서버가 잠시 응답하지 못했습니다. 다시 시도해 보세요.',

  201: '검색할 수 없는 지역입니다.',
  202: '좌표가 대한민국 범위를 벗어났습니다.',
  204: '쓸 수 없는 검색어입니다.',
  205: '{where}에서는 찾은 결과가 없습니다. 더 넓은 행정구역으로 찾아 보세요.',
  206: '{where}에서는 찾은 결과가 없습니다. 범위를 넓혀 보세요.',
  207: '그 분류로는 {where}에서 찾은 결과가 없습니다.',
  208: '이 자리는 주변 검색만 할 수 있습니다.',

  300: 'API Key 인증에 실패했습니다. 서버 설정을 확인해야 합니다.',
  301: '허용되지 않은 요청 경로입니다. 서버 설정을 확인해야 합니다.',
  302: '오늘 쓸 수 있는 호출을 모두 썼습니다. 내일 다시 시도해 주세요.',

  400: '요청 형식이 올바르지 않습니다.',
  401: '인증이 필요합니다. 서버 설정을 확인해야 합니다.',
  403: '이 기능을 쓸 권한이 없습니다. 서버 설정을 확인해야 합니다.',
  404: '없는 API입니다. 서버 설정을 확인해야 합니다.',
  500: 'INAVI Maps 서버에서 오류가 났습니다. 다시 시도해 보세요.',

  501: '경로를 찾지 못했습니다. 출발지나 도착지를 도로 가까운 곳으로 옮겨 보세요.',
  505: '경로를 찾지 못했습니다. 출발지나 도착지를 도로 가까운 곳으로 옮겨 보세요.',
  537: '탐색할 수 있는 거리를 넘었습니다. 구간을 나눠 찾아 보세요.',
  543: '도착지가 섬이라 자동차 경로가 없습니다.',
  544: '출발지나 도착지가 섬이라 경로를 만들 수 없습니다.',
  691: '탐색이 오래 걸려 멈췄습니다. 지점 수를 줄여 보세요.',
};

/** 자리를 넣지 않았을 때. 모델이 부른 결과를 그릴 때가 그렇다 — 어느 도구인지 모른다. */
const DEFAULT_PLACE: ErrorPlace = { where: '요청한 곳', empty: SEARCH_AREA.empty };

/**
 * 결과 코드에 맞는 사용자 문구.
 *
 * 모르는 코드는 **원문을 그대로 베끼지 않는다** — 원문에 모델용 힌트가 붙어 온다.
 * 대신 코드를 함께 적어, 문의할 때 짚을 것은 남긴다.
 */
export function userErrorText(code: number | undefined, place = DEFAULT_PLACE): string {
  if (code === undefined) return '요청을 처리하지 못했습니다.';
  if (code === NOT_FOUND) return place.empty;

  const known = USER_TEXT[code];
  if (known) return known.replace('{where}', place.where);

  // 경로·최적화·매트릭스의 세부 실패는 종류가 많지만 사용자가 할 일은 같다.
  if (code >= 500) return `경로를 찾지 못했습니다. (코드 ${code})`;
  if (code >= 400) return `요청이 거절됐습니다. (코드 ${code})`;
  if (code >= 300) return `서버 설정을 확인해야 합니다. (코드 ${code})`;
  return `조회하지 못했습니다. (코드 ${code})`;
}

/** iNavi가 "찾은 것이 없다"고 답할 때의 코드. 고장이 아니라 **없다는 답**이다. */
const NOT_FOUND = 100;

/** 서버 에러 메시지에서 결과 코드를 집는다 (`INAVI Maps API 호출 실패: 100 - ...`). */
export function readResultCode(message: string): number | undefined {
  const matched = /호출 실패:\s*(\d+)/.exec(message);
  return matched ? Number(matched[1]) : undefined;
}

/**
 * 실패한 도구 결과를 **사용자가 읽을** 한 문장으로.
 *
 * `describeToolError`는 원문 그대로를 돌려준다 — 그건 로그와 모델의 몫이고,
 * 화면에 띄울 것은 이 함수가 고른다.
 */
export function toolErrorText(result: CallToolResult, place = DEFAULT_PLACE): string {
  return userErrorText(readResultCode(describeToolError(result)), place);
}

/**
 * 사용자에게 보일 문구와 **기술 원인을 따로** 들고 다니는 에러.
 *
 * 지도 SDK가 뜨지 않는 까닭은 호스트 CSP·CDN 차단·blob Worker처럼 전부 연동 쪽 사정이다.
 * 그 설명은 **붙잡아 둘 값이지 사용자에게 읽힐 값이 아니다** —
 * 화면에는 `userText`만 내보내고 원인은 `message`에 남겨 개발자 도구에서 보게 한다.
 */
export class DisplayError extends Error {
  constructor(
    readonly userText: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'DisplayError';
  }
}

/**
 * 잡은 예외를 **화면에 띄울 한 문장**으로.
 *
 * `DisplayError`면 고른 문구를, 서버 실패 원문이면 코드로 고른 문구를 쓴다. 그 밖은
 * 우리가 던진 것이라 이미 사용자 문구다 (`queries.ts`·`dom.ts`).
 */
export function displayText(error: unknown): string {
  if (error instanceof DisplayError) return error.userText;
  if (!(error instanceof Error)) return '요청을 처리하지 못했습니다.';

  const code = readResultCode(error.message);
  return code === undefined ? error.message : userErrorText(code);
}
