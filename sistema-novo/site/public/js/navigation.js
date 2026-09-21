/* ---------------- navegação ---------------- */
document.querySelectorAll("#nav button").forEach((b) => {
  b.addEventListener("click", () => {
    if (formEditando && !confirm("Sair do editor sem salvar as mudanças?")) return;
    formEditando = null;
    vistaAtual = b.dataset.vista;
    render();
  });
});

function seletorMovel() {
  if (empresas.length < 2) return "";
  return `<select class="seletor-movel" id="empresa-sel-movel" aria-label="Empresa" style="display:none">
    ${empresas.map((e) => `<option value="${e.id}"${e.id === empresaAtual.id ? " selected" : ""}>${escapar(e.nome)}</option>`).join("")}
  </select>`;
}

function render() {
  const estadoChat = capturarEstadoChat();
  // clique no menu antes da empresa terminar de carregar: espera o carregamento redesenhar
  if (!empresaAtual) return;
  document.querySelectorAll("#nav button").forEach((b) => {const ativa=b.dataset.vista===vistaAtual;b.classList.toggle('ativo',ativa);if(ativa)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  const alvo = document.getElementById("conteudo");
  alvo.classList.toggle("vista-inbox", vistaAtual === "conversas");
  alvo.dataset.tela=vistaAtual;
  let html = "";
  if (vistaAtual === "leads") html = vistaLeads();
  if (vistaAtual === "kanban") html = vistaKanban();
  if (vistaAtual === "config") html = vistaConfig();
  if (vistaAtual === "formularios") html = formEditando ? vistaEditorFormulario() : vistaFormularios();
  if (vistaAtual === "conversas") html = vistaConversas();
  document.getElementById("nav-formularios").style.display = pode.administrar() ? "" : "none";
  alvo.innerHTML = seletorMovel() + html;
  ligarEventos();
  restaurarEstadoChat(estadoChat);
}

function opcoesPapel(atual) {
  return ["dono", "gestor", "vendedor", "leitura"]
    .map((p) => `<option value="${p}"${p === atual ? " selected" : ""}>${NOME_PAPEL[p]}</option>`).join("");
}

// Chama a função do servidor que precisa de privilégio de administrador (convite e link).
async function chamarEquipe(corpo) {
  const { data: sessao } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/equipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.session.access_token}` },
    body: JSON.stringify({ empresa_id: empresaAtual.id, ...corpo }),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || `Erro ${res.status}`);
  return dados;
}

// Mostra o link com botão de copiar. O link dá acesso à conta: só mandar para a própria pessoa.
function mostrarLink(alvoId, link, texto) {
  const alvo = document.getElementById(alvoId);
  if (!alvo) return;
  alvo.innerHTML = `
    <div class="origem" style="margin-top:14px">
      <p style="margin-bottom:10px">${texto}</p>
      <code class="chave-2fa" style="margin-bottom:10px">${escapar(link)}</code>
      <button class="btn btn-largo btn-fantasma" type="button" id="${alvoId}-copiar">Copiar link</button>
    </div>`;
  document.getElementById(`${alvoId}-copiar`).addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(link); e.target.textContent = "Copiado"; } catch (err) { e.target.textContent = "Selecione e copie o link acima"; }
  });
}

function botaoNovoLead() {
  return pode.criarLead() ? `<button class="btn" id="btn-novo-lead" type="button">Novo lead</button>` : "";
}

function seloCadastro(l) {
  return l.cadastro_incompleto ? '<span class="selo alerta" title="Falta o telefone">Cadastro incompleto</span>' : "";
}

function seloCanal(o) {
  if (!o) return "";
  const icone = o.canal === "ctwa" ? ICONE_WHATSAPP : "";
  return `<span class="selo canal canal-${escapar(o.canal)}">${icone}${escapar(NOME_CANAL[o.canal] || o.canal)}</span>`;
}
