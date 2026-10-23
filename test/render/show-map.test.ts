// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { shouldShowMap } from '../../ui/src/shared/payload';
import { collapseView, renderInto } from '../../ui/src/render-host';

describe('shouldShowMap', () => {
  it('서버가 실어 준 값이 false면 접는다', () => {
    expect(shouldShowMap({ showMap: false })).toBe(false);
  });

  it('true면 그린다', () => {
    expect(shouldShowMap({ showMap: true })).toBe(true);
  });

  it('호스트가 _meta를 걸러내면 기존 동작(표시)을 유지한다', () => {
    expect(shouldShowMap(undefined)).toBe(true);
    expect(shouldShowMap({})).toBe(true);
  });
});

describe('collapseView', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    document.body.className = '';
    document.body.innerHTML = `
      <div class="layout">
        <div id="map-host"><div id="map"></div></div>
        <div class="panel" id="panel"><div id="summary"></div><ul id="result-list"></ul></div>
        <p id="collapsed-note" hidden>지도 표시 없이 조회한 결과입니다.</p>
      </div>`;
  });

  it('지도를 감추고 안내 한 줄만 남긴다', () => {
    collapseView();

    // 높이를 줄이는 것은 CSS가 하고, 여기서는 그 신호(class)만 확인한다.
    expect(document.documentElement.classList.contains('collapsed')).toBe(true);
    expect(document.body.classList.contains('collapsed')).toBe(true);
    expect(document.getElementById('collapsed-note')?.hidden).toBe(false);
  });

  it('표시가 켜진 결과가 오면 접힘이 풀린다', async () => {
    collapseView();

    // payload가 없으면 SDK를 부르지 않고 "결과 없음"으로 끝난다. 접힘 해제만 확인한다.
    await renderInto(undefined, undefined);

    expect(document.body.classList.contains('collapsed')).toBe(false);
    expect(document.getElementById('collapsed-note')?.hidden).toBe(true);
  });
});
