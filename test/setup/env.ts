// env.config.ts는 import 시점에 환경 변수를 검증하므로 테스트 전에 값을 넣어 둔다.
import { vi } from 'vitest';

vi.stubEnv('INAVI_APPKEY', 'test-appkey');
vi.stubEnv('INAVI_DOMAIN', 'https://test-imaps.inavi.com');
vi.stubEnv('NODE_ENV', 'test');
