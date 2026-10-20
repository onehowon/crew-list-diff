// 일반화 개선(두 자리 연도, 추정 매핑, 열 단위 서식 경보, 정정 문형)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDate } from '../lib/normalize.js';
import { parseCrewList } from '../lib/parse.js';
import { compareCrewLists } from '../lib/engine.js';
import { parseNotice } from '../lib/notice.js';

test('두 자리 연도: 만료일은 20YY, 생년월일은 만 16~75세 범위로 세기 결정, 모호하면 판독 불가', () => {
  assert.equal(parseDate('05 MAR 29', 'DMY', { kind: 'expiry' }), '2029-03-05');
  assert.equal(parseDate('05-03-29', 'DMY', { kind: 'expiry' }), '2029-03-05');
  assert.equal(parseDate('05.03.90', 'DMY', { kind: 'dob', refYear: 2026 }), '1990-03-05');
  assert.equal(parseDate('05-03-05', 'DMY', { kind: 'dob', refYear: 2026 }), '2005-03-05');
  assert.equal(parseDate('05-03-30', 'DMY', { kind: 'dob', refYear: 2026 }), null); // 1930(96세)·2030 모두 범위 밖
  assert.equal(parseDate('05 MAR 29'), null); // 종류를 모르면 해석하지 않음
});

const HEAD = 'ETA: 2026-11-03\n';
const COLS = 'No,Family name,Given names,Rank,Staat,Geburt,Place of birth,Sex,Doc type,Passport No.,Issuing State,Ablauf';
const R = [
  ['KIM', 'MINJUN', 'Master', 'KOR', '1975-03-12', 'BUSAN', 'M', 'PP', 'MX1234567', 'KOR', '2030-01-01'],
  ['DELA CRUZ', 'JUAN', 'AB', 'PHL', '1990-04-05', 'MANILA', 'M', 'PP', 'PA7654321', 'PHL', '2029-05-05'],
  ['NGUYEN', 'VAN AN', 'OS', 'VNM', '1995-07-20', 'HAI PHONG', 'M', 'PP', 'VN1928374', 'VNM', '2027-02-02'],
];
const csv = (rows, cols = COLS) => HEAD + cols + '\n' + rows.map((r, i) => [i + 1, ...r].join(',')).join('\n') + '\n';

test('추정 매핑: 모르는 머리글을 값 모양(국가 코드·날짜)으로 매핑하고 근거에 표시', () => {
  const p = parseCrewList(csv(R), 'A');
  const by = Object.fromEntries(p.columns.map((c) => [c.header, c]));
  assert.equal(by.Staat.field, 'nationality'); assert.equal(by.Staat.how, 'inferred');
  assert.equal(by.Geburt.field, 'dob');
  assert.equal(by.Ablauf.field, 'idExpiry');
  const b = R.map((r) => r.slice()); b[1][3] = 'IDN';
  const rep = compareCrewLists({ a: csv(R), b: csv(b) });
  const it = rep.items.find((x) => x.field === 'nationality');
  assert.equal(it.class, 'check');
  assert.equal(it.evidence.inferredColumn, true);
});

test('열 단위 서식 경보: 대부분 해석 못하는 열은 경보 1건, 셀 R6 없음, 원문이 바뀐 칸은 확인 필요', () => {
  const odd = R.map((r) => { const x = r.slice(); x[10] = 'Q1/30'; return x; });
  const b = odd.map((r) => r.slice()); b[2][10] = 'Q4/31';
  const cols = COLS.replace('Ablauf', 'Expiry');
  const rep = compareCrewLists({ a: csv(odd, cols), b: csv(b, cols) });
  const al = rep.columnAlerts.filter((x) => x.field === 'idExpiry');
  assert.equal(al.length, 1);
  assert.deepEqual(al[0].sources.sort(), ['A', 'B']);
  assert.ok(!rep.items.some((x) => x.rules?.some((r) => r.id === 'R6')));
  const ch = rep.items.filter((x) => x.field === 'idExpiry');
  assert.equal(ch.length, 1); assert.equal(ch[0].class, 'check'); assert.equal(ch[0].evidence.formatAlert, true);
});

test('열 단위 경보: 머리글도 값 모양도 모르는 열은 unmapped 경보 1건', () => {
  const cols = COLS.replace('Place of birth', 'Bemerkung');
  const rows = R.map((r) => { const x = r.slice(); x[5] = 'ok 1'; return x; });
  const rep = compareCrewLists({ a: csv(rows, cols), b: csv(rows, cols) });
  assert.equal(rep.columnAlerts.filter((x) => x.kind === 'unmapped').length, 1);
  assert.equal(rep.items.length, 0);
});

test('메일 정정 문형: should be / correct X to Y / change X to Y / 화살표', () => {
  const cases = [
    ['Kindly correct the first name of NGUYEN VAN HUN, should be VAN HUNG.', 'givenNames', 'VAN HUNG'],
    ['DOB of KIM MINJUN should be 1975-03-21.', 'dob', '1975-03-21'],
    ['Please change passport number of KIM MINJUN to MX1234568.', 'idNumber', 'MX1234568'],
    ['KIM MINJUN DOB: 1975-03-12 → 1975-03-21', 'dob', '1975-03-21'],
  ];
  for (const [t, f, v] of cases) {
    const d = parseNotice(t, []).directives[0];
    assert.equal(d?.type, 'correction', t); assert.equal(d.field, f, t); assert.equal(d.value, v, t);
  }
});
