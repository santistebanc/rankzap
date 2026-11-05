import {chromium} from 'file:///C:/Users/santi/code/career-desk/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({executablePath:'C:/Users/santi/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
const page=await browser.newPage();page.setDefaultTimeout(15000);
await page.route('https://fonts.googleapis.com/**',r=>r.abort());
const events=[];
page.on('websocket',ws=>{const u=new URL(ws.url());events.push({event:'socket',host:u.host,path:u.pathname});ws.on('socketerror',error=>events.push({event:'socketerror',error}));ws.on('framereceived',({payload})=>{try{const d=JSON.parse(String(payload));events.push({event:'receive',type:d.type??d.t,code:d.code,error:d.error,message:d.message});}catch{events.push({event:'receive',format:'non-json'});}});ws.on('close',()=>events.push({event:'close'}));});
page.on('requestfailed',r=>{const u=new URL(r.url());if(!u.hostname.includes('google'))events.push({event:'requestfailed',host:u.host,path:u.pathname,error:r.failure()?.errorText});});
try{
 await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Start a poll',exact:true}).click();
 await Promise.race([page.waitForURL(/\/[A-Z0-9]{4}\/admin$/,{waitUntil:'domcontentloaded',timeout:12000}),page.getByRole('alert').waitFor({timeout:12000})]);
 const alert=await page.getByRole('alert').textContent().catch(()=>null);
 console.log(JSON.stringify({url:page.url(),alert,events},null,2));
 if(alert?.includes("Couldn't connect to the server."))process.exitCode=1;
}finally{await browser.close();}
