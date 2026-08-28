import pg from 'pg';
const { Pool } = pg;

const hasPg = !!process.env.DATABASE_URL;
let pool = null;
let initPromise = null;
let lastAttemptAt = 0;
let dbStatus = hasPg ? 'connecting' : 'memory';
let dbError = null;
let mem = { nextId: 1, products: [], competitors: [], events: [], settings: new Map() };

function sslConfig() {
  const v = String(process.env.PGSSL || '').toLowerCase();
  if (!v || v === 'false' || v === '0' || v === 'disable') return false;
  return { rejectUnauthorized: false };
}

function unavailableError() {
  const detail = dbError || (dbStatus === 'connecting' ? 'connection is still being established' : 'database is not ready');
  const e = new Error(`PostgreSQL unavailable: ${detail}`);
  e.code = 'DB_UNAVAILABLE';
  return e;
}

export async function initDb() {
  if (!hasPg) { dbStatus = 'memory'; return null; }
  if (dbStatus === 'postgres' && pool) return pool;
  if (initPromise) return initPromise;

  // Avoid a tight reconnect loop when credentials/network are wrong.
  if (dbStatus === 'error' && Date.now() - lastAttemptAt < 5000) throw unavailableError();
  lastAttemptAt = Date.now();
  dbStatus = 'connecting';
  dbError = null;

  initPromise = (async () => {
    const candidate = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig(),
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: Number(process.env.PGPOOL_MAX || 5)
    });
    try {
      await candidate.query(`
        CREATE TABLE IF NOT EXISTS products (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          marketplace TEXT NOT NULL,
          sku TEXT,
          url TEXT NOT NULL UNIQUE,
          latest_price NUMERIC(14,2),
          source_status TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS competitors (
          id BIGSERIAL PRIMARY KEY,
          product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          marketplace TEXT NOT NULL,
          sku TEXT,
          url TEXT NOT NULL,
          latest_price NUMERIC(14,2),
          source_status TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(product_id, url)
        );
        CREATE TABLE IF NOT EXISTS price_history (
          id BIGSERIAL PRIMARY KEY,
          item_type TEXT NOT NULL CHECK (item_type IN ('product','competitor')),
          item_id BIGINT NOT NULL,
          price NUMERIC(14,2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_price_history_item ON price_history(item_type, item_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS events (
          id BIGSERIAL PRIMARY KEY,
          text TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS ozon_agent_jobs (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          sku TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          name TEXT,
          price NUMERIC(14,2),
          source TEXT,
          error TEXT,
          agent_id TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          claimed_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_ozon_agent_jobs_status ON ozon_agent_jobs(status, created_at);
      `);
      pool = candidate;
      dbStatus = 'postgres';
      dbError = null;
      return pool;
    } catch (e) {
      dbStatus = 'error';
      dbError = e?.message || String(e);
      try { await candidate.end(); } catch {}
      pool = null;
      throw unavailableError();
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

async function requirePool() {
  if (!hasPg) return null;
  if (dbStatus === 'postgres' && pool) return pool;
  try { await initDb(); } catch {}
  if (dbStatus === 'postgres' && pool) return pool;
  throw unavailableError();
}

export function databaseHealth(){ return { configured:hasPg, status:dbStatus, error:dbError }; }
export function usingPostgres(){ return hasPg && dbStatus==='postgres' && !!pool; }
function num(v) { return v == null ? null : Number(v); }

export async function getState() {
  if (!hasPg) {
    const products = mem.products.map(p => ({
      ...p,
      latest_price: num(p.latest_price),
      competitors: mem.competitors.filter(c => c.product_id === p.id).map(c => ({...c, latest_price:num(c.latest_price), history: c.history || []}))
    }));
    return { version: '10.0', products, events: mem.events.slice(0,100) };
  }
  const db = await requirePool();
  const [pRes, cRes, hRes, eRes] = await Promise.all([
    db.query('SELECT * FROM products ORDER BY id DESC'),
    db.query('SELECT * FROM competitors ORDER BY id ASC'),
    db.query(`SELECT item_type,item_id,price,created_at FROM price_history
              WHERE created_at > NOW() - INTERVAL '90 days'
              ORDER BY created_at ASC`),
    db.query('SELECT text,created_at FROM events ORDER BY created_at DESC LIMIT 100')
  ]);
  const histories = new Map();
  for (const h of hRes.rows) {
    const k = `${h.item_type}:${h.item_id}`;
    if (!histories.has(k)) histories.set(k, []);
    const a = histories.get(k); a.push(num(h.price)); if (a.length > 100) a.shift();
  }
  const byProduct = new Map();
  for (const c of cRes.rows) {
    if (!byProduct.has(String(c.product_id))) byProduct.set(String(c.product_id), []);
    byProduct.get(String(c.product_id)).push({...c, id:Number(c.id), product_id:Number(c.product_id), latest_price:num(c.latest_price), history:histories.get(`competitor:${c.id}`)||[]});
  }
  return {
    version: '10.0',
    products: pRes.rows.map(p => ({...p, id:Number(p.id), latest_price:num(p.latest_price), history:histories.get(`product:${p.id}`)||[], competitors:byProduct.get(String(p.id))||[]})),
    events: eRes.rows
  };
}

export async function addEvent(text) {
  if (!text) return;
  if (!hasPg) { mem.events.unshift({ text, created_at:new Date().toISOString() }); mem.events = mem.events.slice(0,100); return; }
  const db = await requirePool();
  await db.query('INSERT INTO events(text) VALUES($1)', [text]);
}

export async function addProduct(item) {
  if (!hasPg) {
    const existing = mem.products.find(p => p.url === item.url);
    if (existing) return { ...existing, duplicate:true };
    const row = { id:mem.nextId++, ...item, updated_at:item.updated_at||new Date().toISOString(), created_at:new Date().toISOString() };
    mem.products.unshift(row); row.history=[Number(item.latest_price)]; return row;
  }
  const db = await requirePool();
  const r = await db.query(`INSERT INTO products(name,marketplace,sku,url,latest_price,source_status,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,NOW())) ON CONFLICT(url) DO NOTHING RETURNING *`,
      [item.name,item.marketplace,item.sku||null,item.url,item.latest_price,item.source_status||null,item.updated_at||null]);
  if (!r.rows[0]) {
    const ex = await db.query('SELECT * FROM products WHERE url=$1',[item.url]);
    return {...ex.rows[0], id:Number(ex.rows[0].id), latest_price:num(ex.rows[0].latest_price), duplicate:true};
  }
  const row=r.rows[0];
  if (item.latest_price != null) await db.query(`INSERT INTO price_history(item_type,item_id,price) VALUES('product',$1,$2)`,[row.id,item.latest_price]);
  return {...row,id:Number(row.id),latest_price:num(row.latest_price)};
}

export async function addCompetitor(productId, item) {
  productId = Number(productId);
  if (!hasPg) {
    const existing = mem.competitors.find(c => c.product_id===productId && c.url===item.url);
    if (existing) return {...existing, duplicate:true};
    const row={id:mem.nextId++,product_id:productId,...item,updated_at:item.updated_at||new Date().toISOString(),created_at:new Date().toISOString(),history:[Number(item.latest_price)]};
    mem.competitors.push(row); return row;
  }
  const db = await requirePool();
  const r=await db.query(`INSERT INTO competitors(product_id,name,marketplace,sku,url,latest_price,source_status,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,NOW())) ON CONFLICT(product_id,url) DO NOTHING RETURNING *`,
      [productId,item.name,item.marketplace,item.sku||null,item.url,item.latest_price,item.source_status||null,item.updated_at||null]);
  if(!r.rows[0]) {
    const ex=await db.query('SELECT * FROM competitors WHERE product_id=$1 AND url=$2',[productId,item.url]);
    return {...ex.rows[0],id:Number(ex.rows[0].id),product_id:Number(ex.rows[0].product_id),latest_price:num(ex.rows[0].latest_price),duplicate:true};
  }
  const row=r.rows[0];
  if(item.latest_price!=null) await db.query(`INSERT INTO price_history(item_type,item_id,price) VALUES('competitor',$1,$2)`,[row.id,item.latest_price]);
  return {...row,id:Number(row.id),product_id:Number(row.product_id),latest_price:num(row.latest_price)};
}

export async function updateItem(type, id, item) {
  id=Number(id); const table=type==='product'?'products':'competitors';
  if(!hasPg){
    const list=type==='product'?mem.products:mem.competitors; const row=list.find(x=>x.id===id); if(!row) return null;
    const old=num(row.latest_price); Object.assign(row,{name:item.name||row.name,sku:item.sku||row.sku,marketplace:item.marketplace||row.marketplace,latest_price:item.latest_price,source_status:item.source_status,updated_at:new Date().toISOString()});
    row.history=row.history||[]; if(item.latest_price!=null && row.history.at(-1)!==Number(item.latest_price)) row.history.push(Number(item.latest_price)); row.history=row.history.slice(-100);
    return {old,row};
  }
  const db = await requirePool();
  const oldRes=await db.query(`SELECT latest_price FROM ${table} WHERE id=$1`,[id]); if(!oldRes.rows[0]) return null; const old=num(oldRes.rows[0].latest_price);
  const r=await db.query(`UPDATE ${table} SET name=$2, marketplace=$3, sku=$4, latest_price=$5, source_status=$6, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id,item.name,item.marketplace,item.sku||null,item.latest_price,item.source_status||null]);
  if(item.latest_price!=null && (old==null || Math.abs(old-Number(item.latest_price))>=0.01)) await db.query(`INSERT INTO price_history(item_type,item_id,price) VALUES($1,$2,$3)`,[type,id,item.latest_price]);
  return {old,row:r.rows[0]};
}

export async function deleteProduct(id){id=Number(id);if(!hasPg){mem.products=mem.products.filter(x=>x.id!==id);mem.competitors=mem.competitors.filter(x=>x.product_id!==id);return;}const db=await requirePool();await db.query('DELETE FROM products WHERE id=$1',[id]);}
export async function deleteCompetitor(id){id=Number(id);if(!hasPg){mem.competitors=mem.competitors.filter(x=>x.id!==id);return;}const db=await requirePool();await db.query('DELETE FROM competitors WHERE id=$1',[id]);}

export async function getAllItems(){
  if(!hasPg) return {products:mem.products.map(x=>({...x})), competitors:mem.competitors.map(x=>({...x}))};
  const db=await requirePool();
  const [p,c]=await Promise.all([db.query('SELECT * FROM products ORDER BY id'),db.query('SELECT * FROM competitors ORDER BY id')]);
  return {products:p.rows.map(x=>({...x,id:Number(x.id),latest_price:num(x.latest_price)})),competitors:c.rows.map(x=>({...x,id:Number(x.id),product_id:Number(x.product_id),latest_price:num(x.latest_price)}))};
}

export async function getSetting(key){if(!hasPg)return mem.settings.get(key)??null;const db=await requirePool();const r=await db.query('SELECT value FROM settings WHERE key=$1',[key]);return r.rows[0]?.value??null;}
export async function setSetting(key,value){if(!hasPg){mem.settings.set(key,value);return;}const db=await requirePool();await db.query(`INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[key,value]);}


// --- Ozon cloud browser worker queue -------------------------------------------------
const memAgentJobs = new Map();

export async function createOzonAgentJob(job) {
  const row = {
    id:String(job.id), url:String(job.url), sku:job.sku?String(job.sku):null,
    status:'pending', name:null, price:null, source:null, error:null, agent_id:null,
    created_at:new Date().toISOString(), claimed_at:null, finished_at:null
  };
  if(!hasPg){ memAgentJobs.set(row.id,row); return {...row}; }
  const db=await requirePool();
  const r=await db.query(`INSERT INTO ozon_agent_jobs(id,url,sku,status) VALUES($1,$2,$3,'pending') RETURNING *`,[row.id,row.url,row.sku]);
  return normalizeAgentJob(r.rows[0]);
}

export async function getOzonAgentJob(id) {
  if(!hasPg) return memAgentJobs.has(String(id)) ? {...memAgentJobs.get(String(id))} : null;
  const db=await requirePool();
  const r=await db.query('SELECT * FROM ozon_agent_jobs WHERE id=$1',[String(id)]);
  return r.rows[0]?normalizeAgentJob(r.rows[0]):null;
}

export async function claimOzonAgentJob(agentId) {
  agentId=String(agentId||'ozon-vps').slice(0,160);
  if(!hasPg){
    for(const row of [...memAgentJobs.values()].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))){
      if(row.status==='pending'){
        row.status='processing';row.agent_id=agentId;row.claimed_at=new Date().toISOString();return {...row};
      }
    }
    return null;
  }
  const db=await requirePool();
  const r=await db.query(`WITH picked AS (
      SELECT id FROM ozon_agent_jobs
      WHERE status='pending' AND created_at > NOW() - INTERVAL '15 minutes'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE ozon_agent_jobs j
    SET status='processing',agent_id=$1,claimed_at=NOW()
    FROM picked WHERE j.id=picked.id RETURNING j.*`,[agentId]);
  return r.rows[0]?normalizeAgentJob(r.rows[0]):null;
}

