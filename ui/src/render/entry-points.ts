import type { InaviMap, InaviNamespace } from '../map/inavi';
import type { EntryPoint, ToolPayload } from '../shared/payload';
import { PIN_COLORS } from '../map/map-colors';
import { arrowSvgDataUri } from './pin';
import { drawFeatures, featureList, featurePositions, type MapFeature } from './result';
import type { RenderResult } from './result';

/** 진출입 지점 렌더링. 좌표는 숫자로 온다. (기반 예제: marker-numbering) */

/** `type`의 뜻. 출력 스키마(`optimalPositionDataSchema`)와 같다. */
const ENTRY_TYPE_NAMES: Record<number, string> = {
  1: '차량 진입로',
  2: '택시 정차(건물)',
  3: '택시 정차(단지)',
};

export function renderEntryPoints(
  inavi: InaviNamespace,
  map: InaviMap,
  payload: ToolPayload,
): RenderResult {
  const features = (payload.data?.entrypoints ?? [])
    .map(toFeature)
    .filter((feature): feature is MapFeature => feature !== undefined);

  drawFeatures(inavi, map, features);

  return {
    coordinates: featurePositions(features),
    listHtml: featureList(features),
    summary:
      features.length === 0 ? '진출입 지점을 찾지 못했습니다.' : `진출입 지점 ${features.length}곳`,
  };
}

function toFeature(entry: EntryPoint): MapFeature | undefined {
  const { x, y } = entry;
  if (x === undefined || y === undefined) return undefined;

  return {
    position: [x, y],
    role: 'entry',
    title: describeType(entry.type),
    note: entry.angle === undefined ? undefined : `진입 각도 ${entry.angle}°`,
    showCoordinate: true,
    // 각도를 알 때만 화살표다. 모르면 번호 핀 그대로 둔다 (`withArrow` 주석).
    art: entry.angle === undefined ? 'pin' : 'arrow',
    decorate: (pin) => withArrow(pin, entry.angle),
  };
}

/**
 * 번호 핀을 **화살표로 바꿔 끼운다** (까닭은 pin.ts의 `ARROW_SIZE` 주석).
 *
 * **핀 요소를 버리지 않고 속만 갈아 끼운다.** 목록 줄과 마커를 잇는 등록이 이미 그 요소에
 * 걸려 있어(`marker-link.ts`의 `registerMarkerPin`), 새 요소를 만들어 돌려주면 목록에서
 * 줄을 눌러도 엉뚱한 노드가 반응한다. 정보창도 돌려준 요소에 붙으므로(`drawFeatures`),
 * 이렇게 두면 **화살표에 호버했을 때** 정보창이 뜬다.
 *
 * `angle`은 정북 0도 기준 시계 방향이라 위를 보는 그림을 그만큼 돌리면 맞는다.
 * 각도가 없으면 화살표를 쓰지 않는다 — 0도(정북)와 구분이 안 되므로 번호 핀 그대로 둔다.
 */
function withArrow(pin: HTMLElement, angle: number | undefined): HTMLElement {
  if (angle === undefined) return pin;

  const image = document.createElement('img');
  image.className = 'entry-arrow';
  image.src = arrowSvgDataUri(PIN_COLORS.entry);
  image.style.transform = `rotate(${angle}deg)`;

  // 물방울과 순번 글자를 걷고 화살표만 남긴다.
  pin.replaceChildren(image);
  pin.classList.add('entry-marker');
  return pin;
}

/** 진입 지점 종류의 이름. 모델에게 보내는 요약도 같은 말을 쓴다 (model-context.ts). */
export function describeType(type: number | undefined): string {
  if (type === undefined) return '진출입 지점';
  return ENTRY_TYPE_NAMES[type] ?? `종류 ${type}`;
}
