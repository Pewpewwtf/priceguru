function parseJsonMaybe(v){
  if(v==null) return null;
  if(typeof v==='object') return v;
  if(typeof v!=='string') return null;
  const s=v.trim();
  if(!s || !/^[\[{]/.test(s)) return null;
  try{return JSON.parse(s)}catch{return null}
}

function widgetName(key){return String(key||'').split('-')[0]}
function widget(page,name){
  const ws=page?.widgetStates||{};
  const key=Object.keys(ws).find(k=>widgetName(k)===name);
  return key ? parseJsonMaybe(ws[key]) : null;
}

export function money(v){
  if(v==null) return null;
  if(typeof v==='number'){
    if(!Number.isFinite(v)||v<=0)return null;
    return v>=1000000?Math.round(v/100):Math.round(v*100)/100;
  }
  if(typeof v==='object'){
    for(const k of ['text','value','amount','price']){const n=money(v[k]);if(n)return n;}
    return null;
  }
  const s=String(v).replace(/\u00a0/g,' ').trim();
  const digits=s.replace(/[^0-9]/g,'');
  if(!digits)return null;
  const n=Number(digits);
  return Number.isFinite(n)&&n>0?n:null;
}

function recursive(root){
  const q=[root];let seen=0;
  while(q.length&&seen<20000){
    const x=q.shift();seen++;
    if(!x||typeof x!=='object')continue;
    const name=x.title||x.name||x.productTitle||'';
    for(const k of ['cardPrice','finalPrice','priceWithSale','salePrice','price']){
      const p=money(x[k]);
      if(p&&p>=10&&p<=10000000&&(name||x.id||x.sku||x.productId))return {name:String(name||''),price:p};
    }
    for(const v of Object.values(x)){
      if(v&&typeof v==='object')q.push(v);
      else if(typeof v==='string'){const y=parseJsonMaybe(v);if(y)q.push(y);}
    }
  }
  return null;
}

export function parseComposer(page,sku=''){
  if(!page||typeof page!=='object')return null;
  const h=widget(page,'webProductHeading');
  const p=widget(page,'webPrice');
  const name=h?.title||h?.name||page?.seo?.title||`Ozon ${sku}`;
  for(const v of [p?.cardPrice,p?.price,p?.finalPrice,p?.salePrice,p?.priceWithSale]){
    const price=money(v);if(price&&price>=10&&price<=10000000)return {name,price,source:'composer:webPrice'};
  }
  const found=recursive({widgetStates:Object.fromEntries(Object.entries(page.widgetStates||{}).map(([k,v])=>[k,parseJsonMaybe(v)??v])),seo:page.seo,sku});
  if(found?.price)return {name:found.name||name,price:found.price,source:'composer:recursive'};
  return null;
}

export function parsePriceText(text){
  if(!text)return null;
  const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  for(const line of lines){
    const m=line.match(/(\d{1,3}(?:[ \u00a0]\d{3})+|\d{2,7})(?:[,.]\d{1,2})?\s*₽/);
    if(!m)continue;
    const n=money(m[0]);if(n&&n>=10&&n<=10000000)return n;
  }
  return null;
}
