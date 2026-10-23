import { icon, type IconName } from '../shared/icons';
import {
  canToggleFullscreen,
  currentDisplayMode,
  fullscreenButtonLabel,
  toggleFullscreen,
} from '../host/display-mode';
import { getMapStyleId, MAP_STYLES, setMapStyleId } from '../map/map-style';
import { isDarkTheme, toggleTheme } from '../map/theme';

/**
 * 지도 조작 레일 — 지도 오른쪽, SDK 컨트롤 바로 아래에 이어 붙는 아이콘 묶음.
 *
 * **지도에 속하는 것만** 아이콘으로 세운다 — 보기 설정 셋(①)과 지도에서 하는 일(③)이다.
 * 결과를 좁히는 일(②)은 결과에 속하므로 사이드바에 남는다 (controls.ts).
 *
 * ## 넣을 것을 고를 때
 *
 * 한때 옵션을 고르는 줄(범위·반경·언어)과 액션 넷이 한 칸에 함께 있었다. **창이 지도를
 * 가렸고, 무엇을 누르면 무엇이 되는지를 먼저 배워야 했다**(실기 피드백).
 *
 * 기준은 **사용자가 지도에서 하는 일 셋**이다 — ① 결과를 본다 ② 범위를 다시 잡아 다시
 * 찾는다 ③ 하나를 골라 대화로 잇는다. 여기에 직접 닿지 않으면 넣지 않는다. POC에서 되는
 * 것을 확인한 기능이라도 마찬가지다.
 *
 * `현재 지도에서 재검색`은 레일에 두지 않는다 — 접힌 목록 안에서는 두 번 눌러야 닿았다.
 * 지도 아래 가운데의 알약 버튼이다 (research-button.ts).
 *
 * ## SDK 컨트롤 컨테이너에 끼워 넣는다
 *
 * SDK는 지도 안에 `.inavi-control-container > .inavi-ctrl-top-right`를 만들고 줌·콤파스를
 * 그 안에 넣는다(실물 확인). 우리 레일을 **같은 컨테이너의 형제로** 넣으면 자리·여백·
 * `pointer-events`를 SDK가 대신 잡아 준다:
 *
 * - `.inavi-ctrl-top-right`는 `pointer-events: none`, 그 안의 `.inavi-ctrl`은 `auto`다.
 *   지도 클릭을 쓰는 모드(경로 만들기)가 레일이 차지한 세로 띠에서 막히지 않는다
 * - `.inavi-ctrl-top-right .inavi-ctrl`이 `float: right; clear: both; margin: 10px 10px 0 0`이라
 *   DOM 순서대로 세로로 쌓인다. 줌·콤파스와 같은 간격이 거저 나온다
 * - `.inavi-ctrl-group`이 흰 배경·둥근 모서리·그림자를, `.inavi-ctrl-group button`이 29×29와
 *   버튼 사이 구분선을 준다. **줌 버튼과 치수가 정확히 같아진다**
 *
 * 컨테이너를 찾지 못하면(SDK가 바뀌었거나 테스트) 스스로 떠 있는 자리로 물러난다.
 */

export type MapClickMode = 'none' | 'route';

/**
 * 펼친 목록 맨 위의 **고르는 줄 하나.**
 *
 * 결과 종류마다 **그 도구의 옵션 한둘만** 연다 — 통합 검색은 언어(같은 질의어로 결과가
 * 글자 그대로 같고 이름만 번역돼 온다, 2026-10-19 실측), 자동차 경로는 탐색 기준과 차종 등
 * (route-options.ts · entry-options.ts · matrix-options.ts).
 *
 * **고르면 바로 다시 부른다.** `적용` 버튼은 두지 않는다 — 줄이 두엇이라 모아 봐야 한 번
 * 아끼는 정도이고, 버튼이 늘면 창이 그만큼 커진다.
 */
