/**
 * 목록 줄의 `상세` 펴고 접기.
 *
 * 목록 한 줄은 **이름과 주소만 펴 두고** 나머지(분류·전화·거리·좌표)는 접는다
 * (`render/result.ts`의 `featureItem`). 한 줄이 다섯 행이라 한 화면에 두 줄 반밖에 들어가지
 * 않았다(실기 피드백). 목록은 **어느 것을 고를지 훑는 자리**이고, 접은 값들은 고른 뒤에
 * 보는 값이다.
 *
 * 목록은 매번 통째로 다시 꽂히므로 **항목이 아니라 목록에** 위임해 건다 (`대화로`와 같은
 * 방식). 건 적이 있는지는 **요소 자신에** 표시한다 — 모듈 변수로 두면 목록 요소가 바뀌었을
 * 때 옛 요소에만 걸린 채로 남는다.
 */
export function attachDetailToggles(list: HTMLElement): void {
  if (list.dataset.detailAttached) return;

  list.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>('[data-detail], [data-stat-detail]');
    if (!button) return;

    // 지표 나열은 접히는 줄이 **형제**다 (`.stat-item.is-detail`). 목록 한 줄은 제 안에
    // 접은 자리를 갖는다 (`.result-detail`). 손잡이 하나로 둘 다 받는다.
    const stats =
      button.dataset.statDetail === undefined
        ? []
        : [...list.querySelectorAll<HTMLElement>('.stat-item.is-detail')];
    const inline = button.parentElement?.querySelector<HTMLElement>('.result-detail');
    const targets = stats.length > 0 ? stats : inline ? [inline] : [];
    if (targets.length === 0) return;

    const detail = targets[0] as HTMLElement;

    // 줄을 누르면 지도가 그 핀으로 날아가고, 경로 만들기에서는 출발·도착으로 고른다.
    // 펴고 접는 것은 그 일들과 다르다 (marker-link.ts·render-host.ts도 이 버튼을 비켜 간다).
    event.stopPropagation();

    const open = detail.hidden;
    targets.forEach((node) => {
      node.hidden = !open;
    });
    button.textContent = open ? '접기' : '상세';
    button.classList.toggle('is-open', open);
  });

  list.dataset.detailAttached = 'true';
}
