import type { LngLatLike } from '../map/inavi';
import {
  describeLocation,
  readLocationAdm,
  toNumber,
  type SearchPoi,
  type ToolPayload,
} from '../shared/payload';

/**
 * 경로 탐색에 넘길 한 지점.
 *
 * 지도에서 고른 것과 목록에서 고른 것을 같은 모양으로 다룬다.
 */
export interface MapPick {
  name: string;
  /** 경로 탐색에 넘길 좌표. POI라면 **차량 진입로 좌표**다. */
  position: LngLatLike;
  /**
   * 핀을 세울 자리. 생략하면 `position`을 쓴다.
   *
   * 둘이 다른 이유는 POI의 좌표가 용도별로 따로이기 때문이다(CLAUDE.md). 목록에서 고르면
   * **그 줄의 번호 핀과 같은 자리**에 S·E 핀이 서야 하는데, 경로에 넘길 진입로 좌표는
   * 건물에서 100m쯤 떨어진 도로 위다. 그대로 찍으면 엉뚱한 데 S가 선다(실기 피드백).
   */
  pinPosition?: LngLatLike;
}

/**
 * 두 지점이 **같은 자리인지.**
 *
 * 한 역에 출입구가 여럿이어도 **차량 진입로는 하나**인 일이 흔하다 — 판교역(KTX)과
 * 판교역(경강선)은 `rpx/rpy`가 글자 하나까지 같다(실측). 그대로 경로를 요청하면 출발지와
 * 도착지가 같아 탐색이 되지 않는다.
 */
export function samePickPosition(a: LngLatLike, b: LngLatLike): boolean {
  // 1e-7도 ≈ 1cm. 사실상 같은 값인지만 본다 — 가까운 두 지점을 막자는 게 아니다.
  return Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
}

/**
 * POI에서 경로에 쓸 좌표를 고른다.
 *
 * `CLAUDE.md` 규칙 — 표출용 좌표(`dpx`/`dpy`)는 건물 중심이라 도로 위 지점이 아니다.
 * 그대로 경로 탐색에 넘기면 불필요한 우회·U턴이 생긴다. 차량 진입로 좌표를 우선 쓰고,
 * `rpx`/`rpy`가 없으면 `routepoints[0]`, 그것도 없을 때만 표출용으로 물러선다.
 */
export function routePositionOf(poi: SearchPoi): LngLatLike | undefined {
  const first = poi.routepoints?.[0];
  const candidates: [unknown, unknown][] = [
    [poi.rpx, poi.rpy],
    [first?.rpx, first?.rpy],
    [poi.dpx, poi.dpy],
  ];

  for (const [x, y] of candidates) {
    const lng = toNumber(x as string | undefined);
    const lat = toNumber(y as string | undefined);
    if (lng !== undefined && lat !== undefined) return [lng, lat];
  }
  return undefined;
}

/** 리버스 지오코딩 결과를 지점 하나로 바꾼다. */
export function pickFromLocation(payload: ToolPayload | undefined, fallback: LngLatLike): MapPick {
  const adm = readLocationAdm(payload?.data);
  const lng = toNumber(adm?.posx);
  const lat = toNumber(adm?.posy);
  const name = describeLocation(adm);

  return {
    // 이름을 못 얻으면 좌표 자체를 이름으로 쓴다. 모델이 그대로 경로에 넣을 수 있다.
    name: name || formatPosition(fallback),
    // 매칭된 주소 지점이 있으면 그쪽이 도로에 가깝다.
    position: lng !== undefined && lat !== undefined ? [lng, lat] : fallback,
  };
}

/**
 * 출발·도착으로 모델에게 넘길 문장을 만든다.
 *
 * 이름만 넘기면 모델이 `search_places`를 다시 돌려 좌표를 얻어야 한다. 우리가 이미 진입로
 * 좌표를 들고 있으므로 함께 넘겨 왕복을 줄인다. 사람이 읽을 이름도 같이 둬서 무엇을 고른
 * 것인지 확인하고 보낼 수 있게 한다 (Claude Desktop은 바로 보내지 않고 입력창에 채운다).
 */
export function buildRoutePrompt(start: MapPick, end: MapPick): string {
  return (
    `${start.name}(${formatPosition(start.position)})에서 ` +
    `${end.name}(${formatPosition(end.position)})까지 자동차 경로를 알려줘.`
  );
}

export function formatPosition(position: LngLatLike): string {
  return `${position[0].toFixed(6)}, ${position[1].toFixed(6)}`;
}
