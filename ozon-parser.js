function widgetName(key){return String(key||'').split('-')[0]}

function parseJsonMaybe(v){
  if(v==null) return null;
  if(typeof v==='object') return v;
  if(typeof v!=='string') return null;
  const s=v.trim();
  if(!s || !/^[\[{]/.test(s)) return null;
  try{return JSON.parse(s)}catch{return null}
}

function widget(page,name){
  const ws=page?.widgetStates||{};
  const key=Object.keys(ws).find(k=>widgetName(k)===name);
  return key ? parseJsonMaybe(ws[key]) : null;
}

function widgets(page,name){
  const ws=page?.widgetStates||{};
  return Object.keys(ws).filter(k=>widgetName(k)===name).map(k=>parseJsonMaybe(ws[k])).filter(Boolean);
}

export function ozonPriceToNumber(v){
  if(v==null) return null;
  if(typeof v==='number'){
    if(!Number.isFinite(v)||v<=0) return null;
    // Ozon sometimes serializes monetary amounts in kopecks in non-UI payloads.
    return v>=1000000 ? Math.round(v/100) : Math.round(v*100)/100;
  }
  if(typeof v==='object'){
    for(const k of ['text','value','amount','price']){
      const n=ozonPriceToNumber(v[k]); if(n) return n;
    }
    return null;
  }
  const s=String(v).replace(/\u00a0/g,' ').trim();
  const digits=s.replace(/[^0-9]/g,'');
  if(!digits) return null;
  const n=Number(digits);
  return Number.isFinite(n)&&n>0?n:null;
}

function recursiveProduct(root){
  if(!root||typeof root!=='object') return null;
  const q=[root]; let scanned=0;
  while(q.length&&scanned<15000){
    const x=q.shift();scanned++;
    if(!x||typeof x!=='object')continue;
    const name=x.title||x.name||x.productTitle||null;
    for(const k of ['cardPrice','finalPrice','priceWithSale','salePrice','price']){
      const p=ozonPriceToNumber(x[k]);
      if(p&&p>=10&&p<=10000000&&(name||x.id||x.sku||x.productId)) return {name:name?String(name):'',price:p};
    }
    for(const v of Object.values(x)){
      if(v&&typeof v==='object') q.push(v);
      else if(typeof v==='string'){
        const parsed=parseJsonMaybe(v); if(parsed) q.push(parsed);
      }
    }
  }
  return null;
}

export function parseOzonComposer(page,sku=''){
  if(!page||typeof page!=='object') return null;
  const heading=widget(page,'webProductHeading');
  const priceWidget=widget(page,'webPrice');
  const gallery=widget(page,'webGallery');
  const name=heading?.title||heading?.name||page?.seo?.title||null;
  const candidates=[
    priceWidget?.cardPrice,
    priceWidget?.price,
    priceWidget?.finalPrice,
    priceWidget?.salePrice,
    priceWidget?.priceWithSale,
  ];
  for(const v of candidates){
    const price=ozonPriceToNumber(v);
    if(price&&price>=10&&price<=10000000) return {name:name||`Ozon ${sku}`,price,sourceWidget:'webPrice'};
  }
  // Some layouts move price into another widget; parse every serialized widget as a fallback.
  const found=recursiveProduct({
    widgetStates:Object.fromEntries(Object.entries(page.widgetStates||{}).map(([k,v])=>[k,parseJsonMaybe(v)??v])),
    sku:gallery?.sku||sku,
    seo:page.seo
  });
  if(found?.price) return {name:found.name||name||`Ozon ${sku}`,price:found.price,sourceWidget:'recursive'};
  return null;
}

export function ozonWidgetNames(page){
  return [...new Set(Object.keys(page?.widgetStates||{}).map(widgetName))].slice(0,60);
}

export const __test={widgetName,widget,widgets,parseJsonMaybe,recursiveProduct};
