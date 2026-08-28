import { chromium } from 'playwright';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSetting, setSetting } from './db.js';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
let browserPromise=null;
const execFileAsync=promisify(execFile);

function cleanUrl(raw){
  let u; try{u=new URL(String(raw).trim());}catch{throw new Error('Некорректная ссылка');}
  if(!/^https?:$/.test(u.protocol)) throw new Error('Нужна http/https ссылка');
  return u;
}
function extractWbSku(u){
  const m=u.pathname.match(/\/catalog\/(\d+)/i) || u.searchParams.get('nm')?.match(/(\d{5,})/);
  if(Array.isArray(m)) return m[1]; if(m) return m[1]||m[0];
  const any=u.href.match(/(?:catalog\/|nm=)(\d{5,})/i); return any?.[1]||null;
}
function extractOzonSku(u){
  const m=u.pathname.match(/\/product\/(?:[^/]*?-)?(\d{5,})\/?$/i) || u.pathname.match(/\/product\/[^/]*?(\d{5,})\/?/i);
  return m?.[1]||null;
}
function normalizeMoney(v,{kopecks=false}={}){
  if(v==null) return null;
  if(typeof v==='number') return v>0 ? (kopecks?v/100:v) : null;
  let s=String(v).replace(/\u00a0/g,' ').trim();
  const hasRub=/₽|руб|RUB/i.test(s);
  s=s.replace(/[^0-9.,]/g,''); if(!s) return null;
  if(s.includes(',')&&!s.includes('.')) s=s.replace(',','.'); else if(s.includes(',')&&s.includes('.')) s=s.replace(/,/g,'');
  let n=Number(s); if(!Number.isFinite(n)||n<=0) return null;
  if(kopecks&&!hasRub) n/=100;
  return Math.round(n*100)/100;
}

export async function lookupProduct(rawUrl){
  const u=cleanUrl(rawUrl); const host=u.hostname.toLowerCase();
  if(host==='wildberries.ru'||host.endsWith('.wildberries.ru')) return lookupWb(u);
  if(host==='ozon.ru'||host.endsWith('.ozon.ru')) return lookupOzon(u);
  throw new Error('Поддерживаются только Wildberries и Ozon');
}

function wbEndpoints(sku){
  const q=`appType=1&curr=rub&dest=-1257786&lang=ru&spp=30&nm=${encodeURIComponent(sku)}`;
  return [
    [`https://card.wb.ru/cards/v4/detail?${q}`,'card'],
    [`https://search.wb.ru/cards/v4/detail?${q}`,'search']
  ];
}

function parseWbPayload(j,sku){
  const p=j?.data?.products?.[0]||j?.products?.[0];
  if(!p) return null;
  const name=String(p.name||p.title||p.brand||`WB ${sku}`).trim();
  const prices=[];
  for(const size of (p.sizes||[])){
    if(size?.price?.product>0) prices.push((Number(size.price.product)+Number(size.price.logistics||0))/100);
    if(size?.price?.basic>0) prices.push(Number(size.price.basic)/100);
    if(size?.salePriceU>0) prices.push(Number(size.salePriceU)/100);
    if(size?.priceU>0) prices.push(Number(size.priceU)/100);
  }
  if(p.salePriceU>0) prices.push(Number(p.salePriceU)/100);
  if(p.priceU>0) prices.push(Number(p.priceU)/100);
  if(p.salePrice>0) prices.push(Number(p.salePrice));
  if(p.price>0) prices.push(Number(p.price));
  const price=Math.min(...prices.filter(x=>Number.isFinite(x)&&x>0));
  if(!Number.isFinite(price)) return {name,price:null};
  return {name,price:Math.round(price*100)/100};
}

async function wbViaFetch(url){
  const r=await fetch(url,{headers:{
    'user-agent':UA,
    'accept':'application/json,text/plain,*/*',
    'accept-language':'ru-RU,ru;q=0.9,en;q=0.7',
    'referer':'https://www.wildberries.ru/',
    'origin':'https://www.wildberries.ru'
  },signal:AbortSignal.timeout(15000)});
  const text=await r.text();
  return {status:r.status,text};
}

async function wbViaCurl(url){
  const args=[
    '-4','-sS','--compressed','--max-time','18','--connect-timeout','8','-L',
    '-A',UA,
    '-H','Accept: application/json,text/plain,*/*',
    '-H','Accept-Language: ru-RU,ru;q=0.9,en;q=0.7',
    '-H','Referer: https://www.wildberries.ru/',
    '-H','Origin: https://www.wildberries.ru',
    '-w','\n__PW_HTTP__:%{http_code}',url
  ];
  if(process.env.WB_PROXY_URL) args.unshift('--proxy',process.env.WB_PROXY_URL);
  const {stdout}=await execFileAsync('curl',args,{timeout:22000,maxBuffer:5*1024*1024});
  const marker='\n__PW_HTTP__:';
  const i=stdout.lastIndexOf(marker);
  if(i<0) return {status:0,text:stdout};
  return {status:Number(stdout.slice(i+marker.length).trim())||0,text:stdout.slice(0,i)};
}

