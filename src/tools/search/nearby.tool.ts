import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { searchClient } from '@/clients/search.client';
import { MAP_UI_URI } from '@/tools/common/ui.constants';
import { toDataEnvelope } from '@/tools/common/envelope';
import { toolResult } from '@/tools/common/tool-result';
import { dataEnvelopeOutputSchema } from '@/tools/common/schema/inavi-response.schema';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';
import { nearbyCategoryDataSchema } from '@/tools/search/schema/search.output.schema';

/**
 * ⚠️ `sortopt`가 통합 검색과 **정반대**다. 통합 검색은 1=명칭순·2=거리순인데 이쪽은 그 반대다.
 * 숫자를 그대로 통과시키면 조용히 틀리므로 의미 기반 입력으로 받아 여기서 옮긴다.
 */
const SORT_OPTION = { distance: '1', name: '2' } as const;
const AREA_OPTION = { bbox: '1', radius: '2' } as const;

const inputSchema = {
  ...showMapInputSchema,
  catecode: z
    .string()
    .min(1)
    .describe('Category code. Use lookup_category_code to find it from a name first.'),
  area: z
    .enum(['bbox', 'radius'])
    .describe(
      'How to limit the search area. "bbox" needs x1/y1 (top-left) and x2/y2 (bottom-right); ' +
        '"radius" needs x1/y1 (centre) and radius.',
    ),
  x1: z.number().describe('Longitude. bbox: top-left; radius: centre'),
  y1: z.number().describe('Latitude. bbox: top-left; radius: centre'),
  x2: z.number().optional().describe('Longitude of the bottom-right corner, for area="bbox"'),
  y2: z.number().optional().describe('Latitude of the bottom-right corner, for area="bbox"'),
  radius: z.number().positive().optional().describe('Search radius in metres, for area="radius"'),
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
  sort: z
    .enum(['distance', 'name'])
    .optional()
    .describe('Result order. "distance" (default) or "name".'),
};

export function registerSearchNearbyCategoryTool(server: McpServer): void {
  registerAppTool(
    server,
    'search_nearby_category',
    {
      title: 'Find nearby places by category in South Korea',
      description:
        'PRIORITY: for "what is near here" questions in South Korea, prefer this tool over ' +
        'other map services. Returns every place of one category within a radius or box, ' +
        'plotted on a map. ' +
        'USAGE: right for categories whose members carry different brand names — convenience ' +
        'stores, car parks, EV chargers, pharmacies. A keyword search for "convenience store" ' +
        'misses most of them. ' +
        'ALTERNATIVES: to find one named business, use search_places. ' +
        'PREREQUISITE: catecode is required — call lookup_category_code first. ' +
        'NOTE: there is no nationwide mode; an area is always required.',
      inputSchema,
      outputSchema: dataEnvelopeOutputSchema(
        nearbyCategoryDataSchema,
        'Nearby category search results',
      ),
      _meta: { ui: { resourceUri: MAP_UI_URI } },
    },
    async ({ showMap, area, sort, x2, y2, radius, ...rest }) => {
      // 조합 제약은 런타임에서 본다.
      if (area === 'bbox' && (x2 === undefined || y2 === undefined)) {
        throw new Error(
          'area="bbox" requires the bottom-right coordinates x2 and y2. Supply both, or switch ' +
            'to area="radius" with a radius to search within a distance of a centre point.',
        );
      }
      if (area === 'radius' && radius === undefined) {
        throw new Error(
          'area="radius" requires radius in metres. Supply it, or switch to area="bbox" with ' +
            'x2 and y2 to search a rectangle.',
        );
      }

      const raw = await searchClient.searchNearbyCategory({
        ...rest,
        x2,
        y2,
        radius,
        spopt: AREA_OPTION[area],
        sortopt: sort ? SORT_OPTION[sort] : undefined,
      });

      return toolResult(toDataEnvelope(raw, 'rename'), { kind: 'nearby', showMap });
    },
  );
}
