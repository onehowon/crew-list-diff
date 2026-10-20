// 승인 결과를 반영한 최종 명부를 FAL 5 항목 순서 CSV로 만든다.
// 주의: 기관 시스템 제출 파일이 아니라 담당자가 확인할 준비 자료다.
//   승인(approve): 수정본 값을 반영 / 보류(hold): 반영하지 않음(최초본 값 유지)
//   추가 행: 승인 시 포함, 보류 시 제외 · 삭제 행: 승인 시 제외, 보류 시 최초본 행 유지
//   중복 행: 승인 시 중복 행 제거, 보류 시 그대로 둠 · 지시 미반영·기존 값 경보: 명부 값에는 영향 없음
import { HEADER_FIELDS, ROW_FIELDS, FIELD_KEYS } from './fields.js';

const q = (s) => {
  s = String(s ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const cellOut = (c) => (c.status === 'ok' ? c.value : c.raw.trim());

export function buildFinalRows(report, decisions = {}) {
  const dec = (it) => decisions[it.id] || 'hold';
  const byB = new Map(); // B 행 → 필드별 값
  for (const r of report.B.rows) byB.set(r, Object.fromEntries(FIELD_KEYS.map((f) => [f, cellOut(r.cells[f])])));
  const drop = new Set();
  const extra = [];
  for (const it of report.items) {
    if (it.kind === 'modify' && dec(it) === 'hold') byB.get(it.rowB)[it.field] = cellOut(it.rowA.cells[it.field]);
    if (it.kind === 'add' && dec(it) === 'hold') drop.add(it.rowB);
    if (it.kind === 'duplicate' && dec(it) === 'approve') drop.add(it.rowB);
    if (it.kind === 'remove' && dec(it) === 'hold') extra.push(Object.fromEntries(FIELD_KEYS.map((f) => [f, cellOut(it.rowA.cells[f])])));
  }
  return [...report.B.rows.filter((r) => !drop.has(r)).map((r) => byB.get(r)), ...extra];
}

export function toFal5Csv(report, decisions = {}) {
  const h = report.B.header;
  const lines = [];
  lines.push('CREW LIST (IMO FAL Form 5) - 담당자 확인용 준비 자료(제출 파일 아님)');
  for (const f of HEADER_FIELDS) lines.push([q(`${f.fal} ${f.en}`), q(h[f.key]?.value ?? '')].join(','));
  lines.push(['6. No.', ...ROW_FIELDS.map((f) => `${f.fal}. ${f.en}`)].map(q).join(','));
  buildFinalRows(report, decisions).forEach((r, i) => lines.push([i + 1, ...FIELD_KEYS.map((f) => r[f])].map(q).join(',')));
  const held = report.items.filter((it) => (decisions[it.id] || 'hold') === 'hold').length;
  lines.push(q(`18. Date and signature by master, authorized agent or officer: (서명란 비움) / 보류 ${held}건`));
  return lines.join('\n') + '\n';
}
