import { app } from './app-instance';
import type { AddressAdm, EntryPoint, SearchPoi, ToolPayload } from '../shared/payload';
import { describeType } from '../render/entry-points';

/**
 * 템플릿이 스스로 한 조회를 **모델에게만** 알린다.
 *
 * 재검색·쪽 넘기기·옵션 변경·분류 필터는 모델을 거치지 않으므로 **모델은 사용자가 지도에서
 * 무엇을 했는지 모른다.** 판교를 보다가 강남으로 옮겨 다시 찾아 놓고 "여기서 제일 가까운
 * 데는?"이라고 물으면 모델은 판교 결과로 답한다.
 *
 * `대화로` 버튼은 한 건씩, 그것도 대화에 남는다. 규격의 `모델 컨텍스트 갱신`은 **대화에
 * 남기지 않고** 모델에게만 알린다.
 *
 * **Optional이라 보장이 없다.** 안 받는 호스트에서도 지도는 그대로 돌아야 하므로 실패를
 * 삼킨다. 다만 조용히 삼키면 "왜 모델이 모르지?"를 알 길이 없어, 실패했다는 것만 돌려준다.
 */

/** 모델에게 보낼 목록 길이. 컨텍스트에 실리는 것이라 짧게 유지한다. */
const MAX_ITEMS = 5;

/**
 * @returns 모델에게 닿았으면 `true`. 호스트가 안 받으면 `false`.
 *
 * **`resolve`를 성공으로 믿지 않는다.** 호스트가 조용히 삼켜도 `resolve`가 떨어져, 예외만
 * 보면 성공으로 세고 사용자는 아무 안내도 못 받는다(실측 — 재검색 뒤 모델이 "지도 동작은
 * 전달되지 않는다"고 답했고 실패 띠도 뜨지 않았다). 호스트는 접속할 때 이 기능을 받는지
 * 능력으로 알려 주므로(`getHostCapabilities().updateModelContext`), **부르기 전에 그것부터 본다.**
 *
 * 그 값은 불리언이 아니라 **모달리티 목록**이다 — `{ text?, image?, audio?, resource?,
 * structuredContent? }`. 객체가 있다는 것만 보면 `{}`(받긴 하는데 지원하는 모달리티는 없음)을
 * 통과시킨다. 우리가 보내는 것은 글 블록이므로 **`text`를 본다.**
 */
export async function reportToModel(text: string): Promise<boolean> {
  if (!app.getHostCapabilities()?.updateModelContext?.text) return false;

  try {
    await app.updateModelContext({ content: [{ type: 'text', text }] });
    return true;
  } catch {
    return false;
  }
}

/**
 * 템플릿이 가져온 검색 결과를 모델이 읽을 문장으로 만든다.
 *
 * 원본 JSON을 그대로 싣지 않는다. 모델에게 필요한 것은 **무엇을 했고 무엇이 나왔는지**이고,
 * 전체를 실으면 서버가 좌표·중복을 덜어 줄여 둔 것을 여기서 도로 늘리는 셈이 된다.
 */
export function buildSearchReport(action: string, payload: ToolPayload | undefined): string {
  const poi = payload?.data?.poi ?? [];
  const items =
    poi.length > 0
      ? poi.map(describePoi)
      : [
          ...addressCandidates(payload).map(describeAdm),
          ...(payload?.data?.entrypoints ?? []).map(describeEntry),
        ];
  const total = payload?.data?.totalcount ?? items.length;

  const lines = items.slice(0, MAX_ITEMS).map((text, index) => `${index + 1}. ${text}`);

  const head = `사용자가 대화를 거치지 않고 지도에서 직접 ${action}. 결과 ${total}건.`;
  if (lines.length === 0) return `${head} 표시할 장소가 없다.`;

  const tail =
    total > lines.length ? `\n(상위 ${lines.length}건만. 나머지는 지도에 표시돼 있다.)` : '';
  return `${head}\n${lines.join('\n')}${tail}`;
}

function describePoi(item: SearchPoi): string {
  return [item.name1, item.catename, item.roadname ?? item.address].filter(Boolean).join(' · ');
}

/**
 * 지오코딩은 장소가 아니라 **주소 후보**를 돌려준다(`adm[]`). 쪽을 넘긴 뒤 `poi`만 읽으면
 * 모델이 "표시할 장소가 없다"를 받는다.
 */
function addressCandidates(payload: ToolPayload | undefined): AddressAdm[] {
  const adm = payload?.data?.adm;
  return Array.isArray(adm) ? adm : [];
}

function describeAdm(adm: AddressAdm): string {
  const road = adm.roadname ? [adm.roadname, adm.roadjibun].filter(Boolean).join(' ') : undefined;
  const lot = [adm.address, adm.jibun].filter(Boolean).join(' ') || undefined;
  return [adm.buildname, road, lot].filter(Boolean).join(' · ');
}

/** 진입 지점에는 이름이 없다. 종류와 좌표가 전부라 그 둘을 적는다. */
function describeEntry(entry: EntryPoint): string {
  const position = entry.x !== undefined && entry.y !== undefined ? `${entry.x}, ${entry.y}` : '';
  return [describeType(entry.type), position].filter(Boolean).join(' · ');
}
