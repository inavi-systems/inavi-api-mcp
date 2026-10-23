/**
 * 경로 응답에서 `isHighWay`를 떼어 낸다.
 *
 * **중복이라 떼는 것이 아니라 틀린 값이라 뗀다.** `drop-duplicates.ts`가 떼는 둘은 같은 응답
 * 안의 다른 필드에서 그대로 되살아나지만, 이것은 되살릴 값이 없다 — 애초에 맞지 않는다.
 *
 * 실측 (판교역→강남역, 2026-10-09 · 2026-10-14 두 차례):
 *
 * | | `road_code: 1`(고속도로) | `toll_fee` | `isHighWay` |
 * |---|---|---|---|
 * | 고속도로 우선 | 14.4km / 16.8km | 800원 | **`false`** |
 * | 예측 탐색 | 14.4km / 16.8km | 800원 | **`false`** |
 *
 * 경부고속도로를 14km 달리고 통행료까지 내는 경로를 `false`라고 말한다. 출력 스키마 설명에
 * "믿지 말라"고 적어 두는 것으로는 부족했다 — 템플릿 요약이 `고속도로 포함: 아니오`를 사실처럼
 * 한 줄로 보여 주고(실기 확인), 모델도 그 값을 그대로 읽을 수 있다. **틀린 값을 설명으로
 * 감싸는 것보다 아예 주지 않는 쪽이 낫다.**
 *
 * 고속도로 주행 여부가 필요하면 `paths[].road_code`에 `1`이 있는지 보면 된다 — 같은 응답
 * 안에 있고, 거리까지 함께 센다.
 */

import type { DataEnvelope } from '@/tools/common/envelope';

export function dropIsHighWay(envelope: DataEnvelope): DataEnvelope {
  if (!('isHighWay' in envelope.data)) return envelope;

  const body = structuredClone(envelope);
  delete body.data.isHighWay;
  return body;
}
