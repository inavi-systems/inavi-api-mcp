import { z } from 'zod';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';

export const searchPlacesInputSchema = {
  ...showMapInputSchema,
  query: z
    .string()
    .min(1)
    .describe(
      'Search keyword. Business name, building name, category name, lot or road address, or ' +
        'phone number (for example "판교역 카페" or "Pangyo Station").',
    ),
  language: z
    .enum(['ko', 'en', 'ja', 'zh'])
    .optional()
    .default('ko')
    .describe(
      'Language of the results (default "ko"). ' +
        'IMPORTANT: anything other than "ko" uses a separate API whose results omit the ' +
        'administrative-dong code, the dong-based address and linked-site info. ' +
        'Set it only when the user wants results in that language. ' +
        'The keyword itself may still be Korean.',
    ),
  reqcount: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('How many results to request (default 20). The response totalcount gives the size.'),
  startposition: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Offset of the first result, 0-based. Use it to page through results.'),
  area: z
    .enum(['bbox', 'radius'])
    .optional()
    .describe(
      'How to limit the search area. Omit it to search the whole country. ' +
        '"bbox" needs x1/y1 (top-left) and x2/y2 (bottom-right); "radius" needs x1/y1 and radius.',
    ),
  radius: z
    .number()
    .positive()
    .optional()
    .describe(
      'Search radius in metres, for area="radius". ' +
        'NOTE: it narrows `poi` only — address matches (`adm`) ignore it entirely.',
    ),
  x1: z
    .number()
    .optional()
    .describe('Longitude. bbox: top-left; radius: centre; neither: distance reference point'),
  y1: z
    .number()
    .optional()
    .describe('Latitude. bbox: top-left; radius: centre; neither: distance reference point'),
  x2: z.number().optional().describe('Longitude of the bottom-right corner, for area="bbox"'),
  y2: z.number().optional().describe('Latitude of the bottom-right corner, for area="bbox"'),
  sort: z
    .enum(['recommended', 'name', 'distance'])
    .optional()
    .describe(
      'Result order. "recommended" (default), "name", or "distance". ' +
        '"distance" is only meaningful when a reference point (x1/y1) is given.',
    ),
  catecode: z
    .string()
    .optional()
    .describe('Narrow results to a category code. Use lookup_category_code to find the code.'),
  admcode: z.string().optional().describe('Narrow results to an administrative district code'),
};
