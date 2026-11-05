import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/user/code/career-desk/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Users/user/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
const admin=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
admin.setDefaultTimeout(15000);
await admin.route('https://fonts.googleapis.com/**', r => r.abort());
let roomId;let removed=false;
try{
 await admin.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded'});
 await admin.getByRole('radio',{name:'Cobalt',exact:true}).click();await admin.getByRole('button',{name:'Start a poll',exact:true}).click();
 await admin.waitForURL(/\/[A-Z0-9]{4}\/admin$/,{timeout:20000,waitUntil:'domcontentloaded'});roomId=new URL(admin.url()).pathname.split('/')[1];
 writeFileSync('design-explorations/_harness/live-test-room.json',JSON.stringify({roomId,cleanedUp:false}));
 console.log('created live test poll '+roomId);
 const title=admin.getByRole('textbox',{name:'Poll question'});await title.fill('Rankzap cleanup check');await title.press('Enter');
 for(const text of ['Morning walk','Coffee first']){await admin.getByRole('textbox',{name:'Add an option',exact:true}).fill(text);await admin.getByRole('button',{name:'Add',exact:true}).click();await admin.getByRole('textbox',{name:`Edit option: ${text}`,exact:true}).waitFor();}
 const voter=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});voter.setDefaultTimeout(15000);await voter.route('https://fonts.googleapis.com/**', r => r.abort());
 await voter.goto('http://127.0.0.1:5180/'+roomId,{waitUntil:'domcontentloaded'});await voter.getByRole('textbox',{name:'Your name'}).fill('QA voter');await voter.getByRole('button',{name:'Start ranking',exact:true}).click();
 assert.equal(await voter.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--sig').trim()),'#2d4bff');
 await voter.getByRole('button',{name:'Lock it in',exact:true}).click();await voter.getByRole('heading',{name:"You're in.",exact:true}).waitFor();
 await admin.getByText('Open · 1 vote',{exact:true}).waitFor();console.log('PASS live: chosen colour, two options, voter name, submit and host vote count');
 await admin.getByRole('radio',{name:'Mint',exact:true}).click();
 await voter.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--sig').trim()==='#2fdc8e');
 await admin.getByRole('button',{name:'Close poll',exact:true}).click();await admin.getByRole('button',{name:'Yes, close',exact:true}).click();
 await voter.getByText(/Poll closed · 1 vote/).waitFor();console.log('PASS live: colour changes sync to voter; closing reveals final winner');


 await voter.close();
}catch(e){console.log('Live check stopped at '+admin.url());console.log((await admin.locator('body').innerText()).slice(-500));throw e;}finally{
 if(!roomId)roomId=new URL(admin.url()).pathname.match(/^\/([A-Z0-9]{4})\/admin$/)?.[1];
 if(roomId){
  await admin.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded'});
  await admin.getByRole('button',{name:`Delete poll ${roomId}`,exact:true}).click();await admin.getByRole('button',{name:'Yes, delete',exact:true}).click();
  await admin.getByRole('button',{name:`Delete poll ${roomId}`,exact:true}).waitFor({state:'detached'});
  removed=true;writeFileSync('design-explorations/_harness/live-test-room.json',JSON.stringify({roomId,cleanedUp:true}));console.log('deleted live test poll '+roomId);
 }
 await browser.close();
}


