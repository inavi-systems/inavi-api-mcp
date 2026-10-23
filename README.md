# INAVI Maps API MCP Server

[![npm version](https://img.shields.io/npm/v/@inavi-maps/api-mcp-server)](https://www.npmjs.com/package/@inavi-maps/api-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI 어시스턴트가 INAVI Maps API를 **직접 호출**해 장소·주소·경로를 찾고, 결과를
**대화 안의 동적 지도**로 보여 주는 MCP (Model Context Protocol) 서버입니다.

- **장소·주소 검색** - 상호명·업종·주소로 찾기, 주변 분류 검색, 지오코딩·리버스 지오코딩을 지원합니다.
- **경로** - 자동차(실시간·출발 시각 예측)·도보·킥보드 경로, 경유지 순서 최적화, 거리·시간 행렬을 지원합니다.
- **지도 표시** - 결과를 [MCP Apps](https://github.com/modelcontextprotocol/ext-apps)로 대화 안에 표시하여, 다양한 인터랙션을 지원합니다.

---

## API Key 발급
API Key 발급은 [이 곳](https://mapsapi.inavisys.com/mcp-intro#how-to-use)에서 확인해주세요.
> **이 서버는 API Key 없이 시작되지 않습니다.** 아래 빠른 시작의 `INAVI_APPKEY`에 발급받은 키를 넣어 주세요.

---

## 빠른 시작

Claude Desktop, Cursor, VS Code, Claude Code, Codex, Windsurf 등 다양한 MCP 호스트에서 사용할 수 있습니다.

> **사전 요구사항:** Node.js 22 이상이 설치되어 있어야 합니다 (`node -v`로 확인).

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=inavi-maps-api&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBpbmF2aS1tYXBzL2FwaS1tY3Atc2VydmVyIl0sImVudiI6eyJJTkFWSV9BUFBLRVkiOiJZT1VSX0FQSV9LRVkifX0=)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=inavi-maps-api&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22inavi_appkey%22%2C%22description%22%3A%22INAVI%20Maps%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40inavi-maps%2Fapi-mcp-server%22%5D%2C%22env%22%3A%7B%22INAVI_APPKEY%22%3A%22%24%7Binput%3Ainavi_appkey%7D%22%7D%7D)

**표준 설정** — 대부분의 MCP 호스트에서 그대로 사용할 수 있습니다. `YOUR_API_KEY`를 발급받은 API Key로 바꾼 뒤
호스트를 재시작하세요.

```json
{
  "mcpServers": {
    "inavi-maps-api": {
      "command": "npx",
      "args": ["-y", "@inavi-maps/api-mcp-server"],
      "env": { "INAVI_APPKEY": "YOUR_API_KEY" }
    }
  }
}
```

사용 중인 도구를 펼쳐 설정 위치를 확인하세요.

<details>
<summary><b>Claude Desktop</b></summary>

`claude_desktop_config.json`에 표준 설정을 추가합니다. ([공식 가이드](https://modelcontextprotocol.io/docs/develop/connect-local-servers))

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

</details>

<details>
<summary><b>Cursor</b></summary>

위 **Install in Cursor** 버튼을 누르거나, `~/.cursor/mcp.json`에 표준 설정을 추가합니다. ([공식 가이드](https://cursor.com/docs/mcp))
버튼으로 설치했다면 설정의 `YOUR_API_KEY`를 발급받은 API Key로 바꿔 주세요.

</details>

<details>
<summary><b>VS Code</b></summary>

위 **Install in VS Code** 버튼을 누르면 설치할 때 API Key를 입력하는 창이 뜹니다. 키는 설정 파일에 평문으로 남지 않습니다.
또는 다음 명령을 실행합니다. ([공식 가이드](https://code.visualstudio.com/docs/agents/reference/mcp-configuration))

```bash
code --add-mcp '{"name":"inavi-maps-api","command":"npx","args":["-y","@inavi-maps/api-mcp-server"],"env":{"INAVI_APPKEY":"YOUR_API_KEY"}}'
```

설정 파일을 직접 편집할 때는 최상위 키가 `mcpServers`가 아닌 `servers`입니다.

</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport stdio inavi-maps-api --env INAVI_APPKEY=YOUR_API_KEY -- npx -y @inavi-maps/api-mcp-server
```

또는 `~/.claude.json`에 표준 설정을 추가합니다. ([공식 가이드](https://code.claude.com/docs/en/mcp))

</details>

<details>
<summary><b>Codex</b></summary>

```bash
codex mcp add inavi-maps-api --env INAVI_APPKEY=YOUR_API_KEY -- npx -y @inavi-maps/api-mcp-server
```

또는 `~/.codex/config.toml`에 추가합니다 (TOML 형식). ([공식 가이드](https://developers.openai.com/codex/mcp))

```toml
[mcp_servers.inavi-maps-api]
command = "npx"
args = ["-y", "@inavi-maps/api-mcp-server"]
env = { INAVI_APPKEY = "YOUR_API_KEY" }
```

</details>

<details>
<summary><b>Windsurf</b></summary>

`~/.codeium/windsurf/mcp_config.json`에 표준 설정을 추가합니다. ([공식 가이드](https://docs.windsurf.com/windsurf/cascade/mcp))

</details>

> **지도는 MCP Apps를 지원하는 호스트에서만 보입니다.** Claude Desktop에서 확인했습니다.
> 지원하지 않는 호스트에서도 도구 호출과 응답은 그대로 동작하고, 지도만 그려지지 않습니다.

---

## 사용 예시

결과에 대한 지도 시각화를 원한다면 `지도에 보여줘`를 함께 요청하세요.

> Claude Desktop, ChatGPT App은 기본 내장 도구로 구글 지도를 지원합니다. 프롬프트 끝에 `INAVI MCP를 사용해줘`를 붙이는 것을 추천합니다.

### 장소·주소

```
판교역 주변 스타벅스 찾아서 지도에 보여줘. INAVI MCP를 사용해줘
```

```
판교역 반경 500m 안의 편의점 전부 지도에 보여줘. INAVI MCP를 사용해줘
```

```
경기도 성남시 분당구 판교역로 240 좌표 알려줘. INAVI MCP를 사용해줘
```

```
127.110750, 37.402159 여기 주소가 어디야? INAVI MCP를 사용해줘
```

### 경로

```
판교역에서 강남역까지 자동차 경로 알려줘. 지도에 보여줘. INAVI MCP를 사용해줘
```

```
내일 아침 8시에 판교역에서 강남역으로 출발하면 얼마나 걸려? 8시 반이랑 비교해줘. INAVI MCP를 사용해줘
```

```
판교역에서 판교테크노밸리까지 걸어가는 길 알려줘. 계단은 피하고 싶어. INAVI MCP를 사용해줘
```

```
판교역에서 출발해서 서현역, 정자역, 미금역을 들르는 가장 짧은 순서 알려줘. INAVI MCP를 사용해줘
```

```
판교역, 서현역, 정자역 사이 거리랑 시간 비교해줘. INAVI MCP를 사용해줘
```

---

## 사용 가능한 도구

INAVI Maps API를 호출하는 **11개의 도구**를 제공합니다. `lookup_category_code`를 뺀 10개의 도구에서
지도를 그릴 수 있습니다.

| 도구 | 설명 |
|------|------|
| `search_places` | 상호명·건물명·업종·주소·전화번호로 장소와 주소를 검색합니다. 한국어·영어·일본어·중국어를 지원합니다 |
| `search_nearby_category` | 한 지점 주변(반경·사각 영역)에서 같은 분류의 장소를 모두 찾습니다 — 편의점·주차장·충전소처럼 이름이 제각각인 것 |
| `geocode_address` | 주소를 좌표로 바꿉니다 |
| `reverse_geocode` | 좌표를 주소·행정구역 코드·가장 가까운 건물 이름으로 바꿉니다 |
| `find_entry_points` | 경로 탐색 전에 좌표를 차량 진입로·택시 승하차 지점으로 보정합니다 |
| `get_admin_boundary` | 시도·시군구·읍면동·리의 행정구역 경계를 가져옵니다 |
| `find_route` | 경유지 최대 5개의 자동차 경로. 실시간 또는 출발·도착 시각 기준 예측입니다 |
| `find_walking_route` | 도보·킥보드(PM) 경로. 계단·엘리베이터 같은 시설 정보를 담습니다 |
| `optimize_waypoint_order` | 경유지 최대 10곳의 최적 방문 순서를 구합니다 |
| `get_distance_matrix` | 여러 지점 사이의 거리·시간 행렬을 구합니다 |
| `lookup_category_code` | 분류 이름으로 분류 코드를 찾습니다 (API를 호출하지 않습니다) |

### 지도에서 할 수 있는 일

지도는 결과를 보여 주는 데서 끝나지 않습니다. 대화의 흐름이 끊기지 않도록 옵션 값을 변경하여 MCP Apps 내부에서 도구를 호출할 수 있습니다.

| 결과 | 지도에서 하는 일 |
|---|---|
| 장소 검색 | 언어 바꾸기 · 페이지 넘기기 · 현재 지도에서 재검색 · 경로 만들기 프롬프트 생성 |
| 주변 분류 검색 | 페이지 넘기기 · 경로 만들기 프롬프트 생성 |
| 지오코딩 | 페이지 넘기기 |
| 자동차 경로 | 탐색 기준 변경(추천·무료 도로·고속도로) · 차종 변경 |
| 도보 경로 | 이동 수단 변경(도보·킥보드) · 탐색 기준 변경 |
| 거리·시간 행렬 | 실시간 교통 반영 |

**경로 만들기**는 목록이나 지도에서 출발·도착을 골라 경로 탐색 질문을 **대화 입력창에 채워** 줍니다.
보내기 전에 문장을 확인할 수 있습니다. 목록의 **대화로** 버튼도 같은 방식으로 그 장소를 대화에 넘깁니다.

모든 지도에서 지도 유형(일반·항공·하이브리드·지형)과 밝은·어두운 테마를 바꿀 수 있고,
MCP 호스트가 지원하면 전체화면으로 볼 수 있습니다.

---

## 환경 변수

| 변수 | 필수 | 설명 |
|---|:---:|---|
| `INAVI_APPKEY` | 필수 | INAVI Maps API Key |

---

## 문제 해결

### MCP 서버가 연결되지 않을 때

1. **API Key 확인**: 서버 설정의 `env`에 `INAVI_APPKEY`가 있는지 확인 — 없으면 서버가 시작되지 않습니다
2. **Node.js 버전 확인**: Node.js 22 이상이 필요합니다 (`node -v`로 확인)
3. **설정 파일 확인**: JSON 문법 오류가 없는지 확인
4. **MCP Host 재시작**: 설정 변경 후 반드시 완전히 종료했다가 다시 실행

### 그 밖의 증상

| 증상 | 확인할 것 |
|---|---|
| 인증 실패(`300`) | `INAVI_APPKEY` 값이 맞는지 |
| 지도 대신 "지도 표시 없이 조회한 결과입니다."만 뜬다 | 정상입니다. 요청에 "지도에 보여줘"를 붙이세요 |
| 지도가 빈 화면 | `imaps.inavi.com`에 접근할 수 있는지(사내망 방화벽) |
| MCP Inspector에서 지도 배경이 안 보인다 | Inspector는 지도 SDK가 쓰는 워커를 막습니다. 도구 호출 확인용으로 쓰고, 지도는 Claude Desktop에서 확인하세요 |

---

## 라이선스

MIT License - 자유롭게 사용, 수정, 배포할 수 있습니다. 자세한 내용은 [LICENSE](./LICENSE) 파일을 참조하세요.

---

## 참고 자료

- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP 공식 문서
- [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) - 대화 안에 화면을 그리는 MCP 확장
- [Claude Desktop](https://claude.ai/download) - Claude Desktop 다운로드
- [INAVI Maps API](https://mapsapi.inavisys.com/) - INAVI Maps API 공식 문서
