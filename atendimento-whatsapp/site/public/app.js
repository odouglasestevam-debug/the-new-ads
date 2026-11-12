"use strict";
// Monitor de atendimento por WhatsApp. Só leitura: a tela chama funções do banco que conferem
// o que cada usuário pode ver (admin tudo, dono da rede as unidades dele, equipe só a própria unidade).

const SUPABASE_URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const estado = { perfil: null, redes: [], contas: [], avisos: {}, ultimoLote: null, conta: null,
  preset: "30", de: null, ate: null, dados: null, aba: null, timerAgora: null, pilha: [] };

const guardar = (k, v) => { try { localStorage.setItem("atd:" + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const lerGuardado = (k, padrao) => { try { const v = localStorage.getItem("atd:" + k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };

// ---------- definições ----------
const METAS_PADRAO = { primeira_resposta_min: 15, resposta_24h_pct: 95, entendeu_pct: 80, incluso_pct: 70, diferencial_pct: 60,
  convite_pct: 80, compromisso_pct: 50, relembrou_pct: 90, retorno_pct: 80, audio_max_pct: 30 };
const PESOS_PADRAO = { agilidade: 25, conducao: 30, compromisso: 25, retorno: 15, formato: 5 };

const PILARES = [
  { k: "agilidade", nome: "Agilidade", desc: "Responder rápido e não deixar ninguém sem resposta.", kpis: [
    { k: "primeira_resposta", nome: "1ª resposta (mediana)", un: "min", menor: true, filtro: "acima_meta", titulo: "1ª resposta acima da meta" },
    { k: "respondidas_24h", nome: "Respondidos em até 24h", un: "%", filtro: "acima_24h", titulo: "Sem resposta em 24h" }] },
  { k: "conducao", nome: "Condução", desc: "Conduzir a conversa em vez de só informar.", kpis: [
    { k: "entendeu", nome: "Entendeu o caso", un: "%", filtro: "sem_entendeu", titulo: "Não procurou entender o caso" },
    { k: "incluso", nome: "Explicou o que está incluso", un: "%", filtro: "sem_incluso", titulo: "Passou preço sem explicar o que está incluso" },
    { k: "diferencial", nome: "Falou dos diferenciais", un: "%", filtro: "sem_diferencial", titulo: "Não falou de nenhum diferencial" },
    { k: "convite", nome: "Chamou pra trazer a peça", un: "%", filtro: "sem_convite", titulo: "Não chamou pra loja" }] },
  { k: "compromisso", nome: "Compromisso", desc: "Combinar o dia de trazer a peça e lembrar o cliente.", kpis: [
    { k: "compromisso", nome: "Compromisso firmado", un: "%", filtro: "sem_compromisso", titulo: "Sem compromisso firmado" },
    { k: "relembrou", nome: "Relembrou o compromisso", un: "%", filtro: "nao_relembrou", titulo: "Não relembrou o compromisso" }] },
  { k: "retorno", nome: "Retorno", desc: "Voltar a chamar quem recebeu preço e sumiu.", kpis: [
    { k: "retorno", nome: "Retorno de orçamento", un: "%", filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" }] },
  { k: "formato", nome: "Formato", desc: "Escrever, em vez de mandar só áudio.", kpis: [
    { k: "audio", nome: "Mensagens da loja em áudio", un: "%", menor: true, filtro: "com_audio", titulo: "Atendimentos com áudio da loja" }] },
];
const META_DO_KPI = { primeira_resposta: "primeira_resposta_min", respondidas_24h: "resposta_24h_pct", entendeu: "entendeu_pct",
  incluso: "incluso_pct", diferencial: "diferencial_pct", convite: "convite_pct", compromisso: "compromisso_pct",
  relembrou: "relembrou_pct", retorno: "retorno_pct", audio: "audio_max_pct" };
const SERVICOS = { calcados: "Calçados", bolsas_malas: "Bolsas e malas", roupas_costura: "Roupas e costura", bordado_estampa: "Bordado e estampa",
  relogios: "Relógios", lavanderia: "Lavanderia", produtos: "Produtos", outro: "Outro", nao_identificado: "Não deu pra saber" };
const TIPOS = { oportunidade: "oportunidade", acompanhamento: "peça já na loja", outro: "outro assunto", recrutamento: "vaga" };
const PAPEIS = { admin: "Administrador (The New Ads)", rede: "Dono da rede", unidade: "Equipe da unidade" };

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
const fmtNota = (v) => (v === null || v === undefined ? "–" : String(Math.round(Number(v))));
const faixa = (v) => (v === null || v === undefined ? "vazio" : v >= 85 ? "bom" : v >= 70 ? "atencao" : "ruim");
const clsPontos = (p) => (p === null || p === undefined ? "" : p >= 100 ? "bom" : p >= 50 ? "atencao" : "ruim");
const fmtKpi = (v, un) => (v === null || v === undefined ? "–" : un === "min" ? fmtMin(v) : Math.round(Number(v)) + "%");
const fmtMeta = (k, meta) => (meta === null || meta === undefined ? "–" : (k.menor ? "até " : "") + (k.un === "min" ? meta + " min" : meta + "%"));
function fmtDataHora(iso, comAno = false) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), day: "2-digit", month: "2-digit", ...(comAno ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function fmtHora(iso) { return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
function fmtDia(iso) { return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso)); }
function fmtDataCurta(ymd) { if (!ymd) return "–"; const [, m, d] = String(ymd).slice(0, 10).split("-"); return `${d}/${m}`; }
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
  const segunda = somaDias(hoje, -((dow + 6) % 7));
  if (preset === "7") return [somaDias(hoje, -6), hoje];
  if (preset === "30") return [somaDias(hoje, -29), hoje];
  if (preset === "semana") return [segunda, hoje];
  if (preset === "semana-passada") return [somaDias(segunda, -7), somaDias(segunda, -1)];
  if (preset === "mes") return [hoje.slice(0, 8) + "01", hoje];
  if (preset === "mes-passado") {
    const ini = new Date(hoje.slice(0, 8) + "01T12:00:00Z"); ini.setUTCMonth(ini.getUTCMonth() - 1);
    return [ini.toISOString().slice(0, 10), somaDias(hoje.slice(0, 8) + "01", -1)];
  }
  return [somaDias(hoje, -29), hoje];
}

// ---------- papéis ----------
const ehAdmin = () => !!estado.perfil?.admin;
const rede = () => estado.redes.find((r) => r.id === estado.conta?.rede_id) || estado.redes[0] || null;
const gereRede = () => !!rede()?.gere;
const contasDaRede = () => estado.contas.filter((c) => c.rede_id === rede()?.id);
const metas = () => ({ ...METAS_PADRAO, ...(rede()?.metas || {}) });
const pesos = () => ({ ...PESOS_PADRAO, ...(rede()?.pesos || {}) });
const abaVisivel = (aba) => aba === "rede" ? contasDaRede().length > 1 : aba === "config" ? gereRede() : true;

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
  if (/sem_permissao/.test(m)) return "Seu acesso não permite isso.";
  if (/horario_invalido/.test(m)) return "Horário inválido: use HH:MM e abertura antes do fechamento.";
  if (/meta_invalida/.test(m)) return "Meta inválida: percentuais de 0 a 100, minutos até 1440.";
  if (/peso_invalido/.test(m)) return "Peso inválido: use de 0 a 100.";
  if (/pesos_soma/.test(m)) return "Os pesos precisam somar 100.";
  if (/textos_invalidos/.test(m)) return "Mensagens automáticas: até 20, cada uma com até 300 caracteres.";
  if (/texto_longo/.test(m)) return "Texto acima de 3.000 caracteres.";
  if (/nao_remove_a_si/.test(m)) return "Você não pode tirar o próprio acesso.";
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

$("#btn-senha").addEventListener("click", () => {
  abrirGaveta("Trocar senha", `<form id="form-senha" class="form-grade">
    <label class="campo">Nova senha (mínimo 8 caracteres)<input type="password" id="nova-senha" minlength="8" autocomplete="new-password" required></label>
    <label class="campo">Repita a nova senha<input type="password" id="nova-senha-2" minlength="8" autocomplete="new-password" required></label>
    <div><button class="btn" type="submit">Salvar senha</button></div>
    <p class="erro" id="erro-senha" role="alert"></p></form>`);
  $("#form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = $("#nova-senha").value, b = $("#nova-senha-2").value;
    if (a.length < 8) { $("#erro-senha").textContent = "Use pelo menos 8 caracteres."; return; }
    if (a !== b) { $("#erro-senha").textContent = "As duas senhas não são iguais."; return; }
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) { $("#erro-senha").textContent = "Não deu certo: " + error.message; return; }
    fecharGaveta(); toast("Senha trocada.");
  });
});

// ---------- início ----------
async function recarregarContas() {
  const r = await rpc("atendimento_contas", {});
  if (!r.perfil) throw new Error("banco_desatualizado");
  estado.perfil = r.perfil; estado.redes = r.redes || []; estado.contas = r.contas || [];
  estado.avisos = r.avisos || {}; estado.ultimoLote = r.ultimo_lote || null;
  if (estado.conta) estado.conta = estado.contas.find((c) => c.id === estado.conta.id) || estado.contas[0];
}
async function iniciar() {
  try { await recarregarContas(); }
  catch (e) {
    if (e.message === "banco_desatualizado") { mostrarEntrar("O banco ainda não recebeu a atualização das 3 unidades (0005 e 0006)."); return; }
    throw e;
  }
  if (!estado.contas.length) { mostrarEntrar("Nenhuma unidade liberada pra este usuário."); return; }
  const salva = lerGuardado("conta", null);
  estado.conta = estado.contas.find((c) => c.id === salva) || estado.contas[0];
  estado.preset = lerGuardado("preset", "30");
  [estado.de, estado.ate] = periodo(estado.preset);
  $("#tela-entrar").hidden = true; $("#app").hidden = false;
  desenharTopo();
  irPara(location.hash.slice(1) || (abaVisivel("rede") ? "rede" : "geral"), true);
}
$("#sel-conta").addEventListener("change", (e) => {
  estado.conta = estado.contas.find((c) => c.id === e.target.value);
  guardar("conta", estado.conta.id); desenharTopo();
  irPara(estado.aba === "rede" ? "geral" : estado.aba, true);
});

function statusConexao(c) {
  if (/logged ?out|disconnect|temporaryban|ban/i.test(c.ultimo_evento_tipo || "")) return ["ruim", `Desconectado (${c.ultimo_evento_tipo})`];
  if (!c.ultimo_evento_em) return ["alerta", c.importadas ? "Histórico importado · aguardando conexão" : "Aguardando conexão da NeoGo"];
  const ult = c.ultima_mensagem_em;
  if (!ult) return ["alerta", "Conectado, nenhuma mensagem ainda"];
  const horas = (Date.now() - new Date(ult).getTime()) / 3600000;
  if (horas > 24) return ["alerta", `Sem mensagens ${haQuanto(ult)}`];
  return ["ok", `Recebendo · última ${haQuanto(ult)}`];
}
function desenharTopo() {
  const c = estado.conta, r = rede();
  const logo = $("#logo-rede");
  logo.src = r?.logo || "/icone.svg"; logo.classList.toggle("logo-rede", !!r?.logo);
  $("#nome-conta").textContent = estado.aba === "rede" && r ? r.nome : `${r ? r.nome + " · " : ""}${c.unidade || c.nome}`;
  const [cls, txt] = statusConexao(c);
  const st = $("#status-conexao"); st.className = "status " + cls; st.textContent = estado.aba === "rede" ? `${contasDaRede().length} unidades` : txt;
  if (estado.aba === "rede") st.className = "status ok";
  const sel = $("#sel-conta");
  sel.innerHTML = estado.contas.map((x) => `<option value="${esc(x.id)}">${esc(x.unidade || x.nome)}</option>`).join("");
  sel.value = c.id; sel.hidden = estado.contas.length < 2 || estado.aba === "rede";
  $$(".abas a").forEach((a) => { a.hidden = !abaVisivel(a.dataset.aba); });
}

// ---------- abas ----------
window.addEventListener("hashchange", () => irPara(location.hash.slice(1)));
function irPara(aba, forcar = false) {
  if (!["rede", "geral", "agora", "historico", "regras", "config"].includes(aba) || !abaVisivel(aba)) aba = abaVisivel("rede") ? "rede" : "geral";
  if (estado.aba === aba && !forcar && !$("#aba-" + aba).hidden) return;
  estado.aba = aba;
  if (location.hash.slice(1) !== aba) history.replaceState(null, "", "#" + aba);
  desenharTopo();
  $$(".abas a").forEach((a) => a.classList.toggle("ativa", a.dataset.aba === aba));
  $$(".aba").forEach((s) => { s.hidden = s.id !== "aba-" + aba; });
  $("#barra-periodo").hidden = !["rede", "geral"].includes(aba);
  clearInterval(estado.timerAgora);
  if (aba === "rede") carregarRede();
  if (aba === "geral") carregarGeral();
  if (aba === "agora") { carregarAgora(); estado.timerAgora = setInterval(carregarAgora, 60000); }
  if (aba === "historico") carregarHistorico();
  if (aba === "regras") desenharRegras();
  if (aba === "config") desenharConfig();
}

// ---------- período ----------
function marcarPeriodo() {
  $$("#chips-periodo button").forEach((b) => b.classList.toggle("ativo", b.dataset.p === estado.preset));
  $("#de").value = estado.de; $("#ate").value = estado.ate;
}
function recarregarPeriodo() { if (estado.aba === "rede") carregarRede(); else carregarGeral(); }
$("#chips-periodo").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  estado.preset = b.dataset.p; guardar("preset", estado.preset);
  [estado.de, estado.ate] = periodo(estado.preset);
  recarregarPeriodo();
});
["#de", "#ate"].forEach((s) => $(s).addEventListener("change", () => {
  const de = $("#de").value, ate = $("#ate").value;
  if (!de || !ate || ate < de) return;
  estado.preset = "livre"; estado.de = de; estado.ate = ate; recarregarPeriodo();
}));
const periodoTxt = () => `${fmtDataCurta(estado.de)} a ${fmtDataCurta(estado.ate)}`;

// ---------- peças de tela ----------
function linha({ r, v, s = "", cls = "", filtro, titulo, sub }) {
  const tag = filtro ? "button" : "div";
  return `<${tag} class="linha ${sub ? "sub" : ""}" ${filtro ? `type="button" data-filtro="${esc(filtro)}" data-titulo="${esc(titulo || r)}"` : ""}>
    <span class="r">${esc(r)}</span><span class="v ${cls}">${v}</span><span class="s">${s}</span></${tag}>`;
}
function painel(titulo, desc, linhas, nota = "") {
  return `<section class="painel"><header class="painel-topo"><h2>${esc(titulo)}</h2>${desc ? `<p class="suave">${desc}</p>` : ""}</header>
    <div class="linhas">${linhas.join("")}</div>${nota ? `<p class="nota">${nota}</p>` : ""}</section>`;
}
const medidor = (v, cls = "") => `<span class="medidor"><span class="${cls}" style="width:${Math.max(0, Math.min(100, Number(v) || 0))}%"></span></span>`;

function blocoNota(nota, titulo, sub) {
  if (!nota) return "";
  const pil = PILARES.map((p) => {
    const P = nota.pilares?.[p.k] || {};
    const linhas = p.kpis.map((k) => {
      const K = P.kpis?.[k.k] || {};
      const semAmostra = K.valor === null || K.valor === undefined;
      return linha({ r: k.nome, v: semAmostra ? "–" : fmtKpi(K.valor, k.un),
        s: semAmostra ? "sem amostra" : `meta ${fmtMeta(k, K.meta)} · ${fmtNota(K.pontos)} pts`,
        cls: clsPontos(K.pontos), filtro: k.filtro, titulo: k.titulo });
    }).join("");
    return `<div class="pilar"><div class="pilar-cab"><span>${esc(p.nome)}</span><span class="suave">peso ${n(P.peso)}</span>
        <strong class="${faixa(P.pontos)}">${fmtNota(P.pontos)}</strong></div>
      ${medidor(P.pontos, faixa(P.pontos))}<p class="suave pilar-desc">${esc(p.desc)}</p><div class="linhas">${linhas}</div></div>`;
  }).join("");
  const avisos = [];
  if (nota.amostra_pequena) avisos.push("Poucos atendimentos no período: a nota ainda oscila muito.");
  const semDado = PILARES.filter((p) => (nota.pilares?.[p.k]?.peso || 0) > 0 && nota.pilares?.[p.k]?.pontos == null).map((p) => p.nome);
  if (semDado.length) avisos.push(`Sem dado suficiente em ${semDado.join(", ")}: a nota usa só as outras partes.`);
  return `<section class="painel nota-painel"><div class="nota-topo">
      <div class="nota-num ${faixa(nota.valor)}" aria-label="Nota ${fmtNota(nota.valor)} de 100">${fmtNota(nota.valor)}</div>
      <div class="nota-texto"><h2>${esc(titulo)}</h2><p class="suave">${sub}</p>${avisos.map((a) => `<p class="nota-aviso">${esc(a)}</p>`).join("")}</div></div>
    <div class="pilares">${pil}</div></section>`;
}

// ---------- rede ----------
async function carregarRede() {
  marcarPeriodo();
  const r = rede();
  $("#rede-ranking").innerHTML = `<div class="painel"><p class="vazio-msg">Calculando as unidades…</p></div>`;
  const [lista, semanas] = await Promise.all([
    rpc("atendimento_rede", { p_rede: r.id, p_de: estado.de, p_ate: estado.ate }),
    rpc("atendimento_rede_semanas", { p_rede: r.id }),
  ]);
  const ord = [...lista].sort((a, b) => (b.calc?.nota?.valor ?? -1) - (a.calc?.nota?.valor ?? -1));
  $("#rede-ranking").innerHTML = ord.map((u, i) => {
    const N = u.calc?.nota || {}, V = u.calc?.volume || {}, Q = u.calc?.qualidade || {};
    const pil = PILARES.map((p) => { const pts = N.pilares?.[p.k]?.pontos;
      return `<div class="uc-pilar"><span>${esc(p.nome)}</span>${medidor(pts, faixa(pts))}<span class="num">${fmtNota(pts)}</span></div>`; }).join("");
    return `<button type="button" class="unidade-card" data-ir-conta="${esc(u.conta_id)}">
      <div class="uc-topo"><span class="uc-pos">${N.valor == null ? "" : i + 1 + "º"}</span><strong>${esc(u.unidade)}</strong>
        <span class="nota-num pequeno ${faixa(N.valor)}">${fmtNota(N.valor)}</span></div>
      <div class="uc-pilares">${pil}</div>
      <p class="suave uc-rodape">${n(V.atendimentos)} atendimentos · ${n(Q.oportunidades)} oportunidades lidas${N.amostra_pequena ? " · amostra pequena" : ""}</p>
    </button>`;
  }).join("") || `<div class="painel"><p class="vazio-msg">Nenhuma unidade.</p></div>`;

  const unidades = [...lista].sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR"));
  const m = metas();
  const linhasComp = [
    { r: "Nota", f: (d) => fmtNota(d.nota?.valor), cls: (d) => faixa(d.nota?.valor), meta: "85+" },
    { r: "Atendimentos que o cliente começou", f: (d) => n(d.volume?.atendimentos) },
    { r: "Oportunidades de serviço (lidas pela IA)", f: (d) => n(d.qualidade?.oportunidades) },
  ];
  for (const p of PILARES) for (const k of p.kpis) {
    linhasComp.push({ r: k.nome, f: (d) => fmtKpi(d.nota?.pilares?.[p.k]?.kpis?.[k.k]?.valor, k.un),
      cls: (d) => clsPontos(d.nota?.pilares?.[p.k]?.kpis?.[k.k]?.pontos), meta: fmtMeta(k, m[META_DO_KPI[k.k]]) });
  }
  linhasComp.push(
    { r: "Modo balcão (respondeu e não levou pra loja)", f: (d) => fmtPct(pct(d.qualidade?.balcao, d.qualidade?.oportunidades)) },
    { r: "Tempo até o preço (mediana, loja aberta)", f: (d) => fmtMin(d.qualidade?.tempo_ate_preco_mediana_min) },
    { r: "Chegou com a loja fechada: resposta depois de abrir", f: (d) => fmtMin(d.resposta?.fora_horario?.mediana_util_min) },
    { r: "Cliente teve que perguntar se a peça estava pronta", f: (d) => n(d.qualidade?.cobrou_status) },
    { r: "Mensagens por atendimento", f: (d) => d.volume?.msgs_por_atendimento == null ? "–" : String(d.volume.msgs_por_atendimento).replace(".", ",") },
  );
  $("#rede-comparativo").innerHTML = `<table class="hist comp"><thead><tr><th>Indicador</th>${unidades.map((u) => `<th>${esc(u.unidade)}</th>`).join("")}<th>Meta</th></tr></thead><tbody>
    ${linhasComp.map((l) => `<tr><td>${esc(l.r)}</td>${unidades.map((u) => `<td class="${l.cls ? l.cls(u.calc || {}) : ""}">${l.f(u.calc || {})}</td>`).join("")}<td class="suave">${esc(l.meta || "")}</td></tr>`).join("")}
    </tbody></table>`;

  const semMap = new Map();
  for (const s of semanas) { if (!semMap.has(s.semana)) semMap.set(s.semana, {}); semMap.get(s.semana)[s.conta_id] = s; }
  $("#rede-evolucao").innerHTML = semMap.size ? `<table class="hist"><thead><tr><th>Semana</th>${unidades.map((u) => `<th>${esc(u.unidade)}</th>`).join("")}</tr></thead><tbody>
    ${[...semMap.entries()].map(([sem, porConta]) => `<tr><td>${fmtDataCurta(sem)} a ${fmtDataCurta(somaDias(sem, 6))}</td>${unidades.map((u) => {
      const s = porConta[u.conta_id]; const v = s?.nota?.valor;
      return `<td>${s ? `<span class="chip-nota ${faixa(v)}">${fmtNota(v)}</span>${s.parcial ? ' <span class="suave">parcial</span>' : ""}` : "–"}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>`
    : `<p class="vazio-msg">Nenhuma semana fechada ainda. A primeira fecha na terça às 8h.</p>`;
}
document.addEventListener("click", (e) => {
  const card = e.target.closest("[data-ir-conta]");
  if (!card) return;
  estado.conta = estado.contas.find((c) => c.id === card.dataset.irConta) || estado.conta;
  guardar("conta", estado.conta.id);
  irPara("geral", true);
});

// ---------- unidade ----------
async function carregarGeral() {
  marcarPeriodo();
  $("#nota-unidade").innerHTML = `<section class="painel"><p class="vazio-msg">Calculando…</p></section>`;
  const d = await rpc("atendimento_painel", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate });
  estado.dados = d;
  desenharGeral(d);
}

function desenharGeral(d) {
  const m = metas();
  const R = d.resposta || {}, V = d.volume || {}, D = d.durante || {}, L = d.leitura || {}, F = d.formato || {}, T = d.retorno || {}, Q = d.qualidade || {};
  const aviso = $("#aviso-geral");
  const c = estado.conta;
  if (!c.mensagens) {
    aviso.hidden = false;
    aviso.innerHTML = `<strong>Ainda não chegou nenhuma mensagem desta unidade.</strong> Os números aparecem quando o WhatsApp da loja for conectado na NeoGo.`;
  } else if (!c.ultimo_evento_em && c.importadas) {
    aviso.hidden = false;
    aviso.innerHTML = `Dados importados do WhatsApp Web, desde <strong>${fmtDataHora(c.primeira_mensagem_em, true)}</strong>. Não têm aviso de leitura nem o conteúdo dos áudios. A coleta automática começa quando a NeoGo for conectada.`;
  } else if (c.primeira_mensagem_em && c.primeira_mensagem_em.slice(0, 10) > estado.de) {
    aviso.hidden = false;
    aviso.innerHTML = `Coleta desde <strong>${fmtDataHora(c.primeira_mensagem_em, true)}</strong>. Dias anteriores do período ficam sem dado.`;
  } else aviso.hidden = true;

  $("#nota-unidade").innerHTML = blocoNota(d.nota, `Nota do atendimento · ${c.unidade || c.nome}`,
    `${periodoTxt()} · ${n(V.atendimentos)} atendimentos · ${n(Q.oportunidades)} oportunidades lidas pela IA${Q.aguardando_ia ? ` · ${n(Q.aguardando_ia)} aguardando a IA` : ""}`);

  const op = Q.oportunidades || 0;
  const passo = (r, v, base, filtro, titulo, sub = false) => `<button type="button" class="passo ${sub ? "sub" : ""}" data-filtro="${esc(filtro)}" data-titulo="${esc(titulo)}">
    <span class="r">${esc(r)}</span>${medidor(pct(v, base))}<span class="v">${n(v)}</span><span class="s">${fmtPct(pct(v, base))}</span></button>`;
  const blocoPassos = `<section class="painel"><header class="painel-topo"><h2>Passos do atendimento</h2>
      <p class="suave">Das oportunidades de serviço, quantas tiveram cada passo, pela leitura da IA (sim ou não, com o trecho que comprova). Clique pra ver quem ficou sem o passo.</p></header>
    <div class="passos-lista">
      ${passo("Oportunidades de serviço", op, op, "oportunidades", "Oportunidades de serviço")}
      ${passo("Entendeu o caso (pediu foto, perguntou)", Q.entendeu, op, "sem_entendeu", "Não procurou entender o caso")}
      ${passo("Passou preço", Q.passou_preco, op, "passou_preco", "Receberam preço")}
      ${passo("explicou o que está incluso", Q.incluso, Q.passou_preco, "sem_incluso", "Passou preço sem explicar o que está incluso", true)}
      ${passo("Falou dos diferenciais", Q.diferencial, op, "sem_diferencial", "Não falou de nenhum diferencial")}
      ${passo("Chamou pra trazer a peça", Q.convite, op, "sem_convite", "Não chamou pra loja")}
      ${passo("Compromisso firmado (dia combinado)", Q.compromisso, op, "sem_compromisso", "Sem compromisso firmado")}
      ${passo("relembrou (data já passou)", Q.relembrou, Q.relembrou_aplicavel, "nao_relembrou", "Não relembrou o compromisso", true)}
    </div>
    <div class="linhas">
      ${linha({ r: "Modo balcão: respondeu e não levou pra loja", v: n(Q.balcao), s: fmtPct(pct(Q.balcao, op)), cls: Q.balcao ? "ruim" : "", filtro: "balcao", titulo: "Modo balcão: respondeu e não levou pra loja" })}
      ${linha({ r: "Tempo até o preço (mediana, loja aberta)", v: fmtMin(Q.tempo_ate_preco_mediana_min) })}
      ${linha({ r: "Compromissos com data ainda por vir", v: n(Q.relembrou_aguardando) })}
      ${linha({ r: "Aguardando a leitura da IA", v: n(Q.aguardando_ia), filtro: "aguardando_ia", titulo: "Aguardando a leitura da IA" })}
    </div></section>`;

  const serv = Object.entries(Q.servicos || {}).sort((a, b) => b[1] - a[1]);
  const totalServ = serv.reduce((s, [, v]) => s + v, 0);
  const blocoTipos = painel("Do que se trata", "Tipo de cada conversa e a peça ou serviço, pela leitura da IA.", [
    linha({ r: "Atendimentos que o cliente começou e a loja respondeu", v: n(Q.atendimentos) }),
    linha({ r: "Oportunidade de serviço", v: n(Q.oportunidades), s: fmtPct(pct(Q.oportunidades, Q.analisados)), filtro: "oportunidades" }),
    linha({ r: "Peça já na loja (andamento, retirada)", v: n(Q.acompanhamento), s: fmtPct(pct(Q.acompanhamento, Q.analisados)), filtro: "acompanhamento", titulo: "Peça já na loja" }),
    linha({ r: "cliente teve que perguntar se estava pronta", v: n(Q.cobrou_status), cls: Q.cobrou_status ? "ruim" : "", filtro: "cobrou_status", titulo: "Cliente perguntou se a peça estava pronta", sub: true }),
    linha({ r: "Outro assunto (fornecedor, engano)", v: n(Q.outros), filtro: "outros", titulo: "Outro assunto" }),
    ...serv.map(([k, v]) => linha({ r: SERVICOS[k] || k, v: n(v), s: fmtPct(pct(v, totalServ)), sub: true })),
  ], serv.length ? "Serviços contam oportunidades e peças já na loja." : "");

  const respMeta = pct(R.ate_meta, R.atendimentos);
  const ret = pct(T.com_retorno, T.cliente_sumiu);
  const aud = pct(F.audio, F.mensagens);
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
        ${linha({ r: "Em áudio", v: fmtPct(aud), s: `limite ${m.audio_max_pct}%`, cls: aud === null ? "" : aud <= m.audio_max_pct ? "bom" : "ruim", filtro: "com_audio", titulo: "Atendimentos com áudio da loja" })}
        ${linha({ r: "Duração média do áudio", v: F.audio_media_seg ? F.audio_media_seg + " s" : "–", s: F.audio_total_min ? `${n(F.audio_total_min)} min no total` : "" })}
        ${linha({ r: "Atendimentos em que a loja só mandou áudio", v: n(F.atendimentos_so_audio), s: `de ${n(F.atendimentos_com_loja)}`, filtro: "so_audio" })}
      </div></section>`;

  const semLeitura = !L.com_leitura;
  $("#blocos").innerHTML = [
    blocoPassos,
    blocoTipos,
    painel("Primeira resposta", "Atendimentos que o cliente começou. Conta só os minutos com a loja aberta: mensagem às 23h respondida às 10h05 vale 5 min.", [
      linha({ r: "Atendimentos que o cliente começou", v: n(R.atendimentos), filtro: "atendimentos" }),
      linha({ r: "Respondidos", v: n(R.respondidos), s: fmtPct(pct(R.respondidos, R.atendimentos)), filtro: "respondidos" }),
      linha({ r: "Sem resposta até agora", v: n(R.sem_resposta), cls: R.sem_resposta ? "ruim" : "", filtro: "sem_resposta" }),
      linha({ r: `Respondidos em até ${m.primeira_resposta_min} min`, v: n(R.ate_meta), s: fmtPct(respMeta), filtro: "ate_meta" }),
      linha({ r: "Esperaram mais de 24h (ou ainda esperam)", v: n(R.acima_24h), cls: R.acima_24h ? "ruim" : "", filtro: "acima_24h" }),
      linha({ r: "Mediana em tempo corrido", v: fmtMin(R.mediana_corrida_min) }),
      linha({ r: "9 em cada 10 respondidos em até", v: fmtMin(R.p90_util_min), s: "loja aberta" }),
      linha({ r: "Chegaram com a loja fechada", v: n(R.fora_horario?.atendimentos), filtro: "fora_horario", titulo: "Chegaram com a loja fechada" }),
      linha({ r: "resposta depois de abrir (mediana)", v: fmtMin(R.fora_horario?.mediana_util_min), sub: true }),
      linha({ r: "Vindos de anúncio", v: n(R.anuncio?.atendimentos), filtro: "anuncio" }),
      linha({ r: `respondidos em até ${m.primeira_resposta_min} min`, v: n(R.anuncio?.ate_meta), s: fmtPct(pct(R.anuncio?.ate_meta, R.anuncio?.atendimentos)), sub: true }),
    ]),
    painel("Durante a conversa", "Cada vez que o cliente volta a perguntar depois da primeira resposta.", [
      linha({ r: "Vezes que o cliente esperou a loja", v: n(D.pendencias) }),
      linha({ r: "Mediana da espera (loja aberta)", v: fmtMin(D.mediana_util_min), cls: D.mediana_util_min == null ? "" : D.mediana_util_min <= m.primeira_resposta_min ? "bom" : "ruim" }),
      linha({ r: "Mediana em tempo corrido", v: fmtMin(D.mediana_corrida_min) }),
      linha({ r: "Ficaram sem resposta (mais de 1h)", v: n(D.sem_resposta), cls: D.sem_resposta ? "ruim" : "" }),
    ], "Não conta \"ok\", \"obrigada\", emoji e figurinha, que não pedem resposta."),
    painel("Retorno de orçamento (follow-up)", "Orçamento é mensagem da loja com valor em reais. Retorno é a loja voltar a chamar sem o cliente ter respondido.", [
      linha({ r: "Orçamentos enviados", v: n(T.orcamentos), filtro: "com_preco", titulo: "Atendimentos com preço" }),
      linha({ r: "Cliente respondeu em até 24h", v: n(T.cliente_respondeu) }),
      linha({ r: "Cliente sumiu", v: n(T.cliente_sumiu), filtro: "orcamento_sumiu", titulo: "Orçamentos em que o cliente sumiu" }),
      linha({ r: "Loja voltou a chamar", v: n(T.com_retorno), s: fmtPct(ret), cls: ret === null ? "" : ret >= m.retorno_pct ? "bom" : "ruim", filtro: "orcamento_com_retorno", titulo: "Orçamentos com retorno da loja" }),
      linha({ r: "até o dia seguinte (D+1)", v: n(T.retorno_ate_d1), s: fmtPct(pct(T.retorno_ate_d1, T.cliente_sumiu)), sub: true }),
      linha({ r: "até 3 dias (D+3)", v: n(T.retorno_ate_d3), s: fmtPct(pct(T.retorno_ate_d3, T.cliente_sumiu)), sub: true }),
      linha({ r: "até 7 dias (D+7)", v: n(T.retorno_ate_d7), s: fmtPct(pct(T.retorno_ate_d7, T.cliente_sumiu)), sub: true }),
      linha({ r: "Sem retorno nenhum", v: n(T.sem_retorno), cls: T.sem_retorno ? "ruim" : "", filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" }),
    ]),
    painel("Viu e não respondeu", "Usa o aviso de leitura do celular da loja. Separa \"não deu tempo de ver\" (falta de gente) de \"viu e deixou pra depois\" (processo).", [
      linha({ r: "Esperas com aviso de leitura", v: n(L.com_leitura), s: `de ${n(L.pendencias)}` }),
      linha({ r: "Abriu e levou mais de 30 min pra responder (ou não respondeu)", v: n(L.viu_sem_responder), cls: L.viu_sem_responder ? "ruim" : "", filtro: "viu_sem_responder" }),
      linha({ r: "Mediana entre abrir e responder", v: fmtMin(L.mediana_ver_responder_util_min), s: "loja aberta" }),
    ], semLeitura && c.mensagens ? "Sem aviso de leitura no período. Mensagens importadas do WhatsApp Web não têm esse dado." : ""),
    blocoFormato,
    painel("Volume", "", [
      linha({ r: "Atendimentos que o cliente começou", v: n(V.atendimentos), filtro: "atendimentos" }),
      linha({ r: "vindos de anúncio", v: n(V.de_anuncio), s: fmtPct(pct(V.de_anuncio, V.atendimentos)), filtro: "anuncio", sub: true }),
      linha({ r: "de quem já tinha falado antes", v: n(V.recorrentes), s: fmtPct(pct(V.recorrentes, V.atendimentos)), sub: true }),
      linha({ r: "Contatos diferentes", v: n(V.contatos) }),
      linha({ r: "Mensagens por atendimento (média)", v: V.msgs_por_atendimento == null ? "–" : String(V.msgs_por_atendimento).replace(".", ",") }),
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

// Passos que valem pra um atendimento: [nome, feito, trecho da conversa ou explicação, é explicação]
function checklistDe(a, m) {
  const p = [];
  if (!a.iniciado_pela_loja) {
    p.push([`Respondeu em até ${m.primeira_resposta_min} min`, a.resposta_em != null && a.util_min <= m.primeira_resposta_min,
      a.resposta_em ? `1ª resposta em ${fmtMin(a.util_min)} com a loja aberta (${fmtMin(a.corrido_min)} corridos)` : "sem resposta", true]);
  }
  if (a.tipo !== "oportunidade") return p;
  p.push(["Entendeu o caso", !!a.entendeu, a.trecho_entendeu]);
  if (a.passou_preco) p.push(["Explicou o que está incluso", !!a.incluso, a.trecho_incluso]);
  p.push(["Falou de diferencial", !!a.diferencial, a.trecho_diferencial]);
  p.push(["Chamou pra trazer a peça", !!a.chamou_loja, a.trecho_convite]);
  p.push(["Firmou compromisso", !!a.marcou_dia, [a.trecho_dia, a.data_compromisso ? `dia ${fmtDataCurta(a.data_compromisso)}` : ""].filter(Boolean).join(" · ")]);
  if (a.marcou_dia && (a.relembrou === "sim" || a.relembrou === "nao")) p.push(["Relembrou o compromisso", a.relembrou === "sim", a.trecho_relembrou]);
  if (a.orcamento_sumiu) p.push(["Retorno do orçamento", !!a.retorno, a.retorno ? `em ${String(a.retorno_dias).replace(".", ",")} dia(s)` : "cliente sumiu e a loja não voltou a chamar", true]);
  return p;
}

async function abrirLista(filtro, titulo) {
  abrirGaveta(titulo || "Atendimentos", `<p class="vazio-msg">Carregando…</p>`);
  const linhas = await rpc("atendimento_lista", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate, p_filtro: filtro });
  const m = metas();
  const corpo = linhas.length ? linhas.map((a) => {
    const selos = [];
    if (a.de_anuncio) selos.push(`<span class="selo ambar">anúncio</span>`);
    if (a.recrutamento) selos.push(`<span class="selo">vaga</span>`);
    if (a.tipo && a.tipo !== "oportunidade") selos.push(`<span class="selo">${esc(TIPOS[a.tipo] || a.tipo)}</span>`);
    if (!a.iniciado_pela_loja) {
      if (a.resposta_em) selos.push(`<span class="selo ${a.util_min <= m.primeira_resposta_min ? "bom" : "ruim"}">1ª resposta ${esc(fmtMin(a.util_min))}</span>`);
      else selos.push(`<span class="selo ruim">sem resposta</span>`);
    } else selos.push(`<span class="selo">loja começou</span>`);
    if (a.tipo === "oportunidade") {
      const passos = checklistDe(a, m), feitos = passos.filter((p) => p[1]).length;
      selos.push(`<span class="selo ${feitos === passos.length ? "bom" : feitos * 2 >= passos.length ? "ambar" : "ruim"}">${feitos} de ${passos.length} passos</span>`);
      if (a.chamou_loja === false && a.marcou_dia === false) selos.push(`<span class="selo ruim">modo balcão</span>`);
      if (a.servico && SERVICOS[a.servico]) selos.push(`<span class="selo">${esc(SERVICOS[a.servico])}</span>`);
    } else {
      if (a.preco) selos.push(`<span class="selo">preço</span>`);
      if (a.orcamento_sumiu) selos.push(a.retorno ? `<span class="selo bom">retorno em ${esc(String(a.retorno_dias).replace(".", ","))} d</span>` : `<span class="selo ruim">sem retorno</span>`);
    }
    if (a.cobrou_status) selos.push(`<span class="selo ruim">perguntou se estava pronto</span>`);
    if (a.msgs_loja > 0 && a.audios_loja === a.msgs_loja) selos.push(`<span class="selo">só áudio</span>`);
    if (a.viu_sem_responder) selos.push(`<span class="selo ruim">viu e não respondeu</span>`);
    return `<button type="button" class="item" data-contato="${esc(a.contato)}" data-inicio="${esc(a.inicio)}" data-fim="${esc(a.fim)}" data-resumo="${esc(JSON.stringify(a))}">
      <div class="cab"><span class="quem">${esc(fmtContato(a.contato, a.nome))}</span><span class="quando">${esc(fmtDataHora(a.inicio))}</span></div>
      <div class="selos">${selos.join("")}</div>
      <div class="txt">${a.msgs_cliente} msg do cliente · ${a.msgs_loja} da loja</div></button>`;
  }).join("") : `<p class="vazio-msg">Nenhum atendimento nesse filtro no período.</p>`;
  $("#gaveta-conteudo").innerHTML = `<p class="suave" style="font-size:12.5px;padding:4px 0 8px">${linhas.length} atendimento(s) · ${periodoTxt()}${linhas.length >= 500 ? " · mostrando os 500 mais recentes" : ""}</p>${corpo}`;
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
      const a = JSON.parse(resumoTxt);
      const passos = checklistDe(a, m);
      const partes = [];
      if (a.tipo) partes.push(`<div class="suave">Leitura da IA: ${esc(TIPOS[a.tipo] || a.tipo)}${a.servico && SERVICOS[a.servico] ? " · " + esc(SERVICOS[a.servico]) : ""}${a.ia_atualizada ? "" : " · teve mensagem nova depois da última leitura"}</div>`);
      else if (!a.iniciado_pela_loja && a.msgs_loja > 0) partes.push(`<div class="suave">A IA ainda não leu este atendimento com o checklist.</div>`);
      for (const [nomePasso, feito, trecho, explicacao] of passos) {
        const det = !trecho ? "" : explicacao ? `<span class="explica">${esc(trecho)}</span>` : `<q>${esc(trecho)}</q>`;
        partes.push(`<div class="passo-check ${feito ? "bom" : "ruim"}"><span>${feito ? "✓" : "✗"}</span><div><strong>${esc(nomePasso)}</strong>${det}</div></div>`);
      }
      if (partes.length) topo = `<div class="resumo-atend">${partes.join("")}</div>`;
    } catch { /* resumo opcional */ }
  }
  let html = "", diaAtual = "", esperaDesde = null, marcado = false;
  const ini = inicio ? new Date(inicio).getTime() : null, fimT = fim ? new Date(fim).getTime() : null;
  for (const x of msgs) {
    if (x.tipo === "reacao") continue;
    const dia = fmtDia(x.enviada_em);
    if (dia !== diaAtual) { html += `<div class="dia">${esc(dia)}</div>`; diaAtual = dia; }
    const t = new Date(x.enviada_em).getTime();
    if (!x.de_loja && esperaDesde === null) esperaDesde = t;
    if (x.de_loja && esperaDesde !== null && !x.automatica) {
      const min = (t - esperaDesde) / 60000;
      const cls = min <= m.primeira_resposta_min ? "bom" : min <= m.primeira_resposta_min * 4 ? "atencao" : "ruim";
      html += `<div class="espera ${cls}">loja respondeu em ${esc(fmtMin(min))} (corrido)</div>`;
      esperaDesde = null;
    }
    const fora = ini && (t < ini || t > fimT) ? ' style="opacity:.45"' : "";
    let ancora = "";
    if (ini && !marcado && t >= ini) { ancora = ' id="inicio-atend"'; marcado = true; }
    let corpo = "";
    if (x.tipo === "texto") corpo = esc(x.texto);
    else if (x.tipo === "audio") {
      corpo = `<span class="midia">🎤 áudio de ${x.audio_segundos ?? "?"} s</span>`;
      if (x.transcricao) corpo += `\n${esc(x.transcricao)}`;
      else if (x.transcricao_status === "pendente") corpo += `\n<span class="midia">transcrição pendente</span>`;
      else if (x.transcricao_status === "erro") corpo += `\n<span class="midia">não foi possível transcrever</span>`;
    } else if (x.tipo === "imagem") {
      corpo = `<span class="midia">📷 foto</span>${x.texto ? "\n" + esc(x.texto) : ""}`;
      if (x.transcricao) corpo += `\n<span class="midia">o que aparece: ${esc(x.transcricao)}</span>`;
      else if (x.transcricao_status === "pendente") corpo += `\n<span class="midia">descrição pendente</span>`;
    } else corpo = `<span class="midia">(${esc(x.tipo)})</span>${x.texto ? "\n" + esc(x.texto) : ""}`;
    if (x.anuncio) corpo = `<span class="midia">veio do anúncio${x.anuncio.titulo ? ": " + esc(x.anuncio.titulo) : ""}</span>\n` + corpo;
    if (x.automatica) corpo = `<span class="midia">mensagem automática, não conta como resposta</span>\n` + corpo;
    if (x.parcial) corpo += `\n<span class="midia">só a prévia da lista (conversa não aberta na coleta)</span>`;
    const lida = !x.de_loja && x.lida_em ? ` · vista ${esc(fmtHora(x.lida_em))}` : "";
    html += `<div class="msg ${x.de_loja ? "loja" : ""}"${fora}${ancora}>${corpo}<span class="hora">${x.de_loja ? "Loja" : "Cliente"} · ${esc(fmtHora(x.enviada_em))}${lida}</span></div>`;
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
    const selos = [`<span class="selo ${cls}">${esc(fmtMin(x.espera_util_min))} com a loja aberta</span>`];
    if (x.de_anuncio) selos.push(`<span class="selo ambar">anúncio</span>`);
    if (x.primeira) selos.push(`<span class="selo">primeira mensagem</span>`);
    if (x.lida_em) selos.push(`<span class="selo ruim">vista às ${esc(fmtHora(x.lida_em))}</span>`);
    return item(x.contato, x.nome, `há ${esc(fmtMin(x.espera_corrida_min))}`, selos.join(""), x.ultimo_texto);
  });
  const comp = (f.compromissos || []).map((x) => {
    const quando = x.data === f.hoje ? "hoje" : x.data < f.hoje ? "ontem" : "amanhã";
    const selos = [`<span class="selo ${quando === "ontem" ? "ruim" : "ambar"}">${quando}${quando === "ontem" ? ": o cliente veio?" : ""}</span>`];
    if (x.relembrou === "sim") selos.push(`<span class="selo bom">já relembrou</span>`);
    if (x.ultima_loja) selos.push(`<span class="selo">última msg da loja ${esc(fmtDataHora(x.ultima_loja))}</span>`);
    return item(x.contato, x.nome, esc(fmtDataCurta(x.data)), selos.join(""), x.trecho ? `"${x.trecho}"` : "");
  });
  const ret = (f.retornos || []).map((x) => item(x.contato, x.nome, `${esc(String(x.dias).replace(".", ","))} dias`,
    `<span class="selo ambar">${esc(x.etapa)}</span><span class="selo">${x.retornos_feitos} retorno(s) feito(s)</span>`, x.preco ? "Preço: " + x.preco : ""));
  const conv = (f.sem_convite || []).map((x) => item(x.contato, x.nome, esc(fmtDataHora(x.fim)),
    x.de_anuncio ? `<span class="selo ambar">anúncio</span>` : "", x.preco ? "Preço: " + x.preco : ""));
  $("#filas").innerHTML = [
    painel(`Esperando resposta agora (${esp.length})`, "Cliente falou por último e a loja ainda não respondeu (últimos 7 dias). Mais antigos primeiro.", [lista(esp, "Ninguém esperando.")]),
    painel(`Compromissos pra lembrar (${comp.length})`, "Dia combinado pra trazer a peça, pela leitura da IA de madrugada. Hoje e amanhã: lembrar o cliente. Ontem: confirmar se veio e remarcar se não veio.", [lista(comp, "Nenhum compromisso entre ontem e amanhã (ou a IA ainda não leu).")]),
    painel(`Retornos de orçamento pra hoje (${ret.length})`, "Receberam preço, não responderam, e já passou do D+1, D+3 ou D+7 sem a loja voltar a chamar.", [lista(ret, "Nenhum retorno pendente.")]),
    painel(`Oportunidades sem convite pra loja (${conv.length})`, "Últimos 14 dias, pela leitura da IA. Bom pra retomar com convite e dia.", [lista(conv, "Nenhum caso (ou a IA ainda não leu).")]),
  ].join("");
}

// ---------- histórico ----------
const BASE_MANUAL = { rotulo: "Análise manual 01/10 a 10/11", atendimentos: 148, mediana: "~10h*", ate24: "64%*", convite: "0%" };
async function carregarHistorico() {
  $("#historico").innerHTML = `<p class="vazio-msg">Carregando…</p>`;
  const [semanas, atual] = await Promise.all([
    rpc("atendimento_semanas", { p_conta: estado.conta.id }),
    rpc("atendimento_painel", { p_conta: estado.conta.id, p_de: periodo("semana")[0], p_ate: hojeYMD() }),
  ]);
  const td = (v, s) => `<td class="${s || ""}">${v}</td>`;
  const kv = (d, p, k) => d.nota?.pilares?.[p]?.kpis?.[k] || {};
  const linhaSemana = (rot, d, cls = "") => {
    const N = d.nota || {}, V = d.volume || {};
    const pil = PILARES.map((p) => td(fmtNota(N.pilares?.[p.k]?.pontos), faixa(N.pilares?.[p.k]?.pontos) === "vazio" ? "" : faixa(N.pilares?.[p.k]?.pontos))).join("");
    const k = (p, kk, un) => { const K = kv(d, p, kk); return td(fmtKpi(K.valor, un), clsPontos(K.pontos)); };
    return `<tr class="${cls}"><td>${rot}</td>${td(N.valor == null ? "–" : `<span class="chip-nota ${faixa(N.valor)}">${fmtNota(N.valor)}</span>`)}${pil}
      ${td(n(V.atendimentos))}${k("agilidade", "primeira_resposta", "min")}${k("agilidade", "respondidas_24h", "%")}
      ${k("conducao", "convite", "%")}${k("compromisso", "compromisso", "%")}${k("retorno", "retorno", "%")}${k("formato", "audio", "%")}</tr>`;
  };
  let html = `<table class="hist"><thead><tr><th>Semana</th><th>Nota</th>${PILARES.map((p) => `<th>${esc(p.nome)}</th>`).join("")}
    <th>Atendimentos</th><th>1ª resposta</th><th>Em até 24h</th><th>Chamou pra loja</th><th>Compromisso</th><th>Retorno</th><th>Áudio</th></tr></thead><tbody>`;
  html += linhaSemana(`Semana atual (desde ${fmtDataCurta(periodo("semana")[0])})`, atual, "atual");
  for (const s of semanas) html += linhaSemana(`${fmtDataCurta(s.semana)} a ${fmtDataCurta(somaDias(s.semana, 6))}${s.metricas.semana_parcial ? " (parcial)" : ""}`, s.metricas);
  if (estado.conta.slug === "sapataria-nacoes") {
    const b = BASE_MANUAL;
    html += `<tr><td>${b.rotulo}</td><td>–</td>${PILARES.map(() => "<td>–</td>").join("")}<td>${b.atendimentos}</td><td>${b.mediana}</td><td>${b.ate24}</td><td>${b.convite}</td><td>–</td><td>–</td><td>–</td></tr>`;
  }
  html += `</tbody></table>`;
  const rodapeHist = `${estado.conta.slug === "sapataria-nacoes" ? "* A análise manual mediu tempo corrido, lido no WhatsApp Web, sem os áudios. Serve de referência do \"antes\", não é comparação exata. " : ""}${semanas.length ? "" : "Nenhuma semana fechada ainda: a primeira fecha na terça às 8h."}`;
  if (rodapeHist) html += `<p class="nota" style="margin-top:10px">${rodapeHist}</p>`;
  $("#historico").innerHTML = html;
}

// ---------- como funciona ----------
function desenharRegras() {
  const m = metas(), w = pesos();
  const pisoTxt = (k) => ({ primeira_resposta: `${Math.max(120, m.primeira_resposta_min * 4)} min ou mais`,
    respondidas_24h: `${Math.max(0, Math.min(60, m.resposta_24h_pct - 20))}% ou menos`,
    audio: `${Math.min(100, Math.max(70, m.audio_max_pct + 30))}% ou mais` }[k] || "0%");
  const linhasNota = PILARES.map((p) => p.kpis.map((k, i) => `<tr>${i === 0 ? `<td rowspan="${p.kpis.length}"><strong>${esc(p.nome)}</strong><br><span class="suave">peso ${w[p.k]}</span></td>` : ""}
    <td>${esc(k.nome)}</td><td>${esc(fmtMeta(k, m[META_DO_KPI[k.k]]))}</td><td>${esc(pisoTxt(k.k))}</td></tr>`).join("")).join("");
  $("#regras").innerHTML = `<div class="config">
    <section class="painel largo"><header class="painel-topo"><h2>Como a nota é calculada</h2></header>
      <div class="como">
        <p>A nota vai de 0 a 100 e é da <strong>unidade</strong>, não de uma pessoa. Ela junta cinco partes, cada uma com um peso.</p>
        <p>Cada indicador vale <strong>100 pontos quando bate a meta</strong> e 0 no piso. No meio, é proporcional. A parte é a média dos seus indicadores.</p>
        <p>Indicador com menos de 3 casos no período fica sem nota (1 ou 2 conversas não dizem nada), e a parte sem dado sai da conta: os pesos das outras são redistribuídos.</p>
        <p>Faixas: <span class="chip-nota bom">85+</span> bom · <span class="chip-nota atencao">70 a 84</span> atenção · <span class="chip-nota ruim">abaixo de 70</span> precisa melhorar.</p>
        <p>Toda semana fecha na terça às 8h e a nota dela fica congelada, mesmo se as metas mudarem depois.</p>
      </div>
      <div class="tabela-rolagem"><table class="hist regras-tab"><thead><tr><th>Parte</th><th>Indicador</th><th>Meta (100 pontos)</th><th>Piso (0 ponto)</th></tr></thead>
        <tbody>${linhasNota}</tbody></table></div>
    </section>
    <section class="painel"><header class="painel-topo"><h2>O que a IA confere em cada conversa</h2>
      <p class="suave">Uma vez por dia, de madrugada. A IA não dá opinião: responde sim ou não e copia o trecho da conversa que comprova. Lê texto, áudio transcrito e a descrição das fotos.</p></header>
      <div class="como">
        <p><strong>Tipo:</strong> oportunidade de serviço novo, peça que já está na loja, vaga de emprego ou outro assunto. O checklist abaixo vale só pra oportunidade.</p>
        <p><strong>Entendeu o caso:</strong> pediu foto, perguntou o problema, o tamanho, o material ou a marca antes de passar preço.</p>
        <p><strong>Explicou o que está incluso:</strong> disse o que vai ser feito ou o que acompanha o serviço, além do preço. Conta só pra quem recebeu preço.</p>
        <p><strong>Falou dos diferenciais:</strong> citou um diferencial concreto da loja (garantia, experiência com grife, avaliação sem custo, rapidez).</p>
        <p><strong>Chamou pra trazer a peça:</strong> convidou o cliente a vir ou trazer a peça. Só passar o endereço porque o cliente pediu não conta.</p>
        <p><strong>Compromisso firmado:</strong> ficou combinado um dia ou horário concreto, confirmado pelos dois lados. "Quando puder" não conta.</p>
        <p><strong>Relembrou o compromisso:</strong> a loja voltou a falar pra lembrar ou confirmar a visita. Conta só depois que a data passou.</p>
        <p><strong>Modo balcão:</strong> oportunidade em que a loja respondeu, mas não chamou pra loja nem firmou compromisso.</p>
        <p><strong>Peça já na loja:</strong> marca quando o cliente teve que perguntar se a peça estava pronta, sem a loja ter avisado antes.</p>
      </div></section>
    <section class="painel"><header class="painel-topo"><h2>Como contamos o tempo</h2></header>
      <div class="como">
        <p><strong>Atendimento:</strong> a conversa com um contato. Um novo começa quando a conversa fica 8 dias parada.</p>
        <p><strong>1ª resposta:</strong> da primeira mensagem do cliente até a primeira mensagem da loja, contando só minutos com a loja aberta. Mensagem automática (saudação do anúncio) e reação com emoji não contam como resposta.</p>
        <p><strong>Orçamento:</strong> mensagem da loja com valor em reais, em texto ou em áudio transcrito.</p>
        <p><strong>Retorno (follow-up):</strong> a loja manda nova mensagem 12h ou mais depois do orçamento, sem o cliente ter respondido. D+1 até 36h, D+3 até 84h, D+7 até 180h.</p>
        <p><strong>Recrutamento:</strong> contato que fala de vaga, currículo, emprego ou salário sai de todas as contas.</p>
        <p><strong>Viu e não respondeu:</strong> o celular da loja abriu a mensagem e passou mais de 30 min (loja aberta) sem resposta.</p>
      </div></section>
  </div>`;
}

// ---------- configuração ----------
const METAS_ROTULOS = [
  ["primeira_resposta_min", "1ª resposta até (minutos, loja aberta)"],
  ["resposta_24h_pct", "Respondidos em até 24h (%)"],
  ["entendeu_pct", "Entendeu o caso (%)"],
  ["incluso_pct", "Explicou o que está incluso, de quem recebeu preço (%)"],
  ["diferencial_pct", "Falou dos diferenciais (%)"],
  ["convite_pct", "Chamou pra trazer a peça (%)"],
  ["compromisso_pct", "Compromisso firmado (%)"],
  ["relembrou_pct", "Relembrou o compromisso (%)"],
  ["retorno_pct", "Retorno de orçamento sem resposta (%)"],
  ["audio_max_pct", "Mensagens da loja em áudio, no máximo (%)"],
];

function desenharConfig() {
  const c = estado.conta, r = rede(), m = metas(), w = pesos(), av = estado.avisos || {};
  const [cls, txt] = statusConexao(c);
  const dias = [[1, "Segunda"], [2, "Terça"], [3, "Quarta"], [4, "Quinta"], [5, "Sexta"], [6, "Sábado"], [0, "Domingo"]];
  const h = c.horario || {};
  const linhasHorario = dias.map(([d, nome]) => {
    const v = h[d]; const fechado = !Array.isArray(v);
    return `<span>${nome}</span><input type="time" data-dia="${d}" data-p="0" value="${fechado ? "10:00" : esc(v[0])}" ${fechado ? "disabled" : ""} aria-label="${nome} abre">
      <input type="time" data-dia="${d}" data-p="1" value="${fechado ? "22:00" : esc(v[1])}" ${fechado ? "disabled" : ""} aria-label="${nome} fecha">
      <label class="fechado-lbl"><input type="checkbox" data-fechado="${d}" ${fechado ? "checked" : ""}> fechado</label>`;
  }).join("");
  const metaCampo = ([k, rot]) => `<label for="meta-${k}">${rot}</label><input type="number" id="meta-${k}" data-meta="${k}" min="0" max="${k.endsWith("_pct") ? 100 : 1440}" value="${esc(m[k])}">`;
  const pesoCampo = (p) => `<label for="peso-${p.k}">${esc(p.nome)}</label><input type="number" id="peso-${p.k}" data-peso="${p.k}" min="0" max="100" value="${esc(w[p.k])}">`;
  const aviso = (k) => av[k] ? `${esc(av[k].valor)} <span class="suave">(${esc(haQuanto(av[k].em))})</span>` : `<span class="suave">nenhuma rodada ainda</span>`;
  const lote = estado.ultimoLote;
  const area = (id, valor, rows) => `<textarea id="${id}" rows="${rows}" maxlength="3000">${esc(valor || "")}</textarea>`;

  const secaoRede = `<section class="painel"><header class="painel-topo"><h2>Metas da rede · ${esc(r.nome)}</h2>
      <p class="suave">Valem pras ${contasDaRede().length} unidades, pra comparação ser justa. Semana já fechada não muda.</p></header>
      <div class="grade-metas">${METAS_ROTULOS.map(metaCampo).join("")}</div></section>
    <section class="painel"><header class="painel-topo"><h2>Peso de cada parte na nota</h2>
      <p class="suave">Precisam somar 100. Recomendação: manter fixos por pelo menos três meses, pra evolução ser comparável.</p></header>
      <div class="grade-metas">${PILARES.map(pesoCampo).join("")}<span>Soma</span><strong id="soma-pesos" class="num"></strong></div></section>
    <section class="painel"><header class="painel-topo"><h2>O que a IA precisa saber da loja</h2>
      <p class="suave">A IA usa esses textos pra reconhecer quando a equipe falou dos diferenciais e do que está incluso. Um item por linha.</p></header>
      <label class="campo">Diferenciais da loja${area("txt-diferenciais", r.diferenciais, 6)}</label>
      <label class="campo">O que está incluso nos serviços (ex.: "troca de sola inclui limpeza e hidratação")${area("txt-incluso", r.incluso, 6)}</label>
      <div><button class="btn" type="button" id="btn-salvar-rede">Salvar metas, pesos e textos</button></div>
    </section>`;

  const secaoUnidade = `<section class="painel"><header class="painel-topo"><h2>Horário · ${esc(c.unidade || c.nome)}</h2>
      <p class="suave">Usado pra contar o tempo de resposta só com a loja aberta e pro mapa de calor. Troque a unidade no seletor do topo.</p></header>
      <div class="grade-horario">${linhasHorario}</div>
      <label class="campo" style="margin-top:6px">Mensagens automáticas, uma por linha (saudação do anúncio, ausência). Ficam na conversa, mas não contam como resposta.
        <textarea id="textos-auto" rows="3">${esc((c.textos_automaticos || []).join("\n"))}</textarea></label>
      <div><button class="btn" type="button" id="btn-salvar-unidade">Salvar horário e mensagens automáticas</button></div>
    </section>`;

  const secaoAdmin = ehAdmin() ? `<section class="painel"><header class="painel-topo"><h2>Conexão com a NeoGo · ${esc(c.unidade || c.nome)}</h2>
      <p class="suave">O sistema só escuta. Não existe envio de mensagem por aqui.</p></header>
      <div class="linhas">
        ${linha({ r: "Situação", v: `<span class="status ${cls}">${esc(txt)}</span>` })}
        ${linha({ r: "Instância", v: c.instance_id ? esc(c.instance_nome || c.instance_id) : "nenhuma ainda" })}
        ${linha({ r: "Mensagens guardadas", v: n(c.mensagens), s: c.primeira_mensagem_em ? "desde " + esc(fmtDataHora(c.primeira_mensagem_em, true)) : "" })}
        ${c.importadas ? linha({ r: "importadas do WhatsApp Web (coleta manual)", v: n(c.importadas), sub: true }) : ""}
        ${linha({ r: "Último evento recebido", v: esc(c.ultimo_evento_tipo || "–"), s: c.ultimo_evento_em ? esc(haQuanto(c.ultimo_evento_em)) : "" })}
      </div>
      <label class="campo">Endereço do webhook desta unidade (funciona como senha, não compartilhe)
        <div class="copiar"><input type="text" readonly value="${esc(c.webhook)}" id="webhook"><button class="btn-fantasma" type="button" id="btn-copiar">Copiar</button></div></label>
      <ol class="passos">
        <li>Conecte o WhatsApp da unidade na NeoGo lendo o QR code com o celular da loja.</li>
        <li>Na instância, abra os webhooks e use um <strong>slot livre</strong>. Se já tiver um slot apontando pro n8n, não mexa nele.</li>
        <li>Cole o endereço acima, marque os eventos <code>Message</code> e <code>Receipt</code> (ou todos) e ative.</li>
        <li>Mande uma mensagem de outro número pra loja e responda pelo celular. Em até 1 minuto a situação muda pra "Recebendo".</li>
      </ol>
      <p class="nota">A primeira instância que mandar evento fica presa a esta unidade. Cada unidade tem o próprio endereço.</p>
    </section>
    <section class="painel"><header class="painel-topo"><h2>OpenAI (áudios, fotos e leitura da IA)</h2>
      <p class="suave">Áudio transcrito e foto descrita assim que chegam. Checklist em lote, uma vez por dia, às 4h.</p></header>
      <div class="linhas">
        ${linha({ r: "Áudios e fotos", v: aviso("transcricao") })}
        ${linha({ r: "Aguardando / com falha nesta unidade", v: `${n(c.midias_pendentes)} / ${n(c.midias_erro)}` })}
        ${linha({ r: "Leitura da IA", v: aviso("ia") })}
        ${linha({ r: "Último lote", v: lote ? esc(`${lote.status} (${lote.itens} itens)`) : "nenhum", s: lote ? esc(fmtDataHora(lote.criado_em)) : "" })}
      </div>
      <ol class="passos">
        <li>Crie a chave em <code>platform.openai.com</code> → API keys.</li>
        <li>No Supabase do CRM: Edge Functions → Secrets → adicionar <code>OPENAI_API_KEY</code> com a chave.</li>
        <li>Pronto: áudios e fotos começam a ser lidos em até 5 minutos e o primeiro lote sai às 4h.</li>
      </ol>
    </section>
    <section class="painel usuarios"><header class="painel-topo"><h2>Quem acessa</h2>
      <p class="suave">Dono da rede vê as unidades e ajusta metas. Equipe vê só a própria unidade, sem configuração. Conta que já existe (gestor, CRM) só ganha o acesso, sem trocar a senha.</p></header>
      <div id="lista-usuarios"><p class="vazio-msg">Carregando…</p></div>
      <form id="form-usuario" class="form-grade">
        <h3>Liberar ou alterar acesso</h3>
        <label class="campo">Nome<input type="text" id="u-nome" maxlength="200" required></label>
        <label class="campo">E-mail<input type="email" id="u-email" maxlength="200" required></label>
        <label class="campo">Senha inicial (só pra conta nova, mínimo 8)<input type="text" id="u-senha" autocomplete="off" minlength="8"></label>
        <label class="campo">Tipo de acesso<select id="u-papel">
          <option value="unidade">Equipe da unidade</option><option value="rede">Dono da rede (${esc(r.nome)})</option><option value="admin">Administrador (The New Ads)</option></select></label>
        <fieldset id="u-contas" class="campo"><legend>Unidades</legend>${estado.contas.map((x) => `<label class="check"><input type="checkbox" value="${esc(x.id)}"> ${esc(x.unidade || x.nome)}</label>`).join("")}</fieldset>
        <div><button class="btn" type="submit" id="btn-salvar-usuario">Salvar acesso</button></div>
        <p class="erro" id="erro-usuario" role="alert"></p>
      </form>
    </section>` : "";

  $("#config").innerHTML = `<div class="config">${secaoRede}${secaoUnidade}${secaoAdmin}</div>`;

  const atualizarSoma = () => {
    const s = $$("[data-peso]").reduce((t, i) => t + (Number(i.value) || 0), 0);
    const el = $("#soma-pesos"); el.textContent = s; el.className = "num " + (s === 100 ? "bom" : "ruim");
  };
  $$("[data-peso]").forEach((i) => i.addEventListener("input", atualizarSoma)); atualizarSoma();
  $$("[data-fechado]").forEach((cb) => cb.addEventListener("change", () => {
    $$(`input[type=time][data-dia="${cb.dataset.fechado}"]`).forEach((i) => { i.disabled = cb.checked; });
  }));
  $("#btn-salvar-rede").addEventListener("click", salvarRede);
  $("#btn-salvar-unidade").addEventListener("click", salvarUnidade);
  if (ehAdmin()) {
    $("#btn-copiar").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(c.webhook); toast("Endereço copiado."); }
      catch { $("#webhook").select(); toast("Selecionado: copie com Ctrl+C."); }
    });
    const papel = $("#u-papel");
    const mostrarContas = () => { $("#u-contas").hidden = papel.value !== "unidade"; };
    papel.addEventListener("change", mostrarContas); mostrarContas();
    $("#form-usuario").addEventListener("submit", salvarUsuario);
    carregarUsuarios();
  }
}

async function salvarRede() {
  const r = rede();
  const metasNovas = {}, pesosNovos = {};
  $$("[data-meta]").forEach((i) => { metasNovas[i.dataset.meta] = Number(i.value); });
  $$("[data-peso]").forEach((i) => { pesosNovos[i.dataset.peso] = Number(i.value); });
  const btn = $("#btn-salvar-rede"); btn.disabled = true;
  try {
    await rpc("atendimento_salvar_rede", { p_rede: r.id, p_metas: metasNovas, p_pesos: pesosNovos,
      p_diferenciais: $("#txt-diferenciais").value.trim(), p_incluso: $("#txt-incluso").value.trim() });
    await recarregarContas();
    toast("Metas, pesos e textos salvos.");
    desenharConfig();
  } finally { btn.disabled = false; }
}

async function salvarUnidade() {
  const horario = {};
  for (let d = 0; d < 7; d++) {
    const fechado = $(`[data-fechado="${d}"]`).checked;
    horario[d] = fechado ? null : [$(`input[data-dia="${d}"][data-p="0"]`).value, $(`input[data-dia="${d}"][data-p="1"]`).value];
  }
  const textos = $("#textos-auto").value.split("\n").map((t) => t.trim()).filter(Boolean);
  const btn = $("#btn-salvar-unidade"); btn.disabled = true;
  try {
    await rpc("atendimento_salvar_unidade", { p_conta: estado.conta.id, p_horario: horario, p_textos: textos });
    await recarregarContas();
    toast("Horário e mensagens automáticas salvos.");
    desenharConfig();
  } finally { btn.disabled = false; }
}

async function carregarUsuarios() {
  const lista = await rpc("atendimento_usuarios", {});
  const nomeConta = (id) => { const x = estado.contas.find((c) => c.id === id); return x ? x.unidade || x.nome : "unidade removida"; };
  $("#lista-usuarios").innerHTML = `<div class="linhas">${lista.map((u) => `<div class="linha usuario">
      <span class="r"><strong>${esc(u.nome || u.email)}</strong><br><span class="suave">${esc(u.email || "")}</span></span>
      <span class="v">${esc(PAPEIS[u.papel] || u.papel)}${u.papel === "unidade" ? `<br><span class="suave">${esc((u.contas || []).map(nomeConta).join(", "))}</span>` : ""}</span>
      <span class="s">${u.ultimo_acesso ? "entrou " + esc(haQuanto(u.ultimo_acesso)) : "nunca entrou"}
        ${u.eu ? "" : `<br><button type="button" class="link" data-editar="${esc(u.user_id)}">alterar</button> · <button type="button" class="link perigo" data-remover="${esc(u.user_id)}">tirar acesso</button>`}</span>
    </div>`).join("")}</div>`;
  $$("[data-editar]").forEach((b) => b.addEventListener("click", () => {
    const u = lista.find((x) => x.user_id === b.dataset.editar);
    $("#u-nome").value = u.nome || ""; $("#u-email").value = u.email || ""; $("#u-senha").value = "";
    $("#u-papel").value = u.papel; $("#u-papel").dispatchEvent(new Event("change"));
    $$("#u-contas input").forEach((i) => { i.checked = (u.contas || []).includes(i.value); });
    $("#u-nome").focus();
  }));
  $$("[data-remover]").forEach((b) => b.addEventListener("click", async () => {
    const u = lista.find((x) => x.user_id === b.dataset.remover);
    if (!confirm(`Tirar o acesso de ${u.nome || u.email} ao monitor? A conta de login continua existindo.`)) return;
    await rpc("atendimento_usuario_remover", { p_user: u.user_id });
    toast("Acesso retirado."); carregarUsuarios();
  }));
}

async function salvarUsuario(e) {
  e.preventDefault();
  const erro = $("#erro-usuario"); erro.textContent = "";
  const papel = $("#u-papel").value;
  const corpo = { acao: "salvar", nome: $("#u-nome").value.trim(), email: $("#u-email").value.trim(), senha: $("#u-senha").value,
    papel, rede_id: papel === "rede" ? rede().id : null,
    contas: papel === "unidade" ? $$("#u-contas input:checked").map((i) => i.value) : [] };
  if (papel === "unidade" && !corpo.contas.length) { erro.textContent = "Marque pelo menos uma unidade."; return; }
  const btn = $("#btn-salvar-usuario"); btn.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("atendimento-usuarios", { body: corpo });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).erro || msg; } catch { /* sem corpo */ }
      erro.textContent = msg; return;
    }
    toast(data?.conta_nova ? "Conta criada e acesso liberado. Passe o e-mail e a senha inicial pra pessoa." : "Acesso liberado (a pessoa entra com a senha que já usa).");
    $("#form-usuario").reset(); $("#u-papel").dispatchEvent(new Event("change"));
    carregarUsuarios();
  } finally { btn.disabled = false; }
}

// ---------- arranque ----------
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) return mostrarEntrar();
  if (await precisaCodigo()) { mostrarEntrar(""); $("#campo-codigo").hidden = false; return; }
  try { await iniciar(); } catch { /* erro já mostrado */ }
})();
