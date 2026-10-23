// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import optimizeFixture from '../fixtures/route-optimize-points-10.response.json';
import matrixFixture from '../fixtures/route-distance-matrix.response.json';
import { renderOptimize } from '../../ui/src/render/optimize';
import { renderMatrix } from '../../ui/src/render/matrix';
import { droppedMatrixText, enveloped } from './envelope';
import { createFakeInavi } from './fake-inavi';
import { PIN_SERIES, seriesColor } from '../../ui/src/map/map-colors';

const optimizePayload = enveloped(optimizeFixture, 'unwrap');
const matrixPayload = enveloped(matrixFixture, 'wrap', droppedMatrixText);

describe('봉투 (서버 src/tools/common/envelope.ts와 같은 모양)', () => {
  it('wrap은 없던 껍질을 만든다 — RDM만 본문 래퍼 키가 없다', () => {
    expect(matrixPayload.data?.mode).toBe('tms');
    expect(matrixPayload.data?.origins).toHaveLength(3);
    expect(matrixPayload.data?.rows).toHaveLength(3);
  });

  it('asIs·unwrap은 본문의 result(boolean)를 뺀다', () => {
    expect(optimizePayload.data).not.toHaveProperty('result');
    expect(optimizePayload.data?.optimize).toHaveLength(5);
  });

  it('RDM의 distance.text·duration.text는 떼고 넣는다', () => {
    const element = matrixPayload.data?.rows?.[0]?.elements?.[0];

    expect(element?.distance?.text).toBeUndefined();
    expect(element?.duration?.text).toBeUndefined();
    expect(element?.distance?.value).toBe(18494);
  });
});

describe('renderOptimize (실제 TSP 응답 기준)', () => {
  it('선을 긋지 않는다 — 응답에 실제 주행 경로가 없다', () => {
    const { inavi, map, polylines, markers } = createFakeInavi();

    renderOptimize(inavi, map, optimizePayload);

    expect(polylines).toHaveLength(0);
    expect(markers).toHaveLength(5);
  });

  it('담긴 순서가 방문 순서다 — index(요청 순서)로 다시 세우지 않는다', () => {
    const { inavi, map } = createFakeInavi();
    const points = optimizePayload.data?.optimize ?? [];

    const result = renderOptimize(inavi, map, optimizePayload);

    expect(points[1]?.index).toBe(2);
    expect(result.coordinates[1]).toEqual([points[1]?.x, points[1]?.y]);
    expect(result.coordinates).toEqual(points.map((point) => [point.x, point.y]));
  });

  it('첫 지점의 distance 0을 "0m 걸렸다"로 적지 않는다', () => {
    const { inavi, map } = createFakeInavi();
    const result = renderOptimize(inavi, map, optimizePayload);

    const [first, second] = result.listHtml.split('<li').slice(2);
    expect(first).toContain('출발 지점');
    expect(second).toContain('이전 지점에서');
  });

  it('실제 경로는 대화로 넘긴다 — 템플릿이 find_route를 직접 부르지 않는다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderOptimize(inavi, map, optimizePayload);

    const host = document.createElement('ul');
    host.innerHTML = result.listHtml;
    const message = host.querySelector<HTMLElement>('[data-send]')?.dataset.send ?? '';

    expect(message).toContain('경로를 찾아줘');
    expect(message).toContain('127.110762,37.402184');
    expect(message.split('→')).toHaveLength(5);
  });

  it('전체 거리·시간을 요약에 적는다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderOptimize(inavi, map, optimizePayload);

    expect(result.summary).toBe('방문 5곳 · 28.0km · 36분');
  });

  it('결과가 없으면 안내 문구를 돌려준다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderOptimize(inavi, map, { data: { optimize: [] } });

    expect(result.coordinates).toHaveLength(0);
    expect(result.summary).toBe('최적화된 방문 순서가 없습니다.');
  });
});

