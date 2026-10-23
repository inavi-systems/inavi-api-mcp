/**
 * 경로 예측 탐색의 시각 변환 — 입력 ISO를 iNavi가 받는 연·월·일·시·분으로 쪼개고,
 * 응답 `times[]`의 연·월·일·시·분은 ISO 한 줄로 합친다.
 *
 * **언제나 한국 시각 기준이다.**
 */

import type { DataEnvelope } from '@/tools/common/envelope';

/** iNavi는 한국 벽시계 시각을 받는다. 서비스 지역이 대한민국뿐이라 고정해도 된다. */
const KST = 'Asia/Seoul';

/** 오프셋이 없는 ISO. 이런 값은 한국 시각으로 읽는다. */
const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minutes: number;
}

/**
 * ISO 문자열을 API가 받는 연·월·일·시·분으로 쪼갠다. **언제나 한국 시각 기준이다.**
 *
 * stdio 서버는 호스트가 띄우는 자식 프로세스라 호스트 머신의 `TZ`를 물려받는다.
 * `new Date(iso)`에 지역시간 getter를 쓰면 호스트 위치에 따라 같은 입력이 다른 시각으로
 * 나간다 — `TZ=UTC`에서 `"…T08:00:00+09:00"`이 전날 23시가 된다.
 *
 * - 오프셋이 없으면(`"2026-10-01T08:00"`) **한국 시각으로 본다.** 문자열에서 바로 뽑아
 *   호스트 시간대가 끼어들 자리를 없앤다.
 * - 오프셋이 있으면(`Z`·`+09:00`·`-04:00`) 그 순간을 한국 벽시계로 옮겨 적는다.
 *   뉴욕에서 `"…T08:00:00-04:00"`으로 물어도 한국 기준 21시로 나간다.
 */
export function toDateParts(iso: string): DateParts {
  const naive = NAIVE_ISO.exec(iso.trim());
  if (naive) {
    const parts = {
      year: Number(naive[1]),
      month: Number(naive[2]),
      day: Number(naive[3]),
      hour: Number(naive[4]),
      minutes: Number(naive[5]),
    };
    if (!isRealDate(parts)) throw unreadable(iso);
    return parts;
  }

  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw unreadable(iso);
  return seoulParts(at);
}

/** 한 순간을 한국 벽시계의 연·월·일·시·분으로 읽는다. */
function seoulParts(at: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minutes: read('minute'),
  };
}

/** 2월 30일처럼 달력에 없는 날짜를 거른다. 정규식만으로는 못 거른다. */
function isRealDate({ year, month, day, hour, minutes }: DateParts): boolean {
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minutes > 59) return false;

  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}

function unreadable(iso: string): Error {
  return new Error(
    `Could not read the time "${iso}". Pass it in ISO 8601 form, ` +
      'for example "2026-10-01T08:00:00". A time without a zone offset is read as Korean time.',
  );
}

/** 한 칸이 담는 시각. 원본은 연·월·일·시·분을 따로 보낸다. */
interface ClockTime {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minutes?: number;
}

interface TimeSlot {
  start_time?: ClockTime;
  end_time?: ClockTime;
  departAt?: string;
  arriveAt?: string;
  [key: string]: unknown;
}

/**
 * 경로 예측 탐색 응답의 `times[]` 시각을 ISO 한 줄로 합친다.
 *
 * ```
 * start_time: { year: 2026, month: 9, day: 30, hour: 7, minutes: 30 }
 *   → departAt: "2026-09-30T07:30:00+09:00"
 * ```
 *
 * **입력과 같은 이름·같은 모양으로 돌려준다.** `departAt`으로 물었으면 후보마다 `departAt`이
 * 돌아온다. 숫자 다섯 개를 모델이 다시 조립할 일이 없어진다.
 *
 * `+09:00`은 지어낸 값이 아니다. iNavi는 대한민국만 다루고 요청도 한국 벽시계로 보내므로
 * (`toDateParts`), 응답 역시 한국 시각이다.
 *
 * **나머지 필드는 건드리지 않는다** — `index`·`spend_time`은 그대로 간다. 시각을 지정하지
 * 않아 `times`가 없는 실시간 탐색 응답에서는 아무 일도 하지 않는다.
 */
export function mergeRouteTimes(envelope: DataEnvelope): DataEnvelope {
  const slots = readSlots(envelope);
  if (!slots.some((slot) => slot.start_time !== undefined || slot.end_time !== undefined)) {
    return envelope;
  }

  const body = structuredClone(envelope);
  for (const slot of readSlots(body)) {
    const departAt = toIso(slot.start_time);
    const arriveAt = toIso(slot.end_time);
    delete slot.start_time;
    delete slot.end_time;
    if (departAt !== undefined) slot.departAt = departAt;
    if (arriveAt !== undefined) slot.arriveAt = arriveAt;
  }
  return body;
}

function readSlots(envelope: DataEnvelope): TimeSlot[] {
  const times = envelope.data.times;
  return Array.isArray(times) ? (times as TimeSlot[]) : [];
}

/** 다섯 숫자를 ISO 한 줄로. 하나라도 비면 합치지 않는다 — 없는 값을 0으로 메우지 않는다. */
function toIso(time: ClockTime | undefined): string | undefined {
  if (!time) return undefined;
  const { year, month, day, hour, minutes } = time;
  if ([year, month, day, hour, minutes].some((part) => typeof part !== 'number')) return undefined;

  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${String(year).padStart(4, '0')}-${pad(month as number)}-${pad(day as number)}` +
    `T${pad(hour as number)}:${pad(minutes as number)}:00+09:00`
  );
}
