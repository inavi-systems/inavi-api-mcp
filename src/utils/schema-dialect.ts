/** JSON Schema 값에서 `$schema` 방언 선언을 재귀적으로 지운다. */
function deleteSchemaDialect(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(deleteSchemaDialect);
    return;
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    delete obj.$schema;
    Object.values(obj).forEach(deleteSchemaDialect);
  }
}

/**
 * 나가는 `tools/list` 응답의 도구 스키마에서 JSON Schema 방언(`$schema`)을 제거한다.
 *
 * MCP SDK는 zod 스키마를 draft-07 고정으로 변환하면서 모든 도구의 input/output 스키마에
 * `"$schema": "http://json-schema.org/draft-07/schema#"`를 찍는데, 이를 끌 수 있는 옵션이 없다.
 * 이 스키마를 draft-2020-12 검증기로 컴파일하는 호스트(최근 Claude Desktop)는
 * "no schema with ref draft-07"로 컴파일 단계에서 실패해 도구 호출 자체가 중단된다.
 * 실제 사용하는 키워드는 두 draft에 모두 있으므로 방언 태그만 지우면 양쪽에서 컴파일된다.
 * 서버 측 출력 검증은 zod로 하므로 영향이 없다.
 */
export function stripToolSchemaDialect(message: unknown): void {
  if (message === null || typeof message !== 'object') {
    return;
  }
  const result = (message as { result?: { tools?: unknown[] } }).result;
  if (!result || !Array.isArray(result.tools)) {
    return;
  }
  for (const tool of result.tools) {
    const { inputSchema, outputSchema } = tool as { inputSchema?: unknown; outputSchema?: unknown };
    deleteSchemaDialect(inputSchema);
    deleteSchemaDialect(outputSchema);
  }
}
