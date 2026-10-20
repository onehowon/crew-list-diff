// CrewDiff 데모 화면. 엔진(lib/)을 브라우저에서 그대로 돌린다. 서버·로그인·설치 없음.
import { SCENARIOS } from './data/scenarios.js';
import { compareCrewLists } from './lib/engine.js';
import { ROW_FIELDS, HEADER_FIELDS, FIELD, fieldLabel } from './lib/fields.js';
import { colLetter, splitRows } from './lib/parse.js';
import { CLASS_LABEL } from './lib/classify.js';
import { RULES } from './lib/rules.js';
import { LAWS, IMMIGRATION_PENALTY, impactOf } from './lib/impact.js';
import { DIRECTIVE_LABEL } from './lib/notice.js';
import { toFal5Csv } from './lib/export.js';
import { buildConfirmation, signConfirmation, verifyConfirmation } from './lib/receipt.js';
import { DEMO_KID } from './lib/demo-key.js';
import { decodeJws, b64uJson } from './lib/jose.js';

const $ = (s, el = document) => el.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);

const STEPS = [
  { title: '자료 받기', sub: '최초본·수정본·메일' },
  { title: '변경 대조', sub: '3단계 분류와 근거' },
  { title: '영향·승인', sub: '신고별 영향, 항목별 결정' },
  { title: '내보내기·확인서', sub: 'FAL 5 CSV, 서명 확인서' },
];
const KIND_LABEL = { modify: '값 변경', add: '추가(승선)', remove: '삭제(하선)', duplicate: '중복 행', directive: '메일 지시', standing: '기존 값' };
const ORDER = { suspect: 0, check: 1, expected: 2 };

const state = {
  tab: params.get('tab') || 'demo',
  step: Math.min(4, Math.max(1, Number(params.get('step')) || 1)),
  scenario: Math.min(3, Math.max(1, Number(params.get('scenario')) || 1)),
  inputs: null,
  report: null,
  view: 'B',
  filter: params.get('filter') || 'all',
  selected: params.get('item') || null,
  decisions: {},
  approver: '데모 담당자',
  conf: null,
  eval: null,
};

function loadScenario(n) {
  const s = SCENARIOS[n - 1];
  state.scenario = n;
  state.inputs = { a: s.a, b: s.b, mail: s.mail };
  state.report = null;
  state.decisions = {};
  state.conf = null;
  state.selected = null;
}

function run() {
  state.report = compareCrewLists(state.inputs);
  state.decisions = {};
  state.conf = null;
  const items = sortedItems();
  if (!state.selected || !items.some((it) => it.id === state.selected)) state.selected = items[0]?.id || null;
}

function sortedItems() {
  if (!state.report) return [];
  return state.report.items.slice().sort((a, b) => ORDER[a.class] - ORDER[b.class] || (a.rowB?.line ?? a.rowA?.line ?? 999) - (b.rowB?.line ?? b.rowA?.line ?? 999));
}

function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.top-tab')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  for (const id of ['demo', 'eval', 'scope']) $(`#tab-${id}`).hidden = id !== tab;
  if (tab === 'eval') renderEval();
  if (tab === 'scope') renderScope();
}

function canGo(step) {
  if (step <= 1) return true;
  if (!state.report) return false;
  if (step === 4) return allDecided();
  return true;
}
const allDecided = () => state.report && state.report.items.every((it) => state.decisions[it.id]);

function goStep(n) {
  if (!canGo(n)) return;
  state.step = n;
  render();
  window.scrollTo({ top: 0 });
}

function renderStepper() {
  $('#stepper').innerHTML = STEPS.map((s, i) => {
    const n = i + 1;
    const cur = n === state.step;
    const done = n < state.step;
    return `<li class="${done ? 'done' : ''}" ${cur ? 'aria-current="step"' : ''}><button type="button" data-step="${n}" ${canGo(n) ? '' : 'disabled'}><span class="num">${done ? '✓' : n}</span><span><span class="st-title">${n}. ${s.title}</span><span class="st-sub">${s.sub}</span></span></button></li>`;
  }).join('');
}

