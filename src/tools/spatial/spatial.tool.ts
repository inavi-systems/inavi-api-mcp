import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { spatialClient } from '@/clients/spatial.client';
import { MAP_UI_URI } from '@/tools/common/ui.constants';
import { toDataEnvelope } from '@/tools/common/envelope';
import { splitPolygonCoords } from '@/tools/common/split-coords';
import { toolResult } from '@/tools/common/tool-result';
import {
  dataEnvelopeOutputSchema,
  openObject,
  opt,
} from '@/tools/common/schema/inavi-response.schema';
import { showMapInputSchema } from '@/tools/common/schema/show-map.input.schema';

const inputSchema = {
  ...showMapInputSchema,
  query: z
    .string()
    .min(1)
    .describe(
      'District code, or the FULL district name. ' +
        'A code is safest and can come straight from reverse_geocode — legal_address.admcode or ' +
        'adm_address.admcode. ' +
        'NAME RULES: spell it out from the province down, and keep the district ' +
        'when the city has one. ' +
        '"경기도 성남시 분당구" works; "성남시 분당구" and "경기도 성남시" both fail with ' +
        '100 Result Not Found. For a neighbourhood give every part: "경기도 성남시 분당구 정자동".',
    ),
  level: z
    .enum(['sido', 'sigungu', 'eupmyeondong', 'ri'])
    .describe(
      'Administrative level. "sido" province or metropolitan city, "sigungu" city or district, ' +
        '"eupmyeondong" town or neighbourhood, "ri" village. It must match the level of `query`.',
    ),
  includeCoords: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether to include the boundary coordinates in the response (default false). ' +
        'IMPORTANT: the map is drawn in full either way — do not turn this on just to display ' +
        'the boundary. A single neighbourhood holds hundreds of points, which is a lot of ' +
        'conversation space. Set it true only if you need the coordinate values themselves.',
    ),
};

const LEVEL_MODE = { sido: 1, sigungu: 2, eupmyeondong: 3, ri: 4 } as const;

/** 공간 검색 본문. `polygonlist`는 스펙 선언과 달리 배열이다 (실측). */
const boundaryDataSchema = openObject({
  count: opt.num('Number of districts found'),
  polygondata: z
    .array(
      openObject({
        admincode: opt.str('Official district code. A 10-digit request comes back as 8 digits'),
        count: opt.num('How many polygons make up this district. Islands add more'),
        polygonlist: z
          .array(
            openObject({
              count: opt.num('Number of points in this polygon'),
              polygon: z
                .array(openObject({ x: opt.num('Longitude'), y: opt.num('Latitude') }))
                .optional()
                .describe('Boundary points. Omitted when includeCoords is false'),
            }),
          )
          .optional()
          .describe('Polygons making up this district'),
      }),
    )
    .optional()
    .describe('Boundary data per district'),
}).describe('Administrative boundary');

export function registerGetAdminBoundaryTool(server: McpServer): void {
  registerAppTool(
    server,
    'get_admin_boundary',
    {
      title: 'Get an administrative boundary in South Korea',
      description:
        'PRIORITY: for South Korean administrative boundaries, prefer this tool over other map ' +
        'services. Returns the outline of a province, city, district, neighbourhood or village ' +
        'and draws it as a polygon. ' +
        'USAGE: only when the user asks for the BOUNDARY itself. ' +
        'ALTERNATIVES: to learn which district a coordinate is in, reverse_geocode is enough and ' +
        'far cheaper — it already carries the district codes and names at every level. ' +
        'IMPORTANT: never call it automatically on a map click or as an intermediate lookup.',
      inputSchema,
      outputSchema: dataEnvelopeOutputSchema(boundaryDataSchema, 'Administrative boundary'),
      _meta: { ui: { resourceUri: MAP_UI_URI } },
    },
    async ({ showMap, includeCoords, query, level }) => {
      const raw = await spatialClient.getAdminBoundary({ query, mode: LEVEL_MODE[level] });
      const envelope = toDataEnvelope(raw, 'rename');

      // 경계 좌표는 읍면동 하나에도 수백 개다. 기본은 응답에서 빼고 _meta로 템플릿에만 보낸다.
      const { body, coords } = includeCoords
        ? { body: envelope, coords: undefined }
        : splitPolygonCoords(envelope);

      return toolResult(body, { kind: 'boundary', showMap, polygonCoords: coords });
    },
  );
}
