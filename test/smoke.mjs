import assert from 'node:assert/strict';
import { addProduct, addCompetitor, getState, usingPostgres } from '../db.js';
import { __test } from '../collectors.js';

if (usingPostgres()) throw new Error('Run smoke test without DATABASE_URL');
assert.equal(__test.normalizeMoney('150 000 ₽'), 150000);
assert.equal(__test.normalizeMoney(799000,{kopecks:true}), 7990);
assert.equal(__test.parsePriceText('сейчас 7 990 ₽, раньше 9 999 ₽'), 7990);
assert.equal(__test.extractWbSku(new URL('https://www.wildberries.ru/catalog/271423875/detail.aspx')), '271423875');
assert.equal(__test.extractOzonSku(new URL('https://www.ozon.ru/product/foo-bar-123456789/')), '123456789');
const p=await addProduct({name:'Test',marketplace:'WB',sku:'271423875',url:'https://www.wildberries.ru/catalog/271423875/detail.aspx',latest_price:1000,source_status:'test'});
await addCompetitor(p.id,{name:'Comp',marketplace:'WB',sku:'271423876',url:'https://www.wildberries.ru/catalog/271423876/detail.aspx',latest_price:900,source_status:'test'});
const s=await getState();
assert.equal(s.products.length,1);
assert.equal(s.products[0].competitors.length,1);
assert.equal(s.products[0].competitors[0].latest_price,900);
console.log('PriceWatch v9 smoke test: OK');
