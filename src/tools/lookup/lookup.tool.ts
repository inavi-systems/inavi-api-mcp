import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CATEGORY_COUNT,
  findCategoryCodes,
  type CategoryCode,
} from '@/tools/lookup/category-codes';

const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      'Category name or code to look up. Names match on substrings, in Korean ' +
        '(for example "편의점", "충전소", "치과", or the code "110700").',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum number of results (default 10)'),
};

const outputSchema = {
  count: z.number().describe('Number of matches'),
  matches: z
    .array(
      z.object({
        code: z.string().describe('Category code. Pass it straight to catecode'),
        name: z.string().describe('Category name'),
        path: z.string().describe('Full path through the parent categories'),
      }),
    )
    .describe('Matching categories'),
};

export function registerLookupCategoryCodeTool(server: McpServer): void {
  server.registerTool(
    'lookup_category_code',
    {
      title: 'Look up a place category code',
      description:
        `Searches ${CATEGORY_COUNT} INAVI Maps place-category codes for South Korea by name and ` +
        'returns the codes. Runs locally — no API call. ' +
        'USAGE: call it first whenever you need a catecode for search_nearby_category. ' +
        'search_places takes the same codes. Category names are in Korean. ' +
        'NOTE: codes are a six-digit hierarchy, so searching "편의점" (110700) also returns leaf ' +
        'codes such as GS25 and CU. Use the parent code for a whole category, a leaf code for ' +
        'one brand.',
      inputSchema,
      outputSchema,
    },
    ({ query, limit }) => {
      const matches: CategoryCode[] = findCategoryCodes(query, limit);
      const result = { count: matches.length, matches };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
