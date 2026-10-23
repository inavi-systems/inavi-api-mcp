import { z } from 'zod';

/**
 * 경로의 한 자리(출발·경유·도착)가 **어떤 장소인지**를 받는 입력.
 *
 * 경로 API는 좌표만 받고 좌표만 돌려준다. 그래서 지도의 출발·도착 핀을 눌러도
 * 좌표밖에 보여 줄 것이 없었다 — 사용자가 `티스테이션 걸포점에서 부천소사경찰서까지`라고
 * 물었는데 정보창에는 `127.11, 37.39`가 떴다 (실기 피드백).
 *
 * **이름은 모델이 이미 알고 있다.** 좌표를 얻으려고 `search_places`를 먼저 불렀기 때문이다.
 * 그 값을 그대로 옮겨 적게 해서 템플릿까지 나른다. 호출이 늘지 않고, 대화를 다시 열거나
 * 호스트를 껐다 켠 뒤 경로만 다시 불러도 모델이 기록을 보고 다시 채운다.
 *
 * **응답과는 무관하다** — 입력으로 받아 `_meta`로 템플릿에만 보낸다. iNavi 본문은 그대로다.
 *
 * ⚠️ 자리마다 **새로 불러야 한다.** 같은 zod 인스턴스를 두 자리에 쓰면 변환이 한 자리만
 * 펼치고 나머지를 `$ref`로 가리켜, 내부 포인터를 풀지 않는 클라이언트에게는 그 자리의
 * 스키마가 통째로 사라진다 (CLAUDE.md).
 */
export function waypointPlaceInput(role: string) {
  return z
    .object({
      name: z
        .string()
        .min(1)
        .describe('Place name exactly as it appeared in the search result, for example "판교역"'),
      roadAddress: z
        .string()
        .optional()
        .describe('Road-name address, built from the search result roadname and roadjibun'),
      lotAddress: z
        .string()
        .optional()
        .describe('Lot-number address, built from the search result address and jibun'),
      tel: z.string().optional().describe('Phone number from the search result'),
      category: z.string().optional().describe('Category name from the search result, catename'),
    })
    .optional()
    .describe(
      `What the ${role} actually is, so the map can label its pin instead of showing bare ` +
        'coordinates. Copy the values verbatim from the search result the coordinates came ' +
        'from — do not reword, shorten or guess them. Omit any field you are unsure of; name ' +
        'alone is already worth sending. Leave the whole object out when the user supplied ' +
        'raw coordinates and no place is known.',
    );
}

/** 자리마다 받은 장소. 템플릿으로 가는 `_meta.places`의 모양이기도 하다. */
export interface WaypointPlace {
  name: string;
  roadAddress?: string;
  lotAddress?: string;
  tel?: string;
  category?: string;
}

/**
 * 템플릿으로 가는 `_meta.places`. 도구마다 자리의 짜임이 달라 쓰는 칸이 다르다.
 *
 * | 도구 | 쓰는 칸 |
 * |---|---|
 * | `find_route` · `find_walking_route` | `start` · `end` · `vias` |
 * | `optimize_waypoint_order` | `points` — **응답 `optimize[]` 순서**에 맞춘다 |
 * | `get_distance_matrix` | `origins` · `destinations` — 요청 순서 그대로다 |
 *
 * 배열은 **자리를 비우더라도 길이를 지킨다**(`null`). 어긋나면 엉뚱한 핀에 이름이 붙는데,
 * 그건 이름이 없는 것보다 나쁘다.
 */
export interface WaypointPlaces {
  start?: WaypointPlace;
  end?: WaypointPlace;
  /** 경유지는 **순서를 지켜야** 핀과 맞는다. 모르는 자리는 `null`로 자리를 비워 둔다. */
  vias?: (WaypointPlace | null)[];
  points?: (WaypointPlace | null)[];
  origins?: (WaypointPlace | null)[];
  destinations?: (WaypointPlace | null)[];
}

/**
 * 받은 것을 `_meta`에 실을 모양으로 모은다. **하나도 없으면 `undefined`** —
 * 빈 객체를 실으면 템플릿이 "이름이 있다"로 읽는다.
 */
export function collectWaypointPlaces(input: {
  start?: WaypointPlace;
  end?: WaypointPlace;
  vias?: { place?: WaypointPlace }[];
}): WaypointPlaces | undefined {
  const vias = input.vias?.map((via) => via.place ?? null);
  const hasVia = vias?.some((place) => place !== null) ?? false;

  if (!input.start && !input.end && !hasVia) return undefined;

  return {
    ...(input.start ? { start: input.start } : {}),
    ...(input.end ? { end: input.end } : {}),
    ...(hasVia && vias ? { vias } : {}),
  };
}

/** 장소를 하나라도 담고 있는 목록만 남긴다. 전부 `null`이면 실을 까닭이 없다. */
function filled(
  places: (WaypointPlace | null)[] | undefined,
): (WaypointPlace | null)[] | undefined {
  return places?.some((place) => place !== null) ? places : undefined;
}

/** 거리 행렬 — 요청 순서가 곧 응답 `origins`·`destinations`의 순서다. */
export function matrixPlaces(input: {
  points?: { place?: WaypointPlace }[];
  dests?: { place?: WaypointPlace }[];
}): WaypointPlaces | undefined {
  const origins = filled(input.points?.map((point) => point.place ?? null));
  const destinations = filled(input.dests?.map((dest) => dest.place ?? null));

  if (!origins && !destinations) return undefined;
  return { ...(origins ? { origins } : {}), ...(destinations ? { destinations } : {}) };
}

/**
 * 좌표로 맞춰 **응답 순서에 줄을 세운다.**
 *
 * 경유지 순서 최적화의 응답은 방문 순서로 오고 `index`가 요청 순서를 가리키는데, 그 번호가
 * 무엇의 번호인지(경유지만인지 출발·도착까지 포함인지)가 스펙에 없다. **잘못 세면 엉뚱한
 * 핀에 이름이 붙으므로** 번호를 믿지 않고 좌표로 맞춘다 — 응답이 돌려주는 좌표는 우리가
 * 방금 보낸 값이라 그대로 들어맞는다.
 */
export function alignPlacesByCoordinate(
  candidates: { x?: number; y?: number; place?: WaypointPlace }[],
  targets: { x?: number; y?: number }[],
): (WaypointPlace | null)[] | undefined {
  return filled(
    targets.map((target) => {
      const hit = candidates.find(
        (candidate) =>
          candidate.place !== undefined &&
          candidate.x !== undefined &&
          candidate.y !== undefined &&
          target.x !== undefined &&
          target.y !== undefined &&
          near(candidate.x, target.x) &&
          near(candidate.y, target.y),
      );
      return hit?.place ?? null;
    }),
  );
}

/** 자릿수가 깎여 돌아올 수 있어 1m 남짓은 같은 자리로 본다. */
const SAME_POINT_DEGREES = 0.00001;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_POINT_DEGREES;
}
