// Barra compacta de tarefas e filtros. Modo eu é uma preferência de visualização por usuário.
const ICONES_BARRA = {
  filtro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  quadro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>',
  grupo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/></svg>'
};
const modoEuSessao = new Map();
function modoEuAtivo() {
  if(!S.user)return false;
  if(!modoEuSessao.has(S.user.id))modoEuSessao.set(S.user.id,lerLocal('tf_modo_eu_' + S.user.id,false) === true);
  return rotaAtual().tipo === 'minhas' || modoEuSessao.get(S.user.id);
}
function alternarModoEu() {
  if (!S.user || rotaAtual().tipo === 'minhas') return;
  const ativo=!modoEuAtivo();modoEuSessao.set(S.user.id,ativo);
  gravarLocal('tf_modo_eu_' + S.user.id, ativo);
  fecharMenu(); renderVisao(rotaAtual());
}
function podeGerenciarEstrutura() {
  // Compatível com produção anterior à migração de permissões por membro.
  return S.eu.admin || typeof S.eu.acesso_total !== 'boolean';
}

function filtrar(f, escopo, { ignorarPrazo } = {}) {
  const local = f.local ? listasDoLocal(f.local) : null;
  const busca = norm(f.busca), eu = modoEuAtivo();
  return S.tarefas.filter(t => {
    // O escopo da visualização e o Modo eu sempre restringem, mesmo ao combinar filtros com OU.
    if (escopo && !escopo.has(t.lista_id)) return false;
    if (eu && !t.responsaveis.includes(S.user.id)) return false;
    if (busca && !norm(t.titulo + ' ' + (t.descricao || '')).includes(busca)) return false;
    if (!ignorarPrazo && t.situacao === 'concluida' && !f.concluidas && !f.status.length && !f.prazo.includes('concluida')) return false;
    const regras = [];
    if (local) regras.push(local.has(t.lista_id));
    if (f.status.length) regras.push(f.status.includes(t.status_id));
    if (f.responsavel && !eu) regras.push(f.responsavel === 'ninguem' ? !t.responsaveis.length : t.responsaveis.includes(f.responsavel === 'eu' ? S.user.id : f.responsavel));
    if (f.prioridade) regras.push(t.prioridade === f.prioridade);
    if (!ignorarPrazo && f.prazo.length) regras.push((f.concluidas && t.situacao === 'concluida') || f.prazo.some(p => casaPrazo(p,t,f)));
    if (f.de || f.ate) regras.push(!!t.data_entrega && (!f.de || t.data_entrega >= f.de) && (!f.ate || t.data_entrega <= f.ate));
    return !regras.length || (f.combinacao === 'ou' ? regras.some(Boolean) : regras.every(Boolean));
  });
}

function renderVisao(r) {
  const main = document.getElementById('conteudo');
  let f = filtroDaRota(r), titulo, caminho = '', escopo = null, acoes = '';
  if (r.tipo === 'central') titulo = 'Central';
  else if (r.tipo === 'minhas') titulo = 'Minhas tarefas';
  else if (TABELA[r.tipo]) {
    const obj = objeto(r.tipo,r.id);
    if (!obj) { main.innerHTML = '<div class="vazio"><h3>Não encontrado</h3>Este local foi excluído ou não está disponível para você.</div>'; return; }
    if (f._escopo !== `${r.tipo}:${r.id}`) {
      filtros.local = novoFiltro({agrupar:f.agrupar,visao:f.visao,ordenar:f.ordenar,_escopo:`${r.tipo}:${r.id}`});
      f = filtros.local;
    }
    titulo = obj.nome; escopo = listasDoLocal(`${r.tipo}:${r.id}`); expandirAte(r.tipo,r.id);
    if (r.tipo === 'lista') caminho = caminhoLista(r.id).slice(0,-1).join(' › ');
    if (r.tipo === 'pasta') caminho = [S.projetos.find(p=>p.id===obj.projeto_id)?.nome,...caminhoPasta(r.id).slice(0,-1)].filter(Boolean).join(' › ');
    if (podeGerenciarEstrutura()) acoes = `<button class="icone-btn mini" data-menu onclick="menuDe('${r.tipo}','${r.id}',this)" aria-label="Opções do local">${ICONES.mais}</button>`;
  } else { irPara('#/central'); return; }
  document.getElementById('barra-titulo').textContent = titulo;
  document.title = `${titulo} | Tarefas`;
  const semLista = !opcoesListas(escopo).length;
  main.innerHTML = `<header class="cabecalho-tarefas">
    <div class="titulo-compacto">${caminho ? `<span class="caminho-compacto" title="${esc(caminho)}">${esc(caminho)} <span aria-hidden="true">›</span></span>` : ''}<h1>${esc(titulo)}</h1>${acoes}</div>
    <div class="abas-visao" role="group" aria-label="Visualização">
      <button class="${f.visao==='lista'?'ativo':''}" aria-pressed="${f.visao==='lista'}" onclick="mudarFiltro('visao','lista')">${ICONES.lista} Lista</button>
      <button class="${f.visao==='quadro'?'ativo':''}" aria-pressed="${f.visao==='quadro'}" onclick="mudarFiltro('visao','quadro')">${ICONES_BARRA.quadro} Quadro</button>
    </div>${semLista ? '' : barraFiltros(r,f)}</header>
    ${semLista ? vazioSemLista(r) : '<div id="resumo" hidden></div><div id="lista-tarefas"></div>'}`;
  if (semLista) return;
  document.getElementById('busca').addEventListener('input',event=>{f.busca=event.target.value;renderResultado(r,f,escopo);});
  renderResultado(r,f,escopo);
}

