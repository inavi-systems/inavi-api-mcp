import type { FitPadding, InaviBounds, InaviMap, InaviNamespace, LngLatLike } from './map/inavi';
import { loadInaviSdk } from './map/inavi-loader';
import {
  detectKind,
  isCarRoute,
  readWaypointPlaces,
  searchToolOf,
  type PayloadKind,
  type SearchTool,
  type ToolPayload,
  type WaypointPlaces,
} from './shared/payload';
import { requireElement, escapeHtml } from './shared/dom';
import {
  countSearchResults,
  renderSearch,
  resolveSearchView,
  type SearchView,
} from './render/search';
import { renderGeocode } from './render/geocode';
import { renderRoute } from './render/route';
import { renderReverse } from './render/reverse';
import { renderBoundary } from './render/boundary';
import { renderEntryPoints } from './render/entry-points';
import { renderOptimize } from './render/optimize';
import { renderMatrix } from './render/matrix';
import type { RenderResult } from './render/result';
import { mountResultFilters } from './panel/controls';
import { markActiveMode, mountMapRail, type RailSelect } from './rail/map-rail';
import { mountResearchButton, type ResearchButton } from './rail/research-button';
import {
  focusZoom,
  linkMarkersToList,
  resetMarkerLinks,
  type MarkerLinkOptions,
} from './panel/marker-link';
import { applyStoredMapStyle } from './map/map-style';
import { onEffectiveThemeChange } from './map/theme';
import { icon } from './shared/icons';
import { drawSearchArea } from './map/overlays';
import { fitPadding, fitTarget } from './map/fit-area';
import {
  getRequestedVias,
  getSearchArguments,
  noteTemplateSearch,
  rectanglePath,
  toSearchArea,
  type SearchArea,
  type SearchArguments,
} from './host/tool-context';
import {
  defaultReqcount,
  reverseGeocodeAt,
  runOptionTool,
  runRoute,
  runSearch,
  searchInBounds,
  type OptionTool,
  type RouteTool,
} from './host/queries';
import { pageTotal, renderPager, type PagerSpec } from './panel/pager';
import { entryPointSelects, type EntryPointArguments } from './rail/entry-options';
import { matrixOptionSelects, type MatrixArguments } from './rail/matrix-options';
import {
  routeOptionSelects,
  walkingOptionSelects,
  type RouteArguments,
  type WalkingArguments,
} from './rail/route-options';
import { displayText, userErrorText } from './host/error-text';
import { attachSendButtons } from './host/conversation';
import { attachDetailToggles } from './panel/result-detail';
import { notifyResize } from './host/display-mode';
import { buildSearchReport, reportToModel } from './host/model-context';
import { ALL_CATEGORIES, filterPoiByCategory, listPoiCategories } from './panel/poi-filter';
import { startRoutePicker, type RoutePicker } from './route-pick/route-picker';
import type { MapPick } from './route-pick/map-picks';
import { sendToConversation } from './host/conversation';
import { PIN_COLORS, rgba } from './map/map-colors';

const DEFAULT_CENTER: LngLatLike = [127.110749, 37.402158]; // 판교
const DEFAULT_ZOOM = 13;
const FIT_DURATION = 300;

let inaviSdk: InaviNamespace | undefined;
let sendButtonsAttached = false;
let panelToggleAttached = false;

/** 결과 목록을 펼쳐 뒀는지. 결과가 바뀌어도 사용자가 고른 상태를 유지한다. */
let listOpen = true;

/** ② 결과 좁히기를 펼쳐 뒀는지. 첫 화면은 요약 한 줄만 남기도록 접고 시작한다. */
let filtersOpen = false;

/** 지도 유형을 바꿨을 때 같은 결과를 그대로 다시 그리기 위해 남겨 둔다. */
let lastRender: { payload: ToolPayload; options: RenderOptions } | undefined;

/**
 * 분류 필터. **어느 결과에 건 것인지**를 함께 들고 있는다.
 *
 * 지도 유형을 바꿔 다시 그릴 때는 같은 결과 객체가 들어오므로 필터가 유지되고,
 * 새 검색 결과가 오면 객체가 달라 저절로 풀린다. 곳곳에서 초기화를 부를 필요가 없다.
 */
let categoryFilter = ALL_CATEGORIES;
let filteredPayload: ToolPayload | undefined;

/** 지도에 올린 결과 종류. 분류 필터와 같은 자리에서 함께 풀린다. */
let searchView: SearchView = 'place';

/**
 * 지도 클릭을 쓰는 모드. 지금은 경로 만들기 하나다 (261016 리뷰 후속으로 셋에서 줄였다).
 *
 * 모드는 전부 `map.on('click')`을 쓰므로 서로 배타적이다. 모드가 또 생기면 손잡이 옆에
 * 붙이고 `syncMode()`를 부른다.
 */
type MapMode = 'none' | 'route';

let activeRoutePicker: RoutePicker | undefined;
/** 지도 아래 가운데의 `현재 지도에서 재검색`. 지도를 새로 만들 때마다 갈아 끼운다. */
let researchButton: ResearchButton | undefined;
let pickListenerAttached = false;

type Renderer = (inavi: InaviNamespace, map: InaviMap, payload: ToolPayload) => RenderResult;

/** 결과 종류별 렌더러. `Record<PayloadKind, …>`라 종류를 더하면 타입이 빠뜨림을 잡아 준다. */
const RENDERERS: Record<PayloadKind, Renderer> = {
  search: (inavi, map, payload) => renderSearch(inavi, map, payload, { view: searchView }),
  geocode: renderGeocode,
  reverse: renderReverse,
  route: (inavi, map, payload) =>
    renderRoute(inavi, map, payload, {
      vias: getRequestedVias(),
      // 자리마다 어떤 장소인지. 응답에는 없고 도구 입력에서 와 `_meta`에 실려 온다.
      places: lastRender?.options.places,
    }),
  boundary: renderBoundary,
  'entry-points': renderEntryPoints,
  optimize: (inavi, map, payload) =>
    renderOptimize(inavi, map, payload, { places: lastRender?.options.places }),
  matrix: (inavi, map, payload) =>
    renderMatrix(inavi, map, payload, { places: lastRender?.options.places }),
};

