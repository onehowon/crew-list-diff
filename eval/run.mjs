// 채점: 본 엔진 vs 기준선 2종. 개발/홀드아웃 따로.
// 사용: node eval/run.mjs                 개발 세트만(개발·튜닝 중 기본값)
//       node eval/run.mjs --split all     개발 + 홀드아웃(최종 평가). 결과를 docs/eval-result.{json,md}에 저장
// 수치는 실행 결과를 그대로 저장한다(손으로 고치지 않음).
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, generateH3, generateH4, stats, DEFAULT_SEED, H3_SEED, H4_SEED } from './gen.mjs';
import { compareCrewLists } from '../lib/engine.js';
import { baselineRowNumber, baselineIdKey } from './baselines.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULE_IDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
const pct = (a, b) => (b ? a / b : null);

// ---- 본 엔진 예측 → 라벨 키 ----
export function engineItemKey(pair, it) {
  const pa = it.rowA ? pair.rowPidsA[it.rowA.index] : null;
  const pb = it.rowB ? pair.rowPidsB[it.rowB.index] : null;
  switch (it.kind) {
    case 'modify': case 'standing': return `${pb}|${it.field}`;
    case 'add': return `${pb}|+`;
    case 'remove': return `${pa}|-`;
    case 'duplicate': return `${pb}|dup`;
    case 'directive': return `R8|L${it.directive.line}`;
    default: return `?|${it.kind}`;
  }
}

// 근거 연결: 표시한 변경마다 원문 위치(실제로 그 줄에 그 값이 있는지까지)·규칙 id·지시 문장이 붙었는지
export function evidenceOk(pair, report, it) {
  const linesA = pair.a.split('\n'), linesB = pair.b.split('\n');
  const src = it.evidence?.source || [];
  let ok = true;
  for (const s of src) {
    const lines = s.sourceId === 'A' ? linesA : linesB;
    if (!lines[s.line - 1]) ok = false;
  }
  const valueAt = (cell, lines) => !cell || !cell.row || cell.raw == null || !cell.raw.trim() || (lines[cell.row - 1] || '').includes(cell.raw.trim());
  if (it.kind === 'modify' || it.kind === 'standing') ok = ok && src.length === 2 && valueAt(it.before, linesA) && valueAt(it.after, linesB);
  if (it.kind === 'directive') ok = ok && !!it.evidence.directive;
  else ok = ok && src.length > 0;
  if (it.class === 'expected') ok = ok && !!it.evidence.directive;
  if (it.class === 'suspect') ok = ok && it.evidence.rules.length > 0;
  if (it.evidence?.directive) ok = ok && pair.mail.slice(it.evidence.directive.start, it.evidence.directive.end) === it.directive.text;
  return ok;
}

export function evaluateEngine(pair) {
  const rep = compareCrewLists({ a: pair.a, b: pair.b, mail: pair.mail });
  const preds = rep.items.map((it) => ({ key: engineItemKey(pair, it), cls: it.class, rules: (it.rules || []).map((r) => r.id), line: it.directive?.line ?? null, ev: evidenceOk(pair, rep, it), kind: it.kind }));
  const matchOk = rep.pairs.filter((p) => pair.rowPidsA[p.a.index] === pair.rowPidsB[p.b.index]).length;
  return { preds, columnAlerts: rep.columnAlerts.length, matching: { pairs: rep.pairs.length, correct: matchOk }, cells: rep.totalCells, warnings: [...rep.A.warnings, ...rep.B.warnings, ...rep.noticeWarnings] };
}

// 기준선 경보 → 라벨 검출 여부
function evaluateBaseline(pair, fn) {
  const { alarms, B } = fn(pair.a, pair.b);
  const al = alarms.map((x) => ({ pa: x.rowA ? pair.rowPidsA[x.rowA.index] : null, pb: x.rowB ? pair.rowPidsB[x.rowB.index] : null, field: x.field }));
  return { alarms: al, cells: B.rows.length * 11 };
}

function labelDetectedByAlarm(label, alarms) {
  const [pid, what] = label.key.split('|');
  if (pid === 'R8') return false; // 메일을 읽지 않으므로 지시 미반영은 볼 수 없음
  if (what === '+' || what === 'dup') return alarms.some((a) => a.pb === pid);
  if (what === '-') return alarms.some((a) => a.pa === pid);
  return alarms.some((a) => (a.pa === pid || a.pb === pid) && (a.field === what || a.field === null));
}

