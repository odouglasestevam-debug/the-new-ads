/* Distribuição por empresa: decisões no banco; esta tela apenas configura e informa presença. */
let distribuicaoAtual=null,distribuicaoRascunho=null,distribuicaoErro='',distribuicaoCarregando=false;
let canalDistribuicao='padrao'; // canal em edição na tela; cada canal tem a sua fila
let presencaAtual=null,presencaEmpresa=null,presencaTimer=null,presencaEmCurso=false;
let processandoDistribuicao=false;
const sessaoPresenca=crypto.randomUUID();
const NOMES_DISTRIBUICAO={manual:'Manual',fila:'Fila rotativa',inteligente:'Menor demanda'};

function rascunhoDe(d){
  const participantes={};
  for(const c of d.canais)participantes[c.id]=[...(d.participantes[c.id]||[])];
  return {modo:d.modo,participantes};
}
function filaDoCanal(d,canal){return d.participantes[canal]||[];}
function nomeCanal(c){return c.numero?`${c.nome} · ${c.numero}`:c.nome;}

function resetarDistribuicao(){
  distribuicaoAtual=null;distribuicaoRascunho=null;distribuicaoErro='';distribuicaoCarregando=false;
  presencaAtual=null;atualizarControlePresenca();
}

function painelDistribuicao(){
  if(!pode.administrar())return '<p>Somente quem administra a empresa pode configurar a distribuição.</p>';
  if(!distribuicaoAtual)return `<section class="bloco distribuicao-painel"><h2>Distribuição de leads</h2>
    <p role="status">${distribuicaoErro?'Não foi possível carregar a distribuição. Tente novamente.':'Carregando as regras desta empresa…'}</p>
    ${distribuicaoErro?'<button class="btn btn-fantasma" data-recarregar-distribuicao>Tentar novamente</button>':''}</section>`;
  const d=distribuicaoRascunho||rascunhoDe(distribuicaoAtual);
  const canais=distribuicaoAtual.canais,canalAtual=canais.find(c=>c.id===canalDistribuicao)||canais[0];
  const ids=filaDoCanal(d,canalAtual.id);
  const participantes=ids.map(id=>distribuicaoAtual.equipe.find(m=>m.user_id===id)).filter(Boolean);
  const alterada=JSON.stringify([d.modo,ids])!==JSON.stringify([distribuicaoAtual.modo,filaDoCanal(distribuicaoAtual,canalAtual.id)]);
  const semEquipe=canais.filter(c=>!filaDoCanal(distribuicaoAtual,c.id).length);
  return `<section class="bloco distribuicao-painel">
    <div class="distribuicao-titulo"><div><h2 id="titulo-distribuicao" tabindex="-1">Distribuição de leads</h2><p>Defina quem recebe os novos leads de ${escapar(empresaAtual.nome)}.</p></div>
      <button class="mini" data-recarregar-distribuicao ${alterada?'disabled title="Salve ou descarte suas alterações antes de atualizar"':''}>Atualizar situação</button></div>
    ${distribuicaoErro?'<p class="aviso erro" role="alert">Não foi possível atualizar. Os dados exibidos são da consulta anterior. Use Atualizar situação para tentar novamente.</p>':''}
    <form id="form-distribuicao">
      <fieldset class="modos-distribuicao"><legend>Como os leads serão entregues</legend>
        ${[['manual','Manual','Você escolhe o responsável de cada lead. A automação fica desligada.'],
          ['fila','Fila rotativa','Cada participante recebe um lead por vez e vai para o final da fila. Funciona mesmo se estiver offline ou pausado.'],
          ['inteligente','Menor demanda','Entrega a quem tem menos leads em andamento, está disponível e com o CRM conectado.']].map(([id,nome,desc])=>`
          <label class="modo-distribuicao"><input type="radio" name="modo-distribuicao" value="${id}" ${d.modo===id?'checked':''}>
            <span><strong>${nome}</strong><span>${desc}</span></span></label>`).join('')}
      </fieldset>
      <div class="distribuicao-canais" role="tablist" aria-label="Canal de entrada dos leads">
        ${canais.map(c=>`<button type="button" role="tab" data-canal-distribuicao="${c.id}" aria-selected="${c.id===canalAtual.id}">
          ${escapar(nomeCanal(c))}<small>${filaDoCanal(distribuicaoAtual,c.id).length||'sem'} ${filaDoCanal(distribuicaoAtual,c.id).length===1?'atendente':'atendentes'}${distribuicaoAtual.pendentes_canal?.[c.id]?` · ${distribuicaoAtual.pendentes_canal[c.id]} aguardando`:''}</small>
        </button>`).join('')}
      </div>
      <div class="distribuicao-equipe"><h3>Quem participa de ${escapar(nomeCanal(canalAtual))}</h3>
        <p>Cada canal tem a sua equipe fixa: o lead que entra por aqui só vai para quem estiver marcado nesta lista. Contas com acesso de leitura não participam.</p>
        ${distribuicaoAtual.equipe.length?distribuicaoAtual.equipe.map(m=>`<label class="distribuicao-membro">
          <input type="checkbox" name="distribuicao-membro" value="${m.user_id}" ${ids.includes(m.user_id)?'checked':''}>
          <span class="distribuicao-pessoa"><strong>${escapar(m.nome||m.email||'Membro sem nome')}</strong><small>${escapar(NOME_PAPEL[m.papel]||m.papel)}</small></span>
          <span class="distribuicao-carga">${m.demanda} em andamento</span>
          <span class="distribuicao-status ${m.online&&m.disponivel?'disponivel':''}">${!m.online?'Offline':m.disponivel?'Disponível':'Pausado'}</span>
        </label>`).join(''):'<p>Nenhum atendente cadastrado. Adicione alguém na aba Equipe para ativar a distribuição.</p>'}
      </div>
      <div class="distribuicao-regra" id="regra-distribuicao">
        ${d.modo==='fila'?`<strong>Ordem do rodízio${alterada?' após salvar':''}</strong><ol>${participantes.map(m=>`<li>${escapar(m.nome||m.email)}</li>`).join('')||'<li>Selecione pelo menos um atendente.</li>'}</ol><p>Ao receber, o atendente vai para o final. Salvar sem mudar participantes mantém o rodízio.</p>`:
          d.modo==='inteligente'?'<strong>O que conta como demanda</strong><p>Leads atribuídos que ainda não estão em Cliente ou Perdido. Em caso de empate, recebe quem está há mais tempo sem receber pelo rodízio.</p><p>Sem ninguém disponível, os novos leads aguardam. A distribuição retoma quando um participante voltar.</p>':
          '<strong>Distribuição manual</strong><p>Os leads aguardando a automação passam a ser gerenciados manualmente. Ao reativar, só novas entradas entram na distribuição.</p>'}
      </div>
      <p class="distribuicao-nota">Vale para novos leads sem responsável, recebidos por formulários, WhatsApp ou criados no CRM. Leads existentes e responsáveis escolhidos manualmente são preservados.
        Canal sem equipe deixa o lead aguardando: ele não é repassado para a equipe de outro canal.</p>
      ${d.modo!=='manual'&&semEquipe.length?`<p class="aviso" role="status">Sem equipe definida em: ${escapar(semEquipe.map(nomeCanal).join(', '))}. Os leads desses canais ficam aguardando.</p>`:''}
      <div class="distribuicao-acoes"><button class="btn" type="submit" ${alterada?'':'disabled'}>Salvar distribuição</button>
        <button class="btn btn-fantasma" type="button" id="descartar-distribuicao" ${alterada?'':'disabled'}>Descartar alterações</button>
        <span role="status" id="aviso-distribuicao">${alterada?'Alterações não salvas.':''}</span></div>
    </form>
  </section>
  <section class="bloco distribuicao-painel"><h3>Acompanhamento</h3>
    <p><strong>${distribuicaoAtual.pendentes}</strong> ${distribuicaoAtual.pendentes===1?'lead aguardando':'leads aguardando'} distribuição automática. Situação no momento da última atualização.</p>
    <h3>Últimas entregas automáticas</h3>
    ${distribuicaoAtual.historico.length?`<ol class="distribuicao-historico">${distribuicaoAtual.historico.map(h=>`<li><div><strong>${escapar(h.nome||h.telefone||'Lead sem nome')}</strong><span>${escapar(h.nome_responsavel||h.email||'Membro removido')}</span></div><small>${escapar(nomeCanal(distribuicaoAtual.canais.find(c=>c.id===h.canal)||{nome:h.canal||'Canal removido'}))} · ${escapar(NOMES_DISTRIBUICAO[h.modo])} · ${escapar(dataCurta(h.criado_em))}</small></li>`).join('')}</ol>`:'<p>As entregas aparecerão aqui quando a automação distribuir os primeiros leads.</p>'}
  </section>`;
}