/** 목록이 아니라 지표 나열인 결과. `optimize`는 순번이 보여야 해서 뺀다. */
const STAT_LIST_KINDS = new Set<PayloadKind>(['route', 'reverse', 'matrix']);

interface RenderOptions {
  /**
   * 어떤 렌더러로 그릴지. 봉투 통일로 본문 최상위 키가 전부 `data`가 되어
   * 응답만으로는 판별할 수 없다. 호스트가 준 결과는 `_meta.kind`에서,
   * 템플릿이 스스로 가져온 결과는 부르는 쪽이 직접 준다.
   */
  kind?: PayloadKind;
  /**
   * 지도에 함께 그릴 검색 영역.
   *
   * **화면을 그대로 다시 찾은 경우에는 그리지 않는다** — 영역이 곧 지금 보고 있는 화면이라
   * 파란 면이 지도를 통째로 덮을 뿐이다(실기 피드백). 그때도 **화면을 맞추는 데는** 쓰므로
   * 값은 그대로 넘기고 `drawArea`만 끈다.
   */
  area?: SearchArea;
  /** 영역을 지도에 칠할지. 기본은 칠한다. */
  drawArea?: boolean;
  /**
   * 이 장소 목록을 **어느 검색 도구가** 만들었는지. 쪽을 넘길 때 그 도구를 다시 부른다.
   *
   * 영역 재검색과 언어는 `search_places`에서만 연다 (`areaSearchBlockReason`). 주변 분류
   * 검색은 영역이 필수라 바꿀 수 없고 언어 입력이 없다 — 쪽 넘기기만 된다.
   *
   * 템플릿이 스스로 돌린 결과에는 `_meta`가 없어 부르는 쪽이 직접 넘긴다.
   */
  searchTool?: SearchTool;
  /**
   * **자동차 경로**에서 온 결과인지. 도보와 옵션이 달라 갈라 둔다
   * (자동차는 탐색 기준·차종, 도보는 `mode`·`option`).
   *
   * `kind`는 둘을 한 렌더러로 보내므로(`route`) 여기서는 서버가 `_meta.kind`에 적어 보낸
   * 원래 값을 본다 (`isCarRoute`).
   */
  carRoute?: boolean;
  /**
   * 경로의 출발·경유·도착이 어떤 장소인지. 경로 결과에만 온다.
   *
   * 경로 API는 좌표만 돌려주므로 응답으로는 알 수 없다. 모델이 도구 입력에 적어 보낸 값이다.
   */
  places?: WaypointPlaces;
}

/**
 * 표시가 꺼진 도구 결과. 지도를 그리지 않고 흔적만 남긴다.
 *
 * SDK를 아예 부르지 않는 것이 핵심이다. 중간 단계 조회에서 로더를 태우면 네트워크만 쓰고,
 * CSP가 막힌 호스트에서는 15초 타임아웃 에러까지 뜬다.
 */
export function collapseView(): void {
  setMapHint();
  document.documentElement.classList.add('collapsed');
  document.body.classList.add('collapsed');
  requireElement('collapsed-note').hidden = false;
}

function expandView(): void {
  document.documentElement.classList.remove('collapsed');
  document.body.classList.remove('collapsed');
  requireElement('collapsed-note').hidden = true;
}

/** 호스트가 보내 준 도구 결과를 그린다. */
export async function renderInto(
  payload: ToolPayload | undefined,
  meta: Record<string, unknown> | undefined,
): Promise<void> {
  expandView();
  // 응답에는 "어떤 조건으로 찾았는지"가 없다. 요청 인자에서 검색 영역을 뽑아 함께 그린다.
  await renderResult(payload, {
    kind: detectKind(meta),
    area: toSearchArea(getSearchArguments()),
    searchTool: searchToolOf(meta),
    carRoute: isCarRoute(meta),
    places: readWaypointPlaces(meta),
  });
}

