// 단계별 스크린샷 + 콘솔 오류·잘림 검사 (Chrome DevTools 프로토콜, 외부 패키지 없음. Node 22 이상)
// 사용: python3 -m http.server 8810 &
//       node scripts/shoot.mjs http://localhost:8810/ docs/screens
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8810/';
const OUT = process.argv[3] || 'docs/screens';
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;

const SCENES = [
  { name: '1-input', q: 'step=1&scenario=1' },
  { name: '1-normalized', q: 'step=1&scenario=1&run=1' },
  { name: '2-crew-change', q: 'step=2&scenario=1&item=C003', mobile: true },
  { name: '2-errors', q: 'step=2&scenario=2&item=C001', mobile: true },
  { name: '2-hard-negative', q: 'step=2&scenario=2&item=C005' },
  { name: '2-unreflected', q: 'step=2&scenario=3&item=C007' },
  { name: '3-impact-approve', q: 'step=3&scenario=2&decide=auto' },
  { name: '4-confirmation', q: 'step=4&scenario=3&decide=auto&sign=verify&at=2026-11-02T09:30:00%2B09:00' },
  { name: '4-tamper', q: 'step=4&scenario=3&decide=auto&sign=tamper&at=2026-11-02T09:30:00%2B09:00' },
  { name: 'eval', q: 'tab=eval', mobile: true },
  { name: 'scope', q: 'tab=scope' },
];
const VIEWPORTS = [
  { tag: '1440', width: 1440, height: 900 },
  { tag: '1280', width: 1280, height: 800 },
];
const MOBILE = { tag: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const SHOTS = [
  ...SCENES.flatMap((s) => VIEWPORTS.map((v) => ({ ...s, file: `${s.name}-${v.tag}.png`, vp: v }))),
  ...SCENES.filter((s) => s.mobile).map((s) => ({ ...s, file: `${s.name}-mobile.png`, vp: MOBILE })),
].filter((s) => !ONLY || s.file.includes(ONLY));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 잘림 검사: 가로 넘침, 화면 밖으로 나간 요소, 가로 스크롤이 필요한 표, 글자가 잘린 버튼·라벨(데스크톱 기준)
const LAYOUT_CHECK = `(() => {
  const out = [];
  const W = innerWidth;
  const desktop = W >= 1200;
  if (document.documentElement.scrollWidth > W + 1) out.push('페이지 가로 넘침 ' + (document.documentElement.scrollWidth - W) + 'px');
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  let off = 0;
  for (const el of document.querySelectorAll('main *, header *')) {
    if (!visible(el) || el.closest('.table-wrap, pre, textarea, .mail-view, details:not([open])')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && off++ < 5) out.push('화면 밖: ' + el.tagName.toLowerCase() + '.' + [...el.classList].join('.') + ' 「' + (el.textContent || '').trim().slice(0, 20) + '」 ' + Math.round(r.right - W) + 'px');
  }
  if (desktop) {
    for (const t of document.querySelectorAll('.table-wrap')) {
      if (!visible(t) || t.closest('details')) continue;
      if (t.scrollWidth > t.clientWidth + 1) out.push('표 가로 잘림(스크롤 필요) ' + (t.scrollWidth - t.clientWidth) + 'px: ' + (t.querySelector('th')?.textContent || '').slice(0, 15));
    }
  }
  for (const el of document.querySelectorAll('.btn, .cls, .chip, .Label, .top-tab, .stepper .st-title')) {
    if (!visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) out.push('글자 잘림 「' + el.textContent.trim().slice(0, 20) + '」');
  }
  return out;
})()`;

async function openTab(errors, label) {
  const t = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(`${label}: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(`${label}: console.${m.params.type} ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) errors.push(`${label}: ${m.params.entry.level} ${m.params.entry.text} ${m.params.entry.url || ''}`);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) errors.push(`${label}: 검사 스크립트 오류 ${r.result.exceptionDetails.exception?.description}`);
    return r.result?.result?.value;
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  return { send, evaluate, close: async () => { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`).catch(() => {}); } };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shoot-'))}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 50 && !ver; i++) { await sleep(200); ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null); }
  const errors = [];
  const problems = [];
  try {
    for (const shot of SHOTS) {
      const tab = await openTab(errors, shot.file);
      const v = shot.vp;
      await tab.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor || 1, mobile: !!v.mobile });
      await tab.send('Page.navigate', { url: `${BASE}?${shot.q}` });
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(100); ready = await tab.evaluate(`document.documentElement.dataset.ready === '1' && document.fonts.status === 'loaded'`); }
      if (!ready) errors.push(`${shot.file}: 준비 신호 없음`);
      await sleep(300);
      for (const x of (await tab.evaluate(LAYOUT_CHECK)) || []) problems.push(`${shot.file}: ${x}`);
      const m = await tab.send('Page.getLayoutMetrics');
      const H = Math.ceil(m.result.cssContentSize.height);
      const png = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: v.width, height: Math.min(H, 6000), scale: 1 } });
      writeFileSync(join(OUT, shot.file), Buffer.from(png.result.data, 'base64'));
      await tab.close();
      console.log('saved', join(OUT, shot.file), `${v.width}x${Math.min(H, 6000)}`);
    }
  } finally {
    chrome.kill();
  }
  console.log(errors.length ? `콘솔 오류 ${errors.length}건\n${[...new Set(errors)].join('\n')}` : '콘솔 오류 0건');
  console.log(problems.length ? `잘림·겹침 ${problems.length}건\n${[...new Set(problems)].join('\n')}` : '잘림·겹침 0건');
  process.exitCode = errors.length || problems.length ? 1 : 0;
}
main();