async function carregarDistribuicao(restaurarFoco=false){
  if(!empresaAtual||!pode.administrar()||distribuicaoCarregando)return;
  const id=empresaAtual.id;distribuicaoCarregando=true;distribuicaoErro='';
  try{
    const {data,error}=await sb.rpc('crm_obter_distribuicao',{p_empresa:id});
    if(error||!data)throw error||new Error('sem_dados');
    if(empresaAtual?.id!==id)return;
    distribuicaoAtual=data;distribuicaoRascunho=rascunhoDe(data);
    if(!data.canais.some(c=>c.id===canalDistribuicao))canalDistribuicao='padrao';
  }catch{if(empresaAtual?.id===id)distribuicaoErro='carregamento';}
  finally{if(empresaAtual?.id===id){distribuicaoCarregando=false;if(vistaAtual==='config'&&abaAjustes==='distribuicao'){render();if(restaurarFoco)document.querySelector('[data-recarregar-distribuicao]')?.focus({preventScroll:true});}}}
}

function ligarDistribuicao(){
  document.querySelectorAll('[data-recarregar-distribuicao]').forEach(b=>b.onclick=()=>{b.disabled=true;b.textContent='Atualizando…';document.querySelectorAll('#form-distribuicao input,#form-distribuicao button').forEach(el=>el.disabled=true);carregarDistribuicao(true);});
  if(vistaAtual==='config'&&abaAjustes==='distribuicao'&&!distribuicaoAtual&&!distribuicaoErro)carregarDistribuicao();
  const form=document.getElementById('form-distribuicao');
  if(form){
    form.onchange=e=>{
      distribuicaoRascunho.modo=form.elements['modo-distribuicao'].value;
      const selecionados=[...form.querySelectorAll('[name="distribuicao-membro"]:checked')].map(x=>x.value);
      const atual=filaDoCanal(distribuicaoRascunho,canalDistribuicao);
      // Preserva o rodízio real do canal; novos participantes entram no final.
      distribuicaoRascunho.participantes[canalDistribuicao]=[...atual.filter(id=>selecionados.includes(id)),...selecionados.filter(id=>!atual.includes(id))];
      const name=e.target.name,value=e.target.value;render();
      [...document.getElementsByName(name)].find(x=>x.value===value)?.focus({preventScroll:true});
    };
    document.getElementById('descartar-distribuicao').onclick=()=>{distribuicaoRascunho=rascunhoDe(distribuicaoAtual);render();document.getElementById('titulo-distribuicao')?.focus({preventScroll:true});};
    form.onsubmit=async e=>{
      e.preventDefault();const id=empresaAtual.id,aviso=document.getElementById('aviso-distribuicao');
      const outrosCanais=Object.entries(distribuicaoRascunho.participantes).some(([c,ids])=>c!==canalDistribuicao&&ids.length);
      if(distribuicaoRascunho.modo!=='manual'&&!filaDoCanal(distribuicaoRascunho,canalDistribuicao).length&&!outrosCanais){aviso.textContent='Selecione pelo menos um atendente em algum canal.';return;}
      const botoes=[...form.querySelectorAll('button,input')];botoes.forEach(b=>b.disabled=true);aviso.textContent='Salvando…';
      try{
        const {data,error}=await sb.rpc('crm_salvar_distribuicao',{p_empresa:id,p_modo:distribuicaoRascunho.modo,p_participantes:filaDoCanal(distribuicaoRascunho,canalDistribuicao),p_revisao:distribuicaoAtual.revisao,p_canal:canalDistribuicao});
        if(error||!data)throw error||new Error('sem_dados');
        if(empresaAtual?.id!==id)return;
        distribuicaoErro='';distribuicaoAtual=data;distribuicaoRascunho=rascunhoDe(data);
        if(vistaAtual==='config'&&abaAjustes==='distribuicao'){render();document.getElementById('aviso-distribuicao').textContent='Distribuição salva.';document.getElementById('titulo-distribuicao').focus({preventScroll:true});}
        pulsarPresenca().catch(()=>{});
        processarDistribuicao().catch(()=>{});
      }catch(error){
        if(!aviso.isConnected)return;
        aviso.textContent=error.message?.includes('configuracao_alterada')?'Outro administrador alterou as regras. Descarte suas alterações e atualize a situação antes de salvar.':
          error.message?.includes('participante_invalido')?'A equipe mudou. Descarte suas alterações e atualize a situação para selecionar os atendentes novamente.':'Não foi possível salvar. Tente novamente.';
        botoes.forEach(b=>b.disabled=false);
      }
    };
  }
  document.querySelectorAll('[data-canal-distribuicao]').forEach(b=>b.onclick=()=>{
    if(b.dataset.canalDistribuicao===canalDistribuicao)return;
    const d=distribuicaoRascunho,atual=canalDistribuicao;
    const mudou=d&&JSON.stringify([d.modo,filaDoCanal(d,atual)])!==JSON.stringify([distribuicaoAtual.modo,filaDoCanal(distribuicaoAtual,atual)]);
    if(mudou&&!confirm('Sair deste canal sem salvar as alterações?'))return;
    if(mudou)distribuicaoRascunho=rascunhoDe(distribuicaoAtual);
    canalDistribuicao=b.dataset.canalDistribuicao;render();
    document.querySelector(`[data-canal-distribuicao="${canalDistribuicao}"]`)?.focus({preventScroll:true});
  });
  document.querySelectorAll('[data-alternar-presenca]').forEach(b=>b.onclick=()=>pulsarPresenca(!presencaAtual?.disponivel));
  atualizarControlePresenca();
}

