import { escapeHtml } from '../shared/dom';

/**
 * 정보창(InfoWindow) 안에 그리는 카드. **지도 위 정보창은 모두 이걸 쓴다.**
 *
 * 결과마다 마크업을 따로 들면 한쪽을 고칠 때 다른 쪽이 옛 모양으로 남는다(실기 피드백).
 *
 * 머리에 제목과 분류 칩, 몸에 꼬리표를 단 주소 줄, 그 아래 전화번호와 짧은 메타.
 */
export interface InfoCard {
  title: string;
  /** 제목 아래 칩. 분류·종류를 한마디로. */
  chip?: string;
  /** 꼬리표가 붙는 줄. 값이 빈 줄은 **만들지 않는다.** */
  rows?: [label: string, value: string | undefined][];
  /** 전화번호처럼 꼬리표 없이 적는 한 줄. */
  tel?: string;
  /** 거리·좌표처럼 작게 덧붙이는 줄. */
  meta?: string[];
}

export function infoCardHtml(card: InfoCard): string {
  const rows = (card.rows ?? [])
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(
      ([label, value]) =>
        `<div class="iw-row"><span class="iw-label">${escapeHtml(label)}</span>` +
        `<span class="iw-value">${escapeHtml(value)}</span></div>`,
    )
    .join('');

  const meta = (card.meta ?? [])
    .filter(Boolean)
    .map((line) => `<div class="iw-meta">${escapeHtml(line)}</div>`)
    .join('');

  const tel = card.tel ? `<div class="iw-tel">${escapeHtml(card.tel)}</div>` : '';
  const body = rows + tel + meta;

  return `
    <div class="iw">
      <div class="iw-head">
        <strong class="iw-title">${escapeHtml(card.title)}</strong>
        ${card.chip ? `<span class="iw-chip">${escapeHtml(card.chip)}</span>` : ''}
      </div>
      ${body ? `<div class="iw-body">${body}</div>` : ''}
    </div>
  `;
}
