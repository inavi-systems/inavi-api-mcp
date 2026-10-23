import { icon } from '../shared/icons';
import type { InaviBounds, InaviMap } from '../map/inavi';

/**
 * `현재 지도에서 재검색` — 지도 아래 가운데에 떠 있는 알약 버튼.
 *
 * 레일의 접힌 목록 안에 두었더니 **두 번 눌러야 닿았고, 지도를 옮긴 사람이 그 다음에 할
 * 일이 거기 있는 줄 몰랐다**(실기 피드백). 지도를 옮기는 일과 다시 찾는 일은 한 동작처럼
 * 이어져야 한다 — 네이버 지도도 같은 자리에 같은 모양으로 둔다.
 *
 * **처음 보던 영역에서 달라졌을 때 뜬다.** 늘 떠 있으면 방금 받은 결과를 그대로 두고도 다시
 * 찾으라고 권하는 꼴이다.
 *
 * 기준은 **처음 화면의 네 귀(좌상·우하)와 견주어 한 변이라도 제 폭의 10% 넘게 밀렸는가**다.
 * "화면 가운데가 처음 영역 밖으로 나갔을 때"로 두었더니 **반 화면을 끌어야 떴다**(실기
 * 피드백). 그만큼 움직였으면 화면 가장자리에는 이미 찾지 않은 데가 들어와 있다.
 * 되돌아오면 다시 숨는다.
 */

/** 이만큼까지는 같은 화면으로 본다. 손이 떨려 1~2px 밀린 것으로 띄우지 않는다. */
const EDGE_TOLERANCE = 0.1;

/**
 * 뜬 직후의 `moveend`는 **기준을 다시 잡는 데** 쓴다.
 *
 * 결과를 그릴 때 `fitCoordinates`가 300ms 동안 화면을 옮긴다(render-host.ts의 `FIT_DURATION`).
 * 그 움직임까지 "사용자가 옮겼다"로 세면 결과가 뜨자마자 버튼이 따라 뜬다.
 */
const SETTLE_MS = 700;

export interface ResearchButtonOptions {
  /** 눌렀을 때. 누른 시점의 화면 영역으로 다시 찾는다. */
  onClick: () => void;
}

export interface ResearchButton {
  /** 지도를 다시 그리기 전에 부른다. 핸들러를 떼고 버튼을 걷는다. */
  destroy(): void;
}

const MOVED_CLASS = 'is-visible';

/**
 * 버튼을 지도 위에 얹고 지도 움직임을 지켜본다.
 *
 * @param host 지도 컨테이너(`#map-host`). `position: relative`라 버튼을 그 안에 띄운다.
 */
export function mountResearchButton(
  host: HTMLElement,
  map: InaviMap,
  options: ResearchButtonOptions,
): ResearchButton {
  host.querySelectorAll('.research-button').forEach((old) => {
    old.remove();
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'research-button';
  button.innerHTML = `${icon('refresh')}<span>현재 지도에서 재검색</span>`;
  button.addEventListener('click', () => {
    hide();
    options.onClick();
  });
  host.append(button);

  const hide = (): void => {
    button.classList.remove(MOVED_CLASS);
  };

  const mountedAt = Date.now();
  let base = map.getBounds();

  // **`moveend`만 본다.** 움직이는 동안(`move`)에도 부르면 끌고 다니는 내내 버튼이 깜빡인다.
  const settle = (): void => {
    // 그리면서 화면을 맞추는 동안의 움직임은 기준을 다시 잡는 데 쓴다.
    if (Date.now() - mountedAt < SETTLE_MS) {
      base = map.getBounds();
      return;
    }
    button.classList.toggle(MOVED_CLASS, leftArea(base, map));
  };

  map.on('moveend', settle);

  return {
    destroy(): void {
      map.off('moveend', settle);
      button.remove();
    },
  };
}

/** 처음 화면과 달라졌는가. 네 변을 각각 제 폭에 견준다. */
function leftArea(base: InaviBounds, map: InaviMap): boolean {
  const now = map.getBounds();
  const width = Math.abs(base.east - base.west) || Number.EPSILON;
  const height = Math.abs(base.north - base.south) || Number.EPSILON;

  return (
    Math.abs(now.west - base.west) / width > EDGE_TOLERANCE ||
    Math.abs(now.east - base.east) / width > EDGE_TOLERANCE ||
    Math.abs(now.south - base.south) / height > EDGE_TOLERANCE ||
    Math.abs(now.north - base.north) / height > EDGE_TOLERANCE
  );
}
