import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/user/code/career-desk/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({ executablePath: 'C:/Users/user/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce', permissions:['clipboard-read','clipboard-write'] });
const page = await context.newPage();
const errors = [];
if (process.env.CHECK_ONLY) { await page.route('https://fonts.googleapis.com/**', r => r.abort()); page.screenshot = async () => Buffer.alloc(0); }
await page.addInitScript(() => { window.__browserErrors = []; window.addEventListener('error', e => window.__browserErrors.push(e.message)); });
page.on('pageerror', e => errors.push(e.message));
const go = async (query='') => { errors.push(...await page.evaluate(()=>window.__browserErrors ?? [])); await page.goto('http://127.0.0.1:5190/admin.html'+query, { waitUntil: 'domcontentloaded' }); await page.getByRole('textbox',{name:'Poll question'}).waitFor(); await page.evaluate(()=>Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])); };
const value = key => page.evaluate(key=>window.__fakeValues[key], key);
const hasOverflow = () => page.evaluate(()=>document.documentElement.scrollWidth > innerWidth);
try {
 await go();
 const title = page.getByRole('textbox',{name:'Poll question'});
 await title.fill('Lunch on Friday?'); await title.press('Enter');
 assert.equal((await value('settings')).ballotTitle,'Lunch on Friday?');
 await title.fill('Do not save this'); await title.press('Escape');
 assert.equal((await value('settings')).ballotTitle,'Lunch on Friday?');
 assert.equal(await title.inputValue(),'Lunch on Friday?');
 await page.getByRole('button',{name:'Dowdall',exact:true}).click();
 assert.equal((await value('settings')).tallyMode,'dowdall');
 const toggle = page.getByRole('switch',{name:'Allow voters to add options',exact:true});
 await toggle.click(); assert.equal((await value('settings')).allowAdd,false);
 await page.getByRole('radio',{name:'Cobalt',exact:true}).click();
 assert.equal((await value('settings')).colour,'cobalt');
 const add = page.getByRole('textbox',{name:'Add an option',exact:true});
 await add.fill('Tea outside'); await page.getByRole('button',{name:'Add',exact:true}).click();
 await page.getByRole('textbox',{name:'Edit option: Tea outside',exact:true}).waitFor();
 await page.getByRole('button',{name:'Remove Tea outside',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Edit option: Tea outside',exact:true}).count(),0);
 await page.getByRole('button',{name:/Ava/}).click();
 await page.getByRole('button',{name:'Ignore vote',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__fakeRoom['votes/'].get('votes/Ava').ignored),true);
 await page.getByRole('button',{name:'Count vote again',exact:true}).click();
 await page.getByRole('button',{name:'Delete vote',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__fakeRoom['votes/'].size),4);
 await page.getByRole('button',{name:'Yes, delete vote',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__fakeRoom['votes/'].size),3);
 await page.getByRole('button',{name:'Close poll',exact:true}).click();
 assert.equal((await value('meta')).state,'open');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Close poll',exact:true}).click();
 await page.getByRole('button',{name:'Yes, close',exact:true}).click();
 assert.equal((await value('meta')).state,'closed');
 await page.getByRole('button',{name:'Reopen poll',exact:true}).click();
 assert.equal((await value('meta')).state,'open');
 await page.getByRole('button',{name:'Reset votes',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__fakeRoom['votes/'].size),3);
 await page.getByRole('button',{name:'Yes, reset',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.__fakeRoom['votes/'].size),0);
 await page.getByRole('button',{name:'Show QR',exact:true}).click();
 const dialog = page.getByRole('dialog',{name:'Share this poll'});
 await dialog.waitFor();
 await dialog.getByRole('img').waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Done');
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Copy');
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Done');
 await page.keyboard.press('Escape');
 assert.equal(await dialog.count(),0);
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Show QR');
 await page.getByRole('button',{name:'Copy link',exact:true}).click();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'http://127.0.0.1:5190/A3ZK');
 console.log('PASS: title save/cancel, scoring, settings, colour, option add/remove, voter ignore/delete, close/reopen/reset confirmations, QR focus trap/restore, clipboard');
 for(const [width,query,name] of [[1280,'','admin-desktop-yellow'],[390,'?colour=cobalt','admin-phone-cobalt'],[320,'?long&colour=cobalt','admin-narrow-long'],[390,'?empty','admin-empty']]) {
  await page.setViewportSize({width,height:844}); await go(query);
  assert.equal(await hasOverflow(),false,`overflow at ${width} ${query}`);
  await page.screenshot({path:`design-explorations/screenshots/impl/${name}.png`,fullPage:true});
 }
 await page.setViewportSize({width:390,height:844}); await go('?colour=cobalt');
 await page.getByRole('button',{name:'Show QR',exact:true}).click();
 await page.getByRole('dialog').getByRole('img').waitFor();
 await page.screenshot({path:'design-explorations/screenshots/impl/admin-share-cobalt.png',fullPage:false});
 assert.equal(await hasOverflow(),false);
 await page.keyboard.press('Escape');
 for(const colour of ['yellow','lime','mint','sky','cobalt','pink','tomato','orange']) {await go('?colour='+colour); assert.equal(await hasOverflow(),false,colour);}
 errors.push(...await page.evaluate(()=>window.__browserErrors ?? [])); assert.deepEqual(errors,[]);
 console.log('PASS: desktop, 390px and 320px, empty/long content, all 8 colours; no page errors');
} finally { await browser.close(); }





