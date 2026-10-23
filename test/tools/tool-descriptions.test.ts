import { describe, expect, it, beforeAll } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSearchPlacesTool } from '@/tools/search/search.tool';
import { registerSearchNearbyCategoryTool } from '@/tools/search/nearby.tool';
import { registerFindEntryPointsTool } from '@/tools/search/entry-points.tool';
import { registerLookupCategoryCodeTool } from '@/tools/lookup/lookup.tool';
import {
  registerGeocodeAddressTool,
  registerReverseGeocodeTool,
} from '@/tools/geocoding/geocoding.tool';
import { registerGetAdminBoundaryTool } from '@/tools/spatial/spatial.tool';
import { registerFindRouteTool } from '@/tools/route/route.tool';
import { registerFindWalkingRouteTool } from '@/tools/route/walking.tool';
import { registerOptimizeWaypointOrderTool } from '@/tools/optimize/optimize.tool';
import { registerGetDistanceMatrixTool } from '@/tools/matrix/matrix.tool';

/**
 * 모델이 읽는 문자열의 규격을 지킨다 (설계 1.10).
 *
 * **영문으로 쓴다.** 모델에 학습된 영문 자료가 훨씬 많아 도구 선택과 지시 준수가 더 정확하다.
 * 한국 지명·분류명처럼 **값 자체가 한국어인 예시**는 허용한다 — "편의점"이 그 경우다.
 *
 * **"국내"처럼 어느 나라인지 모호한 말을 쓰지 않는다.** 모델에게는 기준이 없다.
 */
interface RegisteredTool {
  title?: string;
  description?: string;
  inputSchema?: Record<string, { description?: string }>;
}

const tools = new Map<string, RegisteredTool>();

beforeAll(() => {
  // registerTool을 가로채 선언만 거둔다. 핸들러는 부르지 않는다.
  const server = {
    registerTool: (name: string, config: RegisteredTool) => {
      tools.set(name, config);
      return { update: () => undefined };
    },
  } as unknown as McpServer;

  registerSearchPlacesTool(server);
  registerSearchNearbyCategoryTool(server);
  registerFindEntryPointsTool(server);
  registerLookupCategoryCodeTool(server);
  registerGeocodeAddressTool(server);
  registerReverseGeocodeTool(server);
  registerGetAdminBoundaryTool(server);
  registerFindRouteTool(server);
  registerFindWalkingRouteTool(server);
  registerOptimizeWaypointOrderTool(server);
  registerGetDistanceMatrixTool(server);
});

/** 설명문 안의 한국어 예시는 따옴표 안에 둔다. 그 바깥에 한글이 있으면 번역이 덜 된 것이다. */
function outsideQuotes(text: string): string {
  return text.replace(/"[^"]*"/g, '""').replace(/「[^」]*」/g, '');
}

describe('도구 선언 규격 (설계 1.10)', () => {
  it('모델에게 보이는 도구 11종이 모두 등록된다', () => {
    expect(tools.size).toBe(11);
  });

  it('제목과 설명이 영문이다', () => {
    for (const [name, tool] of tools) {
      expect(tool.title, `${name}.title`).toBeDefined();
      expect(outsideQuotes(tool.title ?? ''), `${name}.title`).not.toMatch(/[가-힣]/);
      expect(outsideQuotes(tool.description ?? ''), `${name}.description`).not.toMatch(/[가-힣]/);
    }
  });

  it('인자 설명도 영문이다', () => {
    for (const [name, tool] of tools) {
      for (const [field, schema] of Object.entries(tool.inputSchema ?? {})) {
        const description = (schema as { description?: string }).description ?? '';
        expect(outsideQuotes(description), `${name}.${field}`).not.toMatch(/[가-힣]/);
      }
    }
  });

  it('어느 나라인지 모호한 말을 쓰지 않는다', () => {
    // "국내"는 모델에게 기준이 없다. 지리적 범위는 South Korea로 못박는다.
    for (const [name, tool] of tools) {
      const text = `${tool.title ?? ''} ${tool.description ?? ''}`;
      expect(text, `${name}`).not.toMatch(/국내|domestic\b/i);
    }
  });

  it('지리적 범위를 밝힌다', () => {
    // 이 서버는 한국만 다룬다. 제목이나 설명 어딘가에서 그 사실이 드러나야 한다.
    for (const [name, tool] of tools) {
      const text = `${tool.title ?? ''} ${tool.description ?? ''}`;
      expect(text, `${name}`).toMatch(/South Korea|Korean/);
    }
  });

  it('설명문이 분량 규격 안에 있다', () => {
    // 도구가 11종이라 설명문 총량이 곧 비용이다. 길어지면 먼저 ALTERNATIVES를 줄인다.
    for (const [name, tool] of tools) {
      expect((tool.description ?? '').length, `${name}.description`).toBeLessThanOrEqual(700);
    }
  });

  it('다른 도구를 언제 쓸지 알려 준다', () => {
    // 도구가 11종이라 "언제 다른 것을 쓰는가"가 설명의 핵심이다 (설계 1.10).
    // 대안이 없는 로컬 조회 도구만 예외다.
    for (const [name, tool] of tools) {
      if (name === 'lookup_category_code') continue;
      expect(tool.description, `${name}`).toMatch(/ALTERNATIVES|USE THIS BEFORE/);
    }
  });
});
