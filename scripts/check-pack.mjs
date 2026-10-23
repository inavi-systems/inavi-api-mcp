// npm 묶음에 들어갈 파일이 정해 둔 목록과 같은지 본다.
// 소스맵(dist/server.js.map)이 섞이면 원본 주석이 그대로 실리고, public/ui/map.html이
// 빠지면 지도가 뜨지 않는다. 둘 다 빌드는 통과하므로 배포 전에 여기서 막는다.
import { execFileSync } from 'node:child_process';

const EXPECTED = [
  '.env.example',
  'LICENSE',
  'README.md',
  'dist/server.js',
  'package.json',
  'public/ui/map.html',
];

const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf-8',
  shell: process.platform === 'win32',
});
const actual = JSON.parse(output)[0].files.map((file) => file.path).sort();

const missing = EXPECTED.filter((path) => !actual.includes(path));
const extra = actual.filter((path) => !EXPECTED.includes(path));

if (missing.length > 0 || extra.length > 0) {
  if (missing.length > 0) process.stderr.write(`빠진 파일: ${missing.join(', ')}\n`);
  if (extra.length > 0) process.stderr.write(`더 들어간 파일: ${extra.join(', ')}\n`);
  process.exit(1);
}

process.stderr.write(`npm 묶음 ${actual.length}개 파일 확인\n`);
