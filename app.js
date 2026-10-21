// CrewDiff 데모 화면. 엔진(lib/)을 브라우저에서 그대로 돌린다. 서버·로그인·설치 없음.
import { SCENARIOS } from './data/scenarios.js';
import { compareCrewLists } from './lib/engine.js';
import { ROW_FIELDS, HEADER_FIELDS, FIELD, fieldLabel } from './lib/fields.js';
import { colLetter, splitRows } from './lib/parse.js';
import { CLASS_LABEL } from './lib/classify.js';
import { RULES } from './lib/rules.js';
import { LAWS, IMMIGRATION_PENALTY, impactOf } from './lib/impact.js';
import { DIRECTIVE_LABEL } from './lib/notice.js';
import { toFal5Csv, toBaseCsv, pendingItems, DECISION_LABEL } from './lib/export.js';
import { buildConfirmation, signConfirmation, verifyConfirmation } from './lib/receipt.js';
import { DEMO_KID } from './lib/demo-key.js';
import { decodeJws, b64uJson } from './lib/jose.js';

const $ = (s, el = document) => el.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);

const STEPS = [
  { title: '자료 받기', sub: '최초본·수정본·메일' },
  { title: '변경 대조', sub: '봐야 할 곳과 근거' },
  { title: '관련 신고·결정', sub: '반영·유지·선사 문의' },
  { title: '내보내기', sub: '확정 명부 또는 미확정 검토본' },
];
const KIND_LABEL = { modify: '값 변경', add: '추가(승선)', remove: '삭제(하선)', duplicate: '중복 행', directive: '메일 지시', standing: '기존 값' };
const ORDER = { suspect: 0, check: 1, expected: 2 };

const state = {
  tab: params.get('tab') || (['step', 'scenario', 'item', 'decide', 'filter'].some((k) => params.has(k)) ? 'demo' : 'replay'),
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

function setTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('.top-tab')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  for (const id of ['replay', 'demo', 'eval', 'scope']) $(`#tab-${id}`).hidden = id !== tab;
  $('#replayBadge').hidden = tab !== 'replay';
  if (tab === 'replay') renderReplay();
  if (tab === 'eval') renderEval();
  if (tab === 'scope') renderScope();
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
  state.step = n;
  render();
  window.scrollTo({ top: 0 });
}

function renderStepper() {
  $('#stepper').innerHTML = STEPS.map((s, i) => {
    const n = i + 1;
    const cur = n === state.step;
    const done = n < state.step;
    return `<li class="${done ? 'done' : ''}" ${cur ? 'aria-current="step"' : ''}><button type="button" data-step="${n}" ${canGo(n) ? '' : 'disabled'}><span class="num">${done ? '<i class="ti ti-check"></i>' : n}</span><span><span class="st-title">${n}. ${s.title}</span><span class="st-sub">${s.sub}</span></span></button></li>`;
  }).join('');
}

function voyageBar() {
  const sc = SCENARIOS[state.scenario - 1];
  const ctx = sc?.ctx || {};
  const hd = state.report?.B.header || {};
  const pend = state.report ? pendingItems(state.report, state.decisions).length : 0;
  let status = ['대조 전', 'idle'];
  if (state.report && state.report.blocked) status = ['명부 판독 실패 · 사람 검토', 'bad'];
  else if (state.step === 4 && pend) status = [`선사 문의 ${pend}건 · 선장 회신 대기`, 'wait'];
  else if (state.step === 4) status = ['확정', 'ok'];
  else if (state.report) status = ['대조·결정 중', 'work'];
  const t = (cls, label, sub) => `<li class="${cls}"><span class="dot"></span><b>${label}</b><span>${h(sub || '')}</span></li>`;
  const v1 = state.scenario === 5 ? '기준본' : '최초본 V1';
  const v2 = state.scenario === 5 ? '회신 + V3' : '수정본 V2 + 메일';
  return `<section class="voyage" aria-label="항차 정보">
    <div class="v-main">
      <div class="v-ship"><i class="ti ti-anchor v-icon" aria-hidden="true"></i>${h(hd.shipName?.value || 'DEMO HANBIT 3')} <span class="v-voy">V.${h(hd.voyage?.value || '2611E')}</span></div>
      <div class="v-meta">${h(({ BUSAN: '부산', ULSAN: '울산', INCHEON: '인천', GWANGYANG: '광양', PYEONGTAEK: '평택' })[hd.port?.value] || hd.port?.value || '부산')} 입항 <b>${h(ctx.eta || hd.date?.value || '')}</b> · 출입국 보고 마감 <b>${h(ctx.due || '입항 2시간 전')}</b> <span class="muted">(입항 2시간 전)</span></div>
    </div>
    <ol class="v-timeline">
      ${t('done', v1, (ctx.v1 || '').replace(/\s*(최초본|기준본).*$/, ''))}
      ${t(state.step === 4 ? 'done' : 'cur', v2, ctx.at)}
      ${t(state.step === 4 ? (pend ? 'cur wait' : 'done ok') : '', pend && state.step === 4 ? '확인 요청 → 회신 대기' : '확정 명부', state.step === 4 ? (pend ? `${pend}건` : '모두 결정') : '')}
    </ol>
    <span class="v-status ${status[1]}">${status[0]}</span>
  </section>
  ${ctx.situation ? `<p class="situation"><b>상황</b> ${h(ctx.situation)}</p>` : ''}`;
}

function render() {
  $('#voyage').innerHTML = voyageBar();
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
    if (ev && out.includes(ev)) out = out.replace(ev, `<mark class="ev ${it.apply ? 'on' : 'off'}">${ev}</mark>`);
  }
  return out;
}
function aiReadHtml(n, mail, rep) {
  const ai = aiFor(n, mail);
  if (!ai) {
    return `<div class="ai-read rule"><div class="ai-read-head"><i class="ti ti-list-check" aria-hidden="true"></i><b>메일 해석: 규칙 방식</b><span class="small muted">${SCENARIOS[n - 1] && mail !== SCENARIOS[n - 1].mail ? '메일을 직접 고쳐 AI 결과가 없으므로 규칙 방식으로 읽었습니다' : '이 메일은 규칙 방식으로 읽었습니다'}</span></div></div>`;
  }
  const rows = ai.instructions.map((it) => `<li><span class="ai-st ${it.apply ? 'on' : 'off'}">${it.apply ? '반영함' : `반영 안 함 · ${h(AI_REASON[it.not_applied_reason] || it.not_applied_reason || '')}`}</span>
    <span class="ai-what"><b>${h(AI_TYPE[it.type] || it.type)}</b> ${h(it.person || '')}${it.field ? ` · ${h(FIELD[it.field]?.ko || it.field)}` : ''}${it.value ? ` → <span class="mono">${h(it.value)}</span>` : ''}</span>
    <span class="ai-ev">“${h(it.evidence || '')}”</span></li>`).join('');
  const extra = (rep?.noticeWarnings || []).filter((w) => /근거 문장|특정하지/.test(w));
  return `<div class="ai-read"><div class="ai-read-head"><i class="ti ti-sparkles" aria-hidden="true"></i><b>AI가 읽은 요청 ${ai.instructions.length}건</b><span class="small muted">미리 실행한 결과${AI.meta?.model ? ` · ${h(AI.meta.model)}` : ''} · 판정은 엔진 규칙이 하고, 근거 문장이 원문에 있는지 확인함</span></div>
    ${rows ? `<ul class="ai-list">${rows}</ul>` : '<p class="small muted" style="margin:6px 0 0">반영할 요청 없음</p>'}${extra.length ? `<ul class="warn-list">${extra.map((w) => `<li>${h(w)}</li>`).join('')}</ul>` : ''}</div>`;
}