async function renderResult(payload: ToolPayload | undefined, options: RenderOptions = {}) {
  const kind = options.kind;

  if (!payload) {
    setStatus('표시할 결과가 없습니다.', 'empty');
    return;
  }
  if (!kind) {
    // `_meta.kind`가 없거나 모르는 종류다.
    setStatus('이 결과는 지도로 표시할 수 없습니다.', 'empty');
    return;
  }
  if (payload.header && payload.header.isSuccessful === false) {
    // 원문에는 모델용 행동 힌트가 영문으로 붙어 온다. 화면에 띄울 문구는 따로 고른다
    // (error-text.ts).
    reportProblem(userErrorText(payload.header.resultCode));
    return;
  }

  // 새 결과가 오면 걸어 둔 분류 필터를 푼다. 같은 결과를 다시 그릴 때는 유지한다.
  if (filteredPayload !== payload) {
    filteredPayload = payload;
    categoryFilter = ALL_CATEGORIES;
    searchView = 'place';
  }
  stopMapMode();

  lastRender = { payload, options };

  try {
    // 지도가 이미 떠 있으면 덮지 않는다. 덮으면 다시 그리는 내내 화면이 통째로 사라진다.
    setBusy('지도를 불러오는 중...');
    inaviSdk ??= await loadInaviSdk();
    const inavi = inaviSdk;

    // 핀은 만들어지는 대로 등록된다. 지난 화면의 것이 섞이지 않게 먼저 비운다.
    resetMarkerLinks();

    const map = createMap(inavi);
    // 스타일은 반드시 그리기 전에 입힌다 (map-style.ts의 applyStoredMapStyle 주석 참고).
    applyStoredMapStyle(map);

    // 분류를 좁혀도 건수는 그대로여야 하므로 원본으로 센다.
    const searchCounts = countSearchResults(payload);
    const shownView = resolveSearchView(searchCounts, searchView);

    /*
     * **주소 보기에서는 검색 영역을 쓰지 않는다.**
     *
     * 공간 조건(반경·사각)은 `poi`에만 걸리고 `adm`에는 안 걸린다(CLAUDE.md). 판교 500m로
     * 물어도 김해 주소가 함께 오는데, 그 영역을 그려 놓고 거기에 지도를 맞추면 **보고 있는
     * 주소가 화면 밖에 있다.** 주소를 볼 때는 영역을 지우고 결과에 맞춘다 (실기 피드백).
     */
    const areaApplies = !(kind === 'search' && shownView === 'address');
    const area = areaApplies ? options.area : undefined;

    if (area && options.drawArea !== false) drawSearchArea(inavi, map, area);

    // 분류 필터는 그릴 때만 적용한다. 원본은 lastRender에 그대로 남는다.
    const shown = filterPoiByCategory(payload, categoryFilter) ?? payload;

    const result = RENDERERS[kind](inavi, map, shown);

    // ①③ 지도에 속하는 조작은 지도 위 레일로. 새 지도를 붙잡아야 하므로 매번 다시 만든다.
    // **한 칸에 경로 만들기와 고르는 줄 한둘만 둔다** — 많이 두었더니 창이 지도를 가렸다
    // (261016 리뷰 후속). 영역 재검색은 통합 검색에서만 뜻이 있다 (`areaSearchBlockReason`).
    const canSearchArea = areaSearchBlockReason() === undefined;
    // 경로 만들기는 **장소 목록이면** 된다 — 주변 분류 검색도 같은 목록이다.
    // 지오코딩은 쪽은 넘기지만 주소 후보라 열지 않는다 (261020 피드백).
    const isPlaceList =
      options.searchTool === 'search_places' || options.searchTool === 'search_nearby_category';

    mountMapRail(requireElement('map-host'), {
      // **도구마다 할 일이 다르다.** 템플릿의 몫은 그 도구의 **옵션을 바꿔 다시 부르는
      // 것**이고, 다른 도구를 부르는 일은 `경로 만들기`처럼 문장을 만들어 대화로 넘긴다.
      // 경로 결과에서 또 경로를 만들 일은 없으므로 거기서는 내지 않는다 (261020 피드백).
      onRoutePick: isPlaceList ? () => startRouteMode(inavi, map) : undefined,
      onStyleChange: rerenderCurrent,
      activeMode: currentMode(),
      // **고르는 줄은 결과 종류를 탄다.** 통합 검색은 언어, 자동차 경로는 탐색 기준·차종.
      selects: railSelects(canSearchArea, kind, options),
    });

    // `현재 지도에서 재검색`은 **레일이 아니라 지도 아래 가운데**에 둔다. 지도를 옮기는
    // 일과 다시 찾는 일이 한 동작처럼 이어져야 한다(실기 피드백). 움직였을 때만 뜬다
    // (research-button.ts).
    researchButton?.destroy();
    researchButton = canSearchArea
      ? mountResearchButton(requireElement('map-host'), map, {
          onClick: () => void runAreaSearch(map.getBounds()),
        })
      : undefined;

    // ② 결과를 좁히는 일은 결과에 속한다. 사이드바 요약 줄 아래에 둔다.
    const hasFilters = mountResultFilters(requireElement('filter-host'), {
      resultViews:
        kind === 'search'
          ? { selected: shownView, counts: searchCounts, onChange: applySearchView }
          : undefined,
      // 분류는 POI의 `catename`으로 거른다. **주소 보기에서는 거를 것이 없으므로** 만들지 않는다.
      categories:
        kind === 'search' && shownView === 'place'
          ? {
              options: listPoiCategories(payload),
              selected: categoryFilter,
              onChange: applyCategoryFilter,
            }
          : undefined,
    });

    fillPanel(result.summary, result.listHtml, STAT_LIST_KINDS.has(kind), {
      // 핀과 목록은 **만든 순서**로 짝지어진다. 좌표도 같은 순서로 쌓인다 (marker-link.ts).
      positions: result.coordinates,
      focusOnMap: (position) => {
        // 가운데로 옮기기만 하면 어느 핀인지 집어내지 못한다 (marker-link.ts의 focusZoom).
        map.flyTo(position, { zoom: focusZoom(map.getZoom()), duration: 450 });
      },
      revealList: openList,
    });
    renderPager(requireElement('pager'), pagerSpec(payload, options, shownView));
    applyFilterState(hasFilters);

    // 패널을 채운 **뒤에** 맞춘다. 펼친 패널이 덮는 너비를 재야 그만큼 비킬 수 있다.
    const fit = fitTarget(result.coordinates, area);
    if (fit.length > 0) {
      map.fitCoordinates(fit, { duration: FIT_DURATION, padding: panelAwarePadding() });
    }
    clearStatus();
    setMapHint();
  } catch (error) {
    reportProblem(displayText(error));
  }
}

/** 호스트가 문장을 받지 못했을 때. 원문은 싣지 않는다 (261016 리뷰). */
const SEND_FAILED_TEXT = '대화로 보내지 못했습니다. 다시 시도해주세요.';

/**
 * 실패를 알리되 **보고 있던 지도는 걷어내지 않는다.**
 *
 * `.status`는 `inset: 0`이라 지도 대신 덮는 자리다. 영역 재검색이 `100 result not found`를
 * 받았을 때 이걸 띄우면 멀쩡히 보던 지도가 통째로 사라지고 에러 문구만 남았다 (실기 피드백).
 * 결과가 없는 것은 오류가 아니라 **그 영역에 없다는 답**이므로, 앞 결과를 그대로 두고
 * 아래 띠로만 알린다. 아직 지도가 없을 때만 화면을 덮는다.
 */
function reportProblem(message: string): void {
  if (document.getElementById('map')) {
    setMapHint(message, 'warn');
    return;
  }
  setStatus(message, 'error');
}

/**
 * 지도 유형이 바뀌면 같은 결과를 처음부터 다시 그린다.
 *
 * 이미 그려 둔 지도에 `setStyle`만 걸면 마커가 사라진다. 지도를 새로 만들어
 * 스타일을 먼저 입히고 그 위에 다시 그리는 것이 유일하게 안전한 순서다.
 */
function rerenderCurrent(): void {
  if (lastRender) void renderResult(lastRender.payload, lastRender.options);
}

