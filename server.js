import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initDb,getState,addProduct,addCompetitor,addEvent,updateItem,deleteProduct,deleteCompetitor,
  getAllItems,resetAndImport,usingPostgres,databaseHealth
} from './db.js';
import { lookupProduct, closeCollectors } from './collectors.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const PORT=Number(process.env.PORT||8080);
const AUTH_ENABLED=/^(1|true|yes|on)$/i.test(String(process.env.AUTH_ENABLED||''));
const APP_PASSWORD=process.env.APP_PASSWORD||'';
const SESSION_SECRET=process.env.SESSION_SECRET||APP_PASSWORD||'pricewatch-local';
const CONCURRENCY=Math.max(1,Math.min(8,Number(process.env.LOOKUP_CONCURRENCY||3)));
const REFRESH_MIN=Math.max(10,Number(process.env.REFRESH_INTERVAL_MINUTES||60));
const jobs=new Map();

app.set('trust proxy',1);
app.use(express.json({limit:'3mb'}));
app.use(express.urlencoded({extended:false}));

function parseCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [decodeURIComponent(i<0?x:x.slice(0,i)),decodeURIComponent(i<0?'':x.slice(i+1))]}));}
function authToken(){return crypto.createHmac('sha256',SESSION_SECRET).update(`pricewatch:${APP_PASSWORD}`).digest('hex');}
function timingSafeEqual(a,b){try{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}catch{return false;}}
function authed(req){return !AUTH_ENABLED || !APP_PASSWORD || timingSafeEqual(parseCookies(req).pw_auth||'',authToken());}
function authMiddleware(req,res,next){if(!AUTH_ENABLED)return next();if(req.path==='/api/health'||req.path==='/login')return next();if(authed(req))return next();if(req.path.startsWith('/api/'))return res.status(401).json({ok:false,error:'Требуется вход'});return res.redirect('/login');}
app.use(authMiddleware);

