import { app } from './app-instance';

/**
 * 지도에서 고른 것을 대화로 넘긴다.
 *
 * `ui/message`는 사용자가 직접 입력한 것처럼 대화에 들어간다. 지도에서 장소를 하나 고르고
 * "여기까지 경로 알려줘"로 이어 갈 때, 좌표를 다시 불러 주지 않아도 되게 하는 통로다.
 */
export async function sendToConversation(text: string): Promise<void> {
  await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
}

/**
 * 결과 목록의 "대화로" 버튼을 한 번에 배선한다.
 *
 * 목록은 매번 innerHTML로 새로 그려지므로 항목마다 리스너를 다는 대신 목록에 하나만 걸고
 * 위임한다. 버튼은 `data-send`에 보낼 문장을 담고 있다 (render/result.ts).
 */
export function attachSendButtons(list: HTMLElement, onError: (message: string) => void): void {
  list.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest<HTMLElement>('[data-send]');
    const text = button?.dataset.send;
    if (!button || !text) return;

    button.setAttribute('disabled', 'true');
    sendToConversation(text)
      .then(() => {
        button.textContent = '보냄';
      })
      .catch((error: unknown) => {
        button.removeAttribute('disabled');
        onError(error instanceof Error ? error.message : String(error));
      });
  });
}
