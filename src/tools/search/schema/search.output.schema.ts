import { z } from 'zod';
import { openObject, opt } from '@/tools/common/schema/inavi-response.schema';
import { globalAdmSchema, globalPoiSchema, poiSchema } from '@/tools/common/schema/poi.schema';

/** 통합 검색 본문. POI 목록과 주소 목록이 함께 올 수 있다. */
export const searchDataSchema = openObject({
  type: opt.num('Search type. 1=direct, 2=related. Korean searches only'),
  lang: opt.str('Result language. Non-Korean searches only'),
  totalcount: opt.num('Total number of matches'),
  count: opt.num('Number of results in this response'),
  poitotalcount: opt.num('Total number of place matches'),
  poicount: opt.num('Number of places in this response'),
  admtotalcount: opt.num('Total number of address matches'),
  admcount: opt.num('Number of addresses in this response'),
  poi: z.array(globalPoiSchema).optional().describe('Matched places. Empty array if none'),
  adm: z
    .array(globalAdmSchema)
    .optional()
    .describe(
      'Matched addresses. Empty array if none. ' +
        'IMPORTANT: the spatial filter (area/radius) applies to `poi` only, NOT to these — an ' +
        'address match hundreds of kilometres away can come back from a 500 m search. Read each ' +
        "entry's `distance` before presenting it as nearby.",
    ),
}).describe('Place and address search results');

/** 주변 카테고리 검색 본문. `poi[]`가 통합 검색과 완전히 같은 38개 필드다. */
export const nearbyCategoryDataSchema = openObject({
  totalcount: opt.num('Total number of matches'),
  count: opt.num('Number of results in this response'),
  poi: z.array(poiSchema).optional().describe('Places belonging to the requested category'),
}).describe('Nearby category search results');

/** 최적 지점 검색 본문. 좌표가 **문자열이 아니라 숫자**다. */
export const optimalPositionDataSchema = openObject({
  count: opt.num('Number of entry points found'),
  entrypoints: z
    .array(
      openObject({
        x: opt.num('Longitude. Note this is a number, not a string'),
        y: opt.num('Latitude. Note this is a number, not a string'),
        type: opt.num(
          'Point type. 1=vehicle entrance, 2=taxi stop (building), 3=taxi stop (complex)',
        ),
        angle: opt.num('Approach bearing in degrees. 0 is due north, increasing clockwise'),
      }),
    )
    .optional()
    .describe('Entry points snapped to the road network'),
}).describe('Road-network entry points');
