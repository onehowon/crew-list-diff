// 안전 동작 점검(성능 지표 아님): 현재 엔진이 판독 실패 명부를 '변경 없음'처럼 통과시키지 않는지 확인한다.
// H4 1회차 이후 추가한 문서 단위 차단의 동작만 센다. H4 성능 수치는 docs/eval-H4-first-run.* 가 원본이며 다시 계산하지 않는다.
import { generateH4, generateH3, H4_SEED, H3_SEED } from './gen.mjs';
import { compareCrewLists } from '../lib/engine.js';

for (const [name, ds] of [['H3', generateH3(H3_SEED)], ['H4', generateH4(H4_SEED)]]) {
  const pairs = ds.pairs || ds;
  let blocked = 0, silent = 0;
  for (const p of pairs) {
    const r = compareCrewLists({ a: p.a ?? p.before ?? p.textA, b: p.b ?? p.after ?? p.textB, mail: p.mail ?? '' });
    const unreadable = !r.A.ok || !r.B.ok || !r.A.rows.length || !r.B.rows.length;
    if (r.blocked) blocked++;
    else if (unreadable) silent++;
  }
  console.log(`${name}: 쌍 ${pairs.length} · 판독 실패로 차단 ${blocked} · 판독 실패인데 통과(조용한 실패) ${silent}`);
}