function camposAtivos(f) {
  return ['status','responsavel','prioridade','prazo','local','periodo'].filter(c => {
    if (c === 'responsavel' && modoEuAtivo()) return false;
    if (c === 'periodo') return f.de || f.ate;
    return Array.isArray(f[c]) ? f[c].length : !!f[c];
  });
}
function contarFiltros(r,f) { return camposAtivos(f).length; }
function barraFiltros(r,f) {
  const n = contarFiltros(r,f), eu = modoEuAtivo();
  return `<div class="barra-tarefas">
    <label class="agrupar-compacto">${ICONES_BARRA.grupo}<select aria-label="Agrupar tarefas" onchange="mudarFiltro('agrupar',this.value)" ${f.visao==='quadro'?'disabled title="O quadro é organizado por status"':''}>
      ${[{v:'pasta',t:'Pasta e lista'},{v:'status',t:'Status'},{v:'situacao',t:'Prazo'},{v:'projeto',t:'Lista'},{v:'responsavel',t:'Responsável'},{v:'',t:'Sem grupos'}].map(o=>`<option value="${o.v}"${(f.visao==='quadro'?'status':f.agrupar)===o.v?' selected':''}>${o.t}</option>`).join('')}</select></label>
    <div class="ferramentas-tarefas">
      <div class="filtros-badge${n?' ligado':''}"><button id="btn-mais-filtros" class="controle-barra" data-menu aria-haspopup="dialog" onclick="abrirMaisFiltros(this)">${ICONES_BARRA.filtro}<span>${n ? `${n} ${n===1?'filtro':'filtros'}` : 'Filtros'}</span></button>
      ${n ? `<button class="remover-filtros" aria-label="Limpar filtros" onclick="limparFiltros()">${ICONES.fechar}</button>` : ''}</div>
      <button class="controle-barra modo-eu${eu?' ligado':''}" aria-pressed="${eu}" ${r.tipo==='minhas'?'disabled':''} onclick="alternarModoEu()" title="${r.tipo==='minhas'?'Esta visualização já mostra suas tarefas':'Mostrar somente tarefas atribuídas a você'}">${ICONES.pessoa}<span>Modo eu</span></button>
      <button class="controle-barra controle-icone${f.concluidas?' ligado':''}" aria-label="Mostrar concluídas" aria-pressed="${f.concluidas}" title="Mostrar concluídas" onclick="mudarFiltro('concluidas',${!f.concluidas})">${ICONES.check}</button>
      <input type="search" id="busca" aria-label="Buscar tarefas" placeholder="Buscar…" value="${esc(f.busca)}">
      <select class="ordenar-compacto" aria-label="Ordenar tarefas" onchange="mudarFiltro('ordenar',this.value)">${[{v:'prazo',t:'Entrega'},{v:'prioridade',t:'Prioridade'},{v:'titulo',t:'Nome'},{v:'recentes',t:'Recentes'}].map(o=>`<option value="${o.v}"${f.ordenar===o.v?' selected':''}>${o.t}</option>`).join('')}</select>
      <button class="btn btn-pequeno nova-tarefa-barra" onclick="novaTarefaRapida()">+ Tarefa</button>
    </div></div>`;
}

