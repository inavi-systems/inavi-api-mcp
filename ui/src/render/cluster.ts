import type { InaviClustererOptions } from '../map/inavi';
import { CLUSTER_STEPS } from '../map/map-colors';
import { clusterIconDataUri } from './pin';

/**
 * 마커를 뭉쳐 올리는 규칙.
 *
 * 지금은 통합검색만 쓰지만 **"지점이 많을 때 어떻게 뭉치는가"는 결과 종류와 무관한 규칙**이라
 * 렌더러 밖에 둔다. 다른 결과가 많은 지점을 들고 와도 같은 모양으로 뭉친다
 * (render/result.ts의 `drawFeatures`).
 */

/**
 * 뭉치는 간격.
 *
 * SDK 기본값은 `gridSize: 80` · `maxZoom: 18`이라 **최대 배율까지 가야 두 개짜리 덩어리가
 * 풀렸다**(실기 피드백). 격자를 좁히고, 그보다 더 확대하면 아예 뭉치지 않도록 상한을 내린다.
 */
const CLUSTER_SPACING = { gridSize: 30, maxZoom: 15 };

/**
 * 단계 문턱값을 **지금 마커 수에 맞춰 계산한다.**
 *
 * `ClusterStyle.steps`는 개수가 아니라 **전체 마커 중 몇 %가 뭉쳤는지**(0~1)를 받는다.
 * SDK 기본값(`[.1, .05, .025, .0125]`)은 마커가 수백 개일 때를 가정한 값이라, 47개짜리
 * 결과에서는 7개 뭉친 것도 10%를 넘어 **전부 같은 단계**로 떨어졌다 — 크기가 다 똑같아
 * 보이던 이유다 (실기 피드백).
 *
 * 그래서 "몇 개부터 이 단계"를 비율로 되돌린다. 마커가 적어 문턱이 겹치면 내림차순이
 * 깨지므로 조금씩 떨어뜨리고, 1을 넘는 단계는 쓰지 않는다.
 */
export function clusterThresholds(total: number): number[] {
  const steps: number[] = [];

  for (const { from } of CLUSTER_STEPS) {
    if (from <= 0) break;

    const ratio = from / total;
    if (ratio >= 1) continue;

    const previous = steps[steps.length - 1];
    steps.push(previous !== undefined && ratio >= previous ? previous - 0.005 : ratio);
  }
  return steps.filter((step) => step > 0);
}

/**
 * 뭉친 개수에 따라 커지는 풍선. 색·크기는 map-colors.ts의 `CLUSTER_STEPS`가 정한다.
 *
 * 아이콘은 `steps` 개수 + 1개가 필요하다. 그림을 만들지 못하면 **스타일을 아예 넘기지
 * 않는다** — 마커까지 잃는 것보다 SDK 기본 풍선이 낫다 (pin.ts의 `clusterIconDataUri`).
 */
export function clusterOptions(total: number): InaviClustererOptions {
  const steps = clusterThresholds(total);
  // 쓰지 않는 큰 단계는 잘라 낸다.
  const used = CLUSTER_STEPS.slice(CLUSTER_STEPS.length - (steps.length + 1));

  const icons = used.map(({ size, color }) => {
    const url = clusterIconDataUri(size, color);
    return url
      ? { url, size: [size, size] as [number, number], position: [0, 0] as [number, number] }
      : undefined;
  });
  if (icons.some((icon) => icon === undefined)) return { ...CLUSTER_SPACING };

  return {
    ...CLUSTER_SPACING,
    styles: {
      steps,
      icons: icons as NonNullable<InaviClustererOptions['styles']>['icons'],
      textColor: '#FFFFFF',
      textSize: 13,
    },
  };
}

/**
 * 클러스터러는 개별(declustered) 마커에 `cluster_<n>_<index>s` 형태의 id를 준다.
 * 끝의 `s`가 개별 마커임을 뜻한다. (infowindow-clustered-markers 예제 참고)
 */
export function individualMarkerIndex(id: string | undefined): number | undefined {
  const match = id?.match(/_(\d+)s$/);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}
