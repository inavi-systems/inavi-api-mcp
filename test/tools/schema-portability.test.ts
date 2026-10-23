import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import { dataEnvelopeOutputSchema } from '@/tools/common/schema/inavi-response.schema';
import {
  nearbyCategoryDataSchema,
  optimalPositionDataSchema,
  searchDataSchema,
} from '@/tools/search/schema/search.output.schema';
import {
  geocodeDataSchema,
  reverseGeocodeDataSchema,
} from '@/tools/geocoding/schema/geocoding.output.schema';
import {
  optimizeDataSchema,
  routeDataSchema,
  walkingRouteDataSchema,
} from '@/tools/route/schema/route.output.schema';
import { toDataEnvelope, type DataEnvelope, type EnvelopeShape } from '@/tools/common/envelope';
import { dropIsHighWay } from '@/tools/route/drop-ishighway';
import { mergeRouteTimes } from '@/tools/route/kst-time';

import searchFixture from '../fixtures/search.response.json';
import globalSearchFixture from '../fixtures/global-search.response.json';
import nearbyFixture from '../fixtures/nearby-category-search.response.json';
import geocodeFixture from '../fixtures/geocode.response.json';
import reverseFixture from '../fixtures/reverse-geocode.response.json';
import entryPointsFixture from '../fixtures/optimal-position-search.response.json';
import routeFixture from '../fixtures/route.response.json';
import routeTimeFixture from '../fixtures/route-time.response.json';
import pedestrianFixture from '../fixtures/route-pedestrian.response.json';
import optimizeFixture from '../fixtures/route-optimize-points-10.response.json';

/**
 * 발행하는 JSON Schema가 호스트를 가리지 않도록 지킨다.
 *
 * 이 저장소는 이미 같은 종류의 사고를 겪었다 — `stripToolSchemaDialect`는 `$schema` 태그
 * 하나가 Claude Desktop의 도구 호출을 **에러도 없이** 멈춰 세워서 생긴 것이다.
 * MCP Inspector의 Schema portability 검사가 같은 것을 본다.
 *
 * 형제 서버도 같은 경고를 같은 방식으로 닫았다
 * (`fix(api-specs): state the object shape of the dereferenced OAS fragments`).
 */

/** SDK가 `tools/list`에 실을 때와 같은 설정으로 변환한다. */
function toJsonSchema(shape: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  const obj = normalizeObjectSchema(shape);
  if (!obj) throw new Error('스키마를 변환하지 못했습니다.');

  return toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'output' }) as Record<
    string,
    unknown
  >;
}

const DATA_SCHEMAS: [string, z.ZodTypeAny][] = [
  ['search_places', searchDataSchema],
  ['search_nearby_category', nearbyCategoryDataSchema],
  ['find_entry_points', optimalPositionDataSchema],
  ['geocode_address', geocodeDataSchema],
  ['reverse_geocode', reverseGeocodeDataSchema],
  ['find_route', routeDataSchema],
  ['find_walking_route', walkingRouteDataSchema],
  ['optimize_waypoint_order', optimizeDataSchema],
];

const SCHEMAS = DATA_SCHEMAS.map(
  ([name, data]) => [name, toJsonSchema(dataEnvelopeOutputSchema(data, name))] as const,
);

/** 값을 실제로 제약하는 키워드. 하나도 없으면 그 자리는 `true`와 같아 아무거나 통과시킨다. */
const VALIDATION_KEYWORDS = new Set([
  'type',
  'enum',
  'const',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  '$ref',
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'items',
  'prefixItems',
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minProperties',
  'maxProperties',
  'propertyNames',
]);

type Visit = (node: Record<string, unknown>, path: string) => void;

/** 스키마 노드를 모두 훑는다. `additionalProperties: true`는 키워드의 값이지 노드가 아니다. */
function walk(node: unknown, path: string, visit: Visit): void {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return;
  const schema = node as Record<string, unknown>;
  visit(schema, path);

  const properties = schema.properties;
  if (properties && typeof properties === 'object') {
    for (const [name, child] of Object.entries(properties)) walk(child, `${path}.${name}`, visit);
  }
  for (const key of ['items', 'additionalProperties']) {
    const child = schema[key];
    if (child && typeof child === 'object') walk(child, `${path}.${key}`, visit);
  }
}

