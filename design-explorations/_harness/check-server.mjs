// End-to-end check of the own poll server: desktop host + phone voter over the HTTPS Tailscale link.
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/user/code/career-desk/node_modules/playwright-core/index.mjs';

const ADMIN_BASE = 'http://127.0.0.1:5180';
const PHONE_BASE = process.env.PHONE_BASE ?? 'https://laptop.example.ts.net:8443';
const browser = await chromium.launch({ executablePath: 'C:/Users/user/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true });
const admin = await browser.newPage({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
admin.setDefaultTimeout(15000);
const errors = [];
admin.on('pageerror', (e) => errors.push('admin: ' + e.message));
let roomId;
try {
  await admin.goto(ADMIN_BASE + '/', { waitUntil: 'domcontentloaded' });
  await admin.getByRole('radio', { name: 'Cobalt', exact: true }).click();
  await admin.getByRole('button', { name: 'Start a poll', exact: true }).click();
  await admin.waitForURL(/\/[A-Z0-9]{4}\/admin$/, { timeout: 20000 });
  roomId = new URL(admin.url()).pathname.split('/')[1];
  console.log('created poll ' + roomId);

  const title = admin.getByRole('textbox', { name: 'Poll question' });
  await title.fill('Where do we eat?');
  await title.press('Enter');
  for (const text of ['Tacos', 'Ramen']) {
    await admin.getByRole('textbox', { name: 'Add an option', exact: true }).fill(text);
    await admin.getByRole('button', { name: 'Add', exact: true }).click();
    await admin.getByRole('textbox', { name: `Edit option: ${text}`, exact: true }).waitFor();
  }
  console.log('PASS host: question and two options saved');

  // Phone voter, over HTTPS.
  const voterCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const voter = await voterCtx.newPage();
  voter.setDefaultTimeout(15000);
  voter.on('pageerror', (e) => errors.push('voter: ' + e.message));
  const sockets = [];
  voter.on('websocket', (ws) => { const u = new URL(ws.url()); if (u.pathname.startsWith('/api/polls/')) sockets.push(u); });

  // A voter can't open the admin page.
  await voter.goto(PHONE_BASE + '/' + roomId + '/admin', { waitUntil: 'domcontentloaded' });
  await voter.getByRole('heading', { name: 'Not your poll.' }).waitFor();
  console.log('PASS admin page refuses a browser without the host key');

  await voter.goto(PHONE_BASE + '/' + roomId, { waitUntil: 'domcontentloaded' });
  await voter.getByRole('heading', { name: 'Where do we eat?' }).waitFor();
  assert.equal(await voter.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sig').trim()), '#2d4bff');
  // Straight to the ballot: no name screen.
  await voter.getByRole('button', { name: 'Lock it in', exact: true }).waitFor();
  console.log('PASS voter lands straight on the ballot');
  assert.ok(sockets.length > 0 && sockets.every((u) => u.protocol === 'wss:' && u.host === new URL(PHONE_BASE).host));
  console.log('PASS phone connects with WSS through the HTTPS link');

  // The host sees the voter arrive under a placeholder name until they name themselves.
  await admin.getByRole('button', { name: /^Voter [0-9]+/ }).waitFor();
  console.log('PASS presence: host sees the unnamed voter');

  // Voter adds an option; it is saved with the vote.
  await voter.getByRole('textbox', { name: 'Add an option' }).fill('Pizza');
  await voter.getByRole('textbox', { name: 'Add an option' }).press('Enter');
  await voter.getByText('Pizza', { exact: true }).waitFor();
  await voter.getByRole('textbox', { name: /Your name/ }).fill('QA voter');
  await voter.getByRole('button', { name: 'Lock it in', exact: true }).click();
  await voter.getByRole('heading', { name: "You're in.", exact: true }).waitFor();
  await admin.getByRole('button', { name: /QA voter/ }).waitFor();
  await voter.getByText('Voting as QA voter').waitFor();
  console.log('PASS name: typed above Lock it in, saved with the vote, shown to the host');
  await admin.getByText('Open · 1 vote', { exact: true }).waitFor();
  await admin.getByRole('textbox', { name: 'Edit option: Pizza', exact: true }).waitFor();
  console.log('PASS vote: saved, host count updates, voter-added option appears for the host');

  // Host changes colour and closes; voter follows live.
  await admin.getByRole('radio', { name: 'Mint', exact: true }).click();
  await voter.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--sig').trim() === '#2fdc8e');
  await admin.getByRole('button', { name: 'Close poll', exact: true }).click();
  await admin.getByRole('button', { name: 'Yes, close', exact: true }).click();
  await voter.getByText(/Poll closed · 1 vote/).waitFor();
  console.log('PASS live: colour change and closing reach the voter');

  // A reload keeps everything (stored in the Durable Object).
  await voter.reload({ waitUntil: 'domcontentloaded' });
  await voter.getByText(/Poll closed · 1 vote/).waitFor();
  console.log('PASS persistence: state survives a reload');
  await voterCtx.close();
} finally {
  if (roomId) {
    await admin.goto(ADMIN_BASE + '/', { waitUntil: 'domcontentloaded' });
    await admin.getByRole('button', { name: `Delete poll ${roomId}`, exact: true }).click();
    await admin.getByRole('button', { name: 'Yes, delete', exact: true }).click();
    await admin.getByRole('button', { name: `Delete poll ${roomId}`, exact: true }).waitFor({ state: 'detached' });
    const res = await fetch(`${ADMIN_BASE}/api/polls/${roomId}`);
    assert.equal(res.status, 404);
    console.log('PASS delete: poll removed from Home and from the server');
  }
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
  await browser.close();
}