/**
 * 테마가 바뀌면 지도 스타일도 함께 바뀐다 — 어두운 테마에서는 야간 스타일을 쓴다
 * (map-style.ts). 이미 그려 둔 지도에 `setStyle`만 걸면 마커가 사라지므로 **지도부터 새로
 * 만들어** 스타일을 입히고 그 위에 다시 그린다. 지도 유형을 바꿀 때와 같은 길이다.
 *
 * 호스트가 테마를 바꿔 알려와도(`auto`) 같은 길을 탄다.
 */
onEffectiveThemeChange(rerenderCurrent);

/**
 * 왕복 없는 분류 필터.
 *
 * 서버도 모델도 부르지 않는다. 이미 받아 둔 결과에서 고른 분류만 남겨 다시 그릴 뿐이다.
 */
function applyCategoryFilter(category: string): void {
  categoryFilter = category;
  rerenderCurrent();

  const shown = filterPoiByCategory(lastRender?.payload, category);
  void tellModel(
    category === ALL_CATEGORIES ? '분류 필터를 풀었다' : `분류를 "${category}"로 좁혔다`,
    shown,
  );
}

/** 분류 필터와 같이 이미 받아 둔 결과만 다시 그린다. 서버도 모델도 부르지 않는다. */
function applySearchView(view: SearchView): void {
  searchView = view;
  rerenderCurrent();
}

/**
 * 템플릿이 스스로 한 일을 모델에게만 알린다 (model-context.ts).
 *
 * 안 받는 호스트에서는 한 번만 알려 주고 만다. 매번 띄우면 잔소리가 된다.
 */
let modelContextUnavailable = false;

async function tellModel(action: string, payload: ToolPayload | undefined): Promise<void> {
  if (modelContextUnavailable) return;

  const delivered = await reportToModel(buildSearchReport(action, payload));
  if (delivered) return;

  modelContextUnavailable = true;
  setMapHint('지도에서 한 조회를 대화에 반영하지 못했습니다. 필요하면 "대화로"를 쓰세요.', 'warn');
}

/**
 * 경로 만들기 모드 — 출발·도착을 골라 대화로 넘긴다.
 *
 * 고르는 곳이 둘이다 — 목록 항목(진입로 좌표를 쓴다)과 지도의 임의 지점.
 * 완성된 문장은 모델이 읽고 `find_route`를 부른다 (route-picker.ts).
 */
function startRouteMode(inavi: InaviNamespace, map: InaviMap): void {
  if (currentMode() === 'route') {
    stopMapMode();
    return;
  }

  stopMapMode();
  // 목록에서도 고를 수 있다는 걸 보이려면 목록이 펼쳐져 있어야 한다.
  openList();

  clearPickMarks();

  activeRoutePicker = startRoutePicker(inavi, map, {
    lookup: reverseGeocodeAt,
    // 고르는 내내 `취소`를 함께 띄운다. 잘못 들어왔을 때 빠져나올 길이 보여야 한다.
    onStatus: (message, tone) => {
      setMapHint(message, tone, [{ label: '취소', onClick: stopMapMode }]);
    },
    onStep: (step) => {
      document.body.classList.toggle('route-step-end', step === 'end');
      // 꼬리표 색이 지도 핀과 같아야 `출발지로`가 빨간 S 핀이 될 것임을 미리 보인다.
      paintPick(document.body, step);
    },
    // **아직 보내지 않았다.** 핀 둘이 지도에 그대로 있고, 여기서 물어본 뒤에 넘긴다.
    onReady: (prompt, start, end) => {
      // **줄을 나눠 적는다.** 한 줄로 이으면 긴 이름 둘에 밀려 `이대로 경로를 물어볼까요?`가
      // 애매한 자리에서 꺾였다 (실기 피드백). 고른 것이 위, 묻는 말이 아래다.
      setMapHint(`${start.name} → ${end.name}\n이대로 경로를 물어볼까요?`, 'info', [
        { label: '경로 묻기', onClick: () => sendRoutePrompt(prompt), primary: true },
        {
          label: '다시 고르기',
          onClick: () => {
            // 목록에 남은 `출발지`·`도착지` 자국까지 걷는다. 두면 고른 것이 그대로
            // 남아 있는 것처럼 보인다 (실기 피드백).
            clearPickMarks();
            activeRoutePicker?.reset();
          },
        },
        { label: '취소', onClick: stopMapMode },
      ]);
    },
  });
  syncMode();
}

/** 확인을 받았다. 고른 자국을 걷고 문장을 대화로 넘긴다. */
function sendRoutePrompt(prompt: string): void {
  activeRoutePicker?.cancel();
  activeRoutePicker = undefined;
  // 자국을 남겨 두면 모드가 아직 돌고 있는 것처럼 보인다 (실기 피드백).
  clearPickMarks();
  syncMode();
  setMapHint('경로 요청을 대화로 넘겼습니다.');
  // 원문을 붙여도 사용자가 할 수 있는 일이 없다 (261016 리뷰).
  sendToConversation(prompt).catch(() => {
    reportProblem(SEND_FAILED_TEXT);
  });
}

/**
 * 지금 켜진 모드.
 *
 * **별도 변수를 두지 않고 손잡이에서 끌어낸다.** 따로 두면 모드가 스스로 끝났을 때
 * 변수만 남아 화면이 거짓말을 한다 — 경로 만들기를 마쳐도 버튼이 눌린 채로 남았다.
 */
function currentMode(): MapMode {
  return activeRoutePicker ? 'route' : 'none';
}

function stopMapMode(): void {
  clearPickMarks();
  activeRoutePicker?.cancel();
  activeRoutePicker = undefined;
  syncMode();
  setMapHint();
}

/**
 * 켜진 모드를 화면에 반영한다. **손잡이를 놓거나 잡은 뒤에 반드시 부른다.**
 *
 * 조작 UI는 결과를 다시 그릴 때만 새로 만들어지는데 모드는 그 사이에도 바뀐다.
 * 이걸 안 부르면 앞 버튼이 눌린 채로 남는다 (실기에서 발견).
 */
function syncMode(): void {
  const mode = currentMode();
  markActiveMode(mode);
  // 모드가 돌 때는 알약 버튼을 감춘다. 안내 띠와 겹치지 않게 한다 (styles.css).
  document.body.classList.toggle('map-mode-on', mode !== 'none');
  document.body.classList.toggle('route-mode', mode === 'route');
  if (mode !== 'route') document.body.classList.remove('route-step-end');
}

