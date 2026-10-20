// 변경된 항목 → 영향 받는 신고. 법령 문구는 근거자료/법령의 law.go.kr XML 원문에서 그대로 옮겼다
// (test/impact.test.mjs 가 원문 XML에 글자 그대로 있는지 대조한다).
// 이 도구는 신고를 전송하지 않는다. 담당자가 어떤 신고의 첨부 명부를 다시 확인해야 하는지 보여 줄 뿐이다.

export const LAWS = {
  immigration: {
    id: 'immigration',
    report: '출입국 출·입항보고(승무원명부 첨부)',
    agency: '지방출입국·외국인관서',
    law: '출입국관리법',
    article: '제75조제1항',
    version: '법률 제21857호, 2026. 8. 4. 공포, 2026. 10. 2. 시행 (law.go.kr XML)',
    xml: '출입국관리법.xml',
    quote: '출입국항이나 출입국항이 아닌 장소에 출ㆍ입항하는 선박등의 장이나 운수업자는 대통령령으로 정하는 사항을 적은 승무원명부와 승객명부를 첨부한 출ㆍ입항보고서를 지방출입국ㆍ외국인관서의 장에게 제출하여야 한다.',
  },
  customs: {
    id: 'customs',
    report: '세관 입항보고(승무원명부 첨부)',
    agency: '세관',
    law: '관세법',
    article: '제135조제1항',
    version: '법률 제21490호, 2026. 3. 24. 공포, 2026. 10. 2. 시행 (law.go.kr XML)',
    xml: '관세법.xml',
    quote: '선장이나 기장은 대통령령으로 정하는 사항이 적힌 선박용품 또는 항공기용품의 목록, 여객명부, 승무원명부, 승무원 휴대품목록과 적재화물목록을 첨부하여 관세청장이 정하는 바에 따라 세관장에게 입항보고를 하여야 하며',
    quoteNote: '조문 앞부분(국제무역선이 국제항에 입항하려는 때)과 단서는 생략, 원문은 law.go.kr 참고',
  },
  port: {
    id: 'port',
    report: '항만 외항선 출입신고(별지 제2호의2서식 승무원 명부 첨부)',
    agency: '지방해양수산청장, 시·도지사 또는 항만공사',
    law: '선박의 입항 및 출항 등에 관한 법률 시행규칙',
    article: '제3조제2항',
    version: '해양수산부령 제703호, 2024. 11. 13. 공포·시행 (law.go.kr XML)',
    xml: '선박입출항법_시행규칙.xml',
    quote: '법 제4조제1항에 따라 무역항의 수상구역등에 출입하려는 영 제2조제2호에 따른 외항선의 선장은 별지 제2호서식에 따른 외항선 출입신고서에 별지 제1호의2서식에 따른 승객 명부 및 별지 제2호의2서식에 따른 승무원 명부를 첨부하여 지방해양수산청장, 시ㆍ도지사 또는 항만공사에 제출하여야 한다.',
    formTitle: '승무원 명부 (CREW LIST)[입항(Arrival), 출항(Departure)((최초(Notice), 변경(Change), 최종(Final), 취소(Cancel))]',
  },
};

// 출입국관리법 제100조제1항제5호: 조건을 줄이지 않고 그대로 보여 준다(설계 고정 규칙 4).
export const IMMIGRATION_PENALTY = {
  law: '출입국관리법',
  article: '제100조제1항제5호',
  head: '다음 각 호의 어느 하나에 해당하는 자에게는 200만원 이하의 과태료를 부과한다.',
  quote: '과실로 인하여 제75조제1항(제70조제1항 및 제2항에서 준용하는 경우를 포함한다) 또는 제2항(제70조제1항 및 제2항에서 준용하는 경우를 포함한다)에 따른 출ㆍ입항보고를 하지 아니하거나 출ㆍ입항보고서의 국적, 성명, 성별, 생년월일, 여권번호에 관한 항목을 최근 1년 이내에 3회 이상 사실과 다르게 보고한 자',
  fields: ['nationality', 'familyName', 'givenNames', 'gender', 'dob', 'idNumber'],
  caution: '이 표시는 해당 항목이 바뀌었다는 뜻일 뿐, 과태료 대상이라는 판단이 아닙니다. 조건(과실, 최근 1년 이내 3회 이상 등)은 원문 그대로 확인하세요.',
};

// item: 엔진 변경 항목. 어떤 신고의 첨부 명부가 영향을 받는지
export function impactOf(item) {
  const reports = ['immigration', 'customs', 'port'];
  const wholeRow = item.kind === 'add' || item.kind === 'remove' || item.kind === 'duplicate' || item.kind === 'directive';
  const art100 = wholeRow || IMMIGRATION_PENALTY.fields.includes(item.field);
  return { reports, art100 };
}

export function impactSummary(items) {
  const out = { immigration: 0, customs: 0, port: 0, art100: 0 };
  for (const it of items) {
    const im = impactOf(it);
    for (const r of im.reports) out[r]++;
    if (im.art100) out.art100++;
  }
  return out;
}
