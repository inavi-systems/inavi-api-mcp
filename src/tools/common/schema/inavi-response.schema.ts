import { z } from 'zod';

/**
 * 모든 iNavi 응답에 공통으로 붙는 헤더.
 *
 * iNavi가 주는 객체라 열어 둔다 — 필드가 늘어도 그대로 통과시킨다.
 * 반면 봉투 자체(`{ header, data }`)는 우리가 만드는 것이라 닫아 둔다.
 */
export const inaviHeaderSchema = z
  .object({
    isSuccessful: z.boolean().describe('Whether the API call succeeded'),
    resultCode: z.number().describe('Result code. 0 means success'),
    resultMessage: z.string().describe('Result message'),
  })
  .passthrough();

/**
 * 도구 응답 봉투 — `{ header, data }`.
 *
 * 본문 구조는 도구마다 실구조로 선언한다. SDK v1은 `outputSchema`가 있으면
 * `structuredContent`를 요구하고, 검증에 실패하면 도구 호출을 에러로 만든다.
 *
 * **그래서 본문의 모든 필드를 optional로 선언한다.** iNavi는 값이 없는 필드를 통째로 빼고
 * 보내는 일이 잦다(리버스 지오코딩의 `location`, 검색의 `adm`). 필수로 선언하면 그런 정상 응답이
 * 에러가 된다. 검증은 통과 여부만 보고 `structuredContent`를 바꿔치기하지 않으므로,
 * 선언에 없는 필드가 와도 원본 그대로 나간다.
 */
export function dataEnvelopeOutputSchema(
  dataSchema: z.ZodTypeAny,
  description: string,
): { header: typeof inaviHeaderSchema; data: z.ZodTypeAny } {
  return {
    header: inaviHeaderSchema,
    data: dataSchema.describe(description),
  };
}

/** 값이 오지 않을 수 있는 필드를 간결하게 선언한다. */
export const opt = {
  str: (description: string) => z.string().optional().describe(description),
  num: (description: string) => z.number().optional().describe(description),
  bool: (description: string) => z.boolean().optional().describe(description),
};

/**
 * 선언한 것 외의 필드도 받는 객체.
 *
 * 평범한 `z.object()`는 JSON Schema로 나갈 때 `additionalProperties: false`가 된다.
 * 그런데 우리는 **선언하지 않은 필드도 그대로 통과시킨다** — iNavi가 필드를 더하면 선언보다
 * 먼저 나간다. 스키마가 "추가 필드 금지"라고 말하면
 * 발행 스키마로 검증하는 클라이언트가 멀쩡한 응답을 거부한다.
 * 그래서 본문 쪽 객체는 전부 이것으로 연다 (`additionalProperties: true`).
 *
 * ⚠️ **돌려받은 인스턴스를 한 스키마 안에서 재사용하지 마세요.** SDK의 변환이 같은 인스턴스를
 * 한 번만 펼치고 나머지는 `$ref: "#/properties/..."`로 가리키는데, 내부 포인터를 풀지 않는
 * 클라이언트에게는 그 자리의 스키마가 통째로 사라진다. 자리마다 새로 부르세요.
 */
export function openObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).passthrough();
}

/**
 * 모양을 알 수 없는 객체. `z.unknown()` 대신 쓴다.
 *
 * `z.unknown()`은 검증 키워드가 하나도 없는 빈 스키마(`{}`)로 나간다. 적법하지만 일부 MCP
 * 클라이언트가 거부하거나 잘못 다뤄, 한 호스트에서 되고 다른 호스트에서 안 되는 도구가 된다.
 */
export function anyObject(description: string) {
  return z.object({}).passthrough().describe(description);
}
