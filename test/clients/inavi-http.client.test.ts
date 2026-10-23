import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INaviApiError, INaviHttpClient, maskAppkey } from '@/clients/inavi-http.client';

const BASE_URL = 'https://test-imaps.inavi.com/maps/v3.0/appkeys/test-appkey';

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as Response;
}

const SUCCESS_HEADER = { isSuccessful: true, resultCode: 0, resultMessage: 'Success' };

describe('INaviHttpClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: INaviHttpClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new INaviHttpClient(BASE_URL, 1000);
  });

  describe('get', () => {
    it('경로와 쿼리를 조합해 호출한다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ header: SUCCESS_HEADER }));

      await client.get('/searches', { query: '판교역', reqcount: 20 });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${BASE_URL}/searches?query=%ED%8C%90%EA%B5%90%EC%97%AD&reqcount=20&client=api-mcp`,
      );
      expect(init.method).toBe('GET');
    });

    // Maps API 서버가 액세스 로그로 이 프로젝트의 호출량을 따로 센다.
    it('호출 출처 client=api-mcp를 붙인다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ header: SUCCESS_HEADER }));

      await client.get('/addresses', { posX: 127.1, posY: 37.4 });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(new URL(url).searchParams.get('client')).toBe('api-mcp');
    });

    it('undefined 파라미터는 쿼리에서 제외한다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ header: SUCCESS_HEADER }));

      await client.get('/searches', { query: 'a', radius: undefined, spopt: '0' });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/searches?query=a&spopt=0&client=api-mcp`);
    });

    it('성공 응답 본문을 그대로 돌려준다', async () => {
      const body = { header: SUCCESS_HEADER, search: { poi: [{ poiid: 1, name1: '판교역' }] } };
      fetchMock.mockResolvedValue(jsonResponse(body));

      await expect(client.get('/searches', { query: 'x' })).resolves.toEqual(body);
    });
  });

  describe('post', () => {
    it('본문을 JSON으로 보내고 undefined 필드를 제거한다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ header: SUCCESS_HEADER }));

      await client.post('/route-normal', {
        option: 'real_traffic',
        startX: 127.1,
        carType: undefined,
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      // 호출 출처는 본문이 아니라 쿼리에 싣는다 — 액세스 로그에는 본문이 남지 않는다.
      expect(url).toBe(`${BASE_URL}/route-normal?client=api-mcp`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ option: 'real_traffic', startX: 127.1 });
    });
  });

  describe('오류 처리', () => {
    // iNavi는 인증 실패도 HTTP 200으로 내려주므로 본문 검사가 유일한 방어선이다.
    it('header.isSuccessful이 false면 INaviApiError를 던진다', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          header: { isSuccessful: false, resultCode: 300, resultMessage: 'Authentication Failed' },
        }),
      );

      const error = await client.get('/searches', { query: 'x' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(INaviApiError);
      expect(error).toMatchObject({ resultCode: 300, resultMessage: 'Authentication Failed' });
      expect((error as Error).message).toContain('300 - Authentication Failed');
    });

    it('HTTP 오류 상태면 예외를 던진다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

      await expect(client.get('/searches', { query: 'x' })).rejects.toThrow(
        'INAVI Maps API HTTP 오류: 500',
      );
    });

    it('header가 없으면 예외를 던진다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ search: {} }));

      await expect(client.get('/searches', { query: 'x' })).rejects.toThrow('header가 없습니다');
    });

    it('오류 메시지에 앱키가 노출되지 않는다', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

      const error = await client.get('/searches', { query: 'x' }).catch((e: unknown) => e);

      expect((error as Error).message).not.toContain('test-appkey');
      expect((error as Error).message).toContain('appkeys/***');
    });
  });
});

describe('maskAppkey', () => {
  it('URL의 앱키 구간만 가린다', () => {
    expect(maskAppkey('https://imaps.inavi.com/maps/v3.0/appkeys/secret123/searches?query=a')).toBe(
      'https://imaps.inavi.com/maps/v3.0/appkeys/***/searches?query=a',
    );
  });
});
