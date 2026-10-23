import type { LngLatLike } from '../map/inavi';
import { toNumber } from '../shared/payload';

/**
 * 도구 호출 인자를 기억해 둔다.
 *
 * 응답(iNavi 원본)에는 "어떤 조건으로 찾았는지"가 없다. 검색 반경이나 영역을 지도에 그리려면
 * 요청 쪽을 알아야 한다. 호스트가 도구 결과보다 먼저 `ui/notifications/tool-input`으로
 * 인자를 보내 주므로 그것을 받아 둔다. (main.ts의 `app.ontoolinput`)
 */
export interface SearchArguments {
  query?: string;
  /**
   * 검색 영역의 종류. **도구 입력의 이름이다**(`bbox` · `radius`).
   *
   * API 파라미터 `spopt`(0·1·2)와 헷갈리지 말 것 — 호스트가 템플릿에 주는 것은 모델이
   * 부른 **도구 인자**라 여기에는 `spopt`가 오지 않는다. 서버가 API를 부를 때 옮겨 적는다.
   */
  area?: 'bbox' | 'radius';
  language?: 'ko' | 'en' | 'ja' | 'zh';
  catecode?: string;
  sort?: 'recommended' | 'name' | 'distance';
  radius?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  reqcount?: number;
  /** 몇 번째 결과부터 받을지(0부터). 패널 페이징이 이 값만 옮겨 다시 부른다. */
  startposition?: number;
  admcode?: string;
  /** 지오코딩의 거리 기준점과 번지 넓히기. 쪽을 넘길 때 그대로 물려받는다. */
  posX?: number;
  posY?: number;
  addrext?: '0' | '1' | '2';
  /** 경로 탐색의 경유지. 응답은 자동차 경로의 경유지를 표시하지 않아 요청 쪽을 본다. */
  vias?: { x?: number; y?: number }[];
}

/** 경유지 핀은 응답으로 알 수 없어 요청에서 끌어온다 — `toSearchArea`와 같은 통로다. */
export function getRequestedVias(): LngLatLike[] {
  const vias = getSearchArguments().vias;
  if (!Array.isArray(vias)) return [];

  return vias.reduce<LngLatLike[]>((out, via) => {
    const x = toNumber(via?.x);
    const y = toNumber(via?.y);
    if (x !== undefined && y !== undefined) out.push([x, y]);
    return out;
  }, []);
}

/** 지도에 그릴 검색 영역. */
export type SearchArea =
  | { kind: 'circle'; center: LngLatLike; radiusKm: number }
  | { kind: 'polygon'; path: LngLatLike[] };

/**
 * **지금 보고 있는 결과를 만든 인자.**
 *
 * 모델이 부른 인자가 호스트를 거쳐 들어오고(`setLastToolArguments`), 템플릿이 스스로 다시
 * 부르면 그 인자로 갈아 끼운다(`noteTemplateSearch`). 한 벌로 두는 까닭은 **재호출이 서로
 * 이어져야** 하기 때문이다 — 영역을 바꿔 재검색한 뒤 다음 쪽으로 넘기면 바뀐 영역에서
 * 넘어가야 하고, 언어를 바꾸면 그 영역을 지킨 채 언어만 달라져야 한다.
 * 모델이 부른 인자만 들고 있으면 템플릿이 한 일이 매번 지워진다.
 */
let activeArguments: Record<string, unknown> | undefined;

export function setLastToolArguments(args: Record<string, unknown> | undefined): void {
  activeArguments = args;
}

/** 템플릿이 스스로 부른 인자를 기준으로 삼는다. 성공했을 때만 부른다 (queries.ts). */
export function noteTemplateSearch(args: SearchArguments): void {
  activeArguments = { ...args } as Record<string, unknown>;
}

export function getSearchArguments(): SearchArguments {
  return (activeArguments ?? {}) as SearchArguments;
}

/**
 * 검색 인자에서 그릴 영역을 뽑는다.
 *
 * 사각 검색의 x1/y1은 좌상단, x2/y2는 우하단이다. 반경은 m 단위로 오는데 SDK의 Circle은
 * km를 받는다.
 */
export function toSearchArea(args: SearchArguments): SearchArea | undefined {
  const x1 = toNumber(args.x1);
  const y1 = toNumber(args.y1);

  if (args.area === 'radius') {
    const radius = toNumber(args.radius);
    if (x1 === undefined || y1 === undefined || radius === undefined || radius <= 0) {
      return undefined;
    }
    return { kind: 'circle', center: [x1, y1], radiusKm: radius / 1000 };
  }

  if (args.area === 'bbox') {
    const x2 = toNumber(args.x2);
    const y2 = toNumber(args.y2);
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      return undefined;
    }
    return { kind: 'polygon', path: rectanglePath(x1, y1, x2, y2) };
  }

  return undefined;
}

/** 좌상단·우하단 두 점으로 닫힌 사각형 경로를 만든다. */
export function rectanglePath(x1: number, y1: number, x2: number, y2: number): LngLatLike[] {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
    [x1, y1],
  ];
}
