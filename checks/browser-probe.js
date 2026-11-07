(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const results=[];const assert=(name,condition)=>results.push({name,pass:!!condition});
  const $=s=>document.querySelector(s);
  for(let n=0;n<60&&!$('.game-row');n++)await sleep(100);
  assert('loads actual catalog',$('.game-row')&&Number($('#result-count').textContent.replace(/\D/g,''))>0);
  assert('no horizontal overflow',document.documentElement.scrollWidth<=innerWidth);
  const search=$('#search');search.value='Rust';search.dispatchEvent(new Event('input',{bubbles:true}));await sleep(250);
  assert('search filters by name',[...document.querySelectorAll('.game-title')].every(e=>e.textContent.toLowerCase().includes('rust'))&&!!$('.game-row'));
  search.value='zzzzzz-no-such-game';search.dispatchEvent(new Event('input',{bubbles:true}));await sleep(250);
  assert('empty state is actionable',!$('#empty').hidden&&!$('.game-row'));
  $('#empty-reset').click();await sleep(80);
  $('[data-preset="budget"]').click();await sleep(80);
  assert('budget changes URL',new URL(location.href).searchParams.get('max')==='100000');
  assert('budget limits every visible price',[...document.querySelectorAll('.price strong')].every(e=>Number(e.textContent.replace(/\D/g,''))<=100000));
  $('#reset').click();await sleep(80);
  const button=$('[data-save]');const id=Number(button.dataset.save);
  if(button.getAttribute('aria-pressed')==='true')button.click();
  $(`[data-save="${id}"]`).click();await sleep(80);
  assert('favorite persists locally',JSON.parse(localStorage.getItem('steam-sale:saved')).includes(id));
  $('#saved-nav').click();await sleep(80);
  assert('saved view contains saved game',!!$(`.game-row[data-id="${id}"]`));
  $('[data-open]').click();await sleep(120);
  assert('detail dialog shows VN price',$('#detail').open&&$('#detail-title').textContent.length>0&&$('.detail-price').textContent.includes('₫'));
  $('#close-detail').click();assert('detail closes',!$('#detail').open);
  $('#reset').click();await sleep(50);
  if(innerWidth<=700){
    $('#mobile-filters').click();assert('mobile filters open and focus close',$('#filters').classList.contains('open')&&document.activeElement.id==='close-filters');
    $('#mode').value='coop';$('#mode').dispatchEvent(new Event('change',{bubbles:true}));
    $('#apply-mobile').click();assert('mobile filters apply and close',!$('#filters').classList.contains('open')&&new URL(location.href).searchParams.get('mode')==='coop');
    assert('mobile has timestamp',$('#mobile-updated').textContent.includes('Cập nhật'));
    $('#reset').click();
  }
  const n=document.querySelectorAll('.game-row').length;$('#more').click();assert('load more appends results',document.querySelectorAll('.game-row').length>n);
  $('#reset').click();
  await sleep(250);
  assert('visible images load',[...document.querySelectorAll('.game-cover img')].filter(img=>img.getBoundingClientRect().top<innerHeight&&img.getBoundingClientRect().bottom>0).every(img=>img.complete&&img.naturalWidth>0));
  return {width:innerWidth,passed:results.filter(r=>r.pass).length,total:results.length,results};
})()