async function wbViaBrowser(url){
  const browser=await getBrowser();
  const context=await browser.newContext({locale:'ru-RU',timezoneId:'Europe/Moscow',userAgent:UA,extraHTTPHeaders:{'Accept-Language':'ru-RU,ru;q=0.9,en;q=0.7'}});
  const page=await context.newPage();
  try{
    const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
    const status=r?.status()||0;
    const text=(await page.locator('body').innerText({timeout:5000}).catch(()=>''))||'';
    return {status,text};
  } finally {await context.close().catch(()=>{});}
}

function decodeWbResult(result,sku){
  if(!result||result.status!==200||!result.text) return null;
  try{return parseWbPayload(JSON.parse(result.text),sku);}catch{return null;}
}

async function lookupWb(u){
  const sku=extractWbSku(u); if(!sku) throw new Error('Не удалось определить артикул Wildberries');
  const diag=[];
  for(const [url,label] of wbEndpoints(sku)){
    for(let attempt=1;attempt<=2;attempt++){
      try{
        const r=await wbViaCurl(url); const parsed=decodeWbResult(r,sku);
        diag.push(`curl-${label}:${r.status}${parsed?.price?'':':no-data'}`);
        if(parsed?.price) return {marketplace:'WB',sku:String(sku),name:parsed.name,price:parsed.price,source:`WB curl ${label}`,url:u.href};
        if(![403,429].includes(r.status)) break;
      }catch(e){diag.push(`curl-${label}:${e.code||e.name||'error'}`);break;}
      await new Promise(resolve=>setTimeout(resolve,500+Math.floor(Math.random()*900)));
    }
  }
  for(const [url,label] of wbEndpoints(sku)){
    try{
      const r=await wbViaFetch(url); const parsed=decodeWbResult(r,sku);
      diag.push(`fetch-${label}:${r.status}${parsed?.price?'':':no-data'}`);
      if(parsed?.price) return {marketplace:'WB',sku:String(sku),name:parsed.name,price:parsed.price,source:`WB fetch ${label}`,url:u.href};
    }catch(e){diag.push(`fetch-${label}:${e.name||'error'}`);}
  }
  try{
    const [url]=wbEndpoints(sku)[0]; const r=await wbViaBrowser(url); const parsed=decodeWbResult(r,sku);
    diag.push(`browser:${r.status}${parsed?.price?'':':no-data'}`);
    if(parsed?.price) return {marketplace:'WB',sku:String(sku),name:parsed.name,price:parsed.price,source:'WB Chromium fallback',url:u.href};
  }catch(e){diag.push(`browser:${e.name||'error'}`);}
  const proxyHint=process.env.WB_PROXY_URL?' WB proxy также не помог.':'';
  throw new Error(`Wildberries не отдал цену автоматически. Попытки: ${diag.join(', ')}.${proxyHint} Если везде 403, Timeweb IP блокируется WB и понадобится российский proxy.`);
}

function findOzonFromObject(root){
  if(!root||typeof root!=='object') return null;
  const q=[root]; let scanned=0;
  while(q.length && scanned<10000){
    const x=q.shift(); scanned++; if(!x||typeof x!=='object') continue;
    let name=x.title||x.name||x.productTitle||null, price=null;
    for(const k of ['finalPrice','cardPrice','priceWithSale','salePrice','price']){
      if(x[k]!=null){
        const kopecks=typeof x[k]==='number' && Number(x[k])>100000 && !String(x[k]).includes('.');
        const n=normalizeMoney(x[k],{kopecks}); if(n&&n>=10){price=n;break;}
      }
    }
    if(price && (name||x.id||x.sku||x.productId)) return {name:name?String(name):'',price};
    for(const v of Object.values(x)){ if(v&&typeof v==='object') q.push(v); }
  }
  return null;
}

async function ozonHttp(sku){
  const path=encodeURIComponent(`/product/${sku}/`);
  const attempts=[
    [`https://api.ozon.ru/composer-api.bx/page/json/v2?url=${path}`,'api-composer'],
    [`https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=${path}`,'www-entrypoint'],
    [`https://www.ozon.ru/api/composer-api.bx/page/json/v2?url=${path}`,'www-composer']
  ];
  const diag=[];
  for(const [url,label] of attempts){
    try{
      const r=await fetch(url,{redirect:'manual',headers:{'user-agent':UA,'accept':'application/json,text/plain,*/*','accept-language':'ru-RU,ru;q=0.9','referer':'https://www.ozon.ru/','x-o3-app-name':'rich'},signal:AbortSignal.timeout(14000)});
      diag.push(`${label}:${r.status}`); if(!r.ok) continue;
      const text=await r.text(); let j; try{j=JSON.parse(text);}catch{continue;}
      const found=findOzonFromObject(j); if(found?.price) return {...found,source:`Ozon ${label}`};
    }catch(e){diag.push(`${label}:${e.name||'error'}`);}
  }
  return {error:diag.join(', ')};
}