function definicoesFiltros() {
  const locais = [];
  for (const p of S.projetos) locais.push({v:`projeto:${p.id}`,t:p.nome});
  for (const p of S.pastas) locais.push({v:`pasta:${p.id}`,t:[S.projetos.find(x=>x.id===p.projeto_id)?.nome,...caminhoPasta(p.id)].filter(Boolean).join(' › ')});
  for (const l of S.listas) locais.push({v:`lista:${l.id}`,t:caminhoLista(l.id).join(' › ')});
  return {
    status:{nome:'Status',multi:true,opcoes:S.status.map(s=>({v:s.id,t:s.nome}))},
    responsavel:{nome:'Responsável',opcoes:[{v:'eu',t:'Eu'},...S.usuarios.filter(u=>u.ativo && u.user_id!==S.user.id).map(u=>({v:u.user_id,t:u.nome})),{v:'ninguem',t:'Sem responsável'}]},
    prioridade:{nome:'Prioridade',opcoes:PRIORIDADES.map(p=>({v:p.id,t:p.nome}))},
    prazo:{nome:'Prazo',multi:true,opcoes:SITUACOES.map(s=>({v:s.id,t:s.nome}))},
    local:{nome:'Local',opcoes:locais},periodo:{nome:'Data de entrega'}
  };
}

