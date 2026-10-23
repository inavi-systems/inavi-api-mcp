import { z } from 'zod';
import { openObject, opt } from '@/tools/common/schema/inavi-response.schema';

/**
 * 경로를 이루는 구간 하나. 자동차·예측·도보가 같은 구조를 쓴다.
 *
 * 자리마다 새로 만든다 — 한 스키마 안에서 인스턴스를 공유하면 `$ref`가 생긴다.
 */
function pathShape() {
  return {
    coords: z
      .array(openObject({ x: opt.num('Longitude'), y: opt.num('Latitude') }))
      .optional()
      .describe('Points making up this segment. Omitted when includeCoords is false'),
    distance: opt.num('Segment distance in metres'),
    spend_time: opt.num('Segment duration in seconds'),
    speed: opt.num('Average speed over the segment in km/h'),
    road_code: opt.num(
      'Road class. 0=ferry, 1=motorway, 2=urban expressway, 3=national road, 4=local road, ' +
        '5=ordinary road',
    ),
    traffic_color: opt.str('Traffic colour for this segment, as a hex code'),
    point_type: opt.str(
      'Segment role. S=origin, E=destination, N=ordinary, V or V1, V2 … =waypoint',
    ),
  };
}

/** 자동차 경로 요약. 실시간·예측이 공유한다. */
function carRouteShape() {
  return {
    option: opt.str('The routing option actually applied'),
    distance: opt.num('Total distance in metres'),
    spend_time: opt.num('Total duration in seconds'),
    toll_fee: opt.num('Total tolls in KRW'),
    taxiFare: opt.num('Estimated taxi fare. Present only when useTaxifare was set'),
    totalTaxiFare: opt.str('Estimated taxi fare as a string, for example "6500,11500"'),
    // `isHighWay`는 선언하지 않는다. API가 돌려주지만 서버가 떼어 낸다 - 고속도로를 14km
    // 달리고 통행료를 내는 경로에도 false로 왔다 (실측 2회, drop-ishighway.ts).
    // 고속도로 주행 여부는 `paths[].road_code`에 1이 있는지로 본다.
    paths: z.array(openObject(pathShape())).optional().describe('Route segments'),
  };
}

/**
 * 자동차 경로 본문.
 *
 * `times[]`는 시각을 지정했을 때만 온다. 원본은 `start_time`·`end_time`을 연·월·일·시·분
 * 다섯 숫자로 나눠 보내는데, 서버가 입력과 같은 ISO 한 줄로 합쳐 `departAt`·`arriveAt`으로
 * 돌려준다 (`src/tools/route/kst-time.ts`).
 *
 * ⚠️ 원본 필드 이름은 **`start_time`·`end_time`**이다. 스펙은 `startTime`·`endTime`으로
 * 선언하지만 실제와 다르다 (실측).
 */
export const routeDataSchema = openObject({
  ...carRouteShape(),
  times: z
    .array(
      openObject({
        index: opt.num('Slot number. 0 is the requested time, negative is earlier'),
        spend_time: opt.num('Duration for this slot in seconds'),
        departAt: opt.str('Actual departure time, ISO 8601 in Korean time'),
        arriveAt: opt.str('Estimated arrival time, ISO 8601 in Korean time'),
      }),
    )
    .optional()
    .describe('Per-time-slot summary. Present only when departAt or arriveAt was given'),
}).describe('Driving route');

/**
 * 도보/PM 경로 본문.
 *
 * `facility_type`·`gate_type`으로 접근성 안내가 가능하다 — 자동차 경로에 없는 값이다.
 * `traffic_color`는 오긴 하지만 전 구간이 같은 값이라 사실상 단색이다.
 */
export const walkingRouteDataSchema = openObject({
  option: opt.str('The routing option actually applied, returned by name'),
  distance: opt.num('Total distance in metres'),
  spend_time: opt.num('Total duration in seconds'),
  paths: z
    .array(
      openObject({
        ...pathShape(),
        angle: opt.num('Heading of this segment in degrees'),
        walk_type: opt.num(
          'Footway type. 1=paired road, 2=shared with vehicles, 3=cycle only, ' +
            '4=pedestrian only, 5=virtual path',
        ),
        bicycle_type: opt.num('Cycleway type. 1=cycle only, 2=shared, 3=footway'),
        facility_type: opt.num(
          'Facility crossed. 2=underpass, 3=footbridge, 5=bridge, 6=metro station, ' +
            '8=median bus stop, 10=path through a building',
        ),
        gate_type: opt.num(
          'Access type. 1=ramp, 2=stairs, 3=escalator, 5=lift, 7=crossing, 8=moving walkway. ' +
            'Use this to advise on step-free routes',
        ),
      }),
    )
    .optional()
    .describe('Route segments'),
}).describe('Walking or micromobility route');

/** TSP 본문. 좌표가 없어 매우 가볍다. */
export const optimizeDataSchema = openObject({
  distance: opt.num('Total distance of the optimised tour in metres'),
  spend_time: opt.num('Total duration of the optimised tour in seconds'),
  optimize: z
    .array(
      openObject({
        index: opt.num(
          'Position in the original request. 0 is the origin, the last is the destination',
        ),
        x: opt.num('Longitude'),
        y: opt.num('Latitude'),
        distance: opt.num('Distance from the previous stop in metres'),
        spend_time: opt.num('Duration from the previous stop in seconds'),
      }),
    )
    .optional()
    .describe('Stops in the optimised visiting order. Array order IS the visiting order'),
}).describe('Optimised waypoint order');