function render() {
  renderStepper();
  const body = $('#stepBody');
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

function step1() {
  const sc = SCENARIOS.map((s) => `<button type="button" class="scenario" data-scenario="${s.id}" aria-pressed="${s.id === state.scenario}"><b>예시 ${s.id}. ${h(s.title)}</b><span>${h(s.desc)}</span></button>`).join('');
  const box = (key, title, sub) => `<div class="panel"><div class="panel-head"><h3>${title}</h3><span class="muted small">${sub}</span></div><textarea class="mono" data-input="${key}" spellcheck="false" aria-label="${title}">${h(state.inputs[key])}</textarea></div>`;
  return `
  <h2 class="section-title">1. 자료 받기</h2>
  <p class="section-lead">예시 시나리오를 고르거나, 아래 세 칸에 받은 자료를 직접 붙여 넣으세요. 표는 CSV·탭 구분(엑셀 복사) 모두 읽습니다.</p>
  <div class="scenario-list">${sc}</div>
  <div class="inputs">
    ${box('a', '최초본 선원명부', fmtInfo(state.inputs.a))}
    ${box('b', '수정본 선원명부', fmtInfo(state.inputs.b))}
    ${box('mail', '수정 메일 원문', '교대 통보·정정 요청')}
  </div>
  <p class="note"><b>데모 범위:</b> 표(CSV·TSV)는 브라우저에서 실제로 파싱합니다. <b>메일 해석은 규칙 기반</b>이며, 실제 서비스에서는 LLM 추출 + 스키마 검증으로 PDF·메일에서 항목을 뽑습니다. 성능 평가는 대조·분류 엔진에 대한 것입니다.</p>
  <div class="row-actions">
    <span class="spacer"></span>
    <button type="button" class="btn" data-act="run">정규화·대조 실행</button>
    <button type="button" class="btn btn-primary" data-act="next" ${state.report ? '' : 'disabled'}>다음: 변경 대조</button>
  </div>
  ${state.report ? normalizedView() : ''}`;
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
      ${warns.length ? `<ul class="warn-list">${warns.map((w) => `<li>${h(w)}</li>`).join('')}</ul>` : ''}
      <p class="small muted" style="margin:8px 0">셀에 마우스를 올리면 원문 위치(줄·열)와 원문 값을 보여 줍니다. 날짜는 ISO 형식, 직급은 약어, 국적은 ISO 3166-1 alpha-3로 맞춥니다.</p>
      <div class="table-wrap"><table class="grid fal-table"><thead><tr><th>6.<span class="fal">No.</span></th>${ROW_FIELDS.map((f) => `<th>${f.fal}. ${h(f.ko)}<span class="fal">${h(f.en)}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>
  </div>`;
}

// ---------------- 2단계 ----------------
function valueText(c) {
  if (!c) return '';
  if (c.status === 'ok') return c.value;
  return c.raw?.trim() ? c.raw.trim() : '(빈칸)';
}

function changeText(it) {
  if (it.kind === 'modify' || it.kind === 'standing') {
    return `<b>${h(FIELD[it.field].ko)}</b> <span class="muted small">${FIELD[it.field].fal}. ${h(FIELD[it.field].en)}</span><br>${it.kind === 'standing' ? '' : `<span class="val-before">${h(valueText(it.before))}</span><span class="arrow">→</span>`}<span class="val-after">${h(valueText(it.after))}</span>`;
  }
  if (it.kind === 'add') return `<b>명부에 추가</b> <span class="muted small">${h(it.rowB.cells.rank.value)} · ${h(it.rowB.cells.nationality.value)}</span>`;
  if (it.kind === 'remove') return `<b>명부에서 빠짐</b> <span class="muted small">${h(it.rowA.cells.rank.value)}</span>`;
  if (it.kind === 'duplicate') return `<b>같은 사람이 두 번</b> <span class="muted small">수정본 ${it.dupOf.line}행 · ${it.rowB.line}행</span>`;
  if (it.kind === 'directive') return `<b>${DIRECTIVE_LABEL[it.directive.type]} 지시</b>${it.field ? ` <span class="muted small">${h(FIELD[it.field]?.ko || '')}</span>` : ''}`;
  return '';
}

function basisText(it) {
  const parts = [];
  if (it.rules?.length) parts.push(it.rules.map((r) => `${r.id} ${r.title}`).join(', '));
  if (it.directive) parts.push(`메일 ${it.directive.line}번째 줄`);
  if (!parts.length) parts.push(it.reason);
  return parts.join(' · ');
}

function step2() {
  const r = state.report;
  const s = r.summary;
  const chip = (k, label, n) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${state.filter === k}"><span class="dot ${k}"></span>${label} <span class="n">${n}</span></button>`;
  const items = sortedItems().filter((it) => state.filter === 'all' || it.class === state.filter);
  let lastPerson = null;
  const rows = items.map((it) => {
    const p = it.person;
    const show = p !== lastPerson;
    lastPerson = p;
    return `<tr class="item" data-item="${it.id}" aria-selected="${it.id === state.selected}" tabindex="0"><td class="person">${show ? h(p) : ''}</td><td><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></td><td>${changeText(it)}</td><td class="basis small">${h(basisText(it))}</td></tr>`;
  }).join('');
  const cos = r.cosmetic.map((c) => `<tr><td>${h(c.person)}</td><td>${h(FIELD[c.field].ko)}</td><td class="mono">${h(c.before.raw)}</td><td class="mono">${h(c.after.raw)}</td><td class="muted">${h(c.before.ref)} · ${h(c.after.ref)}</td></tr>`).join('');
  return `
  <h2 class="section-title">2. 변경 대조</h2>
  <p class="section-lead">사람끼리 먼저 맞춘 뒤(행 순서 무관) 바뀐 항목만 보여 줍니다. <b>예상된 변경</b>은 메일 지시 문장이 있을 때만, <b>오류 의심</b>은 규칙(R1~R8) 위반이 있을 때만, 그 밖의 실질 변경은 모두 <b>확인 필요</b>입니다.</p>
  <div class="chips">
    ${chip('all', '전체', r.items.length)}
    ${chip('suspect', CLASS_LABEL.suspect, s.suspect)}
    ${chip('check', CLASS_LABEL.check, s.check)}
    ${chip('expected', CLASS_LABEL.expected, s.expected)}
    <span class="chip" style="cursor:default"><span class="dot cosmetic"></span>표기만 다름 <span class="n">${s.cosmetic}</span> <span class="muted small">접힘·경보 안 함</span></span>
    <span class="muted small">행 순서 이동 ${s.rowsMoved}명(경보 안 함) · 인물 대응 ${r.pairs.length}쌍</span>
  </div>
  <div class="compare">
    <div>
      <div class="panel">
        <div class="table-wrap"><table class="grid changes"><thead><tr><th style="width:150px">인물</th><th style="width:96px">분류</th><th>바뀐 항목</th><th style="width:30%">근거</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">해당하는 변경이 없습니다.</td></tr>'}</tbody></table></div>
      </div>
      <details class="cosmetic-fold panel"><summary>표기만 다름 ${s.cosmetic}건 — 대소문자·공백·날짜 형식·직급 약어 차이(변경으로 세지 않음)</summary>
        <div class="table-wrap"><table class="grid"><thead><tr><th>인물</th><th>항목</th><th>최초본 원문</th><th>수정본 원문</th><th>위치</th></tr></thead><tbody>${cos || '<tr><td colspan="5" class="muted">없음</td></tr>'}</tbody></table></div>
      </details>
    </div>
    <aside class="detail panel" aria-label="선택한 변경의 근거">${detailPanel()}</aside>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">이전</button>
    <span class="spacer"></span>
    <button type="button" class="btn btn-primary" data-act="next">다음: 영향·승인</button>
  </div>`;
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
  if (!it) return '<div class="panel-body muted">왼쪽 표에서 변경을 고르면 두 원문과 근거를 나란히 보여 줍니다.</div>';
  const head = `<div class="panel-head"><h3>${h(it.person)}${it.field ? ` · ${h(FIELD[it.field].ko)}` : ''}</h3><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></div>`;
  const a = it.rowA, b = it.rowB;
  let src = '';
  if (a || b) {
    const fields = ROW_FIELDS.filter((f) => (a ? a.cells[f.key].status !== 'nocolumn' : true) || (b ? b.cells[f.key].status !== 'nocolumn' : true));
    const rows = fields.map((f) => {
      const ra = a ? a.cells[f.key].raw : '';
      const rb = b ? b.cells[f.key].raw : '';
      const diff = it.field ? f.key === it.field || (it.rules || []).some((x) => x.id === 'R3') && (f.key === 'familyName' || f.key === 'givenNames') : false;
      return `<tr class="${diff ? 'diff' : ''}"><th>${f.fal}. ${h(f.ko)}</th><td class="mono">${a ? h(ra) || '<span class="muted">(빈칸)</span>' : ''}</td><td class="mono">${b ? h(rb) || '<span class="muted">(빈칸)</span>' : ''}</td></tr>`;
    }).join('');
    src = `<p class="small" style="margin:0 0 4px"><b>두 원문 나란히</b></p>
      <table class="src-compare"><thead><tr><th>항목</th><th>${a ? `최초본 ${a.line}행` : '최초본 없음'}</th><th>${b ? `수정본 ${b.line}행` : '수정본 없음'}</th></tr></thead><tbody>${rows}</tbody></table>
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
  if (it.class === 'check' && !it.directive && !it.rules?.length) ev += `<p class="small" style="margin:12px 0 0"><b>근거</b> · 이 변경을 설명하는 메일 지시도, 위반한 규칙도 없습니다. 근거가 부족하면 기본값은 확인 필요입니다.</p>`;
  const m = it.match ? `<dl class="kv" style="margin-top:12px"><dt>인물 대응</dt><dd>${h({ idNumber: '신분증번호 일치', 'idNumber~confusable': '신분증번호(혼동 문자 무시) 일치', 'name+dob': '성명+생년월일', name: '성명 유사도', 'name(dob 판독 불가)': '성명(생년월일 판독 불가)' }[it.match.method] || it.match.method)} · 신뢰도 ${it.match.confidence.toFixed(2)}</dd><dt>분류 이유</dt><dd>${h(it.reason)}</dd></dl>` : `<dl class="kv" style="margin-top:12px"><dt>분류 이유</dt><dd>${h(it.reason)}</dd></dl>`;
  return `${head}<div class="panel-body">${src}${ev}${m}</div>`;
}

// ---------------- 3단계 ----------------
function step3() {
  const r = state.report;
  const n = r.items.length;
  const done = r.items.filter((it) => state.decisions[it.id]).length;
  const changedPenaltyFields = [...new Set(r.items.filter((it) => impactOf(it).art100).map((it) => (it.field ? FIELD[it.field].ko : KIND_LABEL[it.kind])))];
  const impact = Object.values(LAWS).map((l) => `<div class="panel impact"><h3>${h(l.report)}</h3><div class="law">${h(l.law)} ${h(l.article)} · 제출처: ${h(l.agency)}</div><div class="count">이번 변경 <b>${n}건</b>이 첨부 승무원명부에 반영되어야 합니다.</div><details><summary>조문 원문 보기</summary><blockquote>${h(l.quote)}${l.quoteNote ? `<br><span class="muted">(${h(l.quoteNote)})</span>` : ''}</blockquote>${l.formTitle ? `<p class="small muted" style="margin:6px 0 0">별지 제2호의2서식: ${h(l.formTitle)}</p>` : ''}<p class="small muted" style="margin:6px 0 0">${h(l.version)}</p></details></div>`).join('');
  const rows = sortedItems().map((it) => {
    const v = state.decisions[it.id];
    return `<div class="arow"><div><b>${h(it.person)}</b></div><div><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></div><div class="small">${changeText(it)} <span class="muted">· ${h(basisText(it))}</span></div><div class="seg" role="group" aria-label="${h(it.person)} 결정"><button type="button" data-decide="${it.id}" data-v="approve" aria-pressed="${v === 'approve'}">승인</button><button type="button" data-decide="${it.id}" data-v="hold" aria-pressed="${v === 'hold'}">보류</button></div></div>`;
  }).join('');
  return `
  <h2 class="section-title">3. 영향·승인</h2>
  <p class="section-lead">바뀐 명부가 어느 신고의 첨부 명부에 영향을 주는지 보여 줍니다. 이 도구는 신고를 전송하지 않습니다. 항목마다 승인(수정본 값 반영) 또는 보류(반영하지 않고 선사 확인)를 정해야 다음 단계로 갑니다.</p>
  <div class="impact-grid">${impact}</div>
  <div class="panel penalty"><b>출입국관리법 제100조제1항제5호 관련 항목</b> <span class="muted small">— 이번 변경 중 국적·성명·성별·생년월일·여권번호에 해당: ${changedPenaltyFields.length ? h(changedPenaltyFields.join(', ')) : '없음'}</span>
    <blockquote>${h(IMMIGRATION_PENALTY.head)}<br>5. ${h(IMMIGRATION_PENALTY.quote)}</blockquote>
    <p class="small muted" style="margin:6px 0 0">${h(IMMIGRATION_PENALTY.caution)}</p></div>
  <div class="panel" style="margin-top:16px">
    <div class="panel-head"><h3>항목별 결정</h3>
      <div class="progress-line"><span>처리 ${done}/${n}</span><span class="bar"><i style="width:${n ? (done / n) * 100 : 100}%"></i></span>
      <button type="button" class="btn btn-sm" data-act="approve-expected">예상된 변경 모두 승인</button>
      <button type="button" class="btn btn-sm" data-act="hold-rest">남은 항목 보류</button></div>
    </div>
    <div class="approve-list">${rows || '<div class="arow muted">변경이 없습니다.</div>'}</div>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">이전</button>
    <label class="small" for="approver">승인자 표시명</label><input id="approver" class="form-control input-sm" value="${h(state.approver)}" style="width:160px">
    <span class="spacer"></span>
    <button type="button" class="btn btn-primary" data-act="next" ${allDecided() ? '' : 'disabled'}>다음: 내보내기·확인서</button>
  </div>`;
}

// ---------------- 4단계 ----------------
function shipperSummary() {
  const r = state.report;
  const hd = r.B.header;
  const held = sortedItems().filter((it) => state.decisions[it.id] === 'hold');
  const ok = r.items.length - held.length;
  const line = (it) => {
    const what = it.kind === 'modify' ? `${FIELD[it.field].ko} ${valueText(it.before)} → ${valueText(it.after)}` : it.kind === 'directive' ? `메일 ${it.directive.line}번째 줄 지시("${it.directive.text.trim()}")` : KIND_LABEL[it.kind];
    return `- ${it.person}: ${what} — ${it.rules?.length ? it.rules.map((x) => `${x.title}`).join(', ') : it.reason}`;
  };
  return [
    `[${hd.shipName?.value || ''} ${hd.voyage?.value || ''} ${hd.port?.value || ''}] 수정 선원명부 확인 결과`,
    '',
    `반영 확인 ${ok}건, 확인 요청 ${held.length}건 (표기만 다른 ${r.cosmetic.length}건은 변경으로 보지 않음)`,
    '',
    held.length ? '확인 요청드립니다:' : '확인 요청 사항 없음.',
    ...held.map(line),
    '',
    '회신 주시면 수정본을 다시 대조하겠습니다.',
    `(${state.approver} · CrewDiff 데모로 작성, 신고 전송 아님)`,
  ].join('\n');
}

function step4() {
  const r = state.report;
  const csv = toFal5Csv(r, state.decisions);
  const c = state.conf;
  let conf = `<p class="small muted">승인 결과(항목별 결정·승인자·시각)와 최종 명부 CSV의 SHA-256 해시를 JSON으로 묶어 ECDSA P-256(ES256)으로 서명합니다. <b>키는 공개된 데모 키</b>(${DEMO_KID})입니다.</p>
    <button type="button" class="btn btn-primary" data-act="sign">확인서 생성·서명</button>`;
  if (c) {
    conf = `<dl class="kv" style="grid-template-columns:140px 1fr"><dt>승인자</dt><dd>${h(c.payload.approver)}</dd><dt>결정 시각</dt><dd>${h(c.payload.decidedAt)}</dd><dt>승인 / 보류</dt><dd>${c.payload.counts.approved} / ${c.payload.counts.held}</dd><dt>최종 명부 SHA-256</dt><dd class="mono" style="word-break:break-all">${h(c.payload.finalListSha256)}</dd><dt>서명 키</dt><dd class="mono">${h(DEMO_KID)} (데모)</dd></dl>
      <p class="small" style="margin:10px 0 4px"><b>서명된 확인서(JWS)</b></p><pre class="box wrap mono" style="max-height:90px">${h(c.jws)}</pre>
      <p class="small" style="margin:10px 0 4px"><b>확인서 내용(JSON)</b></p><pre class="box mono" style="max-height:180px">${h(JSON.stringify(c.payload, null, 2))}</pre>
      <div class="row-actions" style="justify-content:flex-start"><button type="button" class="btn" data-act="verify">서명·해시 검증</button><button type="button" class="btn" data-act="tamper">변조 시험(보류 1건을 승인으로 바꿔 검증)</button></div>
      ${c.verify ? `<div class="verify-result ${c.verify.ok ? 'ok' : 'bad'}">${h(c.verify.label)}: 서명 ${c.verify.signature ? '유효' : '무효'} · 최종 명부 해시 ${c.verify.hash == null ? '대조 안 함' : c.verify.hash ? '일치' : '불일치'} → <b>${c.verify.ok ? '검증 통과' : '검증 실패'}</b></div>` : ''}`;
  }
  return `
  <h2 class="section-title">4. 내보내기·확인서</h2>
  <p class="section-lead">승인 결과를 반영한 FAL 5 순서 명부와, 누가 무엇을 승인·보류했는지 남기는 변경 반영 확인서를 만듭니다. 기관 시스템 제출 파일이 아니라 담당자 확인용 준비 자료입니다.</p>
  <div class="export-grid">
    <div class="stack">
      <div class="panel"><div class="panel-head"><h3>최종 명부 (FAL 5 순서 CSV)</h3><button type="button" class="btn btn-sm" data-act="download">CSV 내려받기</button></div><div class="panel-body"><pre class="box mono">${h(csv)}</pre><p class="small muted" style="margin:8px 0 0">보류한 값 변경은 최초본 값, 보류한 승선은 제외, 보류한 하선은 최초본 행 유지. 승인한 중복 행은 제거합니다.</p></div></div>
      <div class="panel"><div class="panel-head"><h3>선사에 보낼 확인 요청</h3><button type="button" class="btn btn-sm" data-act="copy-summary">복사</button></div><div class="panel-body"><textarea class="form-control summary mono" id="summary" aria-label="선사에 보낼 확인 요청">${h(shipperSummary())}</textarea></div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>변경 반영 확인서</h3><span class="muted small">WebCrypto · ES256</span></div><div class="panel-body">${conf}</div></div>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">이전</button>
    <span class="spacer"></span>
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
    const k = p.changes.findIndex((x) => x.decision === 'hold');
    if (k >= 0) p.changes[k].decision = 'approve'; else p.approver += ' (변조)';
    const parts = jws.split('.');
    jws = `${parts[0]}.${b64uJson(p)}.${parts[2]}`;
  }
  const v = await verifyConfirmation(jws, { finalCsv: c.finalCsv });
  c.verify = { ...v, label: tamper ? '변조한 확인서' : '원본 확인서' };
}

// ---------------- 평가 결과 탭 ----------------
const pc = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
function metricRows(r) {
  const e = r.engine, b1 = r.baselineRow, b2 = r.baselineId;
  const row = (label, f, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="engine">${f(e)}</td><td>${f(b1)}</td><td>${f(b2)}</td></tr>`;
  return [
    row('실질 변경 재현율 (놓친 수)', (x) => `${pc(x.substantiveRecall.rate)} (${x.substantiveRecall.missed})`),
    row('오류 의심 정밀도', (x) => (x.suspect ? pc(x.suspect.precision) : '분류 없음')),
    row('오류 의심 재현율', (x) => (x.suspect ? pc(x.suspect.recall) : '분류 없음')),
    row('쌍당 오경보 (표기만 다른 셀 경보)', (x) => `${x.falseAlarms.perPair.toFixed(2)} (${x.falseAlarms.cosmeticAlarms})`),
    row('개별 검수 항목 / 쌍', (x) => x.review.perPair.toFixed(1)),
    row('검수 범위 비율', (x) => pc(x.review.ratio)),
    row(`검수 대상에서 빠진 실제 오류 수 (전체 ${e.review.errorsTotal})`, (x) => String(x.review.missedErrorsOutside), 'key'),
    row('근거 연결률', (x) => (x.evidence ? pc(x.evidence.rate) : '—')),
  ].join('');
}
function metricTable(r, caption, compact = false) {
  const hd = compact ? ['본 엔진', '기준선1 행', '기준선2 ID키'] : ['본 엔진', '기준선1 행 번호 대조', '기준선2 신분증번호 키 대조'];
  return `<div class="table-wrap"><table class="metric-table${compact ? ' compact' : ''}"><caption class="sr-only">${h(caption)}</caption><thead><tr><th>지표</th>${hd.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${metricRows(r)}</tbody></table></div>`;
}
function ruleTable(r) {
  const e = r.engine;
  return `<div class="table-wrap"><table class="metric-table"><thead><tr><th>오류 유형</th><th>건수</th><th>엔진: 오류 의심</th><th>엔진: 규칙 id 일치</th><th>기준선1 경보</th><th>기준선2 경보</th></tr></thead><tbody>${Object.keys(e.perRule).map((k) => `<tr><td>${k} ${h(RULES[k].title)}</td><td>${e.perRule[k].n}</td><td class="engine">${e.perRule[k].asSuspect}</td><td class="engine">${e.perRule[k].ruleCorrect}</td><td>${r.baselineRow.perRule[k].detected}</td><td>${r.baselineId.perRule[k].detected}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderEval() {
  const el = $('#tab-eval');
  const ev = state.eval;
  if (!ev) { el.innerHTML = '<p class="muted">평가 결과를 불러오는 중…</p>'; return; }
  if (ev.error) { el.innerHTML = `<div class="flash flash-error">평가 결과 파일을 읽지 못했습니다: ${h(ev.error)}. <code class="cmd">node eval/run.mjs --split all</code> 실행 후 다시 여세요.</div>`; return; }
  const h3 = ev.h3.splits.holdout3, first = ev.first.splits.holdout, cur = ev.current.splits.holdout, dev = ev.current.splits.dev;
  const ds = ev.current.dataset;
  const missed = (r) => Object.entries(r.engine.review.missedErrorsByRule).map(([k, v]) => `${k} ${v}건`).join(', ') || '없음';
  el.innerHTML = `
  <h2 class="section-title">평가 결과 — 대조·분류 엔진, 합성 데이터</h2>
  <p class="section-lead">합성 명부에서 만든 수정본 쌍 260개(개발 140 · 홀드아웃 H1·H2 60 · 홀드아웃 H3 60), 라벨된 실질 변경 ${ds.dev.labels + ds.holdout.labels + ev.h3.dataset.holdout3.labels}건. <b>합성 데이터 결과라 실제 현장 명부·메일에서는 다를 수 있습니다.</b> 현장 업무시간 절감은 이 평가로 주장하지 않으며 후속 PoC 과제입니다.</p>
  <div class="panel"><div class="panel-head"><h3>대표값: 홀드아웃 H3 1회차 (엔진 고정 후 설계·1회만 실행)</h3><span class="muted small">쌍 ${h3.engine.pairs} · 라벨 ${h3.engine.labels.total} · 오류 ${h3.engine.labels.suspect} · 시드 ${ev.h3.h3Seed}</span></div>
    <div class="panel-body">${metricTable(h3, 'H3 1회차')}
    <p class="small muted" style="margin:8px 0 0">검수 범위 = 담당자가 개별 확인할 항목(엔진: 오류 의심+확인 필요 / 기준선: 모든 경보) ÷ 수정본 셀 수. 범위를 줄인 대가로 놓친 오류가 없는지 <b>검수 대상에서 빠진 실제 오류 수</b>를 함께 봅니다. 엔진이 검수 대상에서 뺀 실제 오류: ${missed(h3)}.</p>
    <p class="small" style="margin:6px 0 0">H3에서 드러난 문제(고치지 않음): 두 자리 연도 만료일(<code>DD MMM YY</code>)을 판독 불가로 처리해 모든 만료일 칸에 R6 경보가 붙음(오경보 대부분, 승선 인원도 오류 의심으로 분류) · R4 만료는 오류 의심으로는 잡혔지만 근거 규칙이 R6로 붙음 · 머리글 <code>Nacionalidad</code>·<code>Lugar de nacimiento</code> 미인식(국적·출생지 변경을 보지 못함) · 메일 "should be 값" 문형의 정정 값을 해석하지 못해 확인 필요로 분류. 설계: <code>eval/H3-spec.md</code></p></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>오류 유형별 (H3 1회차)</h3></div><div class="panel-body">${ruleTable(h3)}
    <p class="small muted" style="margin:8px 0 0">정상 정정인데 오류 모양(R1·R2)인 사례 ${h3.engine.hardNegatives.n}건 → 예상된 변경 ${h3.engine.hardNegatives.expected}건, 오류 의심 ${h3.engine.hardNegatives.suspect}건. 예상된 변경 정확도(지시 문장까지 일치) ${pc(h3.engine.expected.accuracy)}, 예상으로 분류했지만 실제 오류 ${h3.engine.expected.predictedButTruthSuspect}건. 인물 대응 정확도 ${pc(h3.engine.matching.accuracy)}.</p></div></div>
  <h3 class="section-title" style="margin-top:24px">참고값 (대표값 아님)</h3>
  <div class="panel" style="margin-top:8px"><div class="panel-head"><h3>H1·H2 1회차(수정 전)</h3><span class="muted small">쌍 ${first.engine.pairs} · 라벨 ${first.engine.labels.total} · 오류 ${first.engine.labels.suspect}</span></div>
    <div class="panel-body">${metricTable(first, 'H1·H2 1회차')}
    <p class="small" style="margin:8px 0 0">이 결과를 본 뒤 엔진 버그 3건(한쪽 버전에만 있는 열을 변경으로 잡음, 미국식 날짜의 입항일·메일 날짜 해석)을 고쳤으므로 H1·H2는 더 이상 깨끗한 홀드아웃이 아닙니다. 그래서 H3를 새로 만들었습니다.</p></div></div>
  <div class="two-col" style="margin-top:16px">
    <div class="panel"><div class="panel-head"><h3>홀드아웃 H1·H2 — 버그 수정 후 재실행(규칙 수정에 사용됨, 참고값)</h3></div><div class="panel-body">${metricTable(cur, 'H1·H2 수정 후', true)}<p class="small muted" style="margin:8px 0 0">기준선1 행 = 행 번호 대조, 기준선2 ID키 = 신분증번호 키 대조. 머리글 별칭 사전은 고치지 않았습니다.</p></div></div>
    <div class="panel"><div class="panel-head"><h3>개발 세트 (튜닝에 사용, 참고값)</h3></div><div class="panel-body">${metricTable(dev, '개발 세트', true)}<p class="small muted" style="margin:8px 0 0">규칙과 생성기를 같은 사람이 만들었기 때문에 개발 세트 수치는 낙관적입니다.</p></div></div>
  </div>
  <div class="two-col" style="margin-top:16px">
    <div class="panel"><div class="panel-head"><h3>한계</h3></div><div class="panel-body"><ul class="facts small">
      <li>평가 대상은 대조·분류 엔진입니다. PDF·스캔 이미지에서 표를 뽑는 단계(실서비스의 LLM 추출)는 평가하지 않았습니다.</li>
      <li>메일은 생성기 문형(영어 3종·한국어 1종)으로 만들었고, 메일 파서는 규칙 기반입니다. 실제 메일의 다양한 문체에서는 연결률이 낮아질 수 있습니다(H3의 "should be" 문형이 그 예).</li>
      <li>오류 유형·비율은 설계자가 정했습니다. 실제 현장 오류 분포가 아닙니다.</li>
      <li>기준선은 엔진의 머리글 인식을 빌려 쓴 유리한 조건입니다(사람이 열을 맞춘 엑셀 대조).</li>
      <li>머리글 겹침(정규화 기준): H2는 12개 중 3개(LAST NAME·BIRTH PLACE·SEX), H3는 1개(Doc. Type)가 개발용과 같습니다.</li>
    </ul></div></div>
    <div class="panel"><div class="panel-head"><h3>재현 방법</h3></div><div class="panel-body small">
      <p><code class="cmd">node eval/run.mjs --split all</code> → <code>docs/eval-result.json</code>, <code>docs/eval-result.md</code> (개발·H1·H2, 현재 코드, 시드 ${ev.current.seed})</p>
      <p>H3 1회차 원본: <code>docs/eval-H3-first-run.json</code> — <code>node eval/run.mjs --split h3</code>는 결과 파일이 있으면 재실행을 거부합니다.</p>
      <p>H1·H2 1회차 원본: <code>docs/eval-holdout-first-run.json</code> (커밋 기록으로 시점 확인 가능)</p>
      <p class="muted">이 화면의 수치는 위 JSON 파일을 그대로 읽어 표시합니다.</p></div></div>
  </div>`;
}

// ---------------- 범위·법령 탭 ----------------
function renderScope() {
  $('#tab-scope').innerHTML = `
  <h2 class="section-title">범위와 근거</h2>
  <p class="section-lead">선박대리점이 받은 선원명부와 수정 자료를 FAL 5 항목으로 정리하고, 변경 근거와 확인 필요 항목을 보여 주는 신고자료 준비 도우미입니다.</p>
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h3>하는 일</h3></div><div class="panel-body"><ul class="facts">
      <li>선원명부(IMO FAL Form 5) 최초본·수정본·수정 메일 대조</li>
      <li>행 순서와 무관한 인물 대응(신분증번호 → 성명+생년월일 → 성명)</li>
      <li>변경마다 예상된 변경 / 확인 필요 / 오류 의심 3단계 분류와 근거 표시</li>
      <li>표기만 다른 것(대소문자·공백·날짜 형식·직급 약어·행 순서)은 경보하지 않음</li>
      <li>담당자 승인·보류 결과로 FAL 5 순서 CSV와 서명된 확인서 작성</li>
    </ul></div></div>
    <div class="panel"><div class="panel-head"><h3>하지 않는 일</h3></div><div class="panel-body"><ul class="facts">
      <li>신고 전송(출입국·세관·항만 시스템 연동 없음). KL-Net·정부 창구 연계는 향후 연계 후보이며 연동을 확인하지 않았습니다.</li>
      <li>화물목록(FAL 2) 등 다른 서식 — 확장 계획</li>
      <li>과태료·벌칙 대상 여부 판단</li>
      <li>현장 업무시간 절감 주장 — 후속 PoC에서 검증</li>
    </ul></div></div>
  </div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>오류 의심 규칙 (id 고정)</h3></div><div class="panel-body"><table class="grid"><tbody>${Object.values(RULES).map((r) => `<tr><td class="mono" style="width:40px"><b>${r.id}</b></td><td style="width:140px">${h(r.title)}</td><td>${h(r.desc)}</td></tr>`).join('')}</tbody></table>
  <p class="small muted" style="margin:8px 0 0">분류 우선순위: 값 자체가 잘못된 규칙(R4·R6·R7)은 메일 지시가 있어도 오류 의심 → 메일 지시 값과 일치하면 예상된 변경(R1~R3 모양이어도) → 지시 값과 다르면 R8 → R1~R3 → 나머지 확인 필요.</p></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>법령 근거 (law.go.kr 원문 XML에서 글자 그대로 인용)</h3></div><div class="panel-body">
    ${Object.values(LAWS).map((l) => `<div class="law-cite"><b>${h(l.law)} ${h(l.article)}</b> <span class="muted small">${h(l.version)}</span><blockquote style="margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--borderColor-default);background:var(--bgColor-muted)">${h(l.quote)}</blockquote>${l.quoteNote ? `<p class="small muted" style="margin:2px 0 0">${h(l.quoteNote)}</p>` : ''}</div>`).join('')}
    <div class="law-cite"><b>${h(IMMIGRATION_PENALTY.law)} ${h(IMMIGRATION_PENALTY.article)}</b> <span class="muted small">${h(LAWS.immigration.version)}</span><blockquote style="margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--borderColor-default);background:var(--bgColor-muted)">${h(IMMIGRATION_PENALTY.head)}<br>5. ${h(IMMIGRATION_PENALTY.quote)}</blockquote><p class="small muted" style="margin:2px 0 0">${h(IMMIGRATION_PENALTY.caution)}</p></div>
  </div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>IMO FAL Form 5 (Crew List) 항목</h3><span class="muted small">근거: FAL5_DE_2018.pdf</span></div><div class="panel-body"><p class="small" style="margin:0">${[...HEADER_FIELDS, { fal: '6', en: 'No.', ko: '번호' }, ...ROW_FIELDS, { fal: '18', en: 'Date and signature by master, authorized agent or officer', ko: '서명' }].map((f) => `${f.fal}. ${h(f.en)} (${h(f.ko)})`).join(' · ')}</p></div></div>`;
}

// ---------------- 이벤트 ----------------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, tr.item');
  if (!t) return;
  if (t.matches('.top-tab')) { setTab(t.dataset.tab); return; }
  if (t.dataset.step) { goStep(Number(t.dataset.step)); return; }
  if (t.dataset.scenario) { loadScenario(Number(t.dataset.scenario)); run(); render(); return; }
  if (t.dataset.view) { state.view = t.dataset.view; render(); return; }
  if (t.dataset.filter) { state.filter = t.dataset.filter; render(); return; }
  if (t.matches('tr.item')) { state.selected = t.dataset.item; render(); scrollMailHit(); return; }
  if (t.dataset.decide) { state.decisions[t.dataset.decide] = t.dataset.v; state.conf = null; render(); return; }
  const act = t.dataset.act;
  if (act === 'run') { readInputs(); run(); render(); }
  if (act === 'next') { if (state.step === 1 && !state.report) { readInputs(); run(); } goStep(state.step + 1); }
  if (act === 'prev') goStep(state.step - 1);
  if (act === 'restart') { loadScenario(state.scenario); goStep(1); }
  if (act === 'approve-expected') { for (const it of state.report.items) if (it.class === 'expected') state.decisions[it.id] = 'approve'; state.conf = null; render(); }
  if (act === 'hold-rest') { for (const it of state.report.items) if (!state.decisions[it.id]) state.decisions[it.id] = 'hold'; state.conf = null; render(); }
  if (act === 'download') download();
  if (act === 'copy-summary') { try { await navigator.clipboard.writeText($('#summary').value); t.textContent = '복사됨'; } catch { $('#summary').select(); } }
  if (act === 'sign') { await doSign(); render(); }
  if (act === 'verify') { await doVerify(false); render(); }
  if (act === 'tamper') { await doVerify(true); render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('tr.item')) { state.selected = e.target.dataset.item; render(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'approver') state.approver = e.target.value || '데모 담당자';
  if (e.target.dataset?.input) { state.inputs[e.target.dataset.input] = e.target.value; state.report = null; renderStepper(); const nx = $('[data-act="next"]'); if (nx) nx.disabled = true; }
});
function readInputs() {
  for (const ta of document.querySelectorAll('[data-input]')) state.inputs[ta.dataset.input] = ta.value;
}
function scrollMailHit() {
  const hit = $('[data-mail] [data-hit]');
  if (hit) hit.parentElement.scrollTop = Math.max(0, hit.offsetTop - hit.parentElement.offsetTop - 40);
}
function download() {
  const csv = toFal5Csv(state.report, state.decisions);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crew-list-fal5-${state.report.B.header.voyage?.value || 'demo'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadEval() {
  try {
    const [cur, first, h3] = await Promise.all(['docs/eval-result.json', 'docs/eval-holdout-first-run.json', 'docs/eval-H3-first-run.json'].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); })));
    state.eval = { current: cur, first, h3 };
  } catch (err) {
    state.eval = { error: err.message };
  }
  if (state.tab === 'eval') renderEval();
}

// ---------------- 시작 ----------------
async function start() {
  loadScenario(state.scenario);
  if (state.step > 1 || params.has('run')) run();
  if (params.get('item')) state.selected = params.get('item');
  // 스크린샷용: decide=auto → 예상된 변경 승인, 나머지 보류
  if (params.get('decide') === 'auto' && state.report) for (const it of state.report.items) state.decisions[it.id] = it.class === 'expected' ? 'approve' : 'hold';
  if (state.step === 4 && !allDecided()) state.step = 3;
  if (params.has('sign') && state.step === 4) { await doSign(); if (params.get('sign') === 'verify') await doVerify(false); if (params.get('sign') === 'tamper') await doVerify(true); }
  render();
  setTab(state.tab);
  scrollMailHit();
  await loadEval();
  await document.fonts.ready;
  document.documentElement.dataset.ready = '1';
}
start();
