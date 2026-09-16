(() => {
  'use strict';
  const catalog = window.ARCAN_CATALOG || [];
  const money = value => Number(value).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#${name}"/></svg>`;
  const category = product => /\(\d+\/\d+\)/.test(product.title) ? 'cards' : /blister|mini bb/i.test(product.title) ? 'boosters' : 'boxes';
  const names = {all:'Todos os produtos', cards:'Cartas avulsas', boosters:'Boosters', boxes:'Boxes e kits'};
  const titles = {
    10672926458021:'ETB Fogo Fantasmagórico',10672930619557:'ETB Mega Evolução · Heróis Excelsos',
    10672930422949:'Blister unitário · Equilíbrio Perfeito',10672930685093:'Box Evoluções Prismáticas · Arco-íris',
    10672930717861:'Box Mega Charizard Y',10672925835429:'Mini Box Escuridão Absoluta',10672924229797:'Box Mega Lucario ex'
  };
  const title = p => titles[p.id] || p.title.replace(/ jp$/i,'').replace(/ jp /i,' ');
  let filter = 'all', query = '', expanded = false;
  const bag = new Map();
  const grid = document.querySelector('#product-grid');
  const card = p => `<article class="product"><div class="product-picture"><span class="product-tag">${category(p)==='cards'?'CARTA AVULSA':/ETB/i.test(p.title)?'ELITE TRAINER BOX':category(p)==='boosters'?'PARA DESCOBRIR':'BOX COLEÇÃO'}</span><button data-detail="${p.id}" aria-label="Ver ${escape(title(p))}"><img src="${escape(p.image)}" alt="${escape(p.title)}" width="220" height="200" loading="lazy"></button></div><p class="product-meta">Pokémon TCG <span aria-hidden="true">·</span> ${/jp/i.test(p.title)?'Japonês':'Português'}</p><h3><button data-detail="${p.id}">${escape(title(p))}</button></h3><div class="price-row"><div><span class="price">${money(p.price)}</span><span class="price-note">${p.available?'Preço consultado na loja':'Indisponível na consulta'}</span></div><button class="add-button" data-add="${p.id}" aria-label="Adicionar ${escape(title(p))} à sacola" ${p.available?'':'disabled'}>${icon('bag')}</button></div></article>`;
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function render() {
    let products = catalog.filter(p => (filter==='all'||category(p)===filter) && normalize(p.title+' '+title(p)).includes(normalize(query)));
    if(filter==='all' && !query && !expanded){
      const initial = [10672926458021,10672923312293,10672930685093,10672925835429];
      products = initial.map(id => catalog.find(p => p.id===id)).filter(Boolean);
    }
    grid.innerHTML=products.map(card).join('');
    document.querySelector('#empty-state').hidden=products.length>0;
    document.querySelector('#search-status').textContent=`${products.length} produtos encontrados.`;
    document.querySelector('#shop-title').textContent=query?`Resultados para “${query}”`:filter!=='all'?names[filter]:'Os próximos favoritos da sua coleção.';
    document.querySelector('#shop-caption').textContent=query||filter!=='all'||expanded?`${products.length} produtos nesta seleção de demonstração.`:'Mais vendidos · seleção ilustrativa para validar esta vitrine.';
    document.querySelectorAll('.filters button').forEach(button=>button.setAttribute('aria-pressed', String(button.dataset.filter===filter)));
  }
  function setFilter(value){filter=value;query='';expanded=true;document.querySelector('#search-input').value='';render();document.querySelector('#mais-vendidos').scrollIntoView({behavior:'smooth'});document.querySelector('#main-nav').classList.remove('open');document.querySelector('.menu-button').setAttribute('aria-expanded','false');document.querySelector('.menu-button').setAttribute('aria-label','Abrir categorias');}
  let toastTimer;
  function toast(message){const box=document.querySelector('#toast');box.textContent=message;box.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('visible'),2600);}
  function renderCart(){
    const count=[...bag.values()].reduce((total,qty)=>total+qty,0);
    document.querySelector('#cart-count').textContent=count;
    document.querySelector('#open-cart').setAttribute('aria-label',`Abrir sacola, ${count} ${count===1?'item':'itens'}`);
    const items=[...bag].map(([id,qty])=>({p:catalog.find(p=>p.id===id),qty}));
    document.querySelector('#cart-items').innerHTML=items.length?items.map(({p,qty})=>`<div class="cart-item"><img src="${escape(p.image)}" alt="${escape(title(p))}" width="58" height="78"><div><h3>${escape(title(p))}</h3><p>${qty} × ${money(p.price)}</p></div><button data-remove="${p.id}" aria-label="Remover ${escape(title(p))}">Remover</button></div>`).join(''):`<div class="cart-empty">${icon('bag')}<h3>Uma coleção começa com uma escolha.</h3><p>Sua sacola ainda está vazia.</p><button class="button primary" data-close>Continuar explorando</button></div>`;
    document.querySelector('#cart-summary').innerHTML=items.length?`<div class="cart-total"><span>Subtotal simulado</span><span>${money(items.reduce((sum,{p,qty})=>sum+Number(p.price)*qty,0))}</span></div><a class="button primary" href="https://arcantcg.com.br" target="_blank" rel="noopener noreferrer">Visitar a loja real ${icon('arrow')}</a><p class="cart-disclaimer">A sacola desta prévia não é transferida. Frete e condições devem ser consultados na loja.</p>`:'';
  }
  function detail(id){const p=catalog.find(p=>p.id===id);if(!p)return;document.querySelector('#product-detail').innerHTML=`<div class="detail-layout"><img src="${escape(p.image)}" alt="${escape(p.title)}" width="260" height="320"><div><h2 id="detail-title">${escape(title(p))}</h2><p>${escape(p.title)}</p><span class="price">${money(p.price)}</span><p>Imagem e preço consultados na Arcan TCG. Confira estoque, idioma e conteúdo na página original.</p><button class="button primary" data-add="${p.id}" ${p.available?'':'disabled'}>${p.available?'Adicionar à sacola':'Indisponível'} ${icon('bag')}</button><a class="text-link" href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">Ver produto na loja real ${icon('arrow')}</a></div></div>`;document.querySelector('#product-dialog').showModal();}
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.dataset.filter){event.preventDefault();setFilter(target.dataset.filter);}
    if(target.dataset.detail)detail(Number(target.dataset.detail));
    if(target.dataset.add){const id=Number(target.dataset.add);const p=catalog.find(p=>p.id===id);if(!p?.available)return;bag.set(id,(bag.get(id)||0)+1);renderCart();if(target.closest('#product-dialog')){target.textContent='Adicionado ? sacola';}toast('Produto adicionado à sacola de demonstração.');}
    if(target.dataset.remove){bag.delete(Number(target.dataset.remove));renderCart();const focusTarget=document.querySelector('#cart-items button')||document.querySelector('#cart-dialog [data-close]');focusTarget.focus();}
    if(target.hasAttribute('data-close'))target.closest('dialog').close();
  });
  document.querySelector('.search-form').addEventListener('submit',event=>{event.preventDefault();query=document.querySelector('#search-input').value.trim();filter='all';expanded=true;render();document.querySelector('#mais-vendidos').scrollIntoView({behavior:'smooth'});});
  document.querySelector('#reset-search').addEventListener('click',()=>setFilter('all'));
  document.querySelector('#show-all').addEventListener('click',event=>{event.preventDefault();setFilter('all');});
  document.querySelector('#open-cart').addEventListener('click',()=>{renderCart();document.querySelector('#cart-dialog').showModal();});
  document.querySelector('.menu-button').addEventListener('click',event=>{const open=document.querySelector('#main-nav').classList.toggle('open');event.currentTarget.setAttribute('aria-expanded',String(open));event.currentTarget.setAttribute('aria-label',open?'Fechar categorias':'Abrir categorias');});
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
  const offers=[10672930422949,10672930717861,10672930619557,10672924229797].map(id=>catalog.find(p=>p.id===id)).filter(Boolean);
  document.querySelector('#offers-grid').innerHTML=offers.map(card).join('');
  render();renderCart();
})();
