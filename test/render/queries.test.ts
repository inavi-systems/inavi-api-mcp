// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAKE_BOUNDS } from './fake-inavi';

const host = vi.hoisted(() => ({
  callServerTool: vi.fn((_params: { arguments?: Record<string, unknown> }) =>
    Promise.resolve({
      structuredContent: { header: { isSuccessful: true }, data: { poi: [] } },
    }),
  ),
}));

vi.mock('../../ui/src/host/app-instance', () => ({ app: { callServerTool: host.callServerTool } }));

const { defaultReqcount, runOptionTool, runRoute, runSearch, searchInBounds } =
  await import('../../ui/src/host/queries');
const { getSearchArguments, setLastToolArguments } = await import('../../ui/src/host/tool-context');

beforeEach(() => {
  host.callServerTool.mockClear();
});

/** 마지막 호출의 인자만 꺼내 본다. */
function lastArguments(): Record<string, unknown> {
  const calls = host.callServerTool.mock.calls;
  const call = calls[calls.length - 1]?.[0] as { arguments?: Record<string, unknown> } | undefined;
  return call?.arguments ?? {};
}

describe('searchInBounds (이 영역 재검색)', () => {
  it('화면 영역을 좌상단(x1·y1)·우하단(x2·y2)으로 넘긴다', async () => {
    // 스펙과 실제 API로 확인한 순서다 — x1/y1이 Extent 좌상단, x2/y2가 우하단.
    await searchInBounds({ query: '카페' }, FAKE_BOUNDS);

    expect(lastArguments()).toMatchObject({
      area: 'bbox',
      x1: FAKE_BOUNDS.west,
      y1: FAKE_BOUNDS.north,
      x2: FAKE_BOUNDS.east,
      y2: FAKE_BOUNDS.south,
    });
  });

  it('처음 검색의 조건을 물려받는다', async () => {
    // 분류·언어·정렬을 떨구면 같은 자리를 다시 찾았는데 다른 것이 나온다.
    await searchInBounds(
      { query: '카페', language: 'en', catecode: '110100', sort: 'distance', reqcount: 50 },
      FAKE_BOUNDS,
    );

    expect(lastArguments()).toMatchObject({
      query: '카페',
      language: 'en',
      catecode: '110100',
      sort: 'distance',
      reqcount: 50,
      // 템플릿이 직접 그린다. 대화에 지도를 하나 더 띄우지 않는다.
      showMap: false,
    });
  });

  it('결과 없음(100)은 고장이 아니라 답이다', async () => {
    // 그대로 "오류"라고 적으면 사용자는 무엇이 깨진 줄 안다 (실기 피드백).
    host.callServerTool.mockResolvedValueOnce({
      structuredContent: {
        header: { isSuccessful: false, resultCode: 100, resultMessage: 'result not found' },
      },
    } as never);

    await expect(searchInBounds({ query: '카페' }, FAKE_BOUNDS)).rejects.toThrow(
      /검색 결과가 존재하지 않습니다/,
    );
  });

  it('그 밖의 실패도 사용자용 문구로 바꿔 알린다', async () => {
    // 코드와 원문을 그대로 적으면 사용자가 할 수 있는 일이 없다 (error-text.ts).
    host.callServerTool.mockResolvedValueOnce({
      structuredContent: {
        header: { isSuccessful: false, resultCode: 300, resultMessage: 'auth failed' },
      },
    } as never);

    await expect(searchInBounds({ query: '카페' }, FAKE_BOUNDS)).rejects.toThrow(/서버 설정/);
  });

  it('도구 실패(isError)의 모델용 힌트는 화면에 흘리지 않는다', async () => {
    // 서버는 실패에 영문 행동 힌트를 붙여 올린다. 그건 모델의 몫이다 (261016 리뷰).
    host.callServerTool.mockResolvedValueOnce({
      isError: true,
      content: [
        {
          type: 'text',
          text:
            'INAVI Maps API 호출 실패: 100 - Result Not Found\n' +
            'Nothing matched. Broaden the search or try different wording, then call again.',
        },
      ],
    } as never);

    await expect(searchInBounds({ query: '카페' }, FAKE_BOUNDS)).rejects.toThrow(
      '검색 결과가 존재하지 않습니다.',
    );
  });
});

