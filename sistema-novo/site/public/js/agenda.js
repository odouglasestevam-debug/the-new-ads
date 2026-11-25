/* ---------------- agenda: mensagem agendada e lembrete (migration 0033) ----------------
   Mensagem agendada: escrita agora, sai pelo WhatsApp da empresa no horário marcado.
   Lembrete: na hora marcada o vendedor recebe a notificação e o lead aparece em "Passou do horário".
   Enquanto o banco não tiver a 0033, tudo aqui fica escondido (agendaDisponivel === false). */

let agendaDisponivel = null; // null: ainda carregando; false: banco sem a 0033
let lembretes = [];          // pendentes e avisados que a pessoa pode ver
let agendadas = [];          // na fila (agendada, enviando) e as que não saíram nos últimos 3 dias
let carregandoAgenda = null;
const filtroAgenda = { escopo: "minha", pessoa: "", tipo: "tudo" };

// ICONE_SINO vem do push.js (mesmo sino da faixa de notificações)
const ICONE_RELOGIO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.1 2"/></svg>';

const ERROS_AGENDA = {
  sem_permissao: "Você não pode mexer na agenda deste lead.",
  texto_invalido: "Escreva a mensagem (até 4.096 caracteres).",
  nota_invalida: "Escreva o que fazer (até 500 caracteres).",
  horario_invalido: "Escolha um horário a partir de agora (mensagem até 6 meses, lembrete até 1 ano).",
  limite_agendamentos: "Esta conversa já tem 20 mensagens agendadas. Cancele alguma antes.",
  limite_lembretes: "Você chegou ao limite de lembretes pendentes. Conclua alguns antes.",
  destino_invalido: "Essa pessoa não atende este lead.",
  nao_agendada: "Essa mensagem já saiu ou foi cancelada.",
  lembrete_encerrado: "Esse lembrete já foi concluído ou excluído.",
  nao_encontrado: "Não encontrei esse item. Atualize a página.",
  PT429: "Muitas ações seguidas. Aguarde um minuto.",
};
function erroAgenda(error) {
  const k = Object.keys(ERROS_AGENDA).find((k) => (error?.message || "").includes(k) || error?.code === k);
  return k ? ERROS_AGENDA[k] : "Não deu certo: " + (error?.message || "tente de novo.");
}

/* ---------------- datas ---------------- */
const doisDigitos = (n) => String(n).padStart(2, "0");
const dataInput = (d) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
const horaInput = (d) => `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`;
function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function diasAte(d) { return Math.round((inicioDoDia(d) - inicioDoDia(new Date())) / 86400e3); }
function rotuloQuando(iso) {
  const d = new Date(iso), diff = diasAte(d);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `hoje às ${hora}`;
  if (diff === 1) return `amanhã às ${hora}`;
  if (diff === -1) return `ontem às ${hora}`;
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  return `${semana}, ${data} às ${hora}`;
}
function emDias(dias, hora, minuto = 0) { const d = new Date(); d.setDate(d.getDate() + dias); d.setHours(hora, minuto, 0, 0); return d; }
function atalhosHorario() {
  const agora = new Date();
  const umaHora = new Date(agora.getTime() + 3600e3); umaHora.setSeconds(0, 0);
  umaHora.setMinutes(Math.ceil(umaHora.getMinutes() / 5) * 5);
  const lista = [["Daqui a 1 hora", umaHora]];
  if (agora.getHours() < 17) lista.push(["Hoje às 18:00", emDias(0, 18)]);
  lista.push(["Amanhã às 09:00", emDias(1, 9)], ["Amanhã às 14:00", emDias(1, 14)]);
  const ateSegunda = (8 - agora.getDay()) % 7 || 7;
  if (ateSegunda > 1) lista.push(["Segunda às 09:00", emDias(ateSegunda, 9)]);
  return lista;
}

/* ---------------- dados ---------------- */
function tabelaAusente(erro) {
  return !!erro && (erro.code === "PGRST205" || erro.code === "42P01" || /does not exist|could not find the table/i.test(erro.message || ""));
}
async function carregarAgenda() {
  if (!empresaAtual) return;
  if (carregandoAgenda) return carregandoAgenda;
  const empresaId = empresaAtual.id;
  carregandoAgenda = (async () => {
    const desde = new Date(Date.now() - 3 * 86400e3).toISOString();
    const [rl, ra, rf] = await Promise.all([
      sb.from("lembretes").select("*").eq("empresa_id", empresaId).in("status", ["pendente", "avisado"]).order("quando", { ascending: true }).limit(1000),
      sb.from("mensagens_agendadas").select("*").eq("empresa_id", empresaId).in("status", ["agendada", "enviando"]).order("enviar_em", { ascending: true }).limit(1000),
      sb.from("mensagens_agendadas").select("*").eq("empresa_id", empresaId).eq("status", "falhou").gte("atualizado_em", desde).order("atualizado_em", { ascending: false }).limit(100),
    ]);
    if (empresaAtual?.id !== empresaId) return;
    if (rl.error || ra.error || rf.error) {
      // tabela que não existe: banco ainda sem a 0033. Outro erro é passageiro: mantém o que tinha.
      if ([rl, ra, rf].some((r) => tabelaAusente(r.error))) { agendaDisponivel = false; lembretes = []; agendadas = []; }
      atualizarNavAgenda();
      return;
    }
    agendaDisponivel = true;
    lembretes = rl.data || [];
    agendadas = [...(ra.data || []), ...(rf.data || [])];
    atualizarNavAgenda();
  })().finally(() => { carregandoAgenda = null; });
  return carregandoAgenda;
}
const assinaturaAgenda = () => JSON.stringify([agendaDisponivel, lembretes.map((x) => [x.id, x.status, x.quando, x.user_id]), agendadas.map((x) => [x.id, x.status, x.enviar_em, x.texto])]);

