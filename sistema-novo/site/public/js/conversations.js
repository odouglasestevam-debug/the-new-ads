/* ---------------- conversas (WhatsApp) ---------------- */
const JANELA_WHATS_MS = 24 * 3600 * 1000;
const ROTULO_STATUS = { enviando: "Enviando", enviada: "Enviada", entregue: "Entregue", lida: "Lida", falhou: "Não enviada", recebida: "" };
const ROTULO_MIDIA = { imagem: "Imagem", video: "Vídeo", audio: "Áudio", documento: "Documento", figurinha: "Figurinha", localizacao: "Localização", reacao: "Reação", outro: "Mensagem não suportada" };
const PAGINA_MENSAGENS = 50;
const historicoCompleto = new Set();
const errosMensagens = new Map();
const enviosPendentes = new Set();
const tentativasEnvio = new Map();
let mostrarContexto = false;
function chaveRascunho(id) { return `crm:rascunho:${usuario?.id}:${empresaAtual?.id}:${id}`; }
function lerRascunho(id) { try { return sessionStorage.getItem(chaveRascunho(id)) || ""; } catch { return ""; } }
function salvarRascunho(id, texto) { try { if (texto) sessionStorage.setItem(chaveRascunho(id), texto); else sessionStorage.removeItem(chaveRascunho(id)); } catch {} }
function capturarEstadoChat() {
  return [...document.querySelectorAll("[data-chat]")].map((el) => {
    const area = el.querySelector(".chat-msgs"), campo = el.querySelector("textarea");
    if (campo) salvarRascunho(el.dataset.chat, campo.value);
    return { id:el.dataset.chat, top:area?.scrollTop || 0, fim:area ? area.scrollHeight-area.scrollTop-area.clientHeight < 80 : true,
      foco:campo === document.activeElement, inicio:campo?.selectionStart, final:campo?.selectionEnd };
  });
}
function restaurarEstadoChat(estados) {
  for (const estado of estados) {
    const el = document.querySelector(`[data-chat="${estado.id}"]`);
    if (!el) continue;
    const area = el.querySelector(".chat-msgs"), campo = el.querySelector("textarea");
    if (area) area.scrollTop = estado.fim ? area.scrollHeight : estado.top;
    if (campo && estado.foco) { campo.focus({preventScroll:true}); campo.setSelectionRange(estado.inicio, estado.final); }
  }
}