/**
 * 세 가지 일(영역 재검색 · 옵션 변경 · 페이징)이 **서로 이어지려면** 템플릿이 "지금 보고 있는
 * 결과를 만든 인자"를 들고 있어야 한다. 모델이 부른 인자만 보면 템플릿이 한 일이 매번 지워진다.
 */
describe('다시 부른 인자가 다음 기준이 된다', () => {
  it('영역을 바꾸면 그 영역이 기준이 된다', async () => {
    setLastToolArguments({ query: '카페', area: 'radius', x1: 127.1, y1: 37.4, radius: 1000 });

    await searchInBounds(getSearchArguments(), FAKE_BOUNDS);

    expect(getSearchArguments()).toMatchObject({
      query: '카페',
      area: 'bbox',
      x1: FAKE_BOUNDS.west,
      y1: FAKE_BOUNDS.north,
    });
  });

  it('영역이 바뀌면 쪽수는 처음으로 돌아간다', async () => {
    setLastToolArguments({ query: '카페', startposition: 40 });

    await searchInBounds(getSearchArguments(), FAKE_BOUNDS);

    expect(getSearchArguments().startposition).toBeUndefined();
  });

  it('쪽을 넘겨도 앞서 바꾼 영역을 지킨다', async () => {
    setLastToolArguments({ query: '카페' });
    await searchInBounds(getSearchArguments(), FAKE_BOUNDS);

    await runSearch({ ...getSearchArguments(), startposition: 30 });

    expect(lastArguments()).toMatchObject({
      area: 'bbox',
      x1: FAKE_BOUNDS.west,
      startposition: 30,
    });
  });

  it('실패하면 기준을 바꾸지 않는다', async () => {
    setLastToolArguments({ query: '카페', area: 'radius', x1: 127.1, y1: 37.4, radius: 1000 });
    host.callServerTool.mockResolvedValueOnce({
      structuredContent: { header: { isSuccessful: false, resultCode: 100 } },
    } as never);

    await expect(searchInBounds(getSearchArguments(), FAKE_BOUNDS)).rejects.toThrow();

    expect(getSearchArguments()).toMatchObject({ area: 'radius', radius: 1000 });
  });

  it('영역에 맞는 좌표 칸만 싣는다', async () => {
    // `area="bbox"`에 radius를, `area="radius"`에 x2/y2를 함께 보내면 무엇으로 찾았는지가
    // 인자만 봐서는 모호해진다.
    await runSearch({ query: '카페', area: 'radius', x1: 127.1, y1: 37.4, radius: 500, x2: 1 });

    expect(lastArguments()).toMatchObject({ area: 'radius', radius: 500 });
    expect(lastArguments()).not.toHaveProperty('x2');
  });
});

/**
 * 경로를 옵션만 바꿔 다시 부르는 길 (레일의 `탐색`·`차종`).
 */
describe('runRoute (경로 옵션 바꿔 다시 찾기)', () => {
  it('빠져 온 좌표를 되꽂는다', async () => {
    // 경로 좌표는 대화 부담을 줄이려고 본문에서 빠져 `_meta.routeCoords`로 온다. 모델이
    // 부른 결과는 main.ts가 되꽂아 주지만, 템플릿이 스스로 부른 결과는 그 길을 지나지
    // 않아 **`경로 좌표가 없습니다`**가 떴다 (실기 피드백).
    host.callServerTool.mockResolvedValueOnce({
      structuredContent: { header: { isSuccessful: true }, data: { paths: [{}] } },
      _meta: {
        routeCoords: [
          [
            [127.1, 37.4],
            [127.2, 37.5],
          ],
        ],
      },
    } as never);

    const payload = await runRoute({ startX: 127.1, startY: 37.4, endX: 127.2, endY: 37.5 });

    expect(payload.data?.paths?.[0]?.coords).toEqual([
      [127.1, 37.4],
      [127.2, 37.5],
    ]);
  });

  it('지도는 템플릿이 그린다 — 대화에 지도를 하나 더 띄우지 않는다', async () => {
    await runRoute({ startX: 127.1, startY: 37.4, endX: 127.2, endY: 37.5, option: 'highway' });

    expect(lastArguments()).toMatchObject({ option: 'highway', showMap: false });
  });

  it('도보 경로는 도보 도구를 다시 부른다 — 자동차 도구에 도보 옵션을 넘기면 거부된다', async () => {
    await runRoute({ startX: 127.1, startY: 37.4, mode: 'pm' }, 'find_walking_route');

    expect(host.callServerTool.mock.calls.at(-1)?.[0]).toMatchObject({
      name: 'find_walking_route',
    });
  });
});

