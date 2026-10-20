// 변경마다 3단계 분류.
//   expected 예상된 변경: 메일 지시와 연결된 경우에만(지시 문장 위치를 근거로 첨부)
//   suspect  오류 의심: R1~R8 중 하나라도 해당(규칙 id를 근거로 첨부)
//   check    확인 필요: 그 밖의 모든 실질 변경. 근거가 부족하면 기본값
// 우선순위:
//   1) 값 자체가 잘못된 규칙(R4·R6·R7)은 메일 지시가 있어도 suspect
//   2) 메일 지시가 같은 사람·같은 항목을 가리키고 지시 값과 수정본 값이 같으면 expected
//      (R1~R3 모양이어도 메일이 그 값을 명시했으면 정상 정정으로 본다. 규칙은 참고로 남김)
//   3) 지시 값과 수정본 값이 다르면 suspect(R8)
//   4) R1~R3 모양이면 suspect
//   5) 나머지 check. 지시 문장은 있는데 값을 해석하지 못했으면 check(지시 문장 첨부)
import { RULES, VALIDITY_RULES, PATTERN_RULES } from './rules.js';
import { personKey } from './match.js';

export const CLASS_LABEL = { expected: '예상된 변경', check: '확인 필요', suspect: '오류 의심', cosmetic: '표기만 다름' };

const ref = (d) => ({ id: d.id, line: d.line, start: d.start, end: d.end, text: d.text, type: d.type });
const r8 = (detail) => ({ id: 'R8', field: null, title: RULES.R8.title, detail });

function findDirective(directives, item) {
  const keys = new Set([item.rowA && personKey(item.rowA), item.rowB && personKey(item.rowB)].filter(Boolean));
  const ok = (d) => d.personKey && keys.has(d.personKey);
  if (item.kind === 'add') return directives.find((d) => d.type === 'sign_on' && ok(d));
  if (item.kind === 'remove') return directives.find((d) => d.type === 'sign_off' && ok(d));
  if (item.kind === 'modify') {
    return directives.find((d) => ok(d) && d.field === item.field && (d.type === 'correction' || d.type === 'rank_change'));
  }
  return null;
}

export function classifyItem(item, directives) {
  const rules = item.rules || [];
  const validity = rules.filter((r) => VALIDITY_RULES.has(r.id) || r.id === 'R5');
  const pattern = rules.filter((r) => PATTERN_RULES.has(r.id));
  const d = item.kind === 'modify' || item.kind === 'add' || item.kind === 'remove' ? findDirective(directives, item) : null;
  if (d) { d.used = true; item.directive = ref(d); }
  if (validity.length) { item.class = 'suspect'; item.reason = '규칙 위반'; return item; }
  if (d) {
    if (item.kind !== 'modify') { item.class = 'expected'; item.reason = '메일 지시와 일치'; return item; }
    if (d.value != null && d.value !== '') {
      if (d.value === item.after.value) {
        item.class = 'expected';
        item.reason = '메일 지시 값과 일치';
        if (pattern.length) { item.notes = pattern; item.rules = rules.filter((r) => !PATTERN_RULES.has(r.id)); }
        return item;
      }
      item.rules = [...rules, r8(`메일 지시 값 "${d.valueRaw}" ≠ 수정본 값 "${item.after.raw.trim()}"`)];
      item.class = 'suspect';
      item.reason = '지시 값과 다름';
      return item;
    }
    if (pattern.length) { item.class = 'suspect'; item.reason = '규칙 위반'; return item; }
    item.class = 'check';
    item.reason = '지시 문장은 있으나 값을 해석하지 못함';
    return item;
  }
  if (pattern.length) { item.class = 'suspect'; item.reason = '규칙 위반'; return item; }
  item.class = 'check';
  item.reason = '연결된 지시·규칙 없음';
  return item;
}

// 어떤 변경과도 연결되지 않은 지시 → 반영 여부 확인
export function unmetDirectives(directives, ctx) {
  const out = [];
  for (const d of directives) {
    if (d.used) continue;
    const base = { kind: 'directive', field: d.field, directive: ref(d), rowA: null, rowB: null };
    const inB = d.personKey ? ctx.rowsB.find((r) => personKey(r) === d.personKey) : null;
    const inA = d.personKey ? ctx.rowsA.find((r) => personKey(r) === d.personKey) : null;
    let rule = null, cls = 'suspect', reason;
    if (d.ambiguous) { cls = 'check'; reason = '지시 대상이 여러 명으로 해석됨'; }
    else if (d.type === 'sign_off') {
      if (inB) rule = r8('하선 지시가 있으나 수정본에 그대로 있음');
      else { cls = 'check'; reason = '하선 지시 대상을 최초본에서 찾지 못함'; }
    } else if (d.type === 'sign_on') {
      if (!inB) rule = r8(`승선 지시가 있으나 수정본에 없음${d.nameInText ? ` (메일 표기: ${d.nameInText})` : ''}`);
      else { cls = 'check'; reason = '승선 지시 대상이 최초본에도 이미 있음'; }
    } else if (!d.field) { cls = 'check'; reason = '정정 지시의 대상 항목을 해석하지 못함'; }
    else if (!inB && !inA) rule = r8('지시 대상 인물을 명부에서 찾지 못함');
    else if (!inB) { cls = 'check'; reason = '지시 대상이 수정본에 없음'; }
    else rule = r8(`${d.type === 'rank_change' ? '직급 변경' : '정정'} 지시가 있으나 수정본 값이 그대로임`);
    out.push({ ...base, rowA: inA || null, rowB: inB || null, class: rule ? 'suspect' : cls, rules: rule ? [rule] : [], reason: rule ? '지시 미반영' : reason });
    d.used = true;
  }
  return out;
}