/** 접혀 있으면 결과 목록을 펼친다. */
function openList(): void {
  if (listOpen) return;
  listOpen = true;
  applyListState();
}

/**
 * 영역 재검색을 쓸 수 없는 까닭. 쓸 수 있으면 `undefined`.
 *
 * 영역 재검색은 **`search_places`를 조건 그대로 영역만 바꿔 다시 부르는 일**이다(queries.ts의
 * `searchInBounds`). 그래서 기준은 **지금 보고 있는 결과가 그 도구에서 왔는가** 하나뿐이고,
 * 판정은 서버가 `_meta.kind`에 적어 보낸 값으로 한다 (`searchToolOf`).
 *
 * 렌더러 종류로 가르면 주변 분류 검색이, 도구 인자의 `query` 유무로 가르면
 * `get_admin_boundary`가 열린다(둘 다 실제로 빗나갔다). 필드 이름은 도구마다 뜻이 다르다.
 *
 * **판정은 여기 한 곳에서만 한다.** 버튼을 만들지와 호출 직전의 확인(`requireAreaSearch`)이
 * 같은 말을 쓴다.
 */
export function areaSearchBlockReason(): string | undefined {
  return lastRender?.options.searchTool === 'search_places'
    ? undefined
    : '장소를 검색한 결과에서만 쓸 수 있습니다';
}

/** 막힌 상태로 들어왔을 때. 지도를 덮지 않고 아래 띠로만 알린다. */
function requireAreaSearch(what: string): boolean {
  const blocked = areaSearchBlockReason();
  if (!blocked) return true;

  setMapHint(`${what} — ${blocked}`, 'warn');
  return false;
}

/**
 * 목록 항목을 눌러 출발·도착으로 고른다. **경로 만들기 모드일 때만 반응한다.**
 *
 * 목록은 매번 새로 그려지므로 항목마다 걸지 않고 목록에 하나만 걸어 위임한다
 * (`대화로` 버튼과 같은 방식). 항목의 좌표는 `data-pick-*`에 들어 있다.
 */
function attachPickListener(): void {
  if (pickListenerAttached) return;

  requireElement('result-list').addEventListener('click', (event) => {
    if (!activeRoutePicker) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // `대화로`·`상세` 버튼은 모드와 무관하게 제 할 일을 한다.
    if (target.closest('[data-send], [data-detail]')) return;

    const item = target.closest<HTMLElement>('[data-pick-lng]');
    // 이미 고른 줄을 또 누르면 같은 자리로 가는 경로가 된다.
    if (!item || item.classList.contains('is-picked')) return;

    const pick = readPick(item);
    if (!pick) return;

    const slot = activeRoutePicker.add(pick);
    if (slot) markPicked(item, slot);
  });
  pickListenerAttached = true;
}

/**
 * 고른 줄에 자국을 남긴다. 꼬리표 글자만 바뀌어서는 무엇을 골랐는지도 단계가 넘어간 것도
 * 알아채기 어려웠다(실기 피드백).
 */
function markPicked(item: HTMLElement, slot: 'start' | 'end'): void {
  paintPick(item, slot);
  item.dataset.pickedAs = slot === 'start' ? '출발지' : '도착지';
  item.classList.add('is-picked');
}

/** 자리 색을 CSS 변수로 넘긴다. **색은 map-colors.ts에만 적는다**(CLAUDE.md). */
function paintPick(element: HTMLElement, slot: 'start' | 'end'): void {
  const color = slot === 'start' ? PIN_COLORS.start : PIN_COLORS.end;
  element.style.setProperty('--pick-color', color);
  element.style.setProperty('--pick-tint', rgba(color, 0.16));
}

/** 모드를 새로 켜거나 끌 때 지난 자국을 지운다. 목록은 그대로 남아 있기 때문이다. */
function clearPickMarks(): void {
  for (const item of document.querySelectorAll<HTMLElement>('.result-item.is-picked')) {
    item.classList.remove('is-picked');
    delete item.dataset.pickedAs;
    item.style.removeProperty('--pick-color');
    item.style.removeProperty('--pick-tint');
  }
}

function readPick(item: HTMLElement | null): MapPick | undefined {
  const lng = Number(item?.dataset.pickLng);
  const lat = Number(item?.dataset.pickLat);
  if (!item || !Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;

  // 핀 자리와 경로에 넘길 자리는 다를 수 있다 (POI는 표출용·진입로 좌표가 따로다).
  const pinLng = Number(item.dataset.pinLng);
  const pinLat = Number(item.dataset.pinLat);
  const pinPosition: LngLatLike | undefined =
    Number.isFinite(pinLng) && Number.isFinite(pinLat) ? [pinLng, pinLat] : undefined;

  return { name: item.dataset.pickName ?? '선택한 지점', position: [lng, lat], pinPosition };
}

/**
 * 무언가를 기다리는 중임을 알린다.
 *
 * 지도가 아직 없을 때만 화면을 덮는다. 이미 떠 있으면 아래쪽 띠로 알려 **지도를 계속
 * 보이게 둔다.** 영역 재조회는 서버를 한 번 왕복하므로, 그동안 덮어 버리면 그리기가
 * 끝나자마자 화면이 통째로 사라졌다가 돌아오는 것처럼 보인다.
 */
function setBusy(message: string): void {
  if (document.getElementById('map')) {
    setMapHint(message);
    return;
  }
  setStatus(message, 'loading');
}

/** 안내 띠의 결. `warn`은 되지 않거나 비어 있음을 알린다. */
type MapHintTone = 'info' | 'warn';

/**
 * 안내 띠에 다는 버튼.
 *
 * 띠는 본래 읽기만 하는 자리다. 다만 **지도에서 고르는 일은 지도 옆에서 끝나야** 한다 —
 * 경로 만들기에서 잘못 찍었을 때 레일을 다시 열어 모드를 끄게 하면 길이 멀다(실기 피드백).
 */
interface MapHintAction {
  label: string;
  onClick: () => void;
  /** 권하는 쪽. 하나만 준다. */
  primary?: boolean;
}

/**
 * 지도 위 안내를 아래쪽 띠로 띄운다. 지우려면 인자 없이 부른다.
 *
 * **지도가 이미 떠 있을 때는 `setStatus` 대신 이것을 쓴다.** `.status`는 `inset: 0` +
 * 불투명이라 지도 대신 보여주는 자리다. 덮는 것은 물론 클릭까지 먹는다.
 *
 * **결이 둘이다** — `info`는 "하는 중·이렇게 하라", `warn`은 "되지 않는다·비어 있다".
 * 색은 CSS 토큰이 가른다(`--hint-*`). 지도 위라 글자와 색만으로 읽혀야 하므로, 되지 않는
 * 일을 알릴 때는 반드시 `warn`을 준다 (261016 리뷰).
 */
function setMapHint(
  message?: string,
  tone: MapHintTone = 'info',
  actions: MapHintAction[] = [],
): void {
  const hint = ensureMapHintElement();
  if (message === undefined) {
    hint.hidden = true;
    return;
  }

  hint.textContent = message;
  hint.dataset.tone = tone;
  hint.hidden = false;

  if (actions.length === 0) return;

  // **버튼에만 `pointer-events: auto`를 준다** (styles.css). 띠 전체가 클릭을 받으면
  // 그 아래 지도가 먹통이 된다.
  const bar = document.createElement('div');
  bar.className = 'map-hint-actions';
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-hint-button';
    if (action.primary) button.classList.add('is-primary');
    button.textContent = action.label;
    button.addEventListener('click', action.onClick);
    bar.append(button);
  }
  hint.append(bar);
}

