// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import boundaryFixture from '../fixtures/admin-to-polygon.response.json';
import entryFixture from '../fixtures/optimal-position-search.response.json';
import { renderBoundary } from '../../ui/src/render/boundary';
import { renderEntryPoints } from '../../ui/src/render/entry-points';
import { enveloped } from './envelope';
import { createFakeInavi } from './fake-inavi';

const boundaryPayload = enveloped(boundaryFixture, 'rename');
const entryPayload = enveloped(entryFixture, 'asIs');

describe('renderBoundary (실제 공간 검색 응답 기준)', () => {
  it('폴리곤마다 따로 그린다 — 섬이 있으면 하나로 이을 수 없다', () => {
    const { inavi, map, shapes } = createFakeInavi();

    renderBoundary(inavi, map, {
      data: {
        polygondata: [
          {
            admincode: '41135109',
            polygonlist: [
              { polygon: [{ x: 127.1, y: 37.4 }] },
              { polygon: [{ x: 127.2, y: 37.5 }] },
            ],
          },
        ],
      },
    });

    expect(shapes).toHaveLength(2);
    expect(shapes.every((shape) => shape.kind === 'polygon')).toBe(true);
  });

  it('되꽂힌 좌표 392개를 그대로 폴리곤 경로로 넘긴다', () => {
    const { inavi, map, shapes } = createFakeInavi();
    const ring = boundaryPayload.data?.polygondata?.[0]?.polygonlist?.[0]?.polygon ?? [];

    const result = renderBoundary(inavi, map, boundaryPayload);

    expect(ring).toHaveLength(392);
    expect(shapes[0]?.path).toHaveLength(ring.length);
    expect(shapes[0]?.path?.[0]).toEqual([ring[0]?.x, ring[0]?.y]);
    expect(result.coordinates).toHaveLength(ring.length);
  });

  it('행정구역 코드와 폴리곤·좌표 개수를 목록에 적는다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderBoundary(inavi, map, boundaryPayload);

    expect(result.summary).toBe('행정구역 1곳 · 폴리곤 1개');
    expect(result.listHtml).toContain('41135109');
    expect(result.listHtml).toContain('좌표 392개');
  });

  it('고를 좌표는 꼭짓점 평균이 아니라 외곽 사각형의 가운데다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderBoundary(inavi, map, {
      data: {
        polygondata: [
          {
            polygonlist: [
              {
                polygon: [
                  { x: 127.0, y: 37.0 },
                  { x: 127.0, y: 37.1 },
                  { x: 127.0, y: 37.2 },
                  { x: 128.0, y: 37.0 },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.listHtml).toContain('data-pick-lng="127.5"');
  });

  it('좌표가 비어 오면 그리지 않고 알린다 — 파라미터 이름은 화면에 내지 않는다', () => {
    const { inavi, map, shapes } = createFakeInavi();

    const result = renderBoundary(inavi, map, {
      data: { polygondata: [{ admincode: '41135109', polygonlist: [{ count: 392 }] }] },
    });

    expect(shapes).toHaveLength(0);
    expect(result.coordinates).toHaveLength(0);
    expect(result.summary).toBe('경계를 그릴 좌표가 없습니다.');
    expect(result.summary).not.toContain('includeCoords');
  });
});

describe('renderEntryPoints (실제 최적 지점 검색 응답 기준)', () => {
  it('좌표를 숫자 그대로 쓴다 — 문자열인 것은 검색·지오코딩뿐이다', () => {
    const { inavi, map, markers } = createFakeInavi();
    const entries = entryPayload.data?.entrypoints ?? [];

    const result = renderEntryPoints(inavi, map, entryPayload);

    expect(entries).toHaveLength(2);
    expect(markers).toHaveLength(2);
    expect(result.coordinates[0]).toEqual([entries[0]?.x, entries[0]?.y]);
    expect(markers.every((marker) => marker.attachedToMap)).toBe(true);
  });

  it('진입 각도를 화살표 회전으로 옮긴다 (정북 0도 기준 시계 방향)', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderEntryPoints(inavi, map, entryPayload);

    const icon = markers[0]?.icon;
    expect(icon).toBeInstanceOf(HTMLElement);

    const arrow = (icon as HTMLElement).querySelector<HTMLImageElement>('.entry-arrow');
    expect(arrow?.style.transform).toBe('rotate(180deg)');

    // 번호 핀을 **바꿔 끼운다.** 물방울이 남아 있으면 화살표와 겹쳐 보인다 (실기 피드백).
    expect((icon as HTMLElement).querySelectorAll('img')).toHaveLength(1);
    expect((icon as HTMLElement).textContent).toBe('');
    // 그림은 핀과 같은 자리에서 온다 — 색을 채우고 흰 테를 두른다.
    expect(arrow?.src).toContain('stroke%3D%22%23FFFFFF%22');
  });

  it('각도가 없으면 화살표를 만들지 않는다 — 0도(정북)와 구분이 안 된다', () => {
    const { inavi, map, markers } = createFakeInavi();

    renderEntryPoints(inavi, map, { data: { entrypoints: [{ x: 127.1, y: 37.4, type: 1 }] } });

    const icon = markers[0]?.icon as HTMLElement;
    expect(icon.querySelector('.entry-arrow')).toBeNull();
  });

  it('type을 뜻이 있는 이름으로 적는다', () => {
    const { inavi, map } = createFakeInavi();

    const result = renderEntryPoints(inavi, map, entryPayload);

    expect(result.listHtml).toContain('차량 진입로');
    expect(result.listHtml).toContain('택시 정차(건물)');
    expect(result.listHtml).toContain('진입 각도 180°');
    expect(result.summary).toBe('진출입 지점 2곳');
  });

  it('좌표가 없는 항목은 건너뛴다', () => {
    const { inavi, map, markers } = createFakeInavi();

    const result = renderEntryPoints(inavi, map, {
      data: { entrypoints: [{ type: 1 }, { x: 127.1, y: 37.4, type: 1 }] },
    });

    expect(markers).toHaveLength(1);
    expect(result.coordinates).toEqual([[127.1, 37.4]]);
  });
});
