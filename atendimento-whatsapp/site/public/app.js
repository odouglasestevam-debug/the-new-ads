"use strict";
// Monitor de atendimento por WhatsApp. Só leitura: a tela chama funções do banco que conferem o acesso.

const SUPABASE_URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const estado = { contas: [], avisos: {}, conta: null, preset: "30", de: null, ate: null, dados: null, aba: "geral", timerAgora: null, pilha: [] };

const guardar = (k, v) => { try { localStorage.setItem("atd:" + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const lerGuardado = (k, padrao) => { try { const v = localStorage.getItem("atd:" + k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };

// ---------- formatação ----------
const fuso = () => estado.conta?.fuso || "America/Sao_Paulo";
function fmtMin(m) {
  if (m === null || m === undefined || Number.isNaN(Number(m))) return "–";
  m = Number(m);
  if (m < 1) return "<1 min";
  if (m < 60) return Math.round(m) + " min";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  if (h < 24) return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}
const pct = (a, b) => (b ? Math.round((100 * (a || 0)) / b) : null);
const fmtPct = (p) => (p === null || p === undefined ? "–" : p + "%");
const n = (v) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("pt-BR"));
function fmtDataHora(iso, comAno = false) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), day: "2-digit", month: "2-digit", ...(comAno ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function fmtHora(iso) { return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
function fmtDia(iso) { return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso)); }
function fmtDataCurta(ymd) { const [y, m, d] = ymd.split("-"); return `${d}/${m}`; }
function haQuanto(iso) {
  if (!iso) return "nunca";
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  return min < 1 ? "agora" : "há " + fmtMin(min);
}
function fmtContato(c, nome) {
  let t;
  if (String(c).startsWith("lid:")) t = "Contato sem número";
  else {
    const d = String(c);
    t = d.length >= 12 && d.startsWith("55") ? `(${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : "+" + d;
  }
  return nome ? `${nome} · ${t}` : t;
}

// ---------- datas do período (no fuso da loja) ----------
const hojeYMD = () => new Intl.DateTimeFormat("en-CA", { timeZone: fuso() }).format(new Date());
function somaDias(ymd, dias) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); }
function periodo(preset) {
  const hoje = hojeYMD();
  const dow = new Date(hoje + "T12:00:00Z").getUTCDay();
  if (preset === "7") return [somaDias(hoje, -6), hoje];
  if (preset === "30") return [somaDias(hoje, -29), hoje];
  if (preset === "semana") return [somaDias(hoje, -((dow + 6) % 7)), hoje];
  if (preset === "mes") return [hoje.slice(0, 8) + "01", hoje];
  if (preset === "mes-passado") {
    const ini = new Date(hoje.slice(0, 8) + "01T12:00:00Z"); ini.setUTCMonth(ini.getUTCMonth() - 1);
    const a = ini.toISOString().slice(0, 10);
    return [a, somaDias(hoje.slice(0, 8) + "01", -1)];
  }
  return [somaDias(hoje, -29), hoje];
}

// ---------- chamadas ----------
async function rpc(nome, args) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) {
    if (/sem_acesso/.test(error.message)) { mostrarSemAcesso(); throw error; }
    toast(traduzErro(error.message));
    throw error;
  }
  return data;
}
function traduzErro(m) {
  if (/horario_invalido/.test(m)) return "Horário inválido: use HH:MM e abertura antes do fechamento.";
  if (/meta_invalida/.test(m)) return "Meta inválida.";
  if (/periodo_invalido/.test(m)) return "Período inválido (máximo de 400 dias).";
  if (/JWT|token/i.test(m)) return "Sessão expirada. Entre de novo.";
  return "Não deu certo: " + m;
}
let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
}

// ---------- acesso ----------
async function precisaCodigo() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  return !error && data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
function mostrarEntrar(msg = "") {
  $("#app").hidden = true; $("#tela-entrar").hidden = false;
  $("#erro-entrar").textContent = msg;
}
function mostrarSemAcesso() {
  mostrarEntrar("Este usuário não tem acesso ao monitor de atendimento.");
  sb.auth.signOut();
}
$("#form-entrar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#btn-entrar"); btn.disabled = true; $("#erro-entrar").textContent = "";
  try {
    const { data: s } = await sb.auth.getSession();
    if (!s.session) {
      const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#senha").value });
      if (error) throw new Error("E-mail ou senha incorretos.");
    }
    if (await precisaCodigo()) {
      const campo = $("#campo-codigo");
      if (campo.hidden) { campo.hidden = false; $("#codigo").focus(); throw new Error("Digite o código do autenticador."); }
      const { data: fatores } = await sb.auth.mfa.listFactors();
      const fator = (fatores?.totp || []).find((f) => f.status === "verified");
      if (!fator) throw new Error("Autenticador não encontrado.");
      const { data: desafio, error: e1 } = await sb.auth.mfa.challenge({ factorId: fator.id });
      if (e1) throw new Error("Não foi possível validar o código.");
      const { error: e2 } = await sb.auth.mfa.verify({ factorId: fator.id, challengeId: desafio.id, code: $("#codigo").value.trim() });
      if (e2) throw new Error("Código incorreto.");
    }
    await iniciar();
  } catch (err) {
    $("#erro-entrar").textContent = err.message;
  } finally { btn.disabled = false; }
});
$("#btn-sair").addEventListener("click", async () => { await sb.auth.signOut(); mostrarEntrar(); });

// ---------- início ----------
async function iniciar() {
  const r = await rpc("atendimento_contas", {});
  estado.contas = r.contas || [];
  estado.avisos = r.avisos || {};
  if (!estado.contas.length) { mostrarEntrar("Nenhuma loja cadastrada."); return; }
  const salva = lerGuardado("conta", null);
  estado.conta = estado.contas.find((c) => c.id === salva) || estado.contas[0];
  const sel = $("#sel-conta");
  sel.innerHTML = estado.contas.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
  sel.value = estado.conta.id; sel.hidden = estado.contas.length < 2;
  estado.preset = lerGuardado("preset", "30");
  [estado.de, estado.ate] = periodo(estado.preset);
  $("#tela-entrar").hidden = true; $("#app").hidden = false;
  desenharTopo();
  irPara(location.hash.slice(1) || "geral");
}
$("#sel-conta").addEventListener("change", (e) => {
  estado.conta = estado.contas.find((c) => c.id === e.target.value);
  guardar("conta", estado.conta.id); desenharTopo(); irPara(estado.aba, true);
});

function statusConexao(c) {
  if (/logged ?out|disconnect|temporaryban|ban/i.test(c.ultimo_evento_tipo || "")) return ["ruim", `Desconectado (${c.ultimo_evento_tipo})`];
  if (!c.ultimo_evento_em) return ["alerta", "Aguardando conexão da NeoGo"];
  const ult = c.ultima_mensagem_em;
  if (!ult) return ["alerta", "Conectado, nenhuma mensagem ainda"];
  const horas = (Date.now() - new Date(ult).getTime()) / 3600000;
  if (horas > 24) return ["alerta", `Sem mensagens ${haQuanto(ult)}`];
  return ["ok", `Recebendo · última ${haQuanto(ult)}`];
}
function desenharTopo() {
  const c = estado.conta;
  $("#nome-conta").textContent = c.nome;
  const [cls, txt] = statusConexao(c);
  const st = $("#status-conexao"); st.className = "status " + cls; st.textContent = txt;
}

// ---------- abas ----------
window.addEventListener("hashchange", () => irPara(location.hash.slice(1)));
function irPara(aba, forcar = false) {
  if (!["geral", "agora", "historico", "config"].includes(aba)) aba = "geral";
  if (estado.aba === aba && !forcar && !$("#aba-" + aba).hidden) return;
  estado.aba = aba;
  $$(".abas a").forEach((a) => a.classList.toggle("ativa", a.dataset.aba === aba));
  $$(".aba").forEach((s) => { s.hidden = s.id !== "aba-" + aba; });
  clearInterval(estado.timerAgora);
  if (aba === "geral") carregarGeral();
  if (aba === "agora") { carregarAgora(); estado.timerAgora = setInterval(carregarAgora, 60000); }
  if (aba === "historico") carregarHistorico();
  if (aba === "config") desenharConfig();
}

// ---------- visão geral ----------
$("#chips-periodo").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  estado.preset = b.dataset.p; guardar("preset", estado.preset);
  [estado.de, estado.ate] = periodo(estado.preset);
  carregarGeral();
});
["#de", "#ate"].forEach((s) => $(s).addEventListener("change", () => {
  const de = $("#de").value, ate = $("#ate").value;
  if (!de || !ate || ate < de) return;
  estado.preset = "livre"; estado.de = de; estado.ate = ate; carregarGeral();
}));

async function carregarGeral() {
  $$("#chips-periodo button").forEach((b) => b.classList.toggle("ativo", b.dataset.p === estado.preset));
  $("#de").value = estado.de; $("#ate").value = estado.ate;
  $("#kpis").innerHTML = `<div class="kpi vazio"><span class="rotulo">Calculando…</span></div>`;
  const d = await rpc("atendimento_painel", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate });
  estado.dados = d;
  desenharGeral(d);
}

const metas = () => ({ primeira_resposta_min: 15, resposta_24h_pct: 95, retorno_pct: 80, convite_pct: 80, dia_marcado_pct: 50, audio_max_pct: 30, ...(estado.conta.metas || {}) });
const situacao = (valor, meta, menorMelhor = false) => (valor === null || valor === undefined || meta === undefined) ? "" :
  (menorMelhor ? (valor <= meta ? "bom" : "ruim") : (valor >= meta ? "bom" : "ruim"));

function kpi({ rotulo, valor, meta, cls, filtro, titulo }) {
  const tag = filtro ? "button" : "div";
  return `<${tag} class="kpi ${cls || ""}" ${filtro ? `type="button" data-filtro="${esc(filtro)}" data-titulo="${esc(titulo || rotulo)}"` : ""}>
    <span class="rotulo">${esc(rotulo)}</span><span class="valor">${valor}</span><span class="meta">${meta || "&nbsp;"}</span></${tag}>`;
}
function linha({ r, v, s = "", cls = "", filtro, titulo, sub }) {
  const tag = filtro ? "button" : "div";
  return `<${tag} class="linha ${sub ? "sub" : ""}" ${filtro ? `type="button" data-filtro="${esc(filtro)}" data-titulo="${esc(titulo || r)}"` : ""}>
    <span class="r">${esc(r)}</span><span class="v ${cls}">${v}</span><span class="s">${s}</span></${tag}>`;
}
function painel(titulo, desc, linhas, nota = "") {
  return `<section class="painel"><header class="painel-topo"><h2>${esc(titulo)}</h2>${desc ? `<p class="suave">${desc}</p>` : ""}</header>
    <div class="linhas">${linhas.join("")}</div>${nota ? `<p class="nota">${nota}</p>` : ""}</section>`;
}

function desenharGeral(d) {
  const m = metas();
  const R = d.resposta || {}, V = d.volume || {}, D = d.durante || {}, L = d.leitura || {}, F = d.formato || {}, T = d.retorno || {}, J = d.loja || {};
  const aviso = $("#aviso-geral");
  const c = estado.conta;
  if (!c.mensagens) {
    aviso.hidden = false;
    aviso.innerHTML = `<strong>Ainda não chegou nenhuma mensagem.</strong> Os números começam a aparecer quando o WhatsApp da loja estiver conectado na NeoGo com o endereço da aba Configuração. A coleta vale daqui pra frente: conversas antigas não entram.`;
  } else if (c.primeira_mensagem_em && c.primeira_mensagem_em.slice(0, 10) > estado.de) {
    aviso.hidden = false;
    aviso.innerHTML = `Coleta desde <strong>${fmtDataHora(c.primeira_mensagem_em, true)}</strong>. Dias anteriores do período ficam sem dado.`;
  } else aviso.hidden = true;

  const respMeta = pct(R.ate_meta, R.atendimentos);
  const resp24 = pct(R.respondidos_24h, R.atendimentos);
  const ret = pct(T.com_retorno, T.cliente_sumiu);
  const conv = pct(J.com_preco_chamou, J.com_preco_analisados);
  const aud = pct(F.audio, F.mensagens);

  $("#kpis").innerHTML = [
    kpi({ rotulo: "1ª resposta (mediana, horário de loja)", valor: fmtMin(R.mediana_util_min), meta: `meta: até ${m.primeira_resposta_min} min`,
      cls: situacao(R.mediana_util_min, m.primeira_resposta_min, true) || "vazio", filtro: "acima_meta", titulo: `1ª resposta acima de ${m.primeira_resposta_min} min` }),
    kpi({ rotulo: `Respondidas em até ${m.primeira_resposta_min} min`, valor: fmtPct(respMeta), meta: `${n(R.ate_meta)} de ${n(R.atendimentos)} atendimentos`,
      cls: respMeta === null ? "vazio" : "", filtro: "ate_meta" }),
    kpi({ rotulo: "Respondidas em até 24h", valor: fmtPct(resp24), meta: `meta: ${m.resposta_24h_pct}% · ${n(R.sem_resposta)} sem resposta`,
      cls: situacao(resp24, m.resposta_24h_pct) || "vazio", filtro: "acima_24h", titulo: "Atendimentos sem resposta em 24h" }),
    kpi({ rotulo: "Retorno de orçamento (follow-up)", valor: fmtPct(ret), meta: `meta: ${m.retorno_pct}% · ${n(T.com_retorno)} de ${n(T.cliente_sumiu)}`,
      cls: situacao(ret, m.retorno_pct) || "vazio", filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" }),
    kpi({ rotulo: "Chamou pra loja quem recebeu preço", valor: fmtPct(conv), meta: `meta: ${m.convite_pct}% · ${n(J.com_preco_chamou)} de ${n(J.com_preco_analisados)}`,
      cls: situacao(conv, m.convite_pct) || "vazio", filtro: "preco_sem_convite", titulo: "Receberam preço e não foram chamados pra loja" }),
    kpi({ rotulo: "Mensagens da loja em áudio", valor: fmtPct(aud), meta: `limite: ${m.audio_max_pct}% · ${n(F.audio)} de ${n(F.mensagens)}`,
      cls: situacao(aud, m.audio_max_pct, true) || "vazio", filtro: "com_audio", titulo: "Atendimentos com áudio da loja" }),
  ].join("");

  const fatia = (v) => (F.mensagens ? (100 * (v || 0)) / F.mensagens : 0);
  const blocoFormato = `<section class="painel"><header class="painel-topo"><h2>Áudio ou texto</h2>
      <p class="suave">Como a loja responde. Áudio é mais difícil de ler na hora: o cliente no trabalho costuma deixar pra depois.</p></header>
      <div class="empilhada" role="img" aria-label="Texto ${Math.round(fatia(F.texto))}%, áudio ${Math.round(fatia(F.audio))}%">
        <span style="width:${fatia(F.texto)}%;background:#60A5FA"></span><span style="width:${fatia(F.audio)}%;background:#FF6A00"></span>
        <span style="width:${fatia(F.imagem)}%;background:#a78bfa"></span><span style="width:${fatia(F.outros)}%;background:#8A8A8A"></span></div>
      <div class="legenda"><span><i style="background:#60A5FA"></i>Texto ${n(F.texto)}</span><span><i style="background:#FF6A00"></i>Áudio ${n(F.audio)}</span>
        <span><i style="background:#a78bfa"></i>Foto/vídeo ${n(F.imagem)}</span><span><i style="background:#8A8A8A"></i>Outros ${n(F.outros)}</span></div>
      <div class="linhas">
        ${linha({ r: "Mensagens enviadas pela loja", v: n(F.mensagens) })}
        ${linha({ r: "Em áudio", v: fmtPct(aud), s: `limite ${m.audio_max_pct}%`, cls: situacao(aud, m.audio_max_pct, true), filtro: "com_audio", titulo: "Atendimentos com áudio da loja" })}
        ${linha({ r: "Duração média do áudio", v: F.audio_media_seg ? F.audio_media_seg + " s" : "–", s: F.audio_total_min ? `${n(F.audio_total_min)} min no total` : "" })}
        ${linha({ r: "Atendimentos em que a loja só mandou áudio", v: n(F.atendimentos_so_audio), s: `de ${n(F.atendimentos_com_loja)}`, filtro: "so_audio" })}
      </div></section>`;

  const semLeitura = !L.com_leitura;
  $("#blocos").innerHTML = [
    painel("Primeira resposta", "Atendimentos que o cliente começou. Conta só os minutos com a loja aberta: mensagem às 23h respondida às 10h05 vale 5 min.", [
      linha({ r: "Atendimentos que o cliente começou", v: n(R.atendimentos), filtro: "atendimentos" }),
      linha({ r: "Respondidos", v: n(R.respondidos), s: fmtPct(pct(R.respondidos, R.atendimentos)), filtro: "respondidos" }),
      linha({ r: "Sem resposta até agora", v: n(R.sem_resposta), cls: R.sem_resposta ? "ruim" : "", filtro: "sem_resposta" }),
      linha({ r: `Respondidos em até ${m.primeira_resposta_min} min`, v: n(R.ate_meta), s: fmtPct(respMeta), filtro: "ate_meta" }),
      linha({ r: "Esperaram mais de 24h (ou ainda esperam)", v: n(R.acima_24h), cls: R.acima_24h ? "ruim" : "", filtro: "acima_24h" }),
      linha({ r: "Mediana em tempo corrido", v: fmtMin(R.mediana_corrida_min) }),
      linha({ r: "9 em cada 10 respondidos em até", v: fmtMin(R.p90_util_min), s: "horário de loja" }),
      linha({ r: "Vindos de anúncio", v: n(R.anuncio?.atendimentos), filtro: "anuncio" }),
      linha({ r: `respondidos em até ${m.primeira_resposta_min} min`, v: n(R.anuncio?.ate_meta), s: fmtPct(pct(R.anuncio?.ate_meta, R.anuncio?.atendimentos)), sub: true }),
      linha({ r: "mediana da 1ª resposta", v: fmtMin(R.anuncio?.mediana_util_min), sub: true }),
    ]),
    painel("Durante a conversa", "Cada vez que o cliente volta a perguntar depois da primeira resposta.", [
      linha({ r: "Vezes que o cliente esperou a loja", v: n(D.pendencias) }),
      linha({ r: "Mediana da espera (horário de loja)", v: fmtMin(D.mediana_util_min), cls: situacao(D.mediana_util_min, m.primeira_resposta_min, true) }),
      linha({ r: "Mediana em tempo corrido", v: fmtMin(D.mediana_corrida_min) }),
      linha({ r: "Ficaram sem resposta (mais de 1h)", v: n(D.sem_resposta), cls: D.sem_resposta ? "ruim" : "" }),
    ], "Não conta \"ok\", \"obrigada\", emoji e figurinha, que não pedem resposta."),
    painel("Retorno de orçamento (follow-up)", "Orçamento é mensagem da loja com valor em reais. Retorno é a loja voltar a chamar sem o cliente ter respondido.", [
      linha({ r: "Orçamentos enviados", v: n(T.orcamentos), filtro: "com_preco", titulo: "Atendimentos com preço" }),
      linha({ r: "Cliente respondeu em até 24h", v: n(T.cliente_respondeu) }),
      linha({ r: "Cliente sumiu", v: n(T.cliente_sumiu), filtro: "orcamento_sumiu", titulo: "Orçamentos em que o cliente sumiu" }),
      linha({ r: "Loja voltou a chamar", v: n(T.com_retorno), s: fmtPct(ret), cls: situacao(ret, m.retorno_pct), filtro: "orcamento_com_retorno", titulo: "Orçamentos com retorno da loja" }),
      linha({ r: "até o dia seguinte (D+1)", v: n(T.retorno_ate_d1), s: fmtPct(pct(T.retorno_ate_d1, T.cliente_sumiu)), sub: true }),
      linha({ r: "até 3 dias (D+3)", v: n(T.retorno_ate_d3), s: fmtPct(pct(T.retorno_ate_d3, T.cliente_sumiu)), sub: true }),
      linha({ r: "até 7 dias (D+7)", v: n(T.retorno_ate_d7), s: fmtPct(pct(T.retorno_ate_d7, T.cliente_sumiu)), sub: true }),
      linha({ r: "Sem retorno nenhum", v: n(T.sem_retorno), cls: T.sem_retorno ? "ruim" : "", filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" }),
      linha({ r: "Ainda dentro das primeiras 24h", v: n(T.aguardando_24h) }),
    ], `Meta: retorno em pelo menos ${m.retorno_pct}% dos orçamentos sem resposta, em D+1, D+3 e D+7.`),
    painel("Chamar o cliente pra loja", "A IA lê cada atendimento uma vez por dia, de madrugada, e responde só sim ou não, com o trecho que comprova. O resultado de hoje aparece amanhã.", [
      linha({ r: "Atendimentos com resposta da loja", v: n(J.atendimentos), s: `${n(J.analisados)} lidos` }),
      linha({ r: "Loja chamou pra trazer a peça", v: n(J.chamou), s: fmtPct(pct(J.chamou, J.analisados)), filtro: "chamou", titulo: "Loja chamou pra trazer a peça" }),
      linha({ r: "Ficou dia ou horário combinado", v: n(J.marcou_dia), s: fmtPct(pct(J.marcou_dia, J.analisados)), filtro: "marcou_dia", titulo: "Ficou dia combinado" }),
      linha({ r: "Receberam preço", v: n(J.com_preco), s: `${n(J.com_preco_analisados)} lidos`, filtro: "com_preco", titulo: "Atendimentos com preço" }),
      linha({ r: "foram chamados pra loja", v: n(J.com_preco_chamou), s: fmtPct(conv), cls: situacao(conv, m.convite_pct), sub: true }),
      linha({ r: "com dia combinado", v: n(J.com_preco_marcou_dia), s: fmtPct(pct(J.com_preco_marcou_dia, J.com_preco_analisados)),
        cls: situacao(pct(J.com_preco_marcou_dia, J.com_preco_analisados), m.dia_marcado_pct), sub: true }),
      linha({ r: "receberam preço e não foram chamados", v: n(J.com_preco_sem_convite), cls: J.com_preco_sem_convite ? "ruim" : "", filtro: "preco_sem_convite", titulo: "Receberam preço e não foram chamados pra loja", sub: true }),
      linha({ r: "Aguardando a leitura da IA", v: n(J.aguardando_ia), filtro: "aguardando_ia", titulo: "Aguardando a leitura da IA" }),
    ], `Metas: ${m.convite_pct}% de quem recebe preço chamado pra loja, ${m.dia_marcado_pct}% com dia combinado.`),
    painel("Viu e não respondeu", "Usa o aviso de leitura do celular da loja. Separa \"não deu tempo de ver\" (falta de gente) de \"viu e deixou pra depois\" (processo).", [
      linha({ r: "Esperas com aviso de leitura", v: n(L.com_leitura), s: `de ${n(L.pendencias)}` }),
      linha({ r: "Abriu e levou mais de 30 min pra responder (ou não respondeu)", v: n(L.viu_sem_responder), cls: L.viu_sem_responder ? "ruim" : "", filtro: "viu_sem_responder" }),
      linha({ r: "Mediana entre abrir e responder", v: fmtMin(L.mediana_ver_responder_util_min), s: "horário de loja" }),
    ], semLeitura && c.mensagens ? "Nenhum aviso de leitura chegou ainda. Se continuar zerado com mensagens entrando, a NeoGo não manda esse evento e este bloco fica sem dado." : ""),
    blocoFormato,
    painel("Volume", "", [
      linha({ r: "Atendimentos que o cliente começou", v: n(V.atendimentos), filtro: "atendimentos" }),
      linha({ r: "vindos de anúncio", v: n(V.de_anuncio), s: fmtPct(pct(V.de_anuncio, V.atendimentos)), filtro: "anuncio", sub: true }),
      linha({ r: "Contatos diferentes", v: n(V.contatos) }),
      linha({ r: "Atendimentos que a loja começou", v: n(V.iniciados_pela_loja), s: "aviso de peça pronta etc.", filtro: "iniciados_pela_loja" }),
      linha({ r: "Recrutamento (fora das contas)", v: n(V.recrutamento), filtro: "recrutamento" }),
      linha({ r: "Mensagens recebidas / enviadas", v: `${n(V.mensagens_cliente)} / ${n(V.mensagens_loja)}` }),
    ]),
  ].join("");
  desenharCalor(d.calor || [], m.primeira_resposta_min);
}

function desenharCalor(celulas, meta) {
  const h = estado.conta.horario || {};
  let min = 24, max = 0;
  for (let i = 0; i < 7; i++) { const v = h[i]; if (Array.isArray(v)) { min = Math.min(min, +v[0].slice(0, 2)); max = Math.max(max, Math.ceil(+v[1].slice(0, 2) + (+v[1].slice(3) > 0 ? 1 : 0))); } }
  if (min >= max) { $("#calor").innerHTML = `<p class="vazio-msg">Defina o horário da loja na Configuração.</p>`; return; }
  const mapa = new Map(celulas.map((c) => [`${c.dia}-${c.hora}`, c]));
  const dias = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
  const aberto = (dia, hora) => { const v = h[dia]; return Array.isArray(v) && hora >= +v[0].slice(0, 2) && hora < Math.ceil(+v[1].slice(0, 2) + (+v[1].slice(3) > 0 ? 1 : 0)); };
  const cor = (c) => {
    if (c.mediana_util_min === null) return "rgba(248,113,113,.55)";
    if (c.mediana_util_min <= meta) return `rgba(74,222,128,${c.sem_resposta ? .3 : .45})`;
    if (c.mediana_util_min <= meta * 4) return "rgba(250,204,21,.45)";
    return "rgba(248,113,113,.55)";
  };
  let html = `<table><thead><tr><th></th>`;
  for (let hr = min; hr < max; hr++) html += `<th>${hr}h</th>`;
  html += `</tr></thead><tbody>`;
  for (const [dia, nome] of dias) {
    html += `<tr><th scope="row">${nome}</th>`;
    for (let hr = min; hr < max; hr++) {
      if (!aberto(dia, hr)) { html += `<td class="fechado"></td>`; continue; }
      const c = mapa.get(`${dia}-${hr}`);
      if (!c) { html += `<td class="vazio" title="${nome} ${hr}h: sem mensagens"></td>`; continue; }
      const dica = `${nome} ${hr}h: ${c.n} espera(s), mediana ${fmtMin(c.mediana_util_min)}${c.sem_resposta ? `, ${c.sem_resposta} sem resposta` : ""}`;
      html += `<td style="background:${cor(c)}" title="${esc(dica)}">${c.mediana_util_min === null ? "!" : esc(fmtMin(c.mediana_util_min).replace(" min", "'"))}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table><div class="calor-legenda">
    <span><i style="background:rgba(74,222,128,.45)"></i>até ${meta} min</span>
    <span><i style="background:rgba(250,204,21,.45)"></i>até ${meta * 4} min</span>
    <span><i style="background:rgba(248,113,113,.55)"></i>mais que isso ou sem resposta (!)</span>
    <span><i style="background:var(--grafite-2)"></i>ninguém escreveu</span></div>`;
  $("#calor").innerHTML = html;
}

// ---------- listas e conversa (gaveta) ----------
document.addEventListener("click", (e) => {
  const alvo = e.target.closest("[data-filtro]");
  if (alvo && !alvo.closest(".gaveta")) abrirLista(alvo.dataset.filtro, alvo.dataset.titulo);
  const conv = e.target.closest("[data-contato]");
  if (conv) abrirConversa(conv.dataset.contato, conv.dataset.inicio || null, conv.dataset.fim || null, conv.dataset.resumo || null);
  if (e.target.closest("[data-fechar]")) fecharGaveta();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#gaveta").hidden) fecharGaveta(); });
$("#gaveta-voltar").addEventListener("click", () => {
  const anterior = estado.pilha.pop();
  if (anterior) { $("#gaveta-titulo").textContent = anterior.titulo; $("#gaveta-conteudo").innerHTML = anterior.html; }
  $("#gaveta-voltar").hidden = !estado.pilha.length;
});
function abrirGaveta(titulo, html, empilhar = false) {
  const g = $("#gaveta");
  if (empilhar && !g.hidden) estado.pilha.push({ titulo: $("#gaveta-titulo").textContent, html: $("#gaveta-conteudo").innerHTML });
  else estado.pilha = [];
  $("#gaveta-titulo").textContent = titulo;
  $("#gaveta-conteudo").innerHTML = html;
  $("#gaveta-voltar").hidden = !estado.pilha.length;
  g.hidden = false;
  $("#gaveta-conteudo").scrollTop = 0;
}
function fecharGaveta() { $("#gaveta").hidden = true; estado.pilha = []; }

async function abrirLista(filtro, titulo) {
  abrirGaveta(titulo || "Atendimentos", `<p class="vazio-msg">Carregando…</p>`);
  const linhas = await rpc("atendimento_lista", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate, p_filtro: filtro });
  const m = metas();
  const corpo = linhas.length ? linhas.map((a) => {
    const selos = [];
    if (a.de_anuncio) selos.push(`<span class="selo ambar">anúncio</span>`);
    if (a.recrutamento) selos.push(`<span class="selo">vaga</span>`);
    if (!a.iniciado_pela_loja) {
      if (a.resposta_em) selos.push(`<span class="selo ${a.util_min <= m.primeira_resposta_min ? "bom" : "ruim"}">1ª resposta ${esc(fmtMin(a.util_min))}</span>`);
      else selos.push(`<span class="selo ruim">sem resposta</span>`);
    } else selos.push(`<span class="selo">loja começou</span>`);
    if (a.preco) selos.push(`<span class="selo">preço</span>`);
    if (a.orcamento_sumiu) selos.push(a.retorno ? `<span class="selo bom">retorno em ${esc(String(a.retorno_dias).replace(".", ","))} d</span>` : `<span class="selo ruim">sem retorno</span>`);
    if (a.chamou_loja === true) selos.push(`<span class="selo bom">chamou pra loja</span>`);
    if (a.chamou_loja === false) selos.push(`<span class="selo ruim">não chamou</span>`);
    if (a.marcou_dia) selos.push(`<span class="selo bom">dia combinado</span>`);
    if (a.msgs_loja > 0 && a.audios_loja === a.msgs_loja) selos.push(`<span class="selo">só áudio</span>`);
    if (a.viu_sem_responder) selos.push(`<span class="selo ruim">viu e não respondeu</span>`);
    const resumo = JSON.stringify({ util: a.util_min, corrido: a.corrido_min, trecho_convite: a.trecho_convite, trecho_dia: a.trecho_dia,
      chamou: a.chamou_loja, marcou: a.marcou_dia, ia: a.ia_atualizada });
    return `<button type="button" class="item" data-contato="${esc(a.contato)}" data-inicio="${esc(a.inicio)}" data-fim="${esc(a.fim)}" data-resumo="${esc(resumo)}">
      <div class="cab"><span class="quem">${esc(fmtContato(a.contato, a.nome))}</span><span class="quando">${esc(fmtDataHora(a.inicio))}</span></div>
      <div class="selos">${selos.join("")}</div>
      <div class="txt">${a.msgs_cliente} msg do cliente · ${a.msgs_loja} da loja</div></button>`;
  }).join("") : `<p class="vazio-msg">Nenhum atendimento nesse filtro no período.</p>`;
  $("#gaveta-conteudo").innerHTML = `<p class="suave" style="font-size:12.5px;padding:4px 0 8px">${linhas.length} atendimento(s) · ${fmtDataCurta(estado.de)} a ${fmtDataCurta(estado.ate)}${linhas.length >= 500 ? " · mostrando os 500 mais recentes" : ""}</p>${corpo}`;
}

async function abrirConversa(contato, inicio, fim, resumoTxt) {
  abrirGaveta(fmtContato(contato), `<p class="vazio-msg">Carregando conversa…</p>`, true);
  const msgs = await rpc("atendimento_conversa", { p_conta: estado.conta.id, p_contato: contato });
  const nome = msgs.find((x) => x.nome)?.nome;
  $("#gaveta-titulo").textContent = fmtContato(contato, nome);
  const m = metas();
  let topo = "";
  if (resumoTxt) {
    try {
      const r = JSON.parse(resumoTxt);
      const partes = [];
      if (r.util !== null && r.util !== undefined) partes.push(`<div>1ª resposta: <strong>${esc(fmtMin(r.util))}</strong> em horário de loja (${esc(fmtMin(r.corrido))} corridos)</div>`);
      if (r.chamou === true) partes.push(`<div>Chamou pra loja: <q>${esc(r.trecho_convite || "")}</q></div>`);
      if (r.chamou === false) partes.push(`<div>A IA não encontrou convite pra trazer a peça.</div>`);
      if (r.marcou === true) partes.push(`<div>Dia combinado: <q>${esc(r.trecho_dia || "")}</q></div>`);
      if (r.chamou !== null && r.chamou !== undefined && r.ia === false) partes.push(`<div class="suave">Teve mensagem nova depois da última leitura da IA.</div>`);
      if (partes.length) topo = `<div class="resumo-atend">${partes.join("")}</div>`;
    } catch { /* resumo opcional */ }
  }
  let html = "", diaAtual = "", esperaDesde = null, alvo = "";
  const ini = inicio ? new Date(inicio).getTime() : null, fimT = fim ? new Date(fim).getTime() : null;
  for (const x of msgs) {
    if (x.tipo === "reacao") continue;
    const dia = fmtDia(x.enviada_em);
    if (dia !== diaAtual) { html += `<div class="dia">${esc(dia)}</div>`; diaAtual = dia; }
    const t = new Date(x.enviada_em).getTime();
    if (!x.de_loja && esperaDesde === null) esperaDesde = t;
    if (x.de_loja && esperaDesde !== null) {
      const min = (t - esperaDesde) / 60000;
      const cls = min <= m.primeira_resposta_min ? "bom" : min <= m.primeira_resposta_min * 4 ? "atencao" : "ruim";
      html += `<div class="espera ${cls}">loja respondeu em ${esc(fmtMin(min))} (corrido)</div>`;
      esperaDesde = null;
    }
    const fora = ini && (t < ini || t > fimT) ? ' style="opacity:.45"' : "";
    if (ini && !alvo && t >= ini) alvo = ` id="inicio-atend"`;
    let corpo = "";
    if (x.tipo === "texto") corpo = esc(x.texto);
    else if (x.tipo === "audio") {
      corpo = `<span class="midia">🎤 áudio de ${x.audio_segundos ?? "?"} s</span>`;
      if (x.transcricao) corpo += `\n${esc(x.transcricao)}`;
      else if (x.transcricao_status === "pendente") corpo += `\n<span class="midia">transcrição pendente</span>`;
      else if (x.transcricao_status === "erro") corpo += `\n<span class="midia">não foi possível transcrever</span>`;
    } else corpo = `<span class="midia">(${esc(x.tipo)})</span>${x.texto ? "\n" + esc(x.texto) : ""}`;
    if (x.anuncio) corpo = `<span class="midia">veio do anúncio${x.anuncio.titulo ? ": " + esc(x.anuncio.titulo) : ""}</span>\n` + corpo;
    const lida = !x.de_loja && x.lida_em ? ` · vista ${esc(fmtHora(x.lida_em))}` : "";
    html += `<div class="msg ${x.de_loja ? "loja" : ""}"${fora}${alvo === ` id="inicio-atend"` && !html.includes('id="inicio-atend"') ? alvo : ""}>${corpo}<span class="hora">${x.de_loja ? "Loja" : "Cliente"} · ${esc(fmtHora(x.enviada_em))}${lida}</span></div>`;
  }
  if (esperaDesde !== null) html += `<div class="espera ruim">cliente esperando há ${esc(fmtMin((Date.now() - esperaDesde) / 60000))}</div>`;
  $("#gaveta-conteudo").innerHTML = topo + `<div class="conversa">${html || '<p class="vazio-msg">Sem mensagens.</p>'}</div>`;
  const el = $("#inicio-atend"); if (el) el.scrollIntoView({ block: "start" });
}

// ---------- agora ----------
async function carregarAgora() {
  const f = await rpc("atendimento_filas", { p_conta: estado.conta.id });
  const m = metas();
  const item = (contato, nome, quando, selos, txt) => `<button type="button" class="item" data-contato="${esc(contato)}">
    <div class="cab"><span class="quem">${esc(fmtContato(contato, nome))}</span><span class="quando">${quando}</span></div>
    ${selos ? `<div class="selos">${selos}</div>` : ""}${txt ? `<div class="txt">${esc(txt)}</div>` : ""}</button>`;
  const lista = (itens, vazio) => itens.length ? itens.join("") : `<p class="vazio-msg">${vazio}</p>`;
  const esp = (f.esperando || []).map((x) => {
    const cls = x.espera_util_min <= m.primeira_resposta_min ? "bom" : "ruim";
    const selos = [`<span class="selo ${cls}">${esc(fmtMin(x.espera_util_min))} em horário de loja</span>`];
    if (x.de_anuncio) selos.push(`<span class="selo ambar">anúncio</span>`);
    if (x.primeira) selos.push(`<span class="selo">primeira mensagem</span>`);
    if (x.lida_em) selos.push(`<span class="selo ruim">vista às ${esc(fmtHora(x.lida_em))}</span>`);
    return item(x.contato, x.nome, `há ${esc(fmtMin(x.espera_corrida_min))}`, selos.join(""), x.ultimo_texto);
  });
  const ret = (f.retornos || []).map((x) => item(x.contato, x.nome, `${esc(String(x.dias).replace(".", ","))} dias`,
    `<span class="selo ambar">${esc(x.etapa)}</span><span class="selo">${x.retornos_feitos} retorno(s) feito(s)</span>`, x.preco ? "Preço: " + x.preco : ""));
  const conv = (f.sem_convite || []).map((x) => item(x.contato, x.nome, esc(fmtDataHora(x.fim)),
    x.de_anuncio ? `<span class="selo ambar">anúncio</span>` : "", x.preco ? "Preço: " + x.preco : ""));
  $("#filas").innerHTML = [
    painel(`Esperando resposta agora (${esp.length})`, "Cliente falou por último e a loja ainda não respondeu (últimos 7 dias). Mais antigos primeiro.", [lista(esp, "Ninguém esperando.")]),
    painel(`Retornos de orçamento pra hoje (${ret.length})`, "Receberam preço, não responderam, e já passou do D+1, D+3 ou D+7 sem a loja voltar a chamar.", [lista(ret, "Nenhum retorno pendente.")]),
    painel(`Receberam preço e não foram chamados pra loja (${conv.length})`, "Últimos 14 dias, pela leitura da IA. Bom pra retomar com convite e dia.", [lista(conv, "Nenhum caso (ou a IA ainda não leu).")]),
  ].join("");
}

// ---------- histórico ----------
const BASE_MANUAL = { rotulo: "Análise manual 01/10 a 10/11", atendimentos: 148, de_anuncio: 68, mediana: "~10h*", ate15: "–", ate24: "64%*", sem: "–", retorno: "–", convite: "0%", dia: "–", audio: "–" };
async function carregarHistorico() {
  $("#historico").innerHTML = `<p class="vazio-msg">Carregando…</p>`;
  const [semanas, atual] = await Promise.all([
    rpc("atendimento_semanas", { p_conta: estado.conta.id }),
    rpc("atendimento_painel", { p_conta: estado.conta.id, p_de: periodo("semana")[0], p_ate: hojeYMD() }),
  ]);
  const m = metas();
  const linhaSemana = (rot, d, cls = "") => {
    const R = d.resposta || {}, T = d.retorno || {}, J = d.loja || {}, F = d.formato || {}, V = d.volume || {};
    const c15 = pct(R.ate_meta, R.atendimentos), c24 = pct(R.respondidos_24h, R.atendimentos), ret = pct(T.com_retorno, T.cliente_sumiu);
    const conv = pct(J.com_preco_chamou, J.com_preco_analisados), dia = pct(J.com_preco_marcou_dia, J.com_preco_analisados), aud = pct(F.audio, F.mensagens);
    const td = (v, s) => `<td class="${s || ""}">${v}</td>`;
    return `<tr class="${cls}"><td>${rot}</td>${td(n(V.atendimentos))}${td(n(V.de_anuncio))}
      ${td(fmtMin(R.mediana_util_min), situacao(R.mediana_util_min, m.primeira_resposta_min, true))}${td(fmtPct(c15))}
      ${td(fmtPct(c24), situacao(c24, m.resposta_24h_pct))}${td(n(R.sem_resposta))}${td(fmtPct(ret), situacao(ret, m.retorno_pct))}
      ${td(fmtPct(conv), situacao(conv, m.convite_pct))}${td(fmtPct(dia), situacao(dia, m.dia_marcado_pct))}${td(fmtPct(aud), situacao(aud, m.audio_max_pct, true))}</tr>`;
  };
  const b = BASE_MANUAL;
  let html = `<table class="hist"><thead><tr><th>Semana</th><th>Atendimentos</th><th>De anúncio</th><th>1ª resposta</th><th>Em até ${m.primeira_resposta_min} min</th>
    <th>Em até 24h</th><th>Sem resposta</th><th>Retorno de orçamento</th><th>Chamou pra loja</th><th>Dia combinado</th><th>Áudio da loja</th></tr></thead><tbody>`;
  html += linhaSemana(`Semana atual (desde ${fmtDataCurta(periodo("semana")[0])})`, atual, "atual");
  for (const s of semanas) {
    const fimSem = somaDias(s.semana, 6);
    html += linhaSemana(`${fmtDataCurta(s.semana)} a ${fmtDataCurta(fimSem)}${s.metricas.semana_parcial ? " (parcial)" : ""}`, s.metricas);
  }
  html += `<tr><td>${b.rotulo}</td><td>${b.atendimentos}</td><td>${b.de_anuncio}</td><td>${b.mediana}</td><td>${b.ate15}</td><td>${b.ate24}</td>
    <td>${b.sem}</td><td>${b.retorno}</td><td>${b.convite}</td><td>${b.dia}</td><td>${b.audio}</td></tr></tbody></table>
    <p class="nota" style="margin-top:10px">* A análise manual mediu tempo corrido, lido no WhatsApp Web, e não tinha os áudios. Serve de referência do "antes", não é comparação exata.${semanas.length ? "" : " Nenhuma semana fechada ainda: a primeira fecha na terça seguinte à conexão."}</p>`;
  $("#historico").innerHTML = html;
}

// ---------- configuração ----------
function desenharConfig() {
  const c = estado.conta, m = metas(), av = estado.avisos || {};
  const [cls, txt] = statusConexao(c);
  const dias = [[1, "Segunda"], [2, "Terça"], [3, "Quarta"], [4, "Quinta"], [5, "Sexta"], [6, "Sábado"], [0, "Domingo"]];
  const h = c.horario || {};
  const linhasHorario = dias.map(([d, nome]) => {
    const v = h[d]; const fechado = !Array.isArray(v);
    return `<span>${nome}</span><input type="time" data-dia="${d}" data-p="0" value="${fechado ? "10:00" : esc(v[0])}" ${fechado ? "disabled" : ""} aria-label="${nome} abre">
      <input type="time" data-dia="${d}" data-p="1" value="${fechado ? "22:00" : esc(v[1])}" ${fechado ? "disabled" : ""} aria-label="${nome} fecha">
      <label class="fechado-lbl"><input type="checkbox" data-fechado="${d}" ${fechado ? "checked" : ""}> fechado</label>`;
  }).join("");
  const metaCampo = (k, rot) => `<label for="meta-${k}">${rot}</label><input type="number" id="meta-${k}" data-meta="${k}" min="0" max="1440" value="${esc(m[k])}">`;
  const aviso = (k) => av[k] ? `${esc(av[k].valor)} <span class="suave">(${esc(haQuanto(av[k].em))})</span>` : `<span class="suave">nenhuma rodada ainda</span>`;
  const lote = c.ultimo_lote;
  $("#config").innerHTML = `<div class="config">
    <section class="painel"><header class="painel-topo"><h2>Conexão com a NeoGo</h2>
      <p class="suave">O sistema só escuta. Não existe envio de mensagem por aqui.</p></header>
      <div class="linhas">
        ${linha({ r: "Situação", v: `<span class="status ${cls}">${esc(txt)}</span>` })}
        ${linha({ r: "Instância", v: c.instance_id ? esc(c.instance_nome || c.instance_id) : "nenhuma ainda" })}
        ${linha({ r: "Mensagens guardadas", v: n(c.mensagens), s: c.primeira_mensagem_em ? "desde " + esc(fmtDataHora(c.primeira_mensagem_em, true)) : "" })}
        ${linha({ r: "Último evento recebido", v: esc(c.ultimo_evento_tipo || "–"), s: c.ultimo_evento_em ? esc(haQuanto(c.ultimo_evento_em)) : "" })}
      </div>
      <label class="campo">Endereço do webhook (funciona como senha, não compartilhe)
        <div class="copiar"><input type="text" readonly value="${esc(c.webhook)}" id="webhook"><button class="btn-fantasma" type="button" id="btn-copiar">Copiar</button></div></label>
      <ol class="passos">
        <li>Conecte o WhatsApp da loja na NeoGo lendo o QR code com o celular da loja.</li>
        <li>Na instância, abra os webhooks e use um <strong>slot livre</strong>. Se já tiver um slot apontando pro n8n, não mexa nele.</li>
        <li>Cole o endereço acima, marque os eventos <code>Message</code> e <code>Receipt</code> (ou todos) e ative.</li>
        <li>Mande uma mensagem de outro número pra loja e responda pelo celular. Em até 1 minuto a situação muda pra "Recebendo".</li>
      </ol>
      <p class="nota">A primeira instância que mandar evento fica presa a esta loja. Evento de outra instância nesse endereço é ignorado.</p>
    </section>
    <section class="painel"><header class="painel-topo"><h2>OpenAI (áudios e leitura da IA)</h2>
      <p class="suave">Transcrição com gpt-transcribe (~US$ 0,0045 por minuto). Leitura em lote com GPT-6.1 Terra, uma vez por dia.</p></header>
      <div class="linhas">
        ${linha({ r: "Transcrição", v: "", s: "" }).replace('<span class="v "></span>', `<span class="v" style="font-weight:400;text-align:right">${aviso("transcricao")}</span>`)}
        ${linha({ r: "Áudios aguardando / com falha", v: `${n(c.audios_pendentes)} / ${n(c.audios_erro)}` })}
        ${linha({ r: "Leitura da IA", v: "", s: "" }).replace('<span class="v "></span>', `<span class="v" style="font-weight:400;text-align:right">${aviso("ia")}</span>`)}
        ${linha({ r: "Último lote", v: lote ? esc(`${lote.status} (${lote.itens} itens)`) : "nenhum", s: lote ? esc(fmtDataHora(lote.criado_em)) : "" })}
      </div>
      <ol class="passos">
        <li>Crie a chave em <code>platform.openai.com</code> → API keys.</li>
        <li>No Supabase do CRM: Edge Functions → Secrets → adicionar <code>OPENAI_API_KEY</code> com a chave.</li>
        <li>Pronto: os áudios começam a ser transcritos em até 5 minutos e o primeiro lote sai às 4h.</li>
      </ol>
    </section>
    <section class="painel"><header class="painel-topo"><h2>Horário da loja</h2>
      <p class="suave">Usado pra contar o tempo de resposta só com a loja aberta e pro mapa de calor.</p></header>
      <div class="grade-horario">${linhasHorario}</div>
    </section>
    <section class="painel"><header class="painel-topo"><h2>Metas</h2>
      <p class="suave">Valores iniciais pelas boas práticas de atendimento por WhatsApp. Ajuste se a realidade da loja pedir.</p></header>
      <div class="grade-metas">
        ${metaCampo("primeira_resposta_min", "1ª resposta até (minutos, horário de loja)")}
        ${metaCampo("resposta_24h_pct", "Respondidas em até 24h (%)")}
        ${metaCampo("retorno_pct", "Orçamentos sem resposta com retorno da loja (%)")}
        ${metaCampo("convite_pct", "Quem recebe preço e é chamado pra loja (%)")}
        ${metaCampo("dia_marcado_pct", "Quem recebe preço e fica com dia combinado (%)")}
        ${metaCampo("audio_max_pct", "Mensagens da loja em áudio, no máximo (%)")}
      </div>
      <div><button class="btn" type="button" id="btn-salvar-config">Salvar horário e metas</button></div>
    </section>
    <section class="painel"><header class="painel-topo"><h2>Como contamos</h2></header>
      <div class="como">
        <p><strong>Atendimento:</strong> a conversa com um contato. Um novo começa quando a conversa fica 8 dias parada, pra cobrir orçamento, retornos até D+7 e visita.</p>
        <p><strong>1ª resposta:</strong> da primeira mensagem do cliente até a primeira mensagem da loja, contando só minutos com a loja aberta. Reação com emoji não conta como resposta.</p>
        <p><strong>Orçamento:</strong> mensagem da loja com valor em reais (R$ 45, 45,00, 380 reais), em texto ou em áudio transcrito.</p>
        <p><strong>Retorno (follow-up):</strong> a loja manda nova mensagem 12h ou mais depois do orçamento, sem o cliente ter respondido. D+1 até 36h, D+3 até 84h, D+7 até 180h.</p>
        <p><strong>Chamou pra loja e dia combinado:</strong> leitura da IA, uma vez por dia, só sim ou não com o trecho. Não é nota de atendimento.</p>
        <p><strong>Recrutamento:</strong> contato que fala de vaga, currículo, emprego ou salário sai de todas as contas de venda.</p>
        <p><strong>Viu e não respondeu:</strong> o celular da loja abriu a mensagem e passou mais de 30 min (horário de loja) sem resposta.</p>
      </div>
    </section>
  </div>`;
  $("#btn-copiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(c.webhook); toast("Endereço copiado."); }
    catch { $("#webhook").select(); toast("Selecionado: copie com Ctrl+C."); }
  });
  $$("[data-fechado]").forEach((cb) => cb.addEventListener("change", () => {
    $$(`input[type=time][data-dia="${cb.dataset.fechado}"]`).forEach((i) => { i.disabled = cb.checked; });
  }));
  $("#btn-salvar-config").addEventListener("click", salvarConfig);
}
async function salvarConfig() {
  const horario = {};
  for (let d = 0; d < 7; d++) {
    const fechado = $(`[data-fechado="${d}"]`).checked;
    horario[d] = fechado ? null : [$(`input[data-dia="${d}"][data-p="0"]`).value, $(`input[data-dia="${d}"][data-p="1"]`).value];
  }
  const metasNovas = {};
  $$("[data-meta]").forEach((i) => { metasNovas[i.dataset.meta] = Number(i.value); });
  const btn = $("#btn-salvar-config"); btn.disabled = true;
  try {
    await rpc("atendimento_salvar_config", { p_conta: estado.conta.id, p_horario: horario, p_metas: metasNovas });
    const r = await rpc("atendimento_contas", {});
    estado.contas = r.contas; estado.avisos = r.avisos || {};
    estado.conta = estado.contas.find((c) => c.id === estado.conta.id);
    toast("Horário e metas salvos.");
    desenharConfig();
  } finally { btn.disabled = false; }
}

// ---------- arranque ----------
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) return mostrarEntrar();
  if (await precisaCodigo()) { mostrarEntrar(""); $("#campo-codigo").hidden = false; return; }
  try { await iniciar(); } catch { /* erro já mostrado */ }
})();