export interface RailSelect {
  label: string;
  value: string;
  choices: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export interface MapRailOptions {
  /** 지도 유형·테마가 바뀌어 처음부터 다시 그려야 할 때. */
  onStyleChange: () => void;
  /** 넘기지 않으면 그 액션을 만들지 않는다. */
  onRoutePick?: () => void;
  /** 켜져 있는 지도 클릭 모드. 해당 액션을 눌린 상태로 보인다. */
  activeMode?: MapClickMode;
  /** 넘기지 않으면 고르는 줄을 만들지 않는다. 바꿀 것이 없는 결과가 있다. */
  selects?: RailSelect[];
}

interface RailAction {
  key: string;
  label: string;
  name: IconName;
  mode?: Exclude<MapClickMode, 'none'>;
  onClick: () => void;
}

/**
 * 지도 유형별 아이콘. 칠해진 칸이 유형마다 다르다 (icons.ts).
 * 아는 유형이 아니면 기본값으로 돌아간다 — 유형이 늘어도 레일이 깨지지 않는다.
 */
const STYLE_ICONS: Record<string, IconName> = {
  normal: 'map-normal',
  satellite: 'map-satellite',
  hybrid: 'map-hybrid',
  dem: 'map-terrain',
};

function styleIcon(id: string): IconName {
  return STYLE_ICONS[id] ?? 'map-normal';
}

type PopoverName = 'style' | 'panel';

/**
 * 열려 있는 목록. **새 결과를 그릴 때마다 닫힌다**(`mountMapRail`).
 *
 * 모드를 켜고 끄는 동안에는 유지된다 — 그때는 레일을 다시 만들지 않고 눌린 표시만
 * 갱신하기 때문이다(`markActiveMode`).
 */
let openPopover: PopoverName | undefined;

/** 레일을 스스로 다시 그릴 수 있도록 마지막 자리와 인자를 들고 있는다. */
let mounted: { host: HTMLElement; options: MapRailOptions } | undefined;
let dismissAttached = false;

/**
 * 레일을 지도 위에 얹는다. 결과가 바뀔 때마다 새 지도를 붙잡은 것으로 갈아 끼운다.
 *
 * @param host 지도 컨테이너(`#map-host`). 안에서 SDK 컨트롤 컨테이너를 찾는다.
 */
export function mountMapRail(host: HTMLElement, options: MapRailOptions): void {
  mounted = { host, options };
  // 새 결과다. 앞 화면에서 열어 둔 목록은 접고 시작한다.
  openPopover = undefined;
  renderRail();
}

/**
 * 레일만 다시 그린다. 호스트 컨텍스트가 바뀌었을 때 쓴다 — 표시 모드가 바뀌면
 * 전체화면 아이콘도 함께 뒤집혀야 한다.
 */
export function refreshMapRail(): void {
  renderRail();
}

function renderRail(): void {
  if (!mounted) return;
  const { host, options } = mounted;

  // 지도를 다시 만들지 않는 경로(테마 전환·목록 여닫기)로도 들어온다. 남은 것을 먼저 치운다.
  host.querySelectorAll('.map-rail').forEach((old) => {
    old.remove();
  });

  const rail = document.createElement('div');
  rail.className = 'map-rail';

  rail.append(buildViewGroup(options));
  const panel = buildPanelGroup(options);
  if (panel) rail.append(panel);

  // SDK 컨트롤의 형제로 넣는다. 없으면 스스로 떠 있는다.
  const slot = host.querySelector('.inavi-ctrl-top-right');
  if (slot) {
    // `inavi-ctrl`은 컨테이너 안에서만 붙인다. 이 클래스에는 `pointer-events: auto`가 걸려
    // 있어서, 떠 있는 자리에까지 달면 레일이 차지한 세로 띠가 지도 클릭을 통째로 먹는다.
    rail.classList.add('inavi-ctrl');
    slot.append(rail);
  } else {
    rail.classList.add('map-rail--floating');
    host.append(rail);
  }

  attachDismiss();
  markActiveMode(options.activeMode ?? 'none');
}

/** ① 보기 설정 — 지도 유형·테마·전체화면. 결과 종류와 무관하게 **항상** 있다. */
function buildViewGroup(options: MapRailOptions): HTMLElement {
  const group = buildGroup();

  group.append(
    buildRailButton({
      rail: 'style',
      // 지금 고른 유형의 아이콘을 그대로 쓴다. 목록을 열지 않아도 무엇으로 보는지 보인다.
      name: styleIcon(getMapStyleId()),
      title: '지도 유형',
      expanded: openPopover === 'style',
      onClick: () => {
        togglePopover('style');
      },
    }),
    buildRailButton({
      rail: 'theme',
      // 지금 상태가 아니라 **누르면 될 것**을 보여준다. 밝으면 달, 어두우면 해.
      name: isDarkTheme() ? 'sun' : 'moon',
      title: isDarkTheme() ? '밝게' : '어둡게',
      pressed: isDarkTheme(),
      onClick: () => {
        // 테마가 바뀌면 지도 스타일도 따라 바뀌므로 다시 그려야 한다. 구독자(render-host)가
        // 그 일을 맡지만, 아직 그린 것이 없을 수도 있으니 아이콘만은 여기서 바로 고친다.
        toggleTheme();
        renderRail();
      },
    }),
  );

  // 호스트가 열어 줄 때만 만든다. 규격상 Optional이라 없는 호스트가 있다 (display-mode.ts).
  if (canToggleFullscreen()) {
    group.append(
      buildRailButton({
        rail: 'fullscreen',
        name: currentDisplayMode() === 'fullscreen' ? 'compress' : 'expand',
        title: fullscreenButtonLabel(),
        onClick: () => {
          void toggleFullscreen().then(renderRail);
        },
      }),
    );
  }

  if (openPopover === 'style') group.append(buildStylePopover(options));
  return group;
}

/**
 * ③ 지도 옵션 — 버튼 하나로 접어 두고, 누르면 조건 줄과 액션 목록으로 펼친다.
 *
 * 아이콘을 여러 개 세워 두면 무엇인지 알 수 없다. 접힌 상태에서는 **자리를 한 칸만** 쓰고,
 * 펼치면 글자로 알려 주는 쪽을 골랐다. 켜진 모드가 있으면 접혀 있어도 이 버튼이 눌린
 * 모양으로 남아 모드가 돌고 있다는 것이 보인다 (`markActiveMode`).
 */
function buildPanelGroup(options: MapRailOptions): HTMLElement | undefined {
  const actions = listActions(options);
  const selects = options.selects ?? [];
  if (actions.length === 0 && selects.length === 0) return undefined;

  const group = buildGroup();
  group.append(
    buildRailButton({
      rail: 'panel',
      name: 'more',
      title: '지도에서 하기',
      expanded: openPopover === 'panel',
      onClick: () => {
        togglePopover('panel');
      },
    }),
  );

  if (openPopover === 'panel') group.append(buildPanelPopover(actions, options));
  return group;
}

function buildPanelPopover(actions: RailAction[], options: MapRailOptions): HTMLElement {
  const popover = buildPopover('지도에서 하기');

  const selects = options.selects ?? [];
  if (selects.length > 0) {
    // 줄과 액션 사이에 구분선을 두지 않는다. 항목이 서넛뿐인 칸이다.
    selects.forEach((select, index) => {
      popover.append(buildSelectRow(select, index));
    });
  }

  for (const action of actions) {
    const item = buildPopoverItem(action.name, action.label);
    item.dataset.action = action.key;

    if (action.mode) {
      item.dataset.mode = action.mode;
      item.setAttribute('aria-pressed', String(options.activeMode === action.mode));
      item.classList.toggle('is-active', options.activeMode === action.mode);
    }
    item.addEventListener('click', action.onClick);
    popover.append(item);
  }
  return popover;
}

/** 고르는 줄 하나. 고르면 바로 부르는 쪽(render-host)에게 넘긴다. */
function buildSelectRow(select: RailSelect, index: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'option-row';

  // 줄이 여럿일 수 있다. 꼬리표와 칸을 잇는 id가 겹치지 않게 번호를 붙인다.
  const id = `rail-select-${index}`;
  const label = document.createElement('label');
  label.className = 'option-label';
  label.textContent = select.label;
  label.htmlFor = id;
  row.append(label);

  const field = document.createElement('select');
  field.className = 'option-select';
  field.id = id;
  for (const choice of select.choices) {
    const item = document.createElement('option');
    item.value = choice.value;
    item.textContent = choice.label;
    item.selected = choice.value === select.value;
    field.append(item);
  }
  field.addEventListener('change', () => {
    openPopover = undefined;
    renderRail();
    select.onChange(field.value);
  });
  row.append(field);

  return row;
}

/** 펼쳐 보일 액션. 지금은 `경로 만들기` 하나다 — 부르는 쪽이 넘겼을 때만 만든다. */
function listActions(options: MapRailOptions): RailAction[] {
  const actions: RailAction[] = [];

  if (options.onRoutePick) {
    actions.push({
      key: 'route',
      label: '경로 만들기',
      name: 'route',
      mode: 'route',
      onClick: options.onRoutePick,
    });
  }
  return actions;
}

function buildStylePopover(options: MapRailOptions): HTMLElement {
  const popover = buildPopover('지도 유형');
  const selected = getMapStyleId();

  for (const style of MAP_STYLES) {
    const item = buildPopoverItem(styleIcon(style.id), style.label);
    item.dataset.style = style.id;
    item.setAttribute('aria-pressed', String(style.id === selected));
    item.classList.toggle('is-active', style.id === selected);
    item.addEventListener('click', () => {
      if (!setMapStyleId(style.id)) return;
      // 고르면 닫는다. 지도를 새로 만들어 스타일을 먼저 입힌 뒤 다시 그린다.
      openPopover = undefined;
      options.onStyleChange();
    });
    popover.append(item);
  }
  return popover;
}

/** 켜져 있는 모드만 눌린 모양으로 만든다. */
export function markActiveMode(mode: MapClickMode): void {
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach((item) => {
    const active = item.dataset.mode === mode;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });

  // 목록이 접혀 있어도 모드가 돌고 있다는 것은 보여야 한다.
  const toggle = document.querySelector<HTMLElement>('[data-rail="panel"]');
  toggle?.classList.toggle('is-active', mode !== 'none');
}

function togglePopover(name: PopoverName): void {
  openPopover = openPopover === name ? undefined : name;
  renderRail();
}

/**
 * 레일 밖을 누르거나 ESC를 치면 펼친 목록을 접는다.
 *
 * 레일은 결과마다 다시 만들어지므로 요소가 아니라 **문서에 한 번만** 건다.
 */
function attachDismiss(): void {
  if (dismissAttached) return;

  document.addEventListener('click', (event) => {
    if (!openPopover) return;
    const target = event.target;
    // **`Element`로 받아야 한다.** 버튼 안의 아이콘을 누르면 `target`이 `SVGElement`라
    // `HTMLElement`로 좁히면 레일 바깥 클릭으로 오판한다 — 버튼이 연 목록을 같은 클릭이
    // 곧바로 닫아, 여백을 누르면 열리고 아이콘을 누르면 안 열리는 것처럼 보였다.
    // 레일 안에서 난 클릭은 그대로 둔다. 다시 그려 떨어져 나간 요소도 부모 사슬은 남는다.
    if (target instanceof Element && target.closest('.map-rail')) return;

    openPopover = undefined;
    renderRail();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !openPopover) return;
    openPopover = undefined;
    renderRail();
  });

