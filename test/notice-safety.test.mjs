import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCrewLists } from '../lib/engine.js';
import { csv, base, row, P } from './helpers.mjs';

// 메일에 이름과 값이 있어도 '그 값으로 바꾸라'는 뜻이 아닌 문장: 지시로 쓰지 않는다(예상된 변경으로 덮지 않음)
const changed = () => { const b = base(); b[2] = row(P.nguyen, { rank: 'AB' }); return b; };
const classOf = (mail) => compareCrewLists({ a: csv(base()), b: csv(changed()), mail }).items.find((it) => it.person.startsWith('NGUYEN')).class;

test('정상 지시는 예상된 변경', () => assert.equal(classOf('NGUYEN VAN AN promoted to AB.'), 'expected'));
for (const [name, mail] of [
  ['부정', 'Do not promote NGUYEN VAN AN to AB.'],
  ['부정(한국어)', 'NGUYEN VAN AN AB로 진급 처리하지 마세요.'],
  ['조건부', 'If confirmed by owner, NGUYEN VAN AN promoted to AB.'],
  ['취소', 'NGUYEN VAN AN promoted to AB.\nPlease disregard the above, NGUYEN VAN AN promotion cancelled.'],
  ['인용된 이전 메일', 'Noted with thanks.\n\nOn Mon, 2 Nov 2026, Crewing wrote:\n> NGUYEN VAN AN promoted to AB.'],
  ['원본 메일 아래', 'Noted.\n-----Original Message-----\nNGUYEN VAN AN promoted to AB.'],
]) {
  test(`${name}: 지시로 쓰지 않음 → 예상된 변경 아님`, () => assert.notEqual(classOf(mail), 'expected'));
}