function painelDisponibilidade(){
  return `<section class="bloco distribuicao-painel"><h2>Sua disponibilidade</h2>
    <p>Na distribuição por menor demanda, você recebe novos leads quando estiver disponível e com o CRM aberto e conectado.</p>
    <button class="btn btn-fantasma" data-alternar-presenca disabled>Verificando disponibilidade…</button>
    <p data-presenca-descricao role="status"></p>
    <p>Pausar interrompe novas entregas por menor demanda. Seus leads atuais continuam com você. Na fila rotativa, a disponibilidade não altera sua vez.</p></section>`;
}

function atualizarControlePresenca(){
  const podeReceber=equipe.some(m=>m.user_id===usuario?.id&&['dono','gestor','vendedor'].includes(m.papel));
  const texto=!podeReceber?'Você não participa como atendente desta empresa.':!presencaAtual?'Conectando disponibilidade…':presencaAtual.erro?'Sem confirmação de conexão. Tente novamente.':
    !presencaAtual.participa?'Você não está entre os participantes selecionados pelo administrador.':presencaAtual.modo==='manual'?'A distribuição automática está desligada nesta empresa.':
    presencaAtual.modo==='fila'?'Esta empresa usa fila rotativa, mesmo para quem está pausado ou offline.':presencaAtual.disponivel?'Você está disponível para receber novos leads.':'Você está pausado para novas entregas por menor demanda.';
  document.querySelectorAll('[data-presenca-descricao]').forEach(el=>el.textContent=texto);
  document.querySelectorAll('[data-alternar-presenca]').forEach(b=>{
    b.disabled=!podeReceber||presencaEmCurso||!presencaAtual;
    b.textContent=presencaEmCurso?'Atualizando…':presencaAtual?.erro?'Reconectar disponibilidade':presencaAtual?.disponivel?'Disponível · Pausar':'Pausado · Ficar disponível';
    b.setAttribute('aria-pressed',String(!!presencaAtual?.disponivel&&!presencaAtual.erro));
    b.title=texto;
  });
  const lateral=document.getElementById('presenca-lateral');if(lateral)lateral.hidden=!podeReceber;
}

