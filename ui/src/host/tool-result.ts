import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * 서버 도구 결과에서 본문을 꺼낸다.
 *
 * `structuredContent`가 정석이지만 걸러 내는 호스트가 있을 수 있어, 없으면 `content`의
 * 첫 텍스트 블록을 JSON으로 읽어 본다. 도구는 두 곳에 같은 값을 담는다.
 */
export function readToolBody(result: CallToolResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;

  const text = firstText(result.content);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** 실패한 도구 결과를 사람이 읽을 문장으로. */
export function describeToolError(result: CallToolResult): string {
  return firstText(result.content) ?? '(내용 없음)';
}

function firstText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (typeof block === 'object' && block !== null && 'text' in block) {
      const { text } = block as { text: unknown };
      if (typeof text === 'string') return text;
    }
  }
  return undefined;
}