async function getBrowser(){
  if(browserPromise) return browserPromise;
  browserPromise=(async()=>{
    const proxyServer=process.env.OZON_PROXY_SERVER;
    const proxy=proxyServer?{server:proxyServer,username:process.env.OZON_PROXY_USERNAME||undefined,password:process.env.OZON_PROXY_PASSWORD||undefined}:undefined;
    return chromium.launch({headless:true,proxy,args:['--no-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled']});
  })();
  try{return await browserPromise;}catch(e){browserPromise=null;throw e;}
}

function parsePriceText(text){
  if(!text) return null;
  const matches=[...String(text).matchAll(/(\d{1,3}(?:[ \u00a0]\d{3})+|\d{2,7})(?:[,.]\d{1,2})?\s*₽/g)];
  for(const m of matches){const n=normalizeMoney(m[0]); if(n>=10&&n<=10000000) return n;}
  return null;
}

async function ozonBrowser(url,sku){
  const browser=await getBrowser(); const saved=await getSetting('ozon_storage_state');
  const context=await browser.newContext({
    locale:'ru-RU',timezoneId:'Europe/Moscow',viewport:{width:1440,height:1000},userAgent:UA,
    extraHTTPHeaders:{'Accept-Language':'ru-RU,ru;q=0.9,en;q=0.7'},storageState:saved&&saved.cookies?saved:undefined
  });
  const page=await context.newPage();
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForTimeout(1800);
    const body=(await page.locator('body').innerText({timeout:8000}).catch(()=>''))||'';
    if(/проверяем|не робот|captcha|доступ ограничен|слишком много запросов|access denied/i.test(body)) throw new Error('Ozon показал антибот-проверку в облачном браузере');
    let name='';
    for(const sel of ['[data-widget="webProductHeading"] h1','[data-widget="webProductHeading"]','h1']){
      name=(await page.locator(sel).first().innerText({timeout:1500}).catch(()=>''))?.trim(); if(name) break;
    }
    if(!name) name=(await page.title()).replace(/\s*[|—-]\s*Ozon.*$/i,'').trim();
    let price=null;
    for(const sel of ['[data-widget="webPrice"]','[data-widget*="price" i]']){
      const text=await page.locator(sel).first().innerText({timeout:1800}).catch(()=>null); price=parsePriceText(text); if(price) break;
    }
    if(!price){
      const ld=await page.locator('script[type="application/ld+json"]').allTextContents().catch(()=>[]);
      for(const text of ld){
        try{const x=JSON.parse(text); const arr=Array.isArray(x)?x:[x]; for(const n of arr){const offer=Array.isArray(n?.offers)?n.offers[0]:n?.offers; const pr=normalizeMoney(offer?.price||offer?.lowPrice); if(pr){price=pr;if(!name&&n?.name)name=n.name;break;}}}catch{}
        if(price)break;
      }
    }
    if(!price) price=parsePriceText(body);
    if(!price) throw new Error('Ozon открыл карточку, но цена не найдена');
    try{await setSetting('ozon_storage_state',await context.storageState());}catch{}
    return {name:name||`Ozon ${sku}`,price,source:'Ozon cloud browser'};
  } finally { await context.close().catch(()=>{}); }
}

async function lookupOzon(u){
  let sku=extractOzonSku(u), finalUrl=u.href;
  if(!sku){
    try{const r=await fetch(u.href,{redirect:'follow',headers:{'user-agent':UA},signal:AbortSignal.timeout(15000)});finalUrl=r.url||u.href;sku=extractOzonSku(new URL(finalUrl));}catch{}
  }
  if(!sku) throw new Error('Не удалось определить артикул Ozon. Нужна полная ссылка на карточку.');
  const direct=await ozonHttp(sku);
  if(direct?.price) return {marketplace:'Ozon',sku:String(sku),name:direct.name||`Ozon ${sku}`,price:direct.price,source:direct.source,url:finalUrl};
  try{
    const b=await ozonBrowser(finalUrl,sku);
    return {marketplace:'Ozon',sku:String(sku),name:b.name,price:b.price,source:b.source,url:finalUrl};
  }catch(e){
    throw new Error(`Ozon не отдал цену автоматически. HTTP: ${direct?.error||'нет данных'}. Browser: ${e.message}. Если это повторяется на Timeweb, понадобится прокси для Ozon.`);
  }
}

export async function closeCollectors(){
  if(browserPromise){try{const b=await browserPromise;await b.close();}catch{}browserPromise=null;}
}

// Pure helpers exposed for smoke tests; not used by the UI.
export const __test = { normalizeMoney, parsePriceText, extractWbSku, extractOzonSku, findOzonFromObject, parseWbPayload, decodeWbResult };
