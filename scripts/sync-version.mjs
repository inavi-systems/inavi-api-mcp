// npm version이 package.json을 올린 직후("version" 훅) server.json의 버전을 맞춘다.
// MCP Registry는 server.json의 패키지 버전이 npm에 실제로 있는 버전이어야 받는다.
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const server = JSON.parse(readFileSync('server.json', 'utf-8'));

server.version = version;
for (const pkg of server.packages ?? []) pkg.version = version;

writeFileSync('server.json', `${JSON.stringify(server, null, 2)}\n`);
process.stderr.write(`server.json 버전을 ${version}으로 맞췄다\n`);
