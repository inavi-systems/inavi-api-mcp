import { z } from 'zod';
import { anyObject, openObject, opt } from '@/tools/common/schema/inavi-response.schema';

/**
 * POI 한 건. 통합 검색·주변 카테고리 검색이 **같은 38개 필드**를 쓴다 (실측으로 차집합 0).
 *
 * 좌표는 용도별로 따로 있다 — `dpx`/`dpy`는 지도 표출용(건물 중심), `rpx`/`rpy`와
 * `routepoints[]`는 차량 진입로, `entrypoint`는 진입 지점이다. 표출용 좌표를 경로 탐색에
 * 넘기면 불필요한 우회·U턴이 생긴다.
 */
export const poiSchema = openObject({
  poiid: opt.num('Unique POI id'),
  depth: opt.str('Hierarchy level. 0=facility, 1=sub-facility, 2=lowest-level facility'),

  dpx: opt.str('Display longitude (building centre). Do NOT use this for routing'),
  dpy: opt.str('Display latitude (building centre)'),
  rpx: opt.str('Road-entrance longitude. Use this one for routing'),
  rpy: opt.str('Road-entrance latitude. Use this one for routing'),
  routepoints: z
    .array(openObject({ rpx: opt.str('Longitude'), rpy: opt.str('Latitude') }))
    .optional()
    .describe('Road-entrance coordinates. Large sites such as train stations have several'),
  entrypoint: openObject({ px: opt.str('Longitude'), py: opt.str('Latitude') })
    .optional()
    .describe('Pedestrian entrance coordinate'),

  name1: opt.str('Primary name'),
  name2: opt.str('Short name'),
  name3: opt.str('Alternate name 1'),
  name4: opt.str('Alternate name 2'),

  admcode: opt.str('Administrative district code (legal-dong or administrative-dong)'),
  haengcode: opt.str('Administrative-dong code'),
  address: opt.str('Full address (lot-number based)'),
  address_haeng: opt.str('Address based on the administrative dong'),
  jibun: opt.str('Lot number'),
  roadname: opt.str('Road name'),
  roadjibun: opt.str('Building number on the road'),
  detailaddress: opt.str('Address detail such as floor or unit'),

  catecode: opt.str('Category code. Use lookup_category_code to map names to codes'),
  catename: opt.str('Category name'),
  dp_catecode: opt.str('Display category code'),

  distance: opt.num(
    'Distance from the reference point in metres. Only filled when the search had one',
  ),
  tel: opt.str('Phone number'),

  hasoildata: opt.bool('Whether fuel price data exists (petrol stations)'),
  hasdetailinfo: opt.bool('Whether extended detail exists'),
  hassubpoi: opt.bool('Whether sub-POIs exist'),
  islandmark: opt.bool('Whether this is a landmark'),
  updateTS: opt.str('Last update timestamp of the record'),

  /**
   * `subpoi.poi[]`가 자기 자신을 가리키는 순환 참조라 재귀로 선언할 수 없다.
   *
   * 한 겹만 모양을 밝히고 그 안은 열어 둔다 (`anyObject`). 이 도구들은 `depth` 인자를
   * 노출하지 않아 하위 시설물을 요청할 수단이 없고, 실측 픽스처 3종 모두 `{count: 0, poi: []}`다.
   */
  subpoi: openObject({
    count: opt.num('Number of sub-POIs'),
    poi: z
      .array(anyObject('A sub-POI, shaped like the parent POI'))
      .optional()
      .describe('Sub-POIs. Always empty unless sub-facilities were requested'),
  })
    .optional()
    .describe('Sub-POI info'),

  externallink: z
    .array(
      openObject({
        Site: opt.str('Linked site'),
        ID: opt.str('Linked id'),
        ExtraInfo1: opt.str('Extra info 1'),
        ExtraInfo2: opt.str('Extra info 2'),
      }),
    )
    .optional()
    .describe('Linked external sites'),

  popularity: opt.bool('Popular flag'),
  pop_tv: opt.bool('Popular on TV'),
  pop_sns: opt.bool('Popular on social media'),
  pop_hot: opt.bool('HOT flag'),
  pop_hit: opt.bool('HIT flag'),
  pop_top: opt.str('TOP ranking label'),
}).describe('A single place (POI)');

/**
 * 통합 검색 도구가 내보내는 POI. 국문 쌍(`*_ko`)까지 더한 상위집합이다.
 *
 * 한 도구가 언어에 따라 두 API를 갈라 부르므로 양쪽을 한 스키마로 덮는다.
 * **한국어 외 언어에서는 `haengcode` · `address_haeng` · `externallink`가 빠진다.**
 * 필드를 잃는 게 아니라 사용자가 언어를 고르며 함께 고르는 것이다.
 */
export const globalPoiSchema = poiSchema
  .extend({
    name1_ko: opt.str('Korean primary name. Use it when chaining into routing or re-search'),
    name2_ko: opt.str('Korean short name'),
    name3_ko: opt.str('Korean alternate name 1'),
    name4_ko: opt.str('Korean alternate name 2'),
    address_ko: opt.str('Korean full address'),
    jibun_ko: opt.str('Korean lot number'),
    roadname_ko: opt.str('Korean road name'),
    roadjibun_ko: opt.str('Korean building number'),
    detailaddress_ko: opt.str('Korean address detail'),
    catename_ko: opt.str('Korean category name'),
  })
  .describe('A single place (POI). The `*_ko` fields are filled only for non-Korean searches');

/**
 * 통합 검색의 주소 결과 한 건.
 *
 * 행정구역 분해 필드 6종(`address_sido`~`haengcode`)은 **한국어 검색에만** 온다.
 * 다국어 검색은 그 대신 국문 쌍을 준다.
 */
export const searchAdmSchema = openObject({
  type: opt.num('Match type. 1=district, 2=lot number, 3=road address'),
  posx: opt.str('Longitude'),
  posy: opt.str('Latitude'),
  admcode: opt.str('Legal district code'),
  address: opt.str('Full address'),
  jibun: opt.str('Lot number'),
  roadname: opt.str('Road name'),
  roadjibun: opt.str('Building number on the road'),
  postcode: opt.str('Postal code'),
  buildname: opt.str('Building name. Provided for road-address matches'),
  accuracy: opt.num(
    'Lot-number accuracy. 0=exact, 1=sub-number widened, 2=main-number widened, 3=district only',
  ),
  distance: opt.num('Distance from the reference point in metres'),

  address_sido: opt.str('Province or metropolitan city. Korean-language searches only'),
  address_gu: opt.str('City, county or district. Korean-language searches only'),
  address_dong: opt.str('Legal dong. Korean-language searches only'),
  address_haeng: opt.str('Address based on the administrative dong. Korean-language searches only'),
  legalcode: opt.str('Legal-dong code. Korean-language searches only'),
  haengcode: opt.str('Administrative-dong code. Korean-language searches only'),
}).describe('A single address match');

/** 다국어 검색의 주소 결과. 국문 쌍이 붙는다. */
export const globalAdmSchema = searchAdmSchema
  .extend({
    address_ko: opt.str('Korean full address'),
    jibun_ko: opt.str('Korean lot number'),
    roadname_ko: opt.str('Korean road name'),
    roadjibun_ko: opt.str('Korean building number'),
    buildname_ko: opt.str('Korean building name'),
  })
  .describe('A single address match. The `*_ko` fields are filled only for non-Korean searches');
