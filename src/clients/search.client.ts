import { inaviHttpClient, type INaviHttpClient } from '@/clients/inavi-http.client';
import type {
  INaviNearbyCategoryResponse,
  INaviOptimalPositionResponse,
  INaviSearchResponse,
} from '@/types/inavi-api.types';

/** `GET /searches` 요청 파라미터. 좌표는 숫자로 받아 전송 시 문자열로 직렬화된다. */
export interface SearchPlacesParams {
  query: string;
  coordtype?: '0' | '1';
  startposition?: number;
  reqcount?: number;
  spopt?: '0' | '1' | '2';
  radius?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  sortopt?: '1' | '2' | '3' | '4' | '5';
  catecode?: string;
  admcode?: string;
}

/** `GET /g-searches` 요청 파라미터. `lang` 하나를 빼면 통합 검색과 완전히 같다. */
export interface SearchPlacesGlobalParams extends SearchPlacesParams {
  lang: 'en' | 'ja' | 'zh';
}

/** `GET /nearby-category-searches` 요청 파라미터. 공간 한정이 강제다(전체 검색이 없다). */
export interface SearchNearbyCategoryParams {
  catecode: string;
  spopt: '1' | '2';
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  radius?: number;
  coordtype?: '0' | '1';
  startposition?: number;
  reqcount?: number;
  /** ⚠️ 통합 검색과 정반대다. 여기서는 1=거리순, 2=명칭순. */
  sortopt?: '1' | '2';
}

/** `GET /optimal-position-searches` 요청 파라미터. */
export interface FindOptimalPositionsParams {
  posX: number;
  posY: number;
  type?: '0' | '1' | '2' | '3';
  count?: number;
}

/** 장소/주소 검색 계열. API마다 메서드 하나로 1:1을 유지한다. */
export class SearchClient {
  constructor(private readonly http: INaviHttpClient = inaviHttpClient) {}

  /** 통합 검색 — 상호명·건물명·업종명·주소·전화번호 등으로 POI와 주소를 함께 찾는다. */
  async searchPlaces(params: SearchPlacesParams): Promise<INaviSearchResponse> {
    return this.http.get<INaviSearchResponse>('/searches', { ...params });
  }

  /**
   * 다국어 통합 검색 — 결과를 지정한 언어로 받는다.
   *
   * 응답은 통합 검색의 상위집합이 아니다. `_ko` 쌍 10개를 얻는 대신
   * `type` · `haengcode` · `address_haeng` · `externallink`와 `adm[]`의 행정구역 분해 필드를 잃는다.
   * 그래서 국문 검색을 이쪽으로 대체하지 않고 언어로 갈라 부른다.
   */
  async searchPlacesGlobal(params: SearchPlacesGlobalParams): Promise<INaviSearchResponse> {
    const { lang, ...rest } = params;
    return this.http.get<INaviSearchResponse>('/g-searches', { ...rest, lang });
  }

  /**
   * 주변 카테고리 검색 — 좌표+반경 또는 사각 영역 안에서 분류에 해당하는 POI를 찾는다.
   *
   * 통합 검색이 상호명 매칭이라면 이쪽은 분류 매칭이다. "이 근처 편의점"은 GS25와 CU가 다른
   * 이름이라 키워드 검색으로는 누락된다.
   */
  async searchNearbyCategory(
    params: SearchNearbyCategoryParams,
  ): Promise<INaviNearbyCategoryResponse> {
    return this.http.get<INaviNearbyCategoryResponse>('/nearby-category-searches', { ...params });
  }

  /**
   * 최적 지점 검색 — 좌표를 실제 도로 네트워크에 매칭된 진출입 지점으로 스냅한다.
   *
   * 검색 결과에 `rpx`/`rpy`가 없을 때 표출용 좌표를 그대로 경로 탐색에 넘기면 불필요한
   * 우회·U턴이 생기는데, 그 정식 해법이다. 응답 좌표는 **문자열이 아니라 숫자**다.
   */
  async findOptimalPositions(
    params: FindOptimalPositionsParams,
  ): Promise<INaviOptimalPositionResponse> {
    return this.http.get<INaviOptimalPositionResponse>('/optimal-position-searches', { ...params });
  }
}

export const searchClient = new SearchClient();
