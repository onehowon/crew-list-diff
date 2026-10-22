// IMO FAL Form 5 (Crew List, 2018 서식) 항목 정의.
// 근거: 근거자료/FAL/FAL5_DE_2018.pdf 의 항목 번호·영문 명칭.

export const HEADER_FIELDS = [
  { key: 'shipName', fal: '1.1', en: 'Name of ship', ko: '선명' },
  { key: 'imo', fal: '1.2', en: 'IMO number', ko: 'IMO 번호' },
  { key: 'callSign', fal: '1.3', en: 'Call sign', ko: '호출부호' },
  { key: 'voyage', fal: '1.4', en: 'Voyage number', ko: '항차' },
  { key: 'port', fal: '2', en: 'Port of arrival/departure', ko: '입출항지' },
  { key: 'date', fal: '3', en: 'Date of arrival/departure', ko: '입출항일' },
  { key: 'flag', fal: '4', en: 'Flag State of ship', ko: '선적국' },
  { key: 'lastPort', fal: '5', en: 'Last port of call', ko: '직전 기항지' },
];

// 6. No. 는 순번이라 대조 대상에서 뺀다(행 순서가 바뀌면 같이 바뀌는 값).
export const ROW_FIELDS = [
  { key: 'familyName', fal: '7', en: 'Family name', ko: '성', required: true },
  { key: 'givenNames', fal: '8', en: 'Given names', ko: '이름', required: true },
  { key: 'rank', fal: '9', en: 'Rank or rating', ko: '직급', required: true },
  { key: 'nationality', fal: '10', en: 'Nationality', ko: '국적', required: true },
  { key: 'dob', fal: '11', en: 'Date of birth', ko: '생년월일', required: true, date: true },
  { key: 'pob', fal: '12', en: 'Place of birth', ko: '출생지', required: false },
  { key: 'gender', fal: '13', en: 'Gender', ko: '성별', required: true },
  { key: 'idType', fal: '14', en: 'Nature of identity document', ko: '신분증 종류', required: true },
  { key: 'idNumber', fal: '15', en: 'Number of identity document', ko: '여권번호', required: true },
  { key: 'idIssuer', fal: '16', en: 'Issuing State of identity document', ko: '발급국', required: true },
  { key: 'idExpiry', fal: '17', en: 'Expiry date of identity document', ko: '만료일', required: true, date: true },
];

export const FIELD_KEYS = ROW_FIELDS.map((f) => f.key);
export const FIELD = Object.fromEntries(ROW_FIELDS.map((f) => [f.key, f]));
export const HEADER = Object.fromEntries(HEADER_FIELDS.map((f) => [f.key, f]));

export function fieldLabel(key) {
  const f = FIELD[key] || HEADER[key];
  if (!f) return key;
  return `${f.ko} (${f.fal}. ${f.en})`;
}

// 헤더 별칭 사전. 비교 전에 소문자로 바꾸고 공백·문장부호를 지운다(normHeader).
// 이 사전과 아래 키워드 규칙은 평가셋 레이아웃을 정의하기 전에 작성했다(README 참고).
export const COLUMN_ALIASES = {
  no: ['no', 'sn', 'srno', 'serialno', 'seq', 'seqno', '번호', '순번', '연번'],
  familyName: ['familyname', 'family', 'surname', 'lastname', 'last', '성', '성씨'],
  givenNames: ['givennames', 'givenname', 'firstname', 'firstnames', 'forename', 'forenames', 'first', 'firstandmiddlename', 'firstmiddlename', 'name', '이름', '명'],
  rank: ['rankorrating', 'rank', 'rating', 'position', 'capacity', 'designation', 'duty', '직책', '직급', '직위', '직무'],
  nationality: ['nationality', 'nation', 'nat', 'citizenship', '국적'],
  dob: ['dateofbirth', 'dob', 'birthdate', 'birthday', 'born', '생년월일', '출생일', '생일'],
  pob: ['placeofbirth', 'pob', 'birthplace', '출생지', '출생장소'],
  gender: ['gender', 'sex', 'mf', '성별'],
  idType: ['natureofidentitydocument', 'idtype', 'documenttype', 'doctype', 'typeofid', 'typeofdocument', 'identitydocument', 'iddocument', '신분증종류', '신분증', '서류종류', '증명서종류'],
  idNumber: ['numberofidentitydocument', 'passportno', 'passportnumber', 'passport', 'ppno', 'seamanbookno', 'seamansbookno', 'seamansbooknumber', 'seamanbooknumber', 'sbno', 'idno', 'idnumber', 'documentno', 'documentnumber', 'docno', 'docnumber', '여권번호', '신분증번호', '선원수첩번호', '서류번호'],
  idIssuer: ['issuingstateofidentitydocument', 'issuingstate', 'issuedby', 'issuingcountry', 'issuer', 'countryofissue', 'stateofissue', '발급국', '발행국', '발급국가', '발급기관'],
  idExpiry: ['expirydateofidentitydocument', 'expirydate', 'expiry', 'dateofexpiry', 'expirationdate', 'expiration', 'validuntil', 'validtill', 'expdate', 'exp', '만료일', '유효기간', '유효기간만료일', '만료일자'],
};

// 별칭에 없을 때 쓰는 키워드 규칙(위에서부터 먼저 맞는 것). 너무 넓게 잡지 않도록 순서가 중요하다.
export const COLUMN_KEYWORDS = [
  [/expir|valid|만료|유효/, 'idExpiry'],
  [/issu|발급|발행/, 'idIssuer'],
  [/(place|pl).*birth|birth.*place|출생지/, 'pob'],
  [/birth|dob|생년|출생일/, 'dob'],
  [/passport|seaman|여권|수첩|(doc|id).*(no|num)|신분증번호/, 'idNumber'],
  [/type|nature|종류/, 'idType'],
  [/surname|family|last|성씨/, 'familyName'],
  [/given|first|forename|이름/, 'givenNames'],
  [/rank|rating|position|직급|직책/, 'rank'],
  [/national|citizen|국적/, 'nationality'],
  [/sex|gender|성별/, 'gender'],
];

export const HEADER_ALIASES = {
  shipName: ['nameofship', 'shipname', 'shipsname', 'vessel', 'vesselname', 'ship', 'nameofvessel', '선명', '선박명'],
  imo: ['imonumber', 'imono', 'imo', 'imo번호'],
  callSign: ['callsign', 'callsignal', '호출부호', '호출신호'],
  voyage: ['voyagenumber', 'voyageno', 'voyno', 'voyage', 'voy', '항차'],
  port: ['portofarrivaldeparture', 'portofarrival', 'portofdeparture', 'port', 'arrivalport', '입항지', '입출항지', '항구', '도착항'],
  date: ['dateofarrivaldeparture', 'dateofarrival', 'dateofdeparture', 'arrivaldate', 'eta', 'ata', 'date', '입항일', '입항일자', '입출항일', '입항예정일'],
  flag: ['flagstateofship', 'flagstate', 'flag', '선적국', '선적'],
  lastPort: ['lastportofcall', 'lastport', 'previousport', 'portoforigin', '직전기항지', '전출항지', '전기항지'],
};

export function normHeader(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/^\s*\d+(\.\d+)?\s*[.)]?\s+/, '') // "7. Family name" → "family name"
    .replace(/['’`]/g, '')
    .replace(/[^0-9a-z가-힣]+/g, '');
}
