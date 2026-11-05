import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from 'file:///C:/Users/user/code/career-desk/node_modules/playwright-core/index.mjs';
const browser = await chromium.launch({executablePath:'C:/Users/user/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});
const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
await page.route('https://fonts.googleapis.com/**',r=>r.abort());
page.setDefaultTimeout(10000);
const failures=[];const summaries=[];
async function audit(label) {
 const result=await page.evaluate(()=>{
  const ctx=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const rgba=c=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
  const mix=(f,b)=>[0,1,2].map(i=>f[i]*f[3]+b[i]*(1-f[3])).concat(1);
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  function bg(el){const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);let c=[255,255,255,1];const rect=el.getBoundingClientRect();const x=rect.x+rect.width/2,y=rect.y+rect.height/2;for(const p of chain){c=mix(rgba(getComputedStyle(p).backgroundColor),c);if(p.tagName==='LI'){for(const ch of p.children){const st=getComputedStyle(ch),r=ch.getBoundingClientRect();if(st.position==='absolute'&&ch.getAttribute('aria-hidden')==='true'&&!ch.textContent&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)c=mix(rgba(st.backgroundColor),c);}}}return c;}
  function measure(el,text,pseudo){const r=el.getBoundingClientRect();if(!r.width||!r.height||el.closest('[aria-hidden=true],button:disabled,input:disabled,fieldset:disabled,script,style'))return null;const s=getComputedStyle(el,pseudo);if(s.visibility==='hidden'||s.display==='none')return null;let opacity=Number(s.opacity);for(let p=pseudo?el:el.parentElement;p;p=p.parentElement)opacity*=Number(getComputedStyle(p).opacity);const c=rgba(s.color);c[3]*=opacity;const b=bg(el);const size=parseFloat(s.fontSize),weight=parseInt(s.fontWeight);const threshold=size>=24||(size>=18.66&&weight>=700)?3:4.5;const ratio=contrast(mix(c,b),b);return {text:text.slice(0,70),ratio:Math.round(ratio*100)/100,threshold,size,fg:s.color,bg:b.slice(0,3).map(Math.round),tag:el.tagName};}
  const entries=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){if(n.textContent.trim()){const m=measure(n.parentElement,n.textContent.trim());if(m)entries.push(m);}}
  for(const e of document.querySelectorAll('input,textarea')){if(e.value){const m=measure(e,e.value);if(m)entries.push(m);}else if(e.placeholder){const m=measure(e,e.placeholder,'::placeholder');if(m)entries.push(m);}}
  return {count:entries.length,failures:entries.filter(e=>e.ratio+.01<e.threshold),minimum:Math.min(...entries.map(e=>e.ratio)),overflow:document.documentElement.scrollWidth>innerWidth};
 });
 summaries.push({label,count:result.count,minimum:result.minimum});
 for(const failure of result.failures)failures.push({label,...failure});
 assert.equal(result.overflow,false,label+' overflow');
}
try {
 for(const colour of ['yellow','lime','mint','sky','cobalt','pink','tomato','orange']){
  for(const screen of ['arrive','ballot','voted','closed']){
   await page.goto(`http://127.0.0.1:5190/voter.html?colour=${colour}&screen=${screen}`,{waitUntil:'domcontentloaded'});
   await page.locator('main').waitFor();await audit(`${colour}/${screen}`);
   if(screen==='ballot'){await page.getByRole('textbox',{name:'Add an option',exact:true}).focus();await audit(`${colour}/ballot-focused`);}
  }
  await page.goto(`http://127.0.0.1:5190/admin.html?colour=${colour}&empty`,{waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'Poll question'}).waitFor();await audit(`${colour}/admin-empty`);
  await page.goto(`http://127.0.0.1:5190/admin.html?colour=${colour}`,{waitUntil:'domcontentloaded'});await page.getByRole('textbox',{name:'Poll question'}).waitFor();await audit(`${colour}/admin`);
  console.log('checked '+colour);
 }
 await page.goto('http://127.0.0.1:5190/home.html',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Rank it.'}).waitFor();await page.locator('[aria-busy=false]').waitFor();await audit('home');
 writeFileSync('design-explorations/_harness/contrast-report.json',JSON.stringify({summaries,failures},null,2));
 console.log(JSON.stringify({screens:summaries.length,failures}));
 assert.deepEqual(failures,[]);
}finally{await browser.close();}
