import os from 'os';
import { chromium } from 'playwright';
import { parseComposer, parsePriceText, money } from './ozon-parser.js';

const VERSION='10.0';
const CLOUD_URL=String(process.env.CLOUD_URL||'').replace(/\/+$/,'');
const AGENT_KEY=String(process.env.OZON_AGENT_KEY||'');
const AGENT_ID=String(process.env.AGENT_ID||`timeweb-vps-${os.hostname()}`).slice(0,160);
const PROFILE_DIR=process.env.CHROME_PROFILE_DIR||'/data/chrome-profile';
const POLL_MS=Math.max(800,Number(process.env.POLL_MS||1400));
const HOME='https://www.ozon.ru/';

if(!/^https?:\/\//i.test(CLOUD_URL))throw new Error('CLOUD_URL is required, e.g. https://priceguru.example.com');
if(!AGENT_KEY)throw new Error('OZON_AGENT_KEY is required');

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function proxyConfig(raw){
  if(!raw)return undefined;
  const u=new URL(raw);
  const p={server:`${u.protocol}//${u.hostname}${u.port?`:${u.port}`:''}`};
  if(u.username)p.username=decodeURIComponent(u.username);
  if(u.password)p.password=decodeURIComponent(u.password);
  return p;
}

async function cloud(path,{method='GET',body}={}){
  const r=await fetch(CLOUD_URL+path,{
    method,
    headers:{'content-type':'application/json','x-priceguru-agent-key':AGENT_KEY},
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(35000)
  });
  const text=await r.text();let json;
  try{json=JSON.parse(text)}catch{throw new Error(`Cloud HTTP ${r.status}: invalid JSON`)}
  if(!r.ok||json?.ok===false)throw new Error(json?.error||`Cloud HTTP ${r.status}`);
  return json;
}

async function launch(){
  const context=await chromium.launchPersistentContext(PROFILE_DIR,{
    headless:false,
    locale:'ru-RU',
    timezoneId:'Europe/Moscow',
    viewport:null,
    proxy:proxyConfig(process.env.OZON_PROXY_URL||''),
    args:[
      '--no-sandbox','--disable-dev-shm-usage','--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU'
    ]
  });
  await context.addInitScript(()=>{
    try{Object.defineProperty(navigator,'webdriver',{get:()=>undefined,configurable:true});}catch{}
    try{Object.defineProperty(navigator,'languages',{get:()=>['ru-RU','ru','en-US','en'],configurable:true});}catch{}
    try{window.chrome=window.chrome||{runtime:{}};}catch{}
  });
  let pages=context.pages();
  let home=pages[0]||await context.newPage();
  if(home.url()==='about:blank'){
    await home.goto(HOME,{waitUntil:'domcontentloaded',timeout:90000}).catch(()=>{});
  }
  return {context,home};
}

function skuFromUrl(raw){
  try{const u=new URL(raw);return u.pathname.match(/\/product\/(?:[^/]*?-)?(\d{5,})\/?/i)?.[1]||'';}catch{return ''}
}

async function bodyText(page){return (await page.locator('body').innerText({timeout:7000}).catch(()=>''))||''}
async function detectBlocked(page){
  const text=((await page.title().catch(()=>''))+'\n'+(await bodyText(page)).slice(0,5000)+'\n'+page.url()).toLowerCase();
  return /__rr=|captcha|antibot|access denied|доступ ограничен|не робот|подтвердите|проверяем|слишком много запросов/.test(text);
}

async function composerFromPage(page,sku){
  const productPath=new URL(page.url()).pathname.replace(/\/?$/,'/');
  for(const endpoint of ['/api/composer-api.bx/page/json/v2?url=','/api/entrypoint-api.bx/page/json/v2?url=']){
    const out=await page.evaluate(async ({endpoint,productPath})=>{
      try{
        const r=await fetch(endpoint+encodeURIComponent(productPath),{credentials:'include',headers:{accept:'application/json'}});
        return {status:r.status,text:await r.text()};
      }catch(e){return {status:0,error:String(e?.message||e),text:''};}
    },{endpoint,productPath}).catch(e=>({status:0,error:e.message,text:''}));
    if(out.status!==200)continue;
    try{const found=parseComposer(JSON.parse(out.text),sku);if(found?.price)return found;}catch{}
  }
  return null;
}

async function domProduct(page,sku){
  let name='';
  for(const sel of ['[data-widget="webProductHeading"] h1','[data-widget="webProductHeading"]','h1']){
    name=((await page.locator(sel).first().innerText({timeout:2500}).catch(()=>''))||'').trim();if(name)break;
  }
  if(!name)name=((await page.title().catch(()=>''))||'').replace(/\s*[|—-]\s*Ozon.*$/i,'').trim();
  let price=null;
  for(const sel of ['[data-widget="webPrice"]','[data-widget*="price" i]']){
    const txt=await page.locator(sel).first().innerText({timeout:2500}).catch(()=>null);
    price=parsePriceText(txt);if(price)break;
  }
  if(!price){
    const ld=await page.locator('script[type="application/ld+json"]').allTextContents().catch(()=>[]);
    for(const text of ld){
      try{
        const x=JSON.parse(text),arr=Array.isArray(x)?x:[x];
        for(const n of arr){
          const offer=Array.isArray(n?.offers)?n.offers[0]:n?.offers;
          const p=money(offer?.price||offer?.lowPrice);
          if(p){price=p;if(!name&&n?.name)name=n.name;break;}
        }
      }catch{}
      if(price)break;
    }
  }
  if(!price)price=parsePriceText(await bodyText(page));
  return price?{name:name||`Ozon ${sku}`,price,source:'Ozon cloud Chrome DOM'}:null;
}

async function lookup(context,url){
  const sku=skuFromUrl(url);
  const page=await context.newPage();
  let keepOpen=false;
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForTimeout(4500);
    if(await detectBlocked(page)){
      keepOpen=true;
      throw new Error('Ozon просит проверку/повторный вход. Открой удалённый Chrome через noVNC, заверши проверку и повтори товар. Вкладка оставлена открытой.');
    }
    const api=await composerFromPage(page,sku);
    if(api?.price)return {name:api.name||`Ozon ${sku}`,price:api.price,source:`Ozon cloud Chrome ${api.source}`};
    const dom=await domProduct(page,sku);
    if(dom?.price)return dom;
    throw new Error('Карточка Ozon открылась, но цена не найдена. Проверь вкладку через noVNC.');
  }finally{
    if(!keepOpen)await page.close().catch(()=>{});
  }
}