function newAgg() {
  return {
    pairs: 0, cells: 0, labels: { total: 0, expected: 0, check: 0, suspect: 0 }, cosmeticCells: 0,
    detected: 0, reviewUnits: 0, falseAlarms: 0, cosmeticAlarms: 0, missedErrorsOutside: 0, missedErrorsByRule: {},
    perRule: Object.fromEntries(RULE_IDS.map((r) => [r, { n: 0, detected: 0, asSuspect: 0, ruleCorrect: 0 }])),
    suspect: { tp: 0, fp: 0, fn: 0 }, expected: { n: 0, correct: 0, predicted: 0, predictedWrong: 0, predictedButTruthSuspect: 0 },
    confusion: {}, evidence: { items: 0, ok: 0 }, matching: { pairs: 0, correct: 0 }, items: 0,
    hardNegatives: { n: 0, expected: 0, suspect: 0 }, missedChanges: [], columnAlerts: 0,
  };
}

function addLabels(agg, pair) {
  agg.pairs++;
  agg.cosmeticCells += pair.cosmetic.length;
  for (const l of pair.labels) { agg.labels.total++; agg.labels[l.truth]++; if (l.rule) agg.perRule[l.rule].n++; }
}

function scoreEngine(agg, pair, res) {
  addLabels(agg, pair);
  agg.cells += res.cells;
  agg.matching.pairs += res.matching.pairs; agg.matching.correct += res.matching.correct;
  agg.columnAlerts += res.columnAlerts || 0;
  const byKey = new Map();
  for (const p of res.preds) { if (!byKey.has(p.key)) byKey.set(p.key, p); }
  const labelKeys = new Set(pair.labels.map((l) => l.key));
  const cos = new Set(pair.cosmetic);
  for (const l of pair.labels) {
    const p = byKey.get(l.key);
    const pc = p ? p.cls : 'none';
    agg.confusion[`${l.truth}>${pc}`] = (agg.confusion[`${l.truth}>${pc}`] || 0) + 1;
    if (p) agg.detected++; else agg.missedChanges.push(`${pair.id} ${l.key} (${l.truth}${l.rule ? ' ' + l.rule : ''})`);
    if (l.rule) {
      const pr = agg.perRule[l.rule];
      if (p) pr.detected++;
      if (pc === 'suspect') { pr.asSuspect++; if (p.rules.includes(l.rule)) pr.ruleCorrect++; }
    }
    if (l.truth === 'suspect') {
      if (pc === 'suspect') agg.suspect.tp++; else agg.suspect.fn++;
      if (pc !== 'suspect' && pc !== 'check') { agg.missedErrorsOutside++; agg.missedErrorsByRule[l.rule] = (agg.missedErrorsByRule[l.rule] || 0) + 1; }
    }
    if (l.truth === 'expected') { agg.expected.n++; if (pc === 'expected' && p.line === l.line) agg.expected.correct++; }
    if (l.hardNegative) { agg.hardNegatives.n++; if (pc === 'expected') agg.hardNegatives.expected++; if (pc === 'suspect') agg.hardNegatives.suspect++; }
  }
  for (const p of res.preds) {
    agg.items++;
    agg.evidence.items++; if (p.ev) agg.evidence.ok++;
    if (p.cls === 'suspect' || p.cls === 'check') agg.reviewUnits++;
    if (!labelKeys.has(p.key)) {
      agg.falseAlarms++;
      if (cos.has(p.key)) agg.cosmeticAlarms++;
      agg.confusion[`none>${p.cls}`] = (agg.confusion[`none>${p.cls}`] || 0) + 1;
      if (p.cls === 'suspect') agg.suspect.fp++;
    }
    if (p.cls === 'expected') {
      agg.expected.predicted++;
      const l = pair.labels.find((x) => x.key === p.key);
      if (!l || l.truth !== 'expected') agg.expected.predictedWrong++;
      if (l && l.truth === 'suspect') agg.expected.predictedButTruthSuspect++;
    }
    if (p.cls === 'suspect' && labelKeys.has(p.key) && pair.labels.find((x) => x.key === p.key).truth !== 'suspect') agg.suspect.fp++;
  }
}