/** 지도를 다시 그릴 때 map-host를 비우므로(createMap) 없으면 다시 만든다. */
function ensureMapHintElement(): HTMLElement {
  const existing = document.getElementById('map-hint');
  if (existing) return existing;

  const hint = document.createElement('div');
  hint.id = 'map-hint';
  hint.className = 'map-hint';
  hint.hidden = true;
  requireElement('map-host').appendChild(hint);
  return hint;
}

/**
 * 호스트의 **정리 요청**을 받았을 때 (`ui/resource-teardown`).
 *
 * 규격상 Host MUST에 속하지만 우리가 받는 것은 선택이다. 지도 SDK가 WebGL 컨텍스트와
 * 워커를 붙잡고 있으므로, 닫힐 때 컨테이너를 비워 놓아 준다. 그리는 중이었다면 그만둔다.
 *
 * 비운 뒤에 새 결과가 와도 `createMap`이 컨테이너를 다시 만들므로 되살아난다.
 */
export function teardownView(): void {
  stopMapMode();
  researchButton?.destroy();
  researchButton = undefined;

  const host = document.getElementById('map-host');
  if (host) host.innerHTML = '';

  document.body.classList.remove('has-result');
  lastRender = undefined;
  filteredPayload = undefined;
  categoryFilter = ALL_CATEGORIES;
}

/**
 * 도구가 불렸을 때. 결과는 아직 오지 않았다.
 *
 * 이 표시가 있어야 **취소가 무엇을 걷는지가 눈에 보인다.** 없으면 도구가 도는 동안
 * 옛 결과가 그대로 떠 있어 취소를 받아도 지울 것이 없다.
 */
export function handleToolInput(): void {
  if (document.getElementById('map')) setMapHint('새 결과를 기다리는 중...');
}

/**
 * 도구 실행이 취소됐을 때.
 *
 * 이걸 안 받으면 `~하는 중...`이 **영영 남는다.** 사용자가 중간에 멈춘 것이라
 * 결과는 오지 않고, 우리가 띄운 진행 표시를 걷어 줄 사람도 없다.
 */
export function handleToolCancelled(): void {
  stopMapMode();

  if (document.getElementById('map')) {
    setMapHint('도구 실행이 취소되었습니다.');
    return;
  }
  setStatus('도구 실행이 취소되었습니다.', 'empty');
}

/**
 * ② 템플릿 → 서버 도구.
 *
 * 지금 보고 있는 화면 영역으로 검색을 다시 돌린다. 모델을 거치지 않아 대화에 아무것도 남지 않는다.
 * 무엇을 했는지는 `tellModel`로 모델에게만 알린다 — 안 그러면 모델이 옛 결과로 답한다.
 */
async function runAreaSearch(
  bounds: InaviBounds,
  label = '현재 지도에서 재검색',
  override?: SearchArguments,
): Promise<void> {
  if (!requireAreaSearch(label)) return;

  const args = override ?? getSearchArguments();
  const query = args.query;

  setBusy(`${label} 중...`);

  try {
    // **처음 검색의 조건을 그대로 물려받고 영역만 바꾼다.** 분류·언어·정렬을 떨구면
    // 같은 자리를 다시 찾았는데 다른 것이 나온다.
    const payload = await searchInBounds(args, bounds);
    await renderResult(payload, {
      area: {
        kind: 'polygon',
        path: rectanglePath(bounds.west, bounds.north, bounds.east, bounds.south),
      },
      // **칠하지는 않는다.** 그 영역이 곧 지금 보고 있는 화면이라 파란 면이 지도를 통째로
      // 덮을 뿐이다(실기 피드백). 화면을 맞추는 데만 쓴다.
      drawArea: false,
      kind: 'search',
      // 이것도 `search_places`가 돌려준 결과다. 이어서 또 영역을 바꿀 수 있어야 한다.
      searchTool: 'search_places',
    });
    void tellModel(`"${query}"로 ${label}을(를) 했다`, payload);
  } catch (error) {
    // 결과가 없는 것(100)도 여기로 온다. 앞 결과를 그대로 두고 띠로만 알린다.
    reportProblem(displayText(error));
  }
}

/**
 * 쪽 넘김에 쓸 값. **통합 검색 결과에서만** 만든다 — 다른 도구는 쪽이 없다.
 *
 * 전체 건수는 보고 있는 종류의 것을 쓴다(`poitotalcount`·`admtotalcount`). 둘을 합친
 * `totalcount`로 세면 장소만 보는 화면에서 넘길 쪽이 실제보다 많아진다.
 */
