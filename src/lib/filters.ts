import type { Deal } from './model.ts';
export interface Filters { q:string; max:number; minDiscount:number; minRating:number; minReviews:number; mode:string; launches:boolean; saved:boolean; sort:string; tag:number }
export const defaults: Filters = {q:'',max:0,minDiscount:0,minRating:0,minReviews:50,mode:'all',launches:false,saved:false,sort:'popular',tag:0};
const bounded = (v:string|null,min:number,max:number,fallback=0) => v!==null && v.trim()!=='' && Number.isFinite(+v) ? Math.min(max,Math.max(min,+v)) : fallback;
export function readFilters(search:string):Filters {
  const p=new URLSearchParams(search);
  return {...defaults,q:(p.get('q')??'').slice(0,150),max:bounded(p.get('max'),0,10_000_000),minDiscount:bounded(p.get('off'),0,100),minRating:bounded(p.get('rating'),0,100),minReviews:bounded(p.get('reviews'),0,1_000_000,50),mode:['all','coop','online','single','local'].includes(p.get('mode')??'')?p.get('mode')!:'all',launches:p.get('launch')==='1',saved:p.get('saved')==='1',sort:['popular','price','discount','rating','ending'].includes(p.get('sort')??'')?p.get('sort')!:'popular',tag:bounded(p.get('tag'),0,1_000_000)};
}
export function filterParams(f:Filters) {
  const p=new URLSearchParams();
  for(const [key,value,base] of [['q',f.q,''],['max',f.max,0],['off',f.minDiscount,0],['rating',f.minRating,0],['reviews',f.minReviews,50],['mode',f.mode,'all'],['sort',f.sort,'popular'],['tag',f.tag,0]] as const) if(value!==base) p.set(key,String(value));
  if(f.launches) p.set('launch','1'); if(f.saved) p.set('saved','1'); return p.toString();
}
const searchText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi');
export function selectDeals(deals:Deal[],f:Filters,saved:Set<number>,now:number) {
  const q=searchText(f.q.trim());
  const category:Record<string,number>={coop:9,online:38,local:39,single:2};
  return deals.filter(d=>d.discount>0 && (!d.endsAt || d.endsAt>now) && (!q||searchText(d.name).includes(q)) &&
    (!f.max||d.price<=f.max) && d.discount>=f.minDiscount && (d.rating??0)>=f.minRating && d.reviews>=f.minReviews &&
    (f.mode==='all'||d.players.includes(category[f.mode])) && (f.launches||!d.launch) && (!f.saved||saved.has(d.id)) && (!f.tag||d.tags.includes(f.tag)))
    .sort((a,b)=> {
      const n=f.sort==='price'?a.price-b.price:f.sort==='discount'?b.discount-a.discount:f.sort==='rating'?(b.rating??0)-(a.rating??0):f.sort==='ending'?(a.endsAt??Infinity)-(b.endsAt??Infinity):b.reviews-a.reviews;
      return n || b.reviews-a.reviews || a.id-b.id;
    });
}
