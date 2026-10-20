// 두 버전 사이 인물 대응. 행 순서와 무관하고 1:1을 보장한다.
// 1순위 신분증번호(정규화) 일치, 2순위 성명+생년월일, 3순위 성명 유사도.
import { nameKey, similarity, confusableFold, swapDayMonth } from './normalize.js';

const v = (row, f) => (row.cells[f].status === 'ok' ? row.cells[f].value : '');

export function personKey(row) {
  return nameKey(v(row, 'familyName'), v(row, 'givenNames'));
}

// 같은 버전 안에서 같은 사람이 두 번 나온 행(R5). 뒤에 나온 행을 중복으로 본다.
export function findDuplicates(rows) {
  const dups = [];
  const seenId = new Map();
  const seenNameDob = new Map();
  for (const r of rows) {
    const id = v(r, 'idNumber');
    const nd = personKey(r) && v(r, 'dob') ? `${personKey(r)}|${v(r, 'dob')}` : '';
    const first = (id && seenId.get(id)) || (nd && seenNameDob.get(nd));
    if (first) { dups.push({ row: r, of: first, by: id && seenId.get(id) ? 'idNumber' : 'name+dob' }); continue; }
    if (id) seenId.set(id, r);
    if (nd) seenNameDob.set(nd, r);
  }
  return dups;
}

export function scorePair(a, b) {
  const idA = v(a, 'idNumber'), idB = v(b, 'idNumber');
  const kA = personKey(a), kB = personKey(b);
  const nameSim = kA && kB ? similarity(kA, kB) : 0;
  const dA = v(a, 'dob'), dB = v(b, 'dob');
  const dobMatch = dA && dB && (dA === dB || swapDayMonth(dA) === dB);
  const dobUnknown = !dA || !dB;
  if (idA && idA === idB) return { score: 100, method: 'idNumber', nameSim };
  if (idA && idB && confusableFold(idA) === confusableFold(idB) && nameSim >= 0.6) return { score: 92, method: 'idNumber~confusable', nameSim };
  if ((dobMatch || dobUnknown) && nameSim >= 0.75) return { score: 70 + 20 * nameSim, method: dobMatch ? 'name+dob' : 'name(dob 판독 불가)', nameSim };
  if (nameSim >= 0.9) return { score: 50 + 10 * nameSim, method: 'name', nameSim };
  return null;
}

// rowsA, rowsB: parse 결과 rows (중복 행은 미리 빼고 넘긴다)
export function matchPersons(rowsA, rowsB) {
  const cands = [];
  for (const a of rowsA) for (const b of rowsB) {
    const s = scorePair(a, b);
    if (s) cands.push({ a, b, ...s });
  }
  cands.sort((x, y) => y.score - x.score || x.a.index - y.a.index || x.b.index - y.b.index);
  const usedA = new Set(), usedB = new Set();
  const pairs = [];
  for (const c of cands) {
    if (usedA.has(c.a) || usedB.has(c.b)) continue;
    usedA.add(c.a); usedB.add(c.b);
    pairs.push({ a: c.a, b: c.b, method: c.method, confidence: Math.round(c.score) / 100 });
  }
  pairs.sort((x, y) => x.b.index - y.b.index);
  return {
    pairs,
    onlyA: rowsA.filter((r) => !usedA.has(r)),
    onlyB: rowsB.filter((r) => !usedB.has(r)),
  };
}
