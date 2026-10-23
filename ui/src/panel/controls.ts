import { ALL_CATEGORIES } from './poi-filter';
import type { SearchCounts, SearchView } from '../render/search';

/**
 * ② 결과 좁히기 — 사이드바 요약 줄 아래에 붙는 한 칸.
 *
 * **서버도 모델도 부르지 않는다.** 이미 받아 둔 결과에서 볼 것만 골라 다시 그릴 뿐이다.
 * 그래서 지도 쪽 레일(map-rail.ts)이 아니라 결과 패널에 둔다 — 결과에 속하는 일이다.
 *
 * 둘 다 **고를 것이 있을 때만** 생긴다. 없으면 아무것도 만들지 않고 `false`를 돌려주어
 * 부르는 쪽이 여닫는 손잡이까지 감출 수 있게 한다.
 */
export interface ResultFilterOptions {
  /** 장소·주소 전환. 둘 다 왔을 때만 만든다 — 한쪽뿐이면 고를 것이 없다. */
  resultViews?: {
    selected: SearchView;
    counts: SearchCounts;
    onChange: (view: SearchView) => void;
  };
  /** 분류 필터. 분류가 한 종류뿐이면 고를 것이 없으므로 만들지 않는다. */
  categories?: {
    options: string[];
    selected: string;
    onChange: (category: string) => void;
  };
}

/** @returns 만든 것이 하나라도 있으면 참. */
export function mountResultFilters(host: HTMLElement, options: ResultFilterOptions): boolean {
  host.innerHTML = '';

  const { resultViews, categories } = options;
  const hasViews = Boolean(
    resultViews && resultViews.counts.place > 0 && resultViews.counts.address > 0,
  );
  const hasCategories = Boolean(categories && categories.options.length > 1);

  if (resultViews && hasViews) {
    host.append(buildViewSwitch(resultViews));
  }
  if (categories && hasCategories) {
    host.append(
      buildSelect(
        '분류',
        [
          { id: ALL_CATEGORIES, label: '전체' },
          ...categories.options.map((name) => ({ id: name, label: name })),
        ],
        categories.selected,
        categories.onChange,
      ),
    );
  }

  return hasViews || hasCategories;
}

/**
 * `장소`·`주소` 전환.
 *
 * 건수와 `보기` 라벨을 뺐다 — 건수는 요약 줄이 이미 말해 주고, 탭이 **있다는 것 자체가**
 * 저쪽에도 결과가 있다는 신호다(둘 다 있을 때만 만든다).
 */
function buildViewSwitch(views: NonNullable<ResultFilterOptions['resultViews']>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'view-switch';
  group.setAttribute('role', 'group');

  for (const [view, label] of [
    ['place', '장소'],
    ['address', '주소'],
  ] as [SearchView, string][]) {
    const active = views.selected === view;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = active ? 'view-switch-button is-active' : 'view-switch-button';
    button.setAttribute('aria-pressed', String(active));
    button.textContent = label;
    button.addEventListener('click', () => {
      if (!active) views.onChange(view);
    });
    group.append(button);
  }

  return group;
}

function buildSelect(
  label: string,
  options: { id: string; label: string }[],
  selected: string,
  onChange: (id: string) => void,
): HTMLElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'map-control';

  const text = document.createElement('span');
  text.className = 'map-control-label';
  text.textContent = label;

  const select = document.createElement('select');
  options.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.label;
    element.selected = option.id === selected;
    select.appendChild(element);
  });
  select.addEventListener('change', () => {
    onChange(select.value);
  });

  wrapper.append(text, select);
  return wrapper;
}
