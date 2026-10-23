import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { normalizeObjectSchema } from '@modelcontextprotocol/sdk/server/zod-compat.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import {
  alignPlacesByCoordinate,
  collectWaypointPlaces,
} from '@/tools/common/schema/waypoint-place.input.schema';

/**
 * 경로의 출발·경유·도착이 **어떤 장소인지**를 입력으로 받아 템플릿까지 나른다.
 *
 * 경로 API는 좌표만 받고 좌표만 돌려준다. 그래서 지도의 출발·도착 핀 정보창에 좌표밖에
 * 뜨지 않았다(실기 피드백). 이름은 모델이 이미 알고 있으므로 — 좌표를 얻으려 통합 검색을
 * 먼저 불렀다 — 그 값을 옮겨 적게 해서 `_meta`로 보낸다.
 *
 * 여기서 지키는 것은 셋이다.
 * 1. 장소 정보가 **iNavi API로 새 나가지 않는다** (좌표만 보낸다)
 * 2. 자리 셋의 스키마가 **각각 펼쳐진다** (`$ref`로 가리키면 그 자리가 통째로 사라진다)
 * 3. 받은 것이 없으면 `_meta.places`를 **만들지 않는다**
 */

const mocks = vi.hoisted(() => ({
  findRoute: vi.fn(),
  findPredictedRoute: vi.fn(),
  findPedestrianRoute: vi.fn(),
  optimizeWaypointOrder: vi.fn(),
  getDistanceMatrix: vi.fn(),
}));

vi.mock('@/clients/route.client', () => ({ routeClient: mocks }));
vi.mock('@/clients/optimize.client', () => ({ optimizeClient: mocks }));
vi.mock('@/clients/matrix.client', () => ({ matrixClient: mocks }));

const { registerFindRouteTool } = await import('@/tools/route/route.tool');
const { registerFindWalkingRouteTool } = await import('@/tools/route/walking.tool');
const { registerOptimizeWaypointOrderTool } = await import('@/tools/optimize/optimize.tool');
const { registerGetDistanceMatrixTool } = await import('@/tools/matrix/matrix.tool');

type ToolConfig = { inputSchema: Record<string, z.ZodTypeAny> };
type Handler = (args: Record<string, unknown>) => Promise<{ _meta?: Record<string, unknown> }>;

/** registerTool을 가로채 선언과 핸들러를 거둔다. */
function collectTool(register: (server: McpServer) => void): {
  config: ToolConfig;
  handler: Handler;
} {
  let collected: { config: ToolConfig; handler: Handler } | undefined;
  const server = {
    registerTool: (_name: string, config: ToolConfig, handler: Handler) => {
      collected = { config, handler };
      return { update: () => undefined };
    },
  } as unknown as McpServer;

  register(server);
  if (!collected) throw new Error('도구 선언을 거두지 못했습니다.');
  return collected;
}

/** SDK가 `tools/list`에 실을 때와 같은 설정으로 변환한다. */
function toJsonSchema(shape: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  const obj = normalizeObjectSchema(shape);
  if (!obj) throw new Error('스키마를 변환하지 못했습니다.');
  return toJsonSchemaCompat(obj, { strictUnions: true, pipeStrategy: 'output' }) as Record<
    string,
    unknown
  >;
}

const ROUTE_TOOLS: [string, (server: McpServer) => void][] = [
  ['find_route', registerFindRouteTool],
  ['find_walking_route', registerFindWalkingRouteTool],
];

/** 좌표만 받던 도구 전부. 자리의 짜임은 달라도 장소를 받는 방식은 하나여야 한다. */
const PLACE_TOOLS: [string, (server: McpServer) => void][] = [
  ...ROUTE_TOOLS,
  ['optimize_waypoint_order', registerOptimizeWaypointOrderTool],
  ['get_distance_matrix', registerGetDistanceMatrixTool],
];

const DRIVING_ARGS = {
  showMap: true,
  includeCoords: false,
  option: 'default',
  compareNearby: false,
  startX: 127.111,
  startY: 37.395,
  endX: 127.222,
  endY: 37.495,
};

const EMPTY_ROUTE = { header: { isSuccessful: true }, route: { data: { paths: [] } } };