function step1() {
  const sc = SCENARIOS[state.scenario - 1];
  const ctx = sc?.ctx || {};
  const m = splitMail(state.inputs.mail);
  const rowsN = (k) => (state.report ? (k === 'a' ? state.report.A.rows.length : state.report.B.rows.length) : null);
  const file = (k, label, sub) => `<div class="attach"><span class="attach-ic" aria-hidden="true">${k === 'a' ? 'V1' : 'V2'}</span><span><b>${label}</b><span class="muted small">${sub}${rowsN(k) != null ? ` · ${rowsN(k)}명` : ''}</span></span></div>`;
  const box = (key, title, sub) => `<div class="panel"><div class="panel-head"><h3>${title}</h3><span class="muted small">${sub}</span></div><textarea class="mono" data-input="${key}" spellcheck="false" aria-label="${title}">${h(state.inputs[key])}</textarea></div>`;
  const others = SCENARIOS.map((x) => `<button type="button" class="case" data-scenario="${x.id}" aria-pressed="${x.id === state.scenario}"><b>${x.id}</b> ${h(x.title)}</button>`).join('');
  return `
  ${state.scenario === 2 && !state.rebased ? `<div class="intro">
    <div><p class="intro-lead">수정본이 오면, 바뀐 곳 가운데 <b>사람이 꼭 봐야 할 곳</b>만 근거와 함께 골라 줍니다.</p>
    <p class="intro-sub"><span class="cls suspect">오류 의심</span> 규칙에 걸린 변경 &nbsp; <span class="cls check">확인 필요</span> 근거 없는 변경 &nbsp; <span class="cls expected">예상된 변경</span> 메일에 근거 있음</p></div>
  </div>` : ''}
  <div class="inbox">
    <div class="mail">
      <div class="mail-head">
        <div class="mail-from"><span class="avatar" aria-hidden="true">${h((m.head.from || ctx.from || '선사').trim().charAt(0))}</span><div><b>${h(m.head.from || ctx.from || '보낸 사람 없음')}</b><span class="muted small">${h(ctx.at || '')}</span></div></div>
        <div class="mail-subject">${h(m.head.subject || '(제목 없음)')}</div>
      </div>
      <pre class="mail-body">${m.body ? mailBodyHtml(m.body, aiFor(state.scenario, state.inputs.mail)) : '(메일 본문 없음)'}</pre>
      <div class="mail-ai">${aiReadHtml(state.scenario, state.inputs.mail, state.report)}</div>
      <div class="attachments">${file('a', state.scenario === 5 ? '기준본 (확정한 결정만 반영)' : '최초본 선원명부', (ctx.v1 || '').replace(/\s*(최초본|기준본).*$/, '') || fmtInfo(state.inputs.a))}${file('b', state.scenario === 5 ? '수정본 V3' : '수정본 선원명부', (ctx.v2 || '').replace(/\s*수정본.*$/, '') || fmtInfo(state.inputs.b))}</div>
    </div>
    <aside class="inbox-side">
      <div class="side-card"><h3>도구가 할 일</h3><ol class="todo"><li>두 명부를 FAL 5 항목으로 맞추고 같은 사람끼리 짝짓기</li><li>바뀐 곳마다 메일 근거·오류 규칙 찾기</li><li>사람이 볼 곳만 골라 보여 주기</li></ol>
        <button type="button" class="btn btn-primary btn-block" data-act="next">변경 대조 결과 보기 →</button>
        ${state.report ? '' : state.rebased ? '<p class="small muted" style="margin:8px 0 0">기준본이 최초본 칸에 들어갔습니다. 아래 원문 칸에 회신 후 수정본과 회신 메일을 붙여 넣으세요.</p>' : '<p class="small muted" style="margin:8px 0 0">입력을 고쳤습니다 — 누르면 다시 대조합니다.</p>'}</div>
      <div class="side-card"><h3>다른 사례</h3><div class="cases">${others}</div></div>
    </aside>
  </div>
  <details class="raw panel"${state.rebased ? ' open' : ''}><summary>원문 보기 · 직접 붙여 넣기 <span class="muted small">(표는 CSV·엑셀 복사 모두 읽음)</span></summary>
    <div class="inputs">
      ${box('a', state.scenario === 5 ? '기준본' : '최초본 선원명부', fmtInfo(state.inputs.a))}
      ${box('b', '수정본 선원명부', fmtInfo(state.inputs.b))}
      ${box('mail', '메일 원문', '교대 통보·정정 요청·회신')}
    </div>
  </details>
  ${state.report ? `<details class="raw panel"><summary>FAL 5 항목으로 정리된 명부 보기</summary>${normalizedView()}</details>` : ''}
  <p class="note"><b>데모 범위:</b> 표는 브라우저에서 실제로 읽습니다. 메일은 AI가 <b>미리 읽어 둔 결과</b>를 기본으로 쓰며(이 화면에서 AI를 새로 호출하지 않음), 엔진이 근거 문장이 원문에 있는지 확인한 뒤 규칙으로 판정합니다. 메일을 직접 고치면 AI 결과가 없으므로 규칙 방식(부정·취소·조건·인용 문장은 지시로 쓰지 않음)으로 읽습니다. 메일 해석 성능은 '평가 결과' 탭에 있습니다.</p>`;
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
    return `<b>${h(FIELD[it.field].ko)}</b> <span class="muted small">${FIELD[it.field].fal}. ${h(FIELD[it.field].en)}</span><br>${it.kind === 'standing' ? `<span class="val-after">${h(valueText(it.after))}</span>` : (() => { const [x, y] = diffPair(valueText(it.before), valueText(it.after)); return `<span class="vals"><span class="val-before">${x}</span><span class="arrow" aria-label="에서">→</span><span class="val-after">${y}</span></span>`; })()}`;
  }
  if (it.kind === 'add') return `<b>명부에 추가</b> <span class="muted small">${h(it.rowB.cells.rank.value)} · ${h(it.rowB.cells.nationality.value)}</span>`;
  if (it.kind === 'remove') return `<b>명부에서 빠짐</b> <span class="muted small">${h(it.rowA.cells.rank.value)}</span>`;
  if (it.kind === 'duplicate') return `<b>같은 사람이 두 번</b> <span class="muted small">수정본 ${it.dupOf.line}행 · ${it.rowB.line}행</span>`;
  if (it.kind === 'directive') return `<b>${DIRECTIVE_LABEL[it.directive.type]} 지시</b>${it.field ? ` <span class="muted small">${h(FIELD[it.field]?.ko || '')}</span>` : ''}`;
  return '';
}

function basisText(it) {
  const parts = [];
  if (it.rules?.length) parts.push(it.rules.map((r) => `${r.title} (${r.id})`).join(', '));
  if (it.directive) parts.push(`메일 ${it.directive.line}번째 줄`);
  if (!parts.length) parts.push(it.reason);
  return parts.join(' · ');
}

