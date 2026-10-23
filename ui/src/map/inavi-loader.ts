import type { InaviNamespace } from './inavi';
import { app } from '../host/app-instance';
import { describeToolError, readToolBody } from '../host/tool-result';
import { DisplayError } from '../host/error-text';

/** iNavi Web SDK 로더를 부르는 데 필요한 값. 서버의 `get_map_config`가 돌려준다. */
export interface MapConfig {
  baseUrl: string;
  appkey: string;
}

export type MapConfigLoader = () => Promise<MapConfig>;

/** 템플릿만 부를 수 있는 서버 도구 (src/tools/app/app.tool.ts). */
const MAP_CONFIG_TOOL = 'get_map_config';

/**
 * 반드시 `initMap`이어야 한다.
 *
 * `?callback=` 쿼리 파라미터는 무시된다 — 로더 엔드포인트가 응답에 `"callback":"initMap"`을
 * 하드코딩해서 내려주기 때문이다(어떤 값을 보내도 동일). 다른 이름을 등록하면 로더가
 * `window.initMap`을 찾지 못해 Promise 체인 안에서 throw하고, catch가 없어 조용히 멈춘다.
 */
const READY_CALLBACK = 'initMap';

/**
 * 이 서버에서 띄운 지도임을 밝히는 쿼리 값. REST 호출과 같은 값이다
 * (`src/clients/inavi-http.client.ts`의 `CLIENT_QUERY`). 액세스 로그로 호출량을 따로 센다.
 */
const CLIENT_TAG = 'api-mcp';

/** 부트스트랩 로더는 받았지만 SDK가 준비 콜백을 부르지 않을 때까지 기다리는 시간. */
const READY_TIMEOUT_MS = 15_000;

/**
 * 화면에 내보낼 한 문장. **기술 원인은 섞지 않는다.**
 *
 * 지도가 안 뜨는 까닭은 CSP·CDN 차단처럼 전부 연동 쪽 사정이라 사용자가 할 수 있는 일이
 * 없다. 원인은 `DisplayError`의 `message`에 남아 개발자 도구에서 보인다.
 */
const LOAD_FAILED_TEXT = '지도를 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.';

const CSP_HINT =
  '호스트가 iframe에 적용하는 CSP를 확인하세요. ' +
  '지도 SDK는 API 도메인과 리소스 CDN(예: https://timbase.inavi.com) 양쪽을 모두 사용하고, ' +
  '벡터 타일 렌더링에 blob Worker가 필요합니다(worker-src blob:).';

let loadPromise: Promise<InaviNamespace> | undefined;
let configPromise: Promise<MapConfig> | undefined;

/**
 * 서버에서 지도 설정을 받아 온다.
 *
 * 앱키를 템플릿 HTML에 박아 두지 않으려고 매번 서버에 묻는다. 대신 모듈 변수에 캐시해
 * 도구 결과가 여러 번 와도 호출은 한 번만 나간다.
 */
export async function loadMapConfigFromServer(): Promise<MapConfig> {
  configPromise ??= (async () => {
    if (!app.getHostCapabilities()?.serverTools) {
      throw new DisplayError(
        LOAD_FAILED_TEXT,
        '호스트가 템플릿의 서버 도구 호출을 지원하지 않습니다(hostCapabilities.serverTools 없음). ' +
          `지도 설정(${MAP_CONFIG_TOOL})을 받아올 수 없어 지도를 그릴 수 없습니다.`,
      );
    }

    const result = await app.callServerTool({ name: MAP_CONFIG_TOOL, arguments: {} });
    if (result.isError) {
      throw new DisplayError(
        LOAD_FAILED_TEXT,
        `${MAP_CONFIG_TOOL} 호출이 실패했습니다: ${describeToolError(result)}`,
      );
    }

    const config = readMapConfig(readToolBody(result));
    if (!config) {
      throw new DisplayError(
        LOAD_FAILED_TEXT,
        `${MAP_CONFIG_TOOL} 응답에서 baseUrl/appkey를 찾지 못했습니다.`,
      );
    }
    return config;
  })();

  try {
    return await configPromise;
  } catch (error) {
    // 실패한 Promise를 캐시에 남기면 다음 도구 결과에서도 영영 같은 에러가 난다.
    configPromise = undefined;
    throw error;
  }
}

function readMapConfig(value: unknown): MapConfig | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { baseUrl, appkey } = value as Partial<MapConfig>;
  if (typeof baseUrl !== 'string' || typeof appkey !== 'string') return undefined;
  return { baseUrl, appkey };
}

/**
 * iNavi Web JS SDK를 동적으로 주입해 로드한다.
 *
 * SDK는 `?callback=` 방식의 전역 콜백으로 준비 완료를 알린다. HTML에 `<script src>`를
 * 정적으로 박으면 그 클래식 스크립트가 defer된 모듈 스크립트보다 먼저 실행돼,
 * 콜백이 정의되기 전에 호출되어 버린다. 그래서 모듈 코드에서 직접 주입한다.
 *
 * @param loadConfig 지도 설정을 얻는 방법. 기본값은 서버의 템플릿 전용 도구 호출이다.
 */
export function loadInaviSdk(
  loadConfig: MapConfigLoader = loadMapConfigFromServer,
): Promise<InaviNamespace> {
  loadPromise ??= injectSdk(loadConfig).catch((error: unknown) => {
    // 여기서도 실패를 캐시하지 않는다. 설정 조회가 한 번 흔들렸다고 영영 못 그리면 안 된다.
    loadPromise = undefined;
    throw error;
  });

  return loadPromise;
}

async function injectSdk(loadConfig: MapConfigLoader): Promise<InaviNamespace> {
  if (window.inavi) return window.inavi;

  const { baseUrl, appkey } = await loadConfig();

  return new Promise<InaviNamespace>((resolve, reject) => {
    if (window.inavi) {
      resolve(window.inavi);
      return;
    }

    // 부트스트랩 로더는 성공했는데 SDK 본체가 준비되지 않는 경우가 있다.
    // (CDN 리소스 차단, blob Worker 차단으로 렌더러 초기화 실패 등)
    const timer = setTimeout(() => {
      reject(
        new DisplayError(
          LOAD_FAILED_TEXT,
          `INAVI Maps SDK가 ${READY_TIMEOUT_MS / 1000}초 안에 준비되지 않았습니다. ${CSP_HINT}`,
        ),
      );
    }, READY_TIMEOUT_MS);

    Reflect.set(window, READY_CALLBACK, () => {
      clearTimeout(timer);
      Reflect.deleteProperty(window, READY_CALLBACK);
      if (window.inavi) {
        resolve(window.inavi);
      } else {
        reject(
          new DisplayError(
            LOAD_FAILED_TEXT,
            'INAVI Maps SDK 로드 콜백은 실행됐지만 window.inavi가 없습니다.',
          ),
        );
      }
    });

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `${baseUrl}/appkeys/${appkey}/maps?callback=${READY_CALLBACK}&client=${CLIENT_TAG}`;
    script.onerror = () => {
      clearTimeout(timer);
      reject(
        new DisplayError(
          LOAD_FAILED_TEXT,
          `INAVI Maps SDK 로더를 불러오지 못했습니다 (${baseUrl}). ` +
            `API Key가 유효한지 확인하고, ${CSP_HINT}`,
        ),
      );
    };
    document.head.appendChild(script);
  });
}
