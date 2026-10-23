import './styles.css';
import { applyHostFonts, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps';
import type { McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { app } from './host/app-instance';
import { shouldShowMap, type ToolPayload } from './shared/payload';
import { setLastToolArguments } from './host/tool-context';
import { setHostTheme } from './map/theme';
import { noteHostDisplayMode } from './host/display-mode';
import { refreshMapRail } from './rail/map-rail';
import {
  collapseView,
  handleToolCancelled,
  handleToolInput,
  renderInto,
  setStatus,
  teardownView,
} from './render-host';
import { restoreCoords } from './host/restore-coords';

/** 호스트가 알려준 테마/스타일 토큰을 문서에 반영해 대화 UI와 톤을 맞춘다. */
function applyHostTheme(context: McpUiHostContext | undefined): void {
  if (!context) return;
  // 테마는 사용자가 직접 고를 수도 있어 theme.ts가 우선순위를 정한다.
  setHostTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);

  // 표시 모드가 바뀌면 전체화면 아이콘도 뒤집혀야 한다. 호스트가 컨텍스트로 알려 오는
  // 시점이 요청 응답보다 늦어, 여기서 한 번 더 맞춰 준다 (display-mode.ts).
  noteHostDisplayMode((context as { displayMode?: 'inline' | 'fullscreen' | 'pip' }).displayMode);
  refreshMapRail();
}

// 응답에는 검색 조건이 없다. 반경·영역을 그리려면 요청 인자를 알아야 한다.
app.ontoolinput = (params) => {
  setLastToolArguments(params.arguments);
  // 결과가 오기 전까지 기다리는 중임을 알린다. 취소가 무엇을 걷는지도 이걸로 보인다.
  handleToolInput();
};

app.ontoolresult = (params) => {
  // 도구들이 모두 같은 리소스를 참조하므로 중간 단계 조회에도 템플릿이 뜬다.
  // 서버가 실어 준 표시 여부를 보고, 꺼져 있으면 지도를 그리지 않는다.
  if (!shouldShowMap(params._meta)) {
    collapseView();
    return;
  }
  // 좌표 배열은 대화 부담을 줄이려고 본문에서 빠져 _meta로 온다. 그리기 전에 되꽂는다.
  const payload = params.structuredContent as ToolPayload | undefined;
  void renderInto(restoreCoords(payload, params._meta), params._meta);
};

app.onhostcontextchanged = (context) => applyHostTheme(context);

// 사용자가 도구 실행을 멈추면 결과가 오지 않는다. 진행 표시를 걷어 준다.
app.ontoolcancelled = () => {
  handleToolCancelled();
};

// 호스트가 템플릿을 내리기 전에 보내는 정리 요청. 지도 SDK가 잡고 있는 것을 놓아 준다.
app.onteardown = () => {
  teardownView();
  return {};
};

app.onerror = () => {
  // 호스트 쪽 원문은 사용자가 할 수 있는 일이 없는 기술 설명이다 (261016 리뷰).
  setStatus('문제가 생겨 결과를 표시하지 못했습니다. 잠시 뒤 다시 시도해주세요.', 'error');
};

setStatus('도구 결과를 기다리는 중...', 'loading');

app
  .connect()
  .then(() => applyHostTheme(app.getHostContext()))
  .catch(() => {
    setStatus('호스트에 연결하지 못했습니다. 잠시 뒤 다시 시도해주세요.', 'error');
  });
