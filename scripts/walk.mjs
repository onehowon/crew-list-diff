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
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rail = async (label) => { console.log('rail', label, await ev(`(()=>{const b=document.querySelector('.rail-item[aria-label=${JSON.stringify(label)}]'); if(!b||!b.offsetParent) return 'none'; b.click(); return 'ok'})()`)); await sleep(400); };
const vtab = async (label) => ev(`(()=>{const b=[...document.querySelectorAll('.vh-tab')].find(x=>x.offsetParent&&x.innerText.trim()===${JSON.stringify(label)}); if(!b) return 'none'; b.click(); return 'ok'})()`);
// 왼쪽 아이콘 레일 전부
for (const n of ['평가 결과', '범위·근거', '입항 예정 선박']) { await rail(n); await state('rail-' + n.slice(0, 2)); }
// 목록의 배 행을 차례로 눌러 항차 탭 열기 → 화면 탭 전부 → 선원명부에서 결정까지
const rows = await ev(`document.querySelectorAll('[data-ship]').length`);
console.log('ship rows', rows);
if (rows < 5) { TOTAL++; console.log('배 목록이 5척 미만'); }
for (let r = 0; r < rows; r++) {
  await rail('입항 예정 선박');
  console.log('row', await ev(`(()=>{const x=document.querySelectorAll('[data-ship]')[${r}]; if(!x) return 'none'; x.click(); return x.dataset.ship})()`)); await sleep(500); await state('row-' + r);
  for (const tb of ['개요', '선원명부', '선사 문의', '신고 준비']) { const c = await vtab(tb); if (c === 'none') { TOTAL++; console.log('화면 탭 없음', tb); } await sleep(400); await state(`row-${r}-${tb}`); }
  await vtab('선원명부'); await sleep(300);
  for (const lbl of ['다음: 관련 신고·결정', '예상된 변경 모두 반영', '남은 항목 선사 문의', '다음', '확인 요청 보내기']) { const c = await click('/^' + esc(lbl) + '/'); if (c !== 'none') await sleep(400); }
  await state('row-' + r + '-flow');
}
// 열린 항차 탭: 전부 눌러 보고 하나 닫기
const tabs = await ev(`document.querySelectorAll('[data-vtab]').length`);
console.log('open tabs', tabs);
if (tabs !== rows) { TOTAL++; console.log('열린 항차 탭 수가 배 수와 다름'); }
for (let i = 0; i < tabs; i++) { await ev(`document.querySelectorAll('[data-vtab]')[${i}].click()`); await sleep(400); await state('vtab-' + i); }
await ev(`document.querySelector('[data-vtab-close]').click()`); await sleep(400); await state('vtab-closed');
// 오른쪽 메일함: 전체 메일을 하나씩 펼치고, 대조 버튼이 있으면 눌러 보기
await rail('입항 예정 선박');
const mails = await ev(`document.querySelectorAll('#mailbox .mb-row').length`);
console.log('mails', mails);
if (mails < 10) { TOTAL++; console.log('메일함 메일이 너무 적음'); }
for (let i = 0; i < mails; i++) {
  await rail('입항 예정 선박');
  console.log('mail', await ev(`(()=>{const x=document.querySelectorAll('#mailbox .mb-row')[${i}]; if(!x) return 'none'; x.click(); return x.dataset.mailid})()`)); await sleep(400);
  const opened = await ev(`!!document.querySelector('#mailbox .mb-open')`);
  if (!opened) { TOTAL++; console.log('메일 본문이 펼쳐지지 않음', i); }
  await state('mail-' + i);
  if ((await click('/^이 메일로 명부 대조/')) !== 'none') { await sleep(400); await state('mail-' + i + '-cmp'); }
}
// 메일 검색
await rail('입항 예정 선박');
await ev(`(()=>{const q=document.querySelector('#mailbox .mb-q'); q.value='회신'; q.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(300);
console.log('search 회신 →', await ev(`document.querySelectorAll('#mailbox .mb-row').length`));
await ev(`(()=>{const q=document.querySelector('#mailbox .mb-q'); q.value=''; q.dispatchEvent(new Event('input',{bubbles:true}))})()`);
// 시연 끝까지
await send('Page.navigate', { url: BASE }); for (let i = 0; i < 100; i++) { await sleep(100); if (await ev(`document.documentElement.dataset.ready==='1'`)) break; }
await click('/^시연 시작$/'); await sleep(500); await state('demo-1');
let k = 2; for (; k <= 9; k++) { if ((await click('/^다음$/')) === 'none') break; await sleep(500); await state('demo-' + k); }
if (k < 8) { TOTAL++; console.log('시연이 끝까지 가지 않음', k); }
if ((await click('/^시연 끝내기$/')) === 'none') { TOTAL++; console.log('시연 끝내기 없음'); } else { await sleep(400); await state('demo-end'); }
// 모바일: 아래 탭 막대 + 항차의 '메일' 탭
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE + '?voyage=hanbit' }); for (let i = 0; i < 100; i++) { await sleep(100); if (await ev(`document.documentElement.dataset.ready==='1'`)) break; }
await state('m-overview');
if ((await vtab('메일')) === 'none') { TOTAL++; console.log('모바일 메일 탭 없음'); }
await sleep(400); await state('m-mail');
await ev(`document.querySelector('#pg-mail .mb-row')?.click()`); await sleep(400); await state('m-mail-open');
for (const n of ['평가 결과', '범위·근거', '입항 예정 선박']) { await rail(n); await state('m-rail-' + n.slice(0, 2)); }
chrome.kill();
console.log(TOTAL ? `오류 ${TOTAL}건` : '오류 0건'); process.exit(TOTAL ? 1 : 0);
