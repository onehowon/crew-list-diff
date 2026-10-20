import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCrewList, mapColumn } from '../lib/parse.js';
import { parseDate, inferDateOrder, normRank, normCountry } from '../lib/normalize.js';
import { csv, base } from './helpers.mjs';

test('헤더 별칭: 영문 FAL·약어·한국어 머리글을 FAL 5 항목으로', () => {
  const cases = [['7. Family name', 'familyName'], ['Surname', 'familyName'], ['Last name', 'familyName'], ['성', 'familyName'], ['Given names', 'givenNames'], ['First name', 'givenNames'], ['이름', 'givenNames'],
    ['Rank', 'rank'], ['직책', 'rank'], ['D.O.B', 'dob'], ['생년월일', 'dob'], ['Passport No.', 'idNumber'], ['Seaman book no.', 'idNumber'], ['여권번호', 'idNumber'], ['Valid until', 'idExpiry'], ['M/F', 'gender'], ['15. Number of identity document', 'idNumber'], ['16. Issuing State of identity document', 'idIssuer']];
  for (const [h, f] of cases) assert.equal(mapColumn(h).field, f, h);
  assert.equal(mapColumn('Remarks').field, null);
});

test('날짜 정규화: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, DD-MMM-YYYY, YYYY.MM.DD, 한국어', () => {
  assert.equal(parseDate('1990-04-05'), '1990-04-05');
  assert.equal(parseDate('05.04.1990'), '1990-04-05');
  assert.equal(parseDate('05/04/1990'), '1990-04-05');
  assert.equal(parseDate('04/05/1990', 'MDY'), '1990-04-05');
  assert.equal(parseDate('05-APR-1990'), '1990-04-05');
  assert.equal(parseDate('5 Apr 1990'), '1990-04-05');
  assert.equal(parseDate('1990.04.05'), '1990-04-05');
  assert.equal(parseDate('1990년 4월 5일'), '1990-04-05');
  assert.equal(parseDate('31/02/1990'), null);
  assert.equal(inferDateOrder(['12/25/1990', '01/02/1985']), 'MDY');
  assert.equal(inferDateOrder(['25/12/1990', '01/02/1985']), 'DMY');
});

test('표기 정규화: 직급 약어·국가명', () => {
  assert.equal(normRank('Able Seaman'), 'AB');
  assert.equal(normRank('A/B'), 'AB');
  assert.equal(normRank('Chief Officer'), 'C/O');
  assert.equal(normRank('갑판수'), 'AB');
  assert.equal(normCountry('Philippines'), 'PHL');
  assert.equal(normCountry('PHI'), 'PHI');
});

test('셀마다 원문 위치(줄·열·raw)를 보존하고 머리말(입출항일)을 읽는다', () => {
  const p = parseCrewList(csv(base()), 'B');
  assert.equal(p.rows.length, 4);
  assert.equal(p.header.date.value, '2026-11-03');
  const c = p.rows[1].cells.familyName;
  assert.deepEqual([c.sourceId, c.row, c.col, c.raw, c.value], ['B', 5, 2, 'DELA CRUZ', 'DELA CRUZ']);
  assert.equal(p.rows[0].cells.dob.value, '1975-03-12');
});

test('TSV·따옴표 CSV·판독 불가 셀', () => {
  const tsv = 'Vessel:\tX\nNo.\tSurname\tFirst name\tRank\tNationality\tD.O.B\tSex\tPassport No.\tExpiry\n1\tKIM\tMINJUN\tAB\tKOR\t12/03/1975\tM\t???\t01/01/2030\n';
  const p = parseCrewList(tsv, 'A');
  assert.equal(p.delim, '\t');
  assert.equal(p.rows[0].cells.idNumber.status, 'unreadable');
  assert.equal(p.rows[0].cells.dob.value, '1975-03-12');
  const q = parseCrewList('Family name,Given names,Rank,Nationality,Date of birth,Passport No.\n"DELA CRUZ, JR",JUAN,AB,PHL,1990-04-05,PA1\n', 'A');
  assert.equal(q.rows[0].cells.familyName.value, 'DELA CRUZ, JR');
});