// Atualiza a cada minuto e quando a pessoa volta para o app. Só redesenha se algo mudou.
async function atualizarAgenda() {
  if (!empresaAtual || document.hidden || !usuario) return;
  const antes = assinaturaAgenda();
  await carregarAgenda();
  if (assinaturaAgenda() !== antes) redesenharAgenda();
}
function redesenharAgenda() {
  if (vistaAtual === "agenda") render();
  else if (vistaAtual === "conversas") sincronizarInbox();
  document.dispatchEvent(new CustomEvent("conversas-atualizadas"));
}
setInterval(() => atualizarAgenda().catch(() => {}), 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizarAgenda().catch(() => {}); });

// Contador do menu: lembretes meus que vencem até o fim do dia.
function lembretesDoDia() {
  const fim = inicioDoDia(new Date()); fim.setDate(fim.getDate() + 1);
  return lembretes.filter((x) => x.user_id === usuario?.id && new Date(x.quando) < fim);
}
function atualizarNavAgenda() {
  const botao = document.querySelector('#nav [data-vista="agenda"]');
  if (botao) botao.hidden = agendaDisponivel !== true;
  const contador = document.getElementById("cont-agenda");
  if (contador) contador.textContent = agendaDisponivel ? (lembretesDoDia().length || "") : "";
  if (agendaDisponivel === false && vistaAtual === "agenda") { vistaAtual = "conversas"; render(); }
}

/* ---------------- sinais nas outras telas ---------------- */
function proximoLembrete(leadId, soMeus = false) {
  return lembretes.filter((x) => x.lead_id === leadId && (!soMeus || x.user_id === usuario?.id))
    .sort((a, b) => a.quando.localeCompare(b.quando))[0] || null;
}
// Na lista de conversas: lembrete meu que vence hoje ou já passou.
function pinoLembrete(l) {
  if (!agendaDisponivel || !l) return "";
  const x = proximoLembrete(l.id, true);
  if (!x || diasAte(new Date(x.quando)) > 0) return "";
  const passou = new Date(x.quando) <= new Date();
  return `<span class="pino lembrete${passou ? " passou" : ""}" title="${escapar(x.nota)}">${ICONE_SINO}${passou ? "retomar agora" : "lembrete " + new Date(x.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>`;
}
// No cartão do kanban: o próximo lembrete do lead.
function sinalLembrete(l) {
  if (!agendaDisponivel) return "";
  const x = proximoLembrete(l.id);
  if (!x) return "";
  const passou = new Date(x.quando) <= new Date();
  return `<span class="sinal lembrete${passou ? " passou" : ""}" title="Lembrete ${escapar(rotuloQuando(x.quando))}: ${escapar(x.nota)}">${ICONE_SINO}${escapar(diasAte(new Date(x.quando)) === 0 ? new Date(x.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : new Date(x.quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }))}</span>`;
}

