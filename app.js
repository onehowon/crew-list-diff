// CrewDiff 데모 화면. 엔진(lib/)을 브라우저에서 그대로 돌린다. 서버·로그인·설치 없음.
import { SCENARIOS } from './data/scenarios.js?v=202610220142';
import { compareCrewLists } from './lib/engine.js?v=202610220142';
import { ROW_FIELDS, HEADER_FIELDS, FIELD, fieldLabel } from './lib/fields.js?v=202610220142';
import { colLetter, splitRows } from './lib/parse.js?v=202610220142';
import { CLASS_LABEL } from './lib/classify.js?v=202610220142';
import { RULES } from './lib/rules.js?v=202610220142';
import { LAWS, IMMIGRATION_PENALTY, impactOf } from './lib/impact.js?v=202610220142';
import { DIRECTIVE_LABEL } from './lib/notice.js?v=202610220142';
import { toFal5Csv, toBaseCsv, pendingItems, DECISION_LABEL } from './lib/export.js?v=202610220142';
import { buildConfirmation, signConfirmation, verifyConfirmation } from './lib/receipt.js?v=202610220142';
import { DEMO_KID } from './lib/demo-key.js?v=202610220142';
import { decodeJws, b64uJson } from './lib/jose.js?v=202610220142';
import { SHIPS, STAGE, HERO_CLOCK, ROUTES } from './data/ui-ships.js?v=202610220142';
import { SENDER, MASTER, ME, KIND_BY_SCENARIO, TAG, AI_TYPE_SHORT, AI_SKIP_SHORT } from './data/ui-mails.js?v=202610220142';

const $ = (s, el = document) => el.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
// 꼭 필요한 설명만 ⓘ 툴팁으로
const info = (text) => (text ? `<span class="info" tabindex="0" role="img" title="${h(text)}" aria-label="${h(text)}"><i class="ti ti-info-circle" aria-hidden="true"></i></span>` : '');

const STEPS = [
  { title: '자료 받기', sub: '최초본·수정본·메일' },
  { title: '변경 대조', sub: '봐야 할 곳과 근거' },
  { title: '관련 신고·결정', sub: '반영·유지·선사 문의' },
  { title: '내보내기', sub: '확정 명부 또는 미확정 검토본' },
];
const KIND_LABEL = { modify: '값 변경', add: '추가(승선)', remove: '삭제(하선)', duplicate: '중복 행', directive: '메일 지시', standing: '기존 값' };
const ORDER = { suspect: 0, check: 1, expected: 2 };

const state = {
  page: 'ships',
  ship: 'hanbit',
  step: Math.min(4, Math.max(1, Number(params.get('step')) || 1)),
  scenario: Math.min(SCENARIOS.length, Math.max(1, Number(params.get('scenario')) || 2)),
  inputs: null,
  report: null,
  view: 'B',
  filter: params.get('filter') || 'all',
  selected: params.get('item') || null,
  decisions: {},
  approver: '데모 담당자',
  conf: null,
  eval: null,
  open: [],        // 열린 항차 탭(배 key)
  mail: null,      // 메일함에서 펼친 메일
  mailScope: 'voyage',
  mailQ: '',
  read: new Set(),
};

function loadScenario(n) {
  const s = SCENARIOS[n - 1];
  state.rebased = false;
  state.scenario = n;
  state.inputs = { a: s.a, b: s.b, mail: s.mail };
  state.report = null;
  state.decisions = {};
  state.conf = null;
  state.selected = null;
}

// AI가 미리 읽어 둔 메일 해석(data/ai/scenario-ai.json). 메일을 직접 고치면 없으므로 규칙 방식으로 읽는다.
let AI = { meta: null, byId: {} };
function aiFor(n, mail) {
  const sc = SCENARIOS[n - 1];
  if (!sc || mail !== sc.mail) return null;
  return AI.byId[`S${n}`] || null;
}
function compareWith(n, inputs) {
  const ai = aiFor(n, inputs.mail);
  return compareCrewLists({ ...inputs, aiInstructions: ai ? ai.instructions : null });
}

function run() {
  state.report = state.rebased ? compareCrewLists(state.inputs) : compareWith(state.scenario, state.inputs);
  state.decisions = {};
  state.conf = null;
  const items = sortedItems();
  if (!state.selected || !items.some((it) => it.id === state.selected)) state.selected = items[0]?.id || null;
}

function sortedItems(rep = state.report) {
  if (!rep) return [];
  return rep.items.slice().sort((a, b) => ORDER[a.class] - ORDER[b.class] || (a.rowB?.line ?? a.rowA?.line ?? 999) - (b.rowB?.line ?? b.rowA?.line ?? 999));
}

// 화면(메뉴) 전환. compare·report는 기존 단계 화면(#pg-work)을 쓴다.
const PAGE_SECTION = { ships: 'pg-ships', ship: 'pg-ship', compare: 'pg-work', report: 'pg-work', inquiry: 'pg-inquiry', mail: 'pg-mail', eval: 'tab-eval', scope: 'tab-scope' };
const VOYAGE_PAGES = ['ship', 'compare', 'inquiry', 'report', 'mail'];
function setPage(page, { scroll = true } = {}) {
  state.page = page;
  if (page === 'report') state.step = 4;
  else if (page === 'compare' && state.step === 4) state.step = allDecided() ? 3 : 2;
  for (const sec of new Set(Object.values(PAGE_SECTION))) $(`#${sec}`).hidden = sec !== PAGE_SECTION[page];
  if (VOYAGE_PAGES.includes(page)) { if (!state.open.includes(state.ship)) state.open.push(state.ship); curShip().last = page; }
  renderChrome();
  if (page === 'ships') renderShips();
  if (page === 'ship') renderShip();
  else dropMap();
  if (page === 'compare' || page === 'report') render();
  if (page === 'inquiry') renderInquiry();
  if (page === 'mail') $('#pg-mail').innerHTML = mailboxHtml(true);
  if (page === 'eval') renderEval();
  if (page === 'scope') renderScope();
  if (scroll) window.scrollTo({ top: 0 });
}

function canGo(step) {
  if (step <= 1) return true;
  if (!state.report) return false;
  if (state.report.blocked && step >= 3) return false;
  if (step === 4) return allDecided();
  return true;
}
const allDecided = () => state.report && state.report.items.every((it) => state.decisions[it.id]);

function goStep(n) {
  if (!canGo(n)) return;
  if (n === 4) { setPage(pendingItems(state.report, state.decisions).length && state.page === 'compare' ? 'inquiry' : 'report'); return; }
  state.step = n;
  if (state.page !== 'compare') { setPage('compare'); return; }
  render();
  window.scrollTo({ top: 0 });
}

function renderStepper() {
  $('#stepper').hidden = state.page === 'report';
  $('#stepper').innerHTML = STEPS.slice(0, 3).map((s, i) => {
    const n = i + 1;
    const cur = n === state.step;
    const done = n < state.step;
    return `<li class="${done ? 'done' : ''}" ${cur ? 'aria-current="step"' : ''}><button type="button" data-step="${n}" ${canGo(n) ? '' : 'disabled'}><span class="num">${done ? '<i class="ti ti-check"></i>' : n}</span><span class="st-title" title="${s.sub}">${s.title}</span></button></li>`;
  }).join('');
}

function render() {
  const isReport = state.page === 'report';
  $('#pgHead').innerHTML = isReport ? agencyPanel() : '';
  renderStepper();
  const body = $('#stepBody');
  if (isReport && (!state.report || state.report.blocked || !allDecided())) {
    body.innerHTML = `<div class="panel"><div class="panel-body"><p style="margin:0 0 10px">${!state.report ? '대조 결과가 없습니다.' : state.report.blocked ? '명부 판독 실패로 신고 자료를 만들 수 없습니다.' : `아직 결정하지 않은 항목이 ${state.report.items.filter((it) => !state.decisions[it.id]).length}건 있습니다. 선원명부 탭에서 결정을 마치면 확정 명부(또는 미확정 검토본)를 만듭니다.`}</p><button type="button" class="btn btn-primary" data-page="compare">선원명부 탭으로</button></div></div>`;
    return;
  }
  if (state.step === 1) body.innerHTML = step1();
  if (state.step === 2) body.innerHTML = step2();
  if (state.step === 3) body.innerHTML = step3();
  if (state.step === 4) body.innerHTML = step4();
}

// ---------------- 1단계 ----------------
function fmtInfo(text) {
  const lines = text.split('\n').filter((l) => l.trim()).length;
  const delim = text.includes('\t') ? '탭 구분(엑셀 붙여넣기)' : text.split('\n').some((l) => l.split(';').length > 4) ? '세미콜론 구분' : '쉼표 구분(CSV)';
  return `${delim} · ${lines}줄`;
}

// 메일 머리(보낸 사람·제목)와 본문 나누기 — 화면 표시용
function splitMail(text) {
  const head = {}, body = [];
  for (const ln of String(text || '').split('\n')) {
    const m = ln.match(/^\s*(from|subject|보낸\s*사람|제목)\s*[:：]\s*(.*)$/i);
    if (m && !body.length) head[/^(from|보낸)/i.test(m[1]) ? 'from' : 'subject'] = m[2];
    else if (body.length || ln.trim()) body.push(ln);
  }
  return { head, body: body.join('\n').trim() };
}

// AI가 읽은 요청 목록(미리 실행한 결과) — 메일 패널용
const AI_TYPE = { correction: '정정', sign_on: '승선', sign_off: '하선', rank_change: '직급 변경' };
const AI_REASON = { negation: '하지 말라는 문장', cancel: '취소된 요청', conditional: '조건부', quote: '이전 메일 인용', superseded: '뒤 문장으로 바뀜', other_vessel: '다른 배', question: '질문', info: '단순 안내' };
function mailBodyHtml(body, ai) {
  let out = h(body);
  for (const it of ai?.instructions || []) {
    const ev = h(String(it.evidence || '').trim());
    if (ev && out.includes(ev)) out = out.replace(ev, `<mark class="ev ${it.apply ? 'on' : 'off'}" title="AI: ${it.apply ? `${h(AI_TYPE[it.type] || it.type)} 반영` : `반영 안 함 · ${h(AI_REASON[it.not_applied_reason] || '')}`}">${ev}</mark>`);
  }
  return out;
}
function aiReadHtml(n, mail, rep) {
  const ai = aiFor(n, mail);
  if (!ai) {
    return `<div class="ai-read rule"><div class="ai-read-head"><i class="ti ti-list-check" aria-hidden="true"></i><b>메일 해석: 규칙 방식</b>${info(SCENARIOS[n - 1] && mail !== SCENARIOS[n - 1].mail ? '메일을 직접 고쳐 AI 결과가 없으므로 규칙 방식으로 읽었습니다' : '')}</div></div>`;
  }
  const rows = ai.instructions.map((it) => `<li><span class="ai-st ${it.apply ? 'on' : 'off'}">${it.apply ? '반영함' : `반영 안 함 · ${h(AI_REASON[it.not_applied_reason] || it.not_applied_reason || '')}`}</span>
    <span class="ai-what"><b>${h(AI_TYPE[it.type] || it.type)}</b> ${h(it.person || '')}${it.field ? ` · ${h(FIELD[it.field]?.ko || it.field)}` : ''}${it.value ? ` → <span class="mono">${h(it.value)}</span>` : ''}</span>
    <span class="ai-ev">“${h(it.evidence || '')}”</span></li>`).join('');
  const extra = (rep?.noticeWarnings || []).filter((w) => /근거 문장|특정하지/.test(w));
  return `<div class="ai-read"><div class="ai-read-head"><i class="ti ti-sparkles" aria-hidden="true"></i><b>AI가 읽은 요청 ${ai.instructions.length}건</b>${info(`미리 실행한 결과${AI.meta?.model ? ` · ${AI.meta.model}` : ''}. 판정은 엔진 규칙이 하고, 근거 문장이 원문에 있는지 확인합니다.`)}</div>
    ${rows ? `<ul class="ai-list">${rows}</ul>` : '<p class="small muted" style="margin:6px 0 0">반영할 요청 없음</p>'}${extra.length ? `<ul class="warn-list">${extra.map((w) => `<li>${h(w)}</li>`).join('')}</ul>` : ''}</div>`;
}

function step1() {
  const sc = SCENARIOS[state.scenario - 1];
  const ctx = sc?.ctx || {};
  const rowsN = (k) => (state.report ? (k === 'a' ? state.report.A.rows.length : state.report.B.rows.length) : null);
  const file = (k, label, sub) => `<div class="attach"><span class="attach-ic" aria-hidden="true">${k === 'a' ? 'V1' : 'V2'}</span><span><b>${label}</b><span class="muted small">${sub}${rowsN(k) != null ? ` · ${rowsN(k)}명` : ''}</span></span></div>`;
  const box = (key, title, sub) => `<div class="panel"><div class="panel-head"><h3>${title}</h3><span class="muted small">${sub}</span></div><textarea class="mono" data-input="${key}" spellcheck="false" aria-label="${title}">${h(state.inputs[key])}</textarea></div>`;
  const others = SCENARIOS.map((x) => `<button type="button" class="case" data-scenario="${x.id}" aria-pressed="${x.id === state.scenario}"><b>${x.id}</b> ${h(x.title)} <span class="muted small">${h(shipOfScenario(x.id).name)}</span></button>`).join('');
  const mid = mailIdOfScenario(state.scenario);
  return `
  <div class="inbox">
    <div class="mail">
      <div class="attachments">${file('a', state.scenario === 5 ? '기준본 (확정한 결정만 반영)' : '최초본 선원명부', (ctx.v1 || '').replace(/\s*(최초본|기준본).*$/, '') || fmtInfo(state.inputs.a))}${file('b', state.scenario === 5 ? '수정본 V3' : '수정본 선원명부', (ctx.v2 || '').replace(/\s*수정본.*$/, '') || fmtInfo(state.inputs.b))}</div>
      <div class="mail-ai">${aiReadHtml(state.scenario, state.inputs.mail, state.report)}${mid ? `<button type="button" class="btn btn-sm" data-open-mail="${mid}"><i class="ti ti-mail" aria-hidden="true"></i> 메일 원문</button>` : ''}</div>
    </div>
    <aside class="inbox-side">
      <div class="side-card">
        <button type="button" class="btn btn-primary btn-block" data-act="next">변경 대조 결과 보기 →</button>
        ${state.report ? '' : state.rebased ? '<p class="small muted" style="margin:8px 0 0">아래 원문 칸에 회신 수정본·메일을 붙여 넣으세요.</p>' : '<p class="small muted" style="margin:8px 0 0">입력이 바뀌어 다시 대조합니다.</p>'}</div>
      <div class="side-card"><h3>다른 배(사례)</h3><div class="cases">${others}</div></div>
    </aside>
  </div>
  <details class="raw panel"${state.rebased ? ' open' : ''}><summary>원문 보기 · 직접 붙여 넣기</summary>
    <div class="inputs">
      ${box('a', state.scenario === 5 ? '기준본' : '최초본 선원명부', fmtInfo(state.inputs.a))}
      ${box('b', '수정본 선원명부', fmtInfo(state.inputs.b))}
      ${box('mail', '메일 원문', '교대 통보·정정 요청·회신')}
    </div>
  </details>
  ${state.report ? `<details class="raw panel"><summary>정리된 명부 보기</summary>${normalizedView()}</details>` : ''}`;
}