describe('renderMatrix (실제 RDM 응답 기준)', () => {
  it('출발·도착 지점만 찍고 선은 긋지 않는다', () => {
    const { inavi, map, markers, polylines } = createFakeInavi();

    const result = renderMatrix(inavi, map, matrixPayload);

    expect(polylines).toHaveLength(0);
    expect(markers).toHaveLength(5); // 출발 3 + 도착 2
    expect(result.coordinates).toHaveLength(5);
  });

  it('"경도,위도" 문자열을 갈라 좌표로 쓴다 — 객체가 아니다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderMatrix(inavi, map, matrixPayload);

    expect(result.coordinates[0]).toEqual([127.110762, 37.402184]);
    expect(result.coordinates[3]).toEqual([127.0276, 37.4979]);
  });

  it('떼어 낸 text를 value에서 다시 만든다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderMatrix(inavi, map, matrixPayload);

    // 출발지는 머리글로 한 번만 적고 그 아래에 도착지를 늘어놓는다.
    expect(result.listHtml).toContain('출발1 →');
    expect(result.listHtml).toContain('도착1');
    expect(result.listHtml).toContain('18.5km · 34분');
    expect(result.summary).toBe('출발 3곳 → 도착 2곳 · 6개 구간');
  });

  it('destinations가 없으면 지점끼리의 행렬이라 마커를 두 번 찍지 않는다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const zero = { distance: { value: 0 }, duration: { value: 0 }, status: 'OK' };
    const leg = { distance: { value: 1000 }, duration: { value: 600 }, status: 'OK' };
    const result = renderMatrix(inavi, map, {
      data: {
        origins: ['127.1,37.4', '127.2,37.5'],
        rows: [{ elements: [zero, leg] }, { elements: [leg, zero] }],
      },
    });

    expect(markers).toHaveLength(2);
    // 자기 자신으로 가는 칸(`0m · 0분`)은 알려 주는 것 없이 자리만 차지한다.
    expect(result.listHtml).not.toContain('0m');
    expect(result.summary).toBe('방문지 2곳 · 2개 구간');
  });

  it('길을 못 찾은 칸은 0m가 아니라 상태를 보여 준다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderMatrix(inavi, map, {
      data: {
        origins: ['127.1,37.4'],
        destinations: ['127.2,37.5'],
        rows: [{ elements: [{ distance: { value: 0 }, status: 'ZERO_RESULTS' }] }],
      },
    });

    expect(result.listHtml).toContain('ZERO_RESULTS');
    expect(result.listHtml).not.toContain('0m');
  });

  it('지점 좌표가 없으면 안내 문구를 돌려준다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderMatrix(inavi, map, { data: { rows: [] } });

    expect(result.coordinates).toHaveLength(0);
    expect(result.summary).toBe('행렬의 지점 좌표가 없습니다.');
  });
});

/**
 * 지점이 **어떤 장소인지.** 두 응답 모두 좌표만 주므로, 모델이 도구 입력에 적어 보낸 것이
 * `_meta.places`로 온다. 없으면 예전처럼 자리 번호와 좌표를 보여 준다.
 */
describe('최적 순서·거리 행렬의 장소 정보', () => {
  const OPTIMIZE = {
    data: {
      optimize: [
        { index: 0, x: 127.111, y: 37.395 },
        { index: 2, x: 127.222, y: 37.495, distance: 400, spend_time: 90 },
      ],
    },
  };

  const MATRIX = {
    data: {
      origins: ['127.111,37.395'],
      destinations: ['127.222,37.495'],
      rows: [{ elements: [{ distance: { value: 1000 }, duration: { value: 600 } }] }],
    },
  };

  function cardOf(fake: ReturnType<typeof createFakeInavi>, index: number): string {
    const icon = fake.markers[index]?.icon;
    if (icon instanceof HTMLElement) icon.dispatchEvent(new Event('mouseenter'));
    return fake.infoWindowContents[fake.infoWindowContents.length - 1] ?? '';
  }

  it('최적 순서 — 이름이 제목, 자리 이름이 칩, 요청 순서는 작은 줄로 내려간다', () => {
    const fake = createFakeInavi();

    renderOptimize(fake.inavi, fake.map, OPTIMIZE, {
      places: {
        points: [
          { name: '판교역', roadAddress: '경기도 성남시 분당구 분당내곡로 121' },
          { name: '서현역', tel: '031-703-7788' },
        ],
      },
    });

    expect(fake.markers.map((m) => m.title)).toEqual(['판교역', '서현역']);

    const first = cardOf(fake, 0);
    expect(first).toContain('iw-chip">출발<');
    expect(first).toContain('경기도 성남시 분당구 분당내곡로 121');
    expect(first).toContain('요청 순서 1번째');
    expect(first).not.toContain('127.111');
  });

  it('최적 순서 — 장소를 안 받으면 예전처럼 자리 이름과 좌표다', () => {
    const fake = createFakeInavi();

    renderOptimize(fake.inavi, fake.map, OPTIMIZE);

    expect(fake.markers.map((m) => m.title)).toEqual(['출발', '마지막 방문지']);
    expect(cardOf(fake, 0)).toContain('127.111');
  });

  it('거리 행렬 — 핀과 표의 머리에 이름을 쓴다', () => {
    const fake = createFakeInavi();

    const result = renderMatrix(fake.inavi, fake.map, MATRIX, {
      places: { origins: [{ name: '판교역' }], destinations: [{ name: '서현역' }] },
    });

    expect(fake.markers.map((m) => m.title)).toEqual(['판교역', '서현역']);
    // `출발1 → 도착1`이 아니라 묻고 싶었던 이름으로 적는다.
    expect(result.listHtml).toContain('판교역 →');
    expect(result.listHtml).toContain('서현역');
  });

  it('거리 행렬 — 장소를 안 받으면 자리 번호와 좌표다', () => {
    const fake = createFakeInavi();

    const result = renderMatrix(fake.inavi, fake.map, MATRIX);

    expect(fake.markers.map((m) => m.title)).toEqual(['S1', 'E1']);
    expect(result.listHtml).toContain('출발1 →');
    expect(result.listHtml).toContain('도착1');
    expect(cardOf(fake, 0)).toContain('127.111');
  });
});

