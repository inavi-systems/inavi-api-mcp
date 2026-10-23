import { inaviHttpClient, type INaviHttpClient } from '@/clients/inavi-http.client';
import type { INaviGeocodeResponse, INaviReverseGeocodeResponse } from '@/types/inavi-api.types';

/** `GET /coordinates` 요청 파라미터. */
export interface GeocodeAddressParams {
  query: string;
  coordtype?: '0' | '1';
  startposition?: number;
  reqcount?: number;
  /** 기준점 X(경도). 넣으면 결과에 기준점과의 거리가 함께 온다. */
  posX?: number;
  /** 기준점 Y(위도). */
  posY?: number;
  addrext?: '0' | '1' | '2';
  admcode?: string;
}

/** `GET /addresses` 요청 파라미터. */
export interface ReverseGeocodeParams {
  posX: number;
  posY: number;
  coordtype?: '0' | '1';
}

/** 지오코딩 — 주소 문자열을 좌표로 변환한다. 후보가 여럿 반환될 수 있다. */
export class GeocodingClient {
  constructor(private readonly http: INaviHttpClient = inaviHttpClient) {}

  async geocodeAddress(params: GeocodeAddressParams): Promise<INaviGeocodeResponse> {
    return this.http.get<INaviGeocodeResponse>('/coordinates', { ...params });
  }

  /**
   * 리버스 지오코딩 — 좌표를 주소로 바꾼다.
   *
   * 지오코딩(`address.adm[]`)과 달리 **`location.adm`은 배열이 아니라 객체 하나**다.
   * 스펙 설명에는 "목록(배열)"이라 적혀 있으나 실제 응답은 객체다. 실측으로 확인했다.
   */
  async reverseGeocode(params: ReverseGeocodeParams): Promise<INaviReverseGeocodeResponse> {
    return this.http.get<INaviReverseGeocodeResponse>('/addresses', { ...params });
  }
}

export const geocodingClient = new GeocodingClient();
