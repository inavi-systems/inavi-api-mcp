import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { config } from '@/config/env.config';
import { mapConfigOutputSchema } from '@/tools/app/schema/map-config.output.schema';

/**
 * 템플릿 전용 도구.
 *
 * `visibility: ["app"]`이면 호스트가 모델의 도구 목록에서 걸러 낸다. 템플릿만
 * `app.callServerTool()`로 부를 수 있다.
 *
 * 이 도구를 두는 이유는 두 가지다.
 * 1. 앱키가 템플릿 HTML에 남지 않게 한다. `resources/read` 때 키를 치환해 내려주면
 *    리소스를 읽는 누구에게나 키가 그대로 보인다.
 * 2. 템플릿이 서버 도구를 부르는 통로를 연다. 화면 영역 재검색·클릭 지점 주소 조회 같은
 *    동작을 모델을 거치지 않고 처리하려면 이 통로가 필요하다.
 *
 * 키를 브라우저 메모리에서까지 없앨 수는 없다 — SDK가 요청에 실어야 한다.
 * 목표는 **템플릿 코드와 대화 기록에 남지 않는 것**이다.
 */
export function registerGetMapConfigTool(server: McpServer): void {
  registerAppTool(
    server,
    'get_map_config',
    {
      title: 'Get map configuration',
      description:
        'Internal to the map template. Returns the values needed to load the INAVI Maps Web SDK. ' +
        'There is nothing here to show in the conversation.',
      inputSchema: {},
      outputSchema: mapConfigOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ['app'] } },
    },
    () => {
      const mapConfig = {
        baseUrl: config.inavi.baseUrl,
        appkey: config.inavi.appkey,
      };
      return {
        // structuredContent를 걸러 내는 호스트를 대비해 content에도 같은 값을 담는다.
        content: [{ type: 'text', text: JSON.stringify(mapConfig) }],
        structuredContent: mapConfig,
      };
    },
  );
}