function scoreBaseline(agg, pair, res) {
  addLabels(agg, pair);
  agg.cells += res.cells;
  const cos = new Set(pair.cosmetic);
  for (const l of pair.labels) {
    const hit = labelDetectedByAlarm(l, res.alarms);
    if (hit) agg.detected++;
    if (l.rule) { if (hit) agg.perRule[l.rule].detected++; }
    if (l.truth === 'suspect' && !hit) { agg.missedErrorsOutside++; agg.missedErrorsByRule[l.rule] = (agg.missedErrorsByRule[l.rule] || 0) + 1; }
  }
  for (const a of res.alarms) {
    agg.reviewUnits++;
    const real = pair.labels.some((l) => labelDetectedByAlarm(l, [a]));
    if (!real) {
      agg.falseAlarms++;
      if (a.field && a.pa === a.pb && cos.has(`${a.pb}|${a.field}`)) agg.cosmeticAlarms++;
    }
  }
}

function finalize(agg, kind) {
  const o = {
    pairs: agg.pairs,
    cellsInRevised: agg.cells,
    labels: agg.labels,
    cosmeticCells: agg.cosmeticCells,
    substantiveRecall: { detected: agg.detected, total: agg.labels.total, missed: agg.labels.total - agg.detected, rate: pct(agg.detected, agg.labels.total) },
    falseAlarms: { total: agg.falseAlarms, perPair: agg.falseAlarms / agg.pairs, cosmeticAlarms: agg.cosmeticAlarms },
    review: { units: agg.reviewUnits, perPair: agg.reviewUnits / agg.pairs, ratio: pct(agg.reviewUnits, agg.cells), missedErrorsOutside: agg.missedErrorsOutside, missedErrorsByRule: agg.missedErrorsByRule, errorsTotal: agg.labels.suspect },
    perRule: Object.fromEntries(Object.entries(agg.perRule).map(([k, v]) => [k, kind === 'engine' ? v : { n: v.n, detected: v.detected }])),
  };
  if (kind === 'engine') {
    const s = agg.suspect;
    o.suspect = { tp: s.tp, fp: s.fp, fn: s.fn, precision: pct(s.tp, s.tp + s.fp), recall: pct(s.tp, s.tp + s.fn) };
    o.expected = { ...agg.expected, accuracy: pct(agg.expected.correct, agg.expected.n), precision: pct(agg.expected.predicted - agg.expected.predictedWrong, agg.expected.predicted) };
    o.confusion = agg.confusion;
    o.evidence = { ...agg.evidence, rate: pct(agg.evidence.ok, agg.evidence.items) };
    o.matching = { ...agg.matching, accuracy: pct(agg.matching.correct, agg.matching.pairs) };
    o.hardNegatives = agg.hardNegatives;
    o.items = agg.items;
    o.columnAlerts = { total: agg.columnAlerts, perPair: agg.columnAlerts / agg.pairs };
    o.missedChangesSample = agg.missedChanges.slice(0, 40);
  }
  return o;
}

export function runEval({ seed = DEFAULT_SEED, splits = ['dev'] } = {}) {
  const ds = generate(seed);
  const h3 = splits.includes('holdout3') ? generateH3(H3_SEED) : null;
  const h4 = splits.includes('holdout4') ? generateH4(H4_SEED) : null;
  const result = { seed, h3Seed: h3 ? H3_SEED : undefined, h4Seed: h4 ? H4_SEED : undefined, generatedAt: null, splits: {}, dataset: { ...stats(ds), ...(h3 ? stats(h3) : {}), ...(h4 ? stats(h4) : {}) } };
  const warnSample = {};
  for (const split of splits) {
    const pairs = split === 'holdout3' ? h3.pairs : split === 'holdout4' ? h4.pairs : ds.pairs.filter((p) => p.split === split);
    const E = newAgg(), B1 = newAgg(), B2 = newAgg();
    const warns = new Map();
    for (const pair of pairs) {
      const er = evaluateEngine(pair);
      for (const w of er.warnings) warns.set(w, (warns.get(w) || 0) + 1);
      scoreEngine(E, pair, er);
      scoreBaseline(B1, pair, evaluateBaseline(pair, baselineRowNumber));
      scoreBaseline(B2, pair, evaluateBaseline(pair, baselineIdKey));
    }
    result.splits[split] = { engine: finalize(E, 'engine'), baselineRow: finalize(B1, 'baseline'), baselineId: finalize(B2, 'baseline') };
    warnSample[split] = [...warns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => `${w} ×${n}`);
  }
  result.parserWarnings = warnSample;
  return result;
}

