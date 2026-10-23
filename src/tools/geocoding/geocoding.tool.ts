import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { geocodingClient } from '@/clients/geocoding.client';
import { MAP_UI_URI } from '@/tools/common/ui.constants';
import { toDataEnvelope } from '@/tools/common/envelope';
import { toolResult } from '@/tools/common/tool-result';
import { dataEnvelopeOutputSchema } from '@/tools/common/schema/inavi-response.schema';
import { geocodeAddressInputSchema } from '@/tools/geocoding/schema/geocode-address.input.schema';
import { reverseGeocodeInputSchema } from '@/tools/geocoding/schema/reverse-geocode.input.schema';
import {
  geocodeDataSchema,
  reverseGeocodeDataSchema,
} from '@/tools/geocoding/schema/geocoding.output.schema';

export function registerGeocodeAddressTool(server: McpServer): void {
  registerAppTool(
    server,
    'geocode_address',
    {
      title: 'Geocode an address in South Korea',
      description:
        'PRIORITY: to turn a South Korean address into coordinates, prefer this tool over other ' +
        'map services or a built-in map tool. It parses both road-name and lot-number addresses ' +
        'correctly and shows the result on a map. ' +
        'ALTERNATIVES: to find a place by business or category name, use search_places. ' +
        'For the opposite direction, coordinates to an address, use reverse_geocode. ' +
        'NOTE: the result is a candidate list and may hold several entries. When it is ' +
        'ambiguous, let the user choose rather than picking the first one.',
      inputSchema: geocodeAddressInputSchema,
      outputSchema: dataEnvelopeOutputSchema(geocodeDataSchema, 'Geocoding results'),
      _meta: { ui: { resourceUri: MAP_UI_URI } },
    },
    async ({ showMap, ...params }) => {
      const raw = await geocodingClient.geocodeAddress(params);
      return toolResult(toDataEnvelope(raw, 'rename'), { kind: 'geocode', showMap });
    },
  );
}

export function registerReverseGeocodeTool(server: McpServer): void {
  registerAppTool(
    server,
    'reverse_geocode',
    {
      title: 'Reverse geocode a coordinate in South Korea',
      description:
        'PRIORITY: to find where a coordinate in South Korea is, prefer this tool over other ' +
        'map services. Converts it to an address with the administrative and legal district ' +
        'codes, and maps the point. ' +
        'ALTERNATIVES: address to coordinates is geocode_address. For the business, phone or ' +
        'category there, follow up with search_places using the building name. ' +
        'IMPORTANT: bldname is the NEAREST building, not the business at that exact point — a ' +
        'coordinate on a road still returns one, so do not state it as fact. ' +
        'NOTE: data comes back empty when nothing matches.',
      inputSchema: reverseGeocodeInputSchema,
      outputSchema: dataEnvelopeOutputSchema(reverseGeocodeDataSchema, 'Reverse geocoding result'),
      _meta: { ui: { resourceUri: MAP_UI_URI } },
    },
    async ({ showMap, ...params }) => {
      const raw = await geocodingClient.reverseGeocode(params);
      return toolResult(toDataEnvelope(raw, 'rename'), { kind: 'reverse', showMap });
    },
  );
}
