import table from '@/tools/lookup/data/category-codes.json';

/**
 * iNavi 분류(카테고리) 코드 표. 번들에 포함해 **API를 부르지 않고** 찾는다.
 *
 * 표가 1,045행이라 리소스로 통째 내려주면 컨텍스트가 폭발한다. 검색형 도구가 유일한 답이다.
 * 코드는 6자리 계층이다 — 앞 2자리가 대분류, 4자리가 중분류, 6자리가 소분류.
 * `path`에 상위 이름을 함께 담은 것은 "별관"·"기타" 같은 하위 이름이 홀로는 뜻이 없어서다.
 */
export interface CategoryCode {
  code: string;
  name: string;
  /** 상위 분류를 이은 경로. 예: "쇼핑/편의 > 편의점 > CU" */
  path: string;
}

const CATEGORIES = table as CategoryCode[];

export const CATEGORY_COUNT = CATEGORIES.length;

/**
 * 이름이나 코드로 분류를 찾는다.
 *
 * 정확히 일치 → 앞에서 시작 → 어디든 포함 순으로 앞세운다. 같은 등급 안에서는 **코드가 짧은
 * 계층(대분류)을 먼저** 둔다. "카페"를 찾을 때 `100600 카페`가 `100604 스타벅스DT`보다 위에 와야
 * 쓸모가 있다.
 */
export function findCategoryCodes(query: string, limit: number): CategoryCode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  // 코드를 그대로 넣었으면 그 항목만 돌려준다.
  if (/^\d{2,6}$/.test(needle)) {
    const byCode = CATEGORIES.filter((entry) => entry.code.startsWith(needle));
    if (byCode.length > 0) return byCode.slice(0, limit);
  }

  const scored: { entry: CategoryCode; rank: number }[] = [];
  for (const entry of CATEGORIES) {
    const name = entry.name.toLowerCase();
    const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2 : -1;
    if (rank >= 0) {
      scored.push({ entry, rank });
      continue;
    }
    // 이름이 안 맞으면 상위 분류 경로에서도 찾아 본다 ("편의점"으로 GS25가 걸리도록).
    if (entry.path.toLowerCase().includes(needle)) scored.push({ entry, rank: 3 });
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.entry.code.replace(/0+$/, '').length - b.entry.code.replace(/0+$/, '').length ||
      a.entry.code.localeCompare(b.entry.code),
  );

  return scored.slice(0, limit).map(({ entry }) => entry);
}
