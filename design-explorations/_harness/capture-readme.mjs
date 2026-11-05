import {readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/santi/code/career-desk/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({executablePath:'C:/Users/santi/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
const p=await b.newPage({viewport:{width:1280,height:1060},reducedMotion:'reduce'});
try{
 await p.goto('http://127.0.0.1:5190/overview.html',{waitUntil:'load'});
 for(const f of p.frames().slice(1)){await f.locator('main').waitFor();await f.evaluate(()=>document.fonts.ready);}
 await p.screenshot({path:'public/rankzap-screenshot.png',fullPage:true});console.log('overview captured');
 await p.goto('http://127.0.0.1:5190/admin.html?colour=yellow',{waitUntil:'load'});await p.getByRole('textbox',{name:'Poll question'}).waitFor();await p.evaluate(()=>document.fonts.ready);
 await p.screenshot({path:'public/rankzap-admin.png',fullPage:true});console.log('admin captured');
 const svg=readFileSync('public/favicon.svg','utf8');
 for(const [size,path] of [[32,'public/favicon-32.png'],[180,'public/apple-touch-icon.png']]){await p.setViewportSize({width:size,height:size});await p.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);await p.screenshot({path});}
 console.log('icons exported from SVG');
}finally{await b.close();}
