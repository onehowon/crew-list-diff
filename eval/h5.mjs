// 새 시험 H5: 새 시드로 만든 홀드아웃 60쌍을 고정된 엔진으로 한 번만 잰다(eval/H5-spec.md).
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEval, finalMarkdown } from './run.mjs';

export const H5_SEED = 20261205;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(ROOT, 'docs/eval-H5-first-run.json');
if (existsSync(out)) { console.error('H5 1회차 결과가 이미 있습니다(재실행 금지): docs/eval-H5-first-run.json'); process.exit(2); }
const res = runEval({ seed: H5_SEED, splits: ['holdout'], withMailBaseline: true, scoreBlocked: true });
res.generatedAt = new Date().toISOString();
res.note = 'H5 1회차: 새 시드 20261205, 엔진 커밋 fc115c6 고정, 결과를 본 뒤 코드 수정 없음';
writeFileSync(out, JSON.stringify(res, null, 2) + '\n');
const md = finalMarkdown(res).replace('# 제출 버전 재측정 (합성 데이터, 참고값)', '# 새 시험 H5 1회차 (새 시드 20261205, 처음 보는 사례 · 이미 본 양식 종류)').replace(/- 지금 코드로 세 홀드아웃을 다시 잰 값이다\.[^\n]*\n/, '- 엔진 커밋 fc115c6을 고정한 뒤 한 번만 실행한 값이다. 결과를 본 뒤 코드를 고치지 않았다.\n');
writeFileSync(join(ROOT, 'docs/eval-H5-first-run.md'), md);
console.log(md);
