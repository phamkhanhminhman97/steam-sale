export { SyncDeals } from './workflow.ts';

const jsonHeaders = {'Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
export default {
  async fetch(request,env,ctx) {
    const url = new URL(request.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if(request.method!=='GET' && request.method!=='HEAD') return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
    const isHead = request.method === 'HEAD';
    if(url.pathname === '/api/health') {
      try {
        const run = await env.DB.prepare("SELECT v FROM meta WHERE k='current_run'").first<{v:string}>();
        const lastSync = await env.DB.prepare("SELECT id,started_at,finished_at,status,total,fetched FROM sync_runs ORDER BY started_at DESC LIMIT 1").first<{id:string;started_at:number;finished_at:number;status:string;total:number;fetched:number}>();
        const res = Response.json({
          status: 'ok',
          current_run: run?.v ?? null,
          last_sync: lastSync ?? null,
          version: '0.1.0'
        }, { headers: { ...jsonHeaders, 'Cache-Control': 'no-cache, no-store' } });
        return isHead ? new Response(null, { status: 200, headers: res.headers }) : res;
      } catch {
        const res = Response.json({
          status: 'degraded',
          error: 'Database check failed',
          version: '0.1.0'
        }, { status: 503, headers: { ...jsonHeaders, 'Cache-Control': 'no-cache, no-store' } });
        return isHead ? new Response(null, { status: 503, headers: res.headers }) : res;
      }
    }
    const history = /^\/api\/history\/([1-9]\d{0,9})$/.exec(url.pathname);
    if(url.pathname!=='/api/deals' && !history) return new Response('Not found',{status:404});
    const cacheKey = new Request(`${url.origin}${url.pathname}`);
    const clientEtag = request.headers.get('if-none-match');
    const cached = await caches.default.match(cacheKey);
    if(cached && clientEtag && cached.headers.get('etag') === clientEtag) return new Response(null, { status: 304, headers: cached.headers });
    if(cached) return isHead ? new Response(null, { status: 200, headers: cached.headers }) : cached;
    try {
      if(history) {
        const r = await env.DB.prepare('SELECT at,price,original,discount FROM (SELECT at,price,original,discount FROM price_history WHERE app_id=?1 ORDER BY at DESC LIMIT 500) ORDER BY at').bind(Number(history[1])).all();
        const result = Response.json({items:r.results},{headers:{...jsonHeaders,'Cache-Control':'public, max-age=3600'}});
        ctx.waitUntil(caches.default.put(cacheKey,result.clone()));
        return isHead ? new Response(null, { status: 200, headers: result.headers }) : result;
      }
      const run = await env.DB.prepare("SELECT v FROM meta WHERE k='current_run'").first<{v:string}>();
      if(run) {
        const obj = await env.DATA.get(`snapshot/${run.v}/all.json`);
        if(obj && clientEtag && obj.httpEtag === clientEtag) return new Response(null, { status: 304, headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=300', ETag: obj.httpEtag } });
        if(obj) {
          const result = new Response(obj.body,{headers:{...jsonHeaders,'Cache-Control':'public, max-age=300',ETag:obj.httpEtag}});
          ctx.waitUntil(caches.default.put(cacheKey,result.clone()));
          return isHead ? new Response(null, { status: 200, headers: result.headers }) : result;
        }
      }
      // Honest bootstrap: checked-in snapshot keeps its original timestamp and source marker.
      const fallback = await env.ASSETS.fetch(new Request(new URL('/data/deals.json',request.url)));
      if(fallback.ok) return isHead ? new Response(null, { status: 200, headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=300' } }) : new Response(fallback.body,{headers:{...jsonHeaders,'Cache-Control':'public, max-age=300'}});
      return Response.json({error:'Dữ liệu chưa sẵn sàng'},{status:503,headers:jsonHeaders});
    } catch {
      console.error(JSON.stringify({event:'catalog_read_failed',path:url.pathname}));
      return Response.json({error:'Chưa tải được dữ liệu. Vui lòng thử lại.'},{status:503,headers:jsonHeaders});
    }
  },
  async scheduled(event,env) {
    if(String(env.SYNC_ENABLED)!=='true') return;
    await env.SYNC.create({id:`hour-${Math.floor(event.scheduledTime/3600000)}`});
  },
} satisfies ExportedHandler<Env>;
