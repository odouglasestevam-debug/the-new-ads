/* Quadro comercial com filtros compartilhados e alternativas ao arrasto. */
function vistaKanban() {
  const lista=leadsFiltrados(),conhecidas=new Set(ETAPAS.map(e=>e.id));
  const colunas=ETAPAS.map(etapa=>{
    const grupo=lista.filter(l=>(conhecidas.has(l.etapa)?l.etapa:'novo')===etapa.id);
    return `<section class="coluna" data-etapa="${etapa.id}" aria-label="${etapa.nome}"><div class="cabeca"><span class="ponto" style="background:${etapa.cor}" aria-hidden="true"></span><h2 class="titulo">${etapa.nome}</h2><span class="qtd">${grupo.length}</span></div><div class="corpo">${grupo.map(l=>{
      const o=ultimaOrigem(l),qtd=notas.filter(n=>n.lead_id===l.id).length,dono=nomeResponsavel(l.responsavel_id);
      return `<article class="cartao" ${pode.editarLead(l)?'draggable="true"':''} data-id="${l.id}"><div class="c-topo"><div class="c-ident"><button class="nome-lead" type="button" data-abrir-lead="${l.id}">${escapar(l.nome||'Sem nome')}</button><div class="e">${escapar(telefoneLegivel(l.telefone)||l.email||'Sem telefone')}</div></div>${botaoWhatsApp(l)}</div>
        ${o?`<div class="origem-cartao">${seloCanal(o)}<span title="${escapar(campanhaDaOrigem(o))}">${escapar(campanhaDaOrigem(o))}</span></div>`:''}
        <div class="responsavel-cartao${dono?'':' sem-dono'}"><span class="avatar-responsavel" aria-hidden="true">${dono?escapar(iniciais(dono)):'?'}</span><span title="${escapar(dono?'Atendente: '+dono:'Lead ainda sem atendente')}">${escapar(dono?.split('@')[0]||'Sem atendente')}</span>${qtd?`<span class="sinal" aria-label="${qtd} notas">${ICONE_NOTA}${qtd}</span>`:''}</div>
        ${seloCadastro(l)?`<div class="meta">${seloCadastro(l)}</div>`:''}<div class="c-rodape"><span class="data">${dataCurta(l.criado_em)}</span>${seletorEtapa(l)}</div></article>`;
    }).join('')||'<p class="vazio">Nenhum lead nesta etapa</p>'}</div></section>`;
  }).join('');
  return `<div class="topo topo-operacional"><div><h1>Kanban <span class="quantidade-titulo">${leads.length}</span></h1><div class="desc">Acompanhe cada atendimento até a conclusão</div></div><div class="ferramentas">${botaoNovoLead()}</div></div>${ferramentasLeads()}
    <div class="resumo-resultados"><span>${lista.length} ${lista.length===1?'lead':'leads'} no quadro</span><span id="ajuda-kanban">Mova pelo seletor de etapa ou arraste o cartão</span><label class="atalho-etapa"><span class="sr-only">Ir para etapa</span><select id="ir-etapa" aria-label="Ir para etapa">${ETAPAS.map(e=>`<option value="${e.id}">${e.nome}</option>`).join('')}</select></label></div>
    ${!lista.length&&temFiltroLeads()?vazioLeads():`<div class="kanban" tabindex="0" aria-label="Quadro de etapas" aria-describedby="ajuda-kanban">${colunas}</div>`}`;
}
