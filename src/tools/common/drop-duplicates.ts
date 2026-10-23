/**
 * 응답에서 **중복되는 필드**를 떼어 내는 도구. 본문의 `result`(boolean)는 봉투를 옮길 때
 * `envelope.ts`가 뗀다.
 *
 * 통째로 떼기만 하므로 **남은 필드에서 그대로 되살릴 수 있다.** 좌표 배열(`split-coords.ts`)과
 * 달리 되돌리는 입력이 따로 없다 — 되살리는 데 서버가 보관한 값이 필요 없기 때문이다.
 *
 * `toDataEnvelope`를 거친 뒤의 `{ header, data }` 구조를 입력으로 받는다.
 */

import type { DataEnvelope } from '@/tools/common/envelope';

/** RDM 한 칸이 담는 거리·소요 시간. `value`가 수치, `text`가 사람이 읽는 문자열이다. */
interface Measure {
  value?: number;
  text?: string;
  [key: string]: unknown;
}

interface Element {
  distance?: Measure;
  duration?: Measure;
  [key: string]: unknown;
}

/**
 * RDM 응답에서 `rows[].elements[].distance.text`와 `.duration.text`를 떼어 낸다.
 *
 * 두 값 모두 같은 칸의 `value`에서 그대로 나온다 (실측 6칸 전부 일치):
 *
 * ```
 * distance.text = round(value / 1000, 1) + " km"    18494 → "18.5 km"
 * duration.text = floor(value / 60)      + " mins"   2038 → "33 mins"
 * ```
 *
 * 게다가 `text`는 자리를 줄여 담아 **정보가 더 적다.** `value`에서 `text`는 만들 수 있지만
 * 반대는 안 된다. 영문 표기(`km`·`mins`)라 한국어 대화에서는 어차피 다시 쓰게 된다.
 *
 * 칸 하나에 37.5바이트다. 10×10 행렬이면 3.7KB, 20×20이면 15KB가 중복으로만 채워진다.
 *
 * 아는 모양이 아니면 아무것도 하지 않고 원본을 그대로 돌려준다.
 */
export function dropMatrixText(envelope: DataEnvelope): DataEnvelope {
  const elements = readElements(envelope);
  if (
    !elements.some(
      (element) => element.distance?.text !== undefined || element.duration?.text !== undefined,
    )
  ) {
    return envelope;
  }

  const body = structuredClone(envelope);
  for (const element of readElements(body)) {
    delete element.distance?.text;
    delete element.duration?.text;
  }
  return body;
}

function readElements(envelope: DataEnvelope): Element[] {
  const rows = envelope.data.rows;
  if (!Array.isArray(rows)) return [];

  const out: Element[] = [];
  for (const row of rows) {
    const elements = (row as { elements?: unknown } | null)?.elements;
    if (Array.isArray(elements)) out.push(...(elements as Element[]));
  }
  return out;
}
