import { icon } from '../shared/icons';
import type { SearchTool, ToolPayload } from '../shared/payload';
import type { SearchView } from '../render/search';

/**
 * 결과 목록의 쪽 넘기기.
 *
 * iNavi는 한 번에 `reqcount`개만 주고 `startposition`(0부터)으로 다음 쪽을 연다.
 * 모델에게 "더 보여 줘"라고 말하는 것은 같은 질문을 다시 하는 일이지 쪽을 넘기는 일이 아니다.
 * 전체 건수를 고르는 규칙은 `pageTotal`에 있다.
 */

export interface PagerSpec {
  /** 지금 쪽의 첫 번째 결과 번호(0부터). */
  start: number;
  /** 한 쪽의 크기. */
  count: number;
  /** 전체 건수. */
  total: number;
  /** 넘길 쪽의 시작 번호로 다시 부른다. */
  onMove: (start: number) => void;
}

/**
 * 쪽을 셀 **전체 건수.** 도구마다 읽는 칸이 다르다.
 *
 * - 통합 검색 — 보고 있는 종류의 것(`poitotalcount`·`admtotalcount`). 합친 `totalcount`로
 *   세면 장소만 보는 화면에서 넘길 쪽이 실제보다 많아진다.
 * - **지오코딩 — `totalcount`.** 이름은 같은데 `admtotalcount`가 전체가 아니라 **이번에 받은
 *   건수**다(`남양` 10건 요청 → `admtotalcount: 10`, `totalcount: 17`; 다음 쪽은 7·17, 2026-10-20
 *   실측). 그걸 믿었더니 한 쪽에 다 들어온 것으로 읽혀 쪽 넘김 줄이 뜨지 않았다(실기 피드백).
 */
export function pageTotal(
  data: ToolPayload['data'],
  view: SearchView,
  tool: SearchTool,
): number | undefined {
  if (tool === 'geocode_address') return data?.totalcount;
  return (view === 'place' ? data?.poitotalcount : data?.admtotalcount) ?? data?.totalcount;
}

/**
 * 목록 아래 쪽 넘김 줄을 그린다. 넘길 것이 없으면 자리를 비운다.
 *
 * **한 쪽에 다 들어오면 만들지 않는다** — `← 1–12 / 12건 →`은 알려 주는 것 없이 자리만
 * 차지한다. 검색 결과는 열 건 안쪽인 경우가 흔하다.
 */
export function renderPager(host: HTMLElement, spec?: PagerSpec): void {
  host.innerHTML = '';
  host.hidden = true;
  if (!spec || spec.total <= spec.count) return;

  const { start, count, total } = spec;
  const last = Math.min(start + count, total);
  const hasPrevious = start > 0;
  // **총건수를 믿고 끝을 판단한다.** 마지막 쪽에서 다음을 누르면 빈 결과가 오고, 그때는
  // "결과 없음"이 떠 보던 목록이 그대로 남는다 — 넘어간 것도 아니고 안 넘어간 것도 아니다.
  const hasNext = last < total;

  host.append(
    buildButton('chevron-left', '이전 결과', !hasPrevious, () => {
      spec.onMove(Math.max(0, start - count));
    }),
  );

  const range = document.createElement('span');
  range.className = 'pager-range';
  range.textContent = `${start + 1}–${last} / ${total}건`;
  host.append(range);

  host.append(
    buildButton('chevron-right', '다음 결과', !hasNext, () => {
      spec.onMove(start + count);
    }),
  );

  host.hidden = false;
}

function buildButton(
  name: 'chevron-left' | 'chevron-right',
  label: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pager-button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon(name);
  button.disabled = disabled;
  if (!disabled) button.addEventListener('click', onClick);
  return button;
}
