import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrewList } from '../lib/parse.js';
import { matchPersons, findDuplicates } from '../lib/match.js';
import { csv, base, row, P } from './helpers.mjs';

const rows = (r, id) => parseCrewList(csv(r), id).rows;

test('행 순서와 무관하게 같은 사람끼리 대응', () => {
  const a = rows(base(), 'A');
  const b = rows(base().reverse(), 'B');
  const m = matchPersons(a, b);
  assert.equal(m.pairs.length, 4);
  for (const p of m.pairs) assert.equal(p.a.cells.idNumber.value, p.b.cells.idNumber.value);
  assert.ok(m.pairs.every((p) => p.method === 'idNumber'));
});

test('여권 갱신(번호가 바뀜)은 성명+생년월일로 대응, 신규·하선은 남김', () => {
  const b0 = base();
  b0[1] = row(P.cruz, { idNumber: 'PZ0000001', idExpiry: '2035-01-01' });
  b0.splice(3, 1); // SANTOS 하선
  b0.push(['TRAN', 'MINH', 'OS', 'VNM', '1999-01-15', 'HANOI', 'M', 'Passport', 'VN5550001', 'VNM', '2031-01-01']);
  const m = matchPersons(rows(base(), 'A'), rows(b0, 'B'));
  const cruz = m.pairs.find((p) => p.a.cells.familyName.value === 'DELA CRUZ');
  assert.equal(cruz.method, 'name+dob');
  assert.equal(m.onlyA.length, 1);
  assert.equal(m.onlyA[0].cells.familyName.value, 'SANTOS');
  assert.equal(m.onlyB[0].cells.familyName.value, 'TRAN');
});

test('1:1 보장: 동명이인 후보가 있어도 한 사람은 한 번만', () => {
  const twin = row(P.cruz, { idNumber: 'PA0000009', dob: '1991-01-01' });
  const m = matchPersons(rows([row(P.cruz)], 'A'), rows([twin, row(P.cruz)], 'B'));
  assert.equal(m.pairs.length, 1);
  assert.equal(m.pairs[0].b.cells.idNumber.value, 'PA7654321');
  assert.equal(m.onlyB.length, 1);
});

test('같은 버전 안 중복 행(R5 대상)', () => {
  const d = findDuplicates(rows([...base(), row(P.nguyen)], 'B'));
  assert.equal(d.length, 1);
  assert.equal(d[0].by, 'idNumber');
});
