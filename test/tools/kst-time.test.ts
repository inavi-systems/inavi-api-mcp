import { afterEach, describe, expect, it } from 'vitest';
import { mergeRouteTimes, toDateParts } from '@/tools/route/kst-time';
import { toDataEnvelope, type DataEnvelope } from '@/tools/common/envelope';
import routeTimeFixture from '../fixtures/route-time.response.json';
import routeFixture from '../fixtures/route.response.json';

/**
 * 경로 예측 탐색의 시각 인자는 **한국 시각으로 고정한다** (설계 2.8).
 *
 * stdio 서버는 호스트가 띄우는 자식 프로세스라 호스트 머신의 `TZ`를 물려받는다. 예전 구현은
 * `new Date(iso)`에 지역시간 getter를 써서 **호스트가 어디에 있느냐에 따라 결과가 달라졌다.**
 * 이 테스트는 그 의존을 다시 들이지 않는지 본다.
 */
const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('ISO 시각을 한국 기준으로 쪼갠다', () => {
  it('오프셋이 없으면 한국 시각으로 읽는다', () => {
    expect(toDateParts('2026-10-01T08:00:00')).toEqual({
      year: 2026,
      month: 10,
      day: 1,
      hour: 8,
      minutes: 0,
    });
  });

  it('초가 없어도 읽는다', () => {
    expect(toDateParts('2026-10-01T08:30')).toMatchObject({ hour: 8, minutes: 30 });
  });

  it('Z는 한국 벽시계로 옮긴다', () => {
    // 08:00 UTC = 17:00 KST
    expect(toDateParts('2026-10-01T08:00:00Z')).toEqual({
      year: 2026,
      month: 10,
      day: 1,
      hour: 17,
      minutes: 0,
    });
  });

  it('+09:00은 그대로 한국 시각이다', () => {
    expect(toDateParts('2026-10-01T08:00:00+09:00')).toMatchObject({ day: 1, hour: 8 });
  });

  it('뉴욕 오프셋도 한국 벽시계로 옮긴다', () => {
    // 08:00 -04:00 = 12:00 UTC = 21:00 KST
    expect(toDateParts('2026-10-01T08:00:00-04:00')).toMatchObject({ day: 1, hour: 21 });
  });

  it('날짜를 넘기는 변환도 맞다', () => {
    // 20:00 UTC = 다음 날 05:00 KST
    expect(toDateParts('2026-09-30T20:00:00Z')).toMatchObject({
      month: 10,
      day: 1,
      hour: 5,
    });
  });

  it('호스트 시간대가 바뀌어도 결과가 같다', () => {
    const zones = ['Asia/Seoul', 'UTC', 'America/New_York'];
    const naive = zones.map((tz) => {
      process.env.TZ = tz;
      return toDateParts('2026-10-01T08:00:00');
    });
    const offset = zones.map((tz) => {
      process.env.TZ = tz;
      return toDateParts('2026-10-01T08:00:00Z');
    });

    expect(new Set(naive.map((p) => JSON.stringify(p))).size).toBe(1);
    expect(new Set(offset.map((p) => JSON.stringify(p))).size).toBe(1);
  });

  it('달력에 없는 날짜는 막는다', () => {
    expect(() => toDateParts('2026-02-30T08:00:00')).toThrow(/Could not read the time/);
    expect(() => toDateParts('2026-13-01T08:00:00')).toThrow(/Could not read the time/);
  });

  it('읽을 수 없는 값은 막는다', () => {
    expect(() => toDateParts('내일 아침')).toThrow(/ISO 8601/);
  });
});

describe('times[]의 시각을 ISO 한 줄로 합친다', () => {
  const envelope = toDataEnvelope(routeTimeFixture, 'unwrap');
  const merged = mergeRouteTimes(envelope);
  const slots = merged.data.times as Record<string, unknown>[];

  it('departAt·arriveAt으로 바뀐다', () => {
    expect(slots.map((slot) => [slot.departAt, slot.arriveAt])).toEqual([
      ['2026-09-30T07:30:00+09:00', '2026-09-30T08:12:00+09:00'],
      ['2026-09-30T08:00:00+09:00', '2026-09-30T08:49:00+09:00'],
      ['2026-09-30T08:30:00+09:00', '2026-09-30T09:15:00+09:00'],
    ]);
  });

  it('원본 start_time·end_time은 남지 않는다', () => {
    expect(slots.some((slot) => 'start_time' in slot || 'end_time' in slot)).toBe(false);
  });

  it('나머지 필드는 그대로다', () => {
    expect(slots.map((slot) => [slot.index, slot.spend_time])).toEqual([
      [-1, 2520],
      [0, 2940],
      [1, 2700],
    ]);
    // 본문의 다른 값도 건드리지 않는다.
    expect(merged.data.distance).toBe(envelope.data.distance);
    expect(merged.data.paths).toEqual(envelope.data.paths);
  });

  it('원본 봉투는 건드리지 않는다', () => {
    const original = envelope.data.times as Record<string, unknown>[];
    expect(original.every((slot) => 'start_time' in slot)).toBe(true);
  });

  it('times가 없으면 원본을 그대로 돌려준다', () => {
    const plain = toDataEnvelope(routeFixture, 'unwrap');
    expect(mergeRouteTimes(plain)).toBe(plain);
  });

  it('숫자가 하나라도 없으면 합치지 않는다', () => {
    const broken = {
      header: envelope.header,
      data: { times: [{ index: 0, start_time: { year: 2026, month: 9 } }] },
    } as unknown as DataEnvelope;
    const out = mergeRouteTimes(broken);
    const slot = (out.data.times as Record<string, unknown>[])[0];

    // 없는 값을 0으로 메우느니 합치지 않는 편이 낫다.
    expect(slot?.departAt).toBeUndefined();
  });
});
