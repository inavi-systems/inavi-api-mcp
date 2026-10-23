import { app } from './app-instance';
import type { InaviBounds } from '../map/inavi';
import { noteTemplateSearch, type SearchArguments } from './tool-context';
import type { SearchTool, ToolPayload } from '../shared/payload';
import { readToolBody } from './tool-result';
import { restoreCoords } from './restore-coords';
import {
  CLICKED_POINT,
  SEARCH_AREA,
  toolErrorText,
  userErrorText,
  type ErrorPlace,
} from './error-text';

/**
 * 템플릿이 스스로 하는 조회. 전부 `app.callServerTool`로 서버 도구를 부른다 — 검색 재호출
 * (`runSearch`), 경로·옵션 재호출(`runRoute`·`runOptionTool`), 클릭 지점 주소(`reverseGeocodeAt`).
 * 모델을 거치지 않아 대화에 남지 않고, 앱키는 서버에 머문다.
 *
 * **브라우저에서 iNavi REST를 직접 부르던 길은 걷어냈다** (CLAUDE.md). 다시 열지 말 것.
 */

/** 경로를 옵션만 바꿔 다시 부를 수 있는 도구. 자동차와 도보는 옵션 체계가 달라 도구가 따로다. */
export type RouteTool = 'find_route' | 'find_walking_route';
const REVERSE_TOOL = 'reverse_geocode';

/** 한 번에 가져올 개수. 지도에 찍는 용도라 크게 잡지 않는다. 쪽 크기이기도 하다(pager.ts). */
export const DEFAULT_REQCOUNT = 30;

/**
 * 인자에 `reqcount`가 없을 때 실제로 온 건수. 쪽 크기가 이것이다.
 *
 * 주변 분류 검색·지오코딩은 템플릿이 건수를 채우지 않는다 — 모델이 부른 첫 쪽이 **도구
 * 기본값**으로 왔으므로, 넘긴 쪽도 같은 크기여야 `21–40`이 이어진다. 서버 스키마의 기본값을
 * 바꾸면 여기도 함께 바꾼다.
 */
export function defaultReqcount(tool: SearchTool): number {
  return TOOL_DEFAULT_REQCOUNT[tool];
}

const TOOL_DEFAULT_REQCOUNT: Record<SearchTool, number> = {
  search_places: DEFAULT_REQCOUNT,
  search_nearby_category: 20,
  // 후보를 고르는 목록이라 20건은 너무 길었다.
  geocode_address: 5,
};

/**
 * 템플릿 → 서버 도구. **검색을 다시 부르는 단 하나의 통로다.**
 *
 * 영역 재검색 · 언어 변경 · 페이징이 모두 여기를 지난다. 셋 다 하는 일이 같기 때문이다 —
 * **처음 검색의 조건을 물려받고 한두 칸만 갈아 끼운다.** 조건을 떨구면 같은 자리를 다시
 * 찾았는데 다른 것이 나온다.
 *
 * 성공한 인자만 `noteTemplateSearch`로 기준이 된다. 실패하면 앞 결과를 그대로 두므로
 * 기준도 그대로여야 한다.
 */
export async function runSearch(
  args: SearchArguments,
  tool: SearchTool = 'search_places',
): Promise<ToolPayload> {
  const sent = TO_ARGUMENTS[tool](args);
  const result = await app.callServerTool({ name: tool, arguments: sent });

  if (result.isError) {
    throw new Error(toolErrorText(result, SEARCH_AREA));
  }
  const payload = assertSuccessful(readToolBody(result) as ToolPayload | undefined, SEARCH_AREA);
  noteTemplateSearch(args);
  return payload;
}

/**
 * 현재 지도 화면을 그대로 검색 영역으로 넘긴다. 도구의 `area: "bbox"`는 x1/y1이 **좌상단**,
 * x2/y2가 **우하단**이다 (북서 → 남동, 실측).
 *
 * 영역이 바뀌면 **쪽수는 처음으로 돌아간다** — 다른 자리의 21번째 결과는 이어지는 값이 아니다.
 */
