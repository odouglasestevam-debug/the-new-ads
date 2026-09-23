/* Leads e Kanban compartilham a mesma busca e os mesmos filtros. */
const filtrosLeads={responsavel:'todos',atendente:'todos',etapa:'todas',ordem:'recentes',tipo:'comercial'};
const ICONE_BUSCA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
function leadsFiltrados() {
  const termo=busca.trim().toLocaleLowerCase('pt-BR');
  return leads.filter(l=>{
    // contato do número de suporte fica fora do funil até ser promovido
    if(filtrosLeads.tipo!=='todos'&&(l.tipo||'comercial')!==filtrosLeads.tipo)return false;
    if(filtroCadastro==='incompleto'&&!l.cadastro_incompleto)return false;
    if(filtrosLeads.responsavel==='meus'&&l.responsavel_id!==usuario?.id)return false;
    if(filtrosLeads.responsavel==='sem'&&l.responsavel_id)return false;
    if(filtrosLeads.atendente!=='todos'&&l.responsavel_id!==filtrosLeads.atendente)return false;
    if(filtrosLeads.etapa!=='todas'&&l.etapa!==filtrosLeads.etapa)return false;
    const o=ultimaOrigem(l)||{};
    return !termo||[l.nome,l.email,l.telefone,o.campanha_nome,o.conjunto_nome,o.anuncio_nome,o.utm_campaign,o.utm_medium,o.utm_content].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(termo);
  }).sort((a,b)=>filtrosLeads.ordem==='nome'?String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'):String(b.criado_em||'').localeCompare(String(a.criado_em||'')));
}
function temFiltroLeads(){return !!busca||filtroCadastro!=='todos'||filtrosLeads.responsavel!=='todos'||filtrosLeads.atendente!=='todos'||filtrosLeads.etapa!=='todas'||filtrosLeads.tipo!=='comercial';}
function limparFiltrosLeads(){busca='';filtroCadastro='todos';Object.assign(filtrosLeads,{responsavel:'todos',atendente:'todos',etapa:'todas',ordem:'recentes',tipo:'comercial'});render();}
function ferramentasLeads(){
  return `<section class="barra-trabalho" aria-label="Buscar e filtrar leads">
    <div class="busca-trabalho">${ICONE_BUSCA}<input type="search" id="busca" aria-label="Buscar leads" placeholder="Buscar nome, telefone ou campanha" value="${escapar(busca)}" autocomplete="off"></div>
    <div class="filtros-trabalho">
      <div class="segmentos" aria-label="Responsabilidade">${[['todos','Todos'],['meus','Meus leads'],...(pode.distribuir()?[['sem','Sem responsável']]:[])].map(([id,nome])=>`<button type="button" data-responsabilidade="${id}" aria-pressed="${filtrosLeads.responsavel===id}">${nome}</button>`).join('')}</div>
      ${pode.distribuir()?`<label class="controle-filtro"><span>Atendente</span><select id="filtro-atendente" aria-label="Filtrar por atendente"><option value="todos">Todos os atendentes</option>${equipe.filter(m=>m.papel!=='leitura').map(m=>`<option value="${m.user_id}"${filtrosLeads.atendente===m.user_id?' selected':''}>${escapar(m.nome||m.email)}</option>`).join('')}</select></label>`:''}
      <label class="controle-filtro"><span>Etapa</span><select id="filtro-etapa" aria-label="Filtrar por etapa"><option value="todas">Todas as etapas</option>${ETAPAS.map(e=>`<option value="${e.id}"${filtrosLeads.etapa===e.id?' selected':''}>${e.nome}</option>`).join('')}</select></label>
      <details class="filtros-adicionais"${filtroCadastro!=='todos'||filtrosLeads.tipo!=='comercial'?' open':''}><summary>Mais filtros${(filtroCadastro!=='todos'?1:0)+(filtrosLeads.tipo!=='comercial'?1:0)?` · ${(filtroCadastro!=='todos'?1:0)+(filtrosLeads.tipo!=='comercial'?1:0)}`:''}</summary><div class="filtros-popover"><label>Contatos<select id="filtro-tipo" aria-label="Tipo de contato"><option value="comercial">Só comercial</option><option value="suporte"${filtrosLeads.tipo==='suporte'?' selected':''}>Só suporte</option><option value="todos"${filtrosLeads.tipo==='todos'?' selected':''}>Comercial e suporte</option></select></label><label>Cadastro<select id="filtro-cadastro" aria-label="Cadastro"><option value="todos">Todos os cadastros</option><option value="incompleto"${filtroCadastro==='incompleto'?' selected':''}>Cadastro incompleto</option></select></label><label>Ordenação<select id="ordem-leads" aria-label="Ordenação"><option value="recentes">Mais recentes</option><option value="nome"${filtrosLeads.ordem==='nome'?' selected':''}>Nome A–Z</option></select></label></div></details>
      ${temFiltroLeads()?'<button class="acao-texto" type="button" data-limpar-leads>Limpar filtros</button>':''}
    </div>
  </section>`;
}
function seletorEtapa(l) {
  if(!pode.editarLead(l))return `<span class="num">${escapar(NOME_ETAPA[l.etapa]||l.etapa)}</span>`;
  return `<select class="etapa-sel lead-etapa" data-id="${l.id}" aria-label="Etapa de ${escapar(l.nome||'lead sem nome')}">${ETAPAS.map(e=>`<option value="${e.id}"${l.etapa===e.id?' selected':''}>${e.nome}</option>`).join('')}${ETAPAS.some(e=>e.id===l.etapa)?'':`<option selected>${escapar(l.etapa)}</option>`}</select>`;
}
function vazioLeads(){return `<div class="estado-vazio"><h2>${leadsComerciais().length?'Nenhum lead encontrado':'Seu próximo atendimento começa aqui'}</h2><p>${leadsComerciais().length?'Ajuste a busca ou os filtros para encontrar o contato.':'Adicione um lead ou conecte seus canais para receber os primeiros contatos.'}</p>${leadsComerciais().length?'<button class="btn btn-fantasma" type="button" data-limpar-leads>Limpar filtros</button>':''}</div>`;}
function vistaLeads() {
  const lista=leadsFiltrados();
  const linhas=lista.map(l=>{
    const o=ultimaOrigem(l);
    return `<tr class="linha-lead" data-id="${l.id}">
      <td data-coluna="Contato"><div class="cel-contato"><span class="avatar-lead" aria-hidden="true">${escapar(iniciais(l.nome||l.telefone))}</span><div class="identidade-lead"><button type="button" class="nome-lead" data-abrir-lead="${l.id}">${escapar(l.nome||'Sem nome')}</button><div class="sub-cel">${escapar(telefoneLegivel(l.telefone)||l.email||'Sem telefone')}</div>${l.telefone&&l.email?`<div class="sub-cel email-lead">${escapar(l.email)}</div>`:''}</div>${botaoWhatsApp(l)}</div></td>
      <td data-coluna="Etapa">${seletorEtapa(l)}</td>
      <td data-coluna="Responsável">${pode.distribuir()?`<select class="etapa-sel lead-responsavel" data-id="${l.id}" aria-label="Responsável por ${escapar(l.nome||'lead sem nome')}"><option value="">Sem responsável</option>${equipe.filter(m=>m.papel!=='leitura').map(m=>`<option value="${m.user_id}"${l.responsavel_id===m.user_id?' selected':''}>${escapar(m.nome||m.email)}</option>`).join('')}</select>`:`<span class="nome-responsavel">${escapar(nomeResponsavel(l.responsavel_id)||'Sem responsável')}</span>`}</td>
      <td data-coluna="Origem">${seloCanal(o)||'<span class="sub-cel">Não informada</span>'}<div class="sub-cel origem-resumo" title="${escapar(campanhaDaOrigem(o))}">${escapar(campanhaDaOrigem(o))}</div></td>
      <td data-coluna="Cadastro">${seloCadastro(l)||'<span class="cadastro-completo">Completo</span>'}</td>
      <td data-coluna="Entrada" class="num">${dataCurta(l.criado_em)}</td>
    </tr>`;
  }).join('');
  return `<div class="topo topo-operacional"><div><h1>Leads <span class="quantidade-titulo">${leadsComerciais().length}</span></h1><div class="desc">Contatos e responsáveis de ${escapar(empresaAtual.nome)}</div></div><div class="ferramentas">${botaoNovoLead()}</div></div>
    ${ferramentasLeads()}<div class="resumo-resultados" role="status">${lista.length} ${lista.length===1?'lead':'leads'}${temFiltroLeads()?' encontrados':' na lista'}<span>Abra um contato para ver o histórico</span></div>
    ${lista.length?`<div class="tabela-caixa tabela-leads"><div class="rolagem"><table><caption class="sr-only">Contatos da empresa</caption><thead><tr><th>Contato</th><th>Etapa</th><th>Responsável</th><th>Origem</th><th>Cadastro</th><th>Entrada</th></tr></thead><tbody>${linhas}</tbody></table></div></div>`:vazioLeads()}`;
}
