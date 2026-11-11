// Showcase capture for Rankzap. Run from the repository root:
//   npm run build && node <project-showcase>/scripts/capture.mjs --config docs/media/capture.config.mjs --serve
// Flows create polls, so they run against the local preview server (the Worker included), never production.
import { seedPoll } from './seed.mjs';

const BASE = 'http://localhost:4173';
const FOOD = ['Ramen bar', 'Taco place', 'Pizza', 'Thai curry', 'Falafel'];
const VOTERS = [
  { name: 'Ana', ranking: ['Ramen bar', 'Thai curry', 'Falafel', 'Pizza', 'Taco place'] },
  { name: 'Ben', ranking: ['Thai curry', 'Ramen bar', 'Taco place', 'Pizza', 'Falafel'] },
  { name: 'Chen', ranking: ['Ramen bar', 'Falafel', 'Thai curry', 'Taco place', 'Pizza'] },
  { name: 'Dara', ranking: ['Falafel', 'Thai curry', 'Ramen bar', 'Pizza', 'Taco place'] },
  { name: 'Eli', ranking: ['Thai curry', 'Pizza', 'Ramen bar', 'Falafel', 'Taco place'] },
];

// One poll per shot or flow, so earlier captures do not change later ones.
const poll = (voters = VOTERS) => seedPoll(BASE, { question: 'Where should we eat on Friday?', colour: 'tomato', options: FOOD, voters });

/** Opens a poll as its host: the host key lives in this browser's localStorage. */
async function openAsHost(page, h, p) {
  await page.evaluate(({ id, hostKey }) => {
    localStorage.setItem('rankzap:host:keys', JSON.stringify({ [id]: hostKey }));
    localStorage.setItem('rankzap:admin:lastRoomId', id);
    localStorage.setItem('rankzap:admin:recentPolls', JSON.stringify([{ roomId: id, savedAt: Date.now() }]));
  }, p);
  await pollReady(page, h, `/${p.id}/admin`);
}

const ROWS = 'li[aria-label*=", rank "]';

/** Waits until the poll has connected and its content shows. */
async function pollReady(page, h, path) {
  await h.goto(path);
  await page.getByText(/where should we eat/i).first().waitFor({ timeout: 20000 });
  await h.pause(1500);
}

/** Drags the last ballot row above the first row (dnd-kit listens to pointer events). Voters see the options in a random order. */
async function dragLastToTop(page, h) {
  const from = page.locator(ROWS).last();
  const to = page.locator(ROWS).first();
  await h.hover(from);
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y + a.height / 2 - 12, { steps: 4 });
  await page.mouse.move(a.x + 20, b.y + 8, { steps: 30 });
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

export default {
  name: 'Rankzap',
  url: BASE,
  serve: { command: 'npx vite preview --port 4173 --strictPort', url: BASE, timeoutMs: 60000 },
  // The app has one light design. Each poll has its own colour.
  themes: ['light'],
  ready: (page) => page.locator('h1, main').first().waitFor({ timeout: 20000 }),
  shots: [
    {
      id: 'home', path: '/', viewports: ['desktop', 'mobile'],
      caption: 'Home: start a poll in a colour, or join one with a four-character code',
      before: async (page, h) => {
        await page.evaluate(() => localStorage.setItem('rankzap:home:colour', 'cobalt'));
        await h.goto('/');
      },
    },
    {
      id: 'ballot', path: '/', viewports: ['mobile'],
      caption: 'A voter ranks the options by dragging them, best at the top',
      before: async (page, h) => { const p = await poll(); await pollReady(page, h, `/${p.id}`); },
    },
    {
      id: 'host', path: '/', viewports: ['desktop'],
      caption: 'The host sees live scores, who voted, the share code and the scoring method',
      before: async (page, h) => { const p = await poll(); await openAsHost(page, h, p); },
    },
    {
      id: 'share', path: '/', viewports: ['desktop'],
      caption: 'A full-screen QR code lets a room join from their phones',
      before: async (page, h) => {
        const p = await poll([]);
        await openAsHost(page, h, p);
        await page.getByRole('button', { name: /show qr/i }).click();
        await h.pause(600);
      },
    },
  ],
  flows: [
    {
      id: 'rank-and-vote', path: '/', viewport: 'mobile', theme: 'light', hero: true,
      caption: 'Drag a favourite to the top, add a name, lock in the vote and see the live result',
      before: async (page, h) => { const p = await poll(); await pollReady(page, h, `/${p.id}`); },
      run: async (page, h) => {
        await h.pause(500);
        await dragLastToTop(page, h);
        await h.pause(400);
        await h.type(page.getByPlaceholder(/your name/i), 'Sam');
        await h.click(page.getByRole('button', { name: /lock it in/i }));
        await h.settle();
        await h.pause(2200);
      },
    },
    {
      id: 'host-live', path: '/', viewport: 'desktop', theme: 'light',
      caption: 'The host page updates live as each vote arrives',
      before: async (page, h) => { const p = await poll(VOTERS.slice(0, 1)); page.__poll = p; await openAsHost(page, h, p); },
      run: async (page, h) => {
        await h.pause(800);
        for (const voter of VOTERS.slice(1)) {
          await seedVote(page.__poll, voter);
          await h.pause(900);
        }
        await h.pause(1200);
      },
    },
  ],
};

/** Sends one more vote to an existing poll (as a new voter). */
async function seedVote(p, voter) {
  const userId = `showcase-live-${voter.name}-${Date.now()}`;
  const ws = new WebSocket(BASE.replace(/^http/, 'ws') + `/api/polls/${p.id}/ws?user=${userId}`);
  await new Promise((resolve, reject) => { ws.onmessage = () => resolve(); ws.onerror = reject; });
  const byText = Object.fromEntries(p.options.map((o) => [o.text, o.id]));
  ws.send(JSON.stringify({ id: 1, action: { type: 'join', name: voter.name, mode: 'idle' } }));
  ws.send(JSON.stringify({ id: 2, action: { type: 'vote', ranking: voter.ranking.map((t) => byText[t]), newOptions: [], name: voter.name } }));
  await new Promise((r) => setTimeout(r, 300));
  ws.close(1000);
}
