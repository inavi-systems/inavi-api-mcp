import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // 배포본에서 개발 주석을 걷는다. 이름은 그대로 두고 공백·주석만 줄인다 — 에러 스택이
  // 읽혀야 한다. 의존성의 라이선스 고지(/*! … */)는 esbuild가 남긴다.
  esbuildOptions(options) {
    options.minifyWhitespace = true;
  },
  // stdio 서버는 단일 파일로 묶어 배포·실행 경로를 단순하게 유지한다.
  bundle: true,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
});