function pagerSpec(
  payload: ToolPayload,
  options: RenderOptions,
  view: SearchView,
): PagerSpec | undefined {
  const tool = options.searchTool;
  if (!tool) return undefined;

  const total = pageTotal(payload.data, view, tool);
  if (total === undefined) return undefined;

  const args = getSearchArguments();
  const count = args.reqcount ?? defaultReqcount(tool);

  return {
    start: args.startposition ?? 0,
    count,
    total,
    onMove: (start) => {
      // 어느 쪽으로 넘겼는지는 요약 줄에 그대로 적힌다. 되돌아간 것을 "다음 쪽"이라 적으면
      // 무엇을 보고 있는지 어긋난다.
      const label = start > (args.startposition ?? 0) ? '다음 쪽' : '이전 쪽';
      void rerunSearch({ ...args, startposition: start || undefined }, label, tool);
    },
  };
}

/**
 * 레일에 올릴 고르는 줄. **결과를 만든 도구가 정한다.**
 *
 * 통합 검색이면 언어, 자동차 경로면 탐색 기준·차종, 도보 경로면 이동 수단·탐색 기준,
 * 진입 지점이면 종류, 거리 행렬이면 교통이다. 바꿀 것이 없는 결과에서는 줄을
 * 만들지 않는다 — 고를 것이 없는 칸이 서면 눌러 보고서야 안다.
 */
function railSelects(
  canSearchArea: boolean,
  kind: PayloadKind,
  options: RenderOptions,
): RailSelect[] | undefined {
  if (canSearchArea) return [languageSelect()];

  if (kind === 'entry-points') {
    return entryPointSelects(getSearchArguments() as EntryPointArguments, (next) => {
      void runOptionToolWith('find_entry_points', next, options, '진입 지점 종류');
    });
  }

  if (kind === 'matrix') {
    return matrixOptionSelects(getSearchArguments() as MatrixArguments, (next) => {
      void runOptionToolWith('get_distance_matrix', next, options, '교통 반영');
    });
  }

  if (kind !== 'route') return undefined;

  // 자동차와 도보는 한 렌더러를 쓰지만 옵션이 다르다 — 서버가 적어 보낸 원래 값으로 가른다.
  const args = getSearchArguments() as Record<string, unknown>;
  if (options.carRoute) {
    return routeOptionSelects(args as RouteArguments, (next) => {
      void runRouteWith(next, options, 'find_route');
    });
  }
  return walkingOptionSelects(args as WalkingArguments, (next) => {
    void runRouteWith(next, options, 'find_walking_route');
  });
}

/** 옵션을 갈아 끼워 **같은 경로를 다시 부른다.** 자리 이름(`places`)은 그대로 물려받는다. */
async function runRouteWith(
  next: Record<string, unknown>,
  options: RenderOptions,
  tool: RouteTool,
): Promise<void> {
  setBusy('경로를 다시 찾는 중...');

  try {
    const payload = await runRoute(next, tool);
    noteTemplateSearch(next as SearchArguments);
    await renderResult(payload, { ...options, kind: 'route' });
    void tellModel('지도에서 경로 옵션을 바꿔 다시 찾았다', payload);
  } catch (error) {
    reportProblem(displayText(error));
  }
}

/**
 * 옵션 한 칸을 갈아 끼워 **같은 도구를 다시 부른다** (진입 지점의 종류, 거리 행렬의 교통).
 * 렌더러와 자리 이름(`places`)은 앞 결과의 것을 그대로 쓴다.
 */
async function runOptionToolWith(
  tool: OptionTool,
  next: Record<string, unknown>,
  options: RenderOptions,
  what: string,
): Promise<void> {
  setBusy(`${what} 적용 중...`);

  try {
    const payload = await runOptionTool(tool, next);
    noteTemplateSearch(next as SearchArguments);
    await renderResult(payload, options);
    void tellModel(`지도에서 ${what}을(를) 바꿔 다시 찾았다`, payload);
  } catch (error) {
    reportProblem(displayText(error));
  }
}

/**
 * 결과 언어를 고르는 줄.
 *
 * **같은 질의어로 결과가 그대로 온다** — 판교역 스타벅스 9건이 네 언어에서 좌표까지
 * 한 건도 어긋나지 않았고 이름만 번역돼 왔다(2026-10-19 실측). 그래서 쪽수도 그대로 둔다.
 * `ko`가 아니면 서버가 다국어 API로 갈라 부른다 (search.tool.ts).
 */
