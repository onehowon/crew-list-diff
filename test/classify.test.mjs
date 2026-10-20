import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCrewLists } from '../lib/engine.js';
import { parseNotice } from '../lib/notice.js';
import { csv, base, row, P } from './helpers.mjs';

const run = (bRows, mail = '', aRows = base()) => compareCrewLists({ a: csv(aRows), b: csv(bRows), mail });

test('예상된 변경은 메일 지시 근거가 있을 때만(지시 줄 위치 첨부)', () => {
  const b = base(); b[2] = row(P.nguyen, { rank: 'AB' });
  const mail = 'Dear Agent,\nNGUYEN VAN AN promoted from OS to AB.\n';
  const it = run(b, mail).items[0];
  assert.equal(it.class, 'expected');
  assert.equal(it.directive.line, 2);
  assert.equal(mail.slice(it.directive.start, it.directive.end), 'NGUYEN VAN AN promoted from OS to AB.');
});

test('같은 변경이라도 근거가 없으면 확인 필요(check)', () => {
  const b = base(); b[2] = row(P.nguyen, { rank: 'AB' });
  const it = run(b, 'Dear Agent,\nNo crew change.\n').items[0];
  assert.equal(it.class, 'check');
  assert.equal(it.directive, undefined);
});

test('다른 사람에 대한 지시는 근거가 되지 않음', () => {
  const b = base(); b[2] = row(P.nguyen, { rank: 'AB' });
  const r = run(b, 'SANTOS MARK promoted to AB.');
  assert.equal(r.items.find((x) => x.kind === 'modify').class, 'check');
});

test('표기만 다름(대소문자·공백·날짜 형식·직급 약어·행 순서)은 경보하지 않음', () => {
  const b = base().reverse();
  b[0] = row(P.santos, { familyName: 'Santos', dob: '30.11.1988', rank: 'Cook ' });
  b[1] = row(P.nguyen, { givenNames: 'VAN  AN', rank: 'Ordinary Seaman', idExpiry: '02-FEB-2027' });
  const r = run(b);
  assert.equal(r.items.length, 0);
  assert.ok(r.cosmetic.length >= 5);
  assert.ok(r.summary.rowsMoved > 0);
});

test('정상 정정이 오류 모양(일·월 교환)이어도 메일이 그 값을 명시하면 expected, 규칙은 참고로만', () => {
  const b = base(); b[1] = row(P.cruz, { dob: '1990-05-04' });
  const it = run(b, 'Please correct DOB of DELA CRUZ JUAN to 1990-05-04.').items[0];
  assert.equal(it.class, 'expected');
  assert.deepEqual(it.notes.map((n) => n.id), ['R2']);
});

test('지시가 있어도 값 자체가 잘못된 규칙(R4·R6·R7)이면 오류 의심', () => {
  const b = base(); b[3] = row(P.santos, { idExpiry: '2025-01-01' });
  const it = run(b, 'Please correct passport expiry date of SANTOS MARK to 2025-01-01.').items[0];
  assert.equal(it.class, 'suspect');
  assert.ok(it.directive);
});

test('메일 파서: 승선·하선·직급·정정과 원문 위치, 한국어 문장', () => {
  const mail = '제목: 정정 요청\nOS TRAN MINH will join the vessel at BUSAN.\nKIM MINJUN 생년월일 1975-03-21로 정정 바랍니다.\nDELA CRUZ JUAN 하선 예정입니다.\n';
  const { directives } = parseNotice(mail, []);
  assert.deepEqual(directives.map((d) => d.type), ['sign_on', 'correction', 'sign_off']);
  assert.equal(directives[1].field, 'dob');
  assert.equal(directives[1].value, '1975-03-21');
  assert.equal(directives[0].line, 2);
});

test('모든 표시 변경에 근거(원문 위치·규칙 id·지시 문장)가 붙음', () => {
  const b = base(); b[1] = row(P.cruz, { idNumber: 'PA765432I' }); b[2] = row(P.nguyen, { rank: 'AB' }); b.push(row(P.kim));
  const r = run(b, 'NGUYEN VAN AN promoted to AB.');
  for (const it of r.items) {
    assert.ok(it.evidence.source.length > 0 || it.evidence.directive, it.id);
    if (it.class === 'expected') assert.ok(it.evidence.directive);
    if (it.class === 'suspect') assert.ok(it.evidence.rules.length > 0);
  }
});
