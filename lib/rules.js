// 오류 의심 규칙. 규칙 id·설명은 고정(화면·평가·확인서가 같은 id를 쓴다).
import { ISO_ALPHA3 } from './iso3166.js';
import { confusableFold, swapDayMonth } from './normalize.js';
import { FIELD } from './fields.js';

export const RULES = {
  R1: { id: 'R1', title: '문자 혼동', desc: '같은 사람으로 대응됐는데 신분증번호가 O↔0, I↔1, S↔5, B↔8, Z↔2 치환만으로 같아집니다.' },
  R2: { id: 'R2', title: '일·월 뒤바뀜', desc: '생년월일 또는 만료일이 일과 월을 바꾸면 이전 값과 같아집니다.' },
  R3: { id: 'R3', title: '성명 순서 뒤바뀜', desc: '성(Family name)과 이름(Given names)이 서로 바뀌었습니다.' },
  R4: { id: 'R4', title: '신분증 만료', desc: '신분증 만료일이 입출항일보다 이릅니다(입출항일 기준 이미 만료).' },
  R5: { id: 'R5', title: '중복 행', desc: '같은 사람(같은 신분증번호, 또는 같은 성명+생년월일)이 한 명부에 두 번 있습니다.' },
  R6: { id: 'R6', title: '누락·판독 불가', desc: '필수 항목이 비어 있거나 판독 불가 표시(???, #N/A 등)입니다.' },
  R7: { id: 'R7', title: '형식 위반', desc: '국적·발급국이 ISO 3166-1 alpha-3 코드가 아니거나, 생년월일이 합리 범위(입출항일 기준 만 16세 이상 75세 이하) 밖입니다.' },
  R8: { id: 'R8', title: '지시 미반영', desc: '수정 메일의 지시가 수정본에 반영되지 않았거나, 반영된 값이 지시와 다릅니다.' },
};

export const AGE_MIN = 16;
export const AGE_MAX = 75;
export const VALIDITY_RULES = new Set(['R4', 'R6', 'R7']);
export const PATTERN_RULES = new Set(['R1', 'R2', 'R3']);

const hit = (id, field, detail) => ({ id, field, title: RULES[id].title, detail });

export function ageAt(dobIso, refIso) {
  const [y, m, d] = dobIso.split('-').map(Number);
  const [ry, rm, rd] = refIso.split('-').map(Number);
  return ry - y - (rm < m || (rm === m && rd < d) ? 1 : 0);
}

// 값 자체의 유효성(R4, R6, R7). cell: parse 결과 셀, ctx.refDate: 입출항일(ISO)
export function validityHits(field, cell, ctx = {}) {
  const out = [];
  if (!cell || cell.status === 'nocolumn') return out;
  const req = FIELD[field]?.required;
  if (cell.status === 'unreadable' || (cell.status === 'empty' && req)) {
    out.push(hit('R6', field, cell.status === 'empty' ? '빈칸' : `판독 불가 표시 "${cell.raw.trim()}"`));
    return out;
  }
  if (cell.status !== 'ok') return out;
  if ((field === 'nationality' || field === 'idIssuer') && !ISO_ALPHA3.has(cell.value)) {
    out.push(hit('R7', field, `"${cell.value}"는 ISO 3166-1 alpha-3 코드가 아님`));
  }
  if (field === 'dob' && ctx.refDate) {
    const age = ageAt(cell.value, ctx.refDate);
    if (age < AGE_MIN || age > AGE_MAX) out.push(hit('R7', field, `입출항일 기준 만 ${age}세 (범위 ${AGE_MIN}~${AGE_MAX}세 밖)`));
  }
  if (field === 'idExpiry' && ctx.refDate && cell.value < ctx.refDate) {
    out.push(hit('R4', field, `만료일 ${cell.value} < 입출항일 ${ctx.refDate}`));
  }
  return out;
}

// 변경 모양으로 보는 오기 패턴(R1, R2, R3). before/after: 셀, rowA/rowB: 대응된 두 행
export function patternHits(field, before, after, rowA, rowB) {
  const out = [];
  if (before.status !== 'ok' || after.status !== 'ok') return out;
  if (field === 'idNumber' && before.value !== after.value && confusableFold(before.value) === confusableFold(after.value)) {
    out.push(hit('R1', field, `${before.value} → ${after.value}: 혼동 문자 치환만 다름`));
  }
  if ((field === 'dob' || field === 'idExpiry') && swapDayMonth(before.value) === after.value) {
    out.push(hit('R2', field, `${before.value} → ${after.value}: 일·월 교환과 같음`));
  }
  if (field === 'familyName' || field === 'givenNames') {
    const fa = rowA.cells.familyName, ga = rowA.cells.givenNames, fb = rowB.cells.familyName, gb = rowB.cells.givenNames;
    if ([fa, ga, fb, gb].every((c) => c.status === 'ok') && fa.value === gb.value && ga.value === fb.value && fa.value !== ga.value) {
      out.push(hit('R3', field, `성 "${fa.value}" ↔ 이름 "${ga.value}" 교환`));
    }
  }
  return out;
}

export function duplicateHit(dup) {
  return hit('R5', null, `${dup.of.line}행과 같은 사람 (${dup.by === 'idNumber' ? '신분증번호 일치' : '성명+생년월일 일치'})`);
}