  dismissAttached = true;
}

function buildGroup(): HTMLElement {
  const group = document.createElement('div');
  // `inavi-ctrl-group`은 SDK 스타일(흰 배경·모서리·29px 버튼)을 그대로 받으려는 것이다.
  group.className = 'map-rail-group inavi-ctrl-group';
  return group;
}

function buildRailButton(spec: {
  rail: string;
  name: IconName;
  title: string;
  pressed?: boolean;
  expanded?: boolean;
  onClick: () => void;
}): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-rail-button';
  button.dataset.rail = spec.rail;
  button.title = spec.title;
  button.setAttribute('aria-label', spec.title);
  button.innerHTML = icon(spec.name);

  if (spec.pressed !== undefined) button.setAttribute('aria-pressed', String(spec.pressed));
  if (spec.expanded !== undefined) {
    button.setAttribute('aria-expanded', String(spec.expanded));
    button.classList.toggle('is-open', spec.expanded);
  }
  button.addEventListener('click', spec.onClick);
  return button;
}

function buildPopover(label: string): HTMLElement {
  const popover = document.createElement('div');
  popover.className = 'rail-popover';
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', label);
  return popover;
}

function buildPopoverItem(name: IconName, label: string): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'rail-item';
  item.innerHTML = `${icon(name)}<span>${label}</span>`;
  return item;
}