function normalizedView() {
  const r = state.report;
  const P = state.view === 'A' ? r.A : r.B;
  const warns = [...P.warnings, ...(state.view === 'B' ? r.noticeWarnings.map((w) => `메일 ${w}`) : [])];
  const head = HEADER_FIELDS.map((f) => P.header[f.key] ? `<dt>${f.fal}${f.fal.includes('.') ? '' : '.'} ${h(f.en)}</dt><dd>${h(P.header[f.key].value || P.header[f.key].raw)} <span class="muted">(${P.header[f.key].row}행)</span></dd>` : '').join('');
  const cols = P.columns.filter((c) => c.header).map((c) => `${h(c.header)} → ${c.field ? `${FIELD[c.field]?.fal ?? '6'}. ${FIELD[c.field]?.en ?? 'No.'}${c.how === 'keyword' ? ' (키워드)' : ''}` : '<b>인식 못함</b>'}`).join(' · ');
  const rows = P.rows.map((row) => `<tr><td>${h(row.no)}</td>${ROW_FIELDS.map((f) => {
    const c = row.cells[f.key];
    const bad = c.status === 'unreadable' || (c.status === 'empty' && f.required);
    const title = c.col ? `${P.sourceId === 'A' ? '최초본' : '수정본'} ${c.row}행 ${colLetter(c.col)}열 · 원문 "${c.raw}"` : '이 항목 열을 인식하지 못함';
    return `<td class="${bad ? 'c-warn' : ''}" title="${h(title)}">${h(c.status === 'ok' ? c.value : c.raw.trim() || '(빈칸)')}</td>`;
  }).join('')}</tr>`).join('');
  return `
  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h3>FAL 5 항목으로 정규화한 결과</h3>
      <div class="seg" role="group" aria-label="버전"><button type="button" data-view="A" aria-pressed="${state.view === 'A'}">최초본 ${r.A.rows.length}명</button><button type="button" data-view="B" aria-pressed="${state.view === 'B'}">수정본 ${r.B.rows.length}명</button></div>
    </div>
    <div class="panel-body">
      <dl class="kv" style="grid-template-columns: 210px 1fr; margin-bottom:8px">${head}</dl>
      <p class="small muted" style="margin:0 0 8px">머리글 인식: ${cols}</p>
      ${documentAlertBox(r)}${columnAlertBox(r)}
      ${warns.length ? `<ul class="warn-list">${warns.map((w) => `<li>${h(w)}</li>`).join('')}</ul>` : ''}
      <p class="small muted" style="margin:8px 0">셀에 마우스를 올리면 원문 위치(줄·열)와 원문 값을 보여 줍니다. 날짜는 ISO 형식, 직급은 약어, 국적은 ISO 3166-1 alpha-3로 맞춥니다.</p>
      <div class="table-wrap"><table class="grid fal-table"><thead><tr><th>6.<span class="fal">No.</span></th>${ROW_FIELDS.map((f) => `<th>${f.fal}. ${h(f.ko)}<span class="fal">${h(f.en)}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>
  </div>`;
}

// ---------------- 2단계 ----------------
function documentAlertBox(r) {
  const al = r.documentAlerts || [];
  if (!al.length) return '';
  return `<div class="alert alert-danger" role="alert" style="margin-bottom:12px"><b>명부 판독 실패 — 이 결과로 승인할 수 없습니다</b><ul class="small" style="margin:4px 0 0 18px">${al.map((x) => `<li>${h(x.detail)}</li>`).join('')}</ul><div class="small">표의 머리글을 FAL 5 항목으로 지정하거나 원문을 사람이 직접 확인해야 합니다. 아래 목록에 변경이 적게 보여도 '변경 없음'이라는 뜻이 아닙니다.</div></div>`;
}
function columnAlertBox(r) {
  const al = r.columnAlerts || [];
  if (!al.length) return '';
  const src = (x) => x.sources.map((s) => (s === 'A' ? '최초본' : '수정본')).join('·');
  return `<div class="alert alert-warning" style="margin-bottom:12px"><b>열 단위 서식 확인 필요 ${al.length}건</b> — 셀마다 경보하지 않고 열당 한 번 알립니다.<ul class="small" style="margin:4px 0 0 18px">${al.map((x) => `<li>${src(x)} ${x.col}열 "${h(x.header)}"${x.field ? ` (${h(FIELD[x.field].ko)})` : ''}: ${h(x.detail)}</li>`).join('')}</ul></div>`;
}
function valueText(c) {
  if (!c) return '';
  if (c.status === 'ok') return c.value;
  return c.raw?.trim() ? c.raw.trim() : '(빈칸)';
}

// 화면 표시용: 앞뒤 공통 글자를 빼고 달라진 글자만 표시 (O↔0 같은 혼동 문자를 눈으로 찾게)
function diffPair(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  if (a === b) return [h(a), h(b)];
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  const m = (x) => { const mid = x.slice(i, x.length - j); return h(x.slice(0, i)) + (mid ? `<mark class="dch">${h(mid)}</mark>` : '') + h(x.slice(x.length - j)); };
  return [m(a), m(b)];
}

function changeText(it) {
  if (it.kind === 'modify' || it.kind === 'standing') {
    return `<b>${h(FIELD[it.field].ko)}</b><br>${it.kind === 'standing' ? `<span class="val-after">${h(valueText(it.after))}</span>` : (() => { const [x, y] = diffPair(valueText(it.before), valueText(it.after)); return `<span class="vals"><span class="val-before">${x}</span><span class="arrow" aria-label="에서">→</span><span class="val-after">${y}</span></span>`; })()}`;
  }
  if (it.kind === 'add') return `<b>명부에 추가</b> <span class="muted small">${h(it.rowB.cells.rank.value)} · ${h(it.rowB.cells.nationality.value)}</span>`;
  if (it.kind === 'remove') return `<b>명부에서 빠짐</b> <span class="muted small">${h(it.rowA.cells.rank.value)}</span>`;
  if (it.kind === 'duplicate') return `<b>같은 사람이 두 번</b> <span class="muted small">수정본 ${it.dupOf.line}행 · ${it.rowB.line}행</span>`;
  if (it.kind === 'directive') return `<b>${DIRECTIVE_LABEL[it.directive.type]} 지시</b>${it.field ? ` <span class="muted small">${h(FIELD[it.field]?.ko || '')}</span>` : ''}`;
  return '';
}

// 근거 한 줄(규칙 코드 없이 짧게)
const RULE_SHORT = { R1: '헷갈리는 글자', R2: '일·월 뒤바뀜', R3: '성·이름 뒤바뀜', R4: '만료 여권', R5: '중복 행', R6: '빈칸·판독 불가', R7: '형식 틀림', R8: '메일 지시와 다름' };
function basisText(it) {
  const parts = [];
  if (it.rules?.length) parts.push(it.rules.map((r) => RULE_SHORT[r.id] || r.title).join(', '));
  if (it.directive) parts.push(`메일 ${it.directive.line}번째 줄`);
  if (!parts.length) parts.push(it.class === 'check' ? '근거 없음' : it.reason);
  return parts.join(' · ');
}

function step2() {
  const r = state.report;
  const s = r.summary;
  const stat = (k, label, n, sub) => `<button type="button" class="stat ${k}" data-filter="${k}" aria-pressed="${state.filter === k}" title="${sub}"><span class="stat-n">${n}</span><span class="stat-l">${label}</span></button>`;
  const chip = (k, label, n) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${state.filter === k}"><span class="dot ${k}"></span>${label} <span class="n">${n}</span></button>`;
  const items = sortedItems().filter((it) => state.filter === 'all' || it.class === state.filter);
  let lastPerson = null;
  const rows = items.map((it) => {
    const p = it.person;
    const show = p !== lastPerson;
    lastPerson = p;
    const open = it.id === state.selected;
    return `<tr class="item" data-item="${it.id}" aria-selected="${open}" aria-expanded="${open}" tabindex="0"><td class="person">${show ? h(p) : ''}</td><td><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></td><td>${changeText(it)}</td><td class="basis small">${h(basisText(it))}<i class="ti ti-chevron-${open ? 'up' : 'down'} row-chev" aria-hidden="true"></i></td></tr>${open ? `<tr class="detail-row"><td colspan="4"><div class="detail" aria-label="선택한 변경의 근거">${detailPanel()}</div></td></tr>` : ''}`;
  }).join('');
  const cos = r.cosmetic.map((c) => `<tr><td>${h(c.person)}</td><td>${h(FIELD[c.field].ko)}</td><td class="mono">${h(c.before.raw)}</td><td class="mono">${h(c.after.raw)}</td><td class="muted">${h(c.before.ref)} · ${h(c.after.ref)}</td></tr>`).join('');
  return `
  <div class="stats">
    ${stat('suspect', '오류 의심', s.suspect, '먼저 확인 · 규칙에 걸림')}
    ${stat('check', '확인 필요', s.check, '근거 없는 변경')}
    ${stat('expected', '예상된 변경', s.expected, '메일 근거 있음 · 근거 보고 반영')}
    <div class="stat cosmetic" title="대소문자·공백·날짜 형식 차이. 자동 정리, 경보 안 함"><span class="stat-n">${s.cosmetic}</span><span class="stat-l">표기 차이</span></div>
  </div>
  ${documentAlertBox(r)}${columnAlertBox(r)}
  ${state.scenario === 6 && r.mailReader === 'ai' ? readerCompare() : ''}
  <div class="compare one">
    <div>
      <div class="panel">
        <div class="panel-head"><h3>${state.filter === 'all' ? '바뀐 항목' : CLASS_LABEL[state.filter]} ${items.length}건</h3>${state.filter === 'all' ? '' : chip('all', '전체 보기', r.items.length)}</div>
        <div class="table-wrap"><table class="grid changes"><thead><tr><th style="width:150px">인물</th><th style="width:96px">분류</th><th>바뀐 항목</th><th style="width:30%">근거</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">해당하는 변경이 없습니다.</td></tr>'}</tbody></table></div>
      </div>
      <details class="cosmetic-fold panel"><summary>표기 차이 ${s.cosmetic}건</summary>
        <div class="table-wrap"><table class="grid"><thead><tr><th>인물</th><th>항목</th><th>최초본 원문</th><th>수정본 원문</th><th>위치</th></tr></thead><tbody>${cos || '<tr><td colspan="5" class="muted">없음</td></tr>'}</tbody></table></div>
      </details>
    </div>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">이전</button>
    <span class="spacer"></span>
    <button type="button" class="btn btn-primary" data-act="next" ${r.blocked ? 'disabled title="명부 판독 실패로 결정 단계로 갈 수 없습니다"' : ''}>다음: 관련 신고·결정</button>
  </div>`;
}

// 사례 6: 같은 메일을 규칙 방식과 AI(미리 실행한 결과)로 읽었을 때의 차이
function readerCompare() {
  const ruleR = compareCrewLists(state.inputs);
  const aiR = state.report;
  const col = (title, icon, rep, note) => `<div class="rc-col"><div class="rc-head"><i class="ti ${icon}" aria-hidden="true"></i><b>${title}</b>${info(note)}<span class="small muted">봐야 할 곳 ${rep.summary.suspect + rep.summary.check}건</span></div>
    <ul class="rc-list">${sortedItems(rep).map((it) => `<li><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span> <b>${h(it.person)}</b> <span class="muted small">${it.field ? h(FIELD[it.field].ko) : h(KIND_LABEL[it.kind])}</span></li>`).join('')}</ul></div>`;
  return `<div class="panel reader-compare"><div class="panel-head"><h3>같은 메일, 두 가지 읽기</h3></div><div class="rc-grid">
    ${col('규칙 방식', 'ti-list-check', ruleR, '한국어 이름 "최동현"을 명부의 CHOI DONGHYUN과 잇지 못해 여권번호 정정이 확인 필요로 남고, 메일 줄 단위 경보가 더 생깁니다.')}
    ${col('AI 해석 (기본)', 'ti-sparkles', aiR, '정정은 메일 근거가 있는 예상된 변경이 되고, 취소된 SANTOS 생년월일 요청은 반영하지 않습니다. 그래서 수정본에 들어온 SANTOS 값 변경은 여전히 오류 의심입니다.')}
  </div></div>`;
}

function rawLineHtml(P, line, col) {
  const text = P.lines[line - 1] ?? '';
  if (!col) return h(text);
  const cells = splitRows(text, P.delim)[0]?.cells || [];
  const sep = P.delim === '\t' ? ' ⇥ ' : P.delim;
  return cells.map((c, i) => (i === col - 1 ? `<span class="hl">${h(c) || '&nbsp;'}</span>` : h(c))).join(`<span class="muted">${h(sep)}</span>`);
}

function detailPanel() {
  const r = state.report;
  const it = r.items.find((x) => x.id === state.selected);
  if (!it) return '<div class="panel-body muted">왼쪽에서 항목을 고르세요.</div>';
  const head = `<div class="panel-head"><h3>${h(it.person)}${it.field ? ` · ${h(FIELD[it.field].ko)}` : ''}</h3><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></div>`;
  const a = it.rowA, b = it.rowB;
  let src = '';
  if (a || b) {
    const fields = ROW_FIELDS.filter((f) => (a ? a.cells[f.key].status !== 'nocolumn' : true) || (b ? b.cells[f.key].status !== 'nocolumn' : true));
    const rows = fields.map((f) => {
      const ra = a ? a.cells[f.key].raw : '';
      const rb = b ? b.cells[f.key].raw : '';
      const diff = it.field ? f.key === it.field || (it.rules || []).some((x) => x.id === 'R3') && (f.key === 'familyName' || f.key === 'givenNames') : false;
      const [da, db] = diff && a && b ? diffPair(ra, rb) : [h(ra), h(rb)];
      return `<tr class="${diff ? 'diff' : ''}"><th>${h(f.ko)}</th><td class="mono">${a ? (ra ? da : '<span class="muted">(빈칸)</span>') : ''}</td><td class="mono">${b ? (rb ? db : '<span class="muted">(빈칸)</span>') : ''}</td></tr>`;
    }).join('');
    src = `<table class="src-compare"><thead><tr><th>항목</th><th>${a ? `최초본 ${a.line}행` : '최초본 없음'}</th><th>${b ? `수정본 ${b.line}행` : '수정본 없음'}</th></tr></thead><tbody>${rows}</tbody></table>
      ${a ? `<div class="rawline mono" title="최초본 원문 줄"><span class="muted">최초본 ${a.line}행 │ </span>${rawLineHtml(r.A, a.line, it.before?.col)}</div>` : ''}
      ${b ? `<div class="rawline mono" title="수정본 원문 줄"><span class="muted">수정본 ${b.line}행 │ </span>${rawLineHtml(r.B, b.line, it.after?.col)}</div>` : ''}`;
  }
  let ev = '';
  if (it.directive) {
    const mailLines = state.inputs.mail.split('\n');
    ev += `<p class="small" style="margin:12px 0 0"><b>메일 지시 문장</b> <span class="muted">${it.directive.line}번째 줄 · ${DIRECTIVE_LABEL[it.directive.type]}</span></p>
      <div class="mail-view mono" data-mail>${mailLines.map((l, i) => `<div${i + 1 === it.directive.line ? ' data-hit' : ''}><span class="ln">${i + 1}</span>${i + 1 === it.directive.line ? `<mark>${h(l)}</mark>` : h(l)}</div>`).join('')}</div>`;
  }
  if (it.rules?.length) {
    ev += `<p class="small" style="margin:12px 0 0"><b>규칙 근거</b></p>` + it.rules.map((x) => `<div class="rule-box"><span class="rid">${x.id}</span><b>${h(x.title)}</b><div class="small muted">${h(RULES[x.id].desc)}</div><div class="small">${h(x.detail)}</div></div>`).join('');
  }
  if (it.notes?.length) {
    ev += `<p class="small muted" style="margin:10px 0 0">참고: 값의 모양이 ${it.notes.map((n) => `${n.id} ${n.title}`).join(', ')} 패턴과 같지만, 메일이 이 값을 명시했으므로 예상된 변경으로 분류했습니다.</p>`;
  }
  if (it.evidence?.inferredColumn) ev += `<p class="small" style="margin:12px 0 0"><b>추정 매핑</b> · 이 항목의 열은 머리글을 사전에서 찾지 못해 값 모양·열 순서로 추정해 매핑했습니다. 열이 맞는지 확인하세요.</p>`;
  if (it.evidence?.formatAlert) ev += `<p class="small" style="margin:12px 0 0"><b>열 서식 확인 필요</b> · 이 열은 값을 해석하지 못해 원문 문자열로만 비교했습니다. 원문이 바뀌었으므로 확인 필요로 남깁니다.</p>`;
  if (it.class === 'check' && !it.directive && !it.rules?.length && !it.evidence?.formatAlert) ev += `<p class="small" style="margin:12px 0 0"><b>근거</b> · 이 변경을 설명하는 메일 지시도, 위반한 규칙도 없습니다. 근거가 부족하면 기본값은 확인 필요입니다.</p>`;
  const m = it.match ? `<dl class="kv" style="margin-top:12px"><dt>인물 대응</dt><dd>${h({ idNumber: '여권번호 일치', 'idNumber~confusable': '여권번호(헷갈리는 글자 무시) 일치', 'name+dob': '성명+생년월일', name: '성명 유사도', 'name(dob 판독 불가)': '성명(생년월일 판독 불가)' }[it.match.method] || it.match.method)} · 신뢰도 ${it.match.confidence.toFixed(2)}</dd><dt>분류 이유</dt><dd>${h(it.reason)}</dd></dl>` : `<dl class="kv" style="margin-top:12px"><dt>분류 이유</dt><dd>${h(it.reason)}</dd></dl>`;
  const lineOf = (row, tag) => (row ? `<span class="muted small">${tag} ${row.line}행</span>` : '');
  const one = it.kind === 'modify' ? (() => { const [x, y] = diffPair(valueText(it.before), valueText(it.after)); return `<div class="dp-one">${lineOf(a, '최초본')}<span class="mono val-before">${x}</span><span class="arrow" aria-label="에서">→</span><span class="mono val-after">${y}</span>${lineOf(b, '수정본')}</div>`; })() : `<div class="dp-one">${changeText(it)}</div>`;
  const why = it.directive ? `메일 ${it.directive.line}번째 줄 “${h((t => (t.length > 40 ? `${t.slice(0, 40)}…` : t))(String(it.directive.text || '').trim()))}”` : it.rules?.length ? it.rules.map((x) => `<span title="${h(RULES[x.id].desc)}">${h(RULE_SHORT[x.id] || x.title)}</span>`).join(', ') : h(it.class === 'check' ? '메일 지시도, 걸린 규칙도 없음' : it.reason);
  return `${head}<div class="panel-body">${one}<p class="dp-why"><span class="muted small">근거</span> ${why}</p><details class="dp-src"><summary>원문 보기</summary><div class="dp-src-body">${src}${ev}${m}</div></details></div>`;
}

