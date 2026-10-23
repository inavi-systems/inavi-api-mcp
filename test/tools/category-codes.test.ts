import { describe, expect, it } from 'vitest';
import { CATEGORY_COUNT, findCategoryCodes } from '@/tools/lookup/category-codes';

const codes = (query: string, limit = 10): string[] =>
  findCategoryCodes(query, limit).map((entry) => entry.code);

describe('findCategoryCodes', () => {
  it('표가 비어 있지 않다', () => {
    expect(CATEGORY_COUNT).toBeGreaterThan(1000);
  });

  it('정확히 일치하는 이름을 맨 앞에 둔다', () => {
    expect(codes('카페')[0]).toBe('100600');
    expect(codes('편의점')[0]).toBe('110700');
    expect(codes('주차장')[0]).toBe('161700');
  });

  it('같은 등급에서는 상위 계층을 먼저 둔다', () => {
    // 100600 카페가 100604 스타벅스DT보다 앞에 와야 쓸모가 있다.
    const result = codes('카페', 20);
    expect(result.indexOf('100600')).toBeLessThan(result.indexOf('100604'));
  });

  it('부분 일치로도 찾는다', () => {
    expect(codes('충전소')).toContain('152100');
    expect(codes('치과')).toContain('121016');
  });

  it('상위 분류 이름으로 하위 브랜드까지 찾는다', () => {
    // "편의점"에 GS25·CU가 함께 걸려야 분류 전체를 다룰 수 있다.
    const result = codes('편의점', 30);
    expect(result).toContain('110701');
    expect(result).toContain('110704');
  });

  it('코드를 넣으면 그 코드로 시작하는 것만 돌려준다', () => {
    expect(codes('110700')).toEqual(['110700']);
    expect(codes('1107', 30).every((code) => code.startsWith('1107'))).toBe(true);
  });

  it('상위 분류 경로를 함께 담는다', () => {
    const [cu] = findCategoryCodes('110704', 1);
    expect(cu?.path).toBe('쇼핑/편의 > 편의점 > CU');
  });

  it('limit을 넘지 않는다', () => {
    expect(findCategoryCodes('학교', 3)).toHaveLength(3);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(codes('cu')).toContain('110704');
    expect(codes('CU')).toContain('110704');
  });

  it('찾는 것이 없거나 빈 검색어면 빈 배열을 돌려준다', () => {
    expect(findCategoryCodes('존재하지않는분류이름', 10)).toEqual([]);
    expect(findCategoryCodes('   ', 10)).toEqual([]);
  });
});
