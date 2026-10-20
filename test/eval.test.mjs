import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { generate, LAYOUTS, SPLIT_LAYOUTS } from '../eval/gen.mjs';
import { LAWS, IMMIGRATION_PENALTY } from '../lib/impact.js';
import { normHeader } from '../lib/fields.js';

test('생성기 결정성: 같은 시드 → 같은 결과, 다른 시드 → 다른 결과', () => {
  const a = JSON.stringify(generate(7));
  const b = JSON.stringify(generate(7));
  const c = JSON.stringify(generate(8));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('평가셋 규모와 분할: 쌍 200, 라벨 약 1,000, 홀드아웃은 홀드아웃 레이아웃만', () => {
  const ds = generate();
  assert.equal(ds.pairs.length, 200);
  const n = ds.pairs.reduce((s, p) => s + p.labels.length, 0);
  assert.ok(n >= 900 && n <= 1200, String(n));
  for (const p of ds.pairs) {
    assert.ok(SPLIT_LAYOUTS[p.split].includes(p.layoutA) && SPLIT_LAYOUTS[p.split].includes(p.layoutB), p.id);
  }
  const rules = new Set(ds.pairs.flatMap((p) => p.labels.map((l) => l.rule).filter(Boolean)));
  assert.deepEqual([...rules].sort(), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']);
});

test('홀드아웃 머리글은 개발용과 다름(H2의 LAST NAME·BIRTH PLACE·SEX 3개는 정규화하면 개발용과 같음 — README에 기록)', () => {
  const heads = (ids) => new Set(ids.flatMap((id) => LAYOUTS[id].cols.map(([, h]) => normHeader(h))));
  const dev = heads(SPLIT_LAYOUTS.dev);
  const overlap = [...heads(SPLIT_LAYOUTS.holdout)].filter((h) => dev.has(h));
  assert.deepEqual(overlap, ['lastname', 'birthplace', 'sex']);
});

const LAW_DIR = new URL('../../근거자료/법령/', import.meta.url);
test('법령 인용이 law.go.kr 원문 XML에 글자 그대로 있음', { skip: !existsSync(LAW_DIR) && '근거자료/법령 폴더 없음' }, () => {
  for (const l of Object.values(LAWS)) {
    const xml = readFileSync(new URL(l.xml, LAW_DIR), 'utf8');
    assert.ok(xml.includes(l.quote), l.id);
    if (l.formTitle) assert.ok(xml.includes(l.formTitle), l.id + ' 서식');
  }
  const x = readFileSync(new URL('출입국관리법.xml', LAW_DIR), 'utf8');
  assert.ok(x.includes(IMMIGRATION_PENALTY.quote));
  assert.ok(x.includes(IMMIGRATION_PENALTY.head));
});
