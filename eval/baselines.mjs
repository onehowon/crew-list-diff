// 기준선 2종(분류 없음, 다르면 모두 경보).
//  기준선1 "엑셀식 행 대조": 같은 행 번호끼리 셀 문자열 비교(앞뒤 공백만 제거, 대소문자 구분).
//  기준선2 "신분증번호 키 대조": 신분증번호 원문 문자열(앞뒤 공백 제거)로 행을 맞춘 뒤 셀 문자열 비교.
// 열 대응은 본 엔진의 머리글 인식 결과를 그대로 빌려 준다(기준선에 유리한 가정. 엑셀이라면 사람이 열을 맞춘 상태).
// 반환: alarms = [{ rowA, rowB, field|null(행 전체) }]
import { parseCrewList } from '../lib/parse.js';
import { FIELD_KEYS } from '../lib/fields.js';

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
