// AI가 메일 지시를 놓치면 어떻게 되나: 새 시험 H5 60쌍에서 메일 지시를 지운 채 엔진을 돌려 비교한다.
//  (가) 메일 지시를 전부 놓침(최악) (나) 쌍마다 첫 지시 한 줄만 놓침
// 메일 지시를 놓치는 것은 메일에서 그 줄을 지우는 것과 같다(엔진이 그 지시를 모름). 엔진·데이터는 바꾸지 않는다.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from './gen.mjs';
import { compareCrewLists } from '../lib/engine.js';
import { engineItemKey } from './run.mjs';
import { H5_SEED } from './h5-seed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pairs = generate(H5_SEED).pairs.filter((p) => p.split === 'holdout');

function directiveLines(pair) {
  const r = compareCrewLists(pair);
  return [...new Set(r.directives.map((d) => d.line))].sort((a, b) => a - b);
}
function dropLines(mail, lines) {
  const set = new Set(lines);
  return mail.split('\n').map((l, i) => (set.has(i + 1) ? '' : l)).join('\n');
}
function score(cond) {
  const agg = { requested: 0, reqExpected: 0, reqShownForReview: 0, reqMissed: 0, unreflected: 0, unreflectedCaught: 0, otherErrors: 0, otherErrorsCaught: 0, errorsAsExpected: 0, review: 0 };
  for (const pair of pairs) {
    const lines = directiveLines(pair);
    const mail = cond === 'normal' ? pair.mail : cond === 'all' ? dropLines(pair.mail, lines) : dropLines(pair.mail, lines.slice(0, 1));
    const r = compareCrewLists({ a: pair.a, b: pair.b, mail });
    const byKey = new Map(r.items.map((it) => [engineItemKey(pair, it), it]));
    agg.review += r.items.filter((it) => it.class !== 'expected').length;
    for (const l of pair.labels) {
      const it = byKey.get(l.key);
      if (l.truth === 'expected') {
        agg.requested++;
        if (!it) agg.reqMissed++; else if (it.class === 'expected') agg.reqExpected++; else agg.reqShownForReview++;
      } else if (l.truth === 'suspect') {
        if (l.rule === 'R8') { agg.unreflected++; if (it && it.class === 'suspect') agg.unreflectedCaught++; }
        else { agg.otherErrors++; if (it && it.class !== 'expected') agg.otherErrorsCaught++; if (it && it.class === 'expected') agg.errorsAsExpected++; }
      }
    }
  }
  return agg;
}
const res = { seed: H5_SEED, pairs: pairs.length, normal: score('normal'), oneMissed: score('one'), allMissed: score('all') };
const L = ['# AI가 메일 지시를 놓치면 (새 시험 H5 60쌍)', '', '| 지표 | 정상 | 쌍마다 지시 1줄 놓침 | 지시 전부 놓침(최악) |', '|---|---|---|---|'];
const row = (k, f) => L.push(`| ${k} | ${f(res.normal)} | ${f(res.oneMissed)} | ${f(res.allMissed)} |`);
row('메일로 요청한 변경: 예상된 변경으로 표시', (a) => `${a.reqExpected} / ${a.requested}`);
row('메일로 요청한 변경: 확인 필요·오류 의심으로 담당자에게', (a) => `${a.reqShownForReview} / ${a.requested}`);
row('메일로 요청한 변경: 화면에서 사라짐', (a) => `${a.reqMissed} / ${a.requested}`);
row('명부 자체의 오류(일·월 뒤바뀜 등)를 잡음', (a) => `${a.otherErrorsCaught} / ${a.otherErrors}`);
row('오류가 예상된 변경으로 덮임', (a) => `${a.errorsAsExpected}`);
row('**요청이 수정본에 빠진 오류를 잡음**', (a) => `**${a.unreflectedCaught} / ${a.unreflected}**`);
row('담당자가 하나씩 볼 항목(합계)', (a) => `${a.review}`);
L.push('', '- 메일 지시를 놓치면 그 변경은 "예상된 변경"이 아니라 담당자가 볼 항목으로 넘어갈 뿐 사라지지 않는다. 오류가 정상 변경으로 덮이지도 않는다.', '- 단, "메일로 요청했는데 수정본에 빠진 오류"는 메일 지시를 읽어야만 찾을 수 있어, 지시를 놓친 만큼 함께 놓친다.', '- 어느 경우에도 자동 확정은 없다. 모든 항목은 담당자가 반영·유지·선사 문의를 정해야 확정된다.');
writeFileSync(join(ROOT, 'docs/ablation-mail-miss.json'), JSON.stringify(res, null, 2) + '\n');
writeFileSync(join(ROOT, 'docs/ablation-mail-miss.md'), L.join('\n') + '\n');
console.log(L.join('\n'));