function horaCurta(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function leadDaConversa(c) {
  return leads.find((l) => l.id === c.lead_id) || null;
}

async function carregarMensagens(conversaId, anteriores = false) {
  const empresaId = empresaAtual?.id;
  let query = sb.from("mensagens").select("*").eq("empresa_id", empresaId).eq("conversa_id", conversaId)
    .order("criado_em", { ascending:false }).order("id", { ascending:false }).limit(PAGINA_MENSAGENS);
  const existentes = mensagensPorConversa[conversaId] || [];
  if (anteriores && existentes.length) {
    const primeira = existentes[0];
    query = query.or(`criado_em.lt.${primeira.criado_em},and(criado_em.eq.${primeira.criado_em},id.lt.${primeira.id})`);
  }
  const { data, error } = await query;
  if (empresaAtual?.id !== empresaId) return [];
  if (error) { errosMensagens.set(conversaId, "Não foi possível carregar as mensagens. Tente novamente."); mensagensPorConversa[conversaId] = existentes; return existentes; }
  errosMensagens.delete(conversaId);
  if ((data || []).length < PAGINA_MENSAGENS) historicoCompleto.add(conversaId);
  const unicas = new Map(existentes.map((m) => [m.id,m]));
  for (const m of data || []) unicas.set(m.id,m);
  mensagensPorConversa[conversaId] = [...unicas.values()].sort((a,b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id));
  return mensagensPorConversa[conversaId];
}

function janelaAberta(c) {
  return !!c.ultima_entrada_em && Date.now() - new Date(c.ultima_entrada_em).getTime() < JANELA_WHATS_MS;
}

// Corpo do chat reaproveitado na vista Conversas e na ficha do lead.
function htmlChat(c) {
  const l = leadDaConversa(c);
  const msgs = mensagensPorConversa[c.id];
  let ultimoDia = "";
  const bolhas = !msgs ? '<div class="chat-aviso" role="status">Carregando mensagens...</div>'
    : !msgs.length ? '<div class="chat-aviso">Nenhuma mensagem ainda.</div>'
    : msgs.map((m) => {
      const dia = new Date(m.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
      const separador = dia !== ultimoDia ? `<div class="dia-chat">${dia}</div>` : "";
      ultimoDia = dia;
      const midia = m.tipo !== "texto" ? `<span class="bolha-midia">${escapar(ROTULO_MIDIA[m.tipo] || m.tipo)}</span>` : "";
      const autor = m.direcao === "saida" && m.autor_id ? nomeResponsavel(m.autor_id).split("@")[0] : "";
      // sem espaços entre as tags: o texto da mensagem usa pre-wrap e mostraria a indentação
      return separador +
        `<div data-mensagem="${escapar(m.id)}" class="bolha ${m.direcao}${m.status === "falhou" ? " falhou" : ""}">` +
        midia + `<span class="bolha-texto">${escapar(m.texto || "")}</span>` +
        (m.erro ? `<div class="bolha-erro">${escapar(m.erro)}</div>` : "") +
        `<div class="bolha-meta">${autor ? `<span>${escapar(autor)}</span>` : ""}<span>${new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span><span>${ROTULO_STATUS[m.status] || ""}</span></div>` +
        `</div>`;
    }).join("");

  const podeResponder = l && pode.editarLead(l);
  const oficial = c.canal === 'whatsapp_oficial';
  const aberta = !oficial || janelaAberta(c);
  const rodape = !podeResponder
    ? '<div class="chat-aviso">Você pode ler esta conversa, mas só quem é responsável pelo lead responde.</div>'
    : !aberta
      ? `<div class="chat-aviso alerta">${c.ultima_entrada_em
          ? "Passaram 24h desde a última mensagem do lead. Pela regra da Meta, a conversa só pode ser retomada com um modelo aprovado (em breve no CRM)."
          : "No WhatsApp oficial, quem começa a conversa precisa de um modelo aprovado pela Meta (em breve no CRM). Por enquanto, espere a pessoa chamar."}</div>`
      : `<div class="chat-aviso">${oficial ? `WhatsApp oficial. Janela aberta até ${new Date(new Date(c.ultima_entrada_em).getTime() + JANELA_WHATS_MS).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : "WhatsApp NeoGo. Respostas saem pelo número da empresa."}</div>
         <form class="chat-form" data-chat-form="${c.id}">
           <textarea class="chat-campo" aria-label="Mensagem" rows="1" placeholder="Escreva uma mensagem" maxlength="4096">${escapar(lerRascunho(c.id))}</textarea>
           <button class="btn" type="submit" ${enviosPendentes.has(c.id) ? 'disabled' : ''}>${enviosPendentes.has(c.id) ? 'Enviando…' : 'Enviar'}</button>
         </form>
         <div class="aviso" data-chat-aviso="${c.id}"></div>`;

  return `
    <div class="chat" data-chat="${c.id}">
      <div class="chat-msgs" role="log" aria-label="Mensagens da conversa" aria-live="off">
      ${errosMensagens.has(c.id) ? `<button class="mini erro" data-recarregar-mensagens>${escapar(errosMensagens.get(c.id))}</button>` : ''}
      ${msgs?.length && !historicoCompleto.has(c.id) ? '<button class="mini historico" data-carregar-anteriores>Carregar mensagens anteriores</button>' : ''}${bolhas}</div>
      <div class="chat-rodape">${rodape}</div>
    </div>`;
}

// Empresa pode ter dois números: um na API oficial e outro na NeoGo.
const NOME_CANAL_WA = { whatsapp_oficial: "Oficial", whatsapp_nao_oficial: "NeoGo" };
const doisNumeros = () => canaisWhats.length > 1;
function numeroDoCanal(canal) {
  return canaisWhats.find((c) => c.canal === canal)?.numero || "";
}
function rotuloCanal(canal) {
  const numero = numeroDoCanal(canal);
  return numero ? `${numero} · ${NOME_CANAL_WA[canal] || canal}` : (NOME_CANAL_WA[canal] || canal);
}
function seloCanalWa(canal) {
  return `<span class="selo canal wa-${escapar(canal)}">${escapar(rotuloCanal(canal))}</span>`;
}

// Filtros da lista, no espírito do WhatsApp Web: busca, estado e responsável.
const filtroConv = { busca: "", estado: "todas", responsavel: "", canal: "" };
const CHIPS_CONV = [["todas", "Todas"], ["nao_lidas", "Não lidas"], ["sem_resposta", "Sem resposta"], ["minhas", "Minhas"]];

// A última mensagem foi do lead: ninguém respondeu ainda.
function semResposta(c) {
  return !!c.ultima_entrada_em &&
    new Date(c.ultima_entrada_em).getTime() >= new Date(c.ultima_mensagem_em).getTime() - 1000;
}

function iniciais(texto) {
  const partes = String(texto || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes[1]?.[0] || "")).toUpperCase();
}

function conversasFiltradas() {
  const termo = filtroConv.busca.trim().toLowerCase();
  return conversas.filter((c) => {
    const l = leadDaConversa(c);
    if (filtroConv.estado === "minhas" && l?.responsavel_id !== usuario?.id) return false;
    if (filtroConv.estado === "nao_lidas" && !c.nao_lidas) return false;
    if (filtroConv.estado === "sem_resposta" && !semResposta(c)) return false;
    if (filtroConv.canal && c.canal !== filtroConv.canal) return false;
    if (filtroConv.responsavel) {
      const r = l?.responsavel_id || "";
      if (filtroConv.responsavel === "sem" ? !!r : r !== filtroConv.responsavel) return false;
    }
    if (!termo) return true;
    return [l?.nome, l?.telefone, c.wa_id, c.ultima_previa, nomeResponsavel(l?.responsavel_id)]
      .filter(Boolean).join(" ").toLowerCase().includes(termo);
  });
}

function barraFiltrosConversas() {
  const conta = (estado) => estado === "nao_lidas" ? conversas.filter((c) => c.nao_lidas).length
    : estado === "sem_resposta" ? conversas.filter(semResposta).length : 0;
  const chips = CHIPS_CONV.map(([id, nome]) => {
    const n = conta(id);
    return `<button class="chip${filtroConv.estado === id ? " ativo" : ""}" aria-pressed="${filtroConv.estado === id}" type="button" data-filtro-conv="${id}">${nome}${n ? ` <b>${n}</b>` : ""}</button>`;
  }).join("");
  const responsaveis = pode.editarTodos() && equipe.length ? `
    <select class="chip-sel" id="filtro-conv-resp" aria-label="Responsável pelas conversas">
      <option value="">Todos os responsáveis</option>
      ${equipe.map((m) => `<option value="${m.user_id}"${filtroConv.responsavel === m.user_id ? " selected" : ""}>${escapar(m.user_id === usuario.id ? "Minhas conversas" : m.email)}</option>`).join("")}
      <option value="sem"${filtroConv.responsavel === "sem" ? " selected" : ""}>Sem responsável</option>
    </select>` : "";
  // com dois números, dá para olhar um de cada vez
  const numeros = doisNumeros() ? `
    <select class="chip-sel" id="filtro-conv-canal" aria-label="Número do WhatsApp">
      <option value="">Os dois números</option>
      ${canaisWhats.map((c) => `<option value="${escapar(c.canal)}"${filtroConv.canal === c.canal ? " selected" : ""}>${escapar(rotuloCanal(c.canal))}</option>`).join("")}
    </select>` : "";
  return `
    <div class="inbox-topo">
      <input type="search" id="busca-conv" aria-label="Buscar conversas" placeholder="Buscar nome, número ou mensagem" value="${escapar(filtroConv.busca)}" autocomplete="off">
      <div class="chips">${chips}${numeros}${responsaveis}</div>
    </div>`;
}

function vistaConversas() {
  const ativa = conversas.find((c) => c.id === conversaAberta);
  const filtradas = conversasFiltradas();
  const lista = filtradas.length ? filtradas.map((c) => {
    const l = leadDaConversa(c);
    const nome = l?.nome || telefoneLegivel(l?.telefone) || c.wa_id;
    const dono = nomeResponsavel(l?.responsavel_id);
    return `
      <button class="conv-item${c.id === conversaAberta ? " ativa" : ""}" type="button" data-abrir-conversa="${c.id}">
        <span class="conv-ava">${escapar(iniciais(l?.nome || nome))}</span>
        <span class="conv-corpo">
          <span class="conv-topo"><span class="conv-nome">${escapar(nome)}</span><span class="conv-hora">${horaCurta(c.ultima_mensagem_em)}</span></span>
          <span class="conv-previa"><span>${escapar(c.ultima_previa || "Conversa aberta pelo CRM")}</span>${c.nao_lidas ? `<span class="badge">${c.nao_lidas}</span>` : ""}</span>
          <span class="conv-pe">${semResposta(c) ? '<span class="pino">sem resposta</span>' : ""}${doisNumeros() ? `<span class="pino numero">${escapar(NOME_CANAL_WA[c.canal] || c.canal)}</span>` : ""}${dono && pode.editarTodos() ? `<span class="conv-dono">${escapar(dono.split("@")[0])}</span>` : ""}</span>
        </span>
      </button>`;
  }).join("") : '<div class="vazio-geral" style="padding:34px 18px">Nada com esse filtro.</div>';

  const l = ativa ? leadDaConversa(ativa) : null;
  const painel = ativa ? `
    <div class="chat-cabeca">
      <div>
        <div class="nome-cel">${escapar(l?.nome || "Sem nome")}</div>
        <div class="sub-cel">${escapar(telefoneLegivel(l?.telefone))} ${seloCanal(l ? ultimaOrigem(l) : null)}${doisNumeros() ? " " + seloCanalWa(ativa.canal) : ""}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="mini" type="button" id="voltar-lista">Conversas</button>
        ${l ? `<button class="mini" type="button" id="alternar-contexto" aria-expanded="${mostrarContexto}">Detalhes</button>` : ""}
      </div>
    </div>
    ${htmlChat(ativa)}`
    : '<div class="vazio-geral chat-vazio"><div><h2>Seu atendimento, em um só lugar</h2><p>Escolha uma conversa para acompanhar o histórico e responder.</p><span>As mensagens saem pelo WhatsApp da empresa.</span></div></div>';

  const botaoNova = pode.criarLead()
    ? '<button class="btn" id="btn-nova-conversa" type="button">Nova conversa</button>' : "";

  return `
    <div class="topo topo-conversas">
      <div><h1>Conversas <span class="total-conversas">${conversas.length}</span></h1><div class="desc">${escapar(empresaAtual.nome)}</div></div>
      <div class="ferramentas">${botaoNova}</div>
    </div>
    ${conversas.length ? `
      <div class="inbox${ativa ? " com-chat" : ""}${ativa && mostrarContexto ? " com-contexto" : ""}">
        <div class="inbox-lista">
          ${barraFiltrosConversas()}
          <div class="inbox-itens">${lista}</div>
        </div>
        <div class="chat-painel">${painel}</div>
        ${ativa && l && mostrarContexto ? painelContexto(l, ativa) : ''}
      </div>`
      : `<div class="tabela-caixa"><div class="vazio-geral">Nenhuma conversa ainda.${pode.administrar() ? " Ligue o WhatsApp em Ajustes, Integrações." : ""}<br>Para puxar assunto primeiro, use o botão Nova conversa.</div></div>`}`;
}

function painelContexto(l, c) {
  return `<section class="contexto-lead" aria-label="Detalhes do contato">
    <div class="contexto-topo"><h2>Contato</h2><button class="mini" id="fechar-contexto" aria-label="Fechar detalhes">Fechar</button></div>
    <div class="contexto-identidade"><span class="conv-ava">${escapar(iniciais(l.nome || l.telefone))}</span><h3>${escapar(l.nome || 'Sem nome')}</h3><p>${escapar(telefoneLegivel(l.telefone))}</p></div>
    <dl><dt>Etapa comercial</dt><dd>${escapar(NOME_ETAPA[l.etapa] || l.etapa)}</dd><dt>Responsável</dt><dd>${escapar(nomeResponsavel(l.responsavel_id) || 'Sem responsável')}</dd>
    <dt>E-mail</dt><dd>${escapar(l.email || 'Não informado')}</dd><dt>Número de atendimento</dt><dd>${escapar(rotuloCanal(c.canal))}</dd></dl>
    <button class="btn btn-fantasma btn-largo" data-ver-lead="${l.id}">Abrir ficha do lead</button>
    <p class="ajuda">Na ficha você pode alterar a etapa, atribuir um responsável e registrar notas.</p>
  </section>`;
}

// Puxar assunto primeiro: digita o número, o CRM acha ou cria o lead e abre a conversa.
function formularioNovaConversa() {
  const div = document.createElement("div");
  div.className = "fundo-modal fundo-centro";
  div.innerHTML = `
    <div class="caixa-modal">
      <h2>Nova conversa</h2>
      <p class="ajuda">Número com DDD. Se essa pessoa já for lead, a conversa abre na ficha dela em vez de criar outra.</p>
      <div class="campo"><label for="nc-tel">Número do WhatsApp</label>
        <input type="tel" id="nc-tel" placeholder="(11) 99999-9999" autocomplete="off"></div>
      <div class="campo"><label for="nc-nome">Nome (opcional)</label>
        <input type="text" id="nc-nome" autocomplete="off"></div>
      ${doisNumeros() ? `
      <div class="campo"><label for="nc-canal">Falar por qual número</label>
        <select id="nc-canal">
          ${canaisWhats.map((c) => `<option value="${escapar(c.canal)}">${escapar(rotuloCanal(c.canal))}</option>`).join("")}
        </select>
        <span class="ajuda">No número da API oficial, começar conversa exige modelo aprovado pela Meta.</span></div>` : ""}
      <div class="aviso" id="nc-aviso"></div>
      <div class="acoes-modal">
        <button class="btn btn-fantasma" type="button" id="nc-cancelar">Cancelar</button>
        <button class="btn" type="button" id="nc-abrir">Abrir conversa</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  const fechar = () => { div.remove(); document.removeEventListener("keydown", aoTeclar); };
  function aoTeclar(e) { if (e.key === "Escape") fechar(); }
  document.addEventListener("keydown", aoTeclar);
  div.addEventListener("click", (e) => { if (e.target === div) fechar(); });
  div.querySelector("#nc-cancelar").addEventListener("click", fechar);

  const campo = div.querySelector("#nc-tel");
  campo.focus();
  campo.addEventListener("keydown", (e) => { if (e.key === "Enter") div.querySelector("#nc-abrir").click(); });

  const ERROS = {
    telefone_invalido: "Esse número não parece válido. Escreva com DDD.",
    sem_whatsapp: "O WhatsApp desta empresa ainda não está ligado. Configure em Ajustes, Integrações.",
    lead_de_outro: "Esse número já é lead de outra pessoa da equipe. Peça para ela responder.",
    sem_permissao: "Seu acesso é só de leitura.",
    sem_acesso: "Você não tem acesso a esta empresa.",
  };

  div.querySelector("#nc-abrir").addEventListener("click", async () => {
    const aviso = div.querySelector("#nc-aviso");
    const telefone = normalizarTelefone(campo.value);
    if (!telefone) { aviso.className = "aviso erro"; aviso.textContent = "Escreva o número com DDD."; return; }
    aviso.className = "aviso";
    aviso.textContent = "Abrindo...";
    const { data, error } = await sb.rpc("abrir_conversa_whatsapp", {
      p_empresa: empresaAtual.id, p_telefone: telefone, p_nome: div.querySelector("#nc-nome").value.trim() || null,
      p_canal: div.querySelector("#nc-canal")?.value || null,
    });
    if (error) {
      const chave = Object.keys(ERROS).find((k) => error.message.includes(k));
      aviso.className = "aviso erro";
      aviso.textContent = chave ? ERROS[chave] : "Não deu pra abrir: " + error.message;
      return;
    }
    fechar();
    const nova = Array.isArray(data) ? data[0] : data;
    await carregarTudo();
    vistaAtual = "conversas";
    filtroConv.busca = "";
    filtroConv.estado = "todas";
    abrirConversa(nova.conversa_id);
  });
}

function rolarChat(raiz) {
  (raiz || document).querySelectorAll(".chat-msgs").forEach((el) => { el.scrollTop = el.scrollHeight; });
}

// Liga envio e rolagem de um chat já desenhado. `aoMudar` redesenha quem hospeda o chat.
function ligarChat(raiz, conversa, aoMudar) {
  rolarChat(raiz);
  raiz.querySelector("[data-recarregar-mensagens]")?.addEventListener("click", async () => { await carregarMensagens(conversa.id); aoMudar(); });
  raiz.querySelector("[data-carregar-anteriores]")?.addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    const area = raiz.querySelector(".chat-msgs");
    const altura = area.scrollHeight, top = area.scrollTop;
    await carregarMensagens(conversa.id, true);
    aoMudar();
    const nova = document.querySelector(`[data-chat="${conversa.id}"] .chat-msgs`);
    if (nova) nova.scrollTop = top + nova.scrollHeight - altura;
  });
  const form = raiz.querySelector(`[data-chat-form="${conversa.id}"]`);
  if (!form) return;
  const campo = form.querySelector("textarea");
  const aviso = raiz.querySelector(`[data-chat-aviso="${conversa.id}"]`);
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); }
  });
  campo.addEventListener("input", () => { salvarRascunho(conversa.id, campo.value); campo.style.height = "auto"; campo.style.height = Math.min(campo.scrollHeight, 160) + "px"; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const texto = campo.value.trim();
    if (!texto || enviosPendentes.has(conversa.id)) return;
    const empresaEnvio = empresaAtual.id;
    const chaveEnvio = chaveRascunho(conversa.id);
    let tentativa = tentativasEnvio.get(chaveEnvio);
    if (!tentativa || tentativa.texto !== texto) {
      tentativa = {id:crypto.randomUUID(),texto};
      tentativasEnvio.set(chaveEnvio,tentativa);
    }
    enviosPendentes.add(conversa.id);
    campo.readOnly = true;
    const botao = form.querySelector("button");
    botao.disabled = true;
    aviso.className = "aviso";
    aviso.textContent = "Enviando...";
    try {
      const { data: sessao } = await sb.auth.getSession();
      if (!sessao.session) throw new Error("Sua sessão expirou. Entre novamente.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.session.access_token}` },
        body: JSON.stringify({ conversa_id: conversa.id, texto, mensagem_id:tentativa.id }),
      });
      const dados = await res.json().catch(() => ({}));
      if (res.ok) {
        tentativasEnvio.delete(chaveEnvio);
        campo.value = "";
        try { sessionStorage.removeItem(chaveEnvio); } catch {}
      }
      if (empresaAtual?.id !== empresaEnvio) return;
      await carregarMensagens(conversa.id);
      const { data: atual } = await sb.from("conversas").select("*").eq("id", conversa.id).single();
      if (atual) Object.assign(conversa, atual);
      enviosPendentes.delete(conversa.id);
      if (!res.ok) {
        if (res.status === 422) tentativasEnvio.delete(chaveEnvio);
        aoMudar();
        const novoAviso = document.querySelector(`[data-chat-aviso="${conversa.id}"]`);
        if (novoAviso) { novoAviso.className = "aviso erro"; novoAviso.textContent = dados.erro || "Não deu pra enviar."; }
        return;
      }
      aoMudar();
    } catch (err) {
      botao.disabled = false;
      aviso.className = "aviso erro";
      aviso.textContent = "Sem conexão: " + err.message;
    } finally {
      enviosPendentes.delete(conversa.id);
      campo.readOnly = false;
      botao.disabled = false;
    }
  });
}