// ---------------- 3단계 ----------------
function step3() {
  const r = state.report;
  const n = r.items.length;
  const done = r.items.filter((it) => state.decisions[it.id]).length;
  const changedPenaltyFields = [...new Set(r.items.filter((it) => impactOf(it).art100).map((it) => (it.field ? FIELD[it.field].ko : KIND_LABEL[it.kind])))];
  const impact = Object.values(LAWS).map((l) => `<div class="panel impact"><h3>${h(l.report)}</h3><div class="law">${h(l.law)} ${h(l.article)} · 제출처: ${h(l.agency)}</div><div class="count">이번 변경 <b>${n}건</b> 반영 필요</div><details><summary>조문 원문 보기</summary><blockquote>${h(l.quote)}${l.quoteNote ? `<br><span class="muted">(${h(l.quoteNote)})</span>` : ''}</blockquote>${l.formTitle ? `<p class="small muted" style="margin:6px 0 0">${h(l.formLabel)}: ${h(l.formTitle)}</p>` : ''}<p class="small muted" style="margin:6px 0 0">${h(l.version)}</p></details></div>`).join('');
  const rows = sortedItems().map((it) => {
    const v = state.decisions[it.id];
    return `<div class="arow"><div><b>${h(it.person)}</b></div><div><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></div><div class="small">${changeText(it)} <span class="muted">· ${h(basisText(it))}</span></div><div class="seg" role="group" aria-label="${h(it.person)} 결정">${['approve', 'keep', 'pending'].map((k) => `<button type="button" data-decide="${it.id}" data-v="${k}" aria-pressed="${v === k}">${DECISION_LABEL[k]}</button>`).join('')}</div></div>`;
  }).join('');
  return `
  <div class="panel decide-panel">
    <div class="panel-head"><h3>항목별 결정${info('수정본 반영 · 최초본 유지(최초본이 맞음) · 선사 문의(아직 모름) 중 하나. 선사 문의가 남으면 미확정 검토본만 만듭니다.')}</h3>
      <div class="progress-line"><span>처리 ${done}/${n}</span><span class="bar"><i style="width:${n ? (done / n) * 100 : 100}%"></i></span>
      <button type="button" class="btn btn-sm" data-act="approve-expected">예상된 변경 모두 반영</button>
      <button type="button" class="btn btn-sm" data-act="hold-rest">남은 항목 선사 문의</button></div>
    </div>
    <div class="approve-list">${rows || '<div class="arow muted">변경이 없습니다.</div>'}</div>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">이전</button>
    <label class="small" for="approver">승인자</label><input id="approver" class="form-control form-control-sm" value="${h(state.approver)}" style="width:160px">
    <span class="spacer"></span>
    ${allDecided() ? '' : `<span class="small muted">남은 결정 ${n - done}건</span>`}
    <button type="button" class="btn btn-primary" data-act="next" ${allDecided() ? '' : 'disabled'}>${allDecided() && pendingItems(r, state.decisions).length ? '다음: 선사 문의' : '다음: 신고 준비'}</button>
  </div>
  <details class="raw panel law-fold"><summary>관련 신고 4가지 · 과태료 조문</summary><div class="law-fold-body">
  <div class="impact-grid">${impact}</div>
  <div class="panel penalty"><b>출입국관리법 제100조제1항제5호 관련 항목</b> <span class="muted small">— 이번 변경 중 해당: ${changedPenaltyFields.length ? h(changedPenaltyFields.join(', ')) : '없음'}</span>
    <blockquote>${h(IMMIGRATION_PENALTY.head)}<br>5. ${h(IMMIGRATION_PENALTY.quote)}</blockquote>
    <p class="small muted" style="margin:6px 0 0">${h(IMMIGRATION_PENALTY.caution)}</p></div></div></details>`;
}

// ---------------- 4단계 ----------------
function shipperSummary(r = state.report, decisions = state.decisions) {
  const hd = r.B.header;
  const held = sortedItems(r).filter((it) => pendingItems(r, decisions).includes(it));
  const ok = r.items.length - held.length;
  const line = (it) => {
    const what = it.kind === 'modify' ? `${FIELD[it.field].ko} ${valueText(it.before)} → ${valueText(it.after)}` : it.kind === 'directive' ? `메일 ${it.directive.line}번째 줄 지시("${it.directive.text.trim()}")` : KIND_LABEL[it.kind];
    return `- ${it.person}: ${what} — ${it.rules?.length ? it.rules.map((x) => `${x.title}`).join(', ') : it.reason}`;
  };
  return [
    `[${hd.shipName?.value || ''} ${hd.voyage?.value || ''} ${hd.port?.value || ''}] 수정 선원명부 확인 결과`,
    '',
    `결정 완료 ${ok}건, 확인 요청 ${held.length}건 (표기 차이 ${r.cosmetic.length}건은 변경으로 보지 않음)`,
    '',
    held.length ? '확인 요청드립니다:' : '확인 요청 사항 없음.',
    ...held.map(line),
    '',
    held.length ? '회신(또는 다시 고친 명부)을 주시면, 확정한 부분을 기준으로 다시 대조해 최종 명부를 만들겠습니다.' : '위 내용으로 명부를 확정했습니다.',
    `(${state.approver} · CrewDiff 데모로 작성, 신고 전송 아님)`,
  ].join('\n');
}

function step4() {
  const r = state.report;
  const csv = toFal5Csv(r, state.decisions);
  const pend = pendingItems(r, state.decisions).length;
  const c = state.conf;
  const tech = (inner, open) => `<details class="tech"${open ? ' open' : ''}><summary class="small">기술 상세 — 위변조 확인(해시·전자서명)</summary><div class="tech-body">${inner}</div></details>`;
  let conf = `<button type="button" class="btn btn-primary" data-act="sign"><i class="ti ti-device-floppy"></i> 결정 기록 저장</button>
    ${tech(`<p class="small muted" style="margin:0">최종 명부 SHA-256 해시 + ECDSA P-256(ES256) 서명. <b>프로토타입은 공개된 데모 키</b>(${DEMO_KID})라 누구나 같은 서명을 만들 수 있으며, 운영 시에는 담당자별 키를 씁니다.</p>`)}`;
  if (pend) {
    conf = `<div class="alert alert-warning" style="margin:0 0 10px"><b>선사 문의 ${pend}건이 남아 결정 기록을 만들지 않습니다.</b>${info('선사 회신을 받으면 확정한 결정만 반영한 기준본과 회신 수정본을 다시 대조합니다.')}</div>
    <div class="row-actions" style="justify-content:flex-start">${state.scenario === 2 ? '<button type="button" class="btn btn-primary" data-act="scenario5"><i class="ti ti-mail-forward"></i> 예시 5: 선장 회신 받아 다시 대조</button>' : ''}<button type="button" class="btn" data-act="rebase">기준본으로 다시 대조(회신 수정본 붙여 넣기)</button></div>`;
  } else if (c) {
    conf = `<div class="saved-line"><i class="ti ti-circle-check" aria-hidden="true"></i><div><b>결정 기록 저장됨</b><div class="small muted">수정본 반영 ${c.payload.counts.approved}건 · 최초본 유지 ${c.payload.counts.kept}건 · ${h(c.payload.approver)} · ${h(c.payload.decidedAt)}</div></div></div>
      ${tech(`<dl class="kv" style="grid-template-columns:140px 1fr"><dt>최종 명부 SHA-256</dt><dd class="mono" style="word-break:break-all">${h(c.payload.finalListSha256)}</dd><dt>서명 키</dt><dd class="mono">${h(DEMO_KID)} (데모)</dd></dl>
      <details style="margin-top:8px"><summary class="small">서명된 기록(JWS)과 내용(JSON)</summary>
      <pre class="box wrap mono" style="max-height:90px;margin-top:6px">${h(c.jws)}</pre>
      <pre class="box mono" style="max-height:180px">${h(JSON.stringify(c.payload, null, 2))}</pre></details>
      <div class="row-actions" style="justify-content:flex-start"><button type="button" class="btn btn-sm" data-act="verify">서명·해시 검증</button><button type="button" class="btn btn-sm" data-act="tamper">변조 시험(결정 1건을 바꿔 검증)</button></div>
      ${c.verify ? `<div class="verify-result ${c.verify.ok ? 'ok' : 'bad'}">${h(c.verify.label)}: 서명 ${c.verify.signature ? '유효' : '무효'} · 최종 명부 해시 ${c.verify.hash == null ? '대조 안 함' : c.verify.hash ? '일치' : '불일치'} → <b>${c.verify.ok ? '파일 무결성 확인' : '변조 감지'}</b> <span class="muted">(서명 이후 바뀌지 않았는지를 확인할 뿐, 명부 내용이 맞는지 검증한 것은 아님)</span></div>` : ''}`, !!c.verify)}`;
  }
  return `
  <h2 class="section-title">${pend ? `미확정 검토본 — 선사 문의 ${pend}건` : '확정 명부 · 결정 기록'}</h2>
  <div class="export-grid">
    <div class="stack">
      <div class="panel"><div class="panel-head"><h3>${pend ? '미확정 검토본' : '확정 명부'}</h3><button type="button" class="btn btn-sm" data-act="download">CSV 내려받기</button></div><div class="panel-body"><details class="csv-fold"><summary class="small">CSV 내용 보기</summary><pre class="box mono csv">${shipify(h(csv)).replaceAll('선사 문의', '<mark class="pend">선사 문의</mark>')}</pre></details></div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>결정 기록${info('누가 무엇을 반영·유지했는지와 확정 명부를 묶어, 나중에 바뀌면 알 수 있게 남깁니다. 내용이 맞는지 보증하지는 않습니다.')}</h3></div><div class="panel-body">${conf}</div></div>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">선원명부 탭으로</button>
    <span class="spacer"></span>
    ${pend ? '<button type="button" class="btn btn-primary" data-page="inquiry"><i class="ti ti-mail-question" aria-hidden="true"></i> 선사 문의 탭으로</button>' : ''}
    <button type="button" class="btn" data-act="restart">처음부터</button>
  </div>`;
}

async function doSign() {
  const r = state.report;
  const finalCsv = toFal5Csv(r, state.decisions);
  const at = params.get('at') || new Date().toISOString();
  const payload = await buildConfirmation({ report: r, decisions: state.decisions, approver: state.approver, at, finalCsv });
  const jws = await signConfirmation(payload);
  state.conf = { payload, jws, finalCsv, verify: null };
}
async function doVerify(tamper = false) {
  const c = state.conf;
  let jws = c.jws;
  if (tamper) {
    const d = decodeJws(jws);
    const p = structuredClone(d.payload);
    const k = p.changes.findIndex((x) => x.decision === 'keep');
    if (k >= 0) p.changes[k].decision = 'approve'; else if (p.changes.length) p.changes[0].decision = 'keep'; else p.approver += ' (변조)';
    const parts = jws.split('.');
    jws = `${parts[0]}.${b64uJson(p)}.${parts[2]}`;
  }
  const v = await verifyConfirmation(jws, { finalCsv: c.finalCsv });
  c.verify = { ...v, label: tamper ? '변조한 기록' : '원본 기록' };
}

