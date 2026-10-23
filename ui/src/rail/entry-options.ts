import type { RailSelect } from './map-rail';

/**
 * 진입 지점(`find_entry_points`)의 **옵션 파라미터**를 레일에서 바꾼다.
 *
 * 여는 것은 `종류` 하나다 — 같은 지점의 진입로를 차량용·택시용으로 바꿔 보는 일이다.
 * `count`는 열지 않는다. 한 지점의 진입로는 몇 개뿐이라 건수를 고를 일이 없다.
 */

/** 진입 지점 인자 중 **우리가 건드리는 것**만. 나머지는 그대로 물려받는다. */
export interface EntryPointArguments {
  kind?: 'all' | 'car' | 'taxi-building' | 'taxi-complex';
  [key: string]: unknown;
}

/** 정보창·목록의 꼬리표와 같은 말로 적는다 (render/entry-points.ts). */
const KIND_CHOICES = [
  { value: 'all', label: '전체' },
  { value: 'car', label: '차량 진입로' },
  { value: 'taxi-building', label: '택시 정차(건물)' },
  { value: 'taxi-complex', label: '택시 정차(단지)' },
];

const DEFAULT_KIND = 'all';

/** 레일에 올릴 고르는 줄 하나. 고르면 바로 다시 부른다. */
export function entryPointSelects(
  args: EntryPointArguments,
  apply: (next: EntryPointArguments) => void,
): RailSelect[] {
  return [
    {
      label: '종류',
      value: readKind(args.kind) ?? DEFAULT_KIND,
      choices: KIND_CHOICES,
      onChange: (value) => {
        apply({ ...args, kind: readKind(value) });
      },
    },
  ];
}

/** 모르는 값은 넘기지 않는다 — 도구 기본값(`all`)이 쓰인다. */
function readKind(value: unknown): EntryPointArguments['kind'] {
  return KIND_CHOICES.some((choice) => choice.value === value)
    ? (value as EntryPointArguments['kind'])
    : undefined;
}
