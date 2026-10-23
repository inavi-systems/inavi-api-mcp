/**
 * 응답에서 좌표 배열만 떼어 내는 도구.
 *
 * 대화 부담이 큰 것은 좌표 배열이다. 경로는 15km에 149개, 행정구역 폴리곤은 읍면동 하나에
 * 392개가 온다. 모델은 그 값을 그대로 쓸 일이 거의 없다 — 거리·소요 시간·통행료와 구간별
 * 교통 상황이면 답을 만들기에 충분하다.
 *
 * 그래서 좌표는 **모델을 거치지 않고 템플릿에만** 보낸다. 도구 응답의 `_meta`는 템플릿까지만
 * 전달되고 모델 컨텍스트에는 오지 않는 것이 Claude Desktop에서 확인됐다 (좌표 7,357개까지).
 *
 * 좌표 배열을 통째로 떼어 `_meta`로 옮길 뿐이고, 입력 `includeCoords`로 언제든 되돌릴 수 있다.
 *
 * **자르는 것은 이 둘뿐이다.** 목록형 응답은 `reqcount`·`startposition`으로 호출하는 쪽이 양을
 * 정할 수 있어 서버가 미리 깎지 않는다.
 *
 * 모두 `toDataEnvelope`를 거친 뒤의 `{ header, data }` 구조를 입력으로 받는다.
 */

import type { DataEnvelope } from '@/tools/common/envelope';

/** 좌표 한 점. 검색·지오코딩과 달리 경로·폴리곤 좌표는 숫자로 온다. */
export interface Coord {
  x: number;
  y: number;
}

export interface SplitResult {
  /** 모델에게 줄 응답. 뗀 것이 있으면 새 객체, 없으면 원본 그대로. */
  body: DataEnvelope;
  /** 떼어 낸 좌표. 뗄 것이 없으면 `undefined`. */
  coords?: Coord[][];
}

/**
 * 경로 응답에서 `data.paths[].coords`를 떼어 낸다. 자동차·예측·도보가 같은 구조다.
 *
 * 떼어 낸 배열은 `paths[]`와 같은 순서·같은 길이다.
 */
export function splitPathCoords(envelope: DataEnvelope): SplitResult {
  return split(
    envelope,
    (body) => {
      const paths = body.data.paths;
      if (!Array.isArray(paths)) return undefined;
      return paths as CoordHolder[];
    },
    'coords',
  );
}

/**
 * 폴리곤 응답에서 `data.polygondata[].polygonlist[].polygon`을 떼어 낸다.
 *
 * 떼어 낸 배열은 **폴리곤 목록을 평탄하게 펼친 순서**다. 행정구역 하나가 섬을 포함해
 * 여러 폴리곤으로 오므로, 템플릿은 같은 순서로 다시 꽂는다.
 */
export function splitPolygonCoords(envelope: DataEnvelope): SplitResult {
  return split(
    envelope,
    (body) => {
      const groups = body.data.polygondata;
      if (!Array.isArray(groups)) return undefined;

      const holders: CoordHolder[] = [];
      for (const group of groups) {
        // 스펙은 polygonlist를 객체로 선언하지만 실제 응답은 배열이다 (실측).
        const list = (group as { polygonlist?: unknown } | null)?.polygonlist;
        if (!Array.isArray(list)) return undefined;
        holders.push(...(list as CoordHolder[]));
      }
      return holders;
    },
    'polygon',
  );
}

interface CoordHolder {
  [key: string]: unknown;
}

/**
 * 공통 절차 — 좌표를 담은 객체들을 찾아 해당 키만 지우고 값을 모은다.
 *
 * 아는 모양이 아니면 아무것도 하지 않고 원본을 그대로 돌려준다. 응답 구조가 바뀌었을 때
 * 조용히 값을 잃는 것보다 대화가 무거운 편이 낫다.
 */
function split(
  envelope: DataEnvelope,
  readHolders: (body: DataEnvelope) => CoordHolder[] | undefined,
  key: string,
): SplitResult {
  const holders = readHolders(envelope);
  if (!holders) return { body: envelope };

  const coords = holders.map((holder) =>
    Array.isArray(holder[key]) ? (holder[key] as Coord[]) : [],
  );
  if (coords.every((list) => list.length === 0)) return { body: envelope };

  const body = structuredClone(envelope);
  readHolders(body)?.forEach((holder) => {
    delete holder[key];
  });

  return { body, coords };
}
