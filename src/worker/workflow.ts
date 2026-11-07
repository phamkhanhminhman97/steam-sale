import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { steamClient, SteamError } from './steam.ts';
import { recordPrices } from './store.ts';
import type { Deal } from '../lib/model.ts';

export class SyncDeals extends WorkflowEntrypoint<Env> {
  async run(event: WorkflowEvent<{probe?: boolean}>, step: WorkflowStep) {
    const run = event.instanceId;
    const at = Math.floor(new Date(event.timestamp).getTime() / 1000);
    const client = steamClient(this.env.STEAM_KEY);
    if (event.payload.probe) {
      return step.do('probe', async () => {
        const page = await client.page(0, 250);
        const body = JSON.stringify(page.items);
        await this.env.DATA.put(`probe/${run}.json`,body);
        return { total: page.total, rows: page.items.length, bytes: new TextEncoder().encode(body).byteLength };
      });
    }
    if (String(this.env.SYNC_ENABLED) !== 'true') return { skipped: 'disabled' };
    const acquired = await step.do('lock', async () => {
      const lease = JSON.stringify({run,until:at+7200});
      const r = await this.env.DB.prepare(`INSERT INTO meta(k,v) VALUES('sync_lock',?1)
        ON CONFLICT(k) DO UPDATE SET v=excluded.v WHERE json_extract(meta.v,'$.until') < ?2`).bind(lease,at).run();
      return r.meta.changes === 1;
    });
    if (!acquired) return { skipped: 'busy' };
    try {
      await step.do('start', async () => { await this.env.DB.prepare(`INSERT OR IGNORE INTO sync_runs(id,started_at,status) VALUES(?1,?2,'running')`).bind(run,at).run(); });
      const known = await step.do('known-sale-ids', async () => {
        const result = await this.env.DB.prepare('SELECT app_id FROM prices_current WHERE on_sale=1').all<{app_id:number}>();
        return result.results.map(r=>r.app_id);
      });
      const seen = new Set<number>();
      const parts: {key:string;size:number;count:number}[] = [];
      let total = 0, rawCount = 0;
      const savePart = async (key:string, rows:Deal[]) => {
        await recordPrices(this.env.DB,rows,run,at);
        // recordPrices fills lowest, so serialize after storing.
        const enriched = rows.map(d=>JSON.stringify(d)).join(',');
        const object = await this.env.DATA.put(key,enriched);
        if(!object) throw new Error('Snapshot part upload failed');
        return {key,size:object.size,count:rows.length};
      };
      for (let p=0;p<160;p++) {
        const page = await step.do(`page-${p}`, {retries:{limit:2,delay:'1 minute',backoff:'exponential'}}, async () => {
          let result;
          try { result = await client.page(p*250,250); }
          catch(e) {
            // A rate limit pauses the whole run; retry at the next scheduled hour.
            if (e instanceof SteamError && (e.kind==='limited' || e.kind==='schema')) throw new NonRetryableError(e.message);
            throw e;
          }
          const unique = [...new Map(result.items.filter(d=>!seen.has(d.id)).map(d=>[d.id,d])).values()];
          const part = await savePart(`snapshot/${run}/part-${p}.json`,unique);
          return { total:result.total, raw:result.rawCount, ids:result.ids, part };
        });
        total = page.total; rawCount += page.raw;
        page.ids.forEach(id=>seen.add(id)); parts.push(page.part);
        if ((p+1)*250 >= total) break;
        if (!page.raw || p===159) throw new NonRetryableError('Catalog exceeds free-tier collection budget');
      }
      // Offset pagination can skip a game still on sale. Confirm every known missing game directly.
      const missing = known.filter(id=>!seen.has(id));
      for (let p=0;p<missing.length;p+=100) {
        const part = await step.do(`reconcile-${p}`, async () => {
          const items = await client.items(missing.slice(p,p+100));
          await recordPrices(this.env.DB,items,run,at);
          return savePart(`snapshot/${run}/reconcile-${p}.json`,items.filter(d=>d.discount>0));
        });
        parts.push(part);
      }
      const count = parts.reduce((n,p)=>n+p.count,0);
      if (total>0 && !count) throw new NonRetryableError('No valid regional prices');
      // Tag names are cosmetic: if Steam refuses this one request, publish prices without them.
      const tags = await step.do('tags', async () => {
        try { return await client.tags(); }
        catch (e) { console.error(JSON.stringify({event:'tag_names_unavailable',reason:e instanceof SteamError?e.kind:'unknown'})); return {} as Record<string,string>; }
      });
      await step.do('publish', async () => {
        const first = await this.env.DB.prepare('SELECT min(first_at) AS at FROM prices_current').first<{at:number}>();
        const prefix = JSON.stringify({version:1,country:'VN',currency:'VND',fetchedAt:at,trackingSince:first?.at??at,source:'steam',total:count,tags}).slice(0,-1)+',"items":[';
        const selected = parts.filter(p=>p.count>0);
        const length = new TextEncoder().encode(prefix).byteLength + 2 + selected.reduce((n,p)=>n+p.size,0) + Math.max(0,selected.length-1);
        const stream = new FixedLengthStream(length);
        const writer = stream.writable.getWriter();
        const write = (async () => {
          try {
            await writer.write(new TextEncoder().encode(prefix));
            for(let n=0;n<selected.length;n++) {
              if(n) await writer.write(new TextEncoder().encode(','));
              const obj = await this.env.DATA.get(selected[n].key);
              if(!obj) throw new Error('Snapshot part missing');
              for await (const chunk of obj.body) await writer.write(chunk);
            }
            await writer.write(new TextEncoder().encode(']}')); await writer.close();
          } catch(e) { await writer.abort(e); throw e; }
        })();
        await Promise.all([write,this.env.DATA.put(`snapshot/${run}/all.json`,stream.readable,{httpMetadata:{contentType:'application/json'}})]);
        // Publish pointer only after the complete immutable snapshot exists.
        await this.env.DB.batch([
          this.env.DB.prepare("INSERT INTO meta(k,v) VALUES('current_run',?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(run),
          this.env.DB.prepare("UPDATE sync_runs SET status='complete',finished_at=?2,total=?3,fetched=?4 WHERE id=?1").bind(run,Math.floor(Date.now()/1000),total,rawCount),
        ]);
      });
      return {count,total};
    } catch(error) {
      await step.do('mark-failed', async () => { await this.env.DB.prepare("UPDATE sync_runs SET status='failed',finished_at=?2 WHERE id=?1").bind(run,Math.floor(Date.now()/1000)).run(); });
      throw error;
    } finally {
      await step.do('unlock', async () => { await this.env.DB.prepare("DELETE FROM meta WHERE k='sync_lock' AND json_extract(v,'$.run')=?1").bind(run).run(); });
    }
  }
}
