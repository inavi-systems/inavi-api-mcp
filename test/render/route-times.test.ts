// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import routeTimeFixture from '../fixtures/route-time.response.json';
import routeFixture from '../fixtures/route.response.json';
import { predictedTimeRows } from '../../ui/src/render/route-times';
import { renderRoute } from '../../ui/src/render/route';
import { enveloped } from './envelope';
import { createFakeInavi } from './fake-inavi';
import type { ToolPayload } from '../../ui/src/shared/payload';

/** 서버의 `mergeRouteTimes`가 하는 일. 픽스처는 원본이라 아직 다섯 숫자로 나뉘어 있다. */
function mergedTimes(payload: ToolPayload): ToolPayload {
  const slots = (payload.data as { times?: Record<string, unknown>[] } | undefined)?.times ?? [];
  for (const slot of slots) {
    slot.departAt = toIso(slot.start_time);
    slot.arriveAt = toIso(slot.end_time);
    delete slot.start_time;
    delete slot.end_time;
  }
  return payload;
}

function toIso(time: unknown): string {
  const { year, month, day, hour, minutes } = time as Record<string, number>;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minutes)}:00+09:00`;
}

const predictedPayload = mergedTimes(enveloped(routeTimeFixture, 'unwrap'));
const livePayload = enveloped(routeFixture, 'unwrap');

describe('predictedTimeRows', () => {
  it('실시간 탐색에는 times가 없어 줄을 만들지 않는다', () => {
    expect(livePayload.data?.times).toBeUndefined();
    expect(predictedTimeRows(livePayload.data)).toEqual([]);
    expect(predictedTimeRows(undefined)).toEqual([]);
    expect(predictedTimeRows({ times: [] })).toEqual([]);
  });

  it('칸이 하나면 출발·도착을 날짜까지 붙여 한 줄씩 적는다', () => {
    const rows = predictedTimeRows({
      times: [
        {
          index: 0,
          spend_time: 2940,
          departAt: '2026-09-30T08:00:00+09:00',
          arriveAt: '2026-09-30T08:49:00+09:00',
        },
      ],
    });

    expect(rows).toEqual([
      ['출발 시각', '9월 30일 08:00'],
      ['도착 예정', '9월 30일 08:49'],
    ]);
  });

  it('compareNearby는 칸마다 한 줄이고 기준 칸만 (요청)으로 표시한다', () => {
    const rows = predictedTimeRows(predictedPayload.data);

    expect(rows).toEqual([
      ['07:30 출발', '42분 · 08:12 도착'],
      ['08:00 출발 (요청)', '49분 · 08:49 도착'],
      ['08:30 출발', '45분 · 09:15 도착'],
    ]);
  });

  it('시각이 없는 칸은 세지 않는다', () => {
    expect(predictedTimeRows({ times: [{ index: 0, spend_time: 100 }] })).toEqual([]);
  });

  it('도착 시각만 와도 적는다 (arriveAt으로 물은 경우)', () => {
    const rows = predictedTimeRows({
      times: [{ index: 0, spend_time: 1800, arriveAt: '2026-09-30T09:00:00+09:00' }],
    });

    expect(rows).toEqual([['도착 예정', '9월 30일 09:00']]);
  });

  it('호스트 시간대가 달라도 한국 시각 그대로 보인다', () => {
    const slot = {
      index: 0,
      spend_time: 2940,
      departAt: '2026-09-30T08:00:00+09:00',
      arriveAt: '2026-09-30T08:49:00+09:00',
    };

    // Date를 거쳤다면 UTC 호스트에서 전날 23시가 됐을 값이다.
    expect(new Date(slot.departAt).getUTCHours()).toBe(23);
    expect(predictedTimeRows({ times: [slot] })[0]).toEqual(['출발 시각', '9월 30일 08:00']);
  });
});

describe('renderRoute의 예측 시각 줄', () => {
  it('예측 탐색이면 사이드바에 후보 시각이 함께 나온다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderRoute(inavi, map, predictedPayload);

    expect(result.listHtml).toContain('08:00 출발 (요청)');
    expect(result.listHtml).toContain('49분 · 08:49 도착');
  });

  it('실시간 탐색이면 시각 줄이 아예 없다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderRoute(inavi, map, livePayload);

    expect(result.listHtml).not.toContain('출발');
    expect(result.listHtml).not.toContain('도착 예정');
    // 기본 줄은 그대로다.
    expect(result.listHtml).toContain('총 거리');
    expect(result.listHtml).toContain('탐색 옵션');
  });
});
