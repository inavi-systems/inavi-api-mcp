import { z } from 'zod';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';

export const geocodeAddressInputSchema = {
  ...showMapInputSchema,
  query: z
    .string()
    .min(1)
    .describe(
      'Address to convert to coordinates. Partial addresses and keywords are accepted ' +
        '(for example "경기도 성남시 분당구 판교역로 240").',
    ),
  reqcount: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(5)
    .describe('How many candidates to request (default 5)'),
  startposition: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Offset of the first result, 0-based. Use it to page through results.'),
  posX: z
    .number()
    .optional()
    .describe('Reference longitude. Supply it to get the distance to each candidate in metres.'),
  posY: z.number().optional().describe('Reference latitude. Use together with posX.'),
  addrext: z
    .enum(['0', '1', '2'])
    .optional()
    .describe(
      'Address widening when there is no exact match. ' +
        '0=lot or building number (default), 1=sub number, 2=main number.',
    ),
  admcode: z.string().optional().describe('Narrow results to an administrative district code'),
};
