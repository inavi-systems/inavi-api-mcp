// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolPayload } from '../../ui/src/shared/payload';

const host = vi.hoisted(() => ({
  updateModelContext: vi.fn(() => Promise.resolve({})),
  getHostCapabilities: vi.fn((): Record<string, unknown> | undefined => ({
    updateModelContext: { text: {} },
  })),
}));

vi.mock('../../ui/src/host/app-instance', () => ({
  app: {
    updateModelContext: host.updateModelContext,
    getHostCapabilities: host.getHostCapabilities,
  },
}));

const { buildSearchReport, reportToModel } = await import('../../ui/src/host/model-context');

function payloadOf(count: number, total = count): ToolPayload {
  return {
    data: {
      totalcount: total,
      poi: Array.from({ length: count }, (_, index) => ({
        name1: `장소 ${index + 1}`,
        catename: '카페',
        roadname: `어딘가로 ${index + 1}`,
      })),
    },
  };
}

beforeEach(() => {
  host.updateModelContext.mockClear();
  host.updateModelContext.mockImplementation(() => Promise.resolve({}));
  host.getHostCapabilities.mockImplementation(() => ({ updateModelContext: { text: {} } }));
});

describe('buildSearchReport', () => {
  it('무엇을 했고 몇 건이 나왔는지 먼저 말한다', () => {
    const text = buildSearchReport('"카페"로 이 영역 재검색을 했다', payloadOf(3));

    expect(text).toContain('대화를 거치지 않고');
    expect(text).toContain('"카페"로 이 영역 재검색을 했다');
    expect(text).toContain('3건');
  });

  it('장소를 번호 붙여 나열한다', () => {
    const text = buildSearchReport('찾았다', payloadOf(2));

    expect(text).toContain('1. 장소 1 · 카페 · 어딘가로 1');
    expect(text).toContain('2. 장소 2 · 카페 · 어딘가로 2');
  });

  it('상위 5건까지만 싣는다', () => {
    // 대용량 대응으로 줄여 둔 것을 여기서 도로 늘리면 안 된다.
    const text = buildSearchReport('찾았다', payloadOf(20));

    expect(text).toContain('5. 장소 5');
    expect(text).not.toContain('6. 장소 6');
    expect(text).toContain('상위 5건만');
    expect(text).toContain('20건');
  });

  it('전부 실었으면 생략 문구를 붙이지 않는다', () => {
    expect(buildSearchReport('찾았다', payloadOf(3))).not.toContain('상위');
  });

  it('지오코딩의 주소 후보도 나열한다 — 장소(poi)가 없다고 하지 않는다', () => {
    const text = buildSearchReport('다음 쪽으로 검색을 다시 했다', {
      data: {
        totalcount: 25,
        adm: [
          {
            address: '경기도 성남시 분당구 삼평동',
            jibun: '678',
            roadname: '경기도 성남시 분당구 판교역로',
            roadjibun: '240',
          },
        ],
      },
    });

    expect(text).toContain(
      '1. 경기도 성남시 분당구 판교역로 240 · 경기도 성남시 분당구 삼평동 678',
    );
    expect(text).not.toContain('표시할 장소가 없다');
  });

  it('진입 지점은 종류와 좌표로 나열한다', () => {
    const text = buildSearchReport('진입 지점 종류를 바꿔 다시 찾았다', {
      data: { entrypoints: [{ x: 127.11, y: 37.4, type: 1 }] },
    });

    expect(text).toContain('결과 1건');
    expect(text).toContain('1. 차량 진입로 · 127.11, 37.4');
  });

  it('결과가 없어도 무슨 일이 있었는지는 알린다', () => {
    const text = buildSearchReport('찾았다', { data: { poi: [], totalcount: 0 } });

    expect(text).toContain('찾았다');
    expect(text).toContain('표시할 장소가 없다');
  });

  it('검색 결과가 아니어도 죽지 않는다', () => {
    expect(() => buildSearchReport('했다', undefined)).not.toThrow();
    expect(() => buildSearchReport('했다', { data: { adm: [] } })).not.toThrow();
  });
});

describe('reportToModel', () => {
  it('호스트가 받으면 참', async () => {
    await expect(reportToModel('안녕')).resolves.toBe(true);
    expect(host.updateModelContext).toHaveBeenCalledWith({
      content: [{ type: 'text', text: '안녕' }],
    });
  });

  it('호스트가 안 받아도 던지지 않고 거짓을 돌려준다', async () => {
    // 규격상 Optional이라 지원하지 않는 호스트가 있다. 지도는 그대로 돌아야 한다.
    host.updateModelContext.mockImplementation(() => Promise.reject(new Error('unsupported')));

    await expect(reportToModel('안녕')).resolves.toBe(false);
  });

  it('호스트가 능력을 선언하지 않으면 부르지도 않는다', async () => {
    // `resolve`를 성공으로 믿었더니, 조용히 삼키는 호스트에서 우리는 성공으로 세고
    // 사용자는 아무 안내도 못 받았다 (S2 실기). 부르기 전에 능력부터 본다.
    host.getHostCapabilities.mockImplementation(() => ({}));

    await expect(reportToModel('안녕')).resolves.toBe(false);
    expect(host.updateModelContext).not.toHaveBeenCalled();
  });

  it('글 블록을 안 받는다고 하면 부르지 않는다', async () => {
    // 능력 값은 불리언이 아니라 모달리티 목록이다. 객체가 있다는 것만 보면
    // `{}`(받긴 하는데 지원 모달리티는 없음)을 통과시킨다.
    host.getHostCapabilities.mockImplementation(() => ({ updateModelContext: {} }));

    await expect(reportToModel('안녕')).resolves.toBe(false);
    expect(host.updateModelContext).not.toHaveBeenCalled();
  });

  it('호스트 컨텍스트가 아직 없어도 죽지 않는다', async () => {
    host.getHostCapabilities.mockImplementation(() => undefined);

    await expect(reportToModel('안녕')).resolves.toBe(false);
  });
});
