import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {steamClient} from '../src/worker/steam.ts';
import type {Catalog,Deal} from '../src/lib/model.ts';

const fixture=process.argv.includes('--fixture');
let items:Deal[]=[],fetchedAt:number;
if(fixture){
  const raw=JSON.parse(gunzipSync(await readFile(new URL('../fixtures/sale-vn-b.json.gz',import.meta.url))).toString());
  fetchedAt=raw.fetched_at;
  items=raw.items.map((d:Record<string,unknown>)=>({id:d.i,name:d.n,price:d.f,original:d.o,discount:d.d,endsAt:d.e,rating:d.r,reviews:d.c,players:d.p,tags:[],image:null,launch:/launch|prepurchase/.test(String(d.k)),lowest:null,observedAt:fetchedAt})) as Deal[];
}else{
  const client=steamClient(process.env.STEAM_KEY),seen=new Set<number>();let total=0;
  for(let start=0;start<40000;start+=1000){
    const page=await client.page(start,1000);total=page.total;
    for(const d of page.items)if(!seen.has(d.id)){items.push(d);seen.add(d.id);}
    console.log(JSON.stringify({page:start/1000+1,received:page.rawCount,collected:items.length,total}));
    if(start+1000>=total)break;
  }
  if(!items.length)throw new Error('Steam returned no valid VN prices; previous snapshot kept');
  fetchedAt=Math.floor(Date.now()/1000);
}
const tags:Record<string,string>={};
if(!fixture){
  const res=await fetch('https://api.steampowered.com/IStoreService/GetTagList/v1/?language=vietnamese');
  if(res.ok){const data=await res.json() as {response?:{tags?:{tagid:number;name:string}[]}};const used=new Set(items.flatMap(d=>d.tags));for(const tag of data.response?.tags??[])if(used.has(tag.tagid))tags[tag.tagid]=tag.name;}
}
const out:Catalog={version:1,country:'VN',currency:'VND',source:fixture?'fixture':'steam',fetchedAt,trackingSince:null,total:items.length,items,tags};
await mkdir(new URL('../public/data/',import.meta.url),{recursive:true});
await writeFile(new URL('../public/data/deals.json',import.meta.url),JSON.stringify(out));
console.log(JSON.stringify({source:out.source,games:items.length,fetchedAt:new Date(fetchedAt*1000).toISOString()}));