export async function completeOzonAgentJob(id,result={}) {
  const ok=!!result.ok;
  if(!hasPg){
    const row=memAgentJobs.get(String(id));if(!row)return null;
    Object.assign(row,{status:ok?'done':'error',name:result.name||null,price:result.price==null?null:Number(result.price),source:result.source||null,error:ok?null:String(result.error||'Ozon Agent error'),finished_at:new Date().toISOString()});
    return {...row};
  }
  const db=await requirePool();
  const r=await db.query(`UPDATE ozon_agent_jobs SET status=$2,name=$3,price=$4,source=$5,error=$6,finished_at=NOW() WHERE id=$1 RETURNING *`,[
    String(id),ok?'done':'error',result.name||null,result.price==null?null:Number(result.price),result.source||null,ok?null:String(result.error||'Ozon Agent error')
  ]);
  return r.rows[0]?normalizeAgentJob(r.rows[0]):null;
}

export async function touchOzonAgent(agentId,meta={}) {
  const value={agent_id:String(agentId||'ozon-vps').slice(0,160),last_seen:new Date().toISOString(),...meta};
  await setSetting('ozon_agent_status',value);
  return value;
}

export async function getOzonAgentStatus() {
  const value=await getSetting('ozon_agent_status').catch(()=>null);
  if(!value||!value.last_seen) return {online:false,last_seen:null,agent_id:null};
  const age=Date.now()-new Date(value.last_seen).getTime();
  return {...value,online:Number.isFinite(age)&&age<15000};
}

