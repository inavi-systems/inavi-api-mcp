import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup/env.ts'],
    environmentOptions: {
      // 뷰 테스트는 "무엇을 주입했는가"만 검증한다. happy-dom이 실제로 스크립트를
      // 가져오려다 남기는 네트워크 실패 로그를 끈다.
      happyDOM: { settings: { disableJavaScriptFileLoading: true } },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
