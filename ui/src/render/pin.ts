import { registerMarkerPin } from '../panel/marker-link';
import { PIN_COLORS, rgba } from '../map/map-colors';

// 색은 한 곳에 모아 둔다 (map-colors.ts). 이 파일은 **모양**만 책임진다.
export { PIN_COLORS };

/**
 * 지도에 찍는 마커.
 *
 * **모양은 하나로 통일하고 색만 바꾼다.** 결과 종류마다 점·번호 핀·SDK 기본 마커로
 * 갈렸을 때 같은 지도 위에서 문법이 섞여 보인다는 피드백을 받았다.
 *
 * 생김새는 iNavi 자신의 지도(API 콘솔)를 따랐다 — 색을 채운 물방울에 흰 원을 얹고, 그 안에
 * 짧은 글자를 넣는다. 흰 테두리가 밝은 지도에서, 흰 속 원이 야간 지도에서 윤곽을 남긴다.
 * (기반 예제: marker-numbering)
 */

/**
 * **그림의 좌표계.** `PIN_DROP_PATH`가 이 칸 안에 그려져 있다 — 바꾸면 그림이 잘린다.
 *
 * 한 번 여기를 줄여 봤다가 핀이 작아지는 대신 **왼쪽 위만 남고 잘렸다**(실기 피드백).
 * `viewBox`는 그림이 사는 칸이고, 화면에 몇 px로 그릴지는 아래 `PIN_WIDTH`가 정한다.
 */
const ART_WIDTH = 32;
const ART_HEIGHT = 44;

/**
 * 화면에 그릴 크기. 32×44로 그렸더니 결과가 수십 건일 때 지도가 핀으로 덮였다(실기 피드백).
 * **목록 배지도 이 크기를 따른다** (styles.css의 `.result-index`).
 */
const PIN_WIDTH = 26;
const PIN_HEIGHT = 36;

/**
 * 마커 하나. `label`이 비면 흰 원만 남는다 — 하나뿐인 지점(리버스 지오코딩)에 쓴다.
 *
 * 글자는 이미지가 아니라 DOM으로 얹는다. data URI 안의 글자는 글꼴을 못 찾아 깨진다.
 */
export function createPinElement(label: string, color: string): HTMLElement {
  const pin = document.createElement('div');
  pin.className = 'map-pin';
  // 목록의 몇 번째 항목인지는 **만든 순서**로 맞춘다 (marker-link.ts).
  registerMarkerPin(pin);

  const image = document.createElement('img');
  image.src = pinSvgDataUri(color);
  pin.append(image);

  if (label) {
    const text = document.createElement('span');
    text.textContent = label;
    // 글자는 흰 원 안에 앉으므로 핀과 같은 색이어야 읽힌다.
    text.style.color = color;
    if (label.length > 1) text.classList.add('small-text');
    pin.append(text);
  }
  return pin;
}

/**
 * 클러스터 풍선 아이콘.
 *
 * **반드시 `data:image/png;base64`여야 한다.** `ClusterStyle.icons[].url`은 SDK가
 * `setAttribute('style', 'background-image:url(...)')`로 인라인 스타일에 끼워 넣는데,
 * 퍼센트 인코딩한 SVG data URI를 주면 그림이 뜨지 않고 **개수 숫자만 남는다**(실기 확인).
 * SDK 자신의 기본 아이콘도 base64 PNG 스프라이트다 — 같은 형식으로 맞춘다.
 *
 * 생김새는 iNavi 지도의 클러스터를 따랐다 — **색을 채운 속 원 + 바깥으로 흐려지는 후광**.
 * 흰 테를 두르고 크기만 달리했더니 "뭉쳐 있다"는 느낌이 나지 않았다(실기 피드백).
 *
 * 캔버스를 쓸 수 없으면(테스트 환경 등) `undefined`를 돌려주고, 부르는 쪽이 SDK 기본
 * 풍선으로 물러난다. 그림을 못 만들었다고 마커까지 잃을 이유는 없다.
 */
