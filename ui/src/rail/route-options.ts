import type { RailSelect } from './map-rail';

/**
 * 자동차 경로의 **옵션 파라미터**를 레일에서 바꾼다.
 *
 * 가르는 기준은 통합 검색과 같다 — **필수**(출발·도착·경유지)를 바꾸는 일은
 * 다른 질문이라 `대화로` 넘기고, **옵션**만 여기서 바꾼다. 경로에서 옵션은 둘이다:
 * **탐색 기준**과 **차종**. 차종은 통행료가 달라지므로 값이 눈에 보인다.
 *
 * 차량 제원(높이·무게)은 넣지 않는다 — 숫자를 받아야 해서 고르는 줄로 만들 수 없고,
 * 화물차를 모는 사람이 지도에서 몇 번씩 바꿀 값도 아니다.
 */

/** 경로 탐색 인자 중 **우리가 건드리는 것**만. 나머지는 그대로 물려받는다. */
export interface RouteArguments {
  option?: 'default' | 'free_road' | 'highway';
  carType?: number;
  [key: string]: unknown;
}

const OPTION_CHOICES = [
  { value: 'default', label: '추천' },
  { value: 'free_road', label: '무료 도로' },
  { value: 'highway', label: '고속도로' },
];

/** 도구 설명과 같은 뜻으로 적는다 (find-route.input.schema.ts). */
const CAR_CHOICES = [
  { value: '1', label: '소형차' },
  { value: '2', label: '중형차' },
  { value: '3', label: '대형차' },
  { value: '4', label: '화물차' },
  { value: '5', label: '특수화물' },
  { value: '6', label: '경차' },
];

const DEFAULT_OPTION = 'default';
const DEFAULT_CAR = '1';

/**
 * 레일에 올릴 고르는 줄 둘. 고르면 바로 다시 부른다 — 줄마다 한 번씩이다.
 *
 * @param apply 갈아 끼운 인자로 다시 부른다. 지도를 쥔 쪽(render-host)이 맡는다.
 */
export function routeOptionSelects(
  args: RouteArguments,
  apply: (next: RouteArguments) => void,
): RailSelect[] {
  return [
    {
      label: '탐색',
      value: readOption(args.option) ?? DEFAULT_OPTION,
      choices: OPTION_CHOICES,
      onChange: (value) => {
        apply({ ...args, option: readOption(value) });
      },
    },
    {
      label: '차종',
      value: String(args.carType ?? DEFAULT_CAR),
      choices: CAR_CHOICES,
      onChange: (value) => {
        apply({ ...args, carType: readCarType(value) });
      },
    },
  ];
}

function readOption(value: unknown): RouteArguments['option'] {
  return OPTION_CHOICES.some((choice) => choice.value === value)
    ? (value as RouteArguments['option'])
    : undefined;
}

/** 모르는 값은 건드리지 않는다 — 기본값으로 되돌려 버리면 고르지도 않은 차종이 적용된다. */
function readCarType(value: string): number | undefined {
  const parsed = Number(value);
  return CAR_CHOICES.some((choice) => choice.value === value) ? parsed : undefined;
}

/**
 * 도보 경로(`find_walking_route`)의 옵션 둘 — **이동 수단**과 **탐색 기준**.
 *
 * 자동차와 체계가 전혀 달라 도구가 따로이고(walking.tool.ts), 그래서 줄도 따로 만든다.
 * 이동 수단은 도구가 `walk`·`pm` 둘만 받는다 — 자전거는 `pm`에 들어 있다.
 */
export interface WalkingArguments {
  mode?: 'walk' | 'pm';
  option?: 'recommended' | 'shortest' | 'fastest' | 'easy' | 'main_road';
  [key: string]: unknown;
}

const MODE_CHOICES = [
  { value: 'walk', label: '도보' },
  { value: 'pm', label: '킥보드·자전거' },
];

/**
 * 패널의 `탐색 옵션` 줄과 같은 말로 적는다 (render/route.ts의 `OPTION_NAMES`).
 * `편한 경로`는 계단을 없애 주지 않는다 — 도구 설명이 모델에게 그렇게 일러 둔다.
 */
const WALKING_OPTION_CHOICES = [
  { value: 'recommended', label: '추천 경로' },
  { value: 'shortest', label: '최단 거리' },
  { value: 'fastest', label: '최소 시간' },
  { value: 'easy', label: '편한 경로' },
  { value: 'main_road', label: '큰길 위주' },
];

const DEFAULT_MODE = 'walk';
const DEFAULT_WALKING_OPTION = 'recommended';

/** 레일에 올릴 고르는 줄 둘. 자동차 편과 같이 고르면 바로 다시 부른다. */
export function walkingOptionSelects(
  args: WalkingArguments,
  apply: (next: WalkingArguments) => void,
): RailSelect[] {
  return [
    {
      label: '이동',
      value: readChoice(MODE_CHOICES, args.mode) ?? DEFAULT_MODE,
      choices: MODE_CHOICES,
      onChange: (value) => {
        apply({ ...args, mode: readChoice(MODE_CHOICES, value) });
      },
    },
    {
      label: '탐색',
      value: readChoice(WALKING_OPTION_CHOICES, args.option) ?? DEFAULT_WALKING_OPTION,
      choices: WALKING_OPTION_CHOICES,
      onChange: (value) => {
        apply({ ...args, option: readChoice(WALKING_OPTION_CHOICES, value) });
      },
    },
  ];
}

/** 아는 값만 넘긴다. 모르면 `undefined` — 도구 기본값이 쓰인다. */
function readChoice<T extends string>(choices: { value: string }[], value: unknown): T | undefined {
  return choices.some((choice) => choice.value === value) ? (value as T) : undefined;
}
