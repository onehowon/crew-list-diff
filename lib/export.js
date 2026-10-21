// 담당자 결정을 반영한 명부를 FAL 5 항목 순서 CSV로 만든다.
// 주의: 기관 시스템 제출 파일이 아니라 담당자가 확인할 준비 자료다.
// 결정은 세 가지다. '모름'과 '최초본이 맞음'은 다른 결정이므로 따로 둔다.
//   수정본 채택(approve): 수정본 값 반영 · 추가 행 포함 · 삭제 행 제외 · 중복 행 제거
//   최초본 유지 확인(keep): 최초본 값이 맞다고 확인 · 추가 행 제외 · 삭제 행 유지 · 중복 행 그대로
//   확인 대기(pending): 아직 모름. 하나라도 남으면 최종 명부를 만들지 않고 '미확정 검토본'만 만든다.
// 지시 미반영·기존 값 경보는 명부 값에 영향이 없고 결정만 기록한다.
import { HEADER_FIELDS, ROW_FIELDS, FIELD_KEYS, FIELD } from './fields.js';

export const DECISION_LABEL = { approve: '수정본 채택', keep: '최초본 유지 확인', pending: '확인 대기' };
// 예전 '보류'(hold)는 '확인 대기'로 읽는다
export const decisionOf = (decisions, it) => { const d = decisions[it.id]; return d === 'hold' || !d ? 'pending' : d; };
export const pendingItems = (report, decisions = {}) => report.items.filter((it) => decisionOf(decisions, it) === 'pending');

const q = (s) => {
  s = String(s ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const cellOut = (c) => (c.status === 'ok' ? c.value : c.raw.trim());

// asBase: 확인 대기를 최초본 값으로 둔 '기준본'(회신 받은 수정본과 다시 대조할 때 쓴다). 상태 표시 없음.
export function buildFinalRows(report, decisions = {}, { asBase = false } = {}) {
  const dec = (it) => decisionOf(decisions, it);
  const byB = new Map(); // B 행 → 필드별 값
  const note = new Map(); // B 행 → 확인 대기 메모
  for (const r of report.B.rows) byB.set(r, Object.fromEntries(FIELD_KEYS.map((f) => [f, cellOut(r.cells[f])])));
  const addNote = (row, s) => { if (!row) return; if (!note.has(row)) note.set(row, []); note.get(row).push(s); };
  const drop = new Set();
  const extra = [];
  for (const it of report.items) {
    const d = dec(it);
    const pend = d === 'pending' && !asBase;
    if (it.kind === 'modify' && d !== 'approve') {
      byB.get(it.rowB)[it.field] = pend ? '확인 대기' : cellOut(it.rowA.cells[it.field]);
      if (pend) addNote(it.rowB, `${FIELD[it.field].fal}. ${FIELD[it.field].ko}: 최초본 ${cellOut(it.rowA.cells[it.field])} / 수정본 ${cellOut(it.rowB.cells[it.field])}`);
    }
    if (it.kind === 'add' && d !== 'approve') { if (pend) addNote(it.rowB, '승선 확인 대기'); else drop.add(it.rowB); }
    if (it.kind === 'duplicate') { if (d === 'approve') drop.add(it.rowB); else if (pend) addNote(it.rowB, '중복 행 확인 대기'); }
    if (it.kind === 'remove' && d !== 'approve') {
      const row = Object.fromEntries(FIELD_KEYS.map((f) => [f, cellOut(it.rowA.cells[f])]));
      if (pend) row._note = ['하선 확인 대기'];
      extra.push(row);
    }
    if ((it.kind === 'directive' || it.kind === 'standing') && pend) addNote(it.rowB, it.kind === 'directive' ? '메일 지시 미반영 확인 대기' : `${FIELD[it.field].ko} 확인 대기`);
  }
  return [...report.B.rows.filter((r) => !drop.has(r)).map((r) => ({ ...byB.get(r), _note: note.get(r) || [] })), ...extra.map((r) => ({ ...r, _note: r._note || [] }))];
}

function headerLines(report, title) {
  const h = report.B.header;
  return [title, ...HEADER_FIELDS.map((f) => [q(`${f.fal} ${f.en}`), q(h[f.key]?.value ?? '')].join(','))];
}

// 확인 대기가 없으면 최종 명부, 있으면 '미확정 검토본'(맨 끝에 검토 상태 열)
export function toFal5Csv(report, decisions = {}) {
  const pending = pendingItems(report, decisions).length;
  const rows = buildFinalRows(report, decisions);
  const lines = headerLines(report, pending
    ? `CREW LIST (IMO FAL Form 5) - 미확정 검토본: 확인 대기 ${pending}건 (최종 명부 아님)`
    : 'CREW LIST (IMO FAL Form 5) - 담당자 확정 명부(준비 자료, 제출 파일 아님)');
  lines.push(['6. No.', ...ROW_FIELDS.map((f) => `${f.fal}. ${f.en}`), ...(pending ? ['검토 상태'] : [])].map(q).join(','));
  rows.forEach((r, i) => lines.push([i + 1, ...FIELD_KEYS.map((f) => r[f]), ...(pending ? [r._note.join(' / ')] : [])].map(q).join(',')));
  lines.push(q(`18. Date and signature by master, authorized agent or officer: (서명란 비움)${pending ? ` / 확인 대기 ${pending}건` : ''}`));
  return lines.join('\n') + '\n';
}

// 회신 받은 수정본과 다시 대조할 기준본: 확정한 결정만 반영하고 확인 대기는 최초본 값으로 둔다.
export function toBaseCsv(report, decisions = {}) {
  const lines = headerLines(report, 'CREW LIST (IMO FAL Form 5),Arrival');
  lines.push(['6. No.', ...ROW_FIELDS.map((f) => `${f.fal}. ${f.en}`)].map(q).join(','));
  buildFinalRows(report, decisions, { asBase: true }).forEach((r, i) => lines.push([i + 1, ...FIELD_KEYS.map((f) => r[f])].map(q).join(',')));
  return lines.join('\n') + '\n';
}