describe('발행 스키마의 호환성', () => {
  it.each(SCHEMAS)('%s — 검증 키워드가 없는 자리가 없다', (_name, schema) => {
    const empty: string[] = [];
    walk(schema, 'outputSchema', (node, path) => {
      if (!Object.keys(node).some((key) => VALIDATION_KEYWORDS.has(key))) empty.push(path);
    });

    // z.unknown()이 이런 자리를 만든다. anyObject()를 쓸 것.
    expect(empty).toEqual([]);
  });

  it.each(SCHEMAS)('%s — 내부 포인터($ref)를 쓰지 않는다', (_name, schema) => {
    // 한 스키마 안에서 zod 인스턴스를 공유하면 변환이 뒤쪽을 $ref로 가리킨다.
    // 포인터를 풀지 않는 클라이언트에게는 그 자리의 스키마가 통째로 사라진다.
    expect(JSON.stringify(schema)).not.toContain('$ref');
  });

  it.each(SCHEMAS)('%s — 본문 쪽 객체가 추가 필드를 막지 않는다', (_name, schema) => {
    const closed: string[] = [];
    walk((schema.properties as Record<string, unknown>).data, 'data', (node, path) => {
      if (node.additionalProperties === false) closed.push(path);
    });

    // 선언하지 않은 필드도 그대로 통과시킨다. openObject()를 쓸 것.
    expect(closed).toEqual([]);
  });

  it('봉투 자체는 닫아 둔다', () => {
    // { header, data }는 우리가 만든다. 다른 것이 섞일 자리가 없다.
    for (const [, schema] of SCHEMAS) {
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(['header', 'data']);
    }
  });
});

/**
 * SDK는 응답을 내보내기 전에 `structuredContent`를 이 스키마로 검증하고, 실패하면 도구 호출을
 * 에러로 만든다. 즉 **스키마가 거절하는 응답은 런타임 장애**다.
 */
/**
 * 응답을 그대로 내보내지 않는 도구는 **내보내는 모양 그대로** 검사해야 한다.
 * 다섯 번째 자리가 봉투를 만든 뒤 도구가 더 하는 일이다.
 */
type Fixture = [string, z.ZodTypeAny, unknown, EnvelopeShape, ((e: DataEnvelope) => DataEnvelope)?];

const FIXTURES: Fixture[] = [
  ['통합 검색', searchDataSchema, searchFixture, 'rename'],
  ['다국어 검색', searchDataSchema, globalSearchFixture, 'rename'],
  ['주변 분류 검색', nearbyCategoryDataSchema, nearbyFixture, 'rename'],
  ['지오코딩', geocodeDataSchema, geocodeFixture, 'rename'],
  ['리버스 지오코딩', reverseGeocodeDataSchema, reverseFixture, 'rename'],
  ['최적 지점', optimalPositionDataSchema, entryPointsFixture, 'asIs'],
  // isHighWay는 틀린 값이라 떼고 내보낸다 (drop-ishighway.ts).
  ['경로 탐색', routeDataSchema, routeFixture, 'unwrap', dropIsHighWay],
  // times[]의 시각을 ISO 한 줄로 합쳐 내보낸다 (kst-time.ts).
  [
    '경로 예측',
    routeDataSchema,
    routeTimeFixture,
    'unwrap',
    (envelope) => dropIsHighWay(mergeRouteTimes(envelope)),
  ],
  ['도보 경로', walkingRouteDataSchema, pedestrianFixture, 'unwrap'],
  ['TSP', optimizeDataSchema, optimizeFixture, 'unwrap'],
];

describe('실제 응답이 출력 스키마를 통과한다', () => {
  it.each(FIXTURES)('%s', (_label, dataSchema, raw, shape, after) => {
    const envelope = (after ?? identity)(toDataEnvelope(raw, shape));
    const result = z.object(dataEnvelopeOutputSchema(dataSchema, 'x')).safeParse(envelope);

    const issues = result.success
      ? ''
      : result.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ');
    expect(result.success, issues).toBe(true);
  });

  it.each(FIXTURES)(
    '%s — 선언이 실제 필드를 모두 덮는다',
    (_label, dataSchema, raw, shape, after) => {
      // 통과만으로는 부족하다. 본문을 열어 뒀으니 선언에 없는 필드도 그냥 통과한다.
      // 그런데 선언에 없으면 모델이 그 필드의 뜻을 알 길이 없다. 그래서 따로 센다.
      const envelope = (after ?? identity)(toDataEnvelope(raw, shape));
      const schema = toJsonSchema(dataEnvelopeOutputSchema(dataSchema, 'x'));
      const data = (schema.properties as Record<string, unknown>).data;

      const undeclared = findUndeclared(envelope.data, data, 'data');

      expect([...new Set(undeclared)].sort()).toEqual([]);
    },
  );
});

const identity = (envelope: DataEnvelope): DataEnvelope => envelope;

/**
 * 값과 스키마를 나란히 훑어 **선언에 없는 키**를 모은다.
 *
 * `subpoi.poi[]`처럼 일부러 열어 둔 자리(`properties`가 비어 있고 `additionalProperties: true`)는
 * 세지 않는다 — 모양을 밝히지 않기로 한 곳이다.
 */
function findUndeclared(value: unknown, schema: unknown, path: string): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const node = schema as { properties?: Record<string, unknown>; items?: unknown };

  if (Array.isArray(value)) {
    return node.items ? value.flatMap((v) => findUndeclared(v, node.items, `${path}[]`)) : [];
  }
  if (value === null || typeof value !== 'object') return [];

  const properties = node.properties ?? {};
  // 모양을 밝히지 않기로 한 자리는 건너뛴다.
  if (Object.keys(properties).length === 0) return [];

  return Object.entries(value).flatMap(([key, child]) =>
    key in properties
      ? findUndeclared(child, properties[key], `${path}.${key}`)
      : [`${path}.${key}`],
  );
}
