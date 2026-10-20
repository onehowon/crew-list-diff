// 대조·분류 엔진: 최초본·수정본·수정 메일 → 변경 목록(3단계 분류 + 근거).
import { parseCrewList, cellRef } from './parse.js';
import { FIELD_KEYS, FIELD } from './fields.js';
import { normSpace } from './normalize.js';
import { findDuplicates, matchPersons, personKey } from './match.js';
import { parseNotice } from './notice.js';
import { validityHits, patternHits, duplicateHit } from './rules.js';
import { classifyItem, unmetDirectives } from './classify.js';

const cellView = (c) => (c ? { raw: c.raw, value: c.value, status: c.status, sourceId: c.sourceId, row: c.row, col: c.col, ref: cellRef(c), inferred: !!c.inferred } : null);

// 열 단위 서식 경보: 머리글도 값 모양도 알 수 없는 열, 또는 값의 절반 이상을 해석하지 못한 열.
// 셀마다 R6을 띄우지 않고 열당 1건으로 묶는다. 그 열의 원문이 바뀐 셀은 '확인 필요'로 남겨 놓치지 않는다.
export const COLUMN_ALERT_RATIO = 0.5;
export function columnAlerts(P) {
  const out = [];
  for (const c of P.columns) {
    if (!c.field && c.header && c.shape !== '순번') out.push({ kind: 'unmapped', sourceId: P.sourceId, col: c.col, header: c.header, field: null, detail: '머리글을 인식하지 못했고 값 모양으로도 추정하지 못함 — 이 열은 대조하지 않음' });
  }
  if (P.rows.length >= 2) {
    for (const f of FIELD_KEYS) {
      const st = P.rows.map((r) => r.cells[f].status);
      if (st[0] === 'nocolumn') continue;
      const bad = st.filter((x) => x === 'unreadable' || (x === 'empty' && FIELD[f].required)).length;
      if (bad / st.length >= COLUMN_ALERT_RATIO) {
        const c = P.rows[0].cells[f];
        out.push({ kind: 'unreadable', sourceId: P.sourceId, col: c.col, header: P.columns[c.col - 1]?.header ?? '', field: f, ratio: bad / st.length, detail: `값 ${bad}/${st.length}개를 해석하지 못함 — 서식 확인 필요(원문이 바뀐 칸은 확인 필요로 표시)` });
      }
    }
  }
  return out;
}

function personLabel(row) {
  if (!row) return '';
  const c = row.cells;
  const name = [c.familyName.raw, c.givenNames.raw].map((x) => String(x).trim()).filter(Boolean).join(', ');
  return name || `${row.sourceId === 'A' ? '최초본' : '수정본'} ${row.line}행`;
}

// 최장 증가 부분수열 길이(행 순서 이동 인원 계산용)
function lisLength(arr) {
  const tails = [];
  for (const x of arr) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tails[m] < x) lo = m + 1; else hi = m; }
    tails[lo] = x;
  }
  return tails.length;
}

