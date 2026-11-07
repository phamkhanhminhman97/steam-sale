import type { Deal } from '../lib/model.ts';

interface SteamItem {
  appid?: number; id?: number; success?: number; name?: string; type?: number;
  categories?: { supported_player_categoryids?: number[] };
  tagids?: number[];
  assets?: { asset_url_format?: string; small_capsule?: string; header?: string };
  reviews?: { summary_filtered?: { percent_positive?: number; review_count?: number } };
  best_purchase_option?: {
    final_price_in_cents?: string; original_price_in_cents?: string; discount_pct?: number;
    hide_discount_pct_for_compliance?: boolean; price_cannot_be_displayed_as_discount?: boolean;
    formatted_final_price?: string;
    active_discounts?: { discount_end_date?: number; discount_description?: string }[];
  };
}
export class SteamError extends Error {
  kind: 'limited' | 'unavailable' | 'schema';
  constructor(kind: 'limited' | 'unavailable' | 'schema') { super(`Steam: ${kind}`); this.kind=kind; }
}
export function parseItem(item: SteamItem, at: number): Deal | null {
  const id = item.appid ?? item.id, b = item.best_purchase_option;
  if (item.success !== 1 || !Number.isSafeInteger(id) || !id || !item.name || !b) return null;
  if (!/^\d+$/.test(b.final_price_in_cents ?? '')) throw new SteamError('schema');
  const price = Number(b.final_price_in_cents) / 100;
  const original = Number(b.original_price_in_cents ?? b.final_price_in_cents) / 100;
  if (!Number.isSafeInteger(price) || !Number.isSafeInteger(original) || original < price ||
      !b.formatted_final_price?.includes('₫')) throw new SteamError('schema');
  const discount = b.hide_discount_pct_for_compliance || b.price_cannot_be_displayed_as_discount ? 0 : (b.discount_pct ?? 0);
  if (discount < 0 || discount > 100) throw new SteamError('schema');
  const assets = item.assets;
  const path = assets?.asset_url_format?.replace('${FILENAME}', assets.small_capsule ?? assets.header ?? '');
  const image = path && /^steam\/apps\/\d+\//.test(path) && !path.includes('..')
    ? `https://shared.akamai.steamstatic.com/store_item_assets/${path}` : null;
  const ad = b.active_discounts?.[0], r = item.reviews?.summary_filtered;
  return { id, name: item.name, price, original, discount,
    endsAt: ad?.discount_end_date ?? null, rating: r?.percent_positive ?? null,
    reviews: r?.review_count ?? 0, players: item.categories?.supported_player_categoryids ?? [],
    tags: (item.tagids ?? []).slice(0, 8), image,
    launch: /launch|prepurchase/.test(ad?.discount_description ?? ''), lowest: null, observedAt: at };
}

export function steamClient(key?: string, send: typeof fetch = fetch) {
  async function fetchJson(url: URL): Promise<unknown> {
    let res: Response;
    try { res = await send(url, { signal: AbortSignal.timeout(20_000) }); }
    catch { throw new SteamError('unavailable'); }
    const result = res.headers.get('x-eresult');
    if (res.status === 429 || result === '25' || result === '84') throw new SteamError('limited');
    if (!res.ok) throw new SteamError('unavailable');
    const text = await res.text();
    if (text.length > 5_000_000) throw new SteamError('schema');
    try { return JSON.parse(text) as unknown; }
    catch { throw new SteamError('schema'); }
  }
  async function call(method: string, input: unknown) {
    const url = new URL(`https://api.steampowered.com/${method}/v1/`);
    url.searchParams.set('input_json', JSON.stringify(input));
    if (key) url.searchParams.set('key', key);
    return await fetchJson(url) as { response?: { store_items?: SteamItem[]; metadata?: {total_matching_records?: number} } };
  }
  const context = { language: 'english', country_code: 'VN' };
  const data_request = { include_reviews: true, include_assets: true, include_tag_count: 8 };
  return {
    async tags(): Promise<Record<string, string>> {
      const data = await fetchJson(new URL('https://api.steampowered.com/IStoreService/GetTagList/v1/?language=vietnamese')) as { response?: { tags?: { tagid?: number; name?: string }[] } };
      const list = data.response?.tags;
      if (!Array.isArray(list)) throw new SteamError('schema');
      return Object.fromEntries(list.filter(t => Number.isSafeInteger(t.tagid) && typeof t.name === 'string' && t.name.length < 80).map(t => [String(t.tagid), t.name!]));
    },
    async page(start: number, count = 250) {
      const data = await call('IStoreQueryService/Query', {
        query: {start, count, sort: 2, filters: {price_filters:{min_discount_percent:1}, type_filters:{include_games:true}}},
        context, data_request,
      });
      const items = data.response?.store_items, total = data.response?.metadata?.total_matching_records;
      if (!Array.isArray(items) || !Number.isSafeInteger(total) || total! < 0 || total! > 100_000) throw new SteamError('schema');
      const at = Math.floor(Date.now() / 1000);
      return { total: total!, rawCount: items.length, ids: items.map(i => i.appid ?? i.id ?? 0),
        items: items.map(i => parseItem(i, at)).filter((i): i is Deal => i !== null) };
    },
    async items(ids: number[]) {
      const data = await call('IStoreBrowseService/GetItems', { ids: ids.map(appid => ({appid})), context, data_request });
      if (!Array.isArray(data.response?.store_items)) throw new SteamError('schema');
      const at = Math.floor(Date.now() / 1000);
      return data.response.store_items.map(i => parseItem(i, at)).filter((i): i is Deal => i !== null);
    },
  };
}