/**
 * **순번마다 다른 색.** 지점이 여럿인데 역할이 모두 같으면 핀이 전부 한 색이고 번호만 달라
 * 지도에서 어느 것이 몇 번인지 짚기 어려웠다(실기 피드백).
 */
describe('번호로 가리키는 핀은 순번마다 색이 다르다', () => {
  /** 핀 안 글자는 핀과 같은 색이다 (render/pin.ts). 거기서 색을 읽는다. */
  function pinColors(fake: ReturnType<typeof createFakeInavi>): string[] {
    return fake.markers.map((marker) => {
      const icon = marker.icon;
      return icon instanceof HTMLElement ? (icon.querySelector('span')?.style.color ?? '') : '';
    });
  }

  it('열 가지를 돌려 쓰고 열한 번째부터 처음으로 돌아간다', () => {
    expect(PIN_SERIES).toHaveLength(10);
    expect(seriesColor(0)).not.toBe(seriesColor(1));
    expect(seriesColor(10)).toBe(seriesColor(0));
    expect(seriesColor(21)).toBe(seriesColor(1));
  });

  it('거리 행렬 — 출발 다음에 도착이 이어지도록 센다', () => {
    const fake = createFakeInavi();

    renderMatrix(fake.inavi, fake.map, {
      data: {
        origins: ['127.111,37.395', '127.112,37.396'],
        destinations: ['127.222,37.495'],
        rows: [],
      },
    });

    // 핀 셋이 모두 다른 색이어야 한다. 같은 색이 둘이면 번호를 세어야 구별된다.
    expect(new Set(pinColors(fake)).size).toBe(3);
  });

  it('최적 순서 — 목록의 순번 배지도 핀과 같은 색이다', () => {
    const fake = createFakeInavi();

    const result = renderOptimize(fake.inavi, fake.map, {
      data: {
        optimize: [
          { index: 0, x: 127.111, y: 37.395 },
          { index: 1, x: 127.112, y: 37.396 },
        ],
      },
    });

    expect(new Set(pinColors(fake)).size).toBe(2);
    // 목록 배지에 **그 핀의 그림**이 그대로 깔려 목록과 지도가 이어진다.
    expect(result.listHtml).toContain(`color:${seriesColor(0)}`);
    expect(result.listHtml).toContain(`color:${seriesColor(1)}`);
  });
});

describe('거리 행렬 목록은 출발지로 묶는다', () => {
  it('머리글 한 줄 + 도착지 줄들, 양쪽에 번호 배지', () => {
    const { inavi, map } = createFakeInavi();
    const leg = { distance: { value: 1000 }, duration: { value: 600 }, status: 'OK' };
    const zero = { distance: { value: 0 }, duration: { value: 0 }, status: 'OK' };

    const result = renderMatrix(inavi, map, {
      data: {
        origins: ['127.1,37.4', '127.2,37.5'],
        rows: [{ elements: [zero, leg] }, { elements: [leg, zero] }],
      },
    });

    const list = document.createElement('ul');
    list.innerHTML = result.listHtml;

    // 출발지 둘 → 머리글 둘. 자기 자신 칸을 뺐으니 딸린 줄도 둘이다.
    expect(list.querySelectorAll('.stat-item.is-heading')).toHaveLength(2);
    expect(list.querySelectorAll('.stat-item.is-child')).toHaveLength(2);
    // 머리글에는 값이 없다. 어디서 출발하는지만 적는다.
    expect(list.querySelector('.stat-item.is-heading .stat-value')).toBeNull();
    expect(list.querySelector('.stat-item.is-heading .stat-label')?.textContent).toBe('지점1 →');
    // 번호 배지는 지도 핀과 같은 색이어야 목록과 지도가 이어진다.
    expect(list.querySelectorAll('.stat-badge')).toHaveLength(4);
    expect(list.querySelector('.stat-badge > b')?.textContent).toBe('1');
    expect(list.querySelector('.stat-badge')?.getAttribute('style')).toContain(
      `color:${seriesColor(0)}`,
    );
  });
});
