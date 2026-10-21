// 메일 지시 해석 채점: 규칙 파서(lib/notice.js)와 LLM 추출 결과를 같은 정답·같은 방식으로 매긴다.
// 사용: node eval/mail-challenge/score.mjs [LLM 결과 JSON ...]
//   LLM 결과는 prompt.md 출력 형식({id, instructions:[...]})의 배열(파일 여러 개면 합침).
// 결과는 docs/mail-challenge-result.{json,md}에 저장한다. 수치는 손으로 고치지 않는다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from '../../data/scenarios.js';
import { parseCrewList } from '../../lib/parse.js';
import { parseNotice } from '../../lib/notice.js';
import { normValue, nameKey, findRanks, normRank } from '../../lib/normalize.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const mails = JSON.parse(readFileSync(join(HERE, 'mails.json'), 'utf8'));
const labels = new Map(JSON.parse(readFileSync(join(HERE, 'labels.json'), 'utf8')).map((l) => [l.id, l]));
const persons = parseCrewList(SCENARIOS[1].a, 'A').rows;

const pkey = (name) => nameKey(String(name ?? '').replace(/[.,]/g, ' '), '');
function nval(field, value) {
  if (value == null || value === '') return '';
  if (field === 'rank') return normRank(findRanks(String(value)).at(-1)?.canon || String(value));
  const v = normValue(field, String(value), { order: 'DMY' });
  return v.status === 'ok' ? String(v.value) : String(value).trim().toUpperCase();
}
// 지시 하나를 비교용 키로: 승선·하선은 사람만, 정정·직급 변경은 사람·항목·값
function key(d) {
  const t = d.type, p = pkey(d.person);
  if (t === 'sign_on' || t === 'sign_off') return `${t}|${p}`;
  const f = t === 'rank_change' ? 'rank' : d.field;
  return `${t === 'rank_change' ? 'correction' : t}|${p}|${f}|${nval(f, d.value)}`;
}
// 직급 변경과 직급 정정은 같은 효과로 본다(둘 다 rank 값을 바꿈)

// 규칙 파서 출력 → 같은 형식
function ruleParse(mail) {
  const { directives } = parseNotice(mail.text, persons, { dateOrder: 'DMY' });
  return directives.map((d) => ({ type: d.type, person: d.personKeys[0] || d.nameInText || '', field: d.type === 'rank_change' ? 'rank' : d.field, value: d.type === 'sign_on' ? null : d.value, apply: true, evidence: d.text }));
}

function scoreRun(name, predsById, { evidenceCheck = false } = {}) {
  const agg = { mails: 0, gold: 0, pred: 0, tp: 0, fp: 0, fn: 0, trapApplied: 0, trapTotal: 0, byTrap: {}, evidenceDropped: 0, failures: [] };
  for (const m of mails) {
    const gold = labels.get(m.id);
    if (!gold) continue;
    agg.mails++;
    let preds = (predsById.get(m.id) || []).filter((d) => d.apply);
    if (evidenceCheck) {
      // 근거 검사: 근거 문장이 메일에 글자 그대로 있어야 하고, 값이 있으면 근거 문장 안에 있어야 함(표기 차이 허용 없음)
      const before = preds.length;
      preds = preds.filter((d) => d.evidence && m.text.includes(d.evidence.trim()) && (d.value == null || d.type === 'sign_on' || d.evidence.toUpperCase().replace(/\s+/g, '').includes(String(d.value).toUpperCase().replace(/\s+/g, '')) || d.field === 'dob' || d.field === 'idExpiry' || d.field === 'rank' || d.field === 'nationality' || d.field === 'idIssuer'));
      agg.evidenceDropped += before - preds.length;
    }
    const goldKeys = new Set(gold.apply.map(key));
    const trapKeys = new Map(gold.traps.map((t) => [key({ type: t.type || (t.field ? 'correction' : 'sign_on'), ...t }), t.category]));
    const trapKeysLoose = new Map(gold.traps.map((t) => [`${pkey(t.person)}|${t.field || ''}`, t.category]));
    const predKeys = new Set(preds.map(key));
    agg.gold += goldKeys.size; agg.pred += predKeys.size;
    for (const k of predKeys) {
      if (goldKeys.has(k)) agg.tp++;
      else {
        agg.fp++;
        const [, p, f] = k.split('|');
        const cat = trapKeys.get(k) || (!goldKeys.has(k) && trapKeysLoose.get(`${p}|${f || ''}`));
        if (cat) { agg.trapApplied++; agg.byTrap[cat] = agg.byTrap[cat] || { total: 0, applied: 0 }; agg.byTrap[cat].applied++; agg.failures.push(`${m.id} 함정(${cat})을 반영으로 읽음: ${k}`); }
        else agg.failures.push(`${m.id} 정답에 없는 지시: ${k}`);
      }
    }
    for (const k of goldKeys) if (!predKeys.has(k)) { agg.fn++; agg.failures.push(`${m.id} 놓친 지시: ${k}`); }
    for (const t of gold.traps) { agg.trapTotal++; agg.byTrap[t.category] = agg.byTrap[t.category] || { total: 0, applied: 0 }; agg.byTrap[t.category].total++; }
  }
  const pct = (a, b) => (b ? a / b : null);
  return { name, ...agg, precision: pct(agg.tp, agg.tp + agg.fp), recall: pct(agg.tp, agg.gold), failures: agg.failures.slice(0, 60), failureCount: agg.failures.length };
}

