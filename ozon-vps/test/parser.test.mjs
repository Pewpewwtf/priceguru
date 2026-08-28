import assert from 'node:assert/strict';
import {parseComposer,parsePriceText,money} from '../ozon-parser.js';
assert.equal(money('12 990 ₽'),12990);
assert.equal(parsePriceText('сегодня\n12 990 ₽\nзавтра'),12990);
const page={widgetStates:{'webProductHeading-1':JSON.stringify({title:'Бизиборд'}),'webPrice-2':JSON.stringify({cardPrice:'4 599 ₽'})}};
assert.deepEqual(parseComposer(page,'1551955042'),{name:'Бизиборд',price:4599,source:'composer:webPrice'});
console.log('Ozon VPS parser tests: OK');