const carregandoMensagens = new Map();

async function abrirConversa(id) {
  conversaAberta = id;
  const c = conversas.find((x) => x.id === id);
  render();
  await garantirMensagens(id);
  if (c?.nao_lidas) {
    const ultima = mensagensPorConversa[id]?.at(-1);
    if (!ultima || errosMensagens.has(id)) return;
    const { error } = await sb.rpc("marcar_conversa_lida_ate", { p_conversa: id, p_mensagem: ultima.id });
    if (!error) { c.nao_lidas = 0; atualizarContadorConversas(); }
  }
  if (vistaAtual === "conversas" && conversaAberta === id) render();
}

function ligarConversas() {
  document.getElementById("alternar-contexto")?.addEventListener("click", () => { mostrarContexto = !mostrarContexto; render(); });
  document.getElementById("fechar-contexto")?.addEventListener("click", () => { mostrarContexto = false; render(); });
  document.querySelectorAll("[data-abrir-conversa]").forEach((b) => b.addEventListener("click", () => abrirConversa(b.dataset.abrirConversa)));
  const nova = document.getElementById("btn-nova-conversa");
  if (nova) nova.addEventListener("click", formularioNovaConversa);
  document.querySelectorAll("[data-filtro-conv]").forEach((b) => b.addEventListener("click", () => {
    filtroConv.estado = b.dataset.filtroConv;
    render();
  }));
  const selResp = document.getElementById("filtro-conv-resp");
  if (selResp) selResp.addEventListener("change", () => { filtroConv.responsavel = selResp.value; render(); });
  const selCanal = document.getElementById("filtro-conv-canal");
  if (selCanal) selCanal.addEventListener("change", () => { filtroConv.canal = selCanal.value; render(); });
  const buscaConv = document.getElementById("busca-conv");
  if (buscaConv) buscaConv.addEventListener("input", (e) => {
    filtroConv.busca = e.target.value;
    const posicao = e.target.selectionStart;
    render();
    const novo = document.getElementById("busca-conv");
    if (novo) { novo.focus(); if (posicao !== null) novo.setSelectionRange(posicao, posicao); }
  });
  const voltar = document.getElementById("voltar-lista");
  if (voltar) voltar.addEventListener("click", () => { conversaAberta = null; render(); });
  document.querySelectorAll("[data-ver-lead]").forEach((b) => b.addEventListener("click", () => abrirLead(b.dataset.verLead, "conversa")));
  if (vistaAtual !== "conversas" || !conversaAberta) return;
  const c = conversas.find((x) => x.id === conversaAberta);
  const raiz = document.querySelector(".chat-painel");
  if (c && raiz) {
    const carregando = garantirMensagens(c.id);
    // só a primeira chamada redesenha; as outras compartilham a mesma promessa e não reagendam
    if (carregando && !carregando.redesenhoAgendado) {
      carregando.redesenhoAgendado = true;
      carregando.then(() => { if (vistaAtual === "conversas" && conversaAberta === c.id) render(); });
    }
    ligarChat(raiz, c, () => render());
  }
}

// Busca as mensagens uma vez só. Quem chama durante o carregamento recebe a mesma promessa,
// e quem chama depois de carregado recebe null (não precisa redesenhar de novo).
function garantirMensagens(id) {
  if (mensagensPorConversa[id]) return null;
  if (!carregandoMensagens.has(id)) {
    const promessa = carregarMensagens(id).finally(() => carregandoMensagens.delete(id));
    carregandoMensagens.set(id, promessa);
  }
  return carregandoMensagens.get(id);
}
