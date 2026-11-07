import type { Catalog, Deal, PricePoint } from '../lib/model.ts';
import { isDeal, money } from '../lib/model.ts';
import { defaults, readFilters, filterParams, selectDeals } from '../lib/filters.ts';

const get = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag:K,cls='',text?:string) => {
  const el=document.createElement(tag); el.className=cls; if(text!==undefined) el.textContent=text; return el;
};
const form=get<HTMLFormElement>('filter-form'), search=get<HTMLInputElement>('search'), sort=get<HTMLSelectElement>('sort');
const dialog=get<HTMLDialogElement>('detail');
let state=readFilters(location.search), catalog:Catalog|null=null, limit=24, matched:Deal[]=[], selectedId=0;
let saved = new Set<number>();
try { const ids:unknown=JSON.parse(localStorage.getItem('steam-sale:saved')??'[]'); if(Array.isArray(ids)) saved=new Set(ids.filter((id):id is number=>Number.isSafeInteger(id)&&Number(id)>0)); } catch { /* A disabled or corrupt store must not block browsing. */ }
const count=(n:number)=>new Intl.NumberFormat('vi-VN').format(n);
let toastTimer:ReturnType<typeof setTimeout>;
function toast(text:string) {
  const live=get('live');live.textContent='';requestAnimationFrame(()=>{live.textContent=text;});
  get('toast').textContent=text;get('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>get('toast').hidden=true,2200);
}
function syncForm() {
  search.value=state.q; sort.value=state.sort;
  for(const [name,value] of Object.entries({max:state.max,mode:state.mode,rating:state.minRating,reviews:state.minReviews,tag:state.tag})) {
    const el=form.elements.namedItem(name) as HTMLSelectElement;
    if(!Array.from(el.options).some(o=>o.value===String(value))) el.add(new Option(name==='tag'&&catalog?.tags?.[value]?catalog.tags[value]:String(value),String(value)));
    el.value=String(value);
  }
  for(const input of form.querySelectorAll<HTMLInputElement>('input[name=off]')) input.checked=Number(input.value)===state.minDiscount;
  (form.elements.namedItem('launch') as HTMLInputElement).checked=state.launches;
  (form.elements.namedItem('saved') as HTMLInputElement).checked=state.saved;
  const nav=get('saved-nav'); nav.toggleAttribute('aria-current',state.saved);
  document.querySelector('.nav-link[href="/"]')?.toggleAttribute('aria-current',!state.saved);
  nav.setAttribute('aria-pressed',String(state.saved));
  document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(el=>el.classList.toggle('active',!state.saved && (el.dataset.preset==='all'? !state.max && state.mode==='all' && !state.minDiscount:el.dataset.preset==='budget'?state.max===100000:el.dataset.preset==='coop'?state.mode==='coop':state.minDiscount===75)));
}
function update() {
  limit=24; const query=filterParams(state); history.replaceState(null,'',`${location.pathname}${query?'?'+query:''}${location.hash}`); syncForm(); render();
}
function remaining(d:Deal) {
  if(!d.endsAt) return 'Đang giảm giá';
  const h=(d.endsAt-Date.now()/1000)/3600;
  return h<=0?'Đã hết hạn':h<1?'Còn dưới 1 giờ':h<24?`Còn ${Math.ceil(h)} giờ`:`Còn ${Math.ceil(h/24)} ngày`;
}
function imageFor(d:Deal) {
  if(!d.image) return null;
  try { const url=new URL(d.image); return url.protocol==='https:' && ['shared.akamai.steamstatic.com','shared.fastly.steamstatic.com'].includes(url.hostname) ? url.href : null; } catch { return null; }
}
const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
const fallbackCover='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h4m-2-2v4m8-2h.01m3 0h.01"/></svg>';
function row(d:Deal) {
  const el=node('article','game-row'); el.dataset.id=String(d.id);
  const main=node('button','game-main'); main.type='button'; main.dataset.open=String(d.id); main.setAttribute('aria-label',`Xem ${d.name}`);
  const cover=node('span','game-cover'); const url=imageFor(d);
  if(url) {const img=node('img');img.src=url;img.alt='';img.width=231;img.height=87;img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.remove();const fb=node('span','cover-fallback');fb.innerHTML=fallbackCover;cover.append(fb);},{once:true});cover.append(img);}
  else {const fb=node('span','cover-fallback');fb.innerHTML=fallbackCover;cover.append(fb);}
  const info=node('span','game-info'); info.append(node('span','game-title',d.name));
  const meta=node('span','game-meta');
  if(d.rating!==null) meta.append(node('span','mobile-rating',`${d.rating}% tích cực`),node('span','mobile-rating','·'));
  if(d.players.includes(9)) meta.append(node('span','','Co-op'),node('span','','·'));
  meta.append(node('span','',remaining(d))); if(d.launch) meta.append(node('span','launch','Ra mắt'));
  info.append(meta); main.append(cover,info);
  const rating=node('div','rating'); rating.append(node('strong','',d.rating===null?'Chưa có':`${d.rating}% tích cực`),node('small','',`${count(d.reviews)} đánh giá`));
  const price=node('div','price'); price.append(node('del','',money(d.original)),node('strong','',money(d.price)));
  const save=node('button','save');save.type='button';save.dataset.save=String(d.id);save.innerHTML=heart;
  save.setAttribute('aria-pressed',String(saved.has(d.id))); save.setAttribute('aria-label',`${saved.has(d.id)?'Bỏ lưu':'Lưu'} ${d.name}`);
  el.append(main,rating,node('span','discount',`−${d.discount}%`),price,save);return el;
}
function render() {
  get('saved-count').textContent=String(saved.size);
  if(!catalog) return;
  matched=selectDeals(catalog.items,state,saved,Date.now()/1000);
  get('result-count').textContent=count(matched.length);
  const games=get('games');games.replaceChildren(...matched.slice(0,limit).map(row));games.setAttribute('aria-busy','false');
  get('empty').hidden=!!matched.length;get('more').hidden=matched.length<=limit;
  get('shown').textContent=matched.length?`Đang xem ${Math.min(limit,matched.length)} / ${count(matched.length)} game`:'';
  get('filter-caption').textContent=state.saved?'Danh sách của riêng bạn.':'Giá theo cửa hàng Việt Nam.';
  const empty=get('empty');
  if(state.saved) {empty.querySelector('h3')!.textContent=saved.size?'Chưa có game đã lưu phù hợp':'Danh sách của bạn còn trống'; empty.querySelector('p')!.textContent=saved.size?'Game có thể đã hết giảm giá hoặc đang bị bộ lọc ẩn.':'Bấm biểu tượng tim để lưu game bạn muốn chơi.';}
  else {empty.querySelector('h3')!.textContent='Chưa có game phù hợp';empty.querySelector('p')!.textContent='Thử tăng ngân sách hoặc bớt điều kiện lọc.';}
}
function reset() {state={...defaults};update();}
function toggleSave(id:number) {
  const had=saved.has(id);if(had) saved.delete(id);else saved.add(id);
  let persisted=true;try{localStorage.setItem('steam-sale:saved',JSON.stringify([...saved]));}catch{persisted=false;}
  render();document.querySelector<HTMLButtonElement>(`[data-save="${id}"]`)?.focus();toast(persisted?(had?'Đã bỏ lưu game':'Đã lưu vào danh sách của bạn'):'Đã lưu tạm. Trình duyệt chưa cho phép lưu lâu dài.');
}
function mobileFilters(open:boolean) {
  get('filters').classList.toggle('open',open);get('mobile-filters').setAttribute('aria-expanded',String(open));
  if(open) {get('filters').setAttribute('role','dialog');get('filters').setAttribute('aria-modal','true');get('close-filters').focus();}
  else {get('filters').removeAttribute('role');get('filters').removeAttribute('aria-modal');}
}
function detail(d:Deal) {
  selectedId=d.id;const body=get('detail-content');body.replaceChildren();
  const url=imageFor(d);if(url){const img=node('img','detail-image');img.src=url;img.alt=d.name;body.append(img);}
  const h=node('h2','',d.name);h.id='detail-title';body.append(h,node('p','detail-note',`${d.rating!==null?d.rating+'% tích cực':'Chưa có đánh giá'} · ${count(d.reviews)} đánh giá · ${remaining(d)}`));
  const price=node('div','detail-price');price.append(node('span','discount',`−${d.discount}%`),node('strong','',money(d.price)),node('del','',money(d.original)));body.append(price);
  const actions=node('div','detail-actions'), app=node('a','btn','Mở qua ứng dụng Steam'),web=node('a','btn secondary','Mở trên trình duyệt');
  app.href=`steam://store/${d.id}`;web.href=`https://store.steampowered.com/app/${d.id}/?cc=vn`;web.target='_blank';web.rel='noopener';actions.append(app,web);body.append(actions);
  body.append(node('p','detail-note',`Giá ghi nhận lúc ${new Date(d.observedAt*1000).toLocaleString('vi-VN')}. Game, phiên bản và giá cuối cùng được xác nhận tại Steam.`));
  const section=node('section','history');section.append(node('h3','','Giá đã ghi nhận'));const text=node('p','','Đang tải lịch sử giá…');section.append(text);body.append(section);
  dialog.showModal();
  void fetch(`/api/history/${d.id}`).then(r=>r.ok?r.json():{items:[]}).then((data:{items:PricePoint[]})=>{
    if(selectedId!==d.id) return;
    const pts=Array.isArray(data.items)?data.items.filter(p=>Number.isFinite(p.at)&&Number.isFinite(p.price)):[];
    if(!pts.length){text.textContent='Chưa có lịch sử cho game này. Dữ liệu sẽ được ghi nhận từ khi hệ thống bắt đầu theo dõi.';return;}
    const min=Math.min(...pts.map(p=>p.price));text.textContent=`Thấp nhất đã ghi nhận: ${money(min)}, từ ${new Date(pts[0].at*1000).toLocaleDateString('vi-VN')}. Mỗi điểm là một lần quan sát.`;
    if(pts.length<2) return;
    const max=Math.max(...pts.map(p=>p.price)), t0=pts[0].at,dt=Math.max(1,pts[pts.length-1].at-t0);
    const points=pts.map(p=>`${10+480*(p.at-t0)/dt},${110-90*(p.price-min)/Math.max(1,max-min)}`).join(' ');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 500 130');svg.setAttribute('role','img');svg.setAttribute('aria-label','Các mức giá VNĐ đã ghi nhận theo thời gian');
    const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',points);line.setAttribute('fill','none');line.setAttribute('stroke','#c9a45a');line.setAttribute('stroke-width','2');svg.append(line);section.append(svg);
  }).catch(()=>{if(selectedId===d.id)text.textContent='Chưa tải được lịch sử. Bạn có thể thử mở lại game.';});
}
form.addEventListener('submit',e=>e.preventDefault());
form.addEventListener('change',()=>{const f=new FormData(form);state={...state,max:Number(f.get('max')),minDiscount:Number(f.get('off')??0),minRating:Number(f.get('rating')),minReviews:Number(f.get('reviews')),mode:String(f.get('mode')),tag:Number(f.get('tag')),launches:f.has('launch'),saved:f.has('saved')};update();});
let timer:ReturnType<typeof setTimeout>;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=search.value;update();search.focus();},120);});
sort.addEventListener('change',()=>{state.sort=sort.value;update();});
get('reset').addEventListener('click',reset);get('empty-reset').addEventListener('click',reset);
get('saved-nav').addEventListener('click',()=>{state={...defaults,saved:!state.saved,minReviews:0,launches:true};update();});
document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(el=>el.addEventListener('click',()=>{state={...defaults};if(el.dataset.preset==='budget')state.max=100000;if(el.dataset.preset==='coop')state.mode='coop';if(el.dataset.preset==='deep')state.minDiscount=75;update();}));
get('more').addEventListener('click',()=>{const old=limit;limit+=24;get('games').append(...matched.slice(old,limit).map(row));get('more').hidden=limit>=matched.length;get('shown').textContent=`Đang xem ${Math.min(limit,matched.length)} / ${count(matched.length)} game`;});
get('games').addEventListener('click',e=>{const target=e.target as Element;const save=target.closest<HTMLElement>('[data-save]');if(save){toggleSave(Number(save.dataset.save));return;}const open=target.closest<HTMLElement>('[data-open]');const d=catalog?.items.find(d=>d.id===Number(open?.dataset.open));if(d)detail(d);});
get('mobile-filters').addEventListener('click',()=>mobileFilters(true));get('close-filters').addEventListener('click',()=>{mobileFilters(false);get('mobile-filters').focus();});get('apply-mobile').addEventListener('click',()=>{mobileFilters(false);get('mobile-filters').focus();});
get('close-detail').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.addEventListener('keydown',e=>{
  if(e.key==='/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as Element).tagName) && !dialog.open){e.preventDefault();search.focus();}
  if(e.key==='Escape')mobileFilters(false);
  if(e.key==='Tab'&&get('filters').classList.contains('open')) {const els=Array.from(get('filters').querySelectorAll<HTMLElement>('button,input,select')).filter(el=>el.offsetParent!==null);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
window.addEventListener('popstate',()=>{state=readFilters(location.search);syncForm();render();});
window.addEventListener('storage',e=>{if(e.key==='steam-sale:saved'){try{saved=new Set(JSON.parse(e.newValue??'[]'));render();}catch{/* Ignore corrupt data from another tab. */}}});
async function load() {
  const notice=get('notice');
  try {
    let r=await fetch('/api/deals');if(!r.ok)r=await fetch('/data/deals.json');
    if(!r.ok)throw new Error('unavailable');
    const data=await r.json() as Catalog;
    if(data.country!=='VN'||data.currency!=='VND'||!Array.isArray(data.items)||!Number.isFinite(data.fetchedAt)||!data.items.every(isDeal))throw new Error('invalid');
    catalog=data;const age=(Date.now()/1000-data.fetchedAt)/3600;
    get('updated').textContent=new Date(data.fetchedAt*1000).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    get('mobile-updated').textContent=`Giá VNĐ · Cập nhật ${get('updated').textContent}`;
    if(data.source==='fixture'||age>2){notice.textContent=`${data.source==='fixture'?'Đang xem bản dữ liệu đã lưu. ':''}${age>2?'Giá có thể đã thay đổi. ':''}Lần lấy giá: ${new Date(data.fetchedAt*1000).toLocaleString('vi-VN')}.`;notice.hidden=false;}
    // Show the 40 most common genres among games a visitor normally sees; a genre from a shared URL is added by syncForm.
    const tagSelect=get<HTMLSelectElement>('tag'),freq=new Map<number,number>();
    for(const d of data.items) if(d.reviews>=50&&!d.launch) for(const t of d.tags) freq.set(t,(freq.get(t)??0)+1);
    for(const [id] of [...freq].sort((a,b)=>b[1]-a[1]).slice(0,40)) {const label=data.tags?.[id];if(label)tagSelect.add(new Option(label,String(id)));}
    syncForm();render();
  }catch{notice.replaceChildren(node('span','','Chưa tải được giá Steam. '));const retry=node('button','','Thử tải lại');retry.type='button';retry.addEventListener('click',()=>{get('loading').hidden=false;notice.hidden=true;void load();});notice.append(retry);notice.hidden=false;get('games').setAttribute('aria-busy','false');}
  finally{get('loading').hidden=true;}
}
syncForm();void load();
