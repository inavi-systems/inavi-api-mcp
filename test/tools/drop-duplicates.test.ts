import { describe, expect, it } from 'vitest';
import { toDataEnvelope, type DataEnvelope } from '@/tools/common/envelope';
import { dropMatrixText } from '@/tools/common/drop-duplicates';
import matrixFixture from '../fixtures/route-distance-matrix.response.json';

/**
 * 중복 필드 생략 (설계 1.3).
 *
 * 좌표 배열과 달리 `_meta`로 보내지 않는다. 되살리는 데 서버가 보관한 값이 필요 없기 때문이다.
 */
interface Measure {
  value?: number;
  text?: string;
}

interface Cell {
  distance: Measure;
  duration: Measure;
}

function cells(body: DataEnvelope): Cell[] {
  const rows = body.data.rows as { elements: Cell[] }[];
  return rows.flatMap((row) => row.elements);
}

describe('RDM — 거리·시간의 text를 떼어 낸다', () => {
  const envelope = toDataEnvelope(matrixFixture, 'wrap');
  const dropped = dropMatrixText(envelope);

  it('모든 칸에서 text가 사라진다', () => {
    const leftovers = cells(dropped).filter(
      (cell) => 'text' in cell.distance || 'text' in cell.duration,
    );
    expect(leftovers).toEqual([]);
  });

  it('value는 그대로 남는다', () => {
    expect(cells(dropped).map((c) => [c.distance.value, c.duration.value])).toEqual(
      cells(envelope).map((c) => [c.distance.value, c.duration.value]),
    );
  });

  it('원본 봉투는 건드리지 않는다', () => {
    expect(cells(envelope).every((c) => typeof c.distance.text === 'string')).toBe(true);
  });

  it('떼어 낸 text는 value에서 그대로 되살아난다', () => {
    for (const cell of cells(envelope)) {
      const metres = cell.distance.value ?? 0;
      const seconds = cell.duration.value ?? 0;
      expect(cell.distance.text).toBe(`${(Math.round(metres / 100) / 10).toFixed(1)} km`);
      expect(cell.duration.text).toBe(`${Math.floor(seconds / 60)} mins`);
    }
  });

  it('text가 없는 응답은 원본을 그대로 돌려준다', () => {
    expect(dropMatrixText(dropped)).toBe(dropped);
  });

  it('모르는 모양이면 아무것도 하지 않는다', () => {
    const odd = { header: envelope.header, data: { rows: 'not an array' } } as DataEnvelope;
    expect(dropMatrixText(odd)).toBe(odd);
  });
});
