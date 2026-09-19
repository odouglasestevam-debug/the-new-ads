// Administração de membros. O servidor é a autoridade de acesso; esta árvore apenas configura as regras.
let editorMembro = null;
let aberturaMembro = 0;

function renderMembros() {
  editorMembro = null;
  aberturaMembro++;
  const admin = S.eu.admin;
  const pronto = typeof S.eu.acesso_total === 'boolean';
  document.getElementById('aba').innerHTML = `
    <div class="painel painel-membros">
      <div class="membros-cabeca"><div><h2>Membros da equipe</h2><p class="desc">Administradores gerenciam a equipe e a estrutura. Membros trabalham nas tarefas dos locais permitidos.</p></div>
      ${admin ? `<button class="btn" id="adicionar-membro" ${pronto ? '' : 'disabled'}>Adicionar membro</button>` : ''}</div>
      ${!pronto && admin ? '<p class="aviso erro">As permissões por espaço ainda não estão ativadas no servidor. O cadastro será liberado quando essa configuração estiver concluída.</p>' : ''}
      <div class="rolagem"><table class="tab-simples tabela-membros"><thead><tr><th>Membro</th><th>Função</th><th>Situação</th><th>Acesso</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${S.usuarios.map(u => `<tr><td class="membro-identidade"><strong>${esc(u.nome)}</strong><div class="membro-email">${esc(u.email)}</div></td>
        <td data-label="Função">${u.admin ? 'Administrador' : 'Membro'}</td><td data-label="Situação">${u.ativo ? 'Ativo' : 'Desativado'}</td>
        <td data-label="Acesso">${u.admin ? 'Todos os locais' : u.acesso_total ? 'Todos os espaços, com exceções' : pronto ? 'Espaços selecionados' : 'Todos os espaços'}</td>
        ${admin ? `<td class="membro-editar"><button class="btn btn-fantasma btn-pequeno" data-editar-membro="${u.user_id}" ${pronto ? '' : 'disabled'} aria-label="Editar acesso de ${esc(u.nome)}">Editar acesso</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
    </div><div id="editor-membro"></div>`;
  document.getElementById('adicionar-membro')?.addEventListener('click', () => abrirEditorMembro());
  document.querySelectorAll('[data-editar-membro]').forEach(b => b.addEventListener('click', () => abrirEditorMembro(b.dataset.editarMembro)));
}

async function abrirEditorMembro(userId = null) {
  if (!S.eu?.admin || editorMembro?.salvando) return;
  const alvo = document.getElementById('editor-membro');
  if (!alvo) return;
  const abertura = ++aberturaMembro;
  const u = userId ? S.usuarios.find(x => x.user_id === userId) : null;
  if (userId && !u) return toast('Membro não encontrado.', true);
  let acesso = { acesso_total: false, espacos: [], pastas: [], listas: [] };
  if (u) {
    alvo.innerHTML = '<div class="painel" role="status">Carregando permissões…</div>';
    try {
      const { data, error } = await sb.rpc('tarefas_acessos_membro', { p_user: userId });
      if (abertura !== aberturaMembro || !alvo.isConnected) return;
      if (error || !data) throw error || new Error();
      acesso = data;
    } catch {
      if (abertura === aberturaMembro && alvo.isConnected) alvo.innerHTML = '<div class="painel"><p class="aviso erro">Não foi possível carregar as permissões. Clique em Editar acesso para tentar novamente.</p></div>';
      return;
    }
  }
  editorMembro = { userId, admin: u?.admin || false, total: acesso.acesso_total,
    espacos: new Set(acesso.espacos), pastas: new Set(acesso.pastas), listas: new Set(acesso.listas), salvando: false };
  alvo.innerHTML = `<form class="painel painel-membros" id="form-membro">
    <div class="membros-cabeca"><h2>${u ? `Editar ${esc(u.nome)}` : 'Adicionar membro'}</h2><button type="button" class="btn btn-fantasma btn-pequeno" id="cancelar-membro">Cancelar</button></div>
    <div class="grade-form">
      <div class="campo"><label for="m-nome">Nome</label><input id="m-nome" type="text" maxlength="80" required value="${esc(u?.nome || '')}"></div>
      <div class="campo"><label for="m-email">E-mail</label><input id="m-email" type="email" required autocomplete="off" value="${esc(u?.email || '')}" ${u ? 'readonly' : ''}></div>
      ${!u ? '<div class="campo"><label for="m-senha">Senha inicial</label><input id="m-senha" type="password" minlength="8" autocomplete="new-password"><p class="ajuda-membro">Para conta nova, use pelo menos 8 caracteres. Quem já possui conta mantém a senha atual.</p></div>' : ''}
      <div class="campo"><label for="m-funcao">Função</label><select id="m-funcao"><option value="membro" ${!u?.admin ? 'selected' : ''}>Membro</option><option value="admin" ${u?.admin ? 'selected' : ''}>Administrador</option></select></div>
    </div>
    ${u ? `<label class="caixa-check"><input id="m-ativo" type="checkbox" ${u.ativo ? 'checked' : ''}> Acesso ativo</label><p class="ajuda-membro">Desativar impede a entrada e preserva o histórico.</p>` : ''}
    <h3 class="acesso-titulo">Locais permitidos</h3>
    <div id="regras-membro"></div>
    <p class="aviso" id="aviso-membro" role="status" aria-live="polite"></p>
    <div class="membros-acoes">${u && u.user_id !== S.user.id ? '<button type="button" class="btn btn-perigo" id="excluir-membro">Excluir membro</button>' : ''}<button class="btn" id="salvar-membro">${u ? 'Salvar alterações' : 'Adicionar membro'}</button></div>
  </form>`;
  document.getElementById('m-funcao').addEventListener('change', e => { editorMembro.admin = e.target.value === 'admin'; renderRegrasMembro(); });
  document.getElementById('cancelar-membro').addEventListener('click', () => {
    if (editorMembro?.salvando) return;
    editorMembro = null; aberturaMembro++; alvo.innerHTML = '';
    document.getElementById('adicionar-membro')?.focus();
  });
  document.getElementById('form-membro').addEventListener('submit', salvarMembro);
  document.getElementById('excluir-membro')?.addEventListener('click', () => excluirMembro(u));
  renderRegrasMembro();
  alvo.scrollIntoView({block:'start',behavior:'auto'});
  document.getElementById('m-nome').focus();
}

function renderRegrasMembro() {
  const e = editorMembro;
  const alvo = document.getElementById('regras-membro');
  if (!alvo || !e) return;
  if (e.admin) {
    alvo.innerHTML = '<p class="acesso-info">Administradores têm acesso a todos os espaços, pastas e listas, incluindo os que forem criados depois. Podem gerenciar membros e permissões. As restrições abaixo só se aplicam à função Membro.</p>';
    return;
  }
  const linha = (tipo, id, nome, marcado, bloqueado, detalhe) => `<label class="regra-linha${bloqueado ? ' regra-herdada' : ''}">
    <input type="checkbox" data-regra="${tipo}" data-id="${id}" ${marcado ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}>
    <span><span class="regra-nome">${esc(nome)}</span><small>${detalhe}</small></span></label>`;
  const filhos = (projetoId, pastaId, bloqueado) => {
    let html = '';
    for (const pasta of pastasFilhas(projetoId, pastaId)) {
      const acesso = !bloqueado && !e.pastas.has(pasta.id);
      html += `<div class="regra-ramo">${linha('pastas',pasta.id,pasta.nome,acesso,bloqueado,bloqueado ? 'Bloqueada pelo local acima' : acesso ? 'Pasta · inclui subpastas e listas' : 'Pasta bloqueada, incluindo seu conteúdo')}
        <div class="regra-filhos">${filhos(projetoId,pasta.id,!acesso)}</div></div>`;
    }
    for (const lista of listasEm(projetoId, pastaId)) html += linha('listas',lista.id,lista.nome,!bloqueado && !e.listas.has(lista.id),bloqueado,bloqueado ? 'Bloqueada pelo local acima' : e.listas.has(lista.id) ? 'Lista bloqueada' : 'Lista · tarefas, subtarefas e comentários');
    return html;
  };
  alvo.innerHTML = `<label class="caixa-check acesso-total"><input id="m-total" type="checkbox" ${e.total ? 'checked' : ''}> Todos os espaços, inclusive os criados depois</label>
    <p class="ajuda-membro">Marque os locais que a pessoa pode acessar. Desmarcar uma pasta bloqueia também tudo dentro dela. Novas pastas e listas herdam o acesso do local onde forem criadas.</p>
    <div class="regras-arvore">${S.projetos.map(p => {
      const acesso = e.total || e.espacos.has(p.id);
      return `<div class="regra-espaco">${linha('espacos',p.id,p.nome,acesso,e.total,'Espaço')}
        <div class="regra-filhos">${filhos(p.id,null,!acesso)}</div></div>`;
    }).join('') || '<p class="acesso-info">Nenhum espaço criado. O membro ficará sem acesso a tarefas até você liberar um espaço.</p>'}</div>
    ${!e.total && !e.espacos.size ? '<p class="acesso-info">Nenhum espaço selecionado: este membro poderá entrar, mas não verá tarefas.</p>' : ''}`;
  document.getElementById('m-total').addEventListener('change', event => {
    e.total = event.target.checked;
    if (!e.total) e.espacos = new Set(S.projetos.map(p => p.id));
    renderRegrasMembro();
  });
  alvo.querySelectorAll('[data-regra]').forEach(input => input.addEventListener('change', () => {
    const tipo = input.dataset.regra, id = input.dataset.id;
    const incluir = tipo === 'espacos' ? input.checked : !input.checked;
    if (incluir) e[tipo].add(id); else e[tipo].delete(id);
    renderRegrasMembro();
    alvo.querySelector(`[data-regra="${tipo}"][data-id="${id}"]`)?.focus();
  }));
}

async function salvarMembro(event) {
  event.preventDefault();
  const e = editorMembro;
  if (!e || e.salvando) return;
  const nome = document.getElementById('m-nome').value.trim();
  if (!nome) return aviso('aviso-membro','Informe o nome do membro.','erro');
  const email = document.getElementById('m-email').value.trim();
  const senha = document.getElementById('m-senha')?.value || '';
  const ativo = document.getElementById('m-ativo')?.checked ?? true;
  const permissoes = {acesso_total:e.total,espacos:[...e.espacos],pastas:[...e.pastas],listas:[...e.listas]};
  e.salvando = true;
  const controles = [...event.target.querySelectorAll('input,select,button')].filter(el=>!el.disabled);
  controles.forEach(el=>{el.disabled=true;});
  aviso('aviso-membro','Salvando membro e permissões…');
  let salvo = false;
  try {
    if (e.userId) {
      const {error} = await sb.rpc('tarefas_configurar_membro', {p_user:e.userId,p_nome:nome,p_admin:e.admin,p_ativo:ativo,
        p_total:e.total,p_espacos:permissoes.espacos,p_pastas:permissoes.pastas,p_listas:permissoes.listas});
      if (error) throw error;
    } else {
      const {data,error} = await sb.auth.getSession();
      if (error || !data?.session) throw new Error('Sua sessão expirou. Entre novamente.');
      const response = await fetch(`${SUPABASE_URL}/functions/v1/tarefas-usuarios`, {
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`,apikey:SUPABASE_ANON_KEY},
        body:JSON.stringify({acao:'adicionar',nome,email,senha,admin:e.admin,permissoes})
      });
      const corpo = await response.json().catch(()=>({}));
      if (!response.ok || !corpo.ok) throw new Error(corpo.erro || 'Não foi possível cadastrar.');
    }
    salvo = true;
    await carregar();
    renderAjustes();
    toast('Membro e permissões salvos.');
  } catch (error) {
    const mensagem = salvo ? 'As permissões foram salvas, mas a atualização da tela falhou. Recarregue o aplicativo.' : erroBanco(error,'Não foi possível salvar');
    if (document.getElementById('aviso-membro')) aviso('aviso-membro',mensagem,'erro'); else toast(mensagem,true);
    if (salvo) editorMembro = null;
  } finally {
    e.salvando = false;
    controles.forEach(el=>{el.disabled=false;});
  }
}

// Exclui do gestor (não apaga a conta de login, que pode ser a mesma do CRM).
async function excluirMembro(u) {
  if (!S.eu?.admin || !u || editorMembro?.salvando) return;
  const atribuicoes = S.tarefas.filter(t => t.responsaveis.includes(u.user_id)).length;
  const ok = await confirmar({
    titulo: 'Excluir membro?',
    texto: `<b>${esc(u.nome)}</b> perde todo o acesso ao gestor e sai da lista de membros${atribuicoes ? `. Também deixa de ser responsável por <b>${atribuicoes} ${atribuicoes === 1 ? 'tarefa' : 'tarefas'}</b>` : ''}. Comentários e tarefas criadas continuam. A conta de login não é apagada. Se quiser só bloquear a entrada e manter tudo, use Desativar.`,
  });
  if (!ok) return;
  const { error } = await sb.rpc('tarefas_excluir_membro', { p_user: u.user_id });
  if (error) return aviso('aviso-membro', erroBanco(error, 'Não foi possível excluir'), 'erro');
  editorMembro = null;
  await carregar();
  renderAjustes();
  toast('Membro excluído.');
}
