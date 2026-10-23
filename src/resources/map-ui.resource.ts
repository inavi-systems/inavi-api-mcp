import { readFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { McpUiResourceCsp } from '@modelcontextprotocol/ext-apps';
import { config } from '@/config/env.config';
import { fromProjectRoot } from '@/utils/paths';
import { MAP_UI_URI } from '@/tools/common/ui.constants';

const MAP_UI_HTML_PATH = fromProjectRoot('public/ui/map.html');

/*
 * 뷰가 iNavi Web JS SDK를 로드하려면 브라우저에 도메인과 앱키가 필요하다.
 * 앱키를 HTML에 치환해 넣지 말 것 — 리소스를 읽는 누구에게나 운영 키가 그대로 보인다.
 * 템플릿이 `get_map_config`(템플릿 전용 도구)를 직접 불러 받아 간다.
 * (src/tools/app/app.tool.ts, ui/src/map/inavi-loader.ts 참고)
 */

/**
 * 호스트가 iframe에 적용할 CSP.
 *
 * 두 도메인이 모두 필요하다 (실제 로더/스타일 응답을 확인해 결정):
 * - API 도메인: `/maps?callback=` 부트스트랩 로더 스크립트
 * - CDN 도메인: SDK 본체 JS·CSS, styleJSON, 벡터 타일(tile.json/.pbf), 스프라이트, 글리프
 *
 * CDN 도메인이 빠지면 로더는 성공하지만 지도가 빈 화면으로 남는다.
 */
const CSP: McpUiResourceCsp = {
  // 'data:'/'blob:'는 지도 SDK가 기본 마커 아이콘을 data URI로 넣고, 경로 핀도 인라인 SVG를
  // data URI로 쓰기 때문에 필요하다. 없으면 마커만 통째로 사라진다.
  // (스펙상 resourceDomains 하나가 img/script/style/font/media-src에 함께 매핑돼 세분화가 안 된다.)
  resourceDomains: [config.inavi.domain, config.inavi.cdnDomain, 'data:', 'blob:'],
  connectDomains: [config.inavi.domain, config.inavi.cdnDomain, 'data:', 'blob:'],
};

/**
 * CSP를 두 위치에 함께 싣는다.
 *
 * 스펙(`McpUiResourceMeta`)과 ext-apps의 참조 호스트 구현은 `_meta.ui.csp`를 읽지만,
 * MCP Inspector 2.2.0은 `_meta.csp`(ui 중첩 없음)를 읽는다. 한쪽만 보내면 다른 쪽에서
 * CSP가 비어 `script-src 'unsafe-inline'`만 남고, 인라인 스크립트는 돌지만 iNavi SDK
 * 로드가 차단돼 지도가 빈 화면이 된다. `_meta`는 확장 가능한 필드라 둘 다 실어도 안전하다.
 */
const UI_META = {
  ui: { csp: CSP },
  csp: CSP,
} as const;

export function registerMapUiResource(server: McpServer): void {
  registerAppResource(
    server,
    'INAVI Maps 지도 뷰',
    MAP_UI_URI,
    {
      description:
        'INAVI Maps API 도구 결과를 그리는 동적 지도 템플릿. ' +
        '응답의 _meta.kind로 표시 방식을 고릅니다.',
      mimeType: RESOURCE_MIME_TYPE,
      _meta: UI_META,
    },
    async () => {
      const html = await loadMapUiHtml();
      return {
        contents: [
          {
            uri: MAP_UI_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: UI_META,
          },
        ],
      };
    },
  );
}

async function loadMapUiHtml(): Promise<string> {
  try {
    return await readFile(MAP_UI_HTML_PATH, 'utf-8');
  } catch {
    throw new Error(
      `지도 뷰 빌드 산출물을 찾을 수 없습니다: ${MAP_UI_HTML_PATH}\n` +
        '`npm run build:ui`(또는 `npm run build`)를 먼저 실행하세요.',
    );
  }
}
