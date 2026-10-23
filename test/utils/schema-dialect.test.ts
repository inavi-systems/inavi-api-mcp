import { describe, expect, it } from 'vitest';
import { stripToolSchemaDialect } from '@/utils/schema-dialect';

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

describe('stripToolSchemaDialect', () => {
  it('tools/list 응답의 input/output 스키마에서 $schema를 재귀적으로 지운다', () => {
    const message = {
      result: {
        tools: [
          {
            name: 'search_places',
            inputSchema: {
              $schema: DRAFT_07,
              type: 'object',
              properties: { vias: { $schema: DRAFT_07, type: 'array' } },
            },
            outputSchema: { $schema: DRAFT_07, type: 'object' },
          },
        ],
      },
    };

    stripToolSchemaDialect(message);

    expect(JSON.stringify(message)).not.toContain('draft-07');
    // 스키마의 나머지 내용은 손대지 않는다.
    expect(message.result.tools[0]?.inputSchema.type).toBe('object');
  });

  it('tools/list가 아닌 메시지는 건드리지 않는다', () => {
    const message = { result: { contents: [{ $schema: DRAFT_07 }] } };

    stripToolSchemaDialect(message);

    expect(message.result.contents[0]?.$schema).toBe(DRAFT_07);
  });

  it('객체가 아닌 값에도 안전하다', () => {
    expect(() => stripToolSchemaDialect(null)).not.toThrow();
    expect(() => stripToolSchemaDialect('text')).not.toThrow();
  });
});