export function clusterIconDataUri(size: number, color: string): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext?.('2d');
    if (!context) return undefined;

    const half = size / 2;
    const core = half * CORE_RATIO;

    // 후광 — 속에서 바깥으로 가며 **투명해진다.** 테를 두르는 대신 이렇게 흐려 놓아야
    // 지도 위에 뭉쳐 있는 덩어리처럼 보인다 (iNavi 지도의 클러스터와 같은 문법).
    const halo = context.createRadialGradient(half, half, core * 0.9, half, half, half);
    halo.addColorStop(0, rgba(color, 0.55));
    halo.addColorStop(0.45, rgba(color, 0.22));
    halo.addColorStop(1, rgba(color, 0));
    context.fillStyle = halo;
    context.fillRect(0, 0, size, size);

    // 속 — 숫자가 올라앉는 자리. 흰 테는 두르지 않는다. 후광과 경계가 생겨 따로 논다.
    context.beginPath();
    context.arc(half, half, core, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();

    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

/** 아이콘 전체 크기 대비 **속 원**의 지름 비율. 나머지는 흐려지는 후광이 쓴다. */
const CORE_RATIO = 0.5;

/**
 * 물방울 윤곽. **핀 모양의 단일 출처다.**
 *
 * 목록의 순번 배지도 `pinSvgDataUri`가 만든 같은 그림을 깐다 (render/result.ts).
 * 비율은 `ART_WIDTH`:`ART_HEIGHT` = 32:44 — 배지 크기도 이 비율을 지켜야 한다.
 * 안 그러면 같은 모양인데 뚱뚱해 보인다(실기 피드백).
 */
const PIN_DROP_PATH =
  'M16 1.5C8.5 1.5 2.5 7.5 2.5 15c0 9.6 13.5 27.5 13.5 27.5S29.5 24.6 29.5 15' +
  'C29.5 7.5 23.5 1.5 16 1.5z';

/**
 * SVG 한 겹. **속성은 큰따옴표로 적는다.**
 *
 * `encodeURIComponent`는 작은따옴표를 **인코딩하지 않는다.** 작은따옴표로 적으면 data URI에
 * 생따옴표가 남아, CSS의 따옴표 없는 `url(...)` 안에서 값이 통째로 무시된다
 * (실기에서 배지 그림이 아예 사라졌다). 큰따옴표는 `%22`로 인코딩돼 안전하다.
 */
function pinSvg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" ` +
    `viewBox="0 0 ${ART_WIDTH} ${ART_HEIGHT}">${body}</svg>`
  );
}

/**
 * 핀 그림. 색마다 **한 번만** 만들어 둔다 — 목록이 줄마다 같은 문자열을 쓰므로,
 * 결과 100건이면 같은 것을 100번 만들게 된다.
 */
const pinArtCache = new Map<string, string>();

export function pinSvgDataUri(color: string): string {
  const cached = pinArtCache.get(color);
  if (cached) return cached;

  const svg = pinSvg(
    `<path d="${PIN_DROP_PATH}" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>` +
      `<circle cx="16" cy="15" r="7" fill="#FFFFFF"/>`,
  );
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  pinArtCache.set(color, uri);
  return uri;
}

/**
 * 진입 방향 화살표. **차량 진입 지점은 핀 대신 이 그림을 쓴다.**
 *
 * 번호 핀 위에 화살표를 얹었더니 **둘이 한자리에 같이 있는 것이 어색했다**(실기 피드백).
 * 진입 지점이 말하는 것은 "여기, 이 방향"뿐이라 순번 핀이 할 일이 없다.
 *
 * 모양만 바꾸고 **문법은 핀과 같이 간다** — 색을 채우고 흰 테를 두른다. 그래야 같은 지도
 * 위에서 두 가지 그림이 따로 놀지 않는다.
 *
 * 위(정북)를 보는 그림이다. 회전은 부르는 쪽이 건다 (render/entry-points.ts).
 */
const ARROW_SIZE = 34;

/** 끝이 뾰족하고 아래가 파인 길잡이 화살표. 꼬리가 파여 있어야 방향이 한눈에 읽힌다. */
const ARROW_PATH = 'M17 2.5 29.5 29.5 17 23 4.5 29.5Z';

const arrowArtCache = new Map<string, string>();

export function arrowSvgDataUri(color: string): string {
  const cached = arrowArtCache.get(color);
  if (cached) return cached;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ARROW_SIZE}" height="${ARROW_SIZE}" ` +
    `viewBox="0 0 ${ARROW_SIZE} ${ARROW_SIZE}">` +
    `<path d="${ARROW_PATH}" fill="${color}" stroke="#FFFFFF" stroke-width="2.5" ` +
    `stroke-linejoin="round"/></svg>`;

  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  arrowArtCache.set(color, uri);
  return uri;
}
