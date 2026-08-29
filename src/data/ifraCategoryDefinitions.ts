// Source: IFRA 51st Amendment, "Guidance for the use of the IFRA Standards",
// Table 11 ("List of IFRA categories and subcategories with corresponding product
// types"), pages 43-55. Descriptions are condensed from the official category
// rationale and representative product-type list -- see the source document for
// the full product-type breakdown, flavor-use, and phototoxicity applicability
// columns before relying on this for an edge-case product.
export interface IfraCategoryDefinition {
  en: string
  ko: string
}

export const IFRA_CATEGORY_DEFINITIONS: Record<string, IfraCategoryDefinition> = {
  cat1: {
    en: 'Leave-on, lips (lipstick/lip balm and similar; also children’s toys)',
    ko: '리브온, 입술 (립스틱/립밤 등; 어린이 장난감도 포함)',
  },
  cat2: {
    en: 'Leave-on, underarms (deodorant/antiperspirant, body spray/mist)',
    ko: '리브온, 겨드랑이 (데오드란트/제한제, 바디스프레이/미스트)',
  },
  cat3: {
    en: 'Leave-on, face applied with fingertips (eye/face makeup, makeup remover, facial wipes, face/body paint)',
    ko: '리브온, 손가락으로 바르는 얼굴 제품 (아이/페이스 메이크업, 메이크업 리무버, 페이셜 티슈, 페이스/바디 페인트)',
  },
  cat4: {
    en: 'Leave-on, neck/face/wrists (fine fragrance: EDT/EDP/cologne, aftershave, fragranced bracelets, perfume kits)',
    ko: '리브온, 목/얼굴/손목 (향수: EDT/EDP/코롱, 애프터쉐이브, 향기 팔찌, 향수 키트)',
  },
  cat5A: {
    en: 'Leave-on, body via palms — general (body lotion/cream/oil, foot care, insect repellent, body powder/talc)',
    ko: '리브온, 손바닥으로 바르는 몸 전반 (바디 로션/크림/오일, 발 케어, 곤충 기피제, 바디 파우더/탈크)',
  },
  cat5B: {
    en: 'Leave-on, face via palms (facial toner, facial moisturizer/cream)',
    ko: '리브온, 손바닥으로 바르는 얼굴 (페이셜 토너, 페이셜 모이스처라이저/크림)',
  },
  cat5C: {
    en: 'Leave-on, hands (hand cream, nail care, hand sanitizer) — the handcare category',
    ko: '리브온, 손 (핸드크림, 네일 케어, 손소독제) — 핸드케어 카테고리',
  },
  cat5D: {
    en: 'Leave-on, baby products (baby cream/lotion/oil/powder)',
    ko: '리브온, 유아용 제품 (베이비 크림/로션/오일/파우더)',
  },
  cat6: {
    en: 'Rinse-off, lip & oral exposure (toothpaste, mouthwash, tooth powder)',
    ko: '린스오프, 입술·구강 노출 (치약, 구강청결제, 치약 파우더)',
  },
  cat7A: {
    en: 'Rinse-off hair, hand contact (perm/chemical hair treatment, rinse-off hair dye)',
    ko: '린스오프 헤어, 손 접촉 (펌/헤어 화학 트리트먼트, 린스오프 염모제)',
  },
  cat7B: {
    en: 'Leave-on hair, hand contact (hair spray, styling gel/mousse, leave-on conditioner, dry shampoo, leave-on hair dye)',
    ko: '리브온 헤어, 손 접촉 (헤어스프레이, 스타일링 젤/무스, 리브온 컨디셔너, 드라이샴푸, 리브온 염모제)',
  },
  cat8: {
    en: 'Leave-on, significant anogenital exposure (intimate wipes/spray, tampons, baby wipes, wet toilet paper)',
    ko: '리브온, 상당한 항문·생식기 노출 (인티밋 물티슈/스프레이, 탐폰, 베이비 물티슈, 물 티슈형 화장지)',
  },
  cat9: {
    en: 'Rinse-off, body & hand exposure (soap, shampoo, shower gel, shaving cream, depilatories, pet shampoo)',
    ko: '린스오프, 몸·손 노출 (비누, 샴푸, 샤워젤, 쉐이빙크림, 제모제, 반려동물 샴푸)',
  },
  cat10A: {
    en: 'Rinse-off household, hand contact (laundry detergent, dish detergent, hard-surface cleaner)',
    ko: '린스오프 가정용, 손 접촉 (세탁세제, 식기세제, 표면 세정제)',
  },
  cat10B: {
    en: 'Leave-on household, hand contact (animal spray, air freshener spray, aerosol insecticide)',
    ko: '리브온 가정용, 손 접촉 (동물용 스프레이, 방향제 스프레이, 에어로졸 살충제)',
  },
  cat11A: {
    en: 'Leave-on, inert substrate, minimal transfer, no UV exposure (feminine hygiene pads, diapers, dry toilet paper)',
    ko: '리브온, 불활성 기재, 전이 미미, 자외선 노출 없음 (여성 위생용품, 기저귀, 마른 화장지)',
  },
  cat11B: {
    en: 'Leave-on, inert substrate, minimal transfer (tights, scented socks, tissues, napkins, pillow spray, paper towels)',
    ko: '리브온, 불활성 기재, 전이 미미 (타이츠, 향 나는 양말, 티슈, 냅킨, 필로우 스프레이, 종이타월)',
  },
  cat12: {
    en: 'No/insignificant skin contact (candles, air fresheners, incense, paints, plastic articles)',
    ko: '피부 접촉 없음/미미 (양초, 방향제, 향, 페인트, 플라스틱 제품)',
  },
}
