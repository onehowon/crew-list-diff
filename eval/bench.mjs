// 처리 시간 측정: 개발에 쓰지 않은 서식(H1·H2) 60쌍을 30회 반복해 명부 1쌍 대조·분류 시간을 잰다.
// 사용: node eval/bench.mjs   (문서 추출(AI)과 사람 확인 시간은 포함하지 않음)
import { generate } from './gen.mjs';
import { compareCrewLists } from '../lib/engine.js';

const pairs = generate().pairs.filter((p) => p.split === 'holdout');
for (let w = 0; w < 3; w++) for (const p of pairs) compareCrewLists(p);
const ts = [];
for (let r = 0; r < 30; r++) for (const p of pairs) { const t = performance.now(); compareCrewLists(p); ts.push(performance.now() - t); }
ts.sort((a, b) => a - b);
const crew = pairs.map((p) => p.rowPidsB.length);
console.log(`쌍 ${pairs.length} × 30회 = ${ts.length}회, 수정본 ${Math.min(...crew)}~${Math.max(...crew)}명`);
console.log(`중앙값 ${ts[ts.length >> 1].toFixed(2)}ms · p95 ${ts[Math.floor(ts.length * 0.95)].toFixed(2)}ms · 최대 ${ts.at(-1).toFixed(2)}ms · Node ${process.version}`);
