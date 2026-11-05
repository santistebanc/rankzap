// Captures the README and portfolio screenshots from the real app (npm run dev on :5180),
// with demo polls seeded over the poll server's own WebSocket protocol.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'file:///C:/Users/santi/code/career-desk/node_modules/playwright-core/index.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5180';
const WS = BASE.replace(/^http/, 'ws');
const OPTIONS = ['Morning walk', 'Write for 20 minutes', 'Coffee first', 'Stretch for 10 minutes', 'Big breakfast', 'Clear messages'];
const VOTERS = [
  ['Ava', [0, 1, 2, 3, 4, 5]],
  ['Diego', [1, 0, 3, 2, 5, 4]],
  ['Leo', [0, 2, 1, 4, 3, 5]],
  ['Mia', [3, 1, 0, 2, 4, 5]],
  ['Noah', [2, 0, 1, 3, 5, 4]],
];

function connect(id, query) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/api/polls/${id}/ws?${query}`);
    let n = 0, snapshot = null;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'snapshot') { snapshot = m.poll; if (!conn.ready) { conn.ready = true; resolve(conn); } }
      if (m.type === 'result') { const p = pending.get(m.id); pending.delete(m.id); m.ok ? p.res() : p.rej(new Error(m.error)); }
    };
    ws.onerror = reject;
    const conn = {
      ready: false,
      get poll() { return snapshot; },
      send: (action) => new Promise((res, rej) => { const id = ++n; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, action })); }),
      close: () => ws.close(),
    };
  });
}

async function seed({ colour, voters, state }) {
  const res = await fetch(`${BASE}/api/polls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ colour }) });
  const { id, hostKey } = await res.json();
  const host = await connect(id, `host=${hostKey}`);
  await host.send({ type: 'updateSettings', patch: { ballotTitle: 'Best morning ritual?' } });
  await host.send({ type: 'addOptions', texts: OPTIONS });
  await new Promise((r) => setTimeout(r, 200));
  const ids = OPTIONS.map((t) => host.poll.options.find((o) => o.text === t).id);
  for (const [name, order] of voters) {
    const v = await connect(id, `user=demo-${name.toLowerCase()}-${id}`);
    await v.send({ type: 'join', name, mode: 'idle' });
    await v.send({ type: 'vote', ranking: order.map((i) => ids[i]), newOptions: [], name });
    v.close();
  }
  if (state) await host.send({ type: 'setState', state });
  host.close();
  return { id, hostKey, ids };
}

const created = [];
const browser = await chromium.launch({ executablePath: 'C:/Users/santi/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true });
try {
  const ballot = await seed({ colour: 'yellow', voters: VOTERS.slice(0, 3) });
  const closed = await seed({ colour: 'cobalt', voters: VOTERS, state: 'closed' });
  const hosted = await seed({ colour: 'mint', voters: VOTERS.slice(0, 4) });
  created.push(ballot, closed, hosted);

  async function phone(id, { name, rank } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    await ctx.addInitScript(([id, name, rank]) => {
      localStorage.setItem('rankzap:vote:userId', 'demo-santi-' + id);
      if (name) localStorage.setItem('rankzap:vote:name', name);
      if (rank) localStorage.setItem(`rankzap:room:${id}:vote:rank`, JSON.stringify(rank));
    }, [id, name, rank]);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${id}`, { waitUntil: 'domcontentloaded' });
    await p.getByText("Voting as Santi").waitFor();
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);
    return { p, ctx };
  }

  // 1. Ballot, a voter mid-ranking.
  const b = await phone(ballot.id, { name: 'Santi', rank: [1, 5, 0, 4, 2, 3].map((i) => ballot.ids[i]) });
  const ballotPng = await b.p.screenshot();
  await b.ctx.close();

  // 2. Closed poll, a voter who took part.
  const c = await phone(closed.id, { name: 'Santi' });
  const closedPng = await c.p.screenshot();
  await c.ctx.close();

  // 3. Host view on a phone.
  const hctx = await browser.newContext({ viewport: { width: 390, height: 1000 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await hctx.addInitScript(([id, key]) => localStorage.setItem('rankzap:host:keys', JSON.stringify({ [id]: key })), [hosted.id, hosted.hostKey]);
  const h = await hctx.newPage();
  await h.goto(`${BASE}/${hosted.id}/admin`, { waitUntil: 'domcontentloaded' });
  await h.getByRole('textbox', { name: 'Poll question' }).waitFor();
  await h.evaluate(() => document.fonts.ready);
  await h.waitForTimeout(600);
  const hostPng = await h.screenshot();
  // Desktop host view.
  await h.setViewportSize({ width: 1280, height: 1000 });
  await h.waitForTimeout(400);
  // Show the public address instead of the local one.
  await h.evaluate(() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode()); ) n.nodeValue = n.nodeValue.replace(location.host, 'rankzap.site'); });
  const adminPng = await h.screenshot({ fullPage: true });
  await hctx.close();

  // Compose the three phone screens.
  const img = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
  const compose = (h) => page.setContent(`<!doctype html><style>
    body{margin:0;background:#f1efe8;color:#0b0b0b;font:700 18px Arial,sans-serif;padding:24px 31px;height:${h}px;box-sizing:border-box;overflow:hidden}
    main{display:grid;grid-template-columns:repeat(3,390px);gap:24px}figure{margin:0}figcaption{margin-bottom:12px}img{display:block;width:390px}</style>
    <main><figure><figcaption>Rank your favourites</figcaption><img src="${img(ballotPng)}"></figure>
    <figure><figcaption>See the result</figcaption><img src="${img(closedPng)}"></figure>
    <figure><figcaption>Host the poll</figcaption><img src="${img(hostPng)}"></figure></main>`);
  await page.setViewportSize({ width: 1280, height: 1081 });
  await compose(1081);
  await page.screenshot({ path: 'public/rankzap-screenshot.png' });
  await page.setViewportSize({ width: 1280, height: 960 });
  await compose(960);
  await page.screenshot({ path: process.env.PORTFOLIO_SHOT ?? 'C:/Users/santi/code/portfolio/public/rankzap-screenshot.png' });
  writeFileSync('public/rankzap-admin.png', adminPng);
  console.log('captured', created.map((c) => c.id).join(' '));
} finally {
  for (const { id, hostKey } of created) await fetch(`${BASE}/api/polls/${id}`, { method: 'DELETE', headers: { 'x-rankzap-host-key': hostKey } });
  await browser.close();
}
