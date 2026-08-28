import pg from 'pg';
const { Pool } = pg;

const hasPg = !!process.env.DATABASE_URL;
let pool = null;
let dbStatus = hasPg ? 'connecting' : 'memory';
let dbError = null;
let mem = { nextId: 1, products: [], competitors: [], events: [], settings: new Map() };

function sslConfig() {
  const v = String(process.env.PGSSL || '').toLowerCase();
  if (!v || v === 'false' || v === '0' || v === 'disable') return false;
  return { rejectUnauthorized: false };
}

export async function initDb() {
  if (!hasPg) { dbStatus = 'memory'; return; }
  dbStatus = 'connecting'; dbError = null;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig(), connectionTimeoutMillis: 10000 });
  try {
    await pool.query(`
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
  `);
    dbStatus = 'postgres';
  } catch (e) {
    dbStatus = 'error';
    dbError = e?.message || String(e);
    try { await pool?.end(); } catch {}
    pool = null;
    throw e;
  }
}

export function databaseHealth(){ return { configured:hasPg, status:dbStatus, error:dbError }; }

function num(v) { return v == null ? null : Number(v); }

export async function getState() {
  if (!hasPg) {
    const products = mem.products.map(p => ({
      ...p,
      latest_price: num(p.latest_price),
      competitors: mem.competitors.filter(c => c.product_id === p.id).map(c => ({...c, latest_price:num(c.latest_price), history: c.history || []}))
    }));
    return { version: 9, products, events: mem.events.slice(0,100) };
  }
  const [pRes, cRes, hRes, eRes] = await Promise.all([
    pool.query('SELECT * FROM products ORDER BY id DESC'),
    pool.query('SELECT * FROM competitors ORDER BY id ASC'),
    pool.query(`SELECT item_type,item_id,price,created_at FROM price_history
                WHERE created_at > NOW() - INTERVAL '90 days'
                ORDER BY created_at ASC`),
    pool.query('SELECT text,created_at FROM events ORDER BY created_at DESC LIMIT 100')
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
    version: 9,
    products: pRes.rows.map(p => ({...p, id:Number(p.id), latest_price:num(p.latest_price), history:histories.get(`product:${p.id}`)||[], competitors:byProduct.get(String(p.id))||[]})),
    events: eRes.rows
  };
}

export async function addEvent(text) {
  if (!text) return;
  if (!hasPg) { mem.events.unshift({ text, created_at:new Date().toISOString() }); mem.events = mem.events.slice(0,100); return; }
  await pool.query('INSERT INTO events(text) VALUES($1)', [text]);
}

export async function addProduct(item) {
  if (!hasPg) {
    const existing = mem.products.find(p => p.url === item.url);
    if (existing) return { ...existing, duplicate:true };
    const row = { id:mem.nextId++, ...item, updated_at:item.updated_at||new Date().toISOString(), created_at:new Date().toISOString() };
    mem.products.unshift(row); row.history=[Number(item.latest_price)]; return row;
  }
  const r = await pool.query(`INSERT INTO products(name,marketplace,sku,url,latest_price,source_status,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,NOW())) ON CONFLICT(url) DO NOTHING RETURNING *`,
      [item.name,item.marketplace,item.sku||null,item.url,item.latest_price,item.source_status||null,item.updated_at||null]);
  if (!r.rows[0]) {
    const ex = await pool.query('SELECT * FROM products WHERE url=$1',[item.url]);
    return {...ex.rows[0], id:Number(ex.rows[0].id), latest_price:num(ex.rows[0].latest_price), duplicate:true};
  }
  const row=r.rows[0];
  if (item.latest_price != null) await pool.query(`INSERT INTO price_history(item_type,item_id,price) VALUES('product',$1,$2)`,[row.id,item.latest_price]);
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
  const r=await pool.query(`INSERT INTO competitors(product_id,name,marketplace,sku,url,latest_price,source_status,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,NOW())) ON CONFLICT(product_id,url) DO NOTHING RETURNING *`,
      [productId,item.name,item.marketplace,item.sku||null,item.url,item.latest_price,item.source_status||null,item.updated_at||null]);
  if(!r.rows[0]) {
    const ex=await pool.query('SELECT * FROM competitors WHERE product_id=$1 AND url=$2',[productId,item.url]);
    return {...ex.rows[0],id:Number(ex.rows[0].id),product_id:Number(ex.rows[0].product_id),latest_price:num(ex.rows[0].latest_price),duplicate:true};
  }
  const row=r.rows[0];
  if(item.latest_price!=null) await pool.query(`INSERT INTO price_history(item_type,item_id,price) VALUES('competitor',$1,$2)`,[row.id,item.latest_price]);
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
  const oldRes=await pool.query(`SELECT latest_price FROM ${table} WHERE id=$1`,[id]); if(!oldRes.rows[0]) return null; const old=num(oldRes.rows[0].latest_price);
  const r=await pool.query(`UPDATE ${table} SET name=$2, marketplace=$3, sku=$4, latest_price=$5, source_status=$6, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id,item.name,item.marketplace,item.sku||null,item.latest_price,item.source_status||null]);
  if(item.latest_price!=null && (old==null || Math.abs(old-Number(item.latest_price))>=0.01)) await pool.query(`INSERT INTO price_history(item_type,item_id,price) VALUES($1,$2,$3)`,[type,id,item.latest_price]);
  return {old,row:r.rows[0]};
}

export async function deleteProduct(id){id=Number(id);if(!hasPg){mem.products=mem.products.filter(x=>x.id!==id);mem.competitors=mem.competitors.filter(x=>x.product_id!==id);return;}await pool.query('DELETE FROM products WHERE id=$1',[id]);}
export async function deleteCompetitor(id){id=Number(id);if(!hasPg){mem.competitors=mem.competitors.filter(x=>x.id!==id);return;}await pool.query('DELETE FROM competitors WHERE id=$1',[id]);}

export async function getAllItems(){
  if(!hasPg) return {products:mem.products.map(x=>({...x})), competitors:mem.competitors.map(x=>({...x}))};
  const [p,c]=await Promise.all([pool.query('SELECT * FROM products ORDER BY id'),pool.query('SELECT * FROM competitors ORDER BY id')]);
  return {products:p.rows.map(x=>({...x,id:Number(x.id),latest_price:num(x.latest_price)})),competitors:c.rows.map(x=>({...x,id:Number(x.id),product_id:Number(x.product_id),latest_price:num(x.latest_price)}))};
}

export async function getSetting(key){if(!hasPg)return mem.settings.get(key)??null;const r=await pool.query('SELECT value FROM settings WHERE key=$1',[key]);return r.rows[0]?.value??null;}
export async function setSetting(key,value){if(!hasPg){mem.settings.set(key,value);return;}await pool.query(`INSERT INTO settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[key,value]);}

export async function resetAndImport(state){
  if(!state || !Array.isArray(state.products)) throw new Error('Invalid PriceWatch backup');
  if(!hasPg){mem={nextId:1,products:[],competitors:[],events:[],settings:new Map()};for(const p of state.products){const pr=await addProduct(normalizeImported(p));for(const c of (p.competitors||[]))await addCompetitor(pr.id,normalizeImported(c));}for(const e of (state.events||[]).slice(0,100))await addEvent(e.text||String(e));return;}
  const client=await pool.connect();
  try{await client.query('BEGIN');await client.query('TRUNCATE competitors, products, price_history, events RESTART IDENTITY CASCADE');await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  for(const p of state.products){const pr=await addProduct(normalizeImported(p));for(const c of (p.competitors||[]))await addCompetitor(pr.id,normalizeImported(c));}
  for(const e of (state.events||[]).slice(0,100)) await addEvent(e.text||String(e));
}
function normalizeImported(x){return {name:x.name||'Imported product',marketplace:x.marketplace||'WB',sku:x.sku||'',url:x.url||'',latest_price:num(x.latest_price ?? x.price),source_status:x.source_status||'import v8',updated_at:x.updated_at||new Date().toISOString()};}

export function usingPostgres(){return hasPg && dbStatus==='postgres' && !!pool;}