export function compareCrewLists({ a, b, mail = '' }) {
  const A = typeof a === 'string' ? parseCrewList(a, 'A') : a;
  const B = typeof b === 'string' ? parseCrewList(b, 'B') : b;
  const refDate = B.header.date?.value || A.header.date?.value || null;
  const ctx = { refDate };
  const dupA = findDuplicates(A.rows);
  const dupB = findDuplicates(B.rows);
  const dupSetA = new Set(dupA.map((d) => d.row));
  const dupSetB = new Set(dupB.map((d) => d.row));
  const rowsA = A.rows.filter((r) => !dupSetA.has(r));
  const rowsB = B.rows.filter((r) => !dupSetB.has(r));
  const M = matchPersons(rowsA, rowsB);
  // 메일 속 숫자 날짜(03/05/1990 등)는 수정본 명부에서 추정한 일·월 순서를 따른다
  const notice = parseNotice(mail, [...A.rows, ...B.rows], { dateOrder: B.dateOrder?.dob || B.dateOrder?.idExpiry || 'DMY' });
  const directives = notice.directives.map((d) => ({ ...d, used: false }));

  // 열 단위 경보(최초본·수정본 합쳐 같은 열은 1건)
  const alerts = [];
  for (const al of [...columnAlerts(A), ...columnAlerts(B)]) {
    const same = alerts.find((x) => x.kind === al.kind && x.header === al.header && x.field === al.field);
    if (same) same.sources.push(al.sourceId); else alerts.push({ ...al, sources: [al.sourceId] });
  }
  const alertFields = new Set(alerts.filter((x) => x.field).map((x) => x.field));
  const vh = (f, cell) => (alertFields.has(f) ? [] : validityHits(f, cell, ctx));
  const rawKey = (c) => normSpace(c.raw).toUpperCase();

  const items = [];
  const cosmetic = [];
  for (const p of M.pairs) {
    for (const f of FIELD_KEYS) {
      const ca = p.a.cells[f], cb = p.b.cells[f];
      // 한쪽 버전에서만 열을 인식한 항목은 대조하지 않는다(열 미인식은 파서 경고로 보여 줌)
      if (ca.status === 'nocolumn' || cb.status === 'nocolumn') continue;
      if (alertFields.has(f)) {
        // 해석할 수 없는 서식의 열: 원문 문자열로만 비교
        if (rawKey(ca) === rawKey(cb)) { if (ca.raw !== cb.raw) cosmetic.push({ field: f, rowA: p.a, rowB: p.b, before: cellView(ca), after: cellView(cb), person: personLabel(p.b) }); continue; }
        items.push({ kind: 'modify', field: f, rowA: p.a, rowB: p.b, match: p, before: cellView(ca), after: cellView(cb), rules: [], formatAlert: true });
        continue;
      }
      const same = ca.status === cb.status && ca.value === cb.value;
      if (same) {
        if (ca.raw !== cb.raw) cosmetic.push({ field: f, rowA: p.a, rowB: p.b, before: cellView(ca), after: cellView(cb), person: personLabel(p.b) });
        const hits = vh(f, cb);
        if (hits.length) items.push({ kind: 'standing', field: f, rowA: p.a, rowB: p.b, match: p, before: cellView(ca), after: cellView(cb), rules: hits });
        continue;
      }
      const rules = [...vh(f, cb), ...patternHits(f, ca, cb, p.a, p.b)];
      items.push({ kind: 'modify', field: f, rowA: p.a, rowB: p.b, match: p, before: cellView(ca), after: cellView(cb), rules });
    }
  }
  for (const r of M.onlyB) {
    const rules = FIELD_KEYS.flatMap((f) => vh(f, r.cells[f]));
    items.push({ kind: 'add', field: null, rowA: null, rowB: r, rules, after: { ref: `수정본 ${r.line}행` } });
  }
  for (const r of M.onlyA) items.push({ kind: 'remove', field: null, rowA: r, rowB: null, rules: [], before: { ref: `최초본 ${r.line}행` } });
  for (const d of dupB) items.push({ kind: 'duplicate', field: null, rowA: null, rowB: d.row, dupOf: d.of, rules: [duplicateHit(d)], after: { ref: `수정본 ${d.row.line}행` } });

  for (const it of items) classifyItem(it, directives);
  items.push(...unmetDirectives(directives, { rowsA, rowsB: B.rows, alertFields }));

  // 근거 첨부와 표시용 이름
  items.forEach((it, i) => {
    it.id = `C${String(i + 1).padStart(3, '0')}`;
    it.person = personLabel(it.rowB || it.rowA) || (it.directive ? `메일 ${it.directive.line}번째 줄` : '');
    it.personKey = it.rowB ? personKey(it.rowB) : it.rowA ? personKey(it.rowA) : null;
    it.evidence = {
      source: [it.rowA && { sourceId: 'A', line: it.rowA.line, col: it.before?.col ?? null }, it.rowB && { sourceId: 'B', line: it.rowB.line, col: it.after?.col ?? null }].filter(Boolean),
      rules: (it.rules || []).map((r) => r.id),
      directive: it.directive ? { line: it.directive.line, start: it.directive.start, end: it.directive.end } : null,
      inferredColumn: !!(it.after?.inferred || it.before?.inferred),
      formatAlert: !!it.formatAlert,
    };
  });

  const order = M.pairs.slice().sort((x, y) => x.b.index - y.b.index).map((p) => p.a.index);
  const moved = order.length - lisLength(order);
  const summary = { expected: 0, check: 0, suspect: 0, cosmetic: cosmetic.length, rowsMoved: moved };
  for (const it of items) summary[it.class]++;

  return {
    A, B, refDate, directives, noticeWarnings: notice.warnings, pairs: M.pairs, items, cosmetic, summary, columnAlerts: alerts,
    duplicatesA: dupA,
    totalCells: B.rows.length * FIELD_KEYS.length,
  };
}
