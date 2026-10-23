import type { RouteTimeSlot, ToolPayloadData } from '../shared/payload';
import { formatDuration } from '../shared/dom';

/**
 * 경로 예측 탐색의 후보 시각(`times[]`)을 사이드바 줄로 옮긴다. 실시간 탐색에는 없어 빈 배열.
 *
 * **`Date`를 거치지 않는다.** 템플릿은 브라우저에서 돌아 그 기기의 시간대를 쓰므로,
 * `new Date(iso).getHours()`는 보는 사람 위치에 따라 달라진다. 서버가 한국 시각으로
 * 못박아 보내니(`src/tools/route/kst-time.ts`) 문자열에서 그대로 읽는다.
 */
const ISO_PARTS = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

export function predictedTimeRows(data: ToolPayloadData | undefined): [string, string][] {
  const slots = (data?.times ?? []).filter(
    (slot) => slot.departAt !== undefined || slot.arriveAt !== undefined,
  );
  if (slots.length === 0) return [];

  // 칸이 하나면 비교할 것이 없다. 출발·도착을 따로 한 줄씩 적어 읽기 쉽게 둔다.
  if (slots.length === 1) {
    const only = slots[0] as RouteTimeSlot;
    return [
      ['출발 시각', describeMoment(only.departAt)],
      ['도착 예정', describeMoment(only.arriveAt)],
    ].filter((row): row is [string, string] => row[1] !== '-');
  }

  return slots.map((slot) => [slotLabel(slot), slotValue(slot)]);
}

/** "30분 일찍"처럼 적지 않는다 — 간격은 서버가 정하므로 출발 시각 자체를 적는다. */
function slotLabel(slot: RouteTimeSlot): string {
  const clock = clockOf(slot.departAt) ?? clockOf(slot.arriveAt) ?? '-';
  return slot.index === 0 ? `${clock} 출발 (요청)` : `${clock} 출발`;
}

function slotValue(slot: RouteTimeSlot): string {
  const arrival = clockOf(slot.arriveAt);
  return [formatDuration(slot.spend_time), arrival && `${arrival} 도착`]
    .filter(Boolean)
    .join(' · ');
}

/** 날짜까지 붙인 한 줄. 칸이 하나뿐일 때 쓴다. */
function describeMoment(iso: string | undefined): string {
  const parts = ISO_PARTS.exec(iso?.trim() ?? '');
  if (!parts) return '-';

  return `${Number(parts[2])}월 ${Number(parts[3])}일 ${parts[4]}:${parts[5]}`;
}

/** 시·분만. 같은 날 안에서 고르는 자리라 날짜는 뺀다. */
function clockOf(iso: string | undefined): string | undefined {
  const parts = ISO_PARTS.exec(iso?.trim() ?? '');
  return parts ? `${parts[4]}:${parts[5]}` : undefined;
}
