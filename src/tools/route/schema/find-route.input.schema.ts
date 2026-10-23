import { z } from 'zod';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';
import { waypointPlaceInput } from '@/tools/common/schema/waypoint-place.input.schema';

export const findRouteInputSchema = {
  ...showMapInputSchema,
  startX: z.number().describe('Origin longitude. For example 127.110762'),
  startY: z.number().describe('Origin latitude. For example 37.402184'),
  endX: z.number().describe('Destination longitude'),
  endY: z.number().describe('Destination latitude'),
  startPlace: waypointPlaceInput('origin'),
  endPlace: waypointPlaceInput('destination'),
  option: z
    .enum(['default', 'free_road', 'highway'])
    .optional()
    .default('default')
    .describe(
      'Route preference. "default" follows live traffic, "free_road" avoids tolls, "highway" ' +
        'prefers motorways. Each maps to its statistical equivalent when a time is given.',
    ),
  vias: z
    .array(
      z.object({
        x: z.number().describe('Waypoint longitude'),
        y: z.number().describe('Waypoint latitude'),
        place: waypointPlaceInput('waypoint'),
      }),
    )
    .max(5)
    .optional()
    .describe('Waypoints, at most 5, listed in the order they should be visited'),
  departAt: z
    .string()
    .optional()
    .describe(
      'Departure time in ISO 8601, for example "2026-10-01T08:00:00". ' +
        'IMPORTANT: setting it switches from live traffic to a statistical forecast. ' +
        'Use it only when the user names a time. ' +
        'Cannot be combined with arriveAt.',
    ),
  arriveAt: z
    .string()
    .optional()
    .describe(
      'Desired arrival time in ISO 8601. Routes backwards from that time using the statistical ' +
        'forecast. Cannot be combined with departAt.',
    ),
  compareNearby: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether to also return the trip 30 minutes earlier and 30 minutes later (default false). ' +
        'Only meaningful with departAt or arriveAt. One call then answers questions such as ' +
        '"is it better to leave at 8 or at 8:30?".',
    ),
  carType: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
    .optional()
    .describe(
      'Vehicle class. 1=compact (default), 2=midsize, 3=large, 4=heavy goods, 5=special goods, ' +
        '6=light car.',
    ),
  carHeight: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Vehicle height in centimetres. Affects height-restricted roads'),
  carWeight: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Vehicle gross weight in kilograms. Affects weight-restricted roads'),
  useTaxifare: z
    .enum(['0', '1', '2', '3'])
    .optional()
    .describe('Estimated taxi fare. 0=off (default), 1=standard, 2=deluxe, 3=both'),
  includeCoords: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether to include the route coordinate arrays in the response (default false). ' +
        'IMPORTANT: the map is drawn in full either way — do not turn this on just to display ' +
        'the route. Distance, duration, tolls and the per-segment traffic colour are always ' +
        'included regardless. A route across a city holds thousands of points, which is a lot of ' +
        'conversation space. Set it true only if you need the coordinate values themselves.',
    ),
};