// ---- 보고서(Markdown) ----
const P = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const N = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));
export const SECTION_TITLE = {
  holdout4: 'H4 1회차(개선 후, 처음 보는 언어의 머리글)',
  holdout3: 'H3 1회차(개선 전, 처음 보는 날짜·머리글)',
  holdoutFirst: 'H1·H2 1회차(수정 전)',
  holdout: '홀드아웃 H1·H2 — 버그 수정 후 재실행(규칙 수정에 사용됨, 참고값)',
  dev: '개발 세트 (튜닝에 사용, 참고값)',
};
export function toMarkdown(res, { titles = {}, header = true } = {}) {
  const L = [];
  if (header) L.push('# 평가 결과 (합성 데이터)', '');
  if (header) {
    L.push(`- 시드 ${res.seed}${res.h3Seed ? ` · H3 시드 ${res.h3Seed}` : ''} · Node ${process.version}`);
    L.push('- 대상: 대조·분류 엔진(lib/). 메일 해석은 규칙 기반(데모). 실제 서비스의 LLM 추출 성능은 이 평가에 포함되지 않음.');
    L.push('- **합성 데이터 결과라 실제 현장 명부·메일에서는 다를 수 있음.**');
    L.push('- 검수 범위 = 담당자가 개별 확인할 항목(엔진: 오류 의심+확인 필요 / 기준선: 모든 경보) ÷ 수정본 셀 수. 항상 "검수 대상에서 빠진 실제 오류 수"와 함께 본다.');
    L.push('');
  }
  for (const [split, r] of Object.entries(res.splits)) {
    const e = r.engine, b1 = r.baselineRow, b2 = r.baselineId;
    L.push(`## ${titles[split] || SECTION_TITLE[split] || split} — 쌍 ${e.pairs}개, 라벨 ${e.labels.total}건 (예상 ${e.labels.expected} · 확인 ${e.labels.check} · 오류 ${e.labels.suspect}), 표기만 다른 셀 ${e.cosmeticCells}개`, '');
    L.push('| 지표 | 본 엔진 | 기준선1 행 번호 대조 | 기준선2 신분증번호 키 대조 |', '|---|---|---|---|');
    L.push(`| 실질 변경 재현율 (놓친 수) | ${P(e.substantiveRecall.rate)} (${e.substantiveRecall.missed}) | ${P(b1.substantiveRecall.rate)} (${b1.substantiveRecall.missed}) | ${P(b2.substantiveRecall.rate)} (${b2.substantiveRecall.missed}) |`);
    L.push(`| 오류 의심 정밀도 | ${P(e.suspect.precision)} | 분류 없음 | 분류 없음 |`);
    L.push(`| 오류 의심 재현율 | ${P(e.suspect.recall)} | 분류 없음 | 분류 없음 |`);
    L.push(`| 오경보 합계 (쌍당) | ${e.falseAlarms.total} (${N(e.falseAlarms.perPair)}) | ${b1.falseAlarms.total} (${N(b1.falseAlarms.perPair)}) | ${b2.falseAlarms.total} (${N(b2.falseAlarms.perPair)}) |`);
    L.push(`| 그중 표기만 다른 셀 경보 | ${e.falseAlarms.cosmeticAlarms} | ${b1.falseAlarms.cosmeticAlarms} | ${b2.falseAlarms.cosmeticAlarms} |`);
    L.push(`| 개별 검수 항목 (쌍당) | ${e.review.units} (${N(e.review.perPair, 1)}) | ${b1.review.units} (${N(b1.review.perPair, 1)}) | ${b2.review.units} (${N(b2.review.perPair, 1)}) |`);
    L.push(`| 검수 범위 비율 | ${P(e.review.ratio)} | ${P(b1.review.ratio)} | ${P(b2.review.ratio)} |`);
    L.push(`| **검수 대상에서 빠진 실제 오류 수** (전체 오류 ${e.review.errorsTotal}) | **${e.review.missedErrorsOutside}** | **${b1.review.missedErrorsOutside}** | **${b2.review.missedErrorsOutside}** |`);
    L.push(`| 근거 연결률 | ${P(e.evidence.rate)} (${e.evidence.ok}/${e.evidence.items}) | — | — |`);
    L.push(`| 쌍당 열 단위 서식 경보 (셀 오경보와 별도) | ${e.columnAlerts ? `${N(e.columnAlerts.perPair)} (${e.columnAlerts.total})` : '— (이 기능 도입 전)'} | — | — |`);
    L.push('');
    L.push(`- 예상된 변경 정확도(지시 문장까지 맞음): ${P(e.expected.accuracy)} (${e.expected.correct}/${e.expected.n}) · 예상 판정 정밀도 ${P(e.expected.precision)} · 예상으로 판정했지만 실제 오류: ${e.expected.predictedButTruthSuspect}건`);
    L.push(`- 정상 정정인데 오류 모양(R1·R2)인 사례 ${e.hardNegatives.n}건 → 예상 ${e.hardNegatives.expected} · 오류 의심 ${e.hardNegatives.suspect}`);
    L.push(`- 인물 대응 정확도: ${P(e.matching.accuracy)} (${e.matching.correct}/${e.matching.pairs})`);
    L.push(`- 검수 대상에서 빠진 오류 유형(엔진): ${JSON.stringify(e.review.missedErrorsByRule)} / 기준선1: ${JSON.stringify(b1.review.missedErrorsByRule)} / 기준선2: ${JSON.stringify(b2.review.missedErrorsByRule)}`);
    L.push('');
    L.push('| 오류 유형 | 건수 | 엔진: 오류 의심으로 분류 | 엔진: 규칙 id까지 맞음 | 기준선1 경보 | 기준선2 경보 |', '|---|---|---|---|---|---|');
    for (const k of RULE_IDS) {
      const x = e.perRule[k];
      L.push(`| ${k} | ${x.n} | ${x.asSuspect} | ${x.ruleCorrect} | ${b1.perRule[k].detected} | ${b2.perRule[k].detected} |`);
    }
    L.push('');
    L.push('분류 혼동표(정답 > 엔진): ' + Object.entries(e.confusion).sort().map(([k, v]) => `${k} ${v}`).join(' · '));
    L.push('');
  }
  L.push('## 파서 경고(상위)', '');
  for (const [s, ws] of Object.entries(res.parserWarnings)) { L.push(`- ${s}: ${ws.length ? ws.join(' / ') : '없음'}`); }
  L.push('');
  return L.join('\n');
}

