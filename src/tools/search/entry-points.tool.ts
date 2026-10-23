import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { searchClient } from '@/clients/search.client';
import { MAP_UI_URI } from '@/tools/common/ui.constants';
import { toDataEnvelope } from '@/tools/common/envelope';
import { toolResult } from '@/tools/common/tool-result';
import { dataEnvelopeOutputSchema } from '@/tools/common/schema/inavi-response.schema';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';
import { optimalPositionDataSchema } from '@/tools/search/schema/search.output.schema';

const inputSchema = {
  ...showMapInputSchema,
  posX: z.number().describe('Longitude of the point to correct'),
  posY: z.number().describe('Latitude of the point to correct'),
  kind: z
    .enum(['all', 'car', 'taxi-building', 'taxi-complex'])
    .optional()
    .describe(
      'Which entry points to return. "all" (default), "car" for vehicle entrances, ' +
        '"taxi-building" or "taxi-complex" for taxi pick-up and drop-off points.',
    ),
  count: z.number().int().min(1).max(50).optional().describe('Maximum number of results'),
};

const KIND_OPTION = {
  all: '0',
  car: '1',
  'taxi-building': '2',
  'taxi-complex': '3',
} as const;

export function registerFindEntryPointsTool(server: McpServer): void {
  registerAppTool(
    server,
    'find_entry_points',
    {
      title: 'Snap a coordinate to road entry points in South Korea',
      description:
        'USE THIS BEFORE ROUTING to correct a coordinate. Snaps a point to the vehicle entry ' +
        'and exit points on the real road network in South Korea. ' +
        'USAGE: the user will never ask for an "entry point". Call it yourself when a ' +
        'search_places result has NO rpx/rpy, then pass the corrected point to find_route. ' +
        'Display coordinates (dpx/dpy) sit at the building centre and cause detours and U-turns. ' +
        'IMPORTANT: skip it when rpx/rpy is already present — that coordinate is already on ' +
        'the road network, so a correction changes nothing. ' +
        'NOTE: the returned coordinates are numbers, not strings.',
      inputSchema,
      outputSchema: dataEnvelopeOutputSchema(optimalPositionDataSchema, 'Road entry points'),
      _meta: { ui: { resourceUri: MAP_UI_URI } },
    },
    async ({ showMap, kind, ...rest }) => {
      const raw = await searchClient.findOptimalPositions({
        ...rest,
        type: kind ? KIND_OPTION[kind] : undefined,
      });

      // 최적 지점 검색만 원본 본문 키가 이미 `data`라 옮길 것이 없다.
      return toolResult(toDataEnvelope(raw, 'asIs'), { kind: 'entry-points', showMap });
    },
  );
}
