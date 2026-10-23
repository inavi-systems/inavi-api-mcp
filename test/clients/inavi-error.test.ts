import { describe, expect, it } from 'vitest';
import { adviseError } from '@/clients/inavi-error';
import { INaviApiError } from '@/clients/inavi-http.client';

describe('adviseError', () => {
  it('쿼터 소진을 따로 가른다', () => {
    // TSP·RDM은 일 10건뿐이다. 재시도해도 소용없고 사용자에게 알려야 한다.
    const { kind, hint } = adviseError(302);

    expect(kind).toBe('quota');
    expect(hint).toContain('Retrying will not help');
  });

  it('인증 실패는 재시도가 무의미하다고 알린다', () => {
    expect(adviseError(300).kind).toBe('tell-user');
    expect(adviseError(300).hint).toContain('Retrying will not help');
  });

  it('서버 오류는 재시도 가능으로 분류한다', () => {
    expect(adviseError(102).kind).toBe('retryable');
    expect(adviseError(500).kind).toBe('retryable');
  });

  it('좌표가 도로에 안 맞으면 보정 도구를 지목한다', () => {
    for (const code of [533, 534, 670, 671]) {
      expect(adviseError(code).kind).toBe('bad-argument');
      expect(adviseError(code).hint).toContain('find_entry_points');
    }
  });

  it('결과 없음은 검색어를 넓히라고 안내한다', () => {
    expect(adviseError(100).kind).toBe('bad-argument');
    expect(adviseError(100).hint).toContain('Broaden');
  });

  it('표에 없는 코드는 대역으로 판단한다', () => {
    expect(adviseError(559).kind).toBe('bad-argument');
    expect(adviseError(693).kind).toBe('bad-argument');
    expect(adviseError(407).kind).toBe('bad-argument');
    expect(adviseError(7).kind).toBe('tell-user');
  });

  it('힌트가 "이제 무엇을 하라"를 담는다', () => {
    // 원문만 올리면 모델이 할 수 있는 게 없다. 행동을 지시하는 동사가 들어 있어야 한다.
    const ACTION =
      /\b(retry|retrying|broaden|check|supply|call|tell|correct|move|reduce|split|pass|drop|change|rephrase|use)\b/i;

    for (const code of [100, 101, 102, 300, 302, 400, 533, 690]) {
      expect(adviseError(code).hint).toMatch(ACTION);
    }
  });
  it('힌트에 한글을 쓰지 않는다', () => {
    // 모델이 읽는 문자열이다. 영문 학습 자료가 훨씬 많아 지시 준수가 더 정확하다.
    for (const code of [100, 101, 102, 201, 300, 302, 400, 533, 537, 670, 691, 999]) {
      expect(adviseError(code).hint).not.toMatch(/[가-힣]/);
    }
  });
});

describe('INaviApiError', () => {
  it('원문을 유지하고 힌트를 덧붙인다', () => {
    const error = new INaviApiError(302, 'Limit Exceeded');

    expect(error.message).toContain('302 - Limit Exceeded');
    expect(error.message).toContain(error.hint);
    expect(error.kind).toBe('quota');
  });
});