/* ---------------- no chat ---------------- */
function botaoAgendarComposer() {
  return agendaDisponivel ? `<button class="btn-agendar" type="button" data-agendar aria-label="Agendar envio" title="Agendar envio">${ICONE_RELOGIO}</button>` : "";
}
function botaoLembreteChat(l) {
  if (!agendaDisponivel || !l || !pode.editarLead(l)) return "";
  const x = proximoLembrete(l.id);
  return `<button class="icone-btn${x ? " com-lembrete" : ""}" type="button" id="novo-lembrete" aria-label="Criar lembrete" title="${x ? escapar("Próximo lembrete " + rotuloQuando(x.quando)) : "Criar lembrete"}">${ICONE_SINO}</button>`;
}
// Mensagens agendadas no fim do chat, como balões pontilhados. Sem espaço entre as tags (pre-wrap).
function bolhasAgendadas(c) {
  if (!agendaDisponivel) return "";
  const jaNoHistorico = new Set((mensagensPorConversa[c.id] || []).map((m) => m.id));
  const lista = agendadas.filter((a) => a.conversa_id === c.id && !jaNoHistorico.has(a.id))
    .sort((a, b) => a.enviar_em.localeCompare(b.enviar_em));
  if (!lista.length) return "";
  const l = leadDaConversa(c);
  const mexe = l && pode.editarLead(l);
  return '<div class="dia-chat">Agendadas</div>' + lista.map((a) => {
    const falhou = a.status === "falhou";
    const selo = falhou ? "Não saiu" : a.status === "enviando" ? "Saindo agora" : "Sai " + rotuloQuando(a.enviar_em);
    const acoes = falhou
      ? (mexe ? `<button class="mini" type="button" data-agendada-refazer="${escapar(a.id)}">Agendar de novo</button>` : "")
      : a.status === "agendada" && (mexe || a.autor_id === usuario.id)
        ? (mexe ? `<button class="mini" type="button" data-agendada-editar="${escapar(a.id)}">Editar</button>` : "") + `<button class="mini" type="button" data-agendada-cancelar="${escapar(a.id)}">Cancelar envio</button>`
        : "";
    const autor = nomeResponsavel(a.autor_id).split("@")[0];
    return `<div class="bolha saida agendada${falhou ? " falhou" : ""}" data-agendada="${escapar(a.id)}">` +
      `<span class="selo-agendada">${ICONE_RELOGIO}${escapar(selo)}</span>` +
      `<span class="bolha-texto">${escapar(a.texto)}</span>` +
      (a.erro && falhou ? `<div class="bolha-erro">${escapar(a.erro)}</div>` : "") +
      (a.cancelar_se_responder && a.status === "agendada" ? '<div class="sub-agendada">Não sai se o lead responder antes</div>' : "") +
      (acoes ? `<div class="acoes-agendada">${acoes}</div>` : "") +
      (autor ? `<div class="bolha-meta"><span>${escapar(autor)}</span></div>` : "") +
      "</div>";
  }).join("");
}
function ligarAgendaNoChat(raiz, conversa, aoMudar) {
  raiz.querySelectorAll("[data-agendar]").forEach((b) => b.onclick = () => {
    const campo = raiz.querySelector(`[data-chat-form="${conversa.id}"] textarea`);
    abrirAgendarMensagem(conversa, { texto: campo?.value || "", doRascunho: true, aoSalvar: aoMudar });
  });
  raiz.querySelectorAll("[data-agendada-cancelar]").forEach((b) => b.onclick = () => cancelarAgendada(b.dataset.agendadaCancelar, aoMudar));
  raiz.querySelectorAll("[data-agendada-editar]").forEach((b) => b.onclick = () => {
    const a = agendadas.find((x) => x.id === b.dataset.agendadaEditar);
    if (a) abrirAgendarMensagem(conversa, { existente: a, aoSalvar: aoMudar });
  });
  raiz.querySelectorAll("[data-agendada-refazer]").forEach((b) => b.onclick = () => {
    const a = agendadas.find((x) => x.id === b.dataset.agendadaRefazer);
    if (a) abrirAgendarMensagem(conversa, { texto: a.texto, aoSalvar: aoMudar });
  });
}
async function cancelarAgendada(id, aoMudar) {
  if (!confirm("Cancelar o envio desta mensagem?")) return;
  const { error } = await sb.rpc("crm_cancelar_mensagem_agendada", { p_id: id });
  if (error) { alert(erroAgenda(error)); return; }
  agendadas = agendadas.filter((x) => x.id !== id);
  avisoAgenda("Envio cancelado.");
  aoMudar?.();
  carregarAgenda().then(() => { atualizarNavAgenda(); if (vistaAtual === "agenda") render(); });
}
function avisoAgenda(texto) {
  document.querySelectorAll(".recado-flutuante").forEach((el) => el.remove());
  const el = document.createElement("div");
  el.className = "recado-flutuante";
  el.setAttribute("role", "status");
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ---------------- escolha de horário (compartilhada pelos dois formulários) ---------------- */
function campoHorario(prefixo, valor) {
  const d = valor ? new Date(valor) : null;
  return `<fieldset class="horario"><legend>Quando</legend>
    <div class="atalhos-horario">${atalhosHorario().map(([rotulo, data]) => `<button type="button" class="chip" data-atalho="${data.toISOString()}" aria-pressed="false">${rotulo}</button>`).join("")}</div>
    <div class="horario-campos">
      <label class="campo"><span>Dia</span><input type="date" id="${prefixo}-data" value="${d ? dataInput(d) : ""}" min="${dataInput(new Date())}"></label>
      <label class="campo"><span>Hora</span><input type="time" id="${prefixo}-hora" value="${d ? horaInput(d) : ""}" step="300"></label>
    </div>
    <p class="resumo-horario" id="${prefixo}-resumo" aria-live="polite"></p>
  </fieldset>`;
}
function lerHorario(raiz, prefixo) {
  const data = raiz.querySelector(`#${prefixo}-data`)?.value, hora = raiz.querySelector(`#${prefixo}-hora`)?.value;
  if (!data || !hora) return null;
  const d = new Date(`${data}T${hora}`);
  return isNaN(d) ? null : d;
}
function ligarHorario(raiz, prefixo, aoMudar) {
  const atualizar = () => {
    const d = lerHorario(raiz, prefixo);
    raiz.querySelectorAll("[data-atalho]").forEach((b) => b.setAttribute("aria-pressed", String(!!d && new Date(b.dataset.atalho).getTime() === d.getTime())));
    const resumo = raiz.querySelector(`#${prefixo}-resumo`);
    resumo.className = "resumo-horario" + (d && d < new Date(Date.now() - 60000) ? " erro" : "");
    resumo.textContent = !d ? "Escolha o dia e a hora." : d < new Date(Date.now() - 60000) ? "Esse horário já passou." : "Marcado para " + rotuloQuando(d.toISOString()) + ".";
    aoMudar?.(d);
  };
  raiz.querySelectorAll("[data-atalho]").forEach((b) => b.onclick = () => {
    const d = new Date(b.dataset.atalho);
    raiz.querySelector(`#${prefixo}-data`).value = dataInput(d);
    raiz.querySelector(`#${prefixo}-hora`).value = horaInput(d);
    atualizar();
  });
  ["data", "hora"].forEach((k) => raiz.querySelector(`#${prefixo}-${k}`).addEventListener("input", atualizar));
  atualizar();
}
function abrirModalAgenda(html) {
  const div = document.createElement("div");
  div.className = "fundo-modal fundo-centro";
  div.innerHTML = `<div class="caixa-modal caixa-agenda">${html}</div>`;
  document.body.appendChild(div);
  const fechar = () => { div.remove(); document.removeEventListener("keydown", aoTeclar); };
  function aoTeclar(e) { if (e.key === "Escape") fechar(); }
  document.addEventListener("keydown", aoTeclar);
  div.addEventListener("click", (e) => { if (e.target === div) fechar(); });
  div.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", fechar));
  return { div, fechar };
}
function nomeDoLead(l) { return l?.nome || telefoneLegivel(l?.telefone) || "Lead sem nome"; }

/* ---------------- agendar mensagem ---------------- */
function abrirAgendarMensagem(conversa, { texto = "", existente = null, doRascunho = false, aoSalvar } = {}) {
  const l = leadDaConversa(conversa);
  const oficial = conversa.canal === "whatsapp_oficial";
  const fimJanela = oficial && conversa.ultima_entrada_em ? new Date(new Date(conversa.ultima_entrada_em).getTime() + JANELA_WHATS_MS) : null;
  const inicial = existente?.enviar_em || emDias(1, 9).toISOString();
  const { div, fechar } = abrirModalAgenda(`
    <h2>${existente ? "Editar mensagem agendada" : "Agendar mensagem"}</h2>
    <p class="ajuda">Para ${escapar(nomeDoLead(l))}. Sai pelo WhatsApp da empresa no horário marcado, com o seu nome.</p>
    <div class="campo"><label for="ag-texto">Mensagem</label><textarea id="ag-texto" rows="4" maxlength="4096" placeholder="Escreva a mensagem">${escapar(existente?.texto ?? texto)}</textarea></div>
    ${campoHorario("ag", inicial)}
    <label class="opcao-check"><input type="checkbox" id="ag-se-responder"${existente?.cancelar_se_responder ? " checked" : ""}><span>Não enviar se o lead responder antes</span></label>
    <div class="aviso-janela" id="ag-janela" hidden></div>
    <div class="aviso" id="ag-aviso" role="status"></div>
    <div class="acoes-modal"><button class="btn btn-fantasma" type="button" data-fechar>Voltar</button><button class="btn" type="button" id="ag-salvar">${existente ? "Salvar" : "Agendar"}</button></div>`);
  const janela = div.querySelector("#ag-janela");
  // API oficial: depois de 24h da última mensagem do lead a Meta só aceita modelo aprovado.
  ligarHorario(div, "ag", (d) => {
    const fora = oficial && d && (!fimJanela || d > fimJanela);
    janela.hidden = !fora;
    if (fora) {
      janela.innerHTML = `<p>${fimJanela ? `A janela de 24 horas desta conversa fecha ${escapar(rotuloQuando(fimJanela.toISOString()))}.` : "O lead ainda não escreveu nesta conversa."} Depois disso a Meta só aceita modelo aprovado e esta mensagem não sai, a não ser que o lead escreva antes.</p><button class="mini" type="button" id="ag-virar-lembrete">Criar um lembrete nesse horário</button>`;
      janela.querySelector("#ag-virar-lembrete").onclick = () => {
        const nota = "Retomar a conversa" + (div.querySelector("#ag-texto").value.trim() ? ": " + div.querySelector("#ag-texto").value.trim().slice(0, 300) : "");
        fechar();
        if (l) abrirLembrete(l, { quando: d.toISOString(), nota, aoSalvar });
      };
    }
  });
  const campo = div.querySelector("#ag-texto");
  if (!campo.value) campo.focus();
  div.querySelector("#ag-salvar").addEventListener("click", async (e) => {
    const aviso = div.querySelector("#ag-aviso"), quando = lerHorario(div, "ag"), textoFinal = campo.value.trim();
    if (!textoFinal) { aviso.className = "aviso erro"; aviso.textContent = "Escreva a mensagem."; campo.focus(); return; }
    if (!quando) { aviso.className = "aviso erro"; aviso.textContent = "Escolha o dia e a hora."; return; }
    const botao = e.currentTarget; botao.disabled = true;
    aviso.className = "aviso"; aviso.textContent = "Agendando...";
    const args = { p_texto: textoFinal, p_enviar_em: quando.toISOString(), p_cancelar_se_responder: div.querySelector("#ag-se-responder").checked };
    const { data, error } = existente
      ? await sb.rpc("crm_reagendar_mensagem", { p_id: existente.id, ...args })
      : await sb.rpc("crm_agendar_mensagem", { p_conversa: conversa.id, ...args });
    if (error) { botao.disabled = false; aviso.className = "aviso erro"; aviso.textContent = erroAgenda(error); return; }
    const salva = Array.isArray(data) ? data[0] : data;
    if (salva) agendadas = [...agendadas.filter((x) => x.id !== salva.id), salva];
    if (doRascunho) {
      salvarRascunho(conversa.id, "");
      const composer = document.querySelector(`[data-chat-form="${conversa.id}"] textarea`);
      if (composer) composer.value = "";
    }
    fechar();
    avisoAgenda(`Mensagem agendada para ${rotuloQuando(quando.toISOString())}.`);
    aoSalvar?.();
    carregarAgenda().then(atualizarNavAgenda);
  });
}

/* ---------------- lembrete ---------------- */
function avisoPushDesligado() {
  if (typeof pushEstado === "undefined" || pushEstado.suporte === false || pushEstado.inscrito) return "";
  return `<p class="ajuda-push">As notificações estão desligadas neste aparelho. <button class="link" type="button" data-ir-notificacoes>Ativar notificações</button> para o lembrete tocar no celular.</p>`;
}
function abrirLembrete(l, { existente = null, quando = null, nota = "", aoSalvar } = {}) {
  const outros = pode.editarTodos() && !existente
    ? [...new Map([[usuario.id, "Eu"],
        ...(l.responsavel_id && l.responsavel_id !== usuario.id ? [[l.responsavel_id, nomeResponsavel(l.responsavel_id) + " (atende o lead)"]] : []),
        ...equipe.filter((m) => ["dono", "gestor"].includes(m.papel) && m.user_id !== usuario.id).map((m) => [m.user_id, m.nome || m.email])]).entries()]
    : [];
  const inicial = existente ? (new Date(existente.quando) > new Date() ? existente.quando : emDias(1, 9).toISOString()) : (quando || emDias(1, 9).toISOString());
  const { div, fechar } = abrirModalAgenda(`
    <h2>${existente ? "Adiar lembrete" : "Novo lembrete"}</h2>
    <p class="ajuda">${escapar(nomeDoLead(l))}. Na hora marcada chega a notificação; tocar nela abre a conversa.</p>
    <div class="campo"><label for="lb-nota">O que fazer</label><textarea id="lb-nota" rows="3" maxlength="500" placeholder="Ex.: ligar para apresentar a proposta">${escapar(existente?.nota || nota)}</textarea></div>
    ${campoHorario("lb", inicial)}
    ${outros.length > 1 ? `<div class="campo"><label for="lb-para">Lembrar quem</label><select id="lb-para">${outros.map(([id, nome]) => `<option value="${escapar(id)}">${escapar(nome)}</option>`).join("")}</select></div>` : ""}
    ${avisoPushDesligado()}
    <div class="aviso" id="lb-aviso" role="status"></div>
    <div class="acoes-modal"><button class="btn btn-fantasma" type="button" data-fechar>Voltar</button><button class="btn" type="button" id="lb-salvar">${existente ? "Salvar" : "Criar lembrete"}</button></div>`);
  ligarHorario(div, "lb");
  const campo = div.querySelector("#lb-nota");
  if (!campo.value) campo.focus();
  div.querySelector("[data-ir-notificacoes]")?.addEventListener("click", () => { fechar(); document.querySelector(".fundo-modal")?.remove(); vistaAtual = "config"; abaAjustes = "notificacoes"; render(); });
  div.querySelector("#lb-salvar").addEventListener("click", async (e) => {
    const aviso = div.querySelector("#lb-aviso"), horario = lerHorario(div, "lb"), texto = campo.value.trim();
    if (!texto) { aviso.className = "aviso erro"; aviso.textContent = "Escreva o que fazer."; campo.focus(); return; }
    if (!horario) { aviso.className = "aviso erro"; aviso.textContent = "Escolha o dia e a hora."; return; }
    const botao = e.currentTarget; botao.disabled = true;
    aviso.className = "aviso"; aviso.textContent = "Salvando...";
    const { data, error } = existente
      ? await sb.rpc("crm_atualizar_lembrete", { p_id: existente.id, p_acao: "adiar", p_quando: horario.toISOString(), p_nota: texto })
      : await sb.rpc("crm_criar_lembrete", { p_lead: l.id, p_quando: horario.toISOString(), p_nota: texto, p_para: div.querySelector("#lb-para")?.value || null });
    if (error) { botao.disabled = false; aviso.className = "aviso erro"; aviso.textContent = erroAgenda(error); return; }
    const salvo = Array.isArray(data) ? data[0] : data;
    if (salvo) lembretes = [...lembretes.filter((x) => x.id !== salvo.id), salvo];
    fechar();
    avisoAgenda(`Lembrete marcado para ${rotuloQuando(horario.toISOString())}.`);
    atualizarNavAgenda();
    aoSalvar?.();
    carregarAgenda().then(atualizarNavAgenda);
  });
}
async function mudarLembrete(id, acao) {
  if (acao === "cancelar" && !confirm("Excluir este lembrete?")) return false;
  const { error } = await sb.rpc("crm_atualizar_lembrete", { p_id: id, p_acao: acao });
  if (error) { alert(erroAgenda(error)); return false; }
  lembretes = lembretes.filter((x) => x.id !== id);
  avisoAgenda(acao === "concluir" ? "Lembrete concluído." : "Lembrete excluído.");
  atualizarNavAgenda();
  return true;
}

/* ---------------- itens da agenda (tela Agenda e ficha do lead) ---------------- */
function itensAgenda(leadId = null) {
  const eu = usuario?.id;
  const daPessoa = (quem) => leadId || (filtroAgenda.escopo === "equipe" ? (!filtroAgenda.pessoa || quem === filtroAgenda.pessoa) : quem === eu);
  const itens = [];
  if (filtroAgenda.tipo !== "mensagens" || leadId) {
    for (const x of lembretes) if ((!leadId || x.lead_id === leadId) && daPessoa(x.user_id)) itens.push({ tipo: "lembrete", id: x.id, quando: x.quando, lead_id: x.lead_id, pessoa: x.user_id, dado: x });
  }
  if (filtroAgenda.tipo !== "lembretes" || leadId) {
    for (const x of agendadas) if ((!leadId || x.lead_id === leadId) && daPessoa(x.autor_id)) itens.push({ tipo: "mensagem", id: x.id, quando: x.enviar_em, lead_id: x.lead_id, pessoa: x.autor_id, dado: x });
  }
  return itens.sort((a, b) => a.quando.localeCompare(b.quando));
}
function grupoDoItem(i) {
  if (i.tipo === "mensagem" && i.dado.status === "falhou") return "falhou";
  const d = new Date(i.quando);
  if (i.tipo === "lembrete" && d <= new Date()) return "passou";
  const dias = diasAte(d);
  return dias <= 0 ? "hoje" : dias === 1 ? "amanha" : "dia:" + dataInput(d);
}
function tituloGrupo(g) {
  if (g === "falhou") return "Mensagens que não saíram";
  if (g === "passou") return "Passou do horário";
  if (g === "hoje") return "Hoje";
  if (g === "amanha") return "Amanhã";
  const d = new Date(g.slice(4) + "T12:00");
  const t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function itemAgendaHtml(i, { comLead = true } = {}) {
  const l = leads.find((x) => x.id === i.lead_id);
  const hora = new Date(i.quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const quando = comLead ? hora : rotuloQuando(i.quando);
  const quem = i.pessoa !== usuario.id ? (i.tipo === "lembrete" ? "para " : "por ") + (nomeResponsavel(i.pessoa).split("@")[0] || "outra pessoa") : "";
  const abrir = comLead ? `<button class="mini" type="button" data-agenda-abrir="${escapar(i.lead_id)}" data-agenda-conversa="${escapar(i.dado.conversa_id || "")}">Abrir conversa</button>` : "";
  let acoes = "", texto, rotulo, classe = "";
  if (i.tipo === "lembrete") {
    const passou = new Date(i.quando) <= new Date();
    classe = passou ? " passou" : "";
    rotulo = "Lembrete";
    texto = i.dado.nota;
    acoes = `${abrir}<button class="mini" type="button" data-lembrete-concluir="${escapar(i.id)}">Concluir</button><button class="mini" type="button" data-lembrete-adiar="${escapar(i.id)}">Adiar</button><button class="mini fraco" type="button" data-lembrete-excluir="${escapar(i.id)}">Excluir</button>`;
  } else {
    const falhou = i.dado.status === "falhou";
    classe = falhou ? " falhou" : "";
    rotulo = falhou ? "Mensagem não saiu" : i.dado.status === "enviando" ? "Mensagem saindo agora" : "Mensagem agendada";
    texto = i.dado.texto;
    const mexe = l && pode.editarLead(l);
    acoes = abrir + (falhou
      ? (mexe ? `<button class="mini" type="button" data-agendada-refazer="${escapar(i.id)}">Agendar de novo</button>` : "")
      : i.dado.status === "agendada" ? (mexe ? `<button class="mini" type="button" data-agendada-editar="${escapar(i.id)}">Editar</button>` : "") + (mexe || i.pessoa === usuario.id ? `<button class="mini fraco" type="button" data-agendada-cancelar="${escapar(i.id)}">Cancelar envio</button>` : "") : "");
  }
  return `<article class="item-agenda tipo-${i.tipo}${classe}">
    <span class="ag-icone" aria-hidden="true">${i.tipo === "lembrete" ? ICONE_SINO : ICONE_RELOGIO}</span>
    <div class="ag-corpo">
      <div class="ag-topo"><b class="ag-hora">${escapar(quando)}</b>${comLead ? `<span class="ag-lead">${escapar(nomeDoLead(l))}</span>` : ""}<span class="ag-tipo">${rotulo}${quem ? " · " + escapar(quem) : ""}</span></div>
      <p class="ag-texto">${escapar(texto)}</p>
      ${i.dado.erro && i.dado.status === "falhou" ? `<p class="ag-erro">${escapar(i.dado.erro)}</p>` : ""}
      <div class="ag-acoes">${acoes}</div>
    </div>
  </article>`;
}
function listaAgendaHtml(itens, opcoes) {
  const ordem = ["falhou", "passou", "hoje", "amanha"];
  const grupos = new Map();
  for (const i of itens) { const g = grupoDoItem(i); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(i); }
  const chaves = [...grupos.keys()].sort((a, b) => {
    const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });
  return chaves.map((g) => `<section class="grupo-agenda grupo-${g.startsWith("dia:") ? "dia" : g}"><h2>${escapar(tituloGrupo(g))} <span>${grupos.get(g).length}</span></h2>${grupos.get(g).map((i) => itemAgendaHtml(i, opcoes)).join("")}</section>`).join("");
}
// Botões dos itens; `depois` redesenha quem hospeda a lista.
function ligarItensAgenda(raiz, depois) {
  raiz.querySelectorAll("[data-agenda-abrir]").forEach((b) => b.onclick = () => abrirDaAgenda(b.dataset.agendaAbrir, b.dataset.agendaConversa));
  raiz.querySelectorAll("[data-lembrete-concluir]").forEach((b) => b.onclick = async () => { if (await mudarLembrete(b.dataset.lembreteConcluir, "concluir")) depois(); });
  raiz.querySelectorAll("[data-lembrete-excluir]").forEach((b) => b.onclick = async () => { if (await mudarLembrete(b.dataset.lembreteExcluir, "cancelar")) depois(); });
  raiz.querySelectorAll("[data-lembrete-adiar]").forEach((b) => b.onclick = () => {
    const x = lembretes.find((y) => y.id === b.dataset.lembreteAdiar);
    const l = x && leads.find((y) => y.id === x.lead_id);
    if (x && l) abrirLembrete(l, { existente: x, aoSalvar: depois });
  });
  const conversaDo = (id) => { const a = agendadas.find((x) => x.id === id); return a && (conversas.find((c) => c.id === a.conversa_id) || { id: a.conversa_id, lead_id: a.lead_id, canal: "", ultima_entrada_em: null }); };
  raiz.querySelectorAll("[data-agendada-cancelar]").forEach((b) => b.onclick = () => cancelarAgendada(b.dataset.agendadaCancelar, depois));
  raiz.querySelectorAll("[data-agendada-editar]").forEach((b) => b.onclick = () => {
    const a = agendadas.find((x) => x.id === b.dataset.agendadaEditar);
    if (a) abrirAgendarMensagem(conversaDo(a.id), { existente: a, aoSalvar: depois });
  });
  raiz.querySelectorAll("[data-agendada-refazer]").forEach((b) => b.onclick = () => {
    const a = agendadas.find((x) => x.id === b.dataset.agendadaRefazer);
    if (a) abrirAgendarMensagem(conversaDo(a.id), { texto: a.texto, aoSalvar: depois });
  });
}
const UUID_AGENDA = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function abrirDaAgenda(leadId, conversaId) {
  document.querySelectorAll(".fundo-modal").forEach((el) => el.remove());
  const c = conversas.find((x) => x.id === conversaId) || conversas.find((x) => x.lead_id === leadId);
  if (c) { vistaAtual = "conversas"; mostrarContexto = false; abrirConversa(c.id); return; }
  // conversa fora da página carregada: o mesmo caminho do toque na notificação busca e abre
  if (UUID_AGENDA.test(leadId) && typeof abrirLeadDaUrl === "function") {
    abrirLeadDaUrl(`${location.origin}/?lead=${leadId}${UUID_AGENDA.test(conversaId || "") ? "&conversa=" + conversaId : ""}`);
    return;
  }
  abrirLead(leadId);
}

/* ---------------- tela Agenda ---------------- */
function vistaAgenda() {
  const itens = itensAgenda();
  const doDia = lembretesDoDia().length;
  const equipeChip = pode.editarTodos()
    ? `<button class="chip${filtroAgenda.escopo === "minha" ? " ativo" : ""}" type="button" data-agenda-escopo="minha" aria-pressed="${filtroAgenda.escopo === "minha"}">Minha agenda</button><button class="chip${filtroAgenda.escopo === "equipe" ? " ativo" : ""}" type="button" data-agenda-escopo="equipe" aria-pressed="${filtroAgenda.escopo === "equipe"}">Equipe</button>` : "";
  const pessoa = pode.editarTodos() && filtroAgenda.escopo === "equipe" && equipe.length
    ? `<select class="chip-sel" id="agenda-pessoa" aria-label="Pessoa da equipe"><option value="">Todas as pessoas</option>${equipe.map((m) => `<option value="${escapar(m.user_id)}"${filtroAgenda.pessoa === m.user_id ? " selected" : ""}>${escapar(m.user_id === usuario.id ? "Eu" : (m.nome || m.email))}</option>`).join("")}</select>` : "";
  const tipos = [["tudo", "Tudo"], ["lembretes", "Lembretes"], ["mensagens", "Mensagens"]]
    .map(([id, nome]) => `<button class="chip${filtroAgenda.tipo === id ? " ativo" : ""}" type="button" data-agenda-tipo="${id}" aria-pressed="${filtroAgenda.tipo === id}">${nome}</button>`).join("");
  const vazio = `<div class="vazio-geral agenda-vazia">${ICONE_SINO}<p>${filtroAgenda.escopo === "equipe" ? "Nada marcado para a equipe com esse filtro." : "Nada marcado por enquanto."}</p><span>Crie um lembrete pelo sino no topo da conversa, ou agende uma mensagem pelo relógio ao lado do botão de enviar.</span></div>`;
  return `<div class="topo topo-operacional"><div><h1>Agenda <span class="quantidade-titulo">${itens.length || ""}</span></h1><div class="desc">${doDia ? `${doDia} ${doDia === 1 ? "lembrete seu vence" : "lembretes seus vencem"} hoje.` : "Lembretes de retorno e mensagens agendadas."}</div></div></div>
    <div class="filtros-agenda">${equipeChip ? `<div class="chips" role="group" aria-label="De quem">${equipeChip}</div>` : ""}<div class="chips" role="group" aria-label="Tipo">${tipos}</div>${pessoa}</div>
    <div class="agenda">${itens.length ? listaAgendaHtml(itens) : vazio}</div>`;
}
function ligarAgenda() {
  if (vistaAtual !== "agenda") return;
  document.querySelectorAll("[data-agenda-escopo]").forEach((b) => b.onclick = () => { filtroAgenda.escopo = b.dataset.agendaEscopo; filtroAgenda.pessoa = ""; render(); });
  document.querySelectorAll("[data-agenda-tipo]").forEach((b) => b.onclick = () => { filtroAgenda.tipo = b.dataset.agendaTipo; render(); });
  document.getElementById("agenda-pessoa")?.addEventListener("change", (e) => { filtroAgenda.pessoa = e.target.value; render(); });
  const raiz = document.querySelector(".agenda");
  if (raiz) ligarItensAgenda(raiz, () => render());
}

/* ---------------- aba Agenda da ficha do lead ---------------- */
function contaAgendaLead(l) {
  return agendaDisponivel ? lembretes.filter((x) => x.lead_id === l.id).length + agendadas.filter((x) => x.lead_id === l.id && x.status !== "falhou").length : 0;
}
function abaAgendaLead(l) {
  const itens = itensAgenda(l.id);
  const botao = pode.editarLead(l) ? `<button class="btn btn-largo" type="button" id="lead-novo-lembrete">${ICONE_SINO}Novo lembrete</button>` : "";
  return `${botao}<div class="agenda agenda-lead">${itens.length ? itens.map((i) => itemAgendaHtml(i, { comLead: false })).join("") : '<div class="vazio-bloco">Nenhum lembrete nem mensagem agendada para este lead.</div>'}</div>`;
}
function ligarAbaAgendaLead(raiz, l, redesenhar) {
  raiz.querySelector("#lead-novo-lembrete")?.addEventListener("click", () => abrirLembrete(l, { aoSalvar: redesenhar }));
  const lista = raiz.querySelector(".agenda-lead");
  if (lista) ligarItensAgenda(lista, redesenhar);
}