async function pulsarPresenca(disponivel=null){
  const id=presencaEmpresa;
  if(!id||empresaAtual?.id!==id||presencaEmCurso)return;
  if(!equipe.some(m=>m.user_id===usuario?.id&&['dono','gestor','vendedor'].includes(m.papel))){atualizarControlePresenca();return;}
  presencaEmCurso=true;atualizarControlePresenca();
  try{
    const {data,error}=await sb.rpc('crm_presenca',{p_empresa:id,p_sessao:sessaoPresenca,p_disponivel:presencaAtual?.erro?null:disponivel});
    if(error||!data)throw error||new Error('sem_dados');
    if(empresaAtual?.id===id)presencaAtual=data;
  }catch{if(empresaAtual?.id===id)presencaAtual={erro:true};}
  finally{presencaEmCurso=false;atualizarControlePresenca();}
}

function pararPresenca(){
  clearInterval(presencaTimer);presencaTimer=null;
  const id=presencaEmpresa;presencaEmpresa=null;
  if(id)sb.rpc('crm_presenca',{p_empresa:id,p_sessao:sessaoPresenca,p_sair:true}).catch(()=>{});
}
function iniciarPresenca(id){
  presencaEmpresa=id;pulsarPresenca().catch(()=>{});
  processarDistribuicao().catch(()=>{});
  clearInterval(presencaTimer);
  presencaTimer=setInterval(()=>{pulsarPresenca().catch(()=>{});processarDistribuicao().catch(()=>{});sincronizarLeadsDistribuidos().catch(()=>{});},25000);
}
async function processarDistribuicao(){
  if(!empresaAtual||!pode.administrar()||processandoDistribuicao)return;
  const id=empresaAtual.id;processandoDistribuicao=true;
  try{await sb.rpc('crm_processar_distribuicao',{p_empresa:id});}finally{processandoDistribuicao=false;}
}
window.addEventListener('online',()=>pulsarPresenca().catch(()=>{}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){pulsarPresenca().catch(()=>{});sincronizarLeadsDistribuidos().catch(()=>{});}});