export async function searchInBounds(
  args: SearchArguments,
  bounds: InaviBounds,
): Promise<ToolPayload> {
  return runSearch({
    ...args,
    area: 'bbox',
    x1: bounds.west,
    y1: bounds.north,
    x2: bounds.east,
    y2: bounds.south,
    startposition: undefined,
  });
}

/** 도구마다 인자 체계가 달라 옮기는 함수도 따로다. */
const TO_ARGUMENTS: Record<SearchTool, (args: SearchArguments) => Record<string, unknown>> = {
  search_places: (args) => toToolArguments(args),
  search_nearby_category: (args) => toNearbyArguments(args),
  geocode_address: (args) => toGeocodeArguments(args),
};

/**
 * 지오코딩의 인자. 주변 분류 검색과 같이 **모델이 보낸 것을 그대로** 물려받고 쪽만 옮긴다.
 * 건수도 채우지 않는다 — 첫 쪽이 도구 기본값(5건)으로 왔다.
 */
function toGeocodeArguments(args: SearchArguments): Record<string, unknown> {
  return {
    query: args.query,
    reqcount: args.reqcount,
    startposition: args.startposition,
    posX: args.posX,
    posY: args.posY,
    addrext: args.addrext,
    admcode: args.admcode,
    showMap: false,
  };
}

/**
 * 주변 분류 검색의 인자. **모델이 보낸 것을 그대로 물려받는다** — 쪽만 넘기므로 영역·분류·
 * 정렬은 그대로다. 통합 검색 쪽(`toToolArguments`)을 거치면 `query`·`language`처럼 이 도구에
 * 없는 칸이 실리고, 건수를 30으로 채워 첫 쪽(20건)과 쪽 크기가 어긋난다.
 */
function toNearbyArguments(args: SearchArguments): Record<string, unknown> {
  return {
    catecode: args.catecode,
    area: args.area,
    x1: args.x1,
    y1: args.y1,
    ...(args.area === 'bbox' ? { x2: args.x2, y2: args.y2 } : { radius: args.radius }),
    sort: args.sort,
    reqcount: args.reqcount,
    startposition: args.startposition,
    showMap: false,
  };
}

/**
 * 검색 인자를 도구 인자로 옮긴다.
 *
 * **영역에 맞는 좌표 칸만 싣는다.** `area="bbox"`에 `radius`를, `area="radius"`에 x2/y2를
 * 함께 보내면 무엇으로 찾았는지가 인자만 봐서는 모호해진다. 영역을 지정하지 않은 검색에서도
 * x1/y1은 남긴다 — 거기서는 거리 기준점이다.
 */
function toToolArguments(args: SearchArguments): Record<string, unknown> {
  const base = {
    query: args.query,
    language: args.language,
    catecode: args.catecode,
    admcode: args.admcode,
    sort: args.sort,
    reqcount: args.reqcount ?? DEFAULT_REQCOUNT,
    startposition: args.startposition,
    x1: args.x1,
    y1: args.y1,
    // 템플릿이 직접 그린다. 대화에 지도를 하나 더 띄우지 않는다.
    showMap: false,
  };

  if (args.area === 'bbox') {
    return { ...base, area: 'bbox', x2: args.x2, y2: args.y2 };
  }
  if (args.area === 'radius') {
    return { ...base, area: 'radius', radius: args.radius };
  }
  return base;
}

/**
 * 템플릿 → 서버 도구. **경로(자동차·도보)를 옵션만 바꿔 다시 부른다.**
 *
 * 검색의 `runSearch`와 같은 결이다 — 처음 호출의 인자를 물려받고 **옵션 한 칸만** 갈아
 * 끼운다. 출발·도착·경유지는 건드리지 않는다. 그건 다른 질문이라 `대화로` 넘길 몫이다.
 *
 * **`_meta.places`(자리마다 어떤 장소인지)는 인자에 그대로 실려 다시 온다** — 모델이 처음에
 * 적어 보낸 `startPlace`·`endPlace`가 인자 안에 있기 때문이다.
 */