// docs/eval-result.md: H4 1회차 → 바로 아래 H3 1회차(개선 전/후 비교) → H1·H2 1회차(수정 전) → H1·H2 수정 후 → 개발 세트
function compareTable(h4, h3) {
  const e4 = h4.splits.holdout4, e3 = h3.splits.holdout3;
  const rows = [
    ['실질 변경 재현율 (놓친 수)', (r) => `${P(r.engine.substantiveRecall.rate)} (${r.engine.substantiveRecall.missed})`],
    ['오류 의심 정밀도 / 재현율', (r) => `${P(r.engine.suspect.precision)} / ${P(r.engine.suspect.recall)}`],
    ['쌍당 오경보', (r) => N(r.engine.falseAlarms.perPair)],
    ['검수 범위 비율', (r) => P(r.engine.review.ratio)],
    ['검수 대상에서 빠진 실제 오류 수', (r) => `${r.engine.review.missedErrorsOutside} / ${r.engine.review.errorsTotal}`],
    ['근거 연결률', (r) => P(r.engine.evidence.rate)],
    ['쌍당 열 단위 서식 경보', (r) => (r.engine.columnAlerts ? N(r.engine.columnAlerts.perPair) : '— (도입 전)')],
    ['기준선1 / 기준선2 빠진 실제 오류', (r) => `${r.baselineRow.review.missedErrorsOutside} / ${r.baselineId.review.missedErrorsOutside}`],
  ];
  const L = ['| 지표 (본 엔진) | H4 1회차(개선 후 처음 보는 서식) | H3 1회차(개선 전 처음 보는 서식) |', '|---|---|---|'];
  for (const [k, f] of rows) L.push(`| ${k} | ${f(e4)} | ${f(e3)} |`);
  return L.join('\n');
}

