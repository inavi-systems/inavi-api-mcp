import dotenv from 'dotenv';
import { z } from 'zod';
import { fromProjectRoot } from '@/utils/paths';

// stdout은 JSON-RPC 전용이다. dotenv가 무엇이든 출력하면 호스트의 메시지 파싱이 깨지므로
// 로드하는 동안만 stdout 쓰기를 봉인한다.
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (() => true) as typeof process.stdout.write;
dotenv.config({ path: fromProjectRoot('.env'), quiet: true });
process.stdout.write = originalWrite;

const envSchema = z.object({
  INAVI_APPKEY: z
    .string()
    .min(1, 'INAVI_APPKEY는 필수입니다. .env 파일이나 환경 변수로 설정하세요.'),
  /**
   * **개발 서버 시험용이다. 사용자 문서(README·.env.example)에 적지 않는다.**
   * 앱키 말고는 사용자가 바꿀 값이 없다.
   */
  INAVI_DOMAIN: z
    .string()
    .url('INAVI_DOMAIN은 URL 형식이어야 합니다.')
    .default('https://imaps.inavi.com'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // 에러도 반드시 stderr로. stdout에 쓰면 프로토콜이 오염된다.
  const detail = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  process.stderr.write(`[env] 환경 변수 검증 실패:\n${detail}\n`);
  throw new Error('환경 변수 로드에 실패했습니다.');
}

const env = parsed.data;

/**
 * **환경 변수로 열지 않는다.** CDN은 지도 템플릿의 통신 허용 목록(CSP)에 그대로 들어가므로
 * 바뀌면 지도가 빈 화면이 되거나 엉뚱한 출처를 허용하게 된다. 타임아웃도 사용자가 고를 값이
 * 아니다. 바꿀 일이 생기면 여기서 고치고 새 버전으로 낸다.
 */
const CDN_DOMAIN = 'https://timbase.inavi.com';
const REQUEST_TIMEOUT_MS = 10_000;
const baseUrl = `${env.INAVI_DOMAIN}/maps/v3.0`;

export const config = {
  env: env.NODE_ENV,
  isTest: env.NODE_ENV === 'test',
  inavi: {
    domain: env.INAVI_DOMAIN,
    appkey: env.INAVI_APPKEY,
    baseUrl,
    /** 앱키까지 포함한, 실제 API 호출에 쓰는 주소 */
    fullUrl: `${baseUrl}/appkeys/${env.INAVI_APPKEY}`,
    /**
     * Web SDK의 실제 리소스(JS·CSS·벡터 타일·스프라이트·글리프)가 있는 호스트.
     * API 도메인은 부트스트랩 로더만 내려주고, 로더가 다시 이 호스트에서 본체를 받아 온다.
     * 뷰의 CSP에 반드시 포함돼야 하며, 빠지면 지도가 빈 화면으로 뜬다.
     */
    cdnDomain: CDN_DOMAIN,
    timeoutMs: REQUEST_TIMEOUT_MS,
  },
} as const;

export type Config = typeof config;