// ---------------- 평가 결과 탭 ----------------
const pc = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
function metricRows(r) {
  const e = r.engine, b1 = r.baselineRow, b2 = r.baselineId;
  const row = (label, f, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="engine">${f(e)}</td><td>${f(b1)}</td><td>${f(b2)}</td></tr>`;
  return [
    row('실제 변경을 찾아낸 비율 (놓친 수)', (x) => `${pc(x.substantiveRecall.rate)} (${x.substantiveRecall.missed})`),
    row('오류 의심 중 실제 오류 비율', (x) => (x.suspect ? pc(x.suspect.precision) : '분류 없음')),
    row('실제 오류를 오류 의심으로 찾은 비율', (x) => (x.suspect ? pc(x.suspect.recall) : '분류 없음')),
    row('쌍당 오경보 (표기만 다른 셀 경보)', (x) => `${x.falseAlarms.perPair.toFixed(2)} (${x.falseAlarms.cosmeticAlarms})`),
    row('개별 검수 항목 / 쌍', (x) => x.review.perPair.toFixed(1)),
    row('검수 범위 비율', (x) => pc(x.review.ratio)),
    row(`검수 대상에서 빠진 실제 오류 수 (전체 ${e.review.errorsTotal})`, (x) => String(x.review.missedErrorsOutside), 'key'),
    row('근거 연결률', (x) => (x.evidence ? pc(x.evidence.rate) : '—')),
    row('쌍당 열 단위 서식 경보 (셀 오경보와 별도)', (x) => (x.columnAlerts ? `${x.columnAlerts.perPair.toFixed(2)} (${x.columnAlerts.total})` : x.evidence ? '— (도입 전)' : '—')),
  ].join('');
}
function metricTable(r, caption, compact = false) {
  const hd = compact ? ['CrewDiff', '엑셀식(행)', '엑셀식(여권번호)'] : ['CrewDiff', '엑셀식 비교 — 같은 행끼리', '엑셀식 비교 — 여권번호로 짝지음'];
  return `<div class="table-wrap"><table class="metric-table${compact ? ' compact' : ''}"><caption class="visually-hidden">${h(caption)}</caption><thead><tr><th>지표</th>${hd.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${metricRows(r)}</tbody></table></div>`;
}
function ruleTable(r) {
  const e = r.engine;
  return `<div class="table-wrap"><table class="metric-table"><thead><tr><th>오류 유형</th><th>건수</th><th>엔진: 오류 의심</th><th>엔진: 규칙 id 일치</th><th>기준선1 경보</th><th>기준선2 경보</th></tr></thead><tbody>${Object.keys(e.perRule).map((k) => `<tr><td>${k} ${h(RULES[k].title)}</td><td>${e.perRule[k].n}</td><td class="engine">${e.perRule[k].asSuspect}</td><td class="engine">${e.perRule[k].ruleCorrect}</td><td>${r.baselineRow.perRule[k].detected}</td><td>${r.baselineId.perRule[k].detected}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderEval() {
  const el = $('#tab-eval');
  const ev = state.eval;
  if (!ev) { el.innerHTML = '<p class="muted">평가 결과를 불러오는 중…</p>'; return; }
  if (ev.error) { el.innerHTML = `<div class="alert alert-danger">평가 결과 파일을 읽지 못했습니다: ${h(ev.error)}. <code class="cmd">node eval/run.mjs --split all</code> 실행 후 다시 여세요.</div>`; return; }
  const h3 = ev.h3.splits.holdout3, h4 = ev.h4.splits.holdout4, first = ev.first.splits.holdout, cur = ev.current.splits.holdout, dev = ev.current.splits.dev;
  const ds = ev.current.dataset;
  const missed = (r) => Object.entries(r.engine.review.missedErrorsByRule).map(([k, v]) => `${k} ${v}`).join(', ') || '없음';
  const total = ds.dev.labels + ds.holdout.labels + ev.h3.dataset.holdout3.labels + ev.h4.dataset.holdout4.labels;
  const mr = ev.mail.runs;
  const mrow = (label, f) => `<tr><td>${label}</td>${mr.map((r) => `<td class="${r.name.startsWith('LLM') ? 'engine' : ''}">${f(r)}</td>`).join('')}</tr>`;
  const mailTable = `<div class="table-wrap"><table class="metric-table"><thead><tr><th>지표</th>${mr.map((r) => `<th>${h(r.name)}</th>`).join('')}</tr></thead><tbody>
    ${mrow('반영할 지시 재현율 (맞힘/전체)', (r) => `${pc(r.recall)} (${r.tp}/${r.gold})`)}
    ${mrow('정밀도 (맞힘/낸 지시)', (r) => `${pc(r.precision)} (${r.tp}/${r.tp + r.fp})`)}
    <tr class="key">${mr.map((r, i) => (i ? '' : '<td>함정(부정·취소·조건·인용 등)을 반영으로 읽음</td>')).join('')}${mr.map((r) => `<td>${r.trapApplied} / ${r.trapTotal}</td>`).join('')}</tr>
  </tbody></table></div>`;
  const fcols = [['engine', 'CrewDiff'], ['baselineId', '엑셀식 비교(여권번호로 짝지음)'], ['baselineIdMail', '엑셀식 비교 + 같은 메일 정보']];
  const frow = (label, f, cls = '') => `<tr class="${cls}"><td>${label}</td>${fcols.map(([c]) => `<td class="${c === 'engine' ? 'engine' : ''}">${f(ev.fin.splits.holdout[c])}</td>`).join('')}</tr>`;
  const finTable = `<div class="table-wrap"><table class="metric-table"><thead><tr><th>지표 (개발 때 쓰지 않은 양식 시험, 60쌍, 실제 오류 84)</th>${fcols.map((c) => `<th>${c[1]}</th>`).join('')}</tr></thead><tbody>
    ${frow('개별 검토 비율 (÷ 수정본 칸 수)', (x) => pc(x.review.ratio))}
    ${frow('일괄 반영 후보 (근거 확인 후 반영)', (x) => String(x.workload.batch))}
    ${frow('검토 대상 밖으로 빠진 실제 오류', (x) => String(x.review.missedErrorsOutside), 'key')}
  </tbody></table></div>`;
  const llm = mr.find((r) => /근거/.test(r.name)) || mr[mr.length - 1];
  const fh = ev.fin.splits.holdout;
  el.innerHTML = `
  <h2 class="section-title">평가 결과${info('가상으로 만든 명부·메일로 시험한 결과입니다. 실제 현장 자료에서는 달라질 수 있습니다.')}</h2>
  <div class="eval-cards">
    <div class="eval-card"><i class="ti ti-mail-check" aria-hidden="true"></i><div class="eval-big">${llm.tp}<small>/${llm.gold}건</small></div><div><b>메일 요청을 AI가 맞게 읽음</b><div class="small muted" title="“하지 말라”, “취소”, 조건부, 이전 메일 인용 같은 함정 문장">함정 문장 오독 ${llm.trapApplied}/${llm.trapTotal}</div></div></div>
    <div class="eval-card"><i class="ti ti-zoom-check" aria-hidden="true"></i><div class="eval-big">${pc(fh.baselineIdMail.review.ratio)} <small>→</small> ${pc(fh.engine.review.ratio)}</div><div><b>사람이 하나씩 볼 칸</b><div class="small muted" title="같은 메일 정보를 준 엑셀식 비교 대비">놓친 실제 오류 ${fh.engine.review.missedErrorsOutside}건</div></div></div>
    <div class="eval-card"><i class="ti ti-hand-stop" aria-hidden="true"></i><div class="eval-big small-big">멈춤</div><div><b>못 읽는 양식은 사람에게 넘김</b><div class="small muted" title="명부를 읽지 못하면 결정 단계로 가지 못하게 막습니다">시험 60쌍 모두 차단</div></div></div>
  </div>
  <div class="panel eval-fin"><div class="panel-head"><h3>엑셀식 비교와 견줌${info('같은 메일 정보를 준 엑셀식 비교와 비교. 이미 결과를 본 홀드아웃을 지금 코드로 다시 잰 참고값입니다.')}</h3></div><div class="panel-body">${finTable}</div></div>
  <details class="raw panel eval-more"><summary>시험 방법·상세 표 보기</summary><div class="eval-more-body">
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h3>① 메일 해석: 규칙 방식 vs AI</h3><span class="muted small">메일 ${ev.mail.runs[0].mails}통 · 별도 작성자 출제</span></div><div class="panel-body">${mailTable}
      <p class="small" style="margin:8px 0 0">시험지(eval/mail-challenge)는 규칙 파서 코드를 보지 않은 별도 작성자가 명세만 보고 만들었고, 어느 쪽도 실행하기 전에 커밋했습니다. LLM은 정답을 보지 않고 고정 프롬프트로 메일만 읽었습니다(${h(ev.mail.llmMeta?.runner || '')}, ${h(ev.mail.llmMeta?.model || '')}). <b>한계:</b> 출제자와 해석자가 같은 계열 모델이라 문체가 익숙했을 수 있고, 실제 메일이 아닌 합성 102통이며, API 재실행 시 결과가 달라질 수 있습니다. 출력 원본: <code>eval/mail-challenge/llm-*.json</code>. 앱 화면은 준비된 사례 메일에 대해 같은 방식으로 미리 실행한 AI 결과를 쓰고(실시간 호출 아님), 메일 내용을 직접 고치면 규칙 방식으로 읽습니다.</p></div></div>
    <div class="panel"><div class="panel-head"><h3>② 같은 메일 정보를 준 엑셀식 비교와 견줌 (참고값)</h3></div><div class="panel-body">
      <p class="small" style="margin:8px 0 0">기준선3은 단순 대조에 엔진과 <b>같은 메일 지시</b>를 줬습니다. 같은 정보를 주면 놓친 오류는 둘 다 0이고, 엔진의 차이는 <b>개별 검토량</b>(표기 차이·인물 대응·오류 규칙)에서 나옵니다. 이미 결과를 본 홀드아웃을 지금 코드로 다시 잰 값이라 참고값입니다(<code>docs/eval-final.md</code>, H3·H4 포함). H4는 60쌍 모두 문서 차단 → 수동 검토(절감 아님).</p></div></div>
  </div>
  <h3 class="section-title" style="margin-top:24px">개발 과정 기록 — 개발 때 쓰지 않은 시험 세트(홀드아웃)의 첫 측정</h3>
  <p class="section-lead">합성 수정본 쌍 320개(개발 140 · 홀드아웃 H1·H2 60 · H3 60 · H4 60), 라벨된 실질 변경 ${total}건. 각 홀드아웃은 한 번만 씁니다. <b>합성 데이터 결과라 실제 현장 명부·메일에서는 다를 수 있습니다.</b> 현장 업무시간 절감은 주장하지 않으며 후속 PoC 과제입니다.</p>
  <div class="panel eval-summary"><b>요약 — 세 홀드아웃의 1회차를 모두 공개하며 하나로 합치지 않습니다</b><ul class="facts small" style="margin:6px 0 0">
    <li><b>개발에 쓰지 않은 서식(H1·H2)</b>: 확인 대상에서 빠진 실제 오류 ${first.engine.review.missedErrorsOutside}건(단순 대조는 ${first.baselineRow.review.missedErrorsOutside}건·${first.baselineId.review.missedErrorsOutside}건), 담당자가 개별 확인할 범위 ${pc(first.engine.review.ratio)}.</li>
    <li><b>처음 보는 날짜·머리글(H3)</b>: 놓친 오류는 ${h3.engine.review.missedErrorsOutside}건이었지만 경보가 많아(쌍당 ${h3.engine.falseAlarms.perPair.toFixed(2)}건) 단순 여권번호 대조(${h3.baselineId.falseAlarms.perPair.toFixed(2)}건)보다 확인 부담이 컸습니다.</li>
    <li><b>처음 보는 언어의 머리글(H4)</b>: 명부를 읽지 못했습니다(실질 변경 재현율 ${pc(h4.engine.substantiveRecall.rate)}). 지금은 이런 문서를 자동으로 막고 사람에게 넘깁니다. 실서비스는 AI로 머리글을 매핑할 계획이며, 머리글 매핑 AI의 성능은 아직 측정하지 않았습니다(메일 해석 AI만 위 ①에서 측정).</li>
  </ul></div>
  <h3 class="section-title">1. 개발 때 쓰지 않은 양식 시험 — 첫 측정</h3>
  <div class="panel" style="margin-top:8px"><div class="panel-head"><h3>H1·H2 1회차(한국어 머리글 · 약어 머리글·미국식 날짜)</h3><span class="muted small">쌍 ${first.engine.pairs} · 라벨 ${first.engine.labels.total} · 오류 ${first.engine.labels.suspect}</span></div>
    <div class="panel-body">${metricTable(first, 'H1·H2 1회차')}
    <p class="small" style="margin:8px 0 0">이 결과를 본 뒤 엔진 버그 3건(한쪽 버전에만 있는 열을 변경으로 잡음, 미국식 날짜의 입항일·메일 날짜 해석)을 고쳤으므로 H1·H2는 더 이상 깨끗한 홀드아웃이 아닙니다. 그래서 H3를 새로 만들었습니다.</p></div></div>
  <h3 class="section-title" style="margin-top:24px">2. 처음 보는 양식 시험 — 약점 확인</h3>
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h3>H4 1회차(개선 후, 처음 보는 언어의 머리글)</h3><span class="muted small">쌍 ${h4.engine.pairs} · 오류 ${h4.engine.labels.suspect}</span></div>
      <div class="panel-body">${metricTable(h4, 'H4 1회차', true)}
      <p class="small" style="margin:8px 0 0"><b>실패:</b> 독일어·인도네시아어 머리글에서 머리글 행 자체를 찾지 못해(머리글 행 판정에는 별칭 사전으로 5개 이상 인식이 필요) 명부를 0행으로 읽었습니다. 추정 매핑·열 단위 경보는 머리글 행을 찾은 뒤에만 동작하므로 쓰이지 못했습니다. 엔진은 메일 지시만 처리했고(R8 8건 탐지, 오경보 ${h4.engine.falseAlarms.total}건), 기준선도 같은 파서를 빌려 쓰므로 0건 탐지입니다. 검수 범위는 셀 수가 0이라 계산할 수 없습니다. 당시 엔진은 경고 문구만 띄우고 진행했습니다(조용한 실패). <b>이 결과를 본 뒤 명부를 읽지 못하면 승인 단계로 못 가게 막는 문서 단위 차단을 넣었습니다</b>(수치는 다시 재지 않음, <code>node eval/fail-loud-check.mjs</code>: 60쌍 모두 차단).</p>
      <p class="small muted" style="margin:6px 0 0">빠진 실제 오류(엔진): ${missed(h4)}. 설계: <code>eval/H4-spec.md</code></p></div></div>
    <div class="panel"><div class="panel-head"><h3>H3 1회차(개선 전, 처음 보는 날짜·머리글)</h3><span class="muted small">쌍 ${h3.engine.pairs} · 오류 ${h3.engine.labels.suspect}</span></div>
      <div class="panel-body">${metricTable(h3, 'H3 1회차', true)}
      <p class="small" style="margin:8px 0 0">두 자리 연도 만료일을 판독 불가로 처리해 모든 만료일 칸에 R6 경보(오경보 대부분), 머리글 <code>Nacionalidad</code>·<code>Lugar de nacimiento</code> 미인식, 메일 "should be 값" 문형 미해석. 이 결과를 본 뒤 일반화 개선(두 자리 연도, 추정 매핑, 열 단위 경보, 정정 문형)을 했습니다.</p>
      <p class="small muted" style="margin:6px 0 0">빠진 실제 오류(엔진): ${missed(h3)}. 설계: <code>eval/H3-spec.md</code></p></div></div>
  </div>
  <p class="small muted" style="margin:8px 0 0">기준선1 행 = 같은 행 번호끼리 문자열 대조, 기준선2 ID키 = 여권번호로 행을 맞춘 뒤 문자열 대조. 검수 범위 = 개별 확인 항목(엔진: 오류 의심+확인 필요 / 기준선: 모든 경보) ÷ 수정본 셀 수이며, 항상 <b>검수 대상에서 빠진 실제 오류 수</b>와 함께 봅니다. 열 단위 서식 경보는 셀 오경보와 따로 셉니다.</p>
  <div class="two-col" style="margin-top:16px">
    <div class="panel"><div class="panel-head"><h3>오류 유형별 — H4 1회차</h3></div><div class="panel-body">${ruleTable(h4)}</div></div>
    <div class="panel"><div class="panel-head"><h3>오류 유형별 — H3 1회차</h3></div><div class="panel-body">${ruleTable(h3)}</div></div>
  </div>
  <h3 class="section-title" style="margin-top:24px">3. 참고값 (결과를 본 뒤 고친 코드로 다시 잰 값)</h3>
  <div class="two-col" style="margin-top:16px">
    <div class="panel"><div class="panel-head"><h3>홀드아웃 H1·H2 — 버그 수정 후 재실행(규칙 수정에 사용됨, 참고값)</h3></div><div class="panel-body">${metricTable(cur, 'H1·H2 수정 후', true)}<p class="small muted" style="margin:8px 0 0">기준선1 행 = 행 번호 대조, 기준선2 ID키 = 신분증번호 키 대조. 머리글 별칭 사전은 고치지 않았습니다.</p></div></div>
    <div class="panel"><div class="panel-head"><h3>개발 세트 (튜닝에 사용, 참고값)</h3></div><div class="panel-body">${metricTable(dev, '개발 세트', true)}<p class="small muted" style="margin:8px 0 0">규칙과 생성기를 같은 사람이 만들었기 때문에 개발 세트 수치는 낙관적입니다.</p></div></div>
  </div>
  <div class="two-col" style="margin-top:16px">
    <div class="panel"><div class="panel-head"><h3>한계</h3></div><div class="panel-body"><ul class="facts small">
      <li>평가 대상은 대조·분류 엔진입니다. PDF·스캔 이미지에서 표를 뽑는 단계(실서비스의 LLM 추출)는 평가하지 않았습니다.</li>
      <li>메일은 생성기 문형(영어 3종·한국어 1종·인도네시아어 혼합 1종)으로 만들었고, 메일 파서는 규칙 기반입니다. 실제 메일의 다양한 문체에서는 연결률이 낮아질 수 있습니다(H3의 "should be" 문형이 그 예).</li>
      <li>오류 유형·비율은 설계자가 정했습니다. 실제 현장 오류 분포가 아닙니다.</li>
      <li>기준선은 엔진의 머리글 인식을 빌려 쓴 유리한 조건입니다(사람이 열을 맞춘 엑셀 대조).</li>
      <li>머리글 겹침(정규화 기준): H2는 12개 중 3개(LAST NAME·BIRTH PLACE·SEX), H3는 1개(Doc. Type)가 개발용과 같고, H4는 겹치지 않습니다.</li>
      <li>머리글 행 판정이 별칭 사전에 의존해, 처음 보는 언어의 머리글(H4)에서는 명부 전체를 읽지 못합니다. 지금은 이 경우 진행을 막고 사람에게 넘기며, 실서비스는 LLM 추출로 머리글을 FAL 5 항목에 매핑하고 회사별 서식을 PoC 초기에 등록합니다.</li>
    </ul></div></div>
    <div class="panel"><div class="panel-head"><h3>재현 방법</h3></div><div class="panel-body small">
      <p><code class="cmd">node eval/run.mjs --split all</code> → <code>docs/eval-result.json</code>, <code>docs/eval-result.md</code> (개발·H1·H2, 현재 코드, 시드 ${ev.current.seed})</p>
      <p>H4·H3 1회차 원본: <code>docs/eval-H4-first-run.json</code>, <code>docs/eval-H3-first-run.json</code> — <code>node eval/run.mjs --split h3|h4</code>는 결과 파일이 있으면 재실행을 거부합니다.</p>
      <p>H1·H2 1회차 원본: <code>docs/eval-holdout-first-run.json</code> (커밋 기록으로 시점 확인 가능)</p>
      <p class="muted">이 화면의 수치는 위 JSON 파일을 그대로 읽어 표시합니다.</p></div></div>
  </div></div></details>`;
}

// ---------------- 범위·법령 탭 ----------------
function renderScope() {
  $('#tab-scope').innerHTML = `
  <h2 class="section-title">범위와 근거</h2>
  <ul class="facts scope-sum">
    <li><b>하는 일</b> 선원명부 최초본·수정본·메일을 대조해 변경마다 오류 의심 · 확인 필요 · 예상된 변경으로 나누고 근거를 보여 줌</li>
    <li><b>하지 않는 일</b> 신고 전송, 과태료 대상 판단, 화물목록(FAL 2) 등 다른 서식</li>
    <li><b>근거</b> 오류 의심 규칙 8가지 · 출입국·세관·항만·검역 법령 원문 · IMO FAL Form 5 항목</li>
  </ul>
  <details class="raw panel"><summary>하는 일 · 하지 않는 일 자세히</summary><div class="two-col" style="padding:12px">
    <div class="panel"><div class="panel-head"><h3>하는 일</h3></div><div class="panel-body"><ul class="facts">
      <li>선원명부(IMO FAL Form 5) 최초본·수정본·수정 메일 대조</li>
      <li>행 순서와 무관한 인물 대응(여권번호 → 성명+생년월일 → 성명)</li>
      <li>변경마다 예상된 변경 / 확인 필요 / 오류 의심 3단계 분류와 근거 표시</li>
      <li>표기만 다른 것(대소문자·공백·날짜 형식·직급 약어·행 순서)은 경보하지 않음</li>
      <li>담당자 결정(수정본 반영·최초본 유지·선사 문의). 선사 문의가 남으면 미확정 검토본, 모두 정해지면 FAL 5 순서 확정 명부와 서명된 확정 기록</li>
    </ul></div></div>
    <div class="panel"><div class="panel-head"><h3>하지 않는 일</h3></div><div class="panel-body"><ul class="facts">
      <li>신고 전송(출입국·세관·항만·검역 시스템 연동 없음). KL-Net·정부 창구 연계는 향후 연계 후보이며 연동을 확인하지 않았습니다.</li>
      <li>화물목록(FAL 2) 등 다른 서식 — 확장 계획</li>
      <li>과태료·벌칙 대상 여부 판단</li>
      <li>현장 업무시간 절감 주장 — 후속 PoC에서 검증</li>
    </ul></div></div>
  </div></details>
  <details class="raw panel"><summary>오류 의심 규칙 8가지</summary><div class="panel-body"><table class="grid"><tbody>${Object.values(RULES).map((r) => `<tr><td class="mono" style="width:40px"><b>${r.id}</b></td><td style="width:140px">${h(r.title)}</td><td>${h(r.desc)}</td></tr>`).join('')}</tbody></table>
  <p class="small muted" style="margin:8px 0 0">분류 우선순위: 값 자체가 잘못된 규칙(R4·R6·R7)은 메일 지시가 있어도 오류 의심 → 메일 지시 값과 일치하면 예상된 변경(R1~R3 모양이어도) → 지시 값과 다르면 R8 → R1~R3 → 나머지 확인 필요.</p></div></details>
  <details class="raw panel"><summary>법령 근거 (law.go.kr 원문 인용)</summary><div class="panel-body">
    ${Object.values(LAWS).map((l) => `<div class="law-cite"><b>${h(l.law)} ${h(l.article)}</b> <span class="muted small">${h(l.version)}</span><blockquote style="margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--borderColor-default);background:var(--bgColor-muted)">${h(l.quote)}</blockquote>${l.quoteNote ? `<p class="small muted" style="margin:2px 0 0">${h(l.quoteNote)}</p>` : ''}</div>`).join('')}
    <div class="law-cite"><b>${h(IMMIGRATION_PENALTY.law)} ${h(IMMIGRATION_PENALTY.article)}</b> <span class="muted small">${h(LAWS.immigration.version)}</span><blockquote style="margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--borderColor-default);background:var(--bgColor-muted)">${h(IMMIGRATION_PENALTY.head)}<br>5. ${h(IMMIGRATION_PENALTY.quote)}</blockquote><p class="small muted" style="margin:2px 0 0">${h(IMMIGRATION_PENALTY.caution)}</p></div>
  </div></details>
  <details class="raw panel"><summary>IMO FAL Form 5 항목 (FAL5_DE_2018.pdf)</summary><div class="panel-body"><p class="small" style="margin:0">${[...HEADER_FIELDS, { fal: '6', en: 'No.', ko: '번호' }, ...ROW_FIELDS, { fal: '18', en: 'Date and signature by master, authorized agent or officer', ko: '서명' }].map((f) => `${f.fal}. ${h(f.en)} (${h(f.ko)})`).join(' · ')}</p></div></details>`;
}

// ---------------- 업무 시스템 화면(메뉴) ----------------
// 입항 예정 선박 → 항차 탭(개요 · 선원명부 · 선사 문의 · 신고 준비) + 오른쪽 메일함.
// 대표 흐름(DEMO HANBIT 3)은 사례 2 → 사례 5. 다른 배는 사례 1·3·4·6을 화면용 가상 이름으로 보여 준다. 건수는 모두 엔진을 실제로 돌린 값.
const KDATE = (s) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\D+(\d{1,2}):(\d{2})/); return m ? new Date(2026, m[1] - 1, +m[2], +m[3], +m[4]) : null; };
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const mdw = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DOW[d.getDay()]})`;
const addMin = (d, m) => new Date(d.getTime() + m * 60000);

const SHIPST = Object.fromEntries(SHIPS.map((s) => [s.key, { ...s, sent: null }]));
const REP = {};
let D = null; // 대표 흐름 데이터
const curShip = () => SHIPST[state.ship] || SHIPST.hanbit;
const shipOfScenario = (n) => Object.values(SHIPST).find((s) => s.scenario === n || s.reply === n) || SHIPST.hanbit;
// 화면용 배 이름 바꾸기(사례 데이터는 모두 DEMO HANBIT 3라서). 판정 입력에는 쓰지 않음.
function shipify(str, ship = curShip()) {
  if (!ship || ship.hero) return str;
  return String(str).replaceAll('DEMO HANBIT 3', ship.name).replaceAll('2611E', ship.voy);
}

async function prepareDemo() {
  const s2 = SCENARIOS[1], s5 = SCENARIOS[4];
  const r2 = compareWith(2, { a: s2.a, b: s2.b, mail: s2.mail });
  const d2 = {}; for (const it of r2.items) d2[it.id] = it.class === 'expected' ? 'approve' : 'pending';
  const r5 = compareWith(5, { a: s5.a, b: s5.b, mail: s5.mail });
  const d5 = {}; for (const it of r5.items) d5[it.id] = 'approve';
  const t1 = KDATE(s2.ctx.at), t3 = KDATE(s5.ctx.v1), t4 = KDATE(s5.ctx.at), due = KDATE(s2.ctx.due);
  const t6 = new Date(2026, 10, 3, 6, 10); // 시연용 가상 시각
  let conf = null;
  try {
    const finalCsv = toFal5Csv(r5, d5);
    const payload = await buildConfirmation({ report: r5, decisions: d5, approver: '데모 담당자', at: '2026-11-03T01:17:00+09:00', finalCsv });
    conf = { payload, jws: await signConfirmation(payload), finalCsv };
  } catch { conf = null; }
  const m5 = splitMail(s5.mail);
  const reply = { id: 'in5-hanbit', box: 'in', from: m5.head.from || s5.ctx.from, at: t4, subject: m5.head.subject || '회신', body: m5.body, sc: 5, files: ['수정본 선원명부 V3', `${r5.B.rows.length}명`] };
  D = { r2, d2, r5, d5, t1, t3, t4, t6, due, conf, reply };
  REP.hanbit2 = r2; REP.hanbit5 = r5;
  for (const sh of SHIPS) if (!sh.hero) { const sc = SCENARIOS[sh.scenario - 1]; REP[sh.key] = compareWith(sh.scenario, { a: sc.a, b: sc.b, mail: sc.mail }); }
}
const shipReport = (sh) => (sh.hero ? (['reply', 'final'].includes(sh.stage) ? REP.hanbit5 : REP.hanbit2) : REP[sh.key]);

// 대표 배를 특정 진행 상태로 맞춘다(시연 장면·바로가기 주소용).
function heroAt(stage) {
  const H = SHIPST.hanbit;
  if (state.ship !== 'hanbit') saveWs();
  H.ws = null;
  H.stage = stage;
  H.sent = ['asked', 'reply', 'final'].includes(stage) ? { at: D.t3, decisions: { ...D.d2 }, report: D.r2, text: shipperSummary(D.r2, D.d2) } : null;
  state.ship = 'hanbit';
  loadScenario(['reply', 'final'].includes(stage) ? 5 : 2);
  run();
  if (stage === 'asked') state.decisions = { ...D.d2 };
  if (stage === 'final') { state.decisions = { ...D.d5 }; state.conf = D.conf ? { ...D.conf, verify: null } : null; }
}
// 배마다 작업 상태(대조 결과·결정)를 보관해, 항차 탭을 오가도 결정이 남게 한다.
function saveWs() {
  const sh = SHIPST[state.ship];
  if (sh && state.report) sh.ws = { scenario: state.scenario, inputs: state.inputs, report: state.report, decisions: { ...state.decisions }, conf: state.conf, step: state.step, selected: state.selected, rebased: state.rebased, filter: state.filter };
}
function selectShip(key) {
  const sh = SHIPST[key];
  if (!sh) return;
  if (state.ship === key && state.report && (state.scenario === sh.scenario || state.scenario === sh.reply)) return;
  saveWs();
  state.ship = key;
  if (sh.ws) { Object.assign(state, sh.ws, { decisions: { ...sh.ws.decisions } }); return; }
  loadScenario(sh.hero && ['reply', 'final'].includes(sh.stage) ? sh.reply : sh.scenario);
  run();
  state.step = 2;
  if (sh.sent && state.scenario === sh.scenario) state.decisions = { ...sh.sent.decisions };
}

function sysNow() {
  if (DEMO.on) return demoBeats()[DEMO.beat].t;
  const c = HERO_CLOCK[SHIPST.hanbit.stage] || HERO_CLOCK.new;
  return new Date(2026, c[0] - 1, c[1], c[2], c[3]);
}
function remain(now, due) {
  const m = Math.round((due - now) / 60000);
  if (m <= 0) return '마감 지남';
  const dd = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  return dd ? `${dd}일 ${hh}시간` : hh ? `${hh}시간 ${mm}분` : `${mm}분`;
}
const stageBadge = (stage) => `<span class="st-badge ${STAGE[stage].tone}">${STAGE[stage].label}</span>`;

// ---- 오른쪽 메일함: 배 5척의 받은·보낸 메일(시간순) ----
const fmtAt = (d) => `${mdw(d)} ${hhmm(d)}`;
function mailsOf(sh) {
  const sc = SCENARIOS[sh.scenario - 1];
  const m = splitMail(sc.mail);
  const rep = sh.hero ? REP.hanbit2 : REP[sh.key];
  const list = [
    { id: `in0-${sh.key}`, ship: sh.key, box: 'in', from: SENDER[sh.key], at: KDATE(sc.ctx.v1), subject: `[${sh.name} V.${sh.voy}] 선원명부 송부(최초본)`, body: `${sh.name} V.${sh.voy} ${sh.port} 입항 선원명부(최초본)를 송부드립니다.`, sc: 0, tags: [TAG.v1], files: ['최초본 선원명부', `${rep.A.rows.length}명`] },
    { id: `in-${sh.key}`, ship: sh.key, box: 'in', from: SENDER[sh.key], at: KDATE(sc.ctx.at), subject: m.head.subject || '수정 선원명부', body: m.body, sc: sh.scenario, tags: [KIND_BY_SCENARIO[sh.scenario]], files: [sh.hero ? '수정본 선원명부 V2' : '수정본 선원명부', `${rep.B.rows.length}명`] },
  ];
  if (sh.sent) list.push({ id: `out-${sh.key}`, ship: sh.key, box: 'out', from: ME, to: sh.hero ? '선장' : '선사', at: sh.sent.at, subject: `[${sh.name} ${sh.voy}] 수정 선원명부 확인 요청`, body: sh.sent.text, sc: 0, tags: [TAG.sent] });
  if (sh.hero && ['reply', 'final'].includes(sh.stage)) list.push({ ...D.reply, ship: sh.key, from: MASTER, tags: [KIND_BY_SCENARIO[5]] });
  return list;
}
const allMails = () => { const now = sysNow(); return Object.values(SHIPST).flatMap(mailsOf).filter((m) => m.at <= now).sort((a, b) => b.at - a.at); };
const mailIdOfScenario = (n) => (n === 5 ? 'in5-hanbit' : `in-${shipOfScenario(n).key}`);
function isFresh(m) {
  if (state.read.has(m.id)) return false;
  const sh = SHIPST[m.ship];
  return (m.id === `in-${sh.key}` && sh.stage === 'new') || (m.id === 'in5-hanbit' && sh.stage === 'reply');
}
function firstLine(body) {
  return String(body || '').split('\n').map((l) => l.trim()).find((l) => l && !/^(dear|hello|hi|captain|안녕|수고)/i.test(l)) || '';
}
// AI가 미리 읽어 둔 결과를 한 줄로
function aiChip(sc) {
  const ai = AI.byId[`S${sc}`];
  if (!ai) return '';
  const on = ai.instructions.filter((x) => x.apply), off = ai.instructions.filter((x) => !x.apply);
  const one = (arr, map, key, fb) => { const k = [...new Set(arr.map((x) => x[key]))]; return k.length === 1 ? map[k[0]] || fb : fb; };
  const parts = [];
  if (on.length) parts.push(`${one(on, AI_TYPE_SHORT, 'type', '요청')} ${on.length}건 반영`);
  if (off.length) parts.push(`${one(off, AI_SKIP_SHORT, 'not_applied_reason', '요청')} ${off.length}건 제외`);
  return `<span class="ai-chip" title="AI가 미리 읽어 둔 결과${AI.meta?.model ? ` · ${h(AI.meta.model)}` : ''}"><i class="ti ti-sparkles" aria-hidden="true"></i>AI · ${h(parts.join(' / ') || '반영할 요청 없음')}</span>`;
}
function mailOpen(m, sh) {
  const ai = m.sc ? aiFor(m.sc, SCENARIOS[m.sc - 1].mail) : null;
  return `<div class="mb-open">
    <pre class="mail-body">${shipify(m.sc ? mailBodyHtml(m.body, ai) : h(m.body), sh)}</pre>
    ${m.files ? `<div class="mb-file"><i class="ti ti-paperclip" aria-hidden="true"></i> ${h(m.files[0])} <span class="muted">${h(m.files[1])}</span></div>` : ''}
    ${m.sc ? `<button type="button" class="btn btn-primary btn-sm" data-cmp="${m.id}"><i class="ti ti-arrows-diff" aria-hidden="true"></i> 이 메일로 명부 대조</button>` : ''}
  </div>`;
}
function mailItem(m, scope) {
  const sh = SHIPST[m.ship];
  const open = state.mail === m.id;
  const fresh = isFresh(m);
  return `<li class="mb-item${open ? ' open' : ''}${fresh ? ' fresh' : ''}" data-mail-li="${m.id}">
    <button type="button" class="mb-row" data-mailid="${m.id}" aria-expanded="${open}">
      <span class="mb-from">${fresh ? '<span class="mb-dot" title="새 메일"></span>' : ''}${m.box === 'out' ? '<i class="ti ti-send" aria-hidden="true"></i> ' : ''}${h(m.box === 'out' ? `${m.from} → ${m.to}` : m.from)}</span>
      <span class="mb-at">${fmtAt(m.at)}</span>
      <span class="mb-subj">${shipify(h(m.subject), sh)}</span>
      <span class="mb-first">${shipify(h(firstLine(m.body)), sh)}</span>
      <span class="mb-tags">${scope === 'all' ? `<span class="tag ship">${h(sh.name)} · ${h(sh.voy)}</span>` : ''}<span class="tag">${TAG.list}</span>${m.tags.map((t) => `<span class="tag work${m.box === 'out' ? ' out' : ''}">${h(t)}</span>`).join('')}${m.sc ? aiChip(m.sc) : ''}</span>
    </button>
    ${open ? mailOpen(m, sh) : ''}
  </li>`;
}
function mailScope() { return VOYAGE_PAGES.includes(state.page) ? state.mailScope : 'all'; }
function mailList() {
  const scope = mailScope();
  let list = allMails();
  if (scope === 'voyage') list = list.filter((m) => m.ship === state.ship);
  const q = state.mailQ.trim().toLowerCase();
  if (q) list = list.filter((m) => [m.from, m.subject, m.body, ...m.tags, SHIPST[m.ship].name].join(' ').toLowerCase().includes(q));
  return { n: list.length, html: list.map((m) => mailItem(m, scope)).join('') || '<li class="mb-empty muted small">메일 없음</li>' };
}
function mailboxHtml() {
  const scope = mailScope();
  const L = mailList();
  const seg = VOYAGE_PAGES.includes(state.page) ? `<div class="seg mb-seg" role="group" aria-label="메일 범위"><button type="button" data-mail-scope="voyage" aria-pressed="${scope === 'voyage'}">이 항차</button><button type="button" data-mail-scope="all" aria-pressed="${scope === 'all'}">전체</button></div>` : '';
  return `<div class="mb-head"><div class="mb-title"><b>메일함</b><span class="mb-n muted small">${L.n}</span>${seg}</div>
    <label class="mb-search"><i class="ti ti-search" aria-hidden="true"></i><input type="search" class="mb-q form-control form-control-sm" placeholder="보낸 사람·제목·본문 검색" value="${h(state.mailQ)}" aria-label="메일 검색"></label></div>
    <ul class="mb-list">${L.html}</ul>`;
}
function renderMailbox() {
  $('#mailbox').innerHTML = mailboxHtml();
  if (state.page === 'mail') $('#pg-mail').innerHTML = mailboxHtml();
}
function refreshMailLists() {
  const L = mailList();
  for (const box of [$('#mailbox'), $('#pg-mail')]) { if (!box?.querySelector('.mb-list')) continue; box.querySelector('.mb-list').innerHTML = L.html; box.querySelector('.mb-n').textContent = L.n; }
}

// ---- 공통 틀: 아이콘 레일 · 상단 바 · 열린 항차 탭 · 항차 머리 ----
const RAIL = [['ships', 'ti-ship', '입항 예정 선박', '선박'], ['eval', 'ti-chart-bar', '평가 결과', '평가'], ['scope', 'ti-scale', '범위·근거', '근거']];
function renderChrome() {
  const cur = state.page;
  $('#sysRail').innerHTML = RAIL.map(([k, ic, label, short]) => `<button type="button" class="rail-item${k === 'ships' && VOYAGE_PAGES.includes(cur) ? ' in' : ''}" data-page="${k}" aria-current="${cur === k ? 'page' : 'false'}" title="${label}" aria-label="${label}"><i class="ti ${ic}" aria-hidden="true"></i><span class="rail-l" aria-hidden="true">${short}</span></button>`).join('');
  const onV = VOYAGE_PAGES.includes(cur);
  $('#vtabs').innerHTML = `<button type="button" class="vtab-home${cur === 'ships' ? ' cur' : ''}" data-page="ships" aria-label="입항 예정 선박 목록"><i class="ti ti-list" aria-hidden="true"></i></button>${state.open.map((k) => {
    const s = SHIPST[k];
    const on = onV && state.ship === k;
    return `<div class="vtab${on ? ' cur' : ''}"><button type="button" class="vtab-go" data-vtab="${k}" aria-current="${on ? 'page' : 'false'}" title="${h(s.name)} · V.${h(s.voy)}"><span class="vtab-t">${h(s.name)} · V.${h(s.voy)}</span></button><button type="button" class="vtab-x" data-vtab-close="${k}" aria-label="${h(s.name)} 탭 닫기"><i class="ti ti-x" aria-hidden="true"></i></button></div>`;
  }).join('')}`;
  renderVHead();
  const now = sysNow();
  $('#sysClock').innerHTML = `<i class="ti ti-clock" aria-hidden="true"></i><span class="sys-clock-t"><b>${hhmm(now)}</b><span>${mdw(now)} · ${DEMO.on ? '시연 시각' : '가상 시각'}</span></span>`;
  const fresh = allMails().filter(isFresh).length;
  $('#sysBellN').textContent = fresh || '';
  $('#sysBellN').hidden = !fresh;
  $('#sysBell').setAttribute('aria-label', `새 메일 ${fresh}건`);
  $('#sysBell').title = `새 메일 ${fresh}건`;
  // 상단 시연 버튼(data-act는 시연 중 'demo-end'로 바뀌므로 클래스로 찾는다)
  const db = $('.sys-demo-btn');
  db.innerHTML = DEMO.on ? '<i class="ti ti-player-stop" aria-hidden="true"></i><span class="lbl"> 시연 끝내기</span>' : '<i class="ti ti-player-play" aria-hidden="true"></i><span class="lbl"> 시연 시작</span>';
  db.dataset.act = DEMO.on ? 'demo-end' : 'demo-start';
  db.classList.toggle('on', DEMO.on);
  renderDemoBar();
  renderMailbox();
}
const VTABS = [['ship', '개요'], ['compare', '선원명부'], ['inquiry', '선사 문의'], ['report', '신고 준비'], ['mail', '메일']];
function renderVHead() {
  const el = $('#vHead');
  if (!VOYAGE_PAGES.includes(state.page)) { el.innerHTML = ''; return; }
  const sh = curShip();
  const now = sysNow(), due = KDATE(sh.due);
  const sit = ['compare', 'report'].includes(state.page) ? SCENARIOS[state.scenario - 1]?.ctx?.situation : '';
  el.innerHTML = `<div class="vh"><div class="vh-top"><h1 class="vh-title">${h(sh.name)} <span class="vh-voy">V.${h(sh.voy)}</span></h1>${stageBadge(sh.stage)}<span class="vh-due ${due - now < 12 * 3600e3 ? 'due-soon' : 'muted'}">보고 마감까지 ${remain(now, due)}</span>${info(sit)}</div>
    <nav class="vh-tabs" aria-label="항차 화면">${VTABS.map(([k, l]) => `<button type="button" class="vh-tab${k === 'mail' ? ' vh-mail' : ''}" data-page="${k}" aria-current="${state.page === k ? 'page' : 'false'}">${l}</button>`).join('')}</nav></div>`;
}

// ---- 첫 화면: 입항 예정 선박 ----
function hintSeen() { try { return localStorage.getItem('crewdiff-demo-hint') === '1'; } catch { return false; } }
function renderShips() {
  const now = sysNow();
  const ships = Object.values(SHIPST).sort((a, b) => KDATE(a.eta) - KDATE(b.eta));
  const cnt = (f) => ships.filter(f).length;
  const kpi = (n, label, tone) => `<div class="kpi ${tone || ''}"><span class="kpi-n">${n}</span><span class="kpi-l">${label}</span></div>`;
  const rows = ships.map((sh) => {
    const rep = shipReport(sh);
    const see = rep.summary.suspect + rep.summary.check;
    const due = KDATE(sh.due);
    const soon = due - now < 12 * 3600e3;
    const pend = sh.sent ? pendingItems(sh.sent.report, sh.sent.decisions).length : 0;
    const look = {
      new: '새 수정본',
      v2: rep.blocked ? '판독 실패 · 사람 검토' : `<b>${see}건</b>`,
      asked: `회신 대기 · <b>${pend}건</b>`,
      reply: '<b>회신 도착</b>',
      final: '없음',
    }[sh.stage];
    const isNew = sh.stage === 'new' || (sh.hero && sh.stage === 'reply');
    return `<li><button type="button" class="ship-row${isNew ? ' fresh' : ''}" data-ship="${sh.key}">
      <span class="c-st">${stageBadge(sh.stage)}</span>
      <span class="c-ship"><b>${h(sh.name)}</b><span class="muted small">V.${h(sh.voy)}</span></span>
      <span class="c-eta"><span class="lbl-m">입항</span>${h(sh.eta.replace(/\(.\)/, ''))} <span class="muted small">${h(sh.port)}</span></span>
      <span class="c-due ${soon ? 'due-soon' : ''}"><span class="lbl-m">마감까지</span>${remain(now, due)}</span>
      <span class="c-list"><span class="lbl-m">봐야 할 곳</span><span>${look}</span></span>
    </button></li>`;
  }).join('');
  $('#pg-ships').innerHTML = `<div class="pg-head"><h1 class="pg-title">입항 예정 선박${info('입항 순. 마감은 출입국 보고 마감(입항 2시간 전). 배를 누르면 항차 탭이 열립니다.')}</h1></div>
    ${!DEMO.on && !hintSeen() ? `<div class="demo-hint"><div>선사가 보낸 수정본과 정정 메일을 대조해 <b>바뀐 곳 중 꼭 봐야 할 곳만</b> 골라 줍니다. <b>시연 시작</b>을 눌러 보세요.</div><button type="button" class="btn btn-sm btn-primary" data-act="demo-start">시연 시작</button><button type="button" class="btn btn-sm" data-act="hint-close" aria-label="안내 닫기">닫기</button></div>` : ''}
    <div class="kpis">${kpi(cnt((s) => ['new', 'v2', 'reply'].includes(s.stage)), '대조할 명부', 'todo')}${kpi(cnt((s) => s.stage === 'asked'), '선사 문의 중', 'wait')}${kpi(cnt((s) => s.stage === 'final'), '확정', 'ok')}</div>
    <div class="panel ship-list-panel">
      <div class="ship-head" aria-hidden="true"><span>상태</span><span>선박</span><span>입항</span><span>마감까지</span><span>봐야 할 곳</span></div>
      <ul class="ship-list">${rows}</ul></div>`;
}

// ---- 항차 개요: 항로 지도 + 일정 ----
// 거리는 경유점 사이 대권거리(nm) 합. 현재 위치는 출항~입항 시각 사이를 거리 비례로 선형 보간(가상 시각 기준).
const rad = (x) => (x * Math.PI) / 180;
function gcNm(a, b) {
  const s = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 3440.065 * Math.asin(Math.sqrt(s));
}
function routeOf(sh) {
  const ro = ROUTES[sh.key];
  if (!ro) return null;
  const pts = [ro.from.pos, ...ro.via, ro.to.pos];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + gcNm(pts[i - 1], pts[i]));
  const total = cum[cum.length - 1];
  const dep = KDATE(ro.from.at), arr = KDATE(sh.eta), now = sysNow();
  const f = Math.min(1, Math.max(0, (now - dep) / (arr - dep)));
  const done = f * total;
  let i = 1;
  while (i < pts.length - 1 && cum[i] < done) i++;
  const seg = cum[i] - cum[i - 1];
  const k = seg ? Math.min(1, (done - cum[i - 1]) / seg) : 0;
  const cur = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
  return { ro, pts, total, dep, arr, now, f, done, cur, past: [...pts.slice(0, i), cur], left: [cur, ...pts.slice(i)], kn: total / ((arr - dep) / 3600000) };
}
const nm = (x) => `${Math.round(x).toLocaleString('en-US')} nm`;
const dm = (v, p, n) => { const a = Math.abs(v); return `${Math.floor(a)}°${String(Math.round((a % 1) * 60)).padStart(2, '0')}′${v >= 0 ? p : n}`; };
let MAP = null;
function dropMap() {
  if (MAP) { MAP.remove(); MAP = null; }
  delete document.documentElement.dataset.map;
}
function drawMap(r, sh) {
  dropMap();
  const el = $('#routeMap');
  if (!el || !window.L) return;
  const map = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false, zoomSnap: 0.25, attributionControl: true });
  MAP = map;
  document.documentElement.dataset.map = 'loading';
  // CARTO 무료 타일은 이제 API 키가 필요해(키 없이 받으면 'API KEY REQUIRED' 그림) Esri 어두운 회색 바탕을 쓴다.
  const tiles = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    minZoom: 3, maxZoom: 10,
    attribution: 'Tiles © <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  tiles.on('load', () => { if (MAP === map) document.documentElement.dataset.map = 'ready'; });
  tiles.addTo(map);
  map.attributionControl.setPrefix(false);
  L.polyline(r.left, { color: '#8fa6c2', weight: 2, opacity: 0.9, dashArray: '3 7', lineCap: 'round', interactive: false }).addTo(map);
  L.polyline(r.past, { color: '#58a6ff', weight: 3, opacity: 0.95, lineCap: 'round', interactive: false }).addTo(map);
  const port = (pos, fill, label) => L.circleMarker(pos, { radius: 6, color: '#0b1626', weight: 2, fillColor: fill, fillOpacity: 1, interactive: false })
    .bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -8], className: 'rt-label' }).addTo(map);
  port(r.ro.from.pos, '#2fbf71', r.ro.from.en);
  port(r.ro.to.pos, '#ef5a5a', r.ro.to.en);
  L.marker(r.cur, { icon: L.divIcon({ className: 'rt-ship', html: '<i class="ti ti-ship"></i>', iconSize: [30, 30], iconAnchor: [15, 15] }), keyboard: false, title: `${sh.name} 현재 위치(가상)` }).addTo(map);
  map.fitBounds(L.latLngBounds(r.pts), { paddingTopLeft: [64, 54], paddingBottomRight: [64, 30] });
}
function routePanel(sh, r) {
  const ro = r.ro;
  const sail = r.f <= 0 ? ['plan', '출항 전'] : r.f >= 1 ? ['done', '입항'] : ['cur', '항해 중'];
  const rows = [
    { st: 'done', t: r.dep, kind: '출항', title: ro.from.name, sub: `${ro.from.en} · ${ro.from.cc}`, badge: ['ok', '출항'] },
    { st: 'now', t: r.now, kind: '현재 위치', title: `${dm(r.cur[0], 'N', 'S')} ${dm(r.cur[1], 'E', 'W')}`, sub: `평균 ${r.kn.toFixed(1)} kn · ${DEMO.on ? '시연' : '가상'} 시각 기준`, badge: [sail[0] === 'cur' ? 'todo' : sail[0] === 'done' ? 'ok' : 'plan', sail[1]], d: r.done },
    { st: 'plan', t: r.arr, kind: '입항', title: sh.port, sub: `${ro.to.en} · ${ro.to.cc}`, badge: ['plan', '입항 예정'], d: r.total - r.done },
    { st: 'due', t: KDATE(sh.due), kind: '출입국 보고 마감', title: '입항 2시간 전', sub: `남은 시간 ${remain(r.now, KDATE(sh.due))}`, badge: ['due', '마감'] },
  ];
  return `<div class="panel rt-panel"><div class="panel-head"><h3>항로</h3><span class="small muted">${h(ro.from.name)} → ${h(sh.port)} · 총 ${nm(r.total)}${info('지도·출항 시각·현재 위치는 화면 표시용 가상 데이터입니다. 거리는 경유점 기준 대권거리 합, 현재 위치는 출항~입항 사이 선형 보간.')}</span></div>
    <div class="rt-grid"><div class="rt-map-wrap"><div id="routeMap" class="rt-map" role="img" aria-label="${h(ro.from.name)}에서 ${h(sh.port)}까지 항로 지도. 진행 ${Math.round(r.f * 100)}%"></div></div>
    <div class="rt-side"><div class="rt-prog"><span>진행 <b>${Math.round(r.f * 100)}%</b></span><span class="muted">${nm(r.done)} / ${nm(r.total)}</span><div class="rt-bar"><i style="width:${(r.f * 100).toFixed(1)}%"></i></div></div>
    <ol class="rt-itin">${rows.map((x) => `<li class="rt-${x.st}"><span class="rt-t">${mdw(x.t)}<b>${hhmm(x.t)}</b></span><span class="rt-dot" aria-hidden="true"></span>
      <span class="rt-b"><span class="rt-k">${h(x.kind)}<span class="st-badge ${x.badge[0]}">${x.badge[1]}</span></span><b>${h(x.title)}</b><span class="rt-sub">${h(x.sub)}</span></span>
      <span class="rt-d">${x.d != null ? nm(x.d) : ''}</span></li>`).join('')}</ol></div></div></div>`;
}

