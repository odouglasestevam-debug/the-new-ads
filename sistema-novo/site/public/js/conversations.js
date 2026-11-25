/* ---------------- conversas (WhatsApp) ---------------- */
const JANELA_WHATS_MS = 24 * 3600 * 1000;
const ROTULO_STATUS = { enviando: "Enviando", enviada: "Enviada", entregue: "Entregue", lida: "Lida", falhou: "Não enviada", recebida: "" };
const ROTULO_MIDIA = { imagem: "Imagem", video: "Vídeo", audio: "Áudio", documento: "Documento", figurinha: "Figurinha", localizacao: "Localização", reacao: "Reação", outro: "Mensagem não suportada" };
const PAGINA_MENSAGENS = 50;
const historicoCompleto = new Set();
const errosMensagens = new Map();
const enviosPendentes = new Set();
const tentativasEnvio = new Map();
const posicoesChat = new Map();
const respostasSelecionadas = new Map();
let mostrarContexto = false;
let listaConversaIds = null, totalConversas = 0, totalNaoLidas = null, chaveListaConv = '', carregandoListaConv = false;
let timerBuscaConv, sequenciaBuscaConv = 0;
// Contagem por etapa das abas do topo. Fica null enquanto o banco não tiver a migration 0031:
// sem ela a busca não filtra por etapa, então as abas nem aparecem (nada de filtro pela metade).
let porEtapaConv = null, totalEtapasConv = 0;
const chaveFiltroConv=()=>JSON.stringify(filtroConv);
function parametrosConversas(offset=0,limite=50){
  const p={p_empresa:empresaAtual.id,p_busca:filtroConv.busca,p_estado:filtroConv.estado,p_responsavel:filtroConv.responsavel,p_canal:filtroConv.canal,p_offset:offset,p_limite:limite};
  if(filtroConv.etapa)p.p_etapa=filtroConv.etapa;
  return p;
}
function aceitarListaConversas(data,adicionar=false){
  if(!data)return;
  if(data.por_etapa){porEtapaConv=data.por_etapa;totalEtapasConv=data.total_etapas??0;}
  const recebidas=(data.items||[]).map(item=>{const {lead,...conversa}=item;if(lead){const atual=leads.find(l=>l.id===lead.id);if(atual)Object.assign(atual,lead);else leads.push({...lead,lead_origens:[]});}return conversa;});
  const mapa=new Map(conversas.map(c=>[c.id,c]));for(const c of recebidas)mapa.set(c.id,c);conversas=[...mapa.values()];
  listaConversaIds=adicionar?[...new Set([...(listaConversaIds||[]),...recebidas.map(c=>c.id)])]:recebidas.map(c=>c.id);
  totalConversas=data.total||0;totalNaoLidas=data.nao_lidas||0;chaveListaConv=chaveFiltroConv();
}
async function buscarListaConversas(adicionar=false){
  const seq=++sequenciaBuscaConv,empresaId=empresaAtual.id,chave=chaveFiltroConv();
  carregandoListaConv=true;
  const {data,error}=await sb.rpc('buscar_conversas_crm',parametrosConversas(adicionar?(listaConversaIds?.length||0):0));
  if(seq!==sequenciaBuscaConv||empresaAtual?.id!==empresaId||chave!==chaveFiltroConv())return;
  carregandoListaConv=false;
  if(error){const aviso=document.querySelector('.inbox-itens');if(aviso)aviso.innerHTML='<p class="chat-aviso">Não foi possível buscar conversas. Tente alterar a busca novamente.</p>';return;}
  aceitarListaConversas(data,adicionar);atualizarContadorConversas();sincronizarInbox();
}
function chaveRascunho(id) { return `crm:rascunho:${usuario?.id}:${empresaAtual?.id}:${id}`; }
function lerRascunho(id) { try { return sessionStorage.getItem(chaveRascunho(id)) || ""; } catch { return ""; } }
function salvarRascunho(id, texto) { try { if (texto) sessionStorage.setItem(chaveRascunho(id), texto); else sessionStorage.removeItem(chaveRascunho(id)); } catch {} }
function capturarEstadoChat() {
  return [...document.querySelectorAll("[data-chat]")].map((el) => {
    const area = el.querySelector(".chat-msgs"), campo = el.querySelector("textarea");
    if (campo) salvarRascunho(el.dataset.chat, campo.value);
    const posicao = {top:area?.scrollTop || 0,fim:area ? area.scrollHeight-area.scrollTop-area.clientHeight < 80 : true};
    posicoesChat.set(chaveRascunho(el.dataset.chat),posicao);
    return { id:el.dataset.chat, auxiliar:el.querySelector('.chat-extra'), midias:[...el.querySelectorAll('[data-midia-aberta]')], ...posicao,
      foco:campo === document.activeElement, inicio:campo?.selectionStart, final:campo?.selectionEnd };
  });
}
function restaurarEstadoChat(estados) {
  for (const estado of estados) {
    const el = document.querySelector(`[data-chat="${estado.id}"]`);
    if (!el) continue;
    const area = el.querySelector(".chat-msgs"), campo = el.querySelector("textarea");
    if (estado.auxiliar?.childElementCount) el.querySelector('.chat-extra')?.replaceWith(estado.auxiliar);
    for (const midia of estado.midias || []) el.querySelector(`[data-abrir-midia="${midia.dataset.midiaAberta}"]`)?.replaceWith(midia);
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

/* ícones no traço do WhatsApp Web (desenhos próprios) */
const ICONE_NOVA_CONVERSA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6.5"/><path d="M17.6 3.4a2 2 0 0 1 2.9 2.9L12 14.8l-3.8.9.9-3.8Z"/></svg>';
const ICONE_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>';
const ICONE_VOLTAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>';
const ICONE_FECHAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICONE_ENVIAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l-.1 6.7L15 12l-11.7 1.9Z"/></svg>';
const ICONE_ANEXO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/></svg>';
const ICONE_MODELO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
const ICONE_CONVERSA_GRANDE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>';
const ICONE_STATUS = {
  enviando: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/></svg>',
  enviada: '<svg viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 5.8 2.6 2.6L12 2"/></svg>',
  dupla: '<svg viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m1 5.8 2.6 2.6L10 2M7.2 8.2l.2.2L13.8 2"/></svg>',
};
// Ícone do envio sempre acompanhado do texto (lido por leitor de tela e no título); "Não enviada" aparece escrito.
function statusMensagem(m) {
  if (m.direcao !== "saida") return "";
  const rotulo = ROTULO_STATUS[m.status] || "";
  if (!rotulo) return "";
  const icone = m.status === "enviando" ? ICONE_STATUS.enviando : m.status === "enviada" ? ICONE_STATUS.enviada
    : ["entregue", "lida"].includes(m.status) ? ICONE_STATUS.dupla : "";
  return `<span class="status-msg ${escapar(m.status)}" title="${rotulo}">${icone}<span${icone ? ' class="sr-only"' : ""}>${rotulo}</span></span>`;
}

// Avatar com iniciais em cor clara, sempre a mesma cor para o mesmo nome.
const CORES_AVATAR = [["#fde2cf","#a6491a"],["#d7e9fb","#1d5fa8"],["#dcf5dc","#1f7a3a"],["#fbe3ef","#a8326b"],["#ece3fb","#6b3fb0"],["#fff1c2","#7f5a00"],["#d6f3f1","#0f766e"],["#e3e8eb","#54656f"]];
function estiloAvatar(texto) {
  let soma = 0;
  for (const ch of String(texto || "")) soma = (soma * 31 + ch.codePointAt(0)) % 9973;
  const [fundo, cor] = CORES_AVATAR[soma % CORES_AVATAR.length];
  return `--ava-fundo:${fundo};--ava-texto:${cor}`;
}
function tagEtapa(etapa) {
  const e = ETAPAS.find((x) => x.id === etapa);
  return `<span class="tag-etapa" style="--cor-etapa:${e?.cor || "#8696a0"}">${escapar(e?.nome || etapa || "Sem etapa")}</span>`;
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
      const midia = m.tipo !== "texto" ? `<span class="bolha-midia">${escapar(ROTULO_MIDIA[m.tipo] || m.tipo)}</span>${c.canal === 'whatsapp_oficial' && ['imagem','video','audio','documento','figurinha'].includes(m.tipo) ? `<button class="mini" data-abrir-midia="${escapar(m.id)}">Abrir ${escapar((ROTULO_MIDIA[m.tipo] || 'arquivo').toLowerCase())}</button>` : ''}` : "";
      const autor = m.direcao === "saida" && m.autor_id ? nomeResponsavel(m.autor_id).split("@")[0] : "";
      const referencia=m.midia?.resposta?.texto || (m.midia?.context?.id ? msgs.find(x=>x.wa_message_id===m.midia.context.id)?.texto || 'Mensagem anterior' : '');
      const lat=Number(m.midia?.latitude??m.midia?.degreesLatitude),lon=Number(m.midia?.longitude??m.midia?.degreesLongitude);
      const localizacao=m.tipo==='localizacao' && Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180 ? `<a class="mini" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps?q=${lat},${lon}">Abrir localização</a>` : '';
      // sem espaços entre as tags: o texto da mensagem usa pre-wrap e mostraria a indentação
      return separador +
        `<div data-mensagem="${escapar(m.id)}" class="bolha ${m.direcao}${m.status === "falhou" ? " falhou" : ""}">` +
        (referencia?`<blockquote class="mensagem-citada">${escapar(referencia)}</blockquote>`:'')+midia + localizacao + `<span class="bolha-texto">${escapar(m.texto || "")}</span>` +
        (c.canal==='whatsapp_oficial'&&m.wa_message_id&&l&&pode.editarLead(l)&&janelaAberta(c)?`<button class="responder-mensagem mini" type="button" data-responder-mensagem="${escapar(m.id)}">Responder</button>`:'')+
        (m.erro ? `<div class="bolha-erro">${escapar(m.erro)}</div>` : "") +
        (m.status === 'falhou' && m.tipo === 'texto' && !m.midia?.modelo && l && pode.editarLead(l) ? `<button class="mini" data-recuperar-texto="${escapar(m.id)}">Recuperar texto</button>` : '') +
        `<div class="bolha-meta">${autor ? `<span>${escapar(autor)} ·</span>` : ""}${m.midia?.agendada ? `<span class="marca-agendada" title="Mensagem agendada">${ICONE_RELOGIO}<span class="sr-only">Agendada</span></span>` : ""}<span>${new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>${statusMensagem(m)}</div>` +
        `</div>`;
    }).join("");

  const podeResponder = l && pode.editarLead(l);
  const oficial = c.canal === 'whatsapp_oficial';
  const aberta = !oficial || janelaAberta(c);
  const respostaAtual=respostasSelecionadas.get(c.id);
  const rodape = !podeResponder
    ? '<div class="chat-aviso">Você pode ler esta conversa, mas só quem é responsável pelo lead responde.</div>'
    : !aberta
      ? `<div class="chat-aviso alerta">${c.ultima_entrada_em
          ? "A janela de 24 horas terminou. Use um modelo aprovado para retomar a conversa."
          : "Use um modelo aprovado para iniciar esta conversa pelo WhatsApp oficial."}</div>`
      : `<div class="chat-aviso">${oficial ? `WhatsApp oficial. Janela aberta até ${new Date(new Date(c.ultima_entrada_em).getTime() + JANELA_WHATS_MS).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.` : "WhatsApp NeoGo. Respostas saem pelo número da empresa."}</div>
         ${respostaAtual?`<div class="chat-citacao"><p>Respondendo a: ${escapar((respostaAtual.texto||ROTULO_MIDIA[respostaAtual.tipo]||'Mensagem').slice(0,200))}</p><button class="mini" type="button" data-cancelar-resposta>Cancelar resposta</button></div>`:''}
         <form class="chat-form" data-chat-form="${c.id}">
           <textarea class="chat-campo" aria-label="Mensagem" rows="1" placeholder="Digite uma mensagem" maxlength="4096">${escapar(lerRascunho(c.id))}</textarea>
           ${botaoAgendarComposer()}<button class="btn-enviar" type="submit" aria-label="${enviosPendentes.has(c.id) ? 'Enviando…' : 'Enviar'}" title="Enviar" ${enviosPendentes.has(c.id) ? 'disabled' : ''}>${ICONE_ENVIAR}</button>
         </form>
         <div class="aviso" data-chat-aviso="${c.id}"></div>`;

  return `
    <div class="chat" data-chat="${c.id}" data-janela="${aberta}" data-responder="${!!podeResponder}">
      <div class="chat-msgs" role="log" aria-label="Mensagens da conversa" aria-live="off">
      ${errosMensagens.has(c.id) ? `<button class="mini erro" data-recarregar-mensagens>${escapar(errosMensagens.get(c.id))}</button>` : ''}
      ${msgs?.length && !historicoCompleto.has(c.id) ? '<button class="mini historico" data-carregar-anteriores>Carregar mensagens anteriores</button>' : ''}${bolhas}${msgs ? bolhasAgendadas(c) : ''}</div>
      <div class="chat-rodape">${podeResponder && oficial ? `<div class="chat-recursos"><button class="mini" type="button" data-modelos>${ICONE_MODELO}Modelos aprovados</button>${aberta ? `<label class="mini anexar">${ICONE_ANEXO}Anexar arquivo<input type="file" data-arquivo accept="image/jpeg,image/png,image/webp,video/mp4,audio/ogg,audio/mpeg,audio/mp4,application/pdf"></label>` : ''}</div><div class="chat-extra"></div>` : ''}${rodape}</div>
    </div>`;
}

// Empresa pode ter dois números: um na API oficial e outro na NeoGo.
const NOME_CANAL_WA = { whatsapp_oficial: "Comercial", whatsapp_nao_oficial: "Suporte" };
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
const filtroConv = { busca: "", estado: "todas", responsavel: "", canal: "", etapa: "" };

// Abas de etapa da barra do topo, no lugar das etiquetas do WhatsApp Business.
function abasEtapaConversas() {
  if (!porEtapaConv) return "";
  const numero = (n) => n > 999 ? "999+" : String(n || 0);
  const aba = (id, nome, n, cor) => `<button type="button" class="aba-etapa" data-etapa-conv="${id}" aria-pressed="${filtroConv.etapa === id}">${cor ? `<span class="ponto-etapa" style="background:${cor}" aria-hidden="true"></span>` : ""}${escapar(nome)} <b>${numero(n)}</b></button>`;
  return `<div class="abas-etapa" role="group" aria-label="Conversas por etapa do funil">${aba("", "Todas as etapas", totalEtapasConv)}${ETAPAS.map((e) => aba(e.id, e.nome, porEtapaConv[e.id], e.cor)).join("")}</div>`;
}
function ligarAbasEtapa() {
  document.querySelectorAll("[data-etapa-conv]").forEach((b) => b.onclick = () => {
    if (filtroConv.etapa === b.dataset.etapaConv) return;
    filtroConv.etapa = b.dataset.etapaConv;
    render();
    buscarListaConversas();
  });
}
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
  if(listaConversaIds&&chaveListaConv===chaveFiltroConv())return listaConversaIds.map(id=>conversas.find(c=>c.id===id)).filter(Boolean);
  const termo = filtroConv.busca.trim().toLowerCase();
  return conversas.filter((c) => {
    const l = leadDaConversa(c);
    if (filtroConv.estado === "minhas" && l?.responsavel_id !== usuario?.id) return false;
    if (filtroConv.estado === "nao_lidas" && !c.nao_lidas) return false;
    if (filtroConv.estado === "sem_resposta" && !semResposta(c)) return false;
    if (filtroConv.canal && c.canal !== filtroConv.canal) return false;
    if (filtroConv.etapa && l?.etapa !== filtroConv.etapa) return false;
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
      ${equipe.map((m) => `<option value="${m.user_id}"${filtroConv.responsavel === m.user_id ? " selected" : ""}>${escapar(m.user_id === usuario.id ? "Minhas conversas" : (m.nome||m.email))}</option>`).join("")}
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
      <div class="busca-conv">${ICONE_BUSCA}<input type="search" id="busca-conv" aria-label="Buscar conversas" placeholder="Pesquisar nome, número ou mensagem" value="${escapar(filtroConv.busca)}" autocomplete="off"></div>
      <div class="chips">${chips}</div>
      ${numeros||responsaveis?`<details class="filtros-inbox"${filtroConv.responsavel||filtroConv.canal?' open':''}><summary>Responsável e canal${filtroConv.responsavel||filtroConv.canal?' · filtrado':''}</summary><div>${responsaveis}${numeros}</div></details>`:''}
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
      <button class="conv-item${c.id === conversaAberta ? " ativa" : ""}${c.nao_lidas ? " tem-nao-lidas" : ""}" type="button" data-abrir-conversa="${c.id}">
        <span class="conv-ava" style="${estiloAvatar(nome)}" aria-hidden="true">${escapar(iniciais(l?.nome || nome))}</span>
        <span class="conv-corpo">
          <span class="conv-topo"><span class="conv-nome">${escapar(nome)}</span><span class="conv-hora">${horaCurta(c.ultima_mensagem_em)}</span></span>
          <span class="conv-previa"><span>${escapar(c.ultima_previa || "Conversa aberta pelo CRM")}</span>${c.nao_lidas ? `<span class="badge" aria-label="${c.nao_lidas} não lidas">${c.nao_lidas}</span>` : ""}</span>
          <span class="conv-pe">${l ? tagEtapa(l.etapa) : ""}${pinoLembrete(l)}${semResposta(c) ? '<span class="pino">sem resposta</span>' : ""}${doisNumeros() ? `<span class="pino numero">${escapar(NOME_CANAL_WA[c.canal] || c.canal)}</span>` : ""}${dono && pode.editarTodos() ? `<span class="conv-dono">${escapar(dono.split("@")[0])}</span>` : ""}</span>
        </span>
      </button>`;
  }).join("") : `<div class="vazio-geral">${filtroConv.etapa && porEtapaConv ? `Nenhuma conversa em ${escapar(NOME_ETAPA[filtroConv.etapa] || filtroConv.etapa)} com esse filtro.` : "Nada com esse filtro."}</div>`;

  const l = ativa ? leadDaConversa(ativa) : null;
  const nomeAtivo = l?.nome || telefoneLegivel(l?.telefone) || ativa?.wa_id || "Sem nome";
  const painel = ativa ? `
    <div class="chat-cabeca">
      <button class="icone-btn" type="button" id="voltar-lista" aria-label="Voltar para as conversas">${ICONE_VOLTAR}</button>
      <span class="conv-ava" style="${estiloAvatar(nomeAtivo)}" aria-hidden="true">${escapar(iniciais(l?.nome || nomeAtivo))}</span>
      <div class="chat-cabeca-id">
        <div class="nome-cel">${escapar(l?.nome || "Sem nome")}</div>
        <div class="sub-cel">${escapar(telefoneLegivel(l?.telefone))} ${seloCanal(l ? ultimaOrigem(l) : null)}${doisNumeros() ? " " + seloCanalWa(ativa.canal) : ""}</div>
      </div>
      <div class="chat-acoes">
        ${l ? (pode.editarLead(l) ? seletorEtapa(l) : tagEtapa(l.etapa)) : ""}
        ${botaoLembreteChat(l)}${l ? `<button class="icone-btn" type="button" id="alternar-contexto" aria-label="Detalhes" title="Dados do contato" aria-expanded="${mostrarContexto}">${ICONE_INFO}</button>` : ""}
      </div>
    </div>
    ${htmlChat(ativa)}`
    : `<div class="chat-vazio"><div>${ICONE_CONVERSA_GRANDE}<h2>Seu atendimento, em um só lugar</h2><p>Escolha uma conversa para ver o histórico e responder.</p><span>As mensagens saem pelo WhatsApp da empresa.</span></div></div>`;

  const botaoNova = pode.criarLead()
    ? `<button class="icone-btn" id="btn-nova-conversa" type="button" aria-label="Nova conversa" title="Nova conversa">${ICONE_NOVA_CONVERSA}</button>` : "";
  const semConversas = `<div class="vazio-geral">Nenhuma conversa ainda.${pode.administrar() ? " Ligue o WhatsApp em Ajustes, Integrações." : ""}${pode.criarLead() ? "<br>Para puxar assunto primeiro, use o lápis de Nova conversa." : ""}</div>`;

  return `
    <div class="inbox${ativa ? " com-chat" : ""}${ativa && mostrarContexto ? " com-contexto" : ""}">
      <div class="inbox-lista">
        <div class="lista-cabeca"><h1>Conversas <span class="total-conversas">${totalConversas || conversas.length || ""}</span></h1>${botaoNova}</div>
        ${faixaAvisoApp()}
        ${conversas.length ? barraFiltrosConversas() : ""}
        <div class="inbox-itens">${conversas.length ? lista : semConversas}${conversas.length && totalConversas>(listaConversaIds?.length||0)?'<button class="mini mais-conversas" type="button">Carregar mais conversas</button>':''}</div>
      </div>
      <div class="chat-painel">${painel}</div>
      ${ativa && l && mostrarContexto ? painelContexto(l, ativa) : ''}
    </div>`;
}

function painelContexto(l, c) {
  const nome = l.nome || telefoneLegivel(l.telefone) || "Sem nome";
  return `<section class="contexto-lead" aria-label="Detalhes do contato">
    <div class="contexto-topo"><button class="icone-btn" id="fechar-contexto" type="button" aria-label="Fechar detalhes">${ICONE_FECHAR}</button><h2>Dados do contato</h2></div>
    <div class="contexto-identidade"><span class="conv-ava" style="${estiloAvatar(nome)}" aria-hidden="true">${escapar(iniciais(l.nome || l.telefone))}</span><h3>${escapar(l.nome || 'Sem nome')}</h3><p>${escapar(telefoneLegivel(l.telefone))}</p></div>
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
    limite_conversas: 'Muitas conversas criadas em sequência. Aguarde um minuto.',
    telefone_invalido: "Esse número não parece válido. Escreva com DDD.",
    sem_whatsapp: "O WhatsApp desta empresa ainda não está ligado. Configure em Ajustes, Integrações.",
    lead_de_outro: "Esse número já é lead de outra pessoa da equipe. Peça para ela responder.",
    sem_permissao: "Seu acesso é só de leitura.",
    sem_acesso: "Você não tem acesso a esta empresa.",
    empresa_inativa: "Esta empresa está inativa. Peça à agência para revisar o cadastro.",
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
  (raiz || document).querySelectorAll(".chat-msgs").forEach((el) => {
    const posicao=posicoesChat.get(chaveRascunho(el.closest('[data-chat]')?.dataset.chat));
    el.scrollTop = posicao && !posicao.fim ? posicao.top : el.scrollHeight;
  });
}

// Atualiza só a lista e as mensagens. Composer, foco e controles em edição permanecem no DOM.
function sincronizarInbox() {
  atualizarBarraTopo();
  const estado=capturarEstadoChat();
  const template=document.createElement('template');template.innerHTML=vistaConversas();
  const lista=document.querySelector('.inbox-itens'),novaLista=template.content.querySelector('.inbox-itens');
  if(lista&&novaLista){lista.replaceChildren(...novaLista.childNodes);lista.querySelectorAll('[data-abrir-conversa]').forEach(b=>b.onclick=()=>abrirConversa(b.dataset.abrirConversa));}
  document.querySelector('.mais-conversas')?.addEventListener('click',e=>{e.currentTarget.disabled=true;buscarListaConversas(true);});
  const atual=document.querySelector('.chat-painel [data-chat]'),novo=template.content.querySelector('[data-chat]');
  if(atual&&novo&&atual.dataset.chat===novo.dataset.chat){
    const area=atual.querySelector('.chat-msgs'),novas=novo.querySelector('.chat-msgs');
    const ultimoAntes=area.querySelector('[data-mensagem]:last-child')?.dataset.mensagem;
    const ultimoDepois=novas.querySelector('[data-mensagem]:last-child')?.dataset.mensagem;
    area.replaceChildren(...novas.childNodes);
    if(atual.dataset.janela!==novo.dataset.janela||atual.dataset.responder!==novo.dataset.responder){
      atual.querySelector('.chat-rodape').replaceWith(novo.querySelector('.chat-rodape'));
      atual.dataset.janela=novo.dataset.janela;atual.dataset.responder=novo.dataset.responder;
    }
    const conversa=conversas.find(c=>c.id===atual.dataset.chat);
    if(conversa)ligarChat(atual,conversa,()=>render());
    if(ultimoAntes!==ultimoDepois && estado.find(x=>x.id===atual.dataset.chat)?.fim===false){
      let button=atual.querySelector('.novas-mensagens');
      if(!button){button=document.createElement('button');button.className='mini novas-mensagens';button.textContent='Novas mensagens';button.onclick=()=>{area.scrollTop=area.scrollHeight;button.remove();};atual.querySelector('.chat-rodape').prepend(button);}
    }
    restaurarEstadoChat(estado);
    if(conversa && estado.find(x=>x.id===conversa.id)?.fim) marcarVistaComoLida(conversa);
  }else if(conversaAberta){render();}
}

// Liga envio e rolagem de um chat já desenhado. `aoMudar` redesenha quem hospeda o chat.
function ligarChat(raiz, conversa, aoMudar) {
  rolarChat(raiz);
  ligarRecursosWhatsApp(raiz,conversa,aoMudar);ligarAgendaNoChat(raiz,conversa,aoMudar);
  raiz.querySelectorAll('[data-responder-mensagem]').forEach(button=>button.onclick=()=>{
    const m=mensagensPorConversa[conversa.id]?.find(x=>x.id===button.dataset.responderMensagem);if(!m)return;
    respostasSelecionadas.set(conversa.id,m);aoMudar();document.querySelector(`[data-chat="${conversa.id}"] textarea`)?.focus();
  });
  const cancelarResposta=raiz.querySelector('[data-cancelar-resposta]');
  if(cancelarResposta)cancelarResposta.onclick=()=>{respostasSelecionadas.delete(conversa.id);aoMudar();};
  raiz.querySelectorAll('[data-recuperar-texto]').forEach(button=>button.addEventListener('click',()=>{
    const message=mensagensPorConversa[conversa.id]?.find(m=>m.id===button.dataset.recuperarTexto);
    const input=raiz.querySelector('textarea');
    if(message&&input){input.value=message.texto||'';salvarRascunho(conversa.id,input.value);input.focus();}
  }));
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
  if (form.dataset.ligado) return;
  form.dataset.ligado='true';
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
    const responderId=respostasSelecionadas.get(conversa.id)?.id||null;
    let tentativa = tentativasEnvio.get(chaveEnvio);
    if(!tentativa)try{tentativa=JSON.parse(sessionStorage.getItem(chaveEnvio+':tentativa')||'null');}catch{}
    if (!tentativa || tentativa.texto !== texto || (tentativa.responder_id||null)!==responderId) {
      tentativa = {id:crypto.randomUUID(),texto,responder_id:responderId};
      tentativasEnvio.set(chaveEnvio,tentativa);
      try{sessionStorage.setItem(chaveEnvio+':tentativa',JSON.stringify(tentativa));}catch{}
    }
    enviosPendentes.add(conversa.id);
    campo.readOnly = true;
    const botao = form.querySelector("button");
    botao.disabled = true;
    aviso.className = "aviso";
    aviso.textContent = "Enviando...";
    if(!(mensagensPorConversa[conversa.id]||[]).some(m=>m.id===tentativa.id)){
      (mensagensPorConversa[conversa.id] ||= []).push({id:tentativa.id,empresa_id:empresaEnvio,conversa_id:conversa.id,direcao:'saida',tipo:'texto',texto,status:'enviando',autor_id:usuario.id,criado_em:new Date().toISOString(),local:true});
      if(vistaAtual==='conversas')sincronizarInbox();
      const area=document.querySelector(`[data-chat="${conversa.id}"] .chat-msgs`);if(area)area.scrollTop=area.scrollHeight;
    }
    try {
      const { data: sessao } = await sb.auth.getSession();
      if (!sessao.session) throw new Error("Sua sessão expirou. Entre novamente.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.session.access_token}` },
        body: JSON.stringify({ conversa_id: conversa.id, texto, mensagem_id:tentativa.id, responder_id:responderId }),
      });
      const dados = await res.json().catch(() => ({}));
      if (res.ok) {
        tentativasEnvio.delete(chaveEnvio);
        respostasSelecionadas.delete(conversa.id);
        try{sessionStorage.removeItem(chaveEnvio+':tentativa');}catch{}
        campo.value = "";
        try { sessionStorage.removeItem(chaveEnvio); } catch {}
      }
      if (empresaAtual?.id !== empresaEnvio) return;
      await carregarMensagens(conversa.id);
      const { data: atual } = await sb.from("conversas").select("*").eq("id", conversa.id).single();
      if (atual) Object.assign(conversa, atual);
      enviosPendentes.delete(conversa.id);
      if (!res.ok) {
        mensagensPorConversa[conversa.id]=(mensagensPorConversa[conversa.id]||[]).filter(m=>m.id!==tentativa.id||!m.local);
        if (res.status === 422 || mensagensPorConversa[conversa.id]?.find(m=>m.id===tentativa.id)?.status === 'falhou') {
          tentativasEnvio.delete(chaveEnvio);try{sessionStorage.removeItem(chaveEnvio+':tentativa');}catch{}
        }
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

async function marcarVistaComoLida(c) {
  if (!c?.nao_lidas || document.hidden || !document.hasFocus() || errosMensagens.has(c.id)) return;
  const msgs=mensagensPorConversa[c.id] || [],ultima=msgs.at(-1);
  if(!ultima)return;
  const {error}=await sb.rpc('marcar_conversa_lida_ate',{p_conversa:c.id,p_mensagem:ultima.id});
  if(error)return;
  if(totalNaoLidas!==null)totalNaoLidas=Math.max(0,totalNaoLidas-c.nao_lidas);
  c.nao_lidas=0;atualizarContadorConversas();fecharNotificacoesDoLead(c.lead_id);
  const entrada=msgs.findLast(m=>m.direcao==='entrada' && m.wa_message_id);
  if(c.canal==='whatsapp_oficial' && entrada)recursoWhatsApp('whatsapp-lida',{conversa_id:c.id,mensagem_id:entrada.id}).catch(()=>{});
}

async function abrirConversa(id) {
  conversaAberta = id;
  const c = conversas.find((x) => x.id === id);
  fecharNotificacoesDoLead(c?.lead_id);
  render();
  await garantirMensagens(id);
  if(vistaAtual==='conversas'&&conversaAberta===id)await marcarVistaComoLida(c);
  if (vistaAtual === "conversas" && conversaAberta === id) render();
}

function ligarConversas() {
  document.querySelector('.mais-conversas')?.addEventListener('click',e=>{e.currentTarget.disabled=true;buscarListaConversas(true);});
  document.getElementById("alternar-contexto")?.addEventListener("click", () => { mostrarContexto = !mostrarContexto; render(); });
  document.getElementById("fechar-contexto")?.addEventListener("click", () => { mostrarContexto = false; render(); });document.getElementById("novo-lembrete")?.addEventListener("click", () => { const c = conversas.find((x) => x.id === conversaAberta), l = c && leadDaConversa(c); if (l) abrirLembrete(l, { aoSalvar: () => render() }); });
  document.querySelectorAll("[data-abrir-conversa]").forEach((b) => b.addEventListener("click", () => abrirConversa(b.dataset.abrirConversa)));
  const nova = document.getElementById("btn-nova-conversa");
  if (nova) nova.addEventListener("click", formularioNovaConversa);
  document.querySelectorAll("[data-filtro-conv]").forEach((b) => b.addEventListener("click", () => {
    filtroConv.estado = b.dataset.filtroConv;
    render();
    buscarListaConversas();
  }));
  const selResp = document.getElementById("filtro-conv-resp");
  if (selResp) selResp.addEventListener("change", () => { filtroConv.responsavel = selResp.value; render(); buscarListaConversas(); });
  const selCanal = document.getElementById("filtro-conv-canal");
  if (selCanal) selCanal.addEventListener("change", () => { filtroConv.canal = selCanal.value; render(); buscarListaConversas(); });
  const buscaConv = document.getElementById("busca-conv");
  if (buscaConv) buscaConv.addEventListener("input", (e) => {
    filtroConv.busca = e.target.value;
    const posicao = e.target.selectionStart;
    render();
    const novo = document.getElementById("busca-conv");
    if (novo) { novo.focus(); if (posicao !== null) novo.setSelectionRange(posicao, posicao); }
    clearTimeout(timerBuscaConv);timerBuscaConv=setTimeout(()=>buscarListaConversas(),250);
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