let browser;
async function ensureBrowser(){
  if(browser)return browser;
  browser=await launch();
  return browser;
}

async function sendResult(job,payload){
  return cloud(`/api/ozon-agent/jobs/${encodeURIComponent(job.id)}/result`,{
    method:'POST',
    body:{agent_id:AGENT_ID,version:VERSION,computer:os.hostname(),...payload}
  });
}

async function loop(){
  console.log(`PriceGuru Ozon VPS Worker v${VERSION}`);
  console.log(`Cloud: ${CLOUD_URL}`);
  console.log(`Profile: ${PROFILE_DIR}`);
  console.log(`Proxy: ${process.env.OZON_PROXY_URL?'configured':'none'}`);
  console.log('Remote browser UI: http://127.0.0.1:6080/vnc.html (via SSH tunnel)');
  const {context}=await ensureBrowser();
  let failures=0;
  while(true){
    try{
      const claim=await cloud('/api/ozon-agent/claim',{method:'POST',body:{agent_id:AGENT_ID,version:VERSION,computer:os.hostname()}});
      failures=0;
      if(!claim.job){await sleep(POLL_MS);continue;}
      const job=claim.job;
      console.log(`[job ${job.id}] ${job.url}`);
      try{
        const result=await lookup(context,job.url);
        console.log(`  OK ${result.price} RUB — ${result.name}`);
        await sendResult(job,{ok:true,...result});
      }catch(e){
        console.error('  ERROR',e.message);
        await sendResult(job,{ok:false,error:e.message}).catch(x=>console.error('  result send failed',x.message));
      }
    }catch(e){
      failures++;
      console.error(`[cloud] ${e.message}`);
      await sleep(Math.min(15000,2000*failures));
    }
  }
}

process.on('SIGTERM',async()=>{if(browser?.context)await browser.context.close().catch(()=>{});process.exit(0)});
process.on('SIGINT',async()=>{if(browser?.context)await browser.context.close().catch(()=>{});process.exit(0)});
loop().catch(e=>{console.error(e);process.exit(1)});
