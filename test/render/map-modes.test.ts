// @vitest-environment happy-dom
import { enveloped } from './envelope';
import { describe, expect, it, vi } from 'vitest';
import { startRoutePicker } from '../../ui/src/route-pick/route-picker';
import type { InaviMapMouseEvent } from '../../ui/src/map/inavi';
import reverseFixture from '../fixtures/reverse-geocode.response.json';
import { createFakeInavi } from './fake-inavi';

const found = enveloped(reverseFixture, 'rename');

function clickMap(
  handlers: Map<string, (e: InaviMapMouseEvent) => void>,
  lng: number,
  lat: number,
): void {
  handlers.get('click')?.({ lngLat: { lng, lat } });
}

/** 클릭 핸들러가 비동기 조회를 마칠 때까지 기다린다. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('startRoutePicker', () => {
  function picker(onReady = vi.fn()) {
    const fake = createFakeInavi();
    const started = startRoutePicker(fake.inavi, fake.map, {
      lookup: () => Promise.resolve(found),
      onStatus: vi.fn(),
      onReady,
    });
    return { ...fake, picker: started, onReady };
  }

  it('목록에서 두 곳을 고르면 문장을 만들되 **보내지는 않는다**', () => {
    const { picker: started, onReady, markers } = picker();

    started.add({ name: '판교역', position: [127.110862, 37.394834] });
    expect(onReady).not.toHaveBeenCalled();

    started.add({ name: '강남역', position: [127.027621, 37.497942] });

    expect(onReady).toHaveBeenCalledWith(
      '판교역(127.110862, 37.394834)에서 강남역(127.027621, 37.497942)까지 자동차 경로를 알려줘.',
      expect.objectContaining({ name: '판교역' }),
      expect.objectContaining({ name: '강남역' }),
    );
    // **핀은 지도에 그대로 있다.** 걷어 버리면 자기가 찍은 도착지를 보지 못한다.
    expect(markers).toHaveLength(2);
    expect(markers.every((marker) => marker.attachedToMap)).toBe(true);
  });

  it('다시 고르기를 하면 핀을 걷고 출발지부터 다시 받는다', () => {
    const { picker: started, markers, onReady } = picker();

    started.add({ name: 'A', position: [127.1, 37.4] });
    started.add({ name: 'B', position: [127.2, 37.5] });
    started.reset();

    expect(markers.every((marker) => !marker.attachedToMap)).toBe(true);
    expect(started.add({ name: 'C', position: [127.3, 37.6] })).toBe('start');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('지도 클릭으로도 고를 수 있다', async () => {
    const { picker: started, mapHandlers, onReady } = picker();

    started.add({ name: '판교역', position: [127.11, 37.39] });
    clickMap(mapHandlers, 127.02, 37.49);
    await settle();

    // 클릭 지점의 이름과 좌표는 리버스 지오코딩 결과에서 온다.
    expect(onReady).toHaveBeenCalledWith(
      expect.stringContaining('삼환하이펙스A동'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('이름을 못 얻어도 좌표로 고른다', async () => {
    const fake = createFakeInavi();
    const onReady = vi.fn();
    const started = startRoutePicker(fake.inavi, fake.map, {
      lookup: () => Promise.reject(new Error('실패')),
      onStatus: vi.fn(),
      onReady,
    });

    started.add({ name: '판교역', position: [127.11, 37.39] });
    clickMap(fake.mapHandlers, 127.02, 37.49);
    await settle();

    expect(onReady).toHaveBeenCalledWith(
      expect.stringContaining('127.020000, 37.490000'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('어느 자리를 채웠는지 돌려준다 — 목록 줄에 자국을 남기는 근거다', () => {
    // 부르는 쪽이 단계를 따로 세면 picker와 어긋난다. 채운 자리를 직접 받는다.
    const { picker: started } = picker();

    expect(started.add({ name: 'A', position: [127.1, 37.4] })).toBe('start');
    expect(started.add({ name: 'B', position: [127.2, 37.5] })).toBe('end');
    // 둘을 고르면 확인을 기다린다. 그동안에는 더 고를 수 없다.
    expect(started.add({ name: 'C', position: [127.3, 37.6] })).toBeUndefined();
  });

  it('핀은 고른 줄의 번호 핀 자리에 세우고, 경로에는 진입로 좌표를 넘긴다', () => {
    // POI는 표출용(건물 중심)과 진입로 좌표가 따로다. 진입로에 S를 찍으면 100m쯤 떨어진
    // 도로 위에 서서 "내가 고른 게 저거 맞나" 싶어진다 (실기 피드백).
    const { picker: started, markers, onReady } = picker();

    started.add({
      name: '판교역',
      position: [127.112525, 37.394727],
      pinPosition: [127.111412, 37.395],
    });

    expect(markers[0]?.position).toEqual([127.111412, 37.395]);

    started.add({ name: '서현역', position: [127.123774, 37.384753] });
    // 문장에 실리는 것은 진입로 좌표다.
    expect(onReady).toHaveBeenCalledWith(
      expect.stringContaining('127.112525, 37.394727'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('진입로가 같은 두 장소는 고를 수 없다', () => {
    // 판교역(KTX)과 판교역(경강선)은 `rpx/rpy`가 같다. 그대로 보내면 출발·도착이 같아
    // 탐색이 되지 않는다 (실기 피드백).
    const fake = createFakeInavi();
    const onStatus = vi.fn();
    const onReady = vi.fn();
    const started = startRoutePicker(fake.inavi, fake.map, {
      lookup: () => Promise.resolve(found),
      onStatus,
      onReady,
    });

    started.add({ name: '판교역(KTX)', position: [127.112525, 37.394727] });
    const slot = started.add({ name: '판교역(경강선)', position: [127.112525, 37.394727] });

    expect(slot).toBeUndefined();
    expect(onReady).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.stringContaining('차량 진입로가 같습니다'),
      'warn',
    );

    // 막혔을 뿐 끝난 것은 아니다. 다른 곳을 고르면 이어서 된다.
    started.add({ name: '서현역', position: [127.123774, 37.384753] });
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('지금 고르는 것이 출발지인지 도착지인지 알려 준다', () => {
    // 목록 항목에 "출발지로"/"도착지로"를 띄우는 근거다.
    const fake = createFakeInavi();
    const onStep = vi.fn();
    const started = startRoutePicker(fake.inavi, fake.map, {
      lookup: () => Promise.resolve(found),
      onStatus: vi.fn(),
      onStep,
      onReady: vi.fn(),
    });

    expect(onStep).toHaveBeenLastCalledWith('start');

    started.add({ name: 'A', position: [127.1, 37.4] });
    expect(onStep).toHaveBeenLastCalledWith('end');
  });

  it('확인을 기다리는 동안에는 지도 클릭을 받지 않는다', async () => {
    // 핸들러는 아직 붙어 있다 — `다시 고르기`로 돌아올 수 있어야 하기 때문이다.
    // 그래도 세 번째 지점이 끼어들면 안 된다.
    const { picker: started, mapHandlers, markers } = picker();

    started.add({ name: 'A', position: [127.1, 37.4] });
    started.add({ name: 'B', position: [127.2, 37.5] });
    clickMap(mapHandlers, 127.3, 37.6);
    await settle();

    expect(markers).toHaveLength(2);
  });

  it('그만두면 핀을 걷고 핸들러를 뗀다', () => {
    const { picker: started, mapHandlers, markers } = picker();

    started.add({ name: 'A', position: [127.1, 37.4] });
    started.add({ name: 'B', position: [127.2, 37.5] });
    started.cancel();

    expect(mapHandlers.size).toBe(0);
    expect(markers.every((marker) => !marker.attachedToMap)).toBe(true);
  });

  it('그만두면 문장을 만들지 않는다', () => {
    const { picker: started, mapHandlers, onReady } = picker();

    started.add({ name: 'A', position: [127.1, 37.4] });
    started.cancel();
    started.add({ name: 'B', position: [127.2, 37.5] });

    expect(onReady).not.toHaveBeenCalled();
    expect(mapHandlers.size).toBe(0);
  });
});
