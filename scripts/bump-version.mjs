// 배포할 때 브라우저가 예전 파일을 캐시에서 쓰지 않도록 index.html·app.js의 ?v= 값을 바꾼다.
// 사용: node scripts/bump-version.mjs  (커밋 전에 실행)
import { readFileSync, writeFileSync } from 'node:fs';
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
for (const f of ['index.html', 'app.js']) {
  const s = readFileSync(f, 'utf8').replace(/\?v=[0-9a-z]+/g, `?v=${v}`);
  writeFileSync(f, s);
}
console.log('v=' + v);
