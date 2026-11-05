import {chromium} from 'file:///C:/Users/santi/code/career-desk/node_modules/playwright-core/index.mjs';
const b=await chromium.launch({executablePath:'C:/Users/santi/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',headless:true});const p=await b.newPage({viewport:{width:390,height:844}});
await p.route('https://fonts.googleapis.com/**',r=>r.abort());
await p.goto('http://127.0.0.1:5190/voter.html?colour=tomato&screen=ballot',{waitUntil:'domcontentloaded'});
await p.getByRole('textbox',{name:'Add an option',exact:true}).focus();
console.log(await p.getByRole('textbox',{name:'Add an option',exact:true}).evaluate(e=>({focus:e===document.activeElement,parentFocus:e.parentElement.matches(':focus-within'),parentClass:e.parentElement.className,parentBg:getComputedStyle(e.parentElement).backgroundColor,pseudo:getComputedStyle(e,'::placeholder').opacity,html:getComputedStyle(document.documentElement).getPropertyValue('--step')})));
await b.close();
