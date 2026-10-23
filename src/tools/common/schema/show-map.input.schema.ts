import { z } from 'zod';

/**
 * 지도를 쓰는 도구가 공유하는 표시 여부 입력.
 *
 * 도구가 모두 `_meta.ui.resourceUri`를 선언하므로, 그대로 두면 호출할 때마다 대화에 지도가
 * 하나씩 쌓인다. 경로 탐색용 좌표를 얻으려 검색을 두어 번 부르는 것만으로 지도가 여러 개 뜬다.
 *
 * 그래서 기본값을 **미표시**로 두고, 모델이 사용자에게 최종적으로 보여줄 결과에만 켜게 한다.
 * 값은 도구 응답의 `_meta.showMap`으로 전달돼 템플릿이 읽는다 (ui/src/shared/payload.ts).
 */
export const showMapInputSchema = {
  showMap: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Whether to render this result on the in-conversation map (default false). ' +
        'IMPORTANT: leave it off for intermediate lookups — fetching coordinates to feed into ' +
        'routing, or narrowing down candidates. Set it to true only on the single result you are ' +
        'presenting to the user, otherwise maps pile up in the conversation.',
    ),
};
