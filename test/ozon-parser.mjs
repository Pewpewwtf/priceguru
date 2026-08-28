import assert from 'node:assert/strict';
import { parseOzonComposer, ozonPriceToNumber, ozonWidgetNames } from '../ozon-parser.js';

const fixture={
  widgetStates:{
    'webProductHeading-1551955042-default-1': JSON.stringify({title:'Бизиборд для малышей'}),
    'webPrice-1551955042-default-1': JSON.stringify({cardPrice:'1 749 ₽',price:'1 999 ₽',originalPrice:'2 499 ₽',isAvailable:true}),
    'webGallery-1551955042-default-1': JSON.stringify({sku:1551955042})
  },
  seo:{title:'Fallback title'}
};
assert.deepEqual(parseOzonComposer(fixture,'1551955042'),{
  name:'Бизиборд для малышей',price:1749,sourceWidget:'webPrice'
});
assert.equal(ozonPriceToNumber('150 000 ₽'),150000);
assert.equal(ozonPriceToNumber({text:'7 990 ₽'}),7990);
assert.ok(ozonWidgetNames(fixture).includes('webPrice'));

const nested={widgetStates:{
  'someProductWidget-1':JSON.stringify({product:{id:1551955042,title:'Nested product',finalPrice:'2 345 ₽'}})
}};
assert.deepEqual(parseOzonComposer(nested,'1551955042'),{
  name:'Nested product',price:2345,sourceWidget:'recursive'
});

const noPrice={widgetStates:{'webProductHeading-1':JSON.stringify({title:'No price'})}};
assert.equal(parseOzonComposer(noPrice,'1'),null);
console.log('Ozon composer parser tests: OK');