// ---- 항차 개요: 명부 버전 타임라인 ----
function renderShip() {
  const sh = curShip();
  const rep2 = sh.hero ? REP.hanbit2 : REP[sh.key];
  const sc = SCENARIOS[sh.scenario - 1];
  const at = ['new', 'v2', 'asked', 'reply', 'final'].indexOf(sh.stage);
  const see2 = rep2.summary.suspect + rep2.summary.check;
  const pend = sh.sent ? pendingItems(sh.sent.report, sh.sent.decisions).length : 0;
  const B = { done: ['ok', '완료'], cur: ['todo', '대조 필요'], wait: ['wait', '회신 대기'], plan: ['plan', '예정'], due: ['due', '마감'] };
  const act = (label, attr) => `<button type="button" class="btn btn-sm btn-primary" ${attr}>${label}</button>`;
  const ev = [
    { t: KDATE(sc.ctx.v1), title: '최초본', meta: `선원 ${rep2.A.rows.length}명`, st: 'done', mail: `in0-${sh.key}` },
    { t: KDATE(sc.ctx.at), title: sh.hero ? '수정본 V2 · 정정 요청 메일' : '수정본 · 메일', meta: rep2.blocked ? '판독 실패' : `봐야 할 곳 ${see2}건`, st: at <= 1 ? 'cur' : 'done', mail: `in-${sh.key}`, act: at <= 1 ? act('선원명부 대조', 'data-page="compare"') : '' },
  ];
  if (sh.hero || sh.sent) ev.push({ t: sh.sent ? sh.sent.at : null, title: '선사 문의', meta: sh.sent ? `확인 요청 ${pend}건` : '', st: !sh.sent ? 'plan' : at === 2 ? 'wait' : 'done', mail: sh.sent ? `out-${sh.key}` : '', act: at === 2 ? act('선사 문의 보기', 'data-page="inquiry"') : '' });
  if (sh.hero) ev.push({ t: at >= 3 ? D.t4 : null, title: '선장 회신 · 수정본 V3', meta: at >= 3 ? `예상된 변경 ${REP.hanbit5.summary.expected}건` : '', st: at < 3 ? 'plan' : at === 3 ? 'cur' : 'done', mail: at >= 3 ? 'in5-hanbit' : '', act: at === 3 ? act('다시 대조', 'data-act="reply-compare"') : '' });
  ev.push({ t: sh.stage === 'final' && sh.hero ? addMin(D.t4, 2) : null, title: '명부 확정', meta: sh.stage === 'final' ? '결정 기록 저장' : '', st: sh.stage === 'final' ? 'done' : 'plan', act: sh.stage === 'final' ? act('신고 준비', 'data-page="report"') : '' });
  ev.push({ t: KDATE(sh.due), title: '출입국 보고 마감', st: 'due' });
  const tl = `<ol class="itin">${ev.map((e) => `<li class="it-${e.st}">
    <span class="it-t">${e.t ? `${mdw(e.t)}<b>${hhmm(e.t)}</b>` : '—'}</span><span class="it-dot" aria-hidden="true"></span>
    <span class="it-b"><b>${h(e.title)}</b><span class="st-badge ${B[e.st][0]}">${B[e.st][1]}</span>${e.meta ? `<span class="it-meta">${h(e.meta)}</span>` : ''}</span>
    <span class="it-a">${e.mail ? `<button type="button" class="btn btn-sm btn-ghost-secondary" data-open-mail="${e.mail}" aria-label="${h(e.title)} 메일 보기" title="메일 보기"><i class="ti ti-mail" aria-hidden="true"></i></button>` : ''}${e.act || ''}</span></li>`).join('')}</ol>`;
  const route = routeOf(sh);
  dropMap();
  $('#pg-ship').innerHTML = `<p class="ov-line"><i class="ti ti-anchor" aria-hidden="true"></i> ${h(sh.port)} 입항 <b>${h(sh.eta)}</b><span class="muted"> · 선원 ${shipReport(sh).B.rows.length}명 · ${h(sh.operator)} · ${h(sh.flag)}</span></p>
    ${route ? routePanel(sh, route) : ''}
    <div class="panel"><div class="panel-head"><h3>명부 버전</h3></div><div class="panel-body">${tl}</div></div>`;
  if (route) drawMap(route, sh);
}

