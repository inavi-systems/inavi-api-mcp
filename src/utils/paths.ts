import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 프로젝트 루트를 찾는다.
 *
 * ESM에는 `__dirname`이 없고, 이 파일의 `import.meta.url`은 실행 형태에 따라 달라진다.
 * (tsx 개발 실행 → `src/utils/`, tsup 번들 실행 → `dist/`)
 * 따라서 고정 상대경로 대신 `package.json`이 나올 때까지 위로 올라간다.
 */
function findProjectRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error('프로젝트 루트를 찾지 못했습니다 (package.json 없음)');
    }
    current = parent;
  }
}

export const PROJECT_ROOT = findProjectRoot();

/** 프로젝트 루트 기준 경로를 절대경로로 만든다. */
export function fromProjectRoot(...segments: string[]): string {
  return resolve(PROJECT_ROOT, ...segments);
}
