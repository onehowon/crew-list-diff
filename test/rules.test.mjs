// R1~R8 각각 양성·음성
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCrewLists } from '../lib/engine.js';
import { csv, base, row, P } from './helpers.mjs';

const run = (bRows, mail = '', aRows = base()) => compareCrewLists({ a: csv(aRows), b: csv(bRows), mail });
const only = (r, field) => r.items.filter((it) => !field || it.field === field);
const rulesOf = (it) => it.rules.map((x) => x.id);
const withB = (i, over) => { const b = base(); b[i] = row([P.kim, P.cruz, P.nguyen, P.santos][i], over); return b; };

test('R1 문자 혼동: 양성(0→O) / 음성(전혀 다른 번호)', () => {
  const pos = only(run(withB(1, { idNumber: 'PA765432I' })), 'idNumber')[0];
  assert.equal(pos.class, 'suspect'); assert.ok(rulesOf(pos).includes('R1'));
  const neg = only(run(withB(1, { idNumber: 'PZ9999999' })), 'idNumber')[0];
  assert.ok(!rulesOf(neg).includes('R1')); assert.equal(neg.class, 'check');
});

test('R2 일·월 뒤바뀜: 양성 / 음성', () => {
  const pos = only(run(withB(1, { dob: '1990-05-04' })), 'dob')[0];
  assert.equal(pos.class, 'suspect'); assert.ok(rulesOf(pos).includes('R2'));
  const neg = only(run(withB(1, { dob: '1990-04-06' })), 'dob')[0];
  assert.equal(neg.class, 'check');
});

test('R3 성명 순서 뒤바뀜: 양성 / 음성', () => {
  const pos = run(withB(2, { familyName: 'VAN AN', givenNames: 'NGUYEN' }));
  assert.equal(pos.items.length, 2);
  assert.ok(pos.items.every((it) => it.class === 'suspect' && rulesOf(it).includes('R3')));
  const neg = only(run(withB(2, { givenNames: 'VAN ANH' })), 'givenNames')[0];
  assert.equal(neg.class, 'check');
});

test('R4 만료: 입출항일 이전 만료일 / 이후는 음성', () => {
  const pos = only(run(withB(3, { idExpiry: '2026-10-01' })), 'idExpiry')[0];
  assert.ok(rulesOf(pos).includes('R4')); assert.equal(pos.class, 'suspect');
  const neg = only(run(withB(3, { idExpiry: '2031-10-01' })), 'idExpiry')[0];
  assert.equal(neg.class, 'check');
});

test('R5 중복 행: 양성 / 음성(동명이지만 다른 사람)', () => {
  const pos = run([...base(), row(P.santos)]);
  const d = pos.items.find((it) => it.kind === 'duplicate');
  assert.ok(d && rulesOf(d).includes('R5') && d.class === 'suspect');
  const neg = run([...base(), row(P.santos, { idNumber: 'PC0000777', dob: '1970-01-01', givenNames: 'MARK ANTHONY' })]);
  assert.ok(!neg.items.some((it) => it.kind === 'duplicate'));
});

test('R6 누락·판독 불가: ???·빈칸·#N/A 양성 / 출생지(선택 항목) 빈칸은 음성', () => {
  for (const v of ['???', '', '#N/A']) {
    const it = only(run(withB(0, { idNumber: v })), 'idNumber')[0];
    assert.ok(rulesOf(it).includes('R6'), JSON.stringify(v));
  }
  const neg = only(run(withB(0, { pob: '' })), 'pob')[0];
  assert.equal(neg.class, 'check');
});

test('R7 형식 위반: 국적 코드·나이 범위 / 정상 코드는 음성', () => {
  assert.ok(rulesOf(only(run(withB(1, { nationality: 'PHI' })), 'nationality')[0]).includes('R7'));
  assert.ok(rulesOf(only(run(withB(1, { dob: '2015-04-05' })), 'dob')[0]).includes('R7'));
  assert.ok(rulesOf(only(run(withB(1, { dob: '1940-04-05' })), 'dob')[0]).includes('R7'));
  assert.equal(only(run(withB(1, { nationality: 'Philippines' })), 'nationality').length, 0); // 표기만 다름
  assert.equal(only(run(withB(1, { idIssuer: 'IDN' })), 'idIssuer')[0].class, 'check');
});

test('R8 지시 미반영: 하선·정정·직급 / 반영되면 음성', () => {
  const r1 = run(base(), 'AB DELA CRUZ JUAN will sign off at BUSAN.');
  assert.ok(r1.items.some((it) => it.kind === 'directive' && rulesOf(it).includes('R8')));
  const r2 = run(base(), 'Please correct passport number of SANTOS MARK to PC5550124.');
  assert.ok(r2.items.some((it) => it.kind === 'directive' && rulesOf(it).includes('R8')));
  const r3 = run(withB(2, { rank: 'BOSUN' }), 'NGUYEN VAN AN promoted from OS to AB.');
  const it3 = only(r3, 'rank')[0];
  assert.equal(it3.class, 'suspect'); assert.ok(rulesOf(it3).includes('R8'));
  const ok = run(withB(2, { rank: 'AB' }), 'NGUYEN VAN AN promoted from OS to AB.');
  assert.equal(only(ok, 'rank')[0].class, 'expected');
  assert.ok(!ok.items.some((it) => it.kind === 'directive'));
  const on = run(base(), 'OS TRAN MINH (passport VN5550001) will join the vessel at BUSAN.');
  assert.ok(on.items.some((it) => it.kind === 'directive' && rulesOf(it).includes('R8')));
});
