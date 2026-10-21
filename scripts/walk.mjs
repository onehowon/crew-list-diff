// 클릭 점검: 메뉴·배 목록·시연을 실제로 눌러 가며 화면이 비는지, 오류가 나는지 확인(주소로 바로 여는 shoot.mjs가 못 잡는 경로)
// 사용: node scripts/walk.mjs http://localhost:8810/ <스크린샷 폴더>
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.argv[2] || 'http://localhost:8810/'; const OUT = process.argv[3] || 'docs/walk'; (await import('node:fs')).mkdirSync(OUT, { recursive: true });
const PORT = 9341; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'walk-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let ver; for (let i = 0; i < 50 && !ver; i++) { await sleep(200); ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null); }
const t = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(); const errs = []; let TOTAL = 0;
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error ' + m.params.args.map((a) => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
for (let i = 0; i < 100; i++) { await sleep(100); if (await ev(`document.documentElement.dataset.ready==='1'`)) break; }
const state = async (tag) => {
  const s = await ev(`(()=>{const m=document.querySelector('main')||document.body; const txt=(m.innerText||'').trim(); const bar=document.querySelector('[class*=demo]'); return {len: txt.length, head: txt.slice(0,80).replace(/\\n/g,' / '), active: document.querySelector('[aria-current=page], .active')?.innerText?.split('\\n')[0]}})()`);
  if (errs.length || s.len < 80) TOTAL++;
  console.log(tag, JSON.stringify(s), errs.length ? 'ERR ' + errs.splice(0).join(' | ') : '', s.len < 80 ? '본문 비어 있음' : '');
  const png = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, tag + '.png'), Buffer.from(png.result.data, 'base64'));
};
const click = async (re) => ev(`(()=>{const b=[...document.querySelectorAll('button,a')].filter(x=>x.offsetParent&&${re}.test(x.innerText.trim())); if(!b.length) return 'none'; b[0].click(); return b[0].innerText.trim();})()`);
await state('00-start');
const navs = ['② 선박·항차 상세','③ 수정본 대조','④ 선사 문의','⑤ 신고 준비','평가 결과','범위·법령 근거','① 입항 예정 선박'];
for (const n of navs) { console.log('nav', await ev(`(()=>{const b=[...document.querySelectorAll('.nav-item')].find(x=>x.innerText.includes(${JSON.stringify(n)})); if(!b) return 'none'; b.click(); return 'ok'})()`)); await sleep(500); await state('nav-'+n.slice(0,4)); }
// 목록의 배 행을 차례로 눌러 보기
const rows = await ev(`document.querySelectorAll('[data-ship]').length`);
console.log('ship rows', rows);
for (let r = 0; r < rows; r++) {
  await ev(`(()=>{const b=[...document.querySelectorAll('.nav-item')].find(x=>x.innerText.includes('입항 예정 선박')); b&&b.click()})()`); await sleep(300);
  console.log('row', await ev(`(()=>{const x=document.querySelectorAll('[data-ship]')[${r}]; if(!x) return 'none'; x.click(); return x.dataset.ship})()`)); await sleep(500); await state('row-'+r);
  // 상세에서 대조 열기 → 결정 일괄 → 다음 끝까지
  for (const lbl of ['수정본 대조 열기','다음: 변경 대조','예상된 변경 모두 반영','남은 항목 선사 문의','다음: 관련 신고·결정','다음']) { const c = await click('/^'+lbl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/'); if (c!=='none') { await sleep(400); } }
  await state('row-'+r+'-flow');
}
// 시연 끝까지
await send('Page.navigate', { url: BASE }); for (let i = 0; i < 100; i++) { await sleep(100); if (await ev(`document.documentElement.dataset.ready==='1'`)) break; }
await click('/^시연 시작$/'); await sleep(500); await state('demo-1');
for (let k = 2; k <= 8; k++) { if ((await click('/^다음$/')) === 'none') break; await sleep(500); await state('demo-' + k); }
chrome.kill();
console.log(TOTAL ? `오류 ${TOTAL}건` : '오류 0건'); process.exit(TOTAL ? 1 : 0);