let sincronizandoDistribuicao=false,leadsDistribuicaoRender=false;
async function sincronizarLeadsDistribuidos(){
  if(!empresaAtual||document.hidden||sincronizandoDistribuicao)return;
  const id=empresaAtual.id;sincronizandoDistribuicao=true;
  try{
    const {data,error}=await sb.from('leads').select('*, lead_origens(*)').eq('empresa_id',id).order('criado_em',{ascending:false});
    if(error||!data||empresaAtual?.id!==id)return;
    if(JSON.stringify(data)===JSON.stringify(leads)){
      if(leadsDistribuicaoRender&&!arrastandoCartao&&['leads','kanban'].includes(vistaAtual)&&!document.querySelector('.fundo-modal')&&!document.activeElement?.matches('input,select,textarea')){leadsDistribuicaoRender=false;render();}
      return;
    }
    const ids=new Set(data.map(l=>l.id));
    const perdeuAcesso=papel==='vendedor'&&leads.some(l=>!ids.has(l.id));
    leads=data;leadsDistribuicaoRender=true;document.getElementById('cont-leads').textContent=leadsComerciais().length||'';
    if(perdeuAcesso){
      document.querySelectorAll('.fundo-modal').forEach(el=>el.remove());
      notas=notas.filter(n=>ids.has(n.lead_id));
      for(const c of conversas.filter(c=>!ids.has(c.lead_id))){delete mensagensPorConversa[c.id];if(conversaAberta===c.id)conversaAberta=null;}
      conversas=conversas.filter(c=>ids.has(c.lead_id));
      await atualizarConversas();
    }
    if(!arrastandoCartao&&['leads','kanban'].includes(vistaAtual)&&!document.querySelector('.fundo-modal')&&!document.activeElement?.matches('input,select,textarea')){leadsDistribuicaoRender=false;render();}
    if(perdeuAcesso&&vistaAtual==='conversas')render();
  }finally{sincronizandoDistribuicao=false;}
}
