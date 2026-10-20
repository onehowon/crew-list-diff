// 입력 표(CSV/TSV/엑셀 붙여넣기)를 FAL 5 항목으로 정규화한다.
// 모든 셀에 원문 위치(sourceId, row=원문 줄 번호, col=열 번호, raw)를 보존한다.
import { ROW_FIELDS, FIELD_KEYS, COLUMN_ALIASES, COLUMN_KEYWORDS, HEADER_ALIASES, normHeader } from './fields.js';
import { normValue, inferDateOrder, parseDate, normSpace, normCountry } from './normalize.js';

const ALIAS_TO_FIELD = new Map();
for (const [field, list] of Object.entries(COLUMN_ALIASES)) for (const a of list) ALIAS_TO_FIELD.set(a, field);
const HEADER_ALIAS_TO_FIELD = new Map();
for (const [field, list] of Object.entries(HEADER_ALIASES)) for (const a of list) HEADER_ALIAS_TO_FIELD.set(a, field);

export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 40);
  const score = (d) => lines.reduce((s, l) => s + (l.split(d).length - 1), 0);
  const cands = ['\t', ';', ','].map((d) => [d, score(d)]).sort((a, b) => b[1] - a[1]);
  return cands[0][1] > 0 ? cands[0][0] : ',';
}

// RFC 4180 수준의 CSV 분리(따옴표 안 구분자·줄바꿈 허용). 각 행에 원문 줄 번호를 붙인다.
export function splitRows(text, delim) {
  const rows = [];
  let row = [], cell = '', q = false, line = 1, rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else { if (c === '\n') line++; cell += c; }
      continue;
    }
    if (c === '"' && cell.trim() === '') { q = true; cell = ''; continue; }
    if (c === delim) { row.push(cell); cell = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(cell); rows.push({ line: rowLine, cells: row }); row = []; cell = ''; line++; rowLine = line; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push({ line: rowLine, cells: row }); }
  return rows;
}

export function mapColumn(header) {
  const h = normHeader(header);
  if (!h) return { field: null, how: null };
  if (ALIAS_TO_FIELD.has(h)) return { field: ALIAS_TO_FIELD.get(h), how: 'alias' };
  for (const [re, field] of COLUMN_KEYWORDS) if (re.test(h)) return { field, how: 'keyword' };
  return { field: null, how: null };
}

function mapHeaderKey(k) {
  const h = normHeader(k);
  return HEADER_ALIAS_TO_FIELD.get(h) || null;
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const fields = new Set(rows[i].cells.map((c) => mapColumn(c).field).filter((f) => f && f !== 'no'));
    if (fields.size >= 5) return i;
  }
  return -1;
}

function parsePreamble(rows, sourceId) {
  const header = {};
  for (const r of rows) {
    const cells = r.cells.map((c) => normSpace(c));
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c) continue;
      if (/^(arrival|departure|입항|출항)$/i.test(c)) { header.direction = { value: /^(departure|출항)$/i.test(c) ? 'Departure' : 'Arrival', raw: c, row: r.line, col: i + 1, sourceId }; continue; }
      let key = c, val = null, col = i + 1;
      const m = c.match(/^([^:：]{2,40})[:：]\s*(.*)$/);
      if (m) { key = m[1]; val = m[2]; }
      const field = mapHeaderKey(key);
      if (!field) continue;
      if (!val) {
        const j = cells.findIndex((x, k) => k > i && x);
        if (j < 0) continue;
        val = cells[j]; col = j + 1; i = j;
      }
      header[field] = { value: val, raw: val, row: r.line, col, sourceId };
    }
  }
  if (header.date) header.date.value = parseDate(header.date.raw) || '';
  if (header.flag) header.flag.value = normCountry(header.flag.raw);
  return header;
}

export function parseCrewList(text, sourceId = 'A') {
  text = String(text ?? '').replace(/^﻿/, '');
  const warnings = [];
  const delim = detectDelimiter(text);
  const rows = splitRows(text, delim);
  const lines = text.split(/\r?\n/);
  const hi = findHeaderRow(rows);
  if (hi < 0) {
    return { sourceId, delim, header: {}, columns: [], rows: [], lines, warnings: ['표 머리글(성·이름·국적 등)을 찾지 못했습니다'], ok: false };
  }
  const header = parsePreamble(rows.slice(0, hi), sourceId);
  const used = new Set();
  const columns = rows[hi].cells.map((h, idx) => {
    let { field, how } = mapColumn(h);
    if (field && used.has(field)) { warnings.push(`같은 항목으로 보이는 열이 둘 이상: "${normSpace(h)}" (${idx + 1}열) 무시`); field = null; how = null; }
    if (field) used.add(field);
    else if (normSpace(h)) warnings.push(`알 수 없는 열 머리글: "${normSpace(h)}" (${idx + 1}열)`);
    return { col: idx + 1, header: normSpace(h), field, how };
  });
  for (const f of FIELD_KEYS) if (!used.has(f)) warnings.push(`FAL 5 항목 열 없음: ${f}`);
  const fieldCol = Object.fromEntries(columns.filter((c) => c.field).map((c) => [c.field, c.col - 1]));

  const dataRows = rows.slice(hi + 1).filter((r) => {
    const joined = r.cells.join(' ');
    if (!joined.trim()) return false;
    if (/signature|서명/i.test(joined)) return false;
    return FIELD_KEYS.some((f) => fieldCol[f] != null && normSpace(r.cells[fieldCol[f]]));
  });
  const dateOrder = {};
  for (const f of ROW_FIELDS.filter((x) => x.date)) {
    if (fieldCol[f.key] == null) continue;
    dateOrder[f.key] = inferDateOrder(dataRows.map((r) => r.cells[fieldCol[f.key]] ?? ''));
  }
  const out = dataRows.map((r, index) => {
    const cells = {};
    for (const f of FIELD_KEYS) {
      const ci = fieldCol[f];
      const raw = ci == null ? '' : r.cells[ci] ?? '';
      const nv = normValue(f, raw, { order: dateOrder[f] });
      cells[f] = { raw, value: nv.value, status: ci == null ? 'nocolumn' : nv.status, row: r.line, col: ci == null ? null : ci + 1, sourceId };
    }
    const noCol = columns.find((c) => c.field === 'no');
    return { index, line: r.line, no: noCol ? normSpace(r.cells[noCol.col - 1]) : String(index + 1), cells, sourceId };
  });
  return { sourceId, delim, header, columns, rows: out, lines, warnings, dateOrder, headerLine: rows[hi].line, ok: true };
}

export function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function cellRef(cell) {
  if (!cell) return '';
  return `${cell.sourceId === 'A' ? '최초본' : '수정본'} ${cell.row}행 ${cell.col ? colLetter(cell.col) + '열' : '(열 없음)'}`;
}