function abrirMaisFiltros(ancora) {
  const f = filtroDaRota(rotaAtual()), defs = definicoesFiltros();
  const campos = [...new Set([...camposAtivos(f),...(f.campos || [])])].filter(c=>defs[c] && !(c==='responsavel' && modoEuAtivo()));
  const select = (campo,opcoes,valor) => `<select aria-label="${defs[campo].nome} do filtro" data-valor="${campo}"><option value="">Selecionar…</option>${opcoes.map(o=>`<option value="${esc(o.v)}"${o.v===valor?' selected':''}>${esc(o.t)}</option>`).join('')}</select>`;
  const linhas = campos.map(c=>{
    const d = defs[c];
    let valor;
    if (c==='periodo') valor = `<div class="periodo-filtro"><input type="date" aria-label="Entrega a partir de" data-valor="de" value="${esc(f.de)}"><span>até</span><input type="date" aria-label="Entrega até" data-valor="ate" value="${esc(f.ate)}"></div>`;
    else if (d.multi) {
      const nomes=d.opcoes.filter(o=>f[c].includes(o.v)).map(o=>o.t);
      valor=`<details class="valores-filtro" data-multi="${c}"><summary>${esc(nomes.join(', ') || 'Selecionar…')}</summary><div>${d.opcoes.map(o=>`<label><input type="checkbox" data-multiplo="${c}" value="${esc(o.v)}" ${f[c].includes(o.v)?'checked':''}>${esc(o.t)}</label>`).join('')}</div></details>`;
      if(c==='prazo' && f.prazo.includes('a_vencer')) valor+=`<label class="dias-filtro">Nos próximos <select data-valor="dias" aria-label="Período a vencer">${[{v:'7',t:'7 dias'},{v:'15',t:'15 dias'},{v:'30',t:'30 dias'},{v:'',t:'Sem limite'}].map(o=>`<option value="${o.v}"${f.dias===o.v?' selected':''}>${o.t}</option>`).join('')}</select></label>`;
    } else valor=select(c,d.opcoes,f[c]);
    return `<div class="condicao-filtro"><span class="campo-filtro">${d.nome}</span><span class="operador-filtro">${c==='periodo'?'entre':d.multi?'é um de':'é'}</span><div class="valor-filtro">${valor}</div><button class="excluir-condicao" data-excluir="${c}" aria-label="Remover filtro ${d.nome}">${ICONES.fechar}</button></div>`;
  }).join('');
  abrirPainel(ancora,`<section class="filtros-popover" role="dialog" aria-label="Filtros de tarefas">
    <div class="filtros-cabeca"><h2>Filtros</h2><button class="fechar-filtros" aria-label="Fechar filtros" onclick="fecharMenu();document.getElementById('btn-mais-filtros')?.focus()">${ICONES.fechar}</button></div>
    <div class="combinar-filtros"><span>Mostrar tarefas que correspondam a</span><select data-valor="combinacao" aria-label="Combinar filtros"><option value="e" ${f.combinacao!=='ou'?'selected':''}>Todos os filtros (E)</option><option value="ou" ${f.combinacao==='ou'?'selected':''}>Qualquer filtro (OU)</option></select></div>
    ${modoEuAtivo()?'<p class="nota-modo-eu">Modo eu ativo: os resultados continuam limitados às suas tarefas.</p>':''}
    <div class="condicoes-filtros">${linhas || '<p class="nenhum-filtro">Nenhum filtro adicionado.</p>'}</div>
    ${f.de && f.ate && f.de>f.ate?'<p class="aviso erro" role="alert">A data final precisa ser igual ou posterior à inicial.</p>':''}
    <div class="filtros-rodape"><select id="adicionar-filtro" aria-label="Adicionar filtro"><option value="">+ Adicionar filtro</option>${Object.entries(defs).filter(([c])=>!campos.includes(c) && !(c==='responsavel'&&modoEuAtivo())).map(([c,d])=>`<option value="${c}">${d.nome}</option>`).join('')}</select><button class="limpar" id="limpar-painel">Limpar tudo</button><span id="contagem-filtros" aria-live="polite">${filtrar(f,S.ultimo?.escopo).length} tarefas</span></div>
    </section>`);
  const menu=document.getElementById('menu-flutuante');
  // O painel de filtros tem largura própria sem afetar calendários e outros menus.
  const painel=menu.querySelector('.filtros-popover');
  const reposicionar=()=>{
    const r=ancora.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(r.right-menu.offsetWidth,innerWidth-menu.offsetWidth-8))+'px';
    menu.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8))+'px';
  };
  reposicionar();
  painel.querySelectorAll('details').forEach(el=>el.addEventListener('toggle',reposicionar));
  painel.querySelectorAll('[data-valor]').forEach(el=>el.addEventListener('change',()=>mudarFiltroPainel(el.dataset.valor,el.value)));
  painel.querySelectorAll('[data-multiplo]').forEach(el=>el.addEventListener('change',()=>mudarFiltroPainel(el.dataset.multiplo,el.value,true)));
  painel.querySelectorAll('[data-excluir]').forEach(el=>el.addEventListener('click',()=>{
    const c=el.dataset.excluir;
    if(c==='periodo'){f.de='';f.ate='';}else f[c]=Array.isArray(f[c])?[]:'';
    f.campos=(f.campos||[]).filter(x=>x!==c); atualizarPainelFiltros();
  }));
  document.getElementById('adicionar-filtro').addEventListener('change',event=>{
    if(!event.target.value)return;f.campos=[...campos,event.target.value];atualizarPainelFiltros();
  });
  document.getElementById('limpar-painel').addEventListener('click',()=>{limparFiltros();abrirMaisFiltros(document.getElementById('btn-mais-filtros'));});
}
function atualizarPainelFiltros() {
  renderVisao(rotaAtual());
  abrirMaisFiltros(document.getElementById('btn-mais-filtros'));
}
function mudarFiltroPainel(campo,valor,multiplo=false) {
  const f=filtroDaRota(rotaAtual());
  const regra=campo==='de'||campo==='ate'?'periodo':campo;
  if(definicoesFiltros()[regra])f.campos=[...new Set([...(f.campos||[]),regra])];
  if(multiplo)f[campo]=f[campo].includes(valor)?f[campo].filter(v=>v!==valor):[...f[campo],valor];else f[campo]=valor;
  atualizarPainelFiltros();
  const menu=document.getElementById('menu-flutuante');
  if(multiplo){
    const details=menu.querySelector(`[data-multi="${campo}"]`);if(details)details.open=true;
    [...menu.querySelectorAll('[data-multiplo]')].find(el=>el.dataset.multiplo===campo&&el.value===valor)?.focus();
  }else menu.querySelector(`[data-valor="${campo}"]`)?.focus();
}
