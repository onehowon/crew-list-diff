// 대조·분류 엔진: 최초본·수정본·수정 메일 → 변경 목록(3단계 분류 + 근거).
import { parseCrewList, cellRef } from './parse.js';
import { FIELD_KEYS } from './fields.js';
import { findDuplicates, matchPersons, personKey } from './match.js';
import { parseNotice } from './notice.js';
import { validityHits, patternHits, duplicateHit } from './rules.js';
import { classifyItem, unmetDirectives } from './classify.js';

const cellView = (c) => (c ? { raw: c.raw, value: c.value, status: c.status, sourceId: c.sourceId, row: c.row, col: c.col, ref: cellRef(c) } : null);

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
  const notice = parseNotice(mail, [...A.rows, ...B.rows]);
  const directives = notice.directives.map((d) => ({ ...d, used: false }));

  const items = [];
  const cosmetic = [];
  for (const p of M.pairs) {
    for (const f of FIELD_KEYS) {
      const ca = p.a.cells[f], cb = p.b.cells[f];
      if (ca.status === 'nocolumn' && cb.status === 'nocolumn') continue;
      const same = ca.status === cb.status && ca.value === cb.value;
      if (same) {
        if (ca.raw !== cb.raw) cosmetic.push({ field: f, rowA: p.a, rowB: p.b, before: cellView(ca), after: cellView(cb), person: personLabel(p.b) });
        const hits = validityHits(f, cb, ctx);
        if (hits.length) items.push({ kind: 'standing', field: f, rowA: p.a, rowB: p.b, match: p, before: cellView(ca), after: cellView(cb), rules: hits });
        continue;
      }
      const rules = [...validityHits(f, cb, ctx), ...patternHits(f, ca, cb, p.a, p.b)];
      items.push({ kind: 'modify', field: f, rowA: p.a, rowB: p.b, match: p, before: cellView(ca), after: cellView(cb), rules });
    }
  }
  for (const r of M.onlyB) {
    const rules = FIELD_KEYS.flatMap((f) => validityHits(f, r.cells[f], ctx));
    items.push({ kind: 'add', field: null, rowA: null, rowB: r, rules, after: { ref: `수정본 ${r.line}행` } });
  }
  for (const r of M.onlyA) items.push({ kind: 'remove', field: null, rowA: r, rowB: null, rules: [], before: { ref: `최초본 ${r.line}행` } });
  for (const d of dupB) items.push({ kind: 'duplicate', field: null, rowA: null, rowB: d.row, dupOf: d.of, rules: [duplicateHit(d)], after: { ref: `수정본 ${d.row.line}행` } });

  for (const it of items) classifyItem(it, directives);
  items.push(...unmetDirectives(directives, { rowsA, rowsB: B.rows }));

  // 근거 첨부와 표시용 이름
  items.forEach((it, i) => {
    it.id = `C${String(i + 1).padStart(3, '0')}`;
    it.person = personLabel(it.rowB || it.rowA) || (it.directive ? `메일 ${it.directive.line}번째 줄` : '');
    it.personKey = it.rowB ? personKey(it.rowB) : it.rowA ? personKey(it.rowA) : null;
    it.evidence = {
      source: [it.rowA && { sourceId: 'A', line: it.rowA.line, col: it.before?.col ?? null }, it.rowB && { sourceId: 'B', line: it.rowB.line, col: it.after?.col ?? null }].filter(Boolean),
      rules: (it.rules || []).map((r) => r.id),
      directive: it.directive ? { line: it.directive.line, start: it.directive.start, end: it.directive.end } : null,
    };
  });

  const order = M.pairs.slice().sort((x, y) => x.b.index - y.b.index).map((p) => p.a.index);
  const moved = order.length - lisLength(order);
  const summary = { expected: 0, check: 0, suspect: 0, cosmetic: cosmetic.length, rowsMoved: moved };
  for (const it of items) summary[it.class]++;

  return {
    A, B, refDate, directives, noticeWarnings: notice.warnings, pairs: M.pairs, items, cosmetic, summary,
    duplicatesA: dupA,
    totalCells: B.rows.length * FIELD_KEYS.length,
  };
}