export async function runRoute(
  args: Record<string, unknown>,
  tool: RouteTool = 'find_route',
): Promise<ToolPayload> {
  const result = await app.callServerTool({
    name: tool,
    // 템플릿이 직접 그린다. 대화에 지도를 하나 더 띄우지 않는다.
    arguments: { ...args, showMap: false },
  });

  if (result.isError) {
    throw new Error(toolErrorText(result));
  }
  const payload = assertSuccessful(readToolBody(result) as ToolPayload | undefined, SEARCH_AREA);

  /*
   * **좌표를 되꽂는다.** 경로 좌표는 대화 부담을 줄이려고 본문에서 빠져 `_meta.routeCoords`로
   * 온다(`split-coords.ts`). 모델이 부른 결과는 `main.ts`가 되꽂아 주는데, 템플릿이 스스로
   * 부른 결과는 그 길을 지나지 않아 빠뜨리면 **`경로 좌표가 없습니다`가 뜬다.**
   */
  return restoreCoords(payload, result._meta) ?? payload;
}

/** 옵션 한 칸만 바꿔 다시 부르는, 좌표를 `_meta`로 빼지 않는 도구. */
export type OptionTool = 'find_entry_points' | 'get_distance_matrix';

/**
 * 템플릿 → 서버 도구. **진입 지점의 `종류`, 거리 행렬의 `교통`을 바꿔 다시 부른다.**
 *
 * 경로(`runRoute`)와 같은 결이다 — 처음 호출의 인자를 물려받고 옵션 한 칸만 갈아 끼운다.
 * 좌표 배열을 `_meta`로 빼는 도구가 아니라 되꽂을 것은 없다. 자리 이름(`startPlace` 등)은
 * 인자 안에 있어 그대로 실려 간다.
 */
export async function runOptionTool(
  tool: OptionTool,
  args: Record<string, unknown>,
): Promise<ToolPayload> {
  const result = await app.callServerTool({
    name: tool,
    arguments: { ...args, showMap: false },
  });

  if (result.isError) {
    throw new Error(toolErrorText(result));
  }
  return assertSuccessful(readToolBody(result) as ToolPayload | undefined, SEARCH_AREA);
}

/**
 * 템플릿 → 서버 도구. 지도에서 클릭한 지점의 주소를 얻는다 (경로 만들기에서 고른 자리).
 */
export async function reverseGeocodeAt(lng: number, lat: number): Promise<ToolPayload> {
  const result = await app.callServerTool({
    name: REVERSE_TOOL,
    arguments: { posX: lng, posY: lat, showMap: false },
  });

  if (result.isError) {
    throw new Error(toolErrorText(result, CLICKED_POINT));
  }
  return assertSuccessful(readToolBody(result) as ToolPayload | undefined, CLICKED_POINT);
}

/**
 * iNavi는 인증 실패·잘못된 요청도 **HTTP 200**으로 돌려준다.
 * 본문의 `header.isSuccessful`을 반드시 봐야 한다.
 *
 * 문구는 `error-text.ts`가 고른다 — `100 result not found`는 고장이 아니라 **없다는 답**이라
 * 그대로 "오류"라고 적으면 사용자는 무엇이 깨진 줄 안다.
 */
function assertSuccessful(payload: ToolPayload | undefined, place: ErrorPlace): ToolPayload {
  if (!payload) {
    throw new Error('응답 본문을 읽지 못했습니다.');
  }
  const header = payload.header;
  if (header && header.isSuccessful === false) {
    throw new Error(userErrorText(header.resultCode, place));
  }
  return payload;
}