describe('경로 자리의 장소 정보', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findRoute.mockResolvedValue(EMPTY_ROUTE);
    mocks.findPedestrianRoute.mockResolvedValue(EMPTY_ROUTE);
  });

  it.each(PLACE_TOOLS)('%s — 자리마다 각각 펼쳐진다 ($ref 금지)', (_name, register) => {
    // 같은 zod 인스턴스를 여러 자리에 쓰면 변환이 한 자리만 펼치고 나머지를 $ref로 가리킨다.
    // 내부 포인터를 풀지 않는 클라이언트에게는 그 자리의 스키마가 통째로 사라진다.
    const schema = toJsonSchema(collectTool(register).config.inputSchema);

    expect(JSON.stringify(schema)).not.toContain('$ref');
    // 자리 이름이 달라도 장소 객체는 어디에나 `name`을 갖는다.
    expect(JSON.stringify(schema)).toContain('"place"');
  });

  it.each(ROUTE_TOOLS)('%s — 출발·도착·경유 세 자리를 모두 받는다', (_name, register) => {
    const schema = toJsonSchema(collectTool(register).config.inputSchema);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    for (const slot of ['startPlace', 'endPlace']) {
      expect(properties[slot]?.properties).toHaveProperty('name');
    }
    const vias = properties.vias?.items as Record<string, Record<string, unknown>>;
    expect((vias.properties?.place as Record<string, unknown>).properties).toHaveProperty('name');
  });

  it('자동차 경로 — 장소는 _meta로 가고 API에는 좌표만 간다', async () => {
    const { handler } = collectTool(registerFindRouteTool);

    const result = await handler({
      ...DRIVING_ARGS,
      startPlace: { name: '티스테이션 걸포점', roadAddress: '김포시 김포한강4로 123' },
      endPlace: { name: '부천소사경찰서', tel: '032-000-0000' },
      vias: [{ x: 127.15, y: 37.45, place: { name: '야탑역' } }],
    });

    expect(result._meta?.places).toEqual({
      start: { name: '티스테이션 걸포점', roadAddress: '김포시 김포한강4로 123' },
      end: { name: '부천소사경찰서', tel: '032-000-0000' },
      vias: [{ name: '야탑역' }],
    });

    // 장소 정보는 지도에만 쓴다. 경로 API가 모르는 필드를 받으면 요청이 거부될 수 있다.
    const sent = mocks.findRoute.mock.calls[0]?.[0] as { vias?: unknown[] };
    expect(sent.vias).toEqual([{ x: 127.15, y: 37.45 }]);
    expect(JSON.stringify(sent)).not.toContain('야탑역');
  });

  it('도보 경로도 같은 길로 나른다', async () => {
    const { handler } = collectTool(registerFindWalkingRouteTool);

    const result = await handler({
      showMap: true,
      includeCoords: false,
      mode: 'walk',
      option: 'recommended',
      startX: 127.111,
      startY: 37.395,
      endX: 127.222,
      endY: 37.495,
      startPlace: { name: '판교역' },
    });

    expect(result._meta?.places).toEqual({ start: { name: '판교역' } });
  });

  it('장소를 하나도 안 적어 보내면 _meta에 자리를 만들지 않는다', async () => {
    const { handler } = collectTool(registerFindRouteTool);

    const result = await handler({ ...DRIVING_ARGS, vias: [{ x: 127.15, y: 37.45 }] });

    // 빈 객체를 실으면 템플릿이 "이름이 있다"로 읽고 좌표를 지운다.
    expect(result._meta).not.toHaveProperty('places');
  });

  describe('collectWaypointPlaces', () => {
    it('받은 것이 없으면 undefined다', () => {
      expect(collectWaypointPlaces({})).toBeUndefined();
      expect(collectWaypointPlaces({ vias: [{}, {}] })).toBeUndefined();
    });

    it('경유지는 순서를 지키고 모르는 자리는 null로 비운다', () => {
      expect(collectWaypointPlaces({ vias: [{}, { place: { name: '야탑역' } }] })).toEqual({
        vias: [null, { name: '야탑역' }],
      });
    });
  });
});

describe('좌표만 받던 나머지 도구', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('최적 순서 — 번호가 아니라 좌표로 맞춰 응답 순서에 줄을 세운다', async () => {
    mocks.optimizeWaypointOrder.mockResolvedValue({
      header: { isSuccessful: true },
      // 방문 순서라 요청 순서와 뒤집혀 온다. 번호를 믿고 세면 이름이 엇갈린다.
      route: {
        data: {
          optimize: [
            { index: 1, x: 127.222, y: 37.495 },
            { index: 0, x: 127.111, y: 37.395 },
          ],
        },
      },
    });
    const { handler } = collectTool(registerOptimizeWaypointOrderTool);

    const result = await handler({
      showMap: true,
      fix: 'start',
      startX: 127.111,
      startY: 37.395,
      startPlace: { name: '판교역' },
      vias: [{ x: 127.222, y: 37.495, place: { name: '서현역' } }],
    });

    expect(result._meta?.places).toEqual({ points: [{ name: '서현역' }, { name: '판교역' }] });

    const sent = mocks.optimizeWaypointOrder.mock.calls[0]?.[0] as { vias?: unknown[] };
    expect(sent.vias).toEqual([{ x: 127.222, y: 37.495 }]);
  });

  it('거리 행렬 — 요청 순서 그대로 싣고 빈 자리는 null로 둔다', async () => {
    mocks.getDistanceMatrix.mockResolvedValue({
      header: { isSuccessful: true },
      mode: 'tms',
      rows: [],
    });
    const { handler } = collectTool(registerGetDistanceMatrixTool);

    const result = await handler({
      showMap: true,
      traffic: false,
      points: [
        { x: 127.111, y: 37.395, place: { name: '판교역' } },
        { x: 127.2, y: 37.4 },
      ],
      dests: [{ x: 127.222, y: 37.495, place: { name: '서현역' } }],
    });

    // 자리를 비우더라도 길이를 지켜야 엉뚱한 핀에 이름이 붙지 않는다.
    expect(result._meta?.places).toEqual({
      origins: [{ name: '판교역' }, null],
      destinations: [{ name: '서현역' }],
    });

    const sent = mocks.getDistanceMatrix.mock.calls[0]?.[0] as { points?: unknown[] };
    expect(sent.points).toEqual([
      { x: 127.111, y: 37.395 },
      { x: 127.2, y: 37.4 },
    ]);
  });

  describe('alignPlacesByCoordinate', () => {
    it('자릿수가 깎여 돌아와도 같은 자리로 본다', () => {
      expect(
        alignPlacesByCoordinate(
          [{ x: 127.110762, y: 37.402184, place: { name: '판교역' } }],
          [{ x: 127.11076, y: 37.40218 }],
        ),
      ).toEqual([{ name: '판교역' }]);
    });

    it('맞는 자리가 하나도 없으면 undefined다', () => {
      expect(
        alignPlacesByCoordinate(
          [{ x: 127.111, y: 37.395, place: { name: '판교역' } }],
          [{ x: 128, y: 38 }],
        ),
      ).toBeUndefined();
    });
  });
});
