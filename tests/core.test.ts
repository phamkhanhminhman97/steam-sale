import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaults,readFilters,filterParams,selectDeals} from '../src/lib/filters.ts';
import {parseItem,steamClient,SteamError} from '../src/worker/steam.ts';
import type {Deal} from '../src/lib/model.ts';

const game=(id:number,fields:Partial<Deal>={}):Deal=>({id,name:'Cánh cửa',price:50000,original:100000,discount:50,endsAt:3000,rating:90,reviews:500,players:[2,9],tags:[1],image:null,launch:false,lowest:null,observedAt:1000,...fields});
test('filters compose, search ignores accents, expired and launch deals hidden by default',()=>{
  const items=[game(1),game(2,{launch:true}),game(3,{endsAt:900}),game(4,{price:100001}),game(5,{reviews:1})];
  assert.deepEqual(selectDeals(items,{...defaults,q:'canh cua',max:100000,mode:'coop'},new Set(),1000).map(d=>d.id),[1]);
});
test('saved list, sorting and URL round trip',()=>{
  const f={...defaults,saved:true,max:100000,sort:'price',q:'cửa'};
  assert.deepEqual(readFilters(filterParams(f)),f);
  assert.deepEqual(selectDeals([game(1),game(2,{price:20000}),game(3)],f,new Set([1,2]),1000).map(d=>d.id),[2,1]);
});
test('malformed filter params bounded safely',()=>{
  const f=readFilters('?max=NaN&rating=500&sort=__proto__&reviews=-1&mode=whatever');
  assert.equal(f.max,0);assert.equal(f.minRating,100);assert.equal(f.sort,'popular');assert.equal(f.minReviews,0);assert.equal(f.mode,'all');
});
const item={appid:1,name:'Tên có dấu',success:1,best_purchase_option:{final_price_in_cents:'5000000',original_price_in_cents:'10000000',discount_pct:50,formatted_final_price:'50.000₫',active_discounts:[{discount_end_date:2000}]},assets:{asset_url_format:'steam/apps/1/${FILENAME}?t=1',small_capsule:'hash/capsule.jpg'}};
test('Steam prices divide minor units, resolve hashed assets and preserve unavailable price',()=>{
  assert.equal(parseItem(item,1000)?.price,50000);
  assert.match(parseItem(item,1000)!.image!,/hash\/capsule.jpg/);
  assert.equal(parseItem({appid:1,success:1,name:'No price'},1000),null);
  assert.throws(()=>parseItem({...item,best_purchase_option:{...item.best_purchase_option,formatted_final_price:'$2.00'}},1000),SteamError);
});
test('Steam hidden discount honored, no-sale price has original = final',()=>{
  const d=parseItem({...item,best_purchase_option:{...item.best_purchase_option,hide_discount_pct_for_compliance:true}},1000);
  assert.equal(d?.discount,0);
  const x=parseItem({...item,best_purchase_option:{final_price_in_cents:'10000000',formatted_final_price:'100.000₫'}},1000);
  assert.equal(x?.original,100000);
});
test('Steam rate limits detected for HTTP and x-eresult without exposing key',async()=>{
  for(const response of [new Response('',{status:429}),new Response('{}',{headers:{'x-eresult':'84'}}),new Response('{}',{headers:{'x-eresult':'25'}})]) {
    const client=steamClient('private',async()=>response);
    await assert.rejects(client.page(0),e=>e instanceof SteamError&&e.kind==='limited'&&!e.message.includes('private'));
  }
});
test('Steam schema failures do not silently produce an empty catalog',async()=>{
  const client=steamClient(undefined,async()=>Response.json({response:{}}));
  await assert.rejects(client.page(0),e=>e instanceof SteamError&&e.kind==='schema');
});
test('Steam tag names parsed and malformed lists rejected',async()=>{
  const ok=steamClient(undefined,async()=>Response.json({response:{tags:[{tagid:9,name:'Chiến thuật'},{tagid:'x',name:'bad'}]}}));
  assert.deepEqual(await ok.tags(),{'9':'Chiến thuật'});
  await assert.rejects(steamClient(undefined,async()=>Response.json({response:{}})).tags(),e=>e instanceof SteamError&&e.kind==='schema');
});