function step2() {
  const r = state.report;
  const s = r.summary;
  const stat = (k, label, n, sub) => `<button type="button" class="stat ${k}" data-filter="${k}" aria-pressed="${state.filter === k}"><span class="stat-n">${n}</span><span class="stat-l">${label}</span><span class="stat-s">${sub}</span></button>`;
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
  <p class="section-lead">행 순서와 상관없이 같은 사람끼리 맞춘 뒤, 실제로 바뀐 항목만 보여 줍니다. <b>예상된 변경</b>은 메일에 근거 문장이 있을 때만, <b>오류 의심</b>은 정해 둔 오류 규칙 8가지(문자 혼동, 일·월 뒤바뀜, 메일 지시 미반영 등)에 걸릴 때만, 나머지는 모두 <b>확인 필요</b>입니다. 행을 누르면 두 원문과 근거가 나옵니다.</p>
  <div class="stats">
    ${stat('suspect', '오류 의심', s.suspect, '먼저 확인 · 규칙에 걸림')}
    ${stat('check', '확인 필요', s.check, '근거 없는 변경')}
    ${stat('expected', '예상된 변경', s.expected, '메일 근거 있음 · 근거 보고 반영')}
    <div class="stat cosmetic"><span class="stat-n">${s.cosmetic}</span><span class="stat-l">표기 차이</span><span class="stat-s">자동 정리 · 경보 안 함</span></div>
  </div>
  ${documentAlertBox(r)}${columnAlertBox(r)}
  ${state.scenario === 6 && r.mailReader === 'ai' ? readerCompare() : ''}
  <div class="compare">
    <div>
      <div class="panel">
        <div class="panel-head"><h3>${state.filter === 'all' ? '바뀐 항목 전체' : CLASS_LABEL[state.filter]} ${items.length}건 <span class="muted small" style="font-weight:400">· 위험한 순서</span></h3>${state.filter === 'all' ? '' : chip('all', '전체 보기', r.items.length)}</div>
        <div class="table-wrap"><table class="grid changes"><thead><tr><th style="width:150px">인물</th><th style="width:96px">분류</th><th>바뀐 항목</th><th style="width:30%">근거</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">해당하는 변경이 없습니다.</td></tr>'}</tbody></table></div>
      </div>
      <details class="cosmetic-fold panel"><summary>표기 차이 ${s.cosmetic}건 — 대소문자·공백·날짜 형식·직급 약어 차이(변경으로 세지 않음)</summary>
        <div class="table-wrap"><table class="grid"><thead><tr><th>인물</th><th>항목</th><th>최초본 원문</th><th>수정본 원문</th><th>위치</th></tr></thead><tbody>${cos || '<tr><td colspan="5" class="muted">없음</td></tr>'}</tbody></table></div>
      </details>
    </div>
    <aside class="detail panel" aria-label="선택한 변경의 근거">${detailPanel()}</aside>
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
  const col = (title, icon, rep, note) => `<div class="rc-col"><div class="rc-head"><i class="ti ${icon}" aria-hidden="true"></i><b>${title}</b><span class="small muted">봐야 할 곳 ${rep.summary.suspect + rep.summary.check}건 · 예상된 변경 ${rep.summary.expected}건</span></div>
    <ul class="rc-list">${sortedItems(rep).map((it) => `<li><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span> <b>${h(it.person)}</b> <span class="muted small">${it.field ? h(FIELD[it.field].ko) : h(KIND_LABEL[it.kind])} · ${h(it.reason)}</span></li>`).join('')}</ul><p class="small rc-note">${note}</p></div>`;
  return `<div class="panel reader-compare"><div class="panel-head"><h3>같은 메일, 두 가지 읽기</h3><span class="small muted">한국어 이름·목록형 정정·이전 요청 취소</span></div><div class="rc-grid">
    ${col('규칙 방식', 'ti-list-check', ruleR, '한국어 이름 "최동현"을 명부의 CHOI DONGHYUN과 잇지 못해 여권번호 정정이 확인 필요로 남고, 메일 줄 단위 경보가 더 생깁니다.')}
    ${col('AI 해석 (미리 실행한 결과, 기본)', 'ti-sparkles', aiR, '정정은 메일 근거가 있는 예상된 변경이 되고, 취소된 SANTOS 생년월일 요청은 반영하지 않습니다. 그래서 수정본에 들어온 SANTOS 값 변경은 여전히 오류 의심입니다.')}
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
      const [da, db] = diff && a && b ? diffPair(ra, rb) : [h(ra), h(rb)];
      return `<tr class="${diff ? 'diff' : ''}"><th>${f.fal}. ${h(f.ko)}</th><td class="mono">${a ? (ra ? da : '<span class="muted">(빈칸)</span>') : ''}</td><td class="mono">${b ? (rb ? db : '<span class="muted">(빈칸)</span>') : ''}</td></tr>`;
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
  if (it.evidence?.inferredColumn) ev += `<p class="small" style="margin:12px 0 0"><b>추정 매핑</b> · 이 항목의 열은 머리글을 사전에서 찾지 못해 값 모양·열 순서로 추정해 매핑했습니다. 열이 맞는지 확인하세요.</p>`;
  if (it.evidence?.formatAlert) ev += `<p class="small" style="margin:12px 0 0"><b>열 서식 확인 필요</b> · 이 열은 값을 해석하지 못해 원문 문자열로만 비교했습니다. 원문이 바뀌었으므로 확인 필요로 남깁니다.</p>`;
  if (it.class === 'check' && !it.directive && !it.rules?.length && !it.evidence?.formatAlert) ev += `<p class="small" style="margin:12px 0 0"><b>근거</b> · 이 변경을 설명하는 메일 지시도, 위반한 규칙도 없습니다. 근거가 부족하면 기본값은 확인 필요입니다.</p>`;
  const m = it.match ? `<dl class="kv" style="margin-top:12px"><dt>인물 대응</dt><dd>${h({ idNumber: '신분증번호 일치', 'idNumber~confusable': '신분증번호(혼동 문자 무시) 일치', 'name+dob': '성명+생년월일', name: '성명 유사도', 'name(dob 판독 불가)': '성명(생년월일 판독 불가)' }[it.match.method] || it.match.method)} · 신뢰도 ${it.match.confidence.toFixed(2)}</dd><dt>분류 이유</dt><dd>${h(it.reason)}</dd></dl>` : `<dl class="kv" style="margin-top:12px"><dt>분류 이유</dt><dd>${h(it.reason)}</dd></dl>`;
  return `${head}<div class="panel-body">${src}${ev}${m}</div>`;
}

// ---------------- 3단계 ----------------
function step3() {
  const r = state.report;
  const n = r.items.length;
  const done = r.items.filter((it) => state.decisions[it.id]).length;
  const changedPenaltyFields = [...new Set(r.items.filter((it) => impactOf(it).art100).map((it) => (it.field ? FIELD[it.field].ko : KIND_LABEL[it.kind])))];
  const impact = Object.values(LAWS).map((l) => `<div class="panel impact"><h3>${h(l.report)}</h3><div class="law">${h(l.law)} ${h(l.article)} · 제출처: ${h(l.agency)}</div><div class="count">이번 변경 <b>${n}건</b>이 첨부 승무원명부에 반영되어야 합니다.</div><details><summary>조문 원문 보기</summary><blockquote>${h(l.quote)}${l.quoteNote ? `<br><span class="muted">(${h(l.quoteNote)})</span>` : ''}</blockquote>${l.formTitle ? `<p class="small muted" style="margin:6px 0 0">${h(l.formLabel)}: ${h(l.formTitle)}</p>` : ''}<p class="small muted" style="margin:6px 0 0">${h(l.version)}</p></details></div>`).join('');
  const rows = sortedItems().map((it) => {
    const v = state.decisions[it.id];
    return `<div class="arow"><div><b>${h(it.person)}</b></div><div><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></div><div class="small">${changeText(it)} <span class="muted">· ${h(basisText(it))}</span></div><div class="seg" role="group" aria-label="${h(it.person)} 결정">${['approve', 'keep', 'pending'].map((k) => `<button type="button" data-decide="${it.id}" data-v="${k}" aria-pressed="${v === k}">${DECISION_LABEL[k]}</button>`).join('')}</div></div>`;
  }).join('');
  return `
  <h2 class="section-title">3. 관련 신고·결정</h2>
  <p class="section-lead">항목마다 <b>수정본 반영</b> · <b>최초본 유지</b>(최초본이 맞다고 확인함) · <b>선사 문의</b>(아직 모름) 중 하나를 정합니다. 선사 문의가 남으면 최종 명부 대신 미확정 검토본과 선사 확인 요청만 만듭니다.<br><span class="small">선원명부는 아래 네 신고에 첨부되는 자료이므로, 확정한 명부는 네 곳 모두에 같게 들어가야 합니다(신고별 요구 차이나 변경신고 필요 여부를 판정하지는 않습니다. 신고 전송도 하지 않습니다).</span></p>
  <div class="panel decide-panel">
    <div class="panel-head"><h3>항목별 결정</h3>
      <div class="progress-line"><span>처리 ${done}/${n}</span><span class="bar"><i style="width:${n ? (done / n) * 100 : 100}%"></i></span>
      <button type="button" class="btn btn-sm" data-act="approve-expected">예상된 변경 모두 반영</button>
      <button type="button" class="btn btn-sm" data-act="hold-rest">남은 항목 선사 문의</button></div>
    </div>
    <div class="approve-list">${rows || '<div class="arow muted">변경이 없습니다.</div>'}</div>
  </div>
  <div class="row-actions">
    <button type="button" class="btn" data-act="prev">이전</button>
    <label class="small" for="approver">승인자 표시명</label><input id="approver" class="form-control form-control-sm" value="${h(state.approver)}" style="width:160px">
    <span class="spacer"></span>
    ${allDecided() ? '' : `<span class="small muted">남은 결정 ${n - done}건 — 위의 '예상된 변경 모두 반영', '남은 항목 선사 문의'로 한 번에 정할 수 있습니다</span>`}
    <button type="button" class="btn btn-primary" data-act="next" ${allDecided() ? '' : 'disabled'}>다음: 내보내기</button>
  </div>
  <h3 class="sub-title">이 명부가 첨부되는 신고 4가지</h3>
  <div class="impact-grid">${impact}</div>
  <div class="panel penalty"><b>출입국관리법 제100조제1항제5호 관련 항목</b> <span class="muted small">— 이번 변경 중 국적·성명·성별·생년월일·여권번호에 해당: ${changedPenaltyFields.length ? h(changedPenaltyFields.join(', ')) : '없음'}</span>
    <blockquote>${h(IMMIGRATION_PENALTY.head)}<br>5. ${h(IMMIGRATION_PENALTY.quote)}</blockquote>
    <p class="small muted" style="margin:6px 0 0">${h(IMMIGRATION_PENALTY.caution)}</p></div>`;
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
  let conf = `<p class="small" style="margin-top:0">누가 어떤 변경을 반영·유지했는지와 확정 명부를 묶어, 나중에 한 글자라도 바뀌면 알 수 있게 남깁니다(내용이 맞는지를 보증하지는 않음).</p>
    <button type="button" class="btn btn-primary" data-act="sign"><i class="ti ti-device-floppy"></i> 결정 기록 저장</button>
    ${tech(`<p class="small muted" style="margin:0">최종 명부 SHA-256 해시 + ECDSA P-256(ES256) 서명. <b>프로토타입은 공개된 데모 키</b>(${DEMO_KID})라 누구나 같은 서명을 만들 수 있으며, 운영 시에는 담당자별 키를 씁니다.</p>`)}`;
  if (pend) {
    conf = `<div class="alert alert-warning" style="margin:0 0 10px"><b>선사 문의 ${pend}건이 남아 최종 명부와 결정 기록을 만들지 않습니다.</b> 왼쪽은 미확정 검토본입니다(선사 문의 칸은 값 대신 "선사 문의"로 표시).</div>
    <p class="small">선사 회신을 받으면, 지금 확정한 결정만 반영한 <b>기준본</b>과 회신 후 수정본을 다시 대조합니다. 회신으로 설명되는 변경은 메일 근거가 붙어 '예상된 변경'이 되고, 모든 항목이 정해지면 최종 명부를 만듭니다.</p>
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
  <h2 class="section-title">4. 내보내기${pend ? ` — 미확정 (선사 문의 ${pend}건)` : ' — 확정'}</h2>
  <p class="section-lead">${pend ? '선사 문의가 남아 있어 미확정 검토본과 선사 확인 요청만 만듭니다.' : '모든 항목이 정해져 FAL 5 순서 확정 명부와, 누가 무엇을 반영·유지했는지 남기는 결정 기록을 만듭니다.'} 기관 시스템 제출 파일이 아니라 담당자 확인용 준비 자료입니다.</p>
  <div class="export-grid">
    <div class="stack">
      <div class="panel"><div class="panel-head"><h3>${pend ? '미확정 검토본 (최종 명부 아님)' : '확정 명부 (FAL 5 순서 CSV)'}</h3><button type="button" class="btn btn-sm" data-act="download">CSV 내려받기</button></div><div class="panel-body"><pre class="box mono csv">${h(csv).replaceAll('선사 문의', '<mark class="pend">선사 문의</mark>')}</pre><p class="small muted" style="margin:8px 0 0">수정본 반영은 수정본 값, 최초본 유지는 최초본 값(승선 제외·하선 유지), 선사 문의는 값 대신 "선사 문의"와 검토 상태 열로 표시합니다.</p></div></div>
      <div class="panel"><div class="panel-head"><h3>선사에 보낼 확인 요청</h3><button type="button" class="btn btn-sm" data-act="copy-summary">복사</button></div><div class="panel-body"><textarea class="form-control summary mono" id="summary" aria-label="선사에 보낼 확인 요청">${h(shipperSummary())}</textarea></div></div>
    </div>
    <div class="panel"><div class="panel-head"><h3>결정 기록</h3><span class="muted small">${pend ? '선사 문의 해소 후 저장' : '누가 무엇을 반영했는지'}</span></div><div class="panel-body">${conf}</div></div>
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
  <h2 class="section-title">평가 결과 — 합성 데이터</h2>
  <p class="section-lead">가상으로 만든 명부·메일로 시험한 결과입니다. 실제 현장 자료에서는 달라질 수 있습니다.</p>
  <div class="eval-cards">
    <div class="eval-card"><i class="ti ti-mail-check" aria-hidden="true"></i><div class="eval-big">${llm.tp}<small>/${llm.gold}건</small></div><div><b>메일 요청을 AI가 맞게 읽음</b><div class="small muted">“하지 말라”, “취소”, 조건부, 이전 메일 인용 같은 함정 문장을 반영으로 잘못 읽은 것 <b>${llm.trapApplied}/${llm.trapTotal}</b></div></div></div>
    <div class="eval-card"><i class="ti ti-zoom-check" aria-hidden="true"></i><div class="eval-big">${pc(fh.baselineIdMail.review.ratio)} <small>→</small> ${pc(fh.engine.review.ratio)}</div><div><b>사람이 하나씩 볼 칸</b><div class="small muted">같은 메일 정보를 준 엑셀식 비교 대비. 놓친 실제 오류는 둘 다 ${fh.engine.review.missedErrorsOutside}건</div></div></div>
    <div class="eval-card"><i class="ti ti-hand-stop" aria-hidden="true"></i><div class="eval-big small-big">멈춤</div><div><b>처음 보는 외국어 양식은 사람에게 넘김</b><div class="small muted">명부를 읽지 못하면 결정 단계로 가지 못하게 막습니다(시험 60쌍 모두 차단)</div></div></div>
  </div>
  <details class="raw panel eval-more"><summary>시험 방법과 상세 표 보기 <span class="muted small">(메일 해석 비교 · 양식별 시험 · 한계 · 재현 방법)</span></summary><div class="eval-more-body">
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h3>① 메일 해석: 규칙 방식 vs AI</h3><span class="muted small">메일 ${ev.mail.runs[0].mails}통 · 별도 작성자 출제</span></div><div class="panel-body">${mailTable}
      <p class="small" style="margin:8px 0 0">시험지(eval/mail-challenge)는 규칙 파서 코드를 보지 않은 별도 작성자가 명세만 보고 만들었고, 어느 쪽도 실행하기 전에 커밋했습니다. LLM은 정답을 보지 않고 고정 프롬프트로 메일만 읽었습니다(${h(ev.mail.llmMeta?.runner || '')}, ${h(ev.mail.llmMeta?.model || '')}). <b>한계:</b> 출제자와 해석자가 같은 계열 모델이라 문체가 익숙했을 수 있고, 실제 메일이 아닌 합성 102통이며, API 재실행 시 결과가 달라질 수 있습니다. 출력 원본: <code>eval/mail-challenge/llm-*.json</code>. 이 결과는 메일 해석만 잰 것이며, 앱 화면의 메일 해석은 아직 규칙 파서입니다.</p></div></div>
    <div class="panel"><div class="panel-head"><h3>② 같은 메일 정보를 준 엑셀식 비교와 견줌 (참고값)</h3></div><div class="panel-body">${finTable}
      <p class="small" style="margin:8px 0 0">기준선3은 단순 대조에 엔진과 <b>같은 메일 지시</b>를 줬습니다. 같은 정보를 주면 놓친 오류는 둘 다 0이고, 엔진의 차이는 <b>개별 검토량</b>(표기 차이·인물 대응·오류 규칙)에서 나옵니다. 이미 결과를 본 홀드아웃을 지금 코드로 다시 잰 값이라 참고값입니다(<code>docs/eval-final.md</code>, H3·H4 포함). H4는 60쌍 모두 문서 차단 → 수동 검토(절감 아님).</p></div></div>
  </div>
  <h3 class="section-title" style="margin-top:24px">개발 과정 기록 — 개발 때 쓰지 않은 시험 세트(홀드아웃)의 첫 측정</h3>
  <p class="section-lead">합성 수정본 쌍 320개(개발 140 · 홀드아웃 H1·H2 60 · H3 60 · H4 60), 라벨된 실질 변경 ${total}건. 각 홀드아웃은 한 번만 씁니다. <b>합성 데이터 결과라 실제 현장 명부·메일에서는 다를 수 있습니다.</b> 현장 업무시간 절감은 주장하지 않으며 후속 PoC 과제입니다.</p>
  <div class="panel eval-summary"><b>요약 — 세 홀드아웃의 1회차를 모두 공개하며 하나로 합치지 않습니다</b><ul class="facts small" style="margin:6px 0 0">
    <li><b>개발에 쓰지 않은 서식(H1·H2)</b>: 확인 대상에서 빠진 실제 오류 ${first.engine.review.missedErrorsOutside}건(단순 대조는 ${first.baselineRow.review.missedErrorsOutside}건·${first.baselineId.review.missedErrorsOutside}건), 담당자가 개별 확인할 범위 ${pc(first.engine.review.ratio)}.</li>
    <li><b>처음 보는 날짜·머리글(H3)</b>: 놓친 오류는 ${h3.engine.review.missedErrorsOutside}건이었지만 경보가 많아(쌍당 ${h3.engine.falseAlarms.perPair.toFixed(2)}건) 단순 신분증번호 대조(${h3.baselineId.falseAlarms.perPair.toFixed(2)}건)보다 확인 부담이 컸습니다.</li>
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
  <p class="small muted" style="margin:8px 0 0">기준선1 행 = 같은 행 번호끼리 문자열 대조, 기준선2 ID키 = 신분증번호로 행을 맞춘 뒤 문자열 대조. 검수 범위 = 개별 확인 항목(엔진: 오류 의심+확인 필요 / 기준선: 모든 경보) ÷ 수정본 셀 수이며, 항상 <b>검수 대상에서 빠진 실제 오류 수</b>와 함께 봅니다. 열 단위 서식 경보는 셀 오경보와 따로 셉니다.</p>
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
  <p class="section-lead">선박대리점이 받은 선원명부와 수정 자료를 FAL 5 항목으로 정리하고, 변경 근거와 확인 필요 항목을 보여 주는 신고자료 준비 도우미입니다.</p>
  <div class="two-col">
    <div class="panel"><div class="panel-head"><h3>하는 일</h3></div><div class="panel-body"><ul class="facts">
      <li>선원명부(IMO FAL Form 5) 최초본·수정본·수정 메일 대조</li>
      <li>행 순서와 무관한 인물 대응(신분증번호 → 성명+생년월일 → 성명)</li>
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
  </div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>오류 의심 규칙 (id 고정)</h3></div><div class="panel-body"><table class="grid"><tbody>${Object.values(RULES).map((r) => `<tr><td class="mono" style="width:40px"><b>${r.id}</b></td><td style="width:140px">${h(r.title)}</td><td>${h(r.desc)}</td></tr>`).join('')}</tbody></table>
  <p class="small muted" style="margin:8px 0 0">분류 우선순위: 값 자체가 잘못된 규칙(R4·R6·R7)은 메일 지시가 있어도 오류 의심 → 메일 지시 값과 일치하면 예상된 변경(R1~R3 모양이어도) → 지시 값과 다르면 R8 → R1~R3 → 나머지 확인 필요.</p></div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>법령 근거 (law.go.kr 원문 XML에서 글자 그대로 인용)</h3></div><div class="panel-body">
    ${Object.values(LAWS).map((l) => `<div class="law-cite"><b>${h(l.law)} ${h(l.article)}</b> <span class="muted small">${h(l.version)}</span><blockquote style="margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--borderColor-default);background:var(--bgColor-muted)">${h(l.quote)}</blockquote>${l.quoteNote ? `<p class="small muted" style="margin:2px 0 0">${h(l.quoteNote)}</p>` : ''}</div>`).join('')}
    <div class="law-cite"><b>${h(IMMIGRATION_PENALTY.law)} ${h(IMMIGRATION_PENALTY.article)}</b> <span class="muted small">${h(LAWS.immigration.version)}</span><blockquote style="margin:4px 0 0;padding:6px 10px;border-left:3px solid var(--borderColor-default);background:var(--bgColor-muted)">${h(IMMIGRATION_PENALTY.head)}<br>5. ${h(IMMIGRATION_PENALTY.quote)}</blockquote><p class="small muted" style="margin:2px 0 0">${h(IMMIGRATION_PENALTY.caution)}</p></div>
  </div></div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><h3>IMO FAL Form 5 (Crew List) 항목</h3><span class="muted small">근거: FAL5_DE_2018.pdf</span></div><div class="panel-body"><p class="small" style="margin:0">${[...HEADER_FIELDS, { fal: '6', en: 'No.', ko: '번호' }, ...ROW_FIELDS, { fal: '18', en: 'Date and signature by master, authorized agent or officer', ko: '서명' }].map((f) => `${f.fal}. ${h(f.en)} (${h(f.ko)})`).join(' · ')}</p></div></div>`;
}

// ---------------- 현장 재현 모드 ----------------
// 입항 전날 밤 대리점 담당자의 화면을 장면별로 재현한다. 수치는 모두 엔진을 실제로 돌린 결과(사례 2 → 사례 5).
const RP = { scene: Math.min(6, Math.max(1, Number(params.get('scene')) || 1)), open: null, box: null, data: null, toastScene: 0 };
const KDATE = (s) => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\D+(\d{1,2}):(\d{2})/); return m ? new Date(2026, m[1] - 1, +m[2], +m[3], +m[4]) : null; };
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const mdw = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${DOW[d.getDay()]})`;
const addMin = (d, m) => new Date(d.getTime() + m * 60000);

async function prepareReplay() {
  const s2 = SCENARIOS[1], s5 = SCENARIOS[4];
  const r2 = compareWith(2, { a: s2.a, b: s2.b, mail: s2.mail });
  const d2 = {}; for (const it of r2.items) d2[it.id] = it.class === 'expected' ? 'approve' : 'pending';
  const r5 = compareWith(5, { a: s5.a, b: s5.b, mail: s5.mail });
  const d5 = {}; for (const it of r5.items) d5[it.id] = 'approve';
  const t1 = KDATE(s2.ctx.at), t3 = KDATE(s5.ctx.v1), t4 = KDATE(s5.ctx.at), due = KDATE(s2.ctx.due);
  const t6 = new Date(2026, 10, 3, 6, 10); // 재현용 가상 시각
  let conf = null;
  try {
    const finalCsv = toFal5Csv(r5, d5);
    const payload = await buildConfirmation({ report: r5, decisions: d5, approver: '데모 담당자', at: '2026-11-03T01:17:00+09:00', finalCsv });
    conf = { payload, jws: await signConfirmation(payload), finalCsv };
  } catch { conf = null; }
  const m2 = splitMail(s2.mail), m5 = splitMail(s5.mail);
  const hd = r2.B.header;
  const mails = {
    m2: { id: 'm2', box: 'in', from: m2.head.from || s2.ctx.from, at: t1, subject: m2.head.subject || '수정 선원명부', body: m2.body, sc: 2, files: ['수정본 선원명부 V2', `${r2.B.rows.length}명`] },
    m5: { id: 'm5', box: 'in', from: m5.head.from || s5.ctx.from, at: t4, subject: m5.head.subject || '회신', body: m5.body, sc: 5, files: ['수정본 선원명부 V3', `${r5.B.rows.length}명`] },
    s1: { id: 's1', box: 'out', from: '나 → 선장(DEMO HANBIT 3)', at: t3, subject: `[${hd.shipName?.value || ''} ${hd.voyage?.value || ''}] 수정 선원명부 확인 요청`, body: shipperSummary(r2, d2).replace('(데모 담당자', '(데모 담당자'), sc: 0 },
  };
  RP.data = { r2, d2, r5, d5, t1, t3, t4, t6, due, conf, mails, hd };
}

function rpScenes() {
  const D = RP.data;
  const see2 = D.r2.summary.suspect + D.r2.summary.check;
  const pend2 = pendingItems(D.r2, D.d2).length, appr2 = D.r2.items.length - pend2;
  return [
    { t: D.t1, title: '수정본 메일 도착', mails: ['m2'], open: 'm2', view: 'mail', cap: `입항 전날 밤 ${hhmm(D.t1)}. 선사가 수정본 V2와 함께 “생년월일 1건 정정” 메일을 보냈습니다. 출입국 보고 마감은 내일 아침 ${hhmm(D.due)}.` },
    { t: addMin(D.t1, 2), virt: true, title: '열자마자 대조', mails: ['m2'], view: 'result2', cap: `메일을 열면 도구가 최초본·수정본·메일을 바로 대조합니다. 요청은 1건인데, 꼭 봐야 할 곳은 ${see2}건입니다.` },
    { t: D.t3, title: '결정 · 선사 문의', mails: ['m2', 's1'], open: 's1', view: 'sent', cap: `메일 근거가 있는 정정 ${appr2}건은 수정본 반영, 근거 없는 ${pend2}건은 선사 문의로 두고 선장에게 확인 요청을 보냅니다.` },
    { t: D.t4, title: '선장 회신 도착', mails: ['m5', 'm2', 's1'], open: 'm5', view: 'mail', cap: `새벽 ${hhmm(D.t4)}, 선장이 회신과 다시 고친 수정본 V3를 보냈습니다.` },
    { t: addMin(D.t4, 2), virt: true, title: '다시 대조 · 확정', mails: ['m5', 'm2', 's1'], view: 'result5', cap: `확정한 결정만 반영한 기준 명부와 V3를 다시 대조합니다. ${D.r5.summary.expected}건 모두 회신에 근거가 있는 예상된 변경이라 반영하고 명부를 확정합니다.` },
    { t: D.t6, virt: true, title: '신고 준비 완료', mails: ['m5', 'm2', 's1'], view: 'done', cap: `${hhmm(D.t6)}, 확정 명부로 신고 준비를 마쳤습니다. 출입국 보고 마감까지 ${remain(D.t6, D.due)} 남았습니다.` },
  ];
}
function remain(now, due) {
  const m = Math.max(0, Math.round((due - now) / 60000));
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh}시간 ${mm}분` : `${mm}분`;
}

function rpMailList(sc) {
  const D = RP.data;
  const box = RP.box || (sc.view === 'sent' ? 'out' : 'in');
  const ids = sc.mails.filter((id) => D.mails[id].box === box);
  const nIn = sc.mails.filter((id) => D.mails[id].box === 'in').length, nOut = sc.mails.length - nIn;
  const cur = RP.open || sc.open;
  const fresh = sc.open && sc.view === 'mail' ? sc.open : null;
  return `<div class="rp-box-tabs" role="tablist"><button type="button" role="tab" data-rpbox="in" aria-selected="${box === 'in'}"><i class="ti ti-inbox" aria-hidden="true"></i> 받은 메일 <span class="n">${nIn}</span></button><button type="button" role="tab" data-rpbox="out" aria-selected="${box === 'out'}"><i class="ti ti-send" aria-hidden="true"></i> 보낸 메일 <span class="n">${nOut}</span></button></div>
  <ul class="rp-mails">${ids.map((id) => { const m = D.mails[id]; return `<li><button type="button" data-rpmail="${id}" aria-pressed="${cur === id}" class="${fresh === id ? 'fresh' : ''}"><span class="rp-from">${h(m.from)}</span><span class="rp-at">${mdw(m.at)} ${hhmm(m.at)}</span><span class="rp-subj">${h(m.subject)}</span>${m.files ? `<span class="rp-clip"><i class="ti ti-paperclip" aria-hidden="true"></i> ${h(m.files[0])}</span>` : ''}</button></li>`; }).join('') || '<li class="muted small rp-empty">메일 없음</li>'}</ul>`;
}

function rpMailView(id, sc) {
  const D = RP.data, m = D.mails[id];
  const next = sc.view === 'mail' && sc.open === id ? `<button type="button" class="btn btn-primary" data-act="rp-next"><i class="ti ti-arrows-diff" aria-hidden="true"></i> ${m.sc === 5 ? '기준 명부와 다시 대조' : '첨부 명부 대조하기'}</button>` : '';
  const ai = m.sc ? aiFor(m.sc, SCENARIOS[m.sc - 1].mail) : null;
  return `<article class="rp-mail">
    <header class="rp-mail-head"><div class="rp-mail-subj">${h(m.subject)}</div><div class="small muted">${h(m.from)} · ${mdw(m.at)} ${hhmm(m.at)}</div></header>
    <pre class="mail-body">${m.sc ? mailBodyHtml(m.body, ai) : h(m.body)}</pre>
    ${m.files ? `<div class="attachments"><div class="attach"><span class="attach-ic" aria-hidden="true"><i class="ti ti-file-spreadsheet"></i></span><span><b>${h(m.files[0])}</b><span class="muted small">${h(m.files[1])}</span></span></div></div>` : ''}
    ${m.sc ? `<div class="mail-ai">${aiReadHtml(m.sc, SCENARIOS[m.sc - 1].mail, m.sc === 2 ? D.r2 : D.r5)}</div>` : ''}
    ${next ? `<div class="rp-actions">${next}</div>` : ''}
  </article>`;
}

function rpItems(rep, dec) {
  return `<div class="table-wrap"><table class="grid changes rp-items"><tbody>${sortedItems(rep).map((it) => `<tr class="rp-row"><td class="person">${h(it.person)}</td><td><span class="cls ${it.class}">${CLASS_LABEL[it.class]}</span></td><td>${changeText(it)}</td><td class="basis small">${h(basisText(it))}</td>${dec ? `<td class="rp-dec"><span class="dec ${dec[it.id]}">${DECISION_LABEL[dec[it.id]]}</span></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function rpMain(sc) {
  const D = RP.data;
  if (RP.open) return rpMailView(RP.open, sc);
  if (sc.view === 'mail') return rpMailView(sc.open, sc);
  const detail = (scn, st, label = '자세히 보기') => `<button type="button" class="btn" data-act="rp-detail" data-sc="${scn}" data-st="${st}"><i class="ti ti-list-details" aria-hidden="true"></i> ${label}</button>`;
  if (sc.view === 'result2') {
    const s = D.r2.summary;
    return `<section class="rp-card"><div class="rp-kicker">대조 결과 · 최초본 V1 ↔ 수정본 V2 + 메일</div>
      <div class="rp-headline"><span class="big">${s.suspect + s.check}</span><span>건은 사람이 꼭 봐야 할 곳</span></div>
      <div class="rp-counts"><span class="cls suspect">오류 의심 ${s.suspect}</span><span class="cls check">확인 필요 ${s.check}</span><span class="cls expected">예상된 변경 ${s.expected}</span><span class="muted small">표기 차이 ${s.cosmetic}건은 자동 정리</span></div>
      ${rpItems(D.r2)}
      <div class="rp-actions">${detail(2, 2, '근거 자세히 보기')}<button type="button" class="btn btn-primary" data-act="rp-next">결정하고 선사에 문의 <i class="ti ti-arrow-right" aria-hidden="true"></i></button></div></section>`;
  }
  if (sc.view === 'sent') {
    const pend = pendingItems(D.r2, D.d2).length;
    return `<section class="rp-card"><div class="rp-kicker">담당자 결정</div>
      <div class="rp-headline"><span class="big ok">${D.r2.items.length - pend}</span><span>건 수정본 반영</span><span class="big wait">${pend}</span><span>건 선사 문의</span></div>
      ${rpItems(D.r2, D.d2)}
      <div class="rp-actions">${detail(2, 3, '결정 화면 자세히 보기')}</div></section>
      ${rpMailView('s1', sc)}`;
  }
  if (sc.view === 'result5') {
    const c = D.conf;
    return `<section class="rp-card"><div class="rp-kicker">다시 대조 · 기준 명부 ↔ 수정본 V3 + 선장 회신</div>
      <div class="rp-headline"><span class="big ok">${D.r5.summary.expected}</span><span>건 모두 회신에 근거 있음 → 수정본 반영, 명부 확정</span></div>
      ${rpItems(D.r5, D.d5)}
      ${c ? `<div class="saved-line"><i class="ti ti-circle-check" aria-hidden="true"></i><div><b>확정 명부 · 결정 기록 저장됨</b><div class="small muted">수정본 반영 ${c.payload.counts.approved}건 · 최초본 유지 ${c.payload.counts.kept}건 · 선사 문의 0건</div></div></div>` : ''}
      <div class="rp-actions">${detail(5, 4, '확정 명부 자세히 보기')}<button type="button" class="btn btn-primary" data-act="rp-next">다음 장면 <i class="ti ti-arrow-right" aria-hidden="true"></i></button></div></section>`;
  }
  // done
  const see2 = D.r2.summary.suspect + D.r2.summary.check;
  const pend2 = pendingItems(D.r2, D.d2).length;
  const ev = [
    [D.t1, `수정본 V2 · 정정 요청 메일 도착`],
    [addMin(D.t1, 2), `대조 — 꼭 봐야 할 곳 ${see2}건`],
    [D.t3, `정정 ${D.r2.items.length - pend2}건 반영 · ${pend2}건 선사 문의 발송`],
    [D.t4, `선장 회신 · 수정본 V3 도착`],
    [addMin(D.t4, 2), `다시 대조 — ${D.r5.summary.expected}건 반영, 명부 확정`],
    [D.t6, `출입국·세관·항만·검역 신고 준비 완료`],
  ];
  return `<section class="rp-card rp-done"><div class="rp-kicker">신고 준비 완료</div>
    <div class="rp-headline"><i class="ti ti-circle-check ok-ic" aria-hidden="true"></i><span>확정 명부 준비 완료 · 마감까지 <b>${remain(D.t6, D.due)}</b></span></div>
    <ol class="rp-log">${ev.map(([t, x]) => `<li><span class="rp-at">${mdw(t)} ${hhmm(t)}</span><span>${h(x)}</span></li>`).join('')}</ol>
    <p class="small muted" style="margin:10px 0 0">CrewDiff는 신고를 전송하지 않습니다. 확정 명부는 담당자가 각 기관 시스템에 신고할 때 쓰는 준비 자료입니다.</p>
    <div class="rp-actions"><button type="button" class="btn" data-act="rp-download"><i class="ti ti-download" aria-hidden="true"></i> 확정 명부 CSV 내려받기</button>${detail(5, 4, '단계별 상세 화면')}</div></section>`;
}

function renderReplay() {
  const el = $('#tab-replay');
  if (!RP.data) { el.innerHTML = '<p class="muted">재현 화면을 준비하는 중…</p>'; return; }
  const scenes = rpScenes();
  const sc = scenes[RP.scene - 1];
  const D = RP.data;
  const hd = D.hd;
  const port = ({ BUSAN: '부산' })[hd.port?.value] || hd.port?.value || '';
  el.innerHTML = `
  <div class="rp-top">
    <div class="rp-clock"><span class="rp-clock-ic"><i class="ti ti-clock" aria-hidden="true"></i></span><div><div class="rp-time">${hhmm(sc.t)}</div><div class="rp-date">${mdw(sc.t)}${sc.virt ? ' · 재현용 시각' : ''}</div></div></div>
    <div class="rp-due"><div class="rp-due-l">출입국 보고 마감 ${mdw(D.due)} ${hhmm(D.due)}까지</div><div class="rp-due-n ${D.due - sc.t <= 60 * 60000 ? 'soon' : ''}">${remain(sc.t, D.due)}</div></div>
    <div class="rp-ship"><i class="ti ti-ship" aria-hidden="true"></i><div><b>${h(hd.shipName?.value || '')}</b> <span class="muted">V.${h(hd.voyage?.value || '')}</span><div class="small muted">${h(port)} 입항 ${h(SCENARIOS[1].ctx.eta)} · 선원 ${D.r2.B.rows.length}명</div></div></div>
  </div>
  <div class="rp-caption" aria-live="polite">
    <span class="rp-scene-no">장면 ${RP.scene}/6</span>
    <p><b>${h(sc.title)}</b> ${h(sc.cap)}</p>
    <div class="rp-nav"><button type="button" class="btn btn-sm rp-prev" data-act="rp-prev" ${RP.scene === 1 ? 'disabled' : ''} aria-label="이전 장면"><i class="ti ti-chevron-left"></i></button><button type="button" class="btn btn-sm btn-primary" data-act="rp-next" ${RP.scene === 6 ? 'disabled' : ''}>다음 장면 <i class="ti ti-chevron-right"></i></button></div>
  </div>
  <ol class="rp-dots" aria-label="장면 선택">${scenes.map((x, i) => `<li><button type="button" data-scene="${i + 1}" aria-current="${i + 1 === RP.scene ? 'step' : 'false'}" class="${i + 1 < RP.scene ? 'done' : ''}"><span class="rp-dot-t">${hhmm(x.t)}</span><span class="rp-dot-l">${h(x.title)}</span></button></li>`).join('')}</ol>
  <div class="rp-body">
    <aside class="rp-inbox" aria-label="업무 메일함">${rpMailList(sc)}</aside>
    <div class="rp-main">${rpMain(sc)}</div>
  </div>
  <p class="note small"><b>재현(가상 상황):</b> 인물·선박·메일은 모두 가상입니다. 대조 결과와 건수는 이 화면에서 엔진을 실제로 돌린 값이고, 메일 해석은 AI가 미리 읽어 둔 결과를 씁니다. 시각 중 ‘재현용 시각’ 표시는 장면 연출을 위한 가상 시각입니다.</p>`;
  rpToast(sc);
}

function rpToast(sc) {
  if (RP.toastScene === RP.scene) return;
  RP.toastScene = RP.scene;
  const id = sc.view === 'mail' ? sc.open : sc.view === 'sent' ? 's1' : null;
  const t = $('#toast');
  if (!id || !t) { if (t) t.hidden = true; return; }
  const m = RP.data.mails[id];
  t.innerHTML = `<i class="ti ${m.box === 'out' ? 'ti-send' : 'ti-mail'}" aria-hidden="true"></i><div><b>${m.box === 'out' ? '메일 보냄' : '새 메일'}</b> · ${hhmm(m.at)}<div class="small">${h(m.from)} — ${h(m.subject)}</div></div>`;
  t.hidden = false;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}
function rpGo(n) {
  RP.scene = Math.min(6, Math.max(1, n));
  RP.open = null;
  RP.box = null;
  renderReplay();
  window.scrollTo({ top: 0 });
}
function openDetail(scn, st) {
  loadScenario(scn);
  run();
  if (st >= 3) for (const it of state.report.items) state.decisions[it.id] = scn === 5 ? 'approve' : it.class === 'expected' ? 'approve' : 'pending';
  state.step = st;
  if (st === 4 && !allDecided()) state.step = 3;
  render();
  setTab('demo');
  window.scrollTo({ top: 0 });
}

// ---------------- 이벤트 ----------------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, tr.item');
  if (!t) return;
  if (t.matches('.top-tab')) { setTab(t.dataset.tab); return; }
  if (t.dataset.scene) { rpGo(Number(t.dataset.scene)); return; }
  if (t.dataset.rpmail) { RP.open = t.dataset.rpmail; renderReplay(); return; }
  if (t.dataset.rpbox) { RP.box = t.dataset.rpbox; renderReplay(); return; }
  if (t.dataset.act === 'rp-next') { rpGo(RP.scene + 1); return; }
  if (t.dataset.act === 'rp-prev') { rpGo(RP.scene - 1); return; }
  if (t.dataset.act === 'rp-detail') { openDetail(Number(t.dataset.sc), Number(t.dataset.st)); return; }
  if (t.dataset.act === 'rp-download') { const D = RP.data; const csv = toFal5Csv(D.r5, D.d5); const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `crew-list-fal5-${D.hd.voyage?.value || 'demo'}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); return; }
  if (t.dataset.step) { goStep(Number(t.dataset.step)); return; }
  if (t.dataset.scenario) { loadScenario(Number(t.dataset.scenario)); run(); render(); return; }
  if (t.dataset.view) { state.view = t.dataset.view; render(); return; }
  if (t.dataset.filter) { state.filter = t.dataset.filter; render(); return; }
  if (t.matches('tr.item')) { state.selected = t.dataset.item; render(); scrollMailHit(); if (window.innerWidth < 900) $('.detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (t.dataset.decide) { state.decisions[t.dataset.decide] = t.dataset.v; state.conf = null; render(); return; }
  const act = t.dataset.act;
  if (act === 'run') { readInputs(); run(); render(); }
  if (act === 'quick') { loadScenario(2); run(); goStep(2); return; }
  if (act === 'next') { if (state.step === 1 && !state.report) { readInputs(); run(); } goStep(state.step + 1); }
  if (act === 'prev') goStep(state.step - 1);
  if (act === 'restart') { loadScenario(state.scenario); goStep(1); }
  if (act === 'approve-expected') { for (const it of state.report.items) if (it.class === 'expected') state.decisions[it.id] = 'approve'; state.conf = null; render(); }
  if (act === 'hold-rest') { for (const it of state.report.items) if (!state.decisions[it.id]) state.decisions[it.id] = 'pending'; state.conf = null; render(); }
  if (act === 'scenario5') { loadScenario(5); run(); goStep(2); return; }
  if (act === 'rebase') { const a = toBaseCsv(state.report, state.decisions); state.inputs = { a, b: '', mail: '' }; state.rebased = true; state.report = null; state.decisions = {}; state.conf = null; state.step = 1; render(); window.scrollTo({ top: 0 }); return; }
  if (act === 'download') download();
  if (act === 'copy-summary') { try { await navigator.clipboard.writeText($('#summary').value); t.textContent = '복사됨'; } catch { $('#summary').select(); } }
  if (act === 'sign') { if (!pendingItems(state.report, state.decisions).length) await doSign(); render(); }
  if (act === 'verify') { await doVerify(false); render(); }
  if (act === 'tamper') { await doVerify(true); render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches?.('tr.item')) { state.selected = e.target.dataset.item; render(); }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'approver') state.approver = e.target.value || '데모 담당자';
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
    const [cur, first, h3, h4, fin, mail] = await Promise.all(['docs/eval-result.json', 'docs/eval-holdout-first-run.json', 'docs/eval-H3-first-run.json', 'docs/eval-H4-first-run.json', 'docs/eval-final.json', 'docs/mail-challenge-result.json'].map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); })));
    state.eval = { current: cur, first, h3, h4, fin, mail };
  } catch (err) {
    state.eval = { error: err.message };
  }
  if (state.tab === 'eval') renderEval();
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
  await prepareReplay();
  loadScenario(state.scenario);
  run();
  if (params.get('item')) state.selected = params.get('item');
  // 스크린샷용: decide=auto → 예상된 변경 승인, 나머지 보류
  if (params.get('decide') === 'auto' && state.report) for (const it of state.report.items) state.decisions[it.id] = it.class === 'expected' ? 'approve' : 'pending';
  if (state.step === 4 && !allDecided()) state.step = 3;
  if (params.has('sign') && state.step === 4 && !pendingItems(state.report, state.decisions).length) { await doSign(); if (params.get('sign') === 'verify') await doVerify(false); if (params.get('sign') === 'tamper') await doVerify(true); }
  render();
  setTab(state.tab);
  scrollMailHit();
  await loadEval();
  await document.fonts.ready;
  document.documentElement.dataset.ready = '1';
}
start();