export function assembleReport(current, { h4 = null, h3 = null, first = null } = {}) {
  const L = ['# 평가 결과 (합성 데이터)', ''];
  L.push('- 대상: 대조·분류 엔진(lib/). 메일 해석은 규칙 기반(데모). 실제 서비스의 LLM 추출 성능은 포함되지 않음.');
  L.push('- **합성 데이터 결과라 실제 현장 명부·메일에서는 다를 수 있음.** 현장 업무시간 절감은 주장하지 않음(후속 PoC).');
  L.push('- 검수 범위 = 담당자가 개별 확인할 항목(엔진: 오류 의심+확인 필요 / 기준선: 모든 경보) ÷ 수정본 셀 수. 항상 "검수 대상에서 빠진 실제 오류 수"와 함께 본다.');
  L.push('- 각 홀드아웃은 한 번만 쓴다. `node eval/run.mjs --split h3|h4`는 결과 파일이 있으면 재실행을 거부한다. 개발·H1·H2 참고값은 `node eval/run.mjs --split all`(현재 코드).');
  L.push('');
  if (first) {
    L.push('# 1. 개발에 쓰지 않은 서식 — H1·H2 1회차 (수정 전 첫 측정)', '');
    L.push('H1(한국어 머리글)·H2(약어 머리글·미국식 날짜). 원본 docs/eval-holdout-first-run.json. 이 결과를 본 뒤 버그 3건을 고쳤으므로 이후 H1·H2 재실행 값은 참고값이다.', '');
    L.push(toMarkdown({ ...first, splits: { holdout: first.splits.holdout }, parserWarnings: { holdout: first.parserWarnings.holdout } }, { header: false, titles: { holdout: SECTION_TITLE.holdoutFirst } }));
  }
  if (h4 && h3) {
    L.push('# 2. 처음 보는 서식 스트레스 테스트 — H3·H4 각 1회차', '');
    L.push('- H3: 두 자리 연도·스페인어 혼합 머리글. 실제 오류는 거의 놓치지 않았지만(92건 중 1건) 판독 불가 경보가 셀마다 쏟아졌다(쌍당 18.68).', '- H3를 본 뒤 일반화 개선(두 자리 연도, 열 단위 경보, 값 모양 추정 매핑, 메일 정정 문형)을 하고 새 서식 H4로 1회 쟀다.', '- H4: 독일어·인도네시아어 머리글. 머리글 행을 찾지 못해 60쌍 모두 명부를 0행으로 읽었다. 당시 엔진은 경고 문구만 띄우고 진행했다(조용한 실패).', '- H4를 본 뒤 문서 단위 판독 실패 차단을 추가했다(lib/engine.js documentAlerts). 성능 수치는 다시 계산하지 않았고, 차단 동작만 `node eval/fail-loud-check.mjs`로 확인한다: H4 60쌍 모두 차단, 판독 실패인데 통과 0.', '- 결론: 규칙 기반 머리글 인식은 처음 보는 언어·서식에 약하다. 실제 서비스는 LLM 추출로 머리글을 FAL 5 항목에 매핑하고, 회사별 서식을 PoC 초기에 등록하며, 판독 실패는 반드시 사람에게 넘긴다.', '');
    L.push(compareTable(h4, h3), '');
  }
  if (h4) {
    L.push(`원본: docs/eval-H4-first-run.json (시드 ${h4.h4Seed}, 실행 ${h4.generatedAt}), 설계 eval/H4-spec.md. 결과를 보고 엔진·규칙·별칭 사전을 고치지 않음.`, '');
    L.push(toMarkdown(h4, { header: false }));
  }
  if (h3) {
    L.push(`원본: docs/eval-H3-first-run.json (시드 ${h3.h3Seed}, 실행 ${h3.generatedAt}), 설계 eval/H3-spec.md. 이 결과를 본 뒤 일반화 개선(e7d1d41)을 했음.`, '');
    L.push(toMarkdown(h3, { header: false }));
  }
  L.push('# 3. 참고값', '');
  if (false) {
    L.push('H1·H2 1회차(수정 전) 원본: docs/eval-holdout-first-run.json. 이 결과를 본 뒤 엔진 버그 3건을 고쳤으므로 H1·H2는 더 이상 깨끗한 홀드아웃이 아님.', '');
    L.push(toMarkdown({ ...first, splits: { holdout: first.splits.holdout }, parserWarnings: { holdout: first.parserWarnings.holdout } }, { header: false, titles: { holdout: SECTION_TITLE.holdoutFirst } }));
  }
  L.push(toMarkdown(current, { header: false }));
  return L.join('\n');
}