function languageSelect(): RailSelect {
  const args = getSearchArguments();

  return {
    label: '언어',
    value: args.language ?? 'ko',
    choices: [
      { value: 'ko', label: '한국어' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
      { value: 'zh', label: '中文' },
    ],
    onChange: (language) => {
      void rerunSearch({ ...args, language: language as SearchArguments['language'] }, '언어 변경');
    },
  };
}

/**
 * 쪽수·언어를 갈아 끼워 **같은 검색을 다시 부른다.**
 *
 * 영역 재검색(`runAreaSearch`)과 한 통로를 쓴다 — 다른 것은 무엇을 갈아 끼우느냐뿐이다.
 * 검색 영역은 인자에서 다시 뽑으므로, 영역을 바꾼 뒤 쪽을 넘겨도 그 영역이 그대로 그려진다.
 */
async function rerunSearch(
  next: SearchArguments,
  label: string,
  tool: SearchTool = 'search_places',
): Promise<void> {
  setBusy(`${label} 적용 중...`);

  try {
    const payload = await runSearch(next, tool);
    await renderResult(payload, {
      // 지오코딩은 렌더러가 따로다. 도구에서 렌더러를 고른다.
      kind: tool === 'geocode_address' ? 'geocode' : 'search',
      area: toSearchArea(getSearchArguments()),
      // **칠할지는 앞 결과를 따른다.** 화면을 다시 찾은 뒤라면 그 영역이 곧 화면이라 칠하지
      // 않았는데, 쪽을 넘기자 파란 면이 되살아났다(실기 피드백). 조건만 물려받고 영역은 그대로다.
      drawArea: lastRender?.options.drawArea,
      // 같은 도구가 돌려준 결과다. 이어서 또 넘길 수 있어야 한다.
      searchTool: tool,
    });
    void tellModel(`${label}으로 검색을 다시 했다`, payload);
  } catch (error) {
    reportProblem(displayText(error));
  }
}

/**
 * 요약 줄과 목록을 패널에 꽂는다.
 *
 * **요약은 결과가 말하는 것만 적는다** — `장소 30건 · 전체 460건`. 무엇을 해서 얻은
 * 결과인지를 덧붙이면 좁은 패널에서 두 줄로 접혀 건수가 밀려난다(실기 피드백).
 */
function fillPanel(
  summary: string,
  listHtml: string,
  statList: boolean,
  link?: MarkerLinkOptions,
): void {
  requireElement('summary').textContent = summary;

  const list = requireElement<HTMLUListElement>('result-list');
  list.innerHTML = listHtml;
  list.classList.toggle('stat-list', statList);

  attachDetailToggles(list);

  // 목록은 매번 새로 그려지지만 요소 자체는 그대로다. 위임 리스너는 한 번만 건다.
  if (!sendButtonsAttached) {
    attachSendButtons(list, () => {
      reportProblem(SEND_FAILED_TEXT);
    });
    sendButtonsAttached = true;
  }

  document.body.classList.add('has-result');
  // 목록이 꽂힌 뒤라야 항목을 셀 수 있다. 핀 수와 맞을 때만 이어진다.
  linkMarkersToList(list, link);
  attachPanelToggle();
  attachPickListener();
  applyListState();
}

/**
 * 패널 머리의 손잡이 둘(목록 펼치기·접기, 결과 좁히기)에 리스너를 한 번만 건다.
 *
 * 호스트가 주는 영역은 어느 서버든 같은 크기라(실연동 확인) 목록을 접으면 요약 한 줄만
 * 남겨 지도에 넓이를 돌려준다.
 */
function attachPanelToggle(): void {
  if (panelToggleAttached) return;

  requireElement('panel-toggle').addEventListener('click', () => {
    listOpen = !listOpen;
    applyListState();
  });

  const filterToggle = requireElement('filter-toggle');
  // 아이콘은 한 번만 넣는다. 깔때기 하나로 "결과 좁히기"를 뜻한다 (icons.ts).
  filterToggle.innerHTML = icon('filter');
  filterToggle.setAttribute('aria-label', '결과 좁히기');
  filterToggle.addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    applyFilterState(true);
  });

  panelToggleAttached = true;
}

/**
 * ② 결과 좁히기 칸을 여닫는다.
 *
 * 고를 것이 없으면 손잡이까지 감춘다 — 누를 때마다 빈 칸만 열리면 거짓말이 된다.
 * 펼침 여부(`filtersOpen`)는 결과가 바뀌어도 유지한다. 목록과 같은 규칙이다.
 */
function applyFilterState(hasFilters: boolean): void {
  const toggle = requireElement('filter-toggle');
  toggle.hidden = !hasFilters;

  const open = hasFilters && filtersOpen;
  document.body.classList.toggle('filters-collapsed', !open);
  toggle.classList.toggle('is-active', open);
  toggle.setAttribute('aria-expanded', String(open));

  // 지도가 쓸 수 있는 넓이가 달라졌다. 캔버스가 스스로 줄자를 다시 재지 않는다.
  notifyResize();
}

/** 펼친 패널이 지도 왼쪽을 덮는 너비를 재서 그만큼 비킨다 (fit-area.ts의 `fitPadding`). */
function panelAwarePadding(): FitPadding {
  const mapRect = requireElement('map').getBoundingClientRect();
  if (!listOpen) return fitPadding(mapRect.width, undefined);

  const panelRect = requireElement('panel').getBoundingClientRect();
  return fitPadding(mapRect.width, panelRect.right - mapRect.left);
}

/**
 * 결과 목록을 위아래로 여닫는다.
 *
 * 접으면 요약 한 줄만 남아 지도를 가장 적게 가린다. 좌우 서랍은 같은 패널을 여닫는
 * 손잡이가 둘이 되어 헷갈렸으므로 되살리지 않는다.
 */
function applyListState(): void {
  document.body.classList.toggle('list-collapsed', !listOpen);

  const listToggle = requireElement('panel-toggle');
  listToggle.innerHTML = icon(listOpen ? 'chevron-up' : 'chevron-down');
  listToggle.title = listOpen ? '목록 접기' : '목록 열기';
  listToggle.setAttribute('aria-label', listOpen ? '목록 접기' : '목록 열기');
  listToggle.classList.toggle('is-active', listOpen);
  listToggle.setAttribute('aria-expanded', String(listOpen));

  // 지도가 쓸 수 있는 넓이가 달라졌다. 캔버스가 스스로 줄자를 다시 재지 않는다.
  notifyResize();
}

/** 이전 결과의 오버레이가 남지 않도록 지도 컨테이너를 새로 만든다. */
function createMap(inavi: InaviNamespace): InaviMap {
  const host = requireElement('map-host');
  host.innerHTML = '<div id="map"></div>';

  return new inavi.maps.Map({ center: DEFAULT_CENTER, container: 'map', zoom: DEFAULT_ZOOM });
}

export function setStatus(message: string, kind: 'loading' | 'error' | 'empty'): void {
  const status = ensureStatusElement();
  status.className = `status status--${kind}`;
  // 글자를 한 겹 감싸 둔다 — 실패일 때 그 겹이 카드가 된다 (styles.css의 `.status-text`).
  status.innerHTML = `<span class="status-text">${escapeHtml(message)}</span>`;
  status.hidden = false;
}

function clearStatus(): void {
  const status = ensureStatusElement();
  status.hidden = true;
  status.textContent = '';
}

/** createMap이 map-host를 비우면서 status 요소도 함께 사라지므로 필요할 때 다시 만든다. */
function ensureStatusElement(): HTMLElement {
  const existing = document.getElementById('status');
  if (existing) return existing;

  const status = document.createElement('div');
  status.id = 'status';
  requireElement('map-host').appendChild(status);
  return status;
}
