// 기준선 2종(분류 없음, 다르면 모두 경보).
//  기준선1 "엑셀식 행 대조": 같은 행 번호끼리 셀 문자열 비교(앞뒤 공백만 제거, 대소문자 구분).
//  기준선2 "신분증번호 키 대조": 신분증번호 원문 문자열(앞뒤 공백 제거)로 행을 맞춘 뒤 셀 문자열 비교.
// 열 대응은 본 엔진의 머리글 인식 결과를 그대로 빌려 준다(기준선에 유리한 가정. 엑셀이라면 사람이 열을 맞춘 상태).
// 반환: alarms = [{ rowA, rowB, field|null(행 전체) }]
import { parseCrewList } from '../lib/parse.js';
import { FIELD_KEYS } from '../lib/fields.js';
import { parseNotice } from '../lib/notice.js';
import { normValue } from '../lib/normalize.js';
import { personKey } from '../lib/match.js';

const raw = (row, f) => String(row.cells[f].raw ?? '').trim();

function diffRows(a, b) {
  const out = [];
  for (const f of FIELD_KEYS) {
    if (a.cells[f].status === 'nocolumn' && b.cells[f].status === 'nocolumn') continue;
    if (raw(a, f) !== raw(b, f)) out.push({ rowA: a, rowB: b, field: f });
  }
  return out;
}

export function baselineRowNumber(aText, bText) {
  const A = parseCrewList(aText, 'A'), B = parseCrewList(bText, 'B');
  const alarms = [];
  const n = Math.max(A.rows.length, B.rows.length);
  for (let i = 0; i < n; i++) {
    const a = A.rows[i], b = B.rows[i];
    if (a && b) alarms.push(...diffRows(a, b));
    else alarms.push({ rowA: a || null, rowB: b || null, field: null });
  }
  return { A, B, alarms };
}

export function baselineIdKey(aText, bText) {
  const A = parseCrewList(aText, 'A'), B = parseCrewList(bText, 'B');
  const alarms = [];
  const byId = new Map();
  for (const a of A.rows) { const k = raw(a, 'idNumber'); if (k && !byId.has(k)) byId.set(k, a); }
  const usedA = new Set();
  for (const b of B.rows) {
    const a = byId.get(raw(b, 'idNumber'));
    if (a && !usedA.has(a)) { usedA.add(a); alarms.push(...diffRows(a, b)); }
    else alarms.push({ rowA: null, rowB: b, field: null });
  }
  for (const a of A.rows) if (!usedA.has(a)) alarms.push({ rowA: a, rowB: null, field: null });
  return { A, B, alarms };
}

// 기준선3 "같은 입력 단순 대조": 기준선2(신분증번호 키 대조)에 본 엔진과 같은 메일 지시(같은 파서 결과)를 준다.
//  - 지시 대상 인물·항목의 값이 지시 값과 같으면 그 경보는 '지시로 설명됨'(개별 검토에서 제외, 일괄 승인 후보)
//  - 지시 대상 인물·항목의 값이 지시 값과 다르면 '지시 미반영' 경보 1건 추가
//  - 그 밖의 차이는 기준선2와 같이 모두 경보. 오류 규칙·표기 정규화·인물 대응 보정은 없음(지시 대상 찾기에만 엔진의 성명 정규화를 빌림).
// 엔진과 차이가 메일을 읽는지에서만 나오지 않도록, 메일 정보는 똑같이 주고 비교한다.
export function baselineIdKeyWithMail(aText, bText, mail) {
  const base = baselineIdKey(aText, bText);
  const { A, B } = base;
  const notice = parseNotice(mail, [...A.rows, ...B.rows], { dateOrder: B.dateOrder?.dob || B.dateOrder?.idExpiry || 'DMY' });
  const alarms = base.alarms.map((a) => ({ ...a }));
  for (const d of notice.directives) {
    // 승선 지시인데 그 사람을 어느 명부에서도 찾지 못함 → 승선이 반영되지 않음
    if (!d.personKeys.length) { if (d.type === 'sign_on') alarms.push({ rowA: null, rowB: null, field: null, directiveLine: d.line }); continue; }
    const rowB = B.rows.find((r) => d.personKeys.includes(personKey(r)));
    if (d.field && d.value != null) {
      const v = rowB ? normValue(d.field, rowB.cells[d.field].raw).value : null;
      const al = alarms.find((a) => a.rowB === rowB && a.field === d.field);
      if (rowB && v === d.value) { if (al) al.explained = d.line; }
      else alarms.push({ rowA: null, rowB: rowB || null, field: d.field, directiveLine: d.line });
    } else if (d.type === 'sign_on') {
      const al = alarms.find((a) => a.rowB === rowB && a.rowA === null && a.field === null);
      if (al) al.explained = d.line; else alarms.push({ rowA: null, rowB: null, field: null, directiveLine: d.line });
    } else if (d.type === 'sign_off') {
      const inB = !!rowB;
      const al = alarms.find((a) => a.rowB === null && a.rowA && d.personKeys.includes(personKey(a.rowA)));
      if (!inB && al) al.explained = d.line; else if (inB) alarms.push({ rowA: null, rowB, field: null, directiveLine: d.line });
    }
  }
  return { A, B, alarms };
}