export async function cleanupOzonAgentJobs() {
  if(!hasPg){
    const cutoff=Date.now()-24*3600*1000;for(const [id,row] of memAgentJobs){if(new Date(row.created_at).getTime()<cutoff)memAgentJobs.delete(id);}return;
  }
  const db=await requirePool();
  await db.query(`DELETE FROM ozon_agent_jobs WHERE created_at < NOW() - INTERVAL '24 hours'`);
  await db.query(`UPDATE ozon_agent_jobs SET status='pending',agent_id=NULL,claimed_at=NULL WHERE status='processing' AND claimed_at < NOW() - INTERVAL '5 minutes'`);
}

function normalizeAgentJob(r){return r?{...r,price:r.price==null?null:Number(r.price)}:null;}

export async function resetAndImport(state){
  if(!state || !Array.isArray(state.products)) throw new Error('Invalid PriceWatch backup');
  if(!hasPg){mem={nextId:1,products:[],competitors:[],events:[],settings:new Map()};for(const p of state.products){const pr=await addProduct(normalizeImported(p));for(const c of (p.competitors||[]))await addCompetitor(pr.id,normalizeImported(c));}for(const e of (state.events||[]).slice(0,100))await addEvent(e.text||String(e));return;}
  const db=await requirePool();
  const client=await db.connect();
  try{await client.query('BEGIN');await client.query('TRUNCATE competitors, products, price_history, events RESTART IDENTITY CASCADE');await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  for(const p of state.products){const pr=await addProduct(normalizeImported(p));for(const c of (p.competitors||[]))await addCompetitor(pr.id,normalizeImported(c));}
  for(const e of (state.events||[]).slice(0,100)) await addEvent(e.text||String(e));
}
function normalizeImported(x){return {name:x.name||'Imported product',marketplace:x.marketplace||'WB',sku:x.sku||'',url:x.url||'',latest_price:num(x.latest_price ?? x.price),source_status:x.source_status||'import v8',updated_at:x.updated_at||new Date().toISOString()};}
