import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

test('Worker runtime: idempotent D1 writes, atomic snapshot, reconciliation and API validation',async()=>{
  const bundled=await build({entryPoints:['tests/runtime-worker.ts'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:*'],target:'es2022'});
  const steamItem=(id:number,off=50)=>({appid:id,success:1,name:`Game số ${id}`,best_purchase_option:{final_price_in_cents:String((100000*(1-off/100))*100),original_price_in_cents:'10000000',discount_pct:off,formatted_final_price:'50.000₫'},reviews:{summary_filtered:{review_count:100,percent_positive:90}}});
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-11-07',bindings:{SYNC_ENABLED:'true'},d1Databases:['DB'],r2Buckets:['DATA'],workflows:{SYNC:{name:'steam-sale-sync',className:'SyncDeals'}},outboundService:async(request)=>{
    const url=new URL(request.url);
    if(url.pathname.includes('GetTagList'))return Response.json({response:{tags:[{tagid:9,name:'Chiến thuật'}]}});
    if(url.pathname.includes('/Query/'))return Response.json({response:{metadata:{total_matching_records:4},store_items:[steamItem(1),steamItem(1),steamItem(2)]}});
    const args=JSON.parse(url.searchParams.get('input_json')!);
    return Response.json({response:{store_items:args.ids.map(({appid}:{appid:number})=>steamItem(appid,appid===3?0:50))}});
  }}));
  try {
    const db=await mf.getD1Database('DB');
    const migration=await readFile('migrations/0001_init.sql','utf8');
    for(const statement of migration.split(';').filter(s=>s.trim()))await db.prepare(statement).run();
    const d={id:3,name:'Đã hết giảm',price:50000,original:100000,discount:50,endsAt:100,rating:90,reviews:100,players:[],tags:[],image:null,launch:false,lowest:null,observedAt:100};
    const record=(items:unknown[],run:string,at:number)=>mf.dispatchFetch('http://local/test/record',{method:'POST',body:JSON.stringify({items,run,at})});
    assert.equal((await (await record([d,{...d,id:4}], 'seed',100)).json() as {changed:number}).changed,2);
    assert.equal((await (await record([d], 'seed',100)).json() as {changed:number}).changed,0);
    assert.equal((await db.prepare('SELECT count(*) n FROM price_history').first<{n:number}>())?.n,2);
    const env=await mf.getBindings();
    const workflow=env.SYNC as {create(args:{id:string}):Promise<{status():Promise<{status:string;error?:unknown}>}>};
    const instance=await workflow.create({id:'test-sync'});
    let status:{status:string;error?:unknown}={status:'queued'};
    for(let n=0;n<200;n++){status=await instance.status();if(['complete','errored','terminated'].includes(status.status))break;await new Promise(r=>setTimeout(r,30));}
    assert.equal(status.status,'complete',JSON.stringify(status));
    const r=await mf.dispatchFetch('http://local/api/deals?cache-bust=anything');
    assert.equal(r.status,200);const body=await r.json() as {items:{id:number}[]};
    assert.deepEqual(body.items.map(d=>d.id).sort(),[1,2,4]);
    assert.equal((body as unknown as {tags:Record<string,string>}).tags['9'],'Chiến thuật');
    assert.equal((await db.prepare('SELECT on_sale FROM prices_current WHERE app_id=3').first<{on_sale:number}>())?.on_sale,0);
    assert.equal((await db.prepare("SELECT count(*) n FROM meta WHERE k='sync_lock'").first<{n:number}>())?.n,0);
    assert.equal((await mf.dispatchFetch('http://local/api/history/1')).status,200);
    assert.equal((await mf.dispatchFetch('http://local/api/history/1%20OR%201=1')).status,404);
    assert.equal((await mf.dispatchFetch('http://local/api/deals',{method:'POST'})).status,405);
    assert.equal((await mf.dispatchFetch('http://local/api/anything')).status,404);
    assert.equal((await mf.dispatchFetch('http://local/api/deals',{method:'HEAD'})).status,200);
    const health = await mf.dispatchFetch('http://local/api/health');
    assert.equal(health.status,200);
    const healthBody = await health.json() as {status:string;current_run:string;last_sync:{id:string;status:string}};
    assert.equal(healthBody.status,'ok');
    assert.equal(healthBody.current_run,'test-sync');
    assert.equal(healthBody.last_sync.id,'test-sync');
    assert.equal(healthBody.last_sync.status,'complete');
    const etag = r.headers.get('etag');
    if (etag) {
      const notMod = await mf.dispatchFetch('http://local/api/deals', { headers: { 'if-none-match': etag } });
      assert.equal(notMod.status, 304);
    }
  } finally {await mf.dispose();}
});
