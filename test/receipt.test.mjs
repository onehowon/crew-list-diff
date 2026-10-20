import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCrewLists } from '../lib/engine.js';
import { buildConfirmation, signConfirmation, verifyConfirmation } from '../lib/receipt.js';
import { toFal5Csv, buildFinalRows } from '../lib/export.js';
import { decodeJws, b64uJson } from '../lib/jose.js';
import { csv, base, row, P } from './helpers.mjs';

async function setup() {
  const b = base(); b[2] = row(P.nguyen, { rank: 'AB' }); b[1] = row(P.cruz, { idNumber: 'PA765432I' });
  const report = compareCrewLists({ a: csv(base()), b: csv(b), mail: 'NGUYEN VAN AN promoted to AB.' });
  const decisions = Object.fromEntries(report.items.map((it) => [it.id, it.class === 'expected' ? 'approve' : 'hold']));
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

test('내보내기: FAL 5 순서, 보류한 변경은 최초본 값 유지', async () => {
  const { report, decisions, finalCsv } = await setup();
  const lines = finalCsv.split('\n');
  assert.ok(lines.some((l) => l.startsWith('6. No.,7. Family name,8. Given names,9. Rank or rating,10. Nationality,11. Date of birth')));
  const rows = buildFinalRows(report, decisions);
  assert.equal(rows.find((r) => r.familyName === 'NGUYEN').rank, 'AB'); // 승인
  assert.equal(rows.find((r) => r.familyName === 'DELA CRUZ').idNumber, 'PA7654321'); // 보류 → 최초본 값
});
