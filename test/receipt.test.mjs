import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCrewLists } from '../lib/engine.js';
import { buildConfirmation, signConfirmation, verifyConfirmation } from '../lib/receipt.js';
import { toFal5Csv, buildFinalRows, toBaseCsv } from '../lib/export.js';
import { parseCrewList } from '../lib/parse.js';
import { decodeJws, b64uJson } from '../lib/jose.js';
import { csv, base, row, P } from './helpers.mjs';

async function setup() {
  const b = base(); b[2] = row(P.nguyen, { rank: 'AB' }); b[1] = row(P.cruz, { idNumber: 'PA765432I' });
  const report = compareCrewLists({ a: csv(base()), b: csv(b), mail: 'NGUYEN VAN AN promoted to AB.' });
  const decisions = Object.fromEntries(report.items.map((it) => [it.id, it.class === 'expected' ? 'approve' : 'keep']));
  const finalCsv = toFal5Csv(report, decisions);
  const payload = await buildConfirmation({ report, decisions, approver: '데모 담당자', at: '2026-11-02T09:00:00+09:00', finalCsv });
  return { report, decisions, finalCsv, payload, jws: await signConfirmation(payload) };
}

test('확인서: 서명 검증 통과 + 최종 명부 해시 일치', async () => {
  const { jws, finalCsv } = await setup();
  const v = await verifyConfirmation(jws, { finalCsv });
  assert.equal(v.signature, true);
  assert.equal(v.hash, true);
  assert.equal(v.ok, true);
});

test('확인서 변조 거부: 결정 바꾸기, 명부 바꾸기, 서명 자르기', async () => {
  const { jws, finalCsv } = await setup();
  const d = decodeJws(jws);
  const p = { ...d.payload, changes: d.payload.changes.map((c) => ({ ...c, decision: 'approve' })) };
  const parts = jws.split('.');
  const forged = `${parts[0]}.${b64uJson(p)}.${parts[2]}`;
  assert.equal((await verifyConfirmation(forged)).signature, false);
  const v2 = await verifyConfirmation(jws, { finalCsv: finalCsv.replace('AB', 'OS') });
  assert.equal(v2.signature, true);
  assert.equal(v2.hash, false);
  assert.equal(v2.ok, false);
  assert.equal((await verifyConfirmation(parts[0] + '.' + parts[1] + '.AAAA')).ok, false);
  assert.equal((await verifyConfirmation('not-a-jws')).ok, false);
});

test('내보내기: FAL 5 순서, 최초본 유지 확인한 변경은 최초본 값', async () => {
  const { report, decisions, finalCsv } = await setup();
  const lines = finalCsv.split('\n');
  assert.ok(lines.some((l) => l.startsWith('6. No.,7. Family name,8. Given names,9. Rank or rating,10. Nationality,11. Date of birth')));
  const rows = buildFinalRows(report, decisions);
  assert.equal(rows.find((r) => r.familyName === 'NGUYEN').rank, 'AB'); // 승인
  assert.equal(rows.find((r) => r.familyName === 'DELA CRUZ').idNumber, 'PA7654321'); // 최초본 유지 확인 → 최초본 값
  assert.ok(lines[0].includes('담당자 확정 명부'));
});

test('선사 문의가 남으면: 미확정 검토본만, 값은 "선사 문의"로, 확인서 생성 거부', async () => {
  const { report } = await setup();
  const decisions = Object.fromEntries(report.items.map((it) => [it.id, it.class === 'expected' ? 'approve' : 'pending']));
  const csvOut = toFal5Csv(report, decisions);
  assert.ok(csvOut.split('\n')[0].includes('미확정 검토본'));
  assert.ok(csvOut.includes('검토 상태'));
  const rows = buildFinalRows(report, decisions);
  assert.equal(rows.find((r) => r.familyName === 'DELA CRUZ').idNumber, '선사 문의'); // 옛 값을 맞는 것처럼 쓰지 않음
  await assert.rejects(() => buildConfirmation({ report, decisions, approver: 'x', at: 'x', finalCsv: csvOut }), /선사 문의/);
  // 기준본: 선사 문의는 최초본 값으로 두고 다시 읽을 수 있어야 함
  const P2 = parseCrewList(toBaseCsv(report, decisions), 'A');
  assert.equal(P2.rows.length, report.B.rows.length);
  assert.equal(P2.rows.find((r) => r.cells.familyName.value === 'DELA CRUZ').cells.idNumber.value, 'PA7654321');
});

test('예전 보류(hold)는 선사 문의로 읽음', async () => {
  const { report } = await setup();
  const decisions = Object.fromEntries(report.items.map((it) => [it.id, 'hold']));
  assert.ok(toFal5Csv(report, decisions).includes('미확정 검토본'));
});
