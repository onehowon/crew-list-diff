import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareCrewLists } from '../lib/engine.js';

// 머리글을 못 찾은 명부를 '변경 없음'처럼 넘기지 않는다
const unknownHeader = 'Nachname;Vornamen;Dienstgrad;Staatsangehörigkeit\nMUSTER;HANS;Master;DEU\n';
const known = 'No.,Family name,Given names,Rank or rating,Nationality,Date of birth,Place of birth,Gender,Nature of identity document,Number of identity document,Issuing State of identity document,Expiry date of identity document\n1,KIM,MINSU,Master,KOR,1980-01-02,BUSAN,M,Passport,M1234567,KOR,2030-01-01\n';

test('머리글을 못 찾으면 문서 단위 경보와 함께 차단', () => {
  const r = compareCrewLists({ a: known, b: unknownHeader });
  assert.equal(r.blocked, true);
  assert.equal(r.documentAlerts.length, 1);
  assert.equal(r.documentAlerts[0].sourceId, 'B');
});

test('정상 명부 두 개는 차단하지 않음', () => {
  const r = compareCrewLists({ a: known, b: known });
  assert.equal(r.blocked, false);
  assert.deepEqual(r.documentAlerts, []);
});
