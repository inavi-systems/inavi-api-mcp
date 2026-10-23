import type { RailSelect } from './map-rail';

/**
 * 거리 행렬(`get_distance_matrix`)의 **옵션 파라미터**를 레일에서 바꾼다.
 *
 * 여는 것은 `교통` 하나다 — 같은 지점들 사이의 시간이 실시간 교통으로 어떻게 달라지는지 본다.
 * 차량 제원(`carWeight`·`carHeight`)은 자동차 경로와 같은 까닭으로 열지 않는다 — 숫자를
 * 받아야 해서 고르는 줄로 만들 수 없다 (route-options.ts).
 */

/** 거리 행렬 인자 중 **우리가 건드리는 것**만. 나머지는 그대로 물려받는다. */
export interface MatrixArguments {
  traffic?: boolean;
  [key: string]: unknown;
}

const TRAFFIC_CHOICES = [
  { value: 'off', label: '미반영' },
  { value: 'on', label: '실시간 반영' },
];

/** 레일에 올릴 고르는 줄 하나. 고르면 바로 다시 부른다. */
export function matrixOptionSelects(
  args: MatrixArguments,
  apply: (next: MatrixArguments) => void,
): RailSelect[] {
  return [
    {
      label: '교통',
      // 도구 기본값이 `false`라 인자에 없으면 미반영이다.
      value: args.traffic === true ? 'on' : 'off',
      choices: TRAFFIC_CHOICES,
      onChange: (value) => {
        apply({ ...args, traffic: value === 'on' });
      },
    },
  ];
}