const rule = new Map(mails.map((m) => [m.id, ruleParse(m)]));
const runs = [scoreRun('규칙 파서', rule)];
const llmFiles = process.argv.slice(2);
let llmMeta = null;
if (llmFiles.length) {
  const all = llmFiles.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
  const meta = all.filter((x) => x.meta).map((x) => x.meta);
  llmMeta = meta[0] || null;
  const llm = new Map(all.filter((x) => x.id).map((x) => [x.id, x.instructions || []]));
  const missing = mails.filter((m) => !llm.has(m.id)).map((m) => m.id);
  if (missing.length) console.error(`LLM 결과 없는 메일 ${missing.length}통: ${missing.slice(0, 10).join(', ')}`);
  runs.push(scoreRun('LLM', llm));
  runs.push(scoreRun('LLM + 근거 검사', llm, { evidenceCheck: true }));
}

const P = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const L = ['# 메일 지시 해석 시험 결과', ''];
L.push(`- 시험지: eval/mail-challenge/mails.json ${mails.length}통, 정답 labels.json(반영할 지시 ${runs[0].gold}개, 함정 ${runs[0].trapTotal}개). 명세 SPEC.md.`);
L.push('- 함정을 반영으로 읽음 = 하지 말라·취소·조건부·인용 등 **반영하면 안 되는 문장을 지시로 읽은 수**. 이 경우 오류가 "예상된 변경"으로 덮일 수 있어 가장 위험하다.');
if (llmMeta) L.push(`- LLM 실행: ${llmMeta.runner}, 모델 ${llmMeta.model}, 프롬프트 eval/mail-challenge/prompt.md, 실행 ${llmMeta.at}. ${llmMeta.note || ''}`);
L.push('');
L.push('| 지표 | ' + runs.map((r) => r.name).join(' | ') + ' |', '|---' + '|---'.repeat(runs.length) + '|');
const row = (k, f) => L.push(`| ${k} | ${runs.map(f).join(' | ')} |`);
row('반영할 지시 재현율 (맞힘/전체)', (r) => `${P(r.recall)} (${r.tp}/${r.gold})`);
row('정밀도 (맞힘/낸 지시)', (r) => `${P(r.precision)} (${r.tp}/${r.tp + r.fp})`);
row('**함정을 반영으로 읽음**', (r) => `**${r.trapApplied}** / ${r.trapTotal}`);
row('근거 검사로 뺀 지시', (r) => String(r.evidenceDropped));
L.push('', '함정 종류별(반영으로 읽음 / 전체)', '');
const cats = [...new Set(runs.flatMap((r) => Object.keys(r.byTrap)))].sort();
L.push('| 함정 | ' + runs.map((r) => r.name).join(' | ') + ' |', '|---' + '|---'.repeat(runs.length) + '|');
for (const c of cats) L.push(`| ${c} | ${runs.map((r) => `${r.byTrap[c]?.applied || 0} / ${r.byTrap[c]?.total || 0}`).join(' | ')} |`);
for (const r of runs) { L.push('', `### ${r.name} 실패 사례(앞 ${Math.min(60, r.failureCount)}건 / 전체 ${r.failureCount}건)`, ''); for (const f of r.failures) L.push(`- ${f}`); }
const md = L.join('\n') + '\n';
console.log(md);
if (process.argv.includes('--save') || llmFiles.length) {
  writeFileSync(join(ROOT, 'docs/mail-challenge-result.json'), JSON.stringify({ runs, llmMeta, generatedAt: new Date().toISOString() }, null, 2) + '\n');
  writeFileSync(join(ROOT, 'docs/mail-challenge-result.md'), md);
}
