import { z } from 'zod';
import { openObject, opt } from '@/tools/common/schema/inavi-response.schema';

/** 지오코딩 본문. 후보가 여럿일 수 있어 `adm`이 **배열**이다. */
export const geocodeDataSchema = openObject({
  totalcount: opt.num('Total number of matches'),
  admtotalcount: opt.num('Total number of address matches'),
  admcount: opt.num('Number of addresses in this response'),
  adm: z
    .array(
      openObject({
        type: opt.num('Match type. 1=district, 2=lot number, 3=road address'),
        posx: opt.str('Longitude'),
        posy: opt.str('Latitude'),
        admcode: opt.str('Legal district code'),
        address: opt.str('Full address'),
        jibun: opt.str('Lot number'),
        roadname: opt.str('Road name'),
        roadjibun: opt.str('Building number on the road'),
        postcode: opt.str('Postal code'),
        buildname: opt.str('Building name'),
        accuracy: opt.num(
          'Lot-number accuracy. 0=exact, 1=sub-number widened, 2=main-number widened, ' +
            '3=district only',
        ),
        distance: opt.num('Distance from the reference point in metres'),
        address_sido: opt.str('Province or metropolitan city'),
        address_gu: opt.str('City, county or district'),
        address_dong: opt.str('Legal dong'),
        address_haeng: opt.str('Address based on the administrative dong'),
        legalcode: opt.str('Legal-dong code'),
        haengcode: opt.str('Administrative-dong code'),
      }),
    )
    .optional()
    .describe('Candidate coordinates. This is an array and may hold several entries'),
}).describe('Geocoding results');

/**
 * 행정구역 단계별 주소. 리버스 지오코딩이 행정동·법정동 두 벌로 돌려준다.
 *
 * ⚠️ **두 자리에 같은 인스턴스를 쓰지 않는다.** 공유하면 변환이 뒤쪽을
 * `$ref: "#/properties/data/properties/adm_address"`로 가리키는데, 내부 포인터를 풀지 않는
 * 클라이언트에게는 그 자리의 스키마가 사라진다. 그래서 자리마다 새로 만든다.
 */
function categorizedAddress(label: string) {
  return openObject({
    address: opt.str('Full address'),
    jibun: opt.str('Lot number'),
    cut_address: opt.str('Shortened address'),
    admcode: opt.str('Official district code. Pass it straight to get_admin_boundary'),
    address_category1: opt.str('Level 1 — province or metropolitan city'),
    address_category2: opt.str('Level 2 — city, county or district'),
    address_category3: opt.str('Level 3 — eup, myeon or dong'),
    address_category4: opt.str('Level 4 — ri'),
  })
    .optional()
    .describe(label);
}

/**
 * 리버스 지오코딩 본문.
 *
 * ⚠️ `adm`이 지오코딩과 달리 **배열이 아니라 객체 하나**다. 스펙 설명에는 "목록(배열)"이라
 * 적혀 있으나 실제 응답은 객체다 (실측).
 */
export const reverseGeocodeDataSchema = openObject({
  hasAdmAddress: opt.bool('Whether an administrative address was found'),
  adm: openObject({
    posx: opt.str('Longitude'),
    posy: opt.str('Latitude'),
    address: opt.str('Full address (lot-number based)'),
    jibun: opt.str('Lot number'),
    roadname: opt.str('Road name'),
    roadjibun: opt.str('Building number on the road'),
    admcode: opt.str('Legal district code'),
    postcode: opt.str('Postal code'),
    bldname: opt.str('Name of the NEAREST building, not the business at this exact point'),
    bldnum: opt.str('Building number'),
    distance: opt.num('Distance from the requested point in metres'),
  })
    .optional()
    .describe('Address info. This is a single object, not an array'),
  adm_address: categorizedAddress('Address based on the administrative dong'),
  legal_address: categorizedAddress('Address based on the legal dong'),
}).describe('Reverse geocoding result');