/**
 * 주변 분류 검색의 쪽 넘기기. **결과를 만든 도구를 그대로** 다시 부른다.
 */
describe('runSearch — 주변 분류 검색', () => {
  const NEARBY = {
    catecode: '060402',
    area: 'radius' as const,
    x1: 127.11,
    y1: 37.4,
    radius: 500,
    sort: 'distance' as const,
  };

  it('같은 도구를 영역·분류·정렬 그대로 부르고 쪽만 옮긴다', async () => {
    await runSearch({ ...NEARBY, startposition: 20 }, 'search_nearby_category');

    expect(host.callServerTool.mock.calls.at(-1)?.[0]).toMatchObject({
      name: 'search_nearby_category',
    });
    expect(lastArguments()).toMatchObject({ ...NEARBY, startposition: 20, showMap: false });
  });

  it('이 도구에 없는 칸은 싣지 않는다', async () => {
    await runSearch({ ...NEARBY, query: '주유소', language: 'en' }, 'search_nearby_category');

    expect(lastArguments()).not.toHaveProperty('query');
    expect(lastArguments()).not.toHaveProperty('language');
  });

  it('건수를 채우지 않는다 — 첫 쪽이 도구 기본값(20건)으로 왔다', async () => {
    // 통합 검색 쪽처럼 30을 채우면 첫 쪽 20건 다음이 `21–50`이 되어 쪽 크기가 어긋난다.
    await runSearch(NEARBY, 'search_nearby_category');

    expect(lastArguments().reqcount).toBeUndefined();
    expect(defaultReqcount('search_nearby_category')).toBe(20);
    expect(defaultReqcount('search_places')).toBe(30);
  });
});

/**
 * 지오코딩의 쪽 넘기기. 주변 분류 검색과 같은 결이다 — 조건을 그대로 두고 쪽만 옮긴다.
 */
describe('runSearch — 지오코딩', () => {
  const GEOCODE = {
    query: '경기도 성남시 분당구 삼평동',
    posX: 127.11,
    posY: 37.4,
    addrext: '1' as const,
  };

  it('같은 도구를 조건 그대로 부르고 쪽만 옮긴다', async () => {
    await runSearch({ ...GEOCODE, startposition: 20 }, 'geocode_address');

    expect(host.callServerTool.mock.calls.at(-1)?.[0]).toMatchObject({ name: 'geocode_address' });
    expect(lastArguments()).toMatchObject({ ...GEOCODE, startposition: 20, showMap: false });
  });

  it('건수를 채우지 않는다 — 첫 쪽이 도구 기본값(5건)으로 왔다', async () => {
    await runSearch(GEOCODE, 'geocode_address');

    expect(lastArguments().reqcount).toBeUndefined();
    expect(defaultReqcount('geocode_address')).toBe(5);
  });
});

describe('runOptionTool (진입 지점 종류·거리 행렬 교통 바꿔 다시 찾기)', () => {
  it('같은 도구를 인자 그대로 부르고 지도는 템플릿이 그린다', async () => {
    await runOptionTool('find_entry_points', { posX: 127.11, posY: 37.4, kind: 'car' });

    expect(host.callServerTool.mock.calls.at(-1)?.[0]).toMatchObject({
      name: 'find_entry_points',
      arguments: { posX: 127.11, posY: 37.4, kind: 'car', showMap: false },
    });
  });

  it('거리 행렬은 교통만 바꾸고 지점·자리 이름은 그대로 싣는다', async () => {
    const points = [
      { x: 127.11, y: 37.4, place: { name: '판교역' } },
      { x: 127.12, y: 37.38, place: { name: '서현역' } },
    ];
    await runOptionTool('get_distance_matrix', { points, traffic: true });

    expect(host.callServerTool.mock.calls.at(-1)?.[0]).toMatchObject({
      name: 'get_distance_matrix',
      arguments: { points, traffic: true, showMap: false },
    });
  });
});
