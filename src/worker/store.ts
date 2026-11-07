import type { Deal } from '../lib/model.ts';

export interface Current { app_id: number; price: number; original: number; discount: number; on_sale: number; low: number; first_at: number }
export function priceChanged(d: Deal, old?: Current) {
  return !old || d.price !== old.price || d.original !== old.original || d.discount !== old.discount || Number(d.discount > 0) !== old.on_sale;
}
export async function recordPrices(db: D1Database, deals: Deal[], run: string, at: number) {
  if (!deals.length) return { changed: 0, written: 0 };
  const ids = JSON.stringify(deals.map(d => d.id));
  const previous = await db.prepare('SELECT * FROM prices_current WHERE app_id IN (SELECT value FROM json_each(?1))').bind(ids).all<Current>();
  const map = new Map(previous.results.map(p => [p.app_id, p]));
  const changes = deals.filter(d => priceChanged(d, map.get(d.id)));
  for (const d of deals) d.lowest = Math.min(d.price, map.get(d.id)?.low ?? d.price);
  if (!changes.length) return { changed: 0, written: 0 };
  const json = JSON.stringify(changes.map(d => [d.id, d.price, d.original, d.discount]));
  // History first + current second in one atomic batch. Workflow retries cannot add duplicate observations.
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO price_history(app_id,run_id,at,price,original,discount)
      SELECT json_extract(value,'$[0]'),?2,?3,json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]') FROM json_each(?1)`).bind(json,run,at),
    db.prepare(`INSERT INTO prices_current(app_id,price,original,discount,on_sale,low,first_at,changed_at)
      SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),json_extract(value,'$[2]'),json_extract(value,'$[3]'),
      json_extract(value,'$[3]')>0,json_extract(value,'$[1]'),?2,?2 FROM json_each(?1) WHERE true
      ON CONFLICT(app_id) DO UPDATE SET price=excluded.price, original=excluded.original,
      discount=excluded.discount,on_sale=excluded.on_sale,low=min(prices_current.low,excluded.low),changed_at=excluded.changed_at`).bind(json,at),
  ]);
  return { changed: changes.length, written: results.reduce((sum,r) => sum + r.meta.rows_written,0) };
}