// ---- 선사 문의 ----
function inquiryItems(rep, dec) {
  const held = sortedItems(rep).filter((it) => pendingItems(rep, dec).includes(it));
  return `<div class="table-wrap"><table class="grid changes rp-items"><thead><tr><th>인물</th><th>분류</th><th>문의 내용</th><th>이유</th></tr></thead><tbody>${held.map((it) => `<tr><td class="person">${h(it.person)}</td><td><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></td><td>${changeText(it)}</td><td class="basis small">${h(basisText(it))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">문의 항목 없음</td></tr>'}</tbody></table></div>`;
}
function renderInquiry() {
  const sh = curShip();
  let sent;
  const rep = state.report;
  if (sh.sent) {
    sent = `<div class="panel"><div class="panel-head"><h3>보낸 확인 요청</h3><span class="small muted">${fmtAt(sh.sent.at)} · ${sh.hero ? '선장' : '선사'}에게 <button type="button" class="btn btn-sm btn-ghost-secondary" data-open-mail="out-${sh.key}" aria-label="보낸 메일 보기" title="메일 보기"><i class="ti ti-mail" aria-hidden="true"></i></button></span></div><div class="panel-body">
      ${inquiryItems(sh.sent.report, sh.sent.decisions)}</div></div>`;
  } else if (rep && !rep.blocked && allDecided() && pendingItems(rep, state.decisions).length) {
    sent = `<div class="panel"><div class="panel-head"><h3>확인 요청 작성</h3><span class="small muted">선사 문의 ${pendingItems(rep, state.decisions).length}건</span></div><div class="panel-body">
      ${inquiryItems(rep, state.decisions)}
      <textarea class="form-control summary mono" id="summary" aria-label="선사에 보낼 확인 요청" style="margin-top:10px">${shipify(h(shipperSummary()), sh)}</textarea>
      <div class="row-actions">${info('데모: 실제로 보내지 않고 메일함 보낸 메일에만 기록합니다.')}<span class="spacer"></span><button type="button" class="btn" data-act="copy-summary">복사</button><button type="button" class="btn" data-page="report">미확정 검토본 보기</button><button type="button" class="btn btn-primary" data-act="send-inquiry"><i class="ti ti-send" aria-hidden="true"></i> 확인 요청 보내기</button></div></div></div>`;
  } else {
    const msg = !rep ? '대조 결과가 없습니다.' : rep.blocked ? '명부 판독 실패로 결정할 수 없습니다. 원본 확인이 먼저입니다.' : !allDecided() ? `결정하지 않은 항목 ${rep.items.filter((it) => !state.decisions[it.id]).length}건. 선원명부 탭에서 먼저 정하세요.` : '선사 문의 항목 없음. 바로 신고 준비로 갈 수 있습니다.';
    const ok = rep && allDecided() && !rep.blocked;
    sent = `<div class="panel"><div class="panel-head"><h3>확인 요청</h3></div><div class="panel-body"><p style="margin:0 0 10px">${msg}</p><button type="button" class="btn btn-primary" data-page="${ok ? 'report' : 'compare'}">${ok ? '신고 준비 탭으로' : '선원명부 탭으로'}</button></div></div>`;
  }
  let recv;
  if (sh.hero && ['reply', 'final'].includes(sh.stage)) {
    recv = `<div class="panel"><div class="panel-body wait-box"><i class="ti ti-mail-down ok" aria-hidden="true"></i><div><b>선장 회신 · 수정본 V3</b><div class="small muted">${fmtAt(D.t4)} 도착</div></div>
      <button type="button" class="btn" data-open-mail="in5-hanbit"><i class="ti ti-mail" aria-hidden="true"></i> 메일 보기</button>${sh.stage === 'reply' ? '<button type="button" class="btn btn-primary" data-act="reply-compare"><i class="ti ti-arrows-diff" aria-hidden="true"></i> 기준본과 다시 대조</button>' : '<button type="button" class="btn" data-page="report">확정 명부 보기</button>'}</div></div>`;
  } else if (sh.sent) {
    recv = `<div class="panel"><div class="panel-body wait-box"><i class="ti ti-hourglass" aria-hidden="true"></i><div><b>회신 대기 중</b><div class="small muted">${hhmm(sh.sent.at)} 보냄</div></div>
      ${sh.hero ? '<button type="button" class="btn" data-act="reply-arrive"><i class="ti ti-mail-down" aria-hidden="true"></i> 회신 도착(시연용)</button>' : info('이 사례에는 회신 데이터가 없습니다. 회신 이후 흐름은 DEMO HANBIT 3에서 볼 수 있습니다.')}</div></div>`;
  } else recv = '<div class="panel"><div class="panel-body muted">받은 회신이 없습니다.</div></div>';
  $('#pg-inquiry').innerHTML = `<div class="inq-grid"><div class="stack">${sent}</div><div class="stack"><h2 class="sub-title" style="margin:0">회신${sh.hero ? info('회신 후 대조는 확정한 결정만 반영한 기준본과 수정본 V3를 비교합니다.') : ''}</h2>${recv}</div></div>`;
}

// ---- 신고 준비: 네 기관 ----
const AGENCY_SHORT = { immigration: ['출입국', 'ti-id'], customs: ['세관', 'ti-building-bank'], port: ['항만', 'ti-anchor'], quarantine: ['검역', 'ti-first-aid-kit'] };
function agencyPanel() {
  const r = state.report;
  const ready = r && !r.blocked && allDecided() && !pendingItems(r, state.decisions).length;
  const sh = curShip();
  return `<div class="agency-grid">${Object.values(LAWS).map((l) => `<div class="panel agency"><div class="ag-head"><i class="ti ${AGENCY_SHORT[l.id][1]}" aria-hidden="true"></i><b>${AGENCY_SHORT[l.id][0]}</b>${l.id === 'immigration' ? `<span class="small due-soon">마감 ${h(sh.due.replace(/\(.\)/, ''))}</span>` : ''}</div>
    <div class="small" title="제출처: ${h(l.agency)} · ${h(l.law)} ${h(l.article)}">${h(l.report)}</div>
    <button type="button" class="btn btn-sm${ready ? ' btn-primary' : ''}" data-act="dl-agency" data-ag="${l.id}" ${ready ? '' : 'disabled'}><i class="ti ti-download" aria-hidden="true"></i> 공통 확정 명부 CSV</button></div>`).join('')}</div>
    <p class="small muted" style="margin:8px 0 16px">${ready ? '네 곳 모두 같은 <b>공통 확정 명부</b>입니다. 기관별 제출 규격·추가 항목은 따로 확인해야 합니다.' : '<b>선사 문의·미결정 항목이 남아 내려받을 수 없습니다.</b>'}${info('신고는 담당자가 각 기관 시스템에 직접 입력·첨부합니다. 기관별 서식 변환이나 규격 확인은 하지 않습니다.')}</p>`;
}

// ---- 시연(현장 재현) ----
const DEMO = { on: false, beat: 0 };
function demoBeats() {
  const see2 = D.r2.summary.suspect + D.r2.summary.check;
  const pend2 = pendingItems(D.r2, D.d2).length, appr2 = D.r2.items.length - pend2;
  return [
    { scene: 1, t: D.t1, page: 'ships', title: '수정본 메일 도착', toast: 'in-hanbit', adv: (t) => t.dataset.ship === 'hanbit' || t.dataset.mailid === 'in-hanbit', cap: `입항 전날 ${hhmm(D.t1)}, 메일함에 “생년월일 1건 정정” 수정본이 왔습니다.`, setup: () => { heroAt('new'); state.open = []; } },
    { scene: 1, t: D.t1, page: 'ship', title: '메일 확인', adv: (t) => t.dataset.page === 'compare' || !!t.dataset.cmp, cap: 'AI가 읽은 요청은 메일의 근거 문장에 표시됩니다.', setup: () => { heroAt('v2'); state.mail = 'in-hanbit'; state.read.add('in-hanbit'); } },
    { scene: 2, t: addMin(D.t1, 2), page: 'compare', title: '선원명부 대조', cap: `요청은 1건인데, 꼭 봐야 할 곳은 ${see2}건입니다.`, setup: () => { heroAt('v2'); state.step = 2; state.filter = 'all'; state.selected = sortedItems()[0]?.id || null; } },
    { scene: 3, t: D.t3, page: 'inquiry', title: '선사 문의', toast: 'out-hanbit', adv: (t) => t.dataset.act === 'reply-arrive', cap: `근거 있는 ${appr2}건은 반영, 근거 없는 ${pend2}건은 선사 문의로 보냅니다.`, setup: () => { heroAt('asked'); } },
    { scene: 4, t: D.t4, page: 'inquiry', title: '선장 회신 도착', toast: 'in5-hanbit', adv: (t) => t.dataset.act === 'reply-compare', cap: `새벽 ${hhmm(D.t4)}, 선장 회신과 수정본 V3가 메일함에 왔습니다.`, setup: () => { heroAt('reply'); } },
    { scene: 5, t: addMin(D.t4, 2), page: 'compare', title: '다시 대조 · 확정', adv: (t) => t.dataset.act === 'next', cap: `다시 대조하니 ${D.r5.summary.expected}건 모두 예상된 변경이라 반영하고 확정합니다.`, setup: () => { heroAt('final'); state.step = 3; } },
    { scene: 6, t: D.t6, page: 'report', title: '공통 명부 확정', cap: `${hhmm(D.t6)}, 공통 선원명부 검토 완료(기관별 제출 규격은 따로 확인), 마감까지 ${remain(D.t6, D.due)}.`, setup: () => { heroAt('final'); } },
  ];
}
function demoGo(i) {
  const beats = demoBeats();
  DEMO.on = true;
  DEMO.beat = Math.min(beats.length - 1, Math.max(0, i));
  const b = beats[DEMO.beat];
  state.mail = null;
  state.mailScope = 'voyage';
  state.read = new Set();
  b.setup();
  if (b.page !== 'ships' && !state.open.includes('hanbit')) state.open = ['hanbit'];
  setPage(b.page);
  if (b.toast) showToast(mailsOf(SHIPST.hanbit).find((m) => m.id === b.toast));
}
function demoEnd() { DEMO.on = false; $('#toast').hidden = true; setPage(state.page); }
function renderDemoBar() {
  const el = $('#demoBar');
  if (!DEMO.on) { el.innerHTML = ''; return; }
  const beats = demoBeats();
  const b = beats[DEMO.beat];
  const scenes = beats.filter((x, i) => i === 0 || x.scene !== beats[i - 1].scene);
  el.innerHTML = `<div class="demo-bar" aria-live="polite">
    <div class="demo-bar-top"><span class="rp-scene-no">시연 · 장면 ${b.scene}/6</span><span class="demo-time"><i class="ti ti-clock" aria-hidden="true"></i> ${mdw(b.t)} ${hhmm(b.t)}</span><span class="demo-due">마감까지 ${remain(b.t, D.due)}</span>
      <ol class="demo-dots" aria-label="장면 선택">${scenes.map((x) => `<li><button type="button" data-demo-scene="${x.scene}" aria-current="${x.scene === b.scene ? 'step' : 'false'}" class="${x.scene < b.scene ? 'done' : ''}" title="${hhmm(x.t)} ${h(x.title)}">${hhmm(x.t)}</button></li>`).join('')}</ol></div>
    <p><b>${h(b.title)}</b> ${h(b.cap)}</p>
    <div class="rp-nav"><button type="button" class="btn btn-sm rp-prev" data-act="demo-prev" ${DEMO.beat === 0 ? 'disabled' : ''}><i class="ti ti-chevron-left" aria-hidden="true"></i> 이전</button>${DEMO.beat === beats.length - 1 ? '<button type="button" class="btn btn-sm btn-primary" data-act="demo-end">시연 끝내기</button>' : '<button type="button" class="btn btn-sm btn-primary" data-act="demo-next">다음 <i class="ti ti-chevron-right" aria-hidden="true"></i></button>'}<button type="button" class="btn btn-sm rp-prev" data-act="demo-end" aria-label="시연 끝내기"><i class="ti ti-x" aria-hidden="true"></i></button></div>
  </div>`;
}
function showToast(m) {
  const t = $('#toast');
  if (!m || !t) return;
  t.innerHTML = `<i class="ti ${m.box === 'out' ? 'ti-send' : 'ti-mail'}" aria-hidden="true"></i><div><b>${m.box === 'out' ? '메일 보냄' : '새 메일'}</b> · ${hhmm(m.at)}<div class="small">${h(m.box === 'out' ? `${m.to}에게` : m.from)} — ${h(m.subject)}</div></div>`;
  t.hidden = false;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}

function openShipPage(key, page, { mail = null } = {}) {
  selectShip(key);
  const sh = curShip();
  if (!DEMO.on && sh.stage === 'new') sh.stage = 'v2';
  state.mail = mail;
  setPage(page);
}
// 메일함에서 특정 메일 펼치기(모바일은 메일 탭으로)
function revealMail(id) {
  state.mail = id;
  state.read.add(id);
  if (window.innerWidth < 900) { setPage('mail'); } else renderMailbox();
  const li = document.querySelector(`${window.innerWidth < 900 ? '#pg-mail' : '#mailbox'} [data-mail-li="${id}"]`);
  li?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function downloadCsv(csv, name) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------- 이벤트 ----------------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, tr.item');
  if (!t) return;
  // 시연 중에 그 장면의 다음 동작 버튼을 누르면 다음 장면으로 넘어간다
  if (DEMO.on && demoBeats()[DEMO.beat].adv?.(t)) { demoGo(DEMO.beat + 1); return; }
  if (t.dataset.page) {
    const p = t.dataset.page;
    if (!DEMO.on && VOYAGE_PAGES.includes(p) && curShip().stage === 'new') curShip().stage = 'v2';
    if (p === 'compare' && state.step === 4) state.step = 2;
    if (p === 'mail' && state.page !== 'mail') state.mailScope = 'voyage';
    setPage(p); return;
  }
  if (t.dataset.ship) { openShipPage(t.dataset.ship, SHIPST[t.dataset.ship].last || 'ship'); return; }
  if (t.dataset.vtab) { openShipPage(t.dataset.vtab, SHIPST[t.dataset.vtab].last || 'ship'); return; }
  if (t.dataset.vtabClose) {
    const k = t.dataset.vtabClose;
    state.open = state.open.filter((x) => x !== k);
    if (VOYAGE_PAGES.includes(state.page) && state.ship === k) { const next = state.open[state.open.length - 1]; if (next) openShipPage(next, SHIPST[next].last || 'ship'); else setPage('ships'); } else renderChrome();
    return;
  }
  if (t.dataset.mailid) {
    const id = t.dataset.mailid;
    const m = allMails().find((x) => x.id === id);
    if (!m) return;
    state.read.add(id);
    if (m.ship !== state.ship || !VOYAGE_PAGES.includes(state.page)) { openShipPage(m.ship, state.page === 'mail' ? 'mail' : SHIPST[m.ship].last || 'ship', { mail: id }); return; }
    state.mail = state.mail === id ? null : id;
    renderChrome(); return;
  }
  if (t.dataset.openMail) { revealMail(t.dataset.openMail); return; }
  if (t.dataset.mailScope) { state.mailScope = t.dataset.mailScope; renderMailbox(); return; }
  if (t.dataset.cmp) {
    const m = allMails().find((x) => x.id === t.dataset.cmp);
    if (!m) return;
    const sh = SHIPST[m.ship];
    if (m.sc === 5) { if (sh.stage === 'reply') { const sent = sh.sent; heroAt('reply'); if (sent) sh.sent = sent; state.step = 2; } setPage('compare'); return; }
    if (sh.hero && !['new', 'v2'].includes(sh.stage)) { openShipPage('hanbit', 'compare', { mail: m.id }); return; }
    selectShip(m.ship);
    if (!DEMO.on && sh.stage === 'new') sh.stage = 'v2';
    if (state.step === 1 || state.step === 4) state.step = 2;
    state.mail = m.id;
    setPage('compare'); return;
  }
  if (t.dataset.demoScene) { demoGo(demoBeats().findIndex((b) => b.scene === Number(t.dataset.demoScene))); return; }
  const act = t.dataset.act;
  if (act === 'demo-start') { try { localStorage.setItem('crewdiff-demo-hint', '1'); } catch { /* 저장 안 돼도 됨 */ } demoGo(0); return; }
  if (act === 'demo-next') { demoGo(DEMO.beat + 1); return; }
  if (act === 'demo-prev') { demoGo(DEMO.beat - 1); return; }
  if (act === 'demo-end') { demoEnd(); return; }
  if (act === 'hint-close') { try { localStorage.setItem('crewdiff-demo-hint', '1'); } catch { /* 저장 안 돼도 됨 */ } $('.demo-hint')?.remove(); return; }
  if (act === 'bell') {
    state.mailScope = 'all';
    if (window.innerWidth < 900) { setPage('mail'); return; }
    renderMailbox(); $('#mailbox').scrollTop = 0; $('#mailbox .mb-item.fresh .mb-row, #mailbox .mb-row')?.focus(); return;
  }
  if (act === 'send-inquiry') {
    const sh = curShip();
    sh.stage = 'asked';
    sh.sent = { at: sysNow(), decisions: { ...state.decisions }, report: state.report, text: shipperSummary() };
    renderChrome(); renderInquiry(); showToast(mailsOf(sh).find((m) => m.box === 'out')); return;
  }
  if (act === 'reply-arrive') { const sh = SHIPST.hanbit; sh.stage = 'reply'; renderChrome(); renderInquiry(); showToast(D.reply); return; }
  if (act === 'reply-compare') { const sh = SHIPST.hanbit; const sent = sh.sent; heroAt('reply'); if (sent) sh.sent = sent; state.step = 2; state.read.add('in5-hanbit'); setPage('compare'); return; }
  if (act === 'dl-agency') { const sh = curShip(); downloadCsv(shipify(toFal5Csv(state.report, state.decisions), sh), `crew-list-fal5-${sh.voy}-${t.dataset.ag}.csv`); return; }
  if (t.dataset.step) { goStep(Number(t.dataset.step)); return; }
  if (t.dataset.scenario) {
    const n = Number(t.dataset.scenario);
    const sh = shipOfScenario(n);
    if (sh.hero) heroAt(n === 5 ? 'reply' : 'v2');
    else { saveWs(); state.ship = sh.key; loadScenario(n); run(); if (sh.stage === 'new') sh.stage = 'v2'; }
    state.step = 1; setPage('compare', { scroll: false }); return;
  }
  if (t.dataset.view) { state.view = t.dataset.view; render(); return; }
  if (t.dataset.filter) { state.filter = t.dataset.filter; render(); return; }
  if (t.matches('tr.item')) { toggleItem(t.dataset.item); return; }
  if (t.dataset.decide) { state.decisions[t.dataset.decide] = t.dataset.v; state.conf = null; render(); return; }
  if (act === 'run') { readInputs(); run(); render(); }
  if (act === 'next') { if (state.step === 1 && !state.report) { readInputs(); run(); } goStep(state.step + 1); }
  if (act === 'prev') goStep(state.step - 1);
  if (act === 'restart') { loadScenario(state.scenario); state.step = 1; setPage('compare'); }
  if (act === 'approve-expected') { for (const it of state.report.items) if (it.class === 'expected') state.decisions[it.id] = 'approve'; state.conf = null; render(); }
  if (act === 'hold-rest') { for (const it of state.report.items) if (!state.decisions[it.id]) state.decisions[it.id] = 'pending'; state.conf = null; render(); }
  if (act === 'scenario5') { const sent = SHIPST.hanbit.sent; heroAt('reply'); if (sent) SHIPST.hanbit.sent = sent; state.step = 2; setPage('compare'); return; }
  if (act === 'rebase') { const a = toBaseCsv(state.report, state.decisions); state.inputs = { a, b: '', mail: '' }; state.rebased = true; state.report = null; state.decisions = {}; state.conf = null; state.step = 1; setPage('compare'); return; }
  if (act === 'download') download();
  if (act === 'copy-summary') { try { await navigator.clipboard.writeText($('#summary').value); t.textContent = '복사됨'; } catch { $('#summary').select(); } }
  if (act === 'sign') { if (!pendingItems(state.report, state.decisions).length) { await doSign(); curShip().stage = 'final'; renderChrome(); } render(); }
  if (act === 'verify') { await doVerify(false); render(); }
  if (act === 'tamper') { await doVerify(true); render(); }
});
function toggleItem(id) {
  state.selected = state.selected === id ? null : id;
  render();
  scrollMailHit();
  if (state.selected) $('.detail-row')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('tr.item')) toggleItem(e.target.dataset.item);
  if (DEMO.on && !e.target.matches?.('input, textarea') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) demoGo(DEMO.beat + (e.key === 'ArrowRight' ? 1 : -1));
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'approver') state.approver = e.target.value || '데모 담당자';
  if (e.target.classList?.contains('mb-q')) { state.mailQ = e.target.value; refreshMailLists(); return; }
  if (e.target.dataset?.input) { state.inputs[e.target.dataset.input] = e.target.value; state.report = null; renderStepper(); }
});
function readInputs() {
  for (const ta of document.querySelectorAll('[data-input]')) state.inputs[ta.dataset.input] = ta.value;
}
function scrollMailHit() {
  const hit = $('[data-mail] [data-hit]');
  if (hit) hit.parentElement.scrollTop = Math.max(0, hit.offsetTop - hit.parentElement.offsetTop - 40);
}
function download() {
  downloadCsv(shipify(toFal5Csv(state.report, state.decisions)), `crew-list-fal5-${curShip().voy}.csv`);
}

