// 입력 표(CSV/TSV/엑셀 붙여넣기)를 FAL 5 항목으로 정규화한다.
// 모든 셀에 원문 위치(sourceId, row=원문 줄 번호, col=열 번호, raw)를 보존한다.
import { ROW_FIELDS, FIELD_KEYS, COLUMN_ALIASES, COLUMN_KEYWORDS, HEADER_ALIASES, normHeader } from './fields.js';
import { normValue, inferDateOrder, parseDate, normSpace, normCountry, cellStatus, normRank, RANK_CANON, normIdType, normGender } from './normalize.js';
import { ISO_ALPHA3 } from './iso3166.js';

const FAL_ORDER = ROW_FIELDS.map((f) => f.key);
const share = (vals, pred) => (vals.length ? vals.filter(pred).length / vals.length : 0);

// 머리글을 인식하지 못한 열을 값 모양·열 순서로 추정 매핑한다(추정임을 how='inferred'로 표시).
// 모양: 날짜 / ISO 국가 코드 / 성별 / 신분증번호 / 신분증 종류 / 직급 / 이름·지명 글자. 확신이 없으면 매핑하지 않는다.
export function inferColumns(columns, bodyRows, refYear) {
  const used = new Set(columns.filter((c) => c.field).map((c) => c.field));
  const missing = (f) => !used.has(f);
  const unmapped = columns.filter((c) => !c.field);
  const valsOf = (c) => bodyRows.map((r) => normSpace(r.cells[c.col - 1])).filter((v) => cellStatus(v) === 'ok');
  const assign = (c, field, shape) => { c.field = field; c.how = 'inferred'; c.shape = shape; used.add(field); };
  const ref = refYear || new Date().getUTCFullYear();
  const dateCols = [];
  for (const c of unmapped) {
    const v = valsOf(c);
    if (v.length < 2) continue;
    if (share(v, (x) => /^\d{1,4}$/.test(x)) >= 0.9) { c.shape = '순번'; continue; }
    const dob = share(v, (x) => { const d = parseDate(x, 'DMY', { kind: 'dob', refYear: ref }); return d && ref - +d.slice(0, 4) >= 16; });
    const exp = share(v, (x) => { const d = parseDate(x, 'DMY', { kind: 'expiry' }); return d && +d.slice(0, 4) >= ref - 1; });
    if (Math.max(dob, exp) >= 0.6) { dateCols.push({ c, dob, exp }); continue; }
    const U = v.map((x) => x.toUpperCase());
    if (share(U, (x) => ISO_ALPHA3.has(x)) >= 0.6) {
      const f = ['nationality', 'idIssuer'].find(missing);
      if (f) assign(c, f, 'ISO 국가 코드');
      continue;
    }
    if (missing('gender') && share(v, (x) => ['M', 'F'].includes(normGender(x))) >= 0.8) { assign(c, 'gender', '성별 값'); continue; }
    if (missing('idType') && share(v, (x) => ['PASSPORT', 'SEAMAN BOOK'].includes(normIdType(x))) >= 0.6) { assign(c, 'idType', '신분증 종류 값'); continue; }
    if (missing('rank') && share(v, (x) => RANK_CANON.includes(normRank(x))) >= 0.6) { assign(c, 'rank', '직급 값'); continue; }
    if (missing('idNumber') && share(U, (x) => /^[A-Z0-9]{6,12}$/.test(x) && /\d/.test(x) && /[A-Z]/.test(x)) >= 0.6) { assign(c, 'idNumber', '신분증번호 모양'); continue; }
    if (share(v, (x) => /^[A-Za-z][A-Za-z '.\-]*$/.test(x)) >= 0.8) c.shape = '글자';
  }
  // 날짜 열: 하나만 비었으면 그것, 둘 다 비었으면 점수(생년월일·만료일다움) → 같으면 앞 열을 생년월일로
  dateCols.sort((x, y) => x.c.col - y.c.col);
  for (const d of dateCols) {
    const free = ['dob', 'idExpiry'].filter(missing);
    if (!free.length) break;
    let f = free[0];
    if (free.length === 2) f = d.exp > d.dob ? 'idExpiry' : 'dob';
    assign(d.c, f, '날짜');
  }
  // 글자 열: 앞뒤로 인식된 열의 FAL 순서 사이에 들어가는 빈 항목(성·이름·출생지)
  for (const c of columns.filter((x) => !x.field && x.shape === '글자')) {
    const idx = (x) => FAL_ORDER.indexOf(x.field);
    const prev = columns.filter((x) => x.col < c.col && x.field && idx(x) >= 0).at(-1);
    const next = columns.find((x) => x.col > c.col && x.field && idx(x) >= 0);
    const lo = prev ? idx(prev) : -1, hi = next ? idx(next) : FAL_ORDER.length;
    const cand = ['familyName', 'givenNames', 'pob'].filter(missing);
    const f = cand.find((k) => FAL_ORDER.indexOf(k) > lo && FAL_ORDER.indexOf(k) < hi);
    if (f) assign(c, f, '글자(열 순서)');
  }
  return columns;
}

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
  if (header.date) header.date.value = parseDate(header.date.raw, 'DMY', { kind: 'event' }) || '';
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
    return { col: idx + 1, header: normSpace(h), field, how };
  });
  const body = rows.slice(hi + 1).filter((r) => r.cells.join('').trim() && !/signature|서명/i.test(r.cells.join(' ')));
  const preYear = header.date?.value ? +header.date.value.slice(0, 4) : undefined;
  inferColumns(columns, body, preYear);
  for (const c of columns) {
    if (c.how === 'inferred') warnings.push(`추정 매핑: "${c.header}" (${c.col}열) → ${c.field} (값 모양: ${c.shape})`);
    else if (!c.field && c.header && c.shape !== '순번') warnings.push(`알 수 없는 열 머리글: "${c.header}" (${c.col}열)`);
  }
  for (const f of FIELD_KEYS) if (!columns.some((c) => c.field === f)) warnings.push(`FAL 5 항목 열 없음: ${f}`);
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
  // 머리말의 입출항일도 명부 날짜 열에서 추정한 일·월 순서로 해석한다
  const order = dateOrder.idExpiry || dateOrder.dob;
  if (header.date && order) header.date.value = parseDate(header.date.raw, order, { kind: 'event' }) || '';
  const refYear = header.date?.value ? +header.date.value.slice(0, 4) : undefined;
  const out = dataRows.map((r, index) => {
    const cells = {};
    for (const f of FIELD_KEYS) {
      const ci = fieldCol[f];
      const raw = ci == null ? '' : r.cells[ci] ?? '';
      const nv = normValue(f, raw, { order: dateOrder[f], refYear });
      cells[f] = { raw, value: nv.value, status: ci == null ? 'nocolumn' : nv.status, row: r.line, col: ci == null ? null : ci + 1, sourceId, inferred: ci != null && columns[ci].how === 'inferred' };
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
