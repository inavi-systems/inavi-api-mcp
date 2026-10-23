// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLICKED_POINT,
  DisplayError,
  displayText,
  readResultCode,
  SEARCH_AREA,
  toolErrorText,
  userErrorText,
} from '../../ui/src/host/error-text';
import { renderInto } from '../../ui/src/render-host';

/**
 * 템플릿이 띄우는 문구에 **모델용 행동 힌트가 섞이지 않는지** 본다 (261016 상용화 리뷰).
 *
 * 서버는 실패에 영문 힌트를 덧붙여 올린다 — 모델이 읽고 다음 수를 고르라는 것이다.
 * 그 문자열을 사용자 화면에 그대로 띄웠던 것이 이 테스트가 막는 회귀다.
 */

/** 서버가 올리는 실제 모양. `src/clients/inavi-error.ts`의 힌트가 둘째 줄에 붙는다. */
const SERVER_MESSAGE =
  'INAVI Maps API 호출 실패: 100 - Result Not Found\n' +
  'Nothing matched. Broaden the search or try different wording, then call again.';

function errorResult(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

describe('readResultCode', () => {
  it('서버 에러 메시지에서 결과 코드를 집는다', () => {
    expect(readResultCode(SERVER_MESSAGE)).toBe(100);
  });

  it('코드가 없으면 undefined', () => {
    expect(readResultCode('응답 본문을 읽지 못했습니다.')).toBeUndefined();
  });
});

describe('toolErrorText', () => {
  it('모델용 영문 힌트를 사용자 문구에 싣지 않는다', () => {
    const text = toolErrorText(errorResult(SERVER_MESSAGE), SEARCH_AREA);

    expect(text).not.toMatch(/Broaden the search/);
    expect(text).not.toMatch(/[A-Za-z]{4,}/);
  });

  it('결과 없음(100)은 고장이 아니라 답이라고 적는다', () => {
    // "오류"라고 적으면 사용자는 무엇이 깨진 줄 안다.
    expect(toolErrorText(errorResult(SERVER_MESSAGE), SEARCH_AREA)).toBe(
      '검색 결과가 존재하지 않습니다.',
    );
  });

  it('결과 없음은 **어디서 물었는지**에 따라 다르게 적는다', () => {
    // 지도를 한 번 클릭한 사람에게 "영역을 다시 설정하라"고 말할 수는 없다.
    expect(toolErrorText(errorResult(SERVER_MESSAGE), CLICKED_POINT)).toBe(
      '주소가 존재하지 않습니다. 다른 지점을 클릭해주세요.',
    );
  });

  it('코드를 읽지 못해도 원문을 베껴 쓰지 않는다', () => {
    const text = toolErrorText(errorResult('Unexpected token < in JSON at position 0'));

    expect(text).not.toMatch(/Unexpected token/);
  });
});

describe('userErrorText', () => {
  it('인증 실패는 서버 설정 문제임을 알린다', () => {
    expect(userErrorText(300)).toMatch(/서버 설정/);
  });

  it('한도 소진은 다시 시도하라고 하지 않는다', () => {
    const text = userErrorText(302);

    expect(text).toMatch(/한도|모두 썼습니다/);
    expect(text).not.toMatch(/범위를 넓/);
  });

  it('표에 없는 코드는 대역으로 떨구고 코드를 남긴다', () => {
    expect(userErrorText(672)).toContain('672');
    expect(userErrorText(672)).toMatch(/경로/);
  });

  it('자리 이름을 주지 않아도 문장이 된다', () => {
    expect(userErrorText(206)).toMatch(/^요청한 곳에서는/);
  });

  it('자리 이름을 준 코드에는 그 자리를 적는다', () => {
    expect(userErrorText(206, SEARCH_AREA)).toMatch(/^이 영역에서는/);
  });
});

describe('displayText', () => {
  it('기술 원인은 화면에 내보내지 않는다', () => {
    // 지도가 안 뜨는 까닭(CSP·CDN·blob Worker)은 연동 쪽 사정이라 사용자가 할 일이 없다.
    const error = new DisplayError(
      '지도를 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.',
      'INAVI Maps SDK가 15초 안에 준비되지 않았습니다. 호스트가 iframe에 적용하는 CSP를 ' +
        '확인하세요. worker-src blob:',
    );

    expect(displayText(error)).toBe('지도를 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.');
    // 원인은 버려지지 않는다 — 개발자 도구에서 보라고 `message`에 남는다.
    expect(error.message).toMatch(/worker-src/);
  });

  it('서버 실패 원문이 섞여 와도 코드로 문구를 고른다', () => {
    const error = new Error('INAVI Maps API 호출 실패: 300 - Authentication Failed\nApp key ...');

    expect(displayText(error)).toMatch(/서버 설정/);
    expect(displayText(error)).not.toMatch(/App key/);
  });

  it('우리가 던진 사용자 문구는 그대로 쓴다', () => {
    expect(displayText(new Error('응답 본문을 읽지 못했습니다.'))).toBe(
      '응답 본문을 읽지 못했습니다.',
    );
  });
});

/**
 * 띠에 **무엇이 어떤 결로** 뜨는지. 글자와 색만으로 읽혀야 하는 자리라(지도 위다)
 * 되지 않는 일은 `data-tone="warn"`으로 간다 — 색은 CSS 토큰이 가른다(`--hint-*`).
 */
describe('지도 위 안내 띠', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.className = '';
    document.body.innerHTML = `
      <div class="layout">
        <div id="map-host"><div id="map"></div></div>
        <div class="panel" id="panel"><div id="summary"></div><ul id="result-list"></ul></div>
        <p id="collapsed-note" hidden></p>
      </div>`;
  });

  it('실패는 사용자 문구를 주의 결로 띄운다', async () => {
    await renderInto(
      { header: { isSuccessful: false, resultCode: 100, resultMessage: 'Result Not Found' } },
      { kind: 'search' },
    );

    const hint = document.getElementById('map-hint');
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe('검색 결과가 존재하지 않습니다.');
    expect(hint?.dataset.tone).toBe('warn');
  });

  it('지도가 아직 없으면 띠가 아니라 화면으로 알린다', async () => {
    // `.status`는 inset: 0이라 **지도 대신** 보여주는 자리다 (render-host.ts의 reportProblem).
    document.getElementById('map')?.remove();

    await renderInto(
      { header: { isSuccessful: false, resultCode: 300, resultMessage: 'auth failed' } },
      { kind: 'search' },
    );

    expect(document.getElementById('map-hint')).toBeNull();
    expect(document.querySelector('.status--error')?.textContent).toMatch(/서버 설정/);
  });
});
