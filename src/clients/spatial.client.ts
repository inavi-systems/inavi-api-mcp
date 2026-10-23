import { inaviHttpClient, type INaviHttpClient } from '@/clients/inavi-http.client';
import type { INaviPolygonResponse } from '@/types/inavi-api.types';

/** `POST /adminToPolygon` 요청 본문. */
export interface GetAdminBoundaryParams {
  /** 행정구역 코드 또는 명칭. 명칭은 시도부터 다 적어야 찾는다. 예: "4113510900" 또는 "경기도 성남시 분당구". */
  query: string;
  /** 1=광역시도, 2=시군구, 3=읍면동, 4=리. */
  mode: 1 | 2 | 3 | 4;
  coordtype?: '0' | '1';
}

/** 공간 검색 계열. */
export class SpatialClient {
  constructor(private readonly http: INaviHttpClient = inaviHttpClient) {}

  /**
   * 행정구역 폴리곤 — 코드나 명칭으로 경계 좌표를 받는다.
   *
   * ⚠️ 무료 요금제의 일 호출 한도가 60건이다. 리버스 지오코딩(1,500건)과 엮어 클릭마다 자동으로
   * 부르면 금방 소진된다. 사용자가 경계 표시를 명시적으로 요청했을 때만 부른다.
   *
   * 응답 `polygonlist`는 스펙 선언(`type: object`)과 달리 **배열**이다 (실측).
   * 요청에 10자리 코드를 넣어도 응답 `admincode`는 8자리로 온다.
   */
  async getAdminBoundary(params: GetAdminBoundaryParams): Promise<INaviPolygonResponse> {
    return this.http.post<INaviPolygonResponse>('/adminToPolygon', { ...params });
  }
}

export const spatialClient = new SpatialClient();
