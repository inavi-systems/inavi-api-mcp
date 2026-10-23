/** 뷰 전역에서 쓰는 작은 DOM 헬퍼. */

export function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`필수 DOM 요소를 찾을 수 없습니다: #${id}`);
  }
  return element as T;
}

/** HTML 문자열에 값을 끼워 넣기 전에 반드시 통과시킨다. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDistance(meters: number | undefined): string {
  if (meters === undefined) return '-';
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return '-';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

/**
 * 구간 하나짜리 소요 시간.
 *
 * 경로 구간은 몇 초짜리가 흔해서 분으로 반올림하면 `0분`이 된다.
 * 전체 소요에는 formatDuration이 맞지만 구간에는 이쪽을 쓴다.
 */
export function formatShortDuration(seconds: number | undefined): string {
  if (seconds === undefined) return '-';
  if (seconds < 60) return `${Math.round(seconds)}초`;
  return formatDuration(seconds);
}

export function formatCurrency(won: number | undefined): string {
  if (won === undefined) return '-';
  return `${won.toLocaleString('ko-KR')}원`;
}
