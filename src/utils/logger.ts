import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

type LogLevel = 'debug' | 'info' | 'warning' | 'error';

/**
 * MCP Logging Notification 로거.
 *
 * stdout은 JSON-RPC 전용이므로 절대 `console.log`를 쓰지 않는다.
 * 서버 연결 전(또는 로깅 미지원 호스트)에는 stderr로 폴백한다.
 */
class Logger {
  private server: McpServer | undefined;

  init(server: McpServer): void {
    this.server = server;
  }

  log(level: LogLevel, data: unknown): void {
    const payload = formatData(data);

    if (!this.server) {
      process.stderr.write(`[${new Date().toISOString()}] ${level}: ${JSON.stringify(payload)}\n`);
      return;
    }

    void this.server.server.sendLoggingMessage({ level, data: payload }).catch((error: unknown) => {
      process.stderr.write(`[logger] 알림 전송 실패: ${String(error)}\n`);
    });
  }
}

/**
 * Error의 `message`/`stack`은 열거 불가능한 속성이라 JSON.stringify하면 `{}`가 된다.
 * 중첩된 Error를 평범한 객체로 펼쳐 준다.
 */
function formatData(data: unknown): unknown {
  if (data instanceof Error) {
    return { error: data.message, name: data.name };
  }
  if (Array.isArray(data)) {
    return data.map(formatData);
  }
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, formatData(value)]));
  }
  return data;
}

export const logger = new Logger();
