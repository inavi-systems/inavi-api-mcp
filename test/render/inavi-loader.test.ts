// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapConfig } from '../../ui/src/map/inavi-loader';

const TEST_CONFIG: MapConfig = {
  baseUrl: 'https://test-imaps.example/maps/v3.0',
  appkey: 'test-appkey',
};

/**
 * 로더는 모듈 수준에서 Promise를 캐싱하므로 테스트마다 새로 import 한다.
 * 지도 설정은 서버 도구로 받아 오지만(get_map_config) 여기서는 주입해 대신한다 —
 * 검증하려는 것은 "무엇을 주입했는가"다.
 *
 * happy-dom은 주입된 <script>를 실제로 가져오려다 error 이벤트를 쏘므로 그 거부는 삼킨다.
 */
async function freshLoader(config: MapConfig = TEST_CONFIG) {
  vi.resetModules();
  const { loadInaviSdk } = await import('../../ui/src/map/inavi-loader');
  const promise = loadInaviSdk(() => Promise.resolve(config)).catch(() => undefined);

  // 설정 조회가 await 한 번을 먹으므로 스크립트 주입은 다음 틱에 일어난다.
  await Promise.resolve();
  return { promise, script: document.head.querySelector('script') };
}

beforeEach(() => {
  document.head.innerHTML = '';
});

afterEach(() => {
  Reflect.deleteProperty(window, 'initMap');
  Reflect.deleteProperty(window, 'inavi');
});

describe('loadInaviSdk', () => {
  it('전역 콜백 이름은 반드시 initMap이어야 한다', async () => {
    // 로더 엔드포인트는 ?callback= 값을 무시하고 응답에 "callback":"initMap"을 하드코딩한다.
    // 다른 이름을 등록하면 SDK가 window.initMap을 찾지 못해 조용히 멈춘다 (Promise 체인에 catch 없음).
    const { script } = await freshLoader();

    expect(script?.src).toContain('callback=initMap');
  });

  it('서버에서 받은 설정으로 앱키 경로를 포함한 로더 URL을 만든다', async () => {
    const { script } = await freshLoader();

    expect(script?.src).toContain(`/appkeys/${TEST_CONFIG.appkey}/maps?callback=`);
    expect(script?.src).toContain(TEST_CONFIG.baseUrl);
  });

  // REST 호출과 같은 값이어야 액세스 로그에서 한 이름으로 묶인다.
  it('로더 URL에 호출 출처 client=api-mcp를 붙인다', async () => {
    const { script } = await freshLoader();

    expect(new URL(script?.src ?? '').searchParams.get('client')).toBe('api-mcp');
  });

  it('설정 조회가 실패하면 스크립트를 주입하지 않고 그 이유를 알린다', async () => {
    vi.resetModules();
    const { loadInaviSdk } = await import('../../ui/src/map/inavi-loader');

    await expect(
      loadInaviSdk(() => Promise.reject(new Error('지도 설정을 받지 못했습니다'))),
    ).rejects.toThrow('지도 설정을 받지 못했습니다');
    expect(document.head.querySelector('script')).toBeNull();
  });
});

describe('loadInaviSdk 콜백', () => {
  it('콜백이 실행되면 window.inavi로 resolve하고 전역을 정리한다', async () => {
    vi.resetModules();
    const { loadInaviSdk } = await import('../../ui/src/map/inavi-loader');
    const sdk = { maps: {} };
    Reflect.set(window, 'inavi', sdk);

    // window.inavi가 이미 있으면 설정 조회도 스크립트 주입도 없이 즉시 resolve 한다.
    await expect(loadInaviSdk(() => Promise.reject(new Error('불려서는 안 된다')))).resolves.toBe(
      sdk,
    );
  });
});