app.get('/login',(req,res)=>{
  if(!AUTH_ENABLED||authed(req))return res.redirect('/');
  res.type('html').send(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PriceWatch — вход</title><style>body{font-family:system-ui;background:#f6f7fb;display:grid;place-items:center;min-height:100vh;margin:0}.box{background:#fff;border:1px solid #e8eaf0;border-radius:18px;padding:28px;width:min(380px,90vw)}h1{margin:0 0 6px;font-size:22px}.small{color:#7b8190;font-size:13px;margin-bottom:20px}input{width:100%;box-sizing:border-box;padding:13px;border:1px solid #dfe2e8;border-radius:11px;font:inherit}button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:11px;background:#181b24;color:#fff;font-weight:700;cursor:pointer}.err{color:#d73b3e;margin-top:10px;font-size:13px}</style><div class="box"><h1>₽ PriceWatch</h1><div class="small">Облачная версия v9.5.1</div><form method="post" action="/login"><input type="password" name="password" autofocus placeholder="Пароль"><button>Войти</button>${req.query.bad?'<div class="err">Неверный пароль</div>':''}</form></div></html>`);
});
app.post('/login',(req,res)=>{if(!AUTH_ENABLED||!APP_PASSWORD||timingSafeEqual(req.body.password||'',APP_PASSWORD)){res.cookie('pw_auth',authToken(),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:30*24*3600*1000});return res.redirect('/');}res.redirect('/login?bad=1');});
app.get('/logout',(req,res)=>{res.clearCookie('pw_auth');res.redirect('/login');});

app.get('/api/health',(req,res)=>{const db=databaseHealth();res.json({ok:true,version:'9.5.1',database:usingPostgres()?'postgres':(db.configured?db.status:'memory'),dbError:db.error||null,auth:AUTH_ENABLED&&!!APP_PASSWORD,ozonProxy:Boolean(process.env.OZON_PROXY_URL||process.env.OZON_PROXY_SERVER),time:new Date().toISOString()});});
app.get('/api/state',async(req,res,next)=>{try{res.json({ok:true,...await getState()});}catch(e){next(e);}});
app.get('/api/export',async(req,res,next)=>{try{const state=await getState();res.setHeader('content-disposition','attachment; filename="pricewatch-v9.5.1-backup.json"');res.json(state);}catch(e){next(e);}});
app.post('/api/import',async(req,res,next)=>{try{await resetAndImport(req.body);await addEvent('Импортирован backup PriceWatch');res.json({ok:true});}catch(e){next(e);}});
app.delete('/api/products/:id',async(req,res,next)=>{try{await deleteProduct(req.params.id);res.json({ok:true});}catch(e){next(e);}});
app.delete('/api/competitors/:id',async(req,res,next)=>{try{await deleteCompetitor(req.params.id);res.json({ok:true});}catch(e){next(e);}});

function normalizeUrls(input){
  const raw=Array.isArray(input)?input:String(input||'').split(/\r?\n/);
  const urls=[...new Set(raw.map(x=>String(x).trim()).filter(Boolean))];
  if(!urls.length) throw new Error('Добавь хотя бы одну ссылку');
  if(urls.length>100) throw new Error('За один раз можно добавить до 100 ссылок');
  return urls;
}
function createJob(type,total,meta={}){const id=crypto.randomUUID();const job={id,type,status:'queued',total,done:0,ok:0,failed:0,skipped:0,results:[],created_at:new Date().toISOString(),...meta};jobs.set(id,job);setTimeout(()=>{const j=jobs.get(id);if(j&&Date.now()-new Date(j.created_at).getTime()>24*3600*1000)jobs.delete(id);},24*3600*1000);return job;}
async function mapLimit(items,limit,fn){let i=0;const workers=Array.from({length:Math.min(limit,items.length)},async()=>{while(true){const idx=i++;if(idx>=items.length)return;await fn(items[idx],idx);}});await Promise.all(workers);}
function startBulkJob(job,urls,{productId=null}={}){
  setImmediate(async()=>{
    job.status='running';
    await mapLimit(urls,CONCURRENCY,async url=>{
      try{
        const x=await lookupProduct(url); const item={name:x.name,marketplace:x.marketplace,sku:x.sku,url:x.url||url,latest_price:x.price,source_status:x.source,updated_at:new Date().toISOString()};
        const row=productId?await addCompetitor(productId,item):await addProduct(item);
        if(row.duplicate){job.skipped++;job.results.push({url,ok:true,duplicate:true,name:row.name,price:Number(row.latest_price)});}else{job.ok++;job.results.push({url,ok:true,name:item.name,price:item.latest_price,marketplace:item.marketplace});await addEvent(`${productId?'Добавлен конкурент':'Добавлен товар'} ${item.name}: ${fmtRub(item.latest_price)}`);}
      }catch(e){job.failed++;job.results.push({url,ok:false,error:e.message});}
      finally{job.done++;}
    });
    job.status='done';job.finished_at=new Date().toISOString();
  });
}
app.post('/api/products/bulk',(req,res,next)=>{try{const urls=normalizeUrls(req.body.urls);const job=createJob('bulk-products',urls.length);startBulkJob(job,urls);res.status(202).json({ok:true,jobId:job.id,total:job.total});}catch(e){next(e);}});
app.post('/api/products/:id/competitors/bulk',(req,res,next)=>{try{const urls=normalizeUrls(req.body.urls);const job=createJob('bulk-competitors',urls.length,{productId:Number(req.params.id)});startBulkJob(job,urls,{productId:Number(req.params.id)});res.status(202).json({ok:true,jobId:job.id,total:job.total});}catch(e){next(e);}});
app.get('/api/jobs/:id',(req,res)=>{const job=jobs.get(req.params.id);if(!job)return res.status(404).json({ok:false,error:'Задача не найдена'});res.json({ok:true,job});});

function fmtRub(n){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(n||0))+' ₽';}
let refreshRunning=false;
async function runRefresh(job){
  if(refreshRunning){job.status='done';job.finished_at=new Date().toISOString();job.results.push({ok:false,error:'Обновление уже выполняется'});return;}
  refreshRunning=true;job.status='running';
  try{
    const all=await getAllItems(); const items=[...all.products.map(x=>({type:'product',...x})),...all.competitors.map(x=>({type:'competitor',...x}))];job.total=items.length;
    await mapLimit(items,CONCURRENCY,async item=>{
      try{const x=await lookupProduct(item.url);const r=await updateItem(item.type,item.id,{name:x.name,marketplace:x.marketplace,sku:x.sku,latest_price:x.price,source_status:x.source});job.ok++;if(r?.old!=null&&Math.abs(Number(r.old)-Number(x.price))>=1)await addEvent(`${item.name}: ${fmtRub(r.old)} → ${fmtRub(x.price)}`);job.results.push({ok:true,id:item.id,type:item.type,price:x.price});}
      catch(e){job.failed++;job.results.push({ok:false,id:item.id,type:item.type,error:e.message});}
      finally{job.done++;}
    });
    job.status='done';job.finished_at=new Date().toISOString();
  } finally {refreshRunning=false;}
}
app.post('/api/refresh',(req,res)=>{const job=createJob('refresh',0);setImmediate(()=>runRefresh(job));res.status(202).json({ok:true,jobId:job.id});});

app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.use((err,req,res,next)=>{console.error(err);const status=err?.code==='DB_UNAVAILABLE'?503:(/до 100|хотя бы|Некоррект|поддерживаются/i.test(err.message)?400:500);res.status(status).json({ok:false,error:err.message||'Ошибка сервера'});});

app.listen(PORT,'0.0.0.0',()=>console.log(`PriceWatch v9.5.1 listening on :${PORT}`));

initDb().then(()=>{
  console.log(`Database ready: ${usingPostgres()?'PostgreSQL':'memory'}`);
}).catch(e=>{
  console.error('Database initialization failed:', e?.message || e);
});

setInterval(()=>{if(refreshRunning)return;const job=createJob('scheduled-refresh',0);runRefresh(job).catch(e=>console.error('scheduled refresh',e));},REFRESH_MIN*60*1000).unref();

async function shutdown(){await closeCollectors().catch(()=>{});process.exit(0);}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
