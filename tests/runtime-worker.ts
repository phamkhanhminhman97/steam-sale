import app from '../src/worker/index.ts';
import {recordPrices} from '../src/worker/store.ts';
export {SyncDeals} from '../src/worker/workflow.ts';
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext) {
    const path=new URL(request.url).pathname;
    if(path==='/test/record') {
      const body=await request.json<{items:Parameters<typeof recordPrices>[1];run:string;at:number}>();
      return Response.json(await recordPrices(env.DB,body.items,body.run,body.at));
    }
    return app.fetch(request,env,ctx);
  },
};
