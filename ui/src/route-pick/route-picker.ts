import type { InaviMap, InaviMarker, InaviNamespace } from '../map/inavi';
import type { ToolPayload } from '../shared/payload';
import { buildRoutePrompt, pickFromLocation, samePickPosition, type MapPick } from './map-picks';
import { createPinElement, PIN_COLORS } from '../render/pin';

/**
 * 경로 만들기 모드 — 출발지와 도착지를 순서대로 고른다.
 *
 * 고르는 곳이 둘이다. **목록 항목**을 누르거나(POI라면 차량 진입로 좌표를 쓴다),
 * **지도의 아무 지점**을 클릭한다(리버스 지오코딩으로 이름을 얻는다).
 * 둘이 모이면 문장을 만든다 — 모델이 그 문장으로 `find_route`를 부른다.
 *
 * **도착지를 찍었다고 바로 보내지 않는다.** 바로 넘겼더니 **자기가 찍은 도착지가 어디인지
 * 보지도 못한 채** 대화로 넘어갔다(실기 피드백). 핀을 그대로 두고 **물어볼지 확인**한 뒤에
 * 넘긴다. 잘못 찍었으면 `다시 고르기`로 처음부터 고른다.
 *
 * 항목마다 `출발`·`도착` 버튼을 다는 대신 모드로 둔 이유는, 좁은 사이드바에 버튼을 더
 * 늘리지 않으면서 **목록과 지도를 같은 흐름으로** 섞기 위해서다.
 */

export interface RoutePicker {
  /**
   * 목록 항목에서 고른 지점을 넣는다.
   *
   * **어느 자리를 채웠는지 돌려준다** — 부르는 쪽이 그 목록 줄에 자국을 남겨야 하는데,
   * 단계를 따로 세어 두면 picker와 어긋난다.
   */
  add(pick: MapPick): 'start' | 'end' | undefined;
  /** 고른 것을 다 지우고 출발지부터 다시 고른다. 잘못 찍었을 때 쓴다. */
  reset(): void;
  cancel(): void;
}

export interface RoutePickerOptions {
  /** 지도에서 클릭한 좌표의 이름을 얻는다. 실패하면 좌표를 이름으로 쓴다. */
  lookup: (lng: number, lat: number) => Promise<ToolPayload>;
  /** 안내를 띄운다. 되지 않는 일은 `warn`으로 온다 (render-host.ts의 `setMapHint`). */
  onStatus: (message: string, tone?: 'info' | 'warn') => void;
  /** 지금 고르는 것이 출발지인지 도착지인지. 목록 항목의 안내 문구에 쓴다. */
  onStep?: (step: 'start' | 'end') => void;
  /**
   * 둘을 다 골랐다. **아직 보내지 않았다** — 핀은 지도에 그대로 있고, 부르는 쪽이
   * 사용자에게 물어본 뒤 `prompt`를 대화로 넘긴다.
   */
  onReady: (prompt: string, start: MapPick, end: MapPick) => void;
}

export function startRoutePicker(
  inavi: InaviNamespace,
  map: InaviMap,
  options: RoutePickerOptions,
): RoutePicker {
  const picks: MapPick[] = [];
  const markers: InaviMarker[] = [];
  let done = false;
  /** 둘을 다 골라 **확인을 기다리는 중.** 이때는 더 고를 수 없다. */
  let waiting = false;

  const label = (): string => (picks.length === 0 ? '출발지' : '도착지');

  const announce = (): void => {
    options.onStep?.(picks.length === 0 ? 'start' : 'end');
    // **짧게 적는다.** 경로 만들기를 켜면 목록이 함께 펼쳐지고 줄마다 `출발지로`·`도착지로`
    // 꼬리표가 붙으므로, 목록에서 고른다는 것은 화면이 이미 말하고 있다. 띠는 **화면이
    // 말해 주지 않는 것**만 알린다 — 지도를 눌러도 된다는 것.
    options.onStatus('지도를 클릭하여 선택할 수도 있어요');
  };

  const add = (pick: MapPick): 'start' | 'end' | undefined => {
    if (done || waiting) return undefined;

    const slot = picks.length === 0 ? 'start' : 'end';

    const previous = picks[0];
    if (previous && samePickPosition(previous.position, pick.position)) {
      // 보내 봐야 탐색되지 않는다. 까닭까지 알려야 "왜 안 골라지지"가 되지 않는다.
      options.onStatus('출발지와 같은 지점입니다 — 두 장소의 차량 진입로가 같습니다.', 'warn');
      return undefined;
    }

    markers.push(
      new inavi.maps.Marker({
        map,
        // 핀은 **고른 줄의 번호 핀과 같은 자리**에 세운다. 경로에 넘길 진입로 좌표는 도로 위다.
        position: pick.pinPosition ?? pick.position,
        // 핀 안에는 짧은 글자만 들어간다. 자리 이름은 title이 말해 준다.
        icon: createPinElement(
          picks.length === 0 ? 'S' : 'E',
          picks.length === 0 ? PIN_COLORS.start : PIN_COLORS.end,
        ),
        title: `${picks.length === 0 ? '출발' : '도착'} · ${pick.name}`,
      }),
    );
    picks.push(pick);

    if (picks.length < 2) {
      announce();
      return slot;
    }

    // **핀을 그대로 둔 채** 물어본다. 걷어 버리면 자기가 찍은 도착지를 보지 못한다.
    waiting = true;
    const [start, end] = picks;
    if (start && end) options.onReady(buildRoutePrompt(start, end), start, end);
    return slot;
  };

  const handleClick = ({ lngLat }: { lngLat: { lng: number; lat: number } }): void => {
    if (done || waiting) return;

    options.onStatus(`${label()}를 확인하는 중...`);
    options
      .lookup(lngLat.lng, lngLat.lat)
      .then((payload) => {
        if (!done) add(pickFromLocation(payload, [lngLat.lng, lngLat.lat]));
      })
      .catch(() => {
        // 이름을 못 얻어도 좌표는 있다. 경로 탐색에는 그것으로 충분하다.
        if (!done) add(pickFromLocation(undefined, [lngLat.lng, lngLat.lat]));
      });
  };

  function clearMarkers(): void {
    markers.forEach((marker) => {
      marker.setMap(null);
    });
    markers.length = 0;
  }

  function finish(): void {
    if (done) return;
    done = true;
    map.off('click', handleClick);
    clearMarkers();
  }

  map.on('click', handleClick);
  announce();

  return {
    add,
    reset(): void {
      if (done) return;
      waiting = false;
      picks.length = 0;
      clearMarkers();
      announce();
    },
    cancel: finish,
  };
}