async function loadEval() {
  try {
    const [cur, first, h3, h4, fin, mail] = await Promise.all(['docs/eval-result.json', 'docs/eval-holdout-first-run.json', 'docs/eval-H3-first-run.json', 'docs/eval-H4-first-run.json', 'docs/eval-final.json', 'docs/mail-challenge-result.json'].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); })));
    state.eval = { current: cur, first, h3, h4, fin, mail };
  } catch (err) {
    state.eval = { error: err.message };
  }
  if (state.page === 'eval') renderEval();
}

// ---------------- 시작 ----------------
async function loadAI() {
  try {
    const arr = await fetch('data/ai/scenario-ai.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    for (const x of arr) { if (x.meta) AI.meta = x.meta; else if (x.id) AI.byId[x.id] = x; }
  } catch { AI = { meta: null, byId: {} }; }
}

async function start() {
  await loadAI();
  await prepareDemo();
  const tab = params.get('tab');
  const legacy = ['step', 'scenario', 'item', 'decide', 'filter'].some((k) => params.has(k));
  let page = 'ships';
  let demo = params.has('demo') ? Number(params.get('demo')) || 1 : tab === 'replay' && params.has('scene') ? Number(params.get('scene')) || 1 : 0;
  if (legacy) {
    // 기존 단계 화면 주소(?step=…&scenario=…)는 그대로 연다(기획서 그림용)
    const n = state.scenario;
    const sh = shipOfScenario(n);
    if (sh.hero) heroAt(n === 5 ? 'reply' : 'v2');
    else { state.ship = sh.key; sh.stage = 'v2'; loadScenario(n); run(); }
    if (params.get('item')) state.selected = params.get('item');
    // 스크린샷용: decide=auto → 예상된 변경 승인, 나머지 보류
    if (params.get('decide') === 'auto' && state.report) for (const it of state.report.items) state.decisions[it.id] = it.class === 'expected' ? 'approve' : 'pending';
    if (state.step === 4 && !allDecided()) state.step = 3;
    if (params.has('sign') && state.step === 4 && !pendingItems(state.report, state.decisions).length) { await doSign(); sh.stage = 'final'; if (params.get('sign') === 'verify') await doVerify(false); if (params.get('sign') === 'tamper') await doVerify(true); }
    page = state.step === 4 ? 'report' : 'compare';
  } else {
    // 새 주소: ?voyage=hanbit&tab=overview|crew|inquiry|report|mail (&mail=메일 id). 예전 ?view=·?ship=도 그대로.
    const TAB_PAGE = { overview: 'ship', crew: 'compare', inquiry: 'inquiry', report: 'report', mail: 'mail' };
    let view = TAB_PAGE[tab] || params.get('view');
    if (!view && params.has('voyage')) view = 'ship';
    const key = SHIPST[params.get('voyage')] ? params.get('voyage') : SHIPST[params.get('ship')] ? params.get('ship') : 'hanbit';
    const stage = STAGE[params.get('stage')] ? params.get('stage') : null;
    if (key === 'hanbit') heroAt(stage || ({ compare: 'v2', ship: 'v2', mail: 'v2', inquiry: 'asked', report: 'final' })[view] || 'new');
    else { if (stage) SHIPST[key].stage = stage; else if (view && SHIPST[key].stage === 'new') SHIPST[key].stage = 'v2'; selectShip(key); }
    if (['ships', 'ship', 'compare', 'inquiry', 'report', 'mail'].includes(view)) page = view;
    if (page === 'compare') { state.step = Math.min(3, Number(params.get('step')) || 2); state.selected = state.selected || sortedItems()[0]?.id || null; }
    if (params.get('mail')) { state.mail = params.get('mail'); state.read.add(state.mail); }
    if (tab === 'eval' || tab === 'scope') page = tab;
  }
  setPage(page, { scroll: false });
  if (demo) demoGo(demoBeats().findIndex((b) => b.scene === Math.min(6, Math.max(1, demo))));
  scrollMailHit();
  await loadEval();
  await document.fonts.ready;
  document.documentElement.dataset.ready = '1';
}
start();