const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const split = arg('--split', 'dev');
  // h3·h4: 깨끗한 홀드아웃 1회 실행 전용. 이미 결과 파일이 있으면 다시 실행하지 않는다(재실행·덮어쓰기 방지).
  const ONCE = { h3: { split: 'holdout3', file: 'eval-H3-first-run' }, h4: { split: 'holdout4', file: 'eval-H4-first-run' } };
  if (ONCE[split]) {
    const { split: sp, file } = ONCE[split];
    const out = join(ROOT, `docs/${file}.json`);
    if (existsSync(out)) { console.error(`${split.toUpperCase()} 1회차 결과가 이미 있습니다: docs/${file}.json (재실행 금지)`); process.exit(2); }
    const res = runEval({ splits: [sp] });
    res.generatedAt = new Date().toISOString();
    const md = toMarkdown(res, { titles: { [sp]: SECTION_TITLE[sp] } });
    writeFileSync(out, JSON.stringify(res, null, 2) + '\n');
    writeFileSync(join(ROOT, `docs/${file}.md`), md);
    console.log(md);
    process.exit(0);
  }
  if (process.argv.includes('--render-first-runs')) {
    const f1 = readJson(join(ROOT, 'docs/eval-holdout-first-run.json'));
    if (f1) writeFileSync(join(ROOT, 'docs/eval-holdout-first-run.md'), `<!-- 저장된 JSON에서 제목만 바꿔 다시 그림(수치 재계산 없음) -->\n` + toMarkdown(f1, { titles: { holdout: SECTION_TITLE.holdoutFirst } }));
    const f3 = readJson(join(ROOT, 'docs/eval-H3-first-run.json'));
    if (f3) writeFileSync(join(ROOT, 'docs/eval-H3-first-run.md'), `<!-- 저장된 JSON에서 제목만 바꿔 다시 그림(수치 재계산 없음) -->\n` + toMarkdown(f3, { titles: { holdout3: SECTION_TITLE.holdout3 } }));
    const f4 = readJson(join(ROOT, 'docs/eval-H4-first-run.json'));
    if (f4) writeFileSync(join(ROOT, 'docs/eval-H4-first-run.md'), `<!-- 저장된 JSON에서 다시 그림(수치 재계산 없음) -->\n` + toMarkdown(f4, { titles: { holdout4: SECTION_TITLE.holdout4 } }));
    console.log('1회차 md 다시 그림');
    process.exit(0);
  }
  const splits = split === 'all' ? ['dev', 'holdout'] : [split];
  const res = runEval({ seed: Number(arg('--seed', DEFAULT_SEED)), splits });
  res.generatedAt = new Date().toISOString();
  const md = split === 'all'
    ? assembleReport(res, { h4: readJson(join(ROOT, 'docs/eval-H4-first-run.json')), h3: readJson(join(ROOT, 'docs/eval-H3-first-run.json')), first: readJson(join(ROOT, 'docs/eval-holdout-first-run.json')) })
    : toMarkdown(res);
  console.log(md);
  if (split === 'all') {
    mkdirSync(join(ROOT, 'docs'), { recursive: true });
    writeFileSync(join(ROOT, 'docs/eval-result.json'), JSON.stringify(res, null, 2) + '\n');
    writeFileSync(join(ROOT, 'docs/eval-result.md'), md);
    console.log('저장: docs/eval-result.json, docs/eval-result.md');
  }
}
