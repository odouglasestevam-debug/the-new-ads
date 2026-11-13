"use strict";
// Monitor de atendimento por WhatsApp. Só leitura: a tela chama funções do banco que conferem
// o que cada usuário pode ver (admin tudo, dono da rede as unidades dele, equipe só a própria unidade).
// Visual: identidade da Sapataria do Futuro. Cada pilar da nota tem uma cor fixa (classe p-agi, p-con...).

const SUPABASE_URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const estado = { perfil: null, redes: [], contas: [], avisos: {}, ultimoLote: null, conta: null,
  preset: "30", de: null, ate: null, dados: null, lista: null, aba: null, timerAgora: null, pilha: [],
  acoes: new Map(), graficos: new Map(), seq: 0, pedidoGeral: 0, pedidoRede: 0 };

const guardar = (k, v) => { try { localStorage.setItem("atd:" + k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const lerGuardado = (k, padrao) => { try { const v = localStorage.getItem("atd:" + k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } };

// ---------- ícones (traço único, 24x24) ----------
const ICONES = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  alerta: '<path d="M12 4.2l8.6 15.3H3.4z"/><path d="M12 10v4.2M12 17.1v.2"/>',
  menos: '<path d="M6.5 12h11"/>',
  seta: '<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>',
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11v5.4M12 7.9v.2"/>',
  relogio: '<circle cx="12" cy="12" r="8.8"/><path d="M12 7.2V12l3.2 2"/>',
  mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/>',
  camera: '<path d="M3.5 8h3.2l1.6-2.6h7.4L17.3 8h3.2v11.5h-17z"/><circle cx="12" cy="13.3" r="3.4"/>',
  olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  anuncio: '<path d="M4 10v4h3.5L14 18V6l-6.5 4z"/><path d="M17.5 9.2a4 4 0 010 5.6"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  copiar: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5V5A1.5 1.5 0 0014 3.5H5A1.5 1.5 0 003.5 5v9A1.5 1.5 0 005 15.5h.5"/>',
  tabela: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10"/>',
  balcao: '<path d="M3.5 10h17M5 10v9.5h14V10M7 10V5.5h10V10"/>',
};
const ic = (nome, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[nome] || ""}</svg>`;

// ---------- definições ----------
const METAS_PADRAO = { primeira_resposta_min: 15, resposta_24h_pct: 95, entendeu_pct: 80, incluso_pct: 70, diferencial_pct: 60,
  convite_pct: 80, compromisso_pct: 50, relembrou_pct: 90, retorno_pct: 80, audio_max_pct: 30 };
const PESOS_PADRAO = { agilidade: 25, conducao: 30, compromisso: 25, retorno: 15, formato: 5 };

const PILARES = [
  { k: "agilidade", c: "agi", nome: "Agilidade", desc: "Responder rápido e não deixar ninguém sem resposta.", kpis: [
    { k: "primeira_resposta", nome: "1ª resposta", detalhe: "mediana, só com a loja aberta", un: "min", menor: true, filtro: "acima_meta", titulo: "1ª resposta acima da meta" },
    { k: "respondidas_24h", nome: "Respondidos em até 24h", un: "%", filtro: "acima_24h", titulo: "Esperaram mais de 24h" }] },
  { k: "conducao", c: "con", nome: "Condução", desc: "Conduzir a conversa em vez de só informar.", kpis: [
    { k: "entendeu", nome: "Entendeu o caso", detalhe: "pediu foto, perguntou o problema", un: "%", ia: true, filtro: "sem_entendeu", titulo: "Não procurou entender o caso" },
    { k: "incluso", nome: "Explicou o que está incluso", detalhe: "de quem recebeu preço", un: "%", ia: true, filtro: "sem_incluso", titulo: "Passou preço sem explicar o que está incluso" },
    { k: "diferencial", nome: "Falou dos diferenciais", un: "%", ia: true, filtro: "sem_diferencial", titulo: "Não falou de nenhum diferencial" },
    { k: "convite", nome: "Chamou pra trazer a peça", un: "%", ia: true, filtro: "sem_convite", titulo: "Não chamou pra loja" }] },
  { k: "compromisso", c: "com", nome: "Compromisso", desc: "Combinar o dia de trazer a peça e lembrar o cliente.", kpis: [
    { k: "compromisso", nome: "Compromisso firmado", detalhe: "dia combinado com o cliente", un: "%", ia: true, filtro: "sem_compromisso", titulo: "Sem compromisso firmado" },
    { k: "relembrou", nome: "Relembrou o compromisso", detalhe: "depois que a data passou", un: "%", ia: true, filtro: "nao_relembrou", titulo: "Não relembrou o compromisso" }] },
  { k: "retorno", c: "ret", nome: "Retorno", desc: "Voltar a chamar quem recebeu preço e sumiu.", kpis: [
    { k: "retorno", nome: "Retorno de orçamento", detalhe: "loja voltou a chamar quem sumiu", un: "%", filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" }] },
  { k: "formato", c: "for", nome: "Formato", desc: "Escrever, em vez de mandar só áudio.", kpis: [
    { k: "audio", nome: "Mensagens da loja em áudio", detalhe: "quanto menos, melhor", un: "%", menor: true, minimo: 10, filtro: "com_audio", titulo: "Atendimentos com áudio da loja" }] },
];
const PILAR = Object.fromEntries(PILARES.map((p) => [p.k, p]));
const META_DO_KPI = { primeira_resposta: "primeira_resposta_min", respondidas_24h: "resposta_24h_pct", entendeu: "entendeu_pct",
  incluso: "incluso_pct", diferencial: "diferencial_pct", convite: "convite_pct", compromisso: "compromisso_pct",
  relembrou: "relembrou_pct", retorno: "retorno_pct", audio: "audio_max_pct" };
// base de cada indicador: [quantidade, o que é]
const BASES = {
  primeira_resposta: (d) => [d.resposta?.respondidos, "atendimentos respondidos"],
  respondidas_24h: (d) => [Math.max(0, (d.resposta?.atendimentos || 0) - (d.resposta?.aguardando || 0)), "atendimentos"],
  entendeu: (d) => [d.qualidade?.oportunidades, "oportunidades"],
  incluso: (d) => [d.qualidade?.passou_preco, "receberam preço"],
  diferencial: (d) => [d.qualidade?.oportunidades, "oportunidades"],
  convite: (d) => [d.qualidade?.oportunidades, "oportunidades"],
  compromisso: (d) => [d.qualidade?.oportunidades, "oportunidades"],
  relembrou: (d) => [d.qualidade?.relembrou_aplicavel, "compromissos com data passada"],
  retorno: (d) => [d.retorno?.cliente_sumiu, "orçamentos sem resposta do cliente"],
  audio: (d) => [d.formato?.mensagens, "mensagens da loja"],
};
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
const fmtDec = (v) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const fmtNota = (v) => (v === null || v === undefined ? "–" : String(Math.round(Number(v))));
const fmtKpi = (v, un) => (v === null || v === undefined ? "–" : un === "min" ? fmtMin(v) : Math.round(Number(v)) + "%");
const fmtMeta = (k, meta) => (meta === null || meta === undefined ? "–" : (k.menor ? "até " : "") + (k.un === "min" ? meta + " min" : meta + "%"));
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, Number(v) || 0));
function fmtDataHora(iso, comAno = false) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), day: "2-digit", month: "2-digit", ...(comAno ? { year: "numeric" } : {}), hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
function fmtHora(iso) { return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); }
function fmtDia(iso) { return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso(), weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso)); }
function fmtDataCurta(ymd) { if (!ymd) return "–"; const [, m, d] = String(ymd).slice(0, 10).split("-"); return `${d}/${m}`; }
const ymdLocal = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: fuso() }).format(new Date(iso));
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
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

// ---------- situação: escala fixa, sempre com ícone e texto ----------
function situacao(p) {
  if (p === null || p === undefined) return { cls: "vaz", txt: "Sem dado", ic: "menos" };
  if (p >= 100) return { cls: "bom", txt: "Na meta", ic: "check" };
  if (p >= 70) return { cls: "ate", txt: "Perto da meta", ic: "alerta" };
  return { cls: "rui", txt: "Longe da meta", ic: "x" };
}
function faixaNota(v) {
  if (v === null || v === undefined) return { cls: "vaz", txt: "Sem nota ainda", ic: "menos" };
  if (v >= 85) return { cls: "bom", txt: "Bom", ic: "check" };
  if (v >= 70) return { cls: "ate", txt: "Atenção", ic: "alerta" };
  return { cls: "rui", txt: "Precisa melhorar", ic: "x" };
}
const chipSit = (s, soIcone = false) => soIcone
  ? `<span class="st st-${s.cls} so-icone" title="${esc(s.txt)}">${ic(s.ic)}<span class="sr">${esc(s.txt)}</span></span>`
  : `<span class="st st-${s.cls}">${ic(s.ic)}${esc(s.txt)}</span>`;

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

// ---------- dica (tooltip): enfeita, nunca é o único jeito de ler o número ----------
const dicaEl = () => $("#dica");
function preencherDica(d) {
  const el = dicaEl(); el.replaceChildren();
  if (d.v !== undefined && d.v !== null && d.v !== "") { const b = document.createElement("b"); b.textContent = d.v; el.append(b); }
  for (const k of ["t", "s"]) if (d[k]) { const sp = document.createElement("span"); sp.textContent = d[k]; el.append(sp); }
  for (const s of d.series || []) {
    const lin = document.createElement("div"); lin.className = "serie";
    const i = document.createElement("i"); i.style.background = s.cor;
    const b = document.createElement("b"); b.textContent = s.v;
    const em = document.createElement("em"); em.textContent = s.nome;
    lin.append(i, b, em); el.append(lin);
  }
}
function posicionarDica(x, y) {
  const el = dicaEl(); const r = el.getBoundingClientRect();
  let left = x + 14, top = y + 16;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  el.style.left = Math.max(8, left) + "px"; el.style.top = Math.max(8, top) + "px";
}
function mostrarDica(d, x, y) { preencherDica(d); dicaEl().hidden = false; posicionarDica(x, y); }
function esconderDica() { dicaEl().hidden = true; }
const dica = (t, v, s) => ` data-dica="${esc(JSON.stringify({ t, v, s }))}"`;
let alvoDica = null;
document.addEventListener("pointerover", (e) => {
  const a = e.target.closest?.("[data-dica]"); if (!a || a === alvoDica) return;
  alvoDica = a; try { mostrarDica(JSON.parse(a.dataset.dica), e.clientX, e.clientY); } catch { /* dica inválida */ }
});
document.addEventListener("pointermove", (e) => { if (alvoDica && !dicaEl().hidden) posicionarDica(e.clientX, e.clientY); });
document.addEventListener("pointerout", (e) => {
  if (alvoDica && !alvoDica.contains(e.relatedTarget)) { alvoDica = null; esconderDica(); }
});
document.addEventListener("focusin", (e) => {
  const a = e.target.closest?.("[data-dica]"); if (!a) return;
  const r = a.getBoundingClientRect(); alvoDica = a;
  try { mostrarDica(JSON.parse(a.dataset.dica), r.left + Math.min(r.width / 2, 120), r.bottom); } catch { /* dica inválida */ }
});
document.addEventListener("focusout", () => { alvoDica = null; esconderDica(); });
window.addEventListener("scroll", () => { if (alvoDica) { alvoDica = null; esconderDica(); } }, { passive: true });

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
  abrirGaveta("Trocar senha", `<div class="cartao"><form id="form-senha" class="form-grade">
    <label class="campo">Nova senha (mínimo 8 caracteres)<input type="password" id="nova-senha" minlength="8" autocomplete="new-password" required></label>
    <label class="campo">Repita a nova senha<input type="password" id="nova-senha-2" minlength="8" autocomplete="new-password" required></label>
    <div><button class="btn" type="submit">Salvar senha</button></div>
    <p class="erro" id="erro-senha" role="alert"></p></form></div>`);
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
  if (r?.logo && logo.getAttribute("src") !== r.logo) logo.src = r.logo;
  logo.alt = r?.nome || "";
  const multi = estado.contas.length > 1;
  $("#nome-conta").textContent = estado.aba === "rede" ? "Visão da rede" : multi ? "Monitor de atendimento" : (c.unidade || c.nome);
  const st = $("#status-conexao");
  if (estado.aba === "rede") { st.className = "status ok"; st.textContent = `${contasDaRede().length} unidades`; }
  else { const [cls, txt] = statusConexao(c); st.className = "status " + cls; st.textContent = multi ? `${c.unidade || c.nome} · ${txt}` : txt; }
  const sel = $("#sel-conta");
  sel.innerHTML = estado.contas.map((x) => `<option value="${esc(x.id)}">${esc(x.unidade || x.nome)}</option>`).join("");
  sel.value = c.id;
  $("#rot-conta").hidden = !multi || estado.aba === "rede";
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
  $$(".abas a").forEach((a) => { a.classList.toggle("ativa", a.dataset.aba === aba); if (a.dataset.aba === aba) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $$(".aba").forEach((s) => { s.hidden = s.id !== "aba-" + aba; });
  $("#barra-periodo").hidden = !["rede", "geral"].includes(aba);
  clearInterval(estado.timerAgora);
  esconderDica();
  if (aba === "rede") carregarRede();
  if (aba === "geral") carregarGeral();
  if (aba === "agora") { carregarAgora(); estado.timerAgora = setInterval(carregarAgora, 60000); }
  if (aba === "historico") carregarHistorico();
  if (aba === "regras") desenharRegras();
  if (aba === "config") desenharConfig();
  window.scrollTo({ top: 0 });
}

// ---------- período ----------
function marcarPeriodo() {
  $$("#chips-periodo button").forEach((b) => { const sim = b.dataset.p === estado.preset; b.classList.toggle("ativo", sim); b.setAttribute("aria-pressed", sim); });
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

// ---------- cliques ----------
function acao(fn) { const id = "a" + (++estado.seq); estado.acoes.set(id, fn); return id; }
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-fechar]")) { fecharGaveta(); return; }
  const rolar = e.target.closest("[data-rolar]");
  if (rolar) { document.getElementById(rolar.dataset.rolar)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const ir = e.target.closest("[data-ir-conta]");
  if (ir) {
    e.preventDefault();
    estado.conta = estado.contas.find((c) => c.id === ir.dataset.irConta) || estado.conta;
    guardar("conta", estado.conta.id);
    irPara("geral", true); return;
  }
  const naGaveta = !!e.target.closest(".gaveta");
  const ac = e.target.closest("[data-acao]");
  if (ac && !naGaveta) { estado.acoes.get(ac.dataset.acao)?.(); return; }
  const f = e.target.closest("[data-filtro]");
  if (f && !naGaveta) { abrirLista(f.dataset.filtro, f.dataset.titulo); return; }
  const conv = e.target.closest("[data-contato]");
  if (conv) abrirConversa(conv.dataset.contato, conv.dataset.inicio || null, conv.dataset.fim || null, conv.dataset.resumo || null);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#gaveta").hidden) fecharGaveta();
  // trechos de gráfico clicáveis que não são <button> respondem a Enter e espaço
  if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute?.("role") === "button" && e.target.tagName !== "BUTTON") { e.preventDefault(); e.target.click(); }
});

// ---------- peças de gráfico ----------
const medidor = (v, cls = "") => `<span class="medidor ${cls}"><i style="width:${v === null || v === undefined ? 0 : clamp(v)}%"></i></span>`;
const cab = (titulo, sub = "") => `<div class="cartao-cab"><h3>${esc(titulo)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div>`;

function numero(rot, valor, sub = "", { filtro, titulo, sit, acaoId } = {}) {
  const tag = filtro || acaoId ? "button" : "div";
  const attrs = filtro ? ` type="button" data-filtro="${esc(filtro)}" data-titulo="${esc(titulo || rot)}"` : acaoId ? ` type="button" data-acao="${acaoId}"` : "";
  return `<${tag} class="numero"${attrs}><span>${esc(rot)}</span><b>${esc(valor)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}${sit ? chipSit(sit) : ""}</${tag}>`;
}

// Barras horizontais alinhadas: ranking (uma cor) ou funil (cor do pilar de cada passo)
function barras(itens, { cor = "var(--neutro)", max } = {}) {
  const topo = max || Math.max(1, ...itens.map((i) => i.v || 0));
  return `<div class="barras">${itens.map((i) => {
    const tag = i.filtro || i.acaoId ? "button" : "div";
    const attrs = i.filtro ? ` type="button" data-filtro="${esc(i.filtro)}" data-titulo="${esc(i.titulo || i.nome)}"` : i.acaoId ? ` type="button" data-acao="${i.acaoId}"` : ` tabindex="0"`;
    const w = topo ? (100 * (i.v || 0)) / topo : 0;
    return `<${tag} class="barra-linha"${attrs}${dica(i.nome, i.dicaV ?? n(i.v), i.dicaS || "")}>
      <span class="bl-nome ${i.sub ? "sub" : ""}">${esc(i.nome)}${i.nota ? `<small>${esc(i.nota)}</small>` : ""}</span>
      <span class="bl-trilho"><i class="${i.v ? "" : "zero"}" style="width:${w}%;background:${i.cor || cor}"></i></span>
      <span class="bl-valor">${esc(i.rotulo ?? n(i.v))}${i.extra ? `<small>${esc(i.extra)}</small>` : ""}</span></${tag}>`;
  }).join("")}</div>`;
}

// Colunas (histograma): valor no topo, rótulo embaixo
function colunas(itens, { altura = 170, unidade = "atendimento(s)" } = {}) {
  const max = Math.max(1, ...itens.map((i) => i.v || 0));
  const total = itens.reduce((s, i) => s + (i.v || 0), 0);
  return `<div class="colunas" style="--alt:${altura}px">${itens.map((i) => {
    const tag = i.acaoId ? "button" : "div";
    const attrs = i.acaoId ? ` type="button" data-acao="${i.acaoId}"` : ` tabindex="0"`;
    return `<${tag} class="coluna"${attrs}${dica(i.rot, `${n(i.v)} ${unidade}`, total ? `${Math.round((100 * (i.v || 0)) / total)}% do total` : "")}>
      <span class="col-plot"><b>${n(i.v)}</b><i style="height:${(100 * (i.v || 0)) / max}%;background:${i.cor}"></i></span>
      <span class="col-rot ${i.meta ? "meta" : ""}">${esc(i.rot)}</span></${tag}>`;
  }).join("")}</div>`;
}

// Barra segmentada alta: um todo dividido em partes (até 6), legenda só com nomes
function segmentada(partes) {
  const total = partes.reduce((s, p) => s + (p.v || 0), 0);
  if (!total) return "";
  const segs = partes.filter((p) => p.v > 0).map((p) => {
    const share = (100 * p.v) / total;
    const attrs = p.acaoId ? ` role="button" data-acao="${p.acaoId}"` : p.filtro ? ` role="button" data-filtro="${esc(p.filtro)}" data-titulo="${esc(p.titulo || p.nome)}"` : "";
    return `<span class="seg" tabindex="0"${attrs} style="flex:${p.v} 1 0;background:${p.cor};color:${p.tinta || "#fff"}"${dica(p.nome, `${n(p.v)} (${Math.round(share)}%)`, p.sub || "")}>${share >= 11 ? Math.round(share) + "%" : ""}</span>`;
  }).join("");
  return `<div class="segmentada">${segs}</div><div class="legenda">${partes.map((p) => `<span><i style="background:${p.cor}"></i>${esc(p.nome)}</span>`).join("")}</div>`;
}

// Gráfico de linha em SVG, desenhado na largura real do cartão (com cruz e dica)
function graficoLinhas(cfg) {
  const id = "g" + (++estado.seq);
  estado.graficos.set(id, cfg);
  return `<div class="linha-graf ${cfg.mini ? "miniatura" : ""}" data-graf="${id}" style="height:${cfg.alt || 230}px"></div>`;
}
const observador = "ResizeObserver" in window ? new ResizeObserver((ents) => {
  for (const en of ents) { const el = en.target; const cfg = estado.graficos.get(el.dataset.graf); if (cfg && Math.abs((+el.dataset.w || 0) - el.clientWidth) > 2) desenharLinha(el, cfg); }
}) : null;
function desenharGraficos() {
  observador?.disconnect();
  for (const el of $$("[data-graf]")) {
    const cfg = estado.graficos.get(el.dataset.graf);
    if (!cfg) continue;
    desenharLinha(el, cfg);
    observador?.observe(el);
  }
}
function desenharLinha(el, cfg) {
  const W = el.clientWidth; if (!W) return;
  el.dataset.w = W;
  const H = cfg.alt || 230, nX = cfg.xs.length;
  const pad = { l: 34, r: cfg.rotFim ? 64 : 14, t: 12, b: 26 };
  const iw = Math.max(10, W - pad.l - pad.r), ih = H - pad.t - pad.b;
  const x = (i) => pad.l + (nX <= 1 ? iw / 2 : (i * iw) / (nX - 1));
  const y = (v) => pad.t + ih - (clamp(v) / 100) * ih;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.rotulo || "")}">`;
  if (cfg.zonas) {
    s += `<rect x="${pad.l}" y="${y(70)}" width="${iw}" height="${y(0) - y(70)}" fill="#fdf0ef"/>`;
    s += `<rect x="${pad.l}" y="${y(85)}" width="${iw}" height="${y(70) - y(85)}" fill="#fdf6e4"/>`;
    s += `<rect x="${pad.l}" y="${y(100)}" width="${iw}" height="${y(85) - y(100)}" fill="#ebf6ef"/>`;
  }
  for (const t of cfg.ticks || [0, 70, 85, 100]) {
    s += `<line class="${t === 0 ? "base-l" : "grade-l"}" x1="${pad.l}" x2="${pad.l + iw}" y1="${y(t)}" y2="${y(t)}"/>`;
    s += `<text x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
  }
  const cabem = Math.max(2, Math.floor(iw / (cfg.mini ? 56 : 64)));
  const passo = Math.max(1, Math.ceil(nX / cabem));
  cfg.xs.forEach((lab, i) => {
    if (i % passo === 0 || i === nX - 1) {
      if (i !== nX - 1 && nX - 1 - i < passo && i % passo === 0 && i !== 0) return;
      s += `<text x="${x(i)}" y="${H - 6}" text-anchor="${nX > 1 && i === 0 ? "start" : nX > 1 && i === nX - 1 ? "end" : "middle"}">${esc(lab)}</text>`;
    }
  });
  for (const se of cfg.series) {
    let d = "", caneta = false, ult = -1;
    se.v.forEach((v, i) => {
      if (v === null || v === undefined) { caneta = false; return; }
      d += `${caneta ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`; caneta = true; ult = i;
    });
    if (d) s += `<path d="${d}" fill="none" stroke="${se.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    se.v.forEach((v, i) => {
      if (v === null || v === undefined) return;
      if (nX <= 14 || i === ult) s += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="${se.cor}" stroke="#fff" stroke-width="2"/>`;
    });
    if (cfg.rotFim && ult >= 0) s += `<text class="rot-fim" x="${(x(ult) + 10).toFixed(1)}" y="${(y(se.v[ult]) + 4).toFixed(1)}">${esc(fmtNota(se.v[ult]))}</text>`;
  }
  s += `<line class="cruz" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>`;
  s += `<rect class="alvo" x="${pad.l - 10}" y="0" width="${iw + 20}" height="${H}" fill="transparent"/></svg>`;
  el.innerHTML = s;
  const svg = el.firstChild, cruz = svg.querySelector(".cruz"), alvo = svg.querySelector(".alvo");
  const mover = (ev) => {
    const r = svg.getBoundingClientRect();
    const i = nX <= 1 ? 0 : Math.round(clamp(((ev.clientX - r.left - pad.l) / iw) * (nX - 1), 0, nX - 1));
    cruz.setAttribute("x1", x(i)); cruz.setAttribute("x2", x(i)); cruz.setAttribute("visibility", "visible");
    mostrarDica({ t: (cfg.xsLongo || cfg.xs)[i], series: cfg.series.map((se) => ({ cor: se.cor, nome: se.nome, v: se.v[i] === null || se.v[i] === undefined ? "–" : fmtNota(se.v[i]) })) }, ev.clientX, ev.clientY);
  };
  alvo.addEventListener("pointermove", mover);
  alvo.addEventListener("pointerdown", mover);
  alvo.addEventListener("pointerleave", () => { cruz.setAttribute("visibility", "hidden"); esconderDica(); });
}
function tabelaGemea(cabecalho, linhas) {
  return `<details class="tabela-twin"><summary>${ic("tabela")}Ver em tabela</summary><div class="tabela-rolagem"><table class="tab">
    <thead><tr>${cabecalho.map((h, i) => `<th class="${i === 0 ? "esq" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((l) => `<tr>${l.map((v, i) => `<td class="${i === 0 ? "esq" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}

// ---------- blocos comuns ----------
function motivoSemDado(p, d) {
  const Q = d?.qualidade || {};
  if ((p.k === "conducao" || p.k === "compromisso") && !Q.analisados) return "A IA ainda não leu as conversas do período.";
  if (p.k === "agilidade") return "Menos de 3 atendimentos respondidos no período.";
  if (p.k === "retorno") return "Menos de 3 orçamentos sem resposta do cliente no período.";
  if (p.k === "formato") return "Menos de 10 mensagens da loja no período.";
  return "Menos de 3 casos no período.";
}
function linhaPilar(p, P = {}, d, { compacto = false, rolar } = {}) {
  const pts = P?.pontos, sem = pts === null || pts === undefined;
  const tag = rolar ? "button" : "div";
  const attrs = rolar ? ` type="button" data-rolar="${rolar}"` : ` tabindex="0"`;
  const peso = P?.peso ?? pesos()[p.k];
  return `<${tag} class="pilar-linha p-${p.c}"${attrs}${dica(`${p.nome} · peso ${n(peso)}%`, sem ? "Sem dado" : `${fmtNota(pts)} de 100`, sem ? motivoSemDado(p, d) : p.desc)}>
    <span class="pl-titulo"><span class="pino"></span><span><strong>${esc(p.nome)}</strong>${compacto ? "" : `<small>peso ${n(peso)}%</small>`}</span></span>
    ${medidor(pts)}
    <span class="pl-pts ${sem ? "sem" : ""}">${sem ? (compacto ? "–" : "sem dado") : fmtNota(pts)}</span></${tag}>`;
}

// Nota: o número no bloco azul-marinho, a composição por pilar ao lado
function blocoNota(d, quem) {
  const N = d.nota || {}, V = d.volume || {}, Q = d.qualidade || {};
  const f = faixaNota(N.valor);
  const parcial = N.valor !== null && N.valor !== undefined && !N.completa;
  const semDado = PILARES.filter((p) => (N.pilares?.[p.k]?.peso || 0) > 0 && (N.pilares?.[p.k]?.pontos === null || N.pilares?.[p.k]?.pontos === undefined));
  const avisos = [];
  if (parcial && semDado.length) avisos.push(`<strong>Nota parcial.</strong> ${esc(semDado.map((p) => p.nome).join(", "))} ainda sem dado: a nota usa só as outras partes, com os pesos redistribuídos.${!Q.analisados && Q.atendimentos ? " A leitura da IA roda de madrugada." : ""}`);
  if (N.amostra_pequena && N.valor !== null && N.valor !== undefined) avisos.push(`<strong>Amostra pequena.</strong> Menos de 10 atendimentos no período: a nota ainda oscila muito.`);
  const pos = N.valor === null || N.valor === undefined ? null : clamp(N.valor);
  return `<div class="nota-bloco">
    <div class="nota-esq">
      <div class="nota-quem"><strong>Nota do atendimento</strong><span>${esc(quem)} · ${esc(periodoTxt())}</span></div>
      <div class="nota-valor ${parcial ? "parcial" : ""}"><b>${fmtNota(N.valor)}</b><small>/100</small></div>
      <div class="nota-sit">${chipSit(f)}${parcial ? `<span class="selo-parcial">${ic("info")}Parcial</span>` : ""}</div>
      <div class="faixa" role="img" aria-label="Nota ${fmtNota(N.valor)} de 100. Abaixo de 70 precisa melhorar, de 70 a 84 atenção, 85 ou mais bom.">
        <div class="faixa-trilho"><span class="z1"></span><span class="z2"></span><span class="z3"></span>${pos === null ? "" : `<span class="faixa-marca" style="left:${pos}%"></span>`}</div>
        <div class="faixa-escala"><span style="left:0">0</span><span style="left:70%">70</span><span style="left:85%">85</span><span style="left:100%">100</span></div>
      </div>
      <div class="nota-contexto"><span><b>${n(V.atendimentos)}</b> atendimentos</span><span><b>${n(Q.oportunidades)}</b> oportunidades lidas pela IA</span>${Q.aguardando_ia ? `<span><b>${n(Q.aguardando_ia)}</b> aguardando a IA</span>` : ""}</div>
    </div>
    <div class="nota-dir">
      <h3>De onde vem a nota</h3>
      <p>Cada pilar vale de 0 a 100 e entra na nota com o seu peso. Clique num pilar pra ver as metas dele.</p>
      ${PILARES.map((p) => linhaPilar(p, N.pilares?.[p.k], d, { rolar: "s-metas" })).join("")}
      ${avisos.length ? `<div class="aviso atencao" style="margin:12px 0 4px">${ic("info")}<div>${avisos.join("<br>")}</div></div>` : ""}
    </div>
  </div>`;
}

function linhaKpi(k, K, d, m) {
  const [base, rotBase] = BASES[k.k](d);
  const sem = K.valor === null || K.valor === undefined;
  const Q = d.qualidade || {};
  let nota;
  if (!sem) nota = `base: ${n(base)} ${rotBase}`;
  else if (k.ia && !Q.analisados) nota = "aguardando a leitura da IA";
  else nota = `sem amostra: ${n(base || 0)} ${rotBase} (mínimo ${k.minimo || 3})`;
  const metaTxt = fmtMeta(k, K.meta ?? m[META_DO_KPI[k.k]]);
  return `<button type="button" class="placar-linha" data-filtro="${esc(k.filtro)}" data-titulo="${esc(k.titulo)}">
    <span class="pl-nome"><strong>${esc(k.nome)}</strong><small>${esc(k.detalhe ? k.detalhe + " · " : "")}${esc(nota)}</small></span>
    <span class="pl-valor">${sem ? "–" : esc(fmtKpi(K.valor, k.un))}</span>
    <span class="pl-meta"><span class="so-cel">meta </span>${esc(metaTxt)}</span>
    <span class="pl-barra">${medidor(K.pontos)}<b>${K.pontos === null || K.pontos === undefined ? "–" : fmtNota(K.pontos)}</b></span>
    <span class="pl-sit">${chipSit(situacao(K.pontos))}</span>
  </button>`;
}

function secaoMetas(d) {
  const N = d.nota || {}, m = metas();
  const grupos = PILARES.map((p) => {
    const P = N.pilares?.[p.k] || {};
    return `<div class="placar-grupo p-${p.c}">
      <div class="placar-pilar"><span class="pino"></span><strong>${esc(p.nome)}</strong><span>${esc(p.desc)}</span>
        <span class="pp-pts">peso ${n(P.peso ?? pesos()[p.k])}% · <b>${P.pontos === null || P.pontos === undefined ? "sem dado" : fmtNota(P.pontos) + " pontos"}</b></span></div>
      ${p.kpis.map((k) => linhaKpi(k, P.kpis?.[k.k] || {}, d, m)).join("")}
    </div>`;
  }).join("");
  return `<section class="secao" id="s-metas">
    <div class="secao-cab"><div><h2>Metas do período</h2><p>Os 10 indicadores que formam a nota, com a meta da rede. Barra cheia é meta batida. Clique num indicador pra ver as conversas que perderam ponto.</p></div></div>
    <div class="cartao placar">
      <div class="placar-cab" aria-hidden="true"><span>Indicador</span><span>Resultado</span><span>Meta</span><span>Pontos (100 = meta)</span><span>Situação</span></div>
      ${grupos}
    </div></section>`;
}

function histogramaEspera(lista, meta) {
  const linhas = lista.filter((a) => !a.iniciado_pela_loja && !a.recrutamento);
  if (!linhas.length) return `<p class="vazio">Nenhum atendimento começado pelo cliente no período.</p>`;
  const faixas = [
    { rot: `até ${meta} min`, max: meta, cor: "var(--az1)", meta: true },
    { rot: `${meta} min a 1h`, max: 60, cor: "var(--az2)" },
    { rot: "1h a 4h", max: 240, cor: "var(--az3)" },
    { rot: "4h a 8h", max: 480, cor: "var(--az4)" },
    { rot: "mais de 8h", max: Infinity, cor: "var(--az5)" },
    { rot: "sem resposta", sem: true, cor: "var(--az6)" },
  ].filter((f, i) => i === 0 || f.sem || f.max > meta).map((f) => ({ ...f, itens: [] }));
  for (const a of linhas) {
    if (!a.resposta_em) { faixas[faixas.length - 1].itens.push(a); continue; }
    (faixas.find((f) => !f.sem && a.util_min <= f.max) || faixas[faixas.length - 2]).itens.push(a);
  }
  return colunas(faixas.map((f) => ({ rot: f.rot, v: f.itens.length, cor: f.cor, meta: f.meta,
    acaoId: f.itens.length ? acao(() => mostrarLinhas(`1ª resposta: ${f.rot}`, f.itens)) : null })), { altura: 232 });
}

function mapaCalor(celulas, meta) {
  const h = estado.conta.horario || {};
  let min = 24, max = 0;
  const fim = (v) => Math.ceil(+v[1].slice(0, 2) + (+v[1].slice(3) > 0 ? 1 : 0));
  for (let i = 0; i < 7; i++) { const v = h[i]; if (Array.isArray(v)) { min = Math.min(min, +v[0].slice(0, 2)); max = Math.max(max, fim(v)); } }
  if (min >= max) return `<p class="vazio">Defina o horário da loja na Configuração pra ver o mapa.</p>`;
  if (!celulas.length) return `<p class="vazio">Ninguém escreveu com a loja aberta no período.</p>`;
  const lim = [meta];
  for (const v of [meta * 2, 60, 120, 240]) lim.push(Math.max(v, lim[lim.length - 1] + 1));
  const classe = (c) => { if (c.mediana_util_min === null) return "q6"; for (let i = 0; i < 5; i++) if (c.mediana_util_min <= lim[i]) return "q" + (i + 1); return "q6"; };
  const curto = (v) => (v === null ? "–" : v < 60 ? Math.round(v) + "'" : fmtMin(v));
  const mapa = new Map(celulas.map((c) => [`${c.dia}-${c.hora}`, c]));
  const dias = [[1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"], [0, "Dom"]];
  const aberto = (dia, hora) => { const v = h[dia]; return Array.isArray(v) && hora >= +v[0].slice(0, 2) && hora < fim(v); };
  let html = `<div class="calor"><table><thead><tr><th></th>`;
  for (let hr = min; hr < max; hr++) html += `<th>${hr}h</th>`;
  html += `</tr></thead><tbody>`;
  for (const [dia, nome] of dias) {
    html += `<tr><th scope="row">${nome}</th>`;
    for (let hr = min; hr < max; hr++) {
      if (!aberto(dia, hr)) { html += `<td class="fechado"></td>`; continue; }
      const c = mapa.get(`${dia}-${hr}`);
      if (!c) { html += `<td class="sem"></td>`; continue; }
      html += `<td class="${classe(c)}" tabindex="0"${dica(`${nome} ${hr}h · mediana da espera`, c.mediana_util_min === null ? "Sem resposta" : fmtMin(c.mediana_util_min), `${c.n} espera(s)${c.sem_resposta ? `, ${c.sem_resposta} sem resposta` : ""}`)}>${esc(curto(c.mediana_util_min))}${c.sem_resposta ? ic("alerta") : ""}</td>`;
    }
    html += `</tr>`;
  }
  const rot = [`até ${lim[0]} min`, `até ${fmtMin(lim[1])}`, `até ${fmtMin(lim[2])}`, `até ${fmtMin(lim[3])}`, `até ${fmtMin(lim[4])}`, "mais ou sem resposta"];
  html += `</tbody></table></div><div class="legenda">${rot.map((r, i) => `<span><i class="q${i + 1}"></i>${esc(r)}</span>`).join("")}
    <span><i style="background:var(--cartao-3)"></i>ninguém escreveu</span><span>${ic("alerta")}teve espera sem resposta</span></div>`;
  return html;
}

function porDia(lista) {
  const linhas = lista.filter((a) => !a.iniciado_pela_loja && !a.recrutamento);
  if (!linhas.length) return `<p class="vazio">Nenhum atendimento no período.</p>`;
  const dias = [];
  for (let d = estado.de; d <= estado.ate && dias.length < 400; d = somaDias(d, 1)) dias.push(d);
  const semanal = dias.length > 62;
  const chave = (ymd) => { if (!semanal) return ymd; const dow = new Date(ymd + "T12:00:00Z").getUTCDay(); return somaDias(ymd, -((dow + 6) % 7)); };
  const grupos = new Map();
  for (const d of dias) { const k = chave(d); if (!grupos.has(k)) grupos.set(k, { k, anuncio: 0, outros: 0, itens: [] }); }
  for (const a of linhas) { const g = grupos.get(chave(ymdLocal(a.inicio))); if (!g) continue; g.itens.push(a); if (a.de_anuncio) g.anuncio++; else g.outros++; }
  const lista2 = [...grupos.values()];
  const maior = Math.max(1, ...lista2.map((g) => g.anuncio + g.outros));
  // topo do eixo num número redondo (1, 2, 5 x 10^n) e três linhas de grade
  const base = 10 ** Math.floor(Math.log10(maior));
  const max = maior <= 10 ? Math.ceil(maior / 2) * 2 : ([1, 2, 2.5, 5, 10].map((k) => k * base).find((v) => v >= maior && Number.isInteger(v / 2)) || maior);
  const grade = [0, max / 2, max].map((v) => `<div class="dias-grade" style="bottom:${(100 * v) / max}%"><span>${n(v)}</span></div>`).join("");
  const passo = Math.max(1, Math.ceil(lista2.length / 8));
  const rotulo = (k) => semanal ? `sem. ${fmtDataCurta(k)}` : `${DIAS_SEMANA[new Date(k + "T12:00:00Z").getUTCDay()]} ${fmtDataCurta(k)}`;
  const cols = lista2.map((g) => {
    const tot = g.anuncio + g.outros;
    const segs = [];
    if (g.outros) segs.push(`<i style="height:${(100 * g.outros) / max}%;background:var(--neutro-2)"></i>`);
    if (g.anuncio) segs.push(`<i style="height:${(100 * g.anuncio) / max}%;background:var(--neutro)"></i>`);
    if (segs.length) segs[0] = segs[0].replace("<i ", '<i class="topo" ');
    const tag = tot ? "button" : "div";
    const attrs = tot ? ` type="button" data-acao="${acao(() => mostrarLinhas(`Atendimentos · ${rotulo(g.k)}`, g.itens))}"` : "";
    return `<${tag} class="dia-col"${attrs}${dica(rotulo(g.k), `${n(tot)} atendimento(s)`, `${n(g.anuncio)} de anúncio · ${n(g.outros)} outros`)}>${segs.join("")}</${tag}>`;
  }).join("");
  const eixo = lista2.map((g, i) => `<span>${i % passo === 0 ? esc(semanal ? fmtDataCurta(g.k) : fmtDataCurta(g.k)) : ""}</span>`).join("");
  return `<div class="dias-area"><div class="dias" style="--alt:150px">${cols}</div><div class="dias-gradeado" aria-hidden="true">${grade}</div></div><div class="dias-eixo">${eixo}</div>
    <div class="legenda"><span><i style="background:var(--neutro)"></i>Vindos de anúncio</span><span><i style="background:var(--neutro-2)"></i>Outros</span></div>`;
}

// ---------- rede ----------
async function carregarRede() {
  marcarPeriodo();
  const alvo = $("#aba-rede"), r = rede();
  if (!alvo.innerHTML) alvo.innerHTML = `<div class="cartao"><p class="vazio">Calculando as unidades…</p></div>`;
  else alvo.classList.add("carregando");
  const pedido = ++estado.pedidoRede;
  try {
    const [lista, semanas] = await Promise.all([
      rpc("atendimento_rede", { p_rede: r.id, p_de: estado.de, p_ate: estado.ate }),
      rpc("atendimento_rede_semanas", { p_rede: r.id }),
    ]);
    if (pedido !== estado.pedidoRede || estado.aba !== "rede") return;
    desenharRede(lista || [], semanas || []);
  } finally { if (pedido === estado.pedidoRede) alvo.classList.remove("carregando"); }
}

function desenharRede(lista, semanas) {
  estado.acoes.clear(); estado.graficos.clear();
  const ord = [...lista].sort((a, b) => (b.calc?.nota?.valor ?? -1) - (a.calc?.nota?.valor ?? -1));
  let pos = 0;
  const cartoes = ord.map((u) => {
    const N = u.calc?.nota || {}, V = u.calc?.volume || {}, Q = u.calc?.qualidade || {};
    const conta = estado.contas.find((c) => c.id === u.conta_id);
    const temNota = N.valor !== null && N.valor !== undefined;
    if (temNota) pos++;
    const parcial = temNota && !N.completa;
    return `<a class="unidade" href="#geral" data-ir-conta="${esc(u.conta_id)}">
      <div class="u-topo">
        <span class="u-pos">${temNota ? pos + "º" : "–"}</span>
        <span class="u-nome">${esc(u.unidade)}<small>${conta && !conta.mensagens ? "sem mensagens ainda" : `${n(V.atendimentos)} atendimentos`}</small></span>
        <span class="u-nota">${fmtNota(N.valor)}<small>/100</small></span>
        <span class="u-sit">${chipSit(faixaNota(N.valor))}${parcial ? `<span class="selo-parcial">Parcial</span>` : ""}</span>
      </div>
      <div class="u-corpo">${PILARES.map((p) => linhaPilar(p, N.pilares?.[p.k], u.calc, { compacto: true })).join("")}</div>
      <div class="u-rodape"><span>${n(Q.oportunidades)} oportunidades lidas pela IA</span><span class="ver">Abrir unidade${ic("seta")}</span></div>
    </a>`;
  }).join("") || `<div class="cartao"><p class="vazio">Nenhuma unidade.</p></div>`;

  const unidades = [...lista].sort((a, b) => a.unidade.localeCompare(b.unidade, "pt-BR"));
  const m = metas();
  const cel = (txt, sit) => `<td><span class="celula">${esc(txt)}${sit ? chipSit(sit, true) : ""}</span></td>`;
  let corpo = `<tr><td class="esq"><strong>Nota</strong></td><td class="suave">85 ou mais</td>${unidades.map((u) => {
    const v = u.calc?.nota?.valor; const f = faixaNota(v);
    return `<td><span class="chip-nota ${f.cls}">${fmtNota(v)}</span></td>`;
  }).join("")}</tr>`;
  for (const p of PILARES) {
    corpo += `<tr class="grupo p-${p.c}"><td colspan="${unidades.length + 2}"><span class="pino"></span>${esc(p.nome)} · peso ${n(pesos()[p.k])}%</td></tr>`;
    for (const k of p.kpis) {
      corpo += `<tr><td class="esq">${esc(k.nome)}</td><td class="suave">${esc(fmtMeta(k, m[META_DO_KPI[k.k]]))}</td>${unidades.map((u) => {
        const K = u.calc?.nota?.pilares?.[p.k]?.kpis?.[k.k] || {};
        return cel(fmtKpi(K.valor, k.un), situacao(K.pontos));
      }).join("")}</tr>`;
    }
  }
  const outros = [
    ["Atendimentos que o cliente começou", (d) => n(d.volume?.atendimentos)],
    ["Oportunidades de serviço lidas pela IA", (d) => n(d.qualidade?.oportunidades)],
    ["Modo balcão (respondeu e não levou pra loja)", (d) => fmtPct(pct(d.qualidade?.balcao, d.qualidade?.oportunidades))],
    ["Tempo até o preço (mediana, loja aberta)", (d) => fmtMin(d.qualidade?.tempo_ate_preco_mediana_min)],
    ["Chegou com a loja fechada: resposta depois de abrir", (d) => fmtMin(d.resposta?.fora_horario?.mediana_util_min)],
    ["Cliente teve que perguntar se a peça estava pronta", (d) => n(d.qualidade?.cobrou_status)],
    ["Mensagens por atendimento", (d) => fmtDec(d.volume?.msgs_por_atendimento)],
  ];
  corpo += `<tr class="grupo p-neu"><td colspan="${unidades.length + 2}"><span class="pino"></span>Outros números (sem meta)</td></tr>`;
  corpo += outros.map(([r, f]) => `<tr><td class="esq">${esc(r)}</td><td class="suave">–</td>${unidades.map((u) => `<td>${esc(f(u.calc || {}))}</td>`).join("")}</tr>`).join("");
  const tabela = `<div class="tabela-rolagem"><table class="tab"><thead><tr><th class="esq">Indicador</th><th>Meta</th>${unidades.map((u) => `<th>${esc(u.unidade)}</th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table></div>`;

  // nota semana a semana: um gráfico pequeno por unidade (sem cor por unidade, a cor fica com os pilares)
  const semanasTodas = [...new Set(semanas.map((s) => s.semana))].sort();
  let evolucao;
  if (semanasTodas.length < 2) {
    evolucao = `<div class="cartao"><p class="vazio">${semanasTodas.length ? "Só uma semana fechada até agora. O gráfico aparece a partir da segunda." : "Nenhuma semana fechada ainda. A primeira fecha na terça às 8h."}</p></div>`;
  } else {
    const xs = semanasTodas.map((s) => fmtDataCurta(s));
    const xsLongo = semanasTodas.map((s) => `Semana de ${fmtDataCurta(s)} a ${fmtDataCurta(somaDias(s, 6))}`);
    evolucao = `<div class="multiplos">${unidades.map((u) => {
      const v = semanasTodas.map((s) => semanas.find((x) => x.semana === s && x.conta_id === u.conta_id)?.nota?.valor ?? null);
      if (v.every((x) => x === null)) return `<div class="cartao multiplo"><h4>${esc(u.unidade)}</h4><p class="vazio">Nenhuma semana com nota ainda.</p></div>`;
      return `<div class="cartao multiplo"><h4>${esc(u.unidade)}</h4>${graficoLinhas({ mini: true, alt: 150, xs, xsLongo, zonas: true, rotFim: true, ticks: [0, 50, 100], rotulo: `Nota semanal de ${u.unidade}`, series: [{ nome: "Nota", cor: "var(--navy)", v }] })}</div>`;
    }).join("")}</div>`;
  }

  $("#aba-rede").innerHTML = `
    <section class="secao"><div class="secao-cab"><div><h2>Ranking da rede</h2><p>Nota de cada unidade no período, com as mesmas metas pras três. Clique numa unidade pra abrir os números dela.</p></div></div>
      <div class="unidades">${cartoes}</div></section>
    <section class="secao"><div class="secao-cab"><div><h2>Metas lado a lado</h2><p>Mesmo período e mesmas metas. O ícone mostra a situação de cada unidade: na meta, perto ou longe.</p></div></div>
      <div class="cartao">${tabela}</div></section>
    <section class="secao"><div class="secao-cab"><div><h2>Nota semana a semana</h2><p>Cada semana fecha na terça às 8h e fica congelada. Faixa verde: 85 ou mais; amarela: 70 a 84; vermelha: abaixo de 70.</p></div></div>
      ${evolucao}</section>`;
  desenharGraficos();
}

// ---------- unidade ----------
async function carregarGeral() {
  marcarPeriodo();
  const alvo = $("#aba-geral");
  if (!alvo.innerHTML || alvo.dataset.conta !== estado.conta.id) alvo.innerHTML = `<div class="cartao"><p class="vazio">Calculando os números da unidade…</p></div>`;
  else alvo.classList.add("carregando");
  const pedido = ++estado.pedidoGeral;
  try {
    const [d, lista] = await Promise.all([
      rpc("atendimento_painel", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate }),
      rpc("atendimento_lista", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate, p_filtro: "atendimentos" }),
    ]);
    if (pedido !== estado.pedidoGeral || estado.aba !== "geral") return;
    estado.dados = d; estado.lista = lista || [];
    alvo.dataset.conta = estado.conta.id;
    desenharGeral(d, estado.lista);
  } finally { if (pedido === estado.pedidoGeral) alvo.classList.remove("carregando"); }
}

function avisoColeta(c) {
  if (!c.ultimo_evento_em && c.importadas) return `<div class="aviso">${ic("info")}<div>Dados importados do WhatsApp Web, desde <strong>${esc(fmtDataHora(c.primeira_mensagem_em, true))}</strong>. Não têm aviso de leitura nem o conteúdo dos áudios. A coleta automática começa quando a NeoGo for conectada.</div></div>`;
  if (c.primeira_mensagem_em && c.primeira_mensagem_em.slice(0, 10) > estado.de) return `<div class="aviso">${ic("info")}<div>Coleta desde <strong>${esc(fmtDataHora(c.primeira_mensagem_em, true))}</strong>. Os dias anteriores do período ficam sem dado.</div></div>`;
  return "";
}

function desenharGeral(d, lista) {
  estado.acoes.clear(); estado.graficos.clear();
  const c = estado.conta, m = metas();
  if (!c.mensagens) {
    $("#aba-geral").innerHTML = `<div class="nota-bloco"><div class="nota-esq"><div class="nota-quem"><strong>Nota do atendimento</strong><span>${esc(c.unidade || c.nome)}</span></div>
      <div class="nota-valor"><b>–</b><small>/100</small></div><div class="nota-sit">${chipSit(faixaNota(null))}</div></div>
      <div class="nota-dir"><h3>Ainda não chegou nenhuma mensagem desta unidade</h3><p>Os números aparecem quando o WhatsApp da loja for conectado na NeoGo. Daí em diante, cada conversa entra aqui sozinha: tempo de resposta na hora e a leitura da IA de madrugada.</p>
      ${PILARES.map((p) => linhaPilar(p, {}, d)).join("")}</div></div>`;
    return;
  }
  const R = d.resposta || {}, V = d.volume || {}, D = d.durante || {}, L = d.leitura || {}, F = d.formato || {}, T = d.retorno || {}, Q = d.qualidade || {};
  const N = d.nota || {};
  const kpi = (pk, kk) => N.pilares?.[pk]?.kpis?.[kk] || {};
  const op = Q.oportunidades || 0;
  const pinos = (...cs) => `<span class="pinos">${cs.map((x) => `<span class="pino p-${x}"></span>`).join("")}</span>`;
  const indice = `<nav class="indice" aria-label="Nesta página">${[["s-metas", "Metas do período", "neu"], ["s-agi", "Agilidade", "agi"], ["s-con", "Condução e compromisso", "con"], ["s-ret", "Retorno", "ret"], ["s-for", "Formato", "for"], ["s-ctx", "Contexto", "neu"]]
    .map(([id, t, cl]) => `<button type="button" class="p-${cl}" data-rolar="${id}"><i></i>${t}</button>`).join("")}</nav>`;

  // Agilidade
  const agi = `<section class="secao p-agi" id="s-agi">
    <div class="secao-cab">${pinos("agi")}<div><h2>Agilidade em detalhe</h2><p>Quanto o cliente espera pela loja. Os tempos contam só os minutos com a loja aberta: mensagem às 23h respondida às 10h05 vale 5 minutos.</p></div></div>
    <div class="numeros p-agi">
      ${numero("1ª resposta, mediana", fmtMin(R.mediana_util_min), `meta até ${m.primeira_resposta_min} min · loja aberta`, { filtro: "acima_meta", titulo: "1ª resposta acima da meta", sit: situacao(kpi("agilidade", "primeira_resposta").pontos) })}
      ${numero("1ª resposta em tempo corrido", fmtMin(R.mediana_corrida_min), "como o cliente sente, com a loja fechada no meio")}
      ${numero("9 em cada 10 respondidos em até", fmtMin(R.p90_util_min), "loja aberta")}
      ${numero("Chegou com a loja fechada", fmtMin(R.fora_horario?.mediana_util_min), `${n(R.fora_horario?.atendimentos)} casos · resposta depois de abrir`, { filtro: "fora_horario", titulo: "Chegaram com a loja fechada" })}
      ${numero("Durante a conversa, mediana", fmtMin(D.mediana_util_min), `${n(D.pendencias)} esperas · ${n(D.sem_resposta)} sem resposta em 1h`)}
      ${numero("Sem resposta até agora", n(R.sem_resposta), `de ${n(R.atendimentos)} atendimentos`, { filtro: "sem_resposta", titulo: "Sem resposta até agora" })}
      ${numero("Viu e não respondeu em 30 min", L.com_leitura ? n(L.viu_sem_responder) : "–", L.com_leitura ? `de ${n(L.com_leitura)} esperas com aviso de leitura` : "sem aviso de leitura no período", { filtro: L.com_leitura ? "viu_sem_responder" : undefined, titulo: "Viu e não respondeu" })}
    </div>
    <div class="detalhe" style="margin-top:16px">
      <div class="cartao c-5">${cab("Quanto o cliente esperou pela 1ª resposta", "Atendimentos agrupados pelo tempo de espera, com a loja aberta. Clique numa barra pra ver quais.")}${histogramaEspera(lista, m.primeira_resposta_min)}</div>
      <div class="cartao c-7">${cab("Quando o cliente espera mais", "Mediana da espera por dia e hora em que o cliente escreveu, com a loja aberta. Quanto mais escuro, mais demorado.")}${mapaCalor(d.calor || [], m.primeira_resposta_min)}</div>
    </div></section>`;

  // Condução e compromisso
  let conducao;
  if (!Q.analisados) {
    conducao = `<div class="cartao"><p class="vazio">A IA ainda não leu as conversas deste período. A leitura roda uma vez por dia, de madrugada: depois dela aparecem aqui o caminho de cada oportunidade, o modo balcão e os compromissos.</p>
      ${Q.aguardando_ia ? `<p style="margin-top:10px"><button type="button" class="btn-sec" data-filtro="aguardando_ia" data-titulo="Aguardando a leitura da IA">${ic("relogio")}${n(Q.aguardando_ia)} atendimento(s) aguardando a IA</button></p>` : ""}</div>`;
  } else {
    const pass = (nome, v, cor, filtro, titulo, extra = {}) => ({ nome, v, cor, filtro, titulo, rotulo: `${n(v)}`, extra: extra.base !== undefined ? fmtPct(pct(v, extra.base)) : fmtPct(pct(v, op)), dicaS: extra.dicaS || (extra.base !== undefined ? `${fmtPct(pct(v, extra.base))} ${extra.rotBase}` : `${fmtPct(pct(v, op))} das oportunidades`), sub: extra.sub, nota: extra.nota });
    const funil = barras([
      pass("Oportunidades de serviço", op, "var(--neutro)", "oportunidades", "Oportunidades de serviço", { dicaS: "base de todos os passos" }),
      pass("Entendeu o caso", Q.entendeu, "var(--con)", "sem_entendeu", "Não procurou entender o caso"),
      pass("Passou preço", Q.passou_preco, "var(--con)", "passou_preco", "Receberam preço"),
      pass("Explicou o que está incluso", Q.incluso, "var(--con)", "sem_incluso", "Passou preço sem explicar o que está incluso", { sub: true, base: Q.passou_preco, rotBase: "de quem recebeu preço", nota: "de quem recebeu preço" }),
      pass("Falou de diferencial", Q.diferencial, "var(--con)", "sem_diferencial", "Não falou de nenhum diferencial"),
      pass("Chamou pra trazer a peça", Q.convite, "var(--con)", "sem_convite", "Não chamou pra loja"),
      pass("Firmou compromisso", Q.compromisso, "var(--com)", "sem_compromisso", "Sem compromisso firmado"),
      pass("Relembrou o compromisso", Q.relembrou, "var(--com)", "nao_relembrou", "Não relembrou o compromisso", { sub: true, base: Q.relembrou_aplicavel, rotBase: "dos compromissos com data passada", nota: "de quem já passou da data" }),
    ], { max: Math.max(1, op) });
    conducao = `<div class="detalhe">
      <div class="cartao c-7">${cab("Caminho da oportunidade", "Das conversas de serviço novo, quantas tiveram cada passo, pela leitura da IA. Clique num passo pra ver quem ficou sem ele.")}${funil}</div>
      <div class="c-5" style="display:grid;gap:16px;align-content:start">
        <div class="numeros p-con" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          ${numero("Modo balcão", n(Q.balcao), `${fmtPct(pct(Q.balcao, op))} das oportunidades: respondeu e não levou pra loja`, { filtro: "balcao", titulo: "Modo balcão: respondeu e não levou pra loja" })}
          ${numero("Tempo até o preço", fmtMin(Q.tempo_ate_preco_mediana_min), "mediana, loja aberta")}
          ${numero("Compromissos por vir", n(Q.relembrou_aguardando), "data combinada ainda não chegou")}
          ${numero("Aguardando a IA", n(Q.aguardando_ia), "teve mensagem depois da última leitura", { filtro: "aguardando_ia", titulo: "Aguardando a leitura da IA" })}
        </div>
        <div class="aviso">${ic("info")}<div><strong>Modo balcão</strong> é quando a loja só informa: responde o preço, mas não chama o cliente pra trazer a peça nem combina um dia. É o que a nota de condução e compromisso tenta evitar.</div></div>
      </div>
    </div>`;
  }
  const con = `<section class="secao" id="s-con"><div class="secao-cab">${pinos("con", "com")}<div><h2>Condução e compromisso em detalhe</h2><p>O que a loja fez em cada oportunidade de serviço: entender, explicar, mostrar o diferencial, chamar pra loja, combinar o dia e lembrar.</p></div></div>${conducao}</section>`;

  // Retorno
  let retorno;
  if (!T.orcamentos) retorno = `<div class="cartao"><p class="vazio">Nenhum orçamento no período. Orçamento é mensagem da loja com valor em reais, em texto ou em áudio transcrito.</p></div>`;
  else {
    const d1 = T.retorno_ate_d1 || 0, d3 = T.retorno_ate_d3 || 0, d7 = T.retorno_ate_d7 || 0, com = T.com_retorno || 0;
    retorno = `<div class="detalhe">
      <div class="numeros p-ret c-12">
        ${numero("Orçamentos enviados", n(T.orcamentos), "mensagem da loja com valor em reais", { filtro: "com_preco", titulo: "Atendimentos com preço" })}
        ${numero("Cliente respondeu em 24h", n(T.cliente_respondeu), fmtPct(pct(T.cliente_respondeu, T.orcamentos)) + " dos orçamentos")}
        ${numero("Cliente sumiu", n(T.cliente_sumiu), "não respondeu em 24h", { filtro: "orcamento_sumiu", titulo: "Orçamentos em que o cliente sumiu" })}
        ${numero("Loja voltou a chamar", n(com), `${fmtPct(pct(com, T.cliente_sumiu))} de quem sumiu · meta ${m.retorno_pct}%`, { filtro: "orcamento_com_retorno", titulo: "Orçamentos com retorno da loja", sit: situacao(kpi("retorno", "retorno").pontos) })}
        ${numero("Sem retorno nenhum", n(T.sem_retorno), "cliente sumiu e a loja não chamou", { filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" })}
      </div>
      <div class="cartao c-12">${cab("Quando a loja voltou a chamar quem sumiu", "Dos orçamentos em que o cliente não respondeu em 24h. Quanto mais escuro, mais rápido foi o retorno.")}
        ${T.cliente_sumiu ? segmentada([
          { nome: "até o dia seguinte (D+1)", v: d1, cor: "var(--vd1)" },
          { nome: "D+2 ou D+3", v: d3 - d1, cor: "var(--vd2)" },
          { nome: "D+4 a D+7", v: d7 - d3, cor: "var(--vd3)" },
          { nome: "depois de D+7", v: com - d7, cor: "var(--vd4)", tinta: "var(--tinta)" },
          { nome: "sem retorno", v: T.sem_retorno || 0, cor: "var(--neutro-2)", tinta: "var(--tinta)", filtro: "orcamento_sem_retorno", titulo: "Orçamentos sem retorno da loja" },
        ]) : `<p class="vazio">Nenhum cliente sumiu depois do orçamento no período.</p>`}
      </div></div>`;
  }
  const ret = `<section class="secao p-ret" id="s-ret"><div class="secao-cab">${pinos("ret")}<div><h2>Retorno em detalhe</h2><p>Retorno é a loja voltar a chamar quem recebeu preço e não respondeu, 12h ou mais depois. D+1 até 36h, D+3 até 84h, D+7 até 180h.</p></div></div>${retorno}</section>`;

  // Formato
  const aud = pct(F.audio, F.mensagens);
  const formatoBarras = F.mensagens ? barras([
    { nome: "Texto", v: F.texto, extra: fmtPct(pct(F.texto, F.mensagens)) },
    { nome: "Áudio", v: F.audio, extra: fmtPct(aud), filtro: "com_audio", titulo: "Atendimentos com áudio da loja" },
    { nome: "Foto ou vídeo", v: F.imagem, extra: fmtPct(pct(F.imagem, F.mensagens)) },
    { nome: "Outros", v: F.outros, extra: fmtPct(pct(F.outros, F.mensagens)) },
  ].sort((a, b) => (b.v || 0) - (a.v || 0)), { cor: "var(--for)" }) : `<p class="vazio">A loja não mandou mensagem no período.</p>`;
  const fmt = `<section class="secao p-for" id="s-for"><div class="secao-cab">${pinos("for")}<div><h2>Formato em detalhe</h2><p>Como a loja responde. Áudio é mais difícil de ler na hora: o cliente no trabalho costuma deixar pra depois.</p></div></div>
    <div class="detalhe">
      <div class="cartao c-7">${cab("Mensagens da loja por tipo", `${n(F.mensagens)} mensagens enviadas pela loja no período.`)}${formatoBarras}</div>
      <div class="numeros uma-coluna p-for c-5" style="align-content:start">
        ${numero("Em áudio", fmtPct(aud), `limite ${m.audio_max_pct}% das mensagens`, { filtro: "com_audio", titulo: "Atendimentos com áudio da loja", sit: situacao(kpi("formato", "audio").pontos) })}
        ${numero("Duração média do áudio", F.audio_media_seg ? F.audio_media_seg + " s" : "–", F.audio_total_min ? `${fmtDec(F.audio_total_min)} min no total` : "")}
        ${numero("Atendimentos só em áudio", n(F.atendimentos_so_audio), `de ${n(F.atendimentos_com_loja)} com resposta da loja`, { filtro: "so_audio", titulo: "Atendimentos em que a loja só mandou áudio" })}
      </div>
    </div></section>`;

  // Contexto
  const serv = Object.entries(Q.servicos || {}).sort((a, b) => b[1] - a[1]);
  const tiposHtml = Q.analisados ? `${barras([
      { nome: "Oportunidade de serviço", v: Q.oportunidades, extra: fmtPct(pct(Q.oportunidades, Q.analisados)), filtro: "oportunidades", titulo: "Oportunidades de serviço" },
      { nome: "Peça já na loja", v: Q.acompanhamento, extra: fmtPct(pct(Q.acompanhamento, Q.analisados)), filtro: "acompanhamento", titulo: "Peça já na loja", nota: "andamento, retirada" },
      { nome: "Outro assunto", v: Q.outros, extra: fmtPct(pct(Q.outros, Q.analisados)), filtro: "outros", titulo: "Outro assunto", nota: "fornecedor, engano" },
    ].sort((a, b) => (b.v || 0) - (a.v || 0)))}
    <div class="nota-rodape"><button type="button" class="link" data-filtro="cobrou_status" data-titulo="Cliente perguntou se a peça estava pronta">${n(Q.cobrou_status)} cliente(s) tiveram que perguntar se a peça estava pronta: sinal de que a loja não avisou antes.</button></div>`
    : `<p class="vazio">Aparece depois da leitura da IA.</p>`;
  const servHtml = serv.length ? barras(serv.map(([k, v]) => ({ nome: SERVICOS[k] || k, v, extra: fmtPct(pct(v, serv.reduce((s, [, x]) => s + x, 0))) }))) : `<p class="vazio">Aparece depois da leitura da IA.</p>`;
  const ctx = `<section class="secao" id="s-ctx"><div class="secao-cab">${pinos("neu")}<div><h2>Contexto do período</h2><p>Volume e assunto das conversas. Não entram na nota, mas ajudam a ler os números de cima.</p></div></div>
    <div class="numeros p-neu">
      ${numero("Atendimentos", n(V.atendimentos), "que o cliente começou", { filtro: "atendimentos", titulo: "Atendimentos que o cliente começou" })}
      ${numero("Vindos de anúncio", n(V.de_anuncio), fmtPct(pct(V.de_anuncio, V.atendimentos)) + " dos atendimentos", { filtro: "anuncio", titulo: "Vindos de anúncio" })}
      ${numero("Clientes que voltaram", n(V.recorrentes), "já tinham falado antes")}
      ${numero("Contatos diferentes", n(V.contatos))}
      ${numero("Mensagens por atendimento", fmtDec(V.msgs_por_atendimento), `${n(V.mensagens_cliente)} recebidas · ${n(V.mensagens_loja)} enviadas`)}
      ${numero("A loja que começou", n(V.iniciados_pela_loja), "aviso de peça pronta etc.", { filtro: "iniciados_pela_loja", titulo: "Atendimentos que a loja começou" })}
      ${numero("Recrutamento", n(V.recrutamento), "fica fora de todas as contas", { filtro: "recrutamento", titulo: "Recrutamento" })}
    </div>
    <div class="detalhe" style="margin-top:16px">
      <div class="cartao c-12">${cab("Atendimentos por dia", "Cada coluna é um dia do período. Clique pra ver os atendimentos do dia.")}${porDia(lista)}</div>
      <div class="cartao c-6">${cab("Do que se trata", "Tipo de cada conversa que a loja respondeu, pela leitura da IA.")}${tiposHtml}</div>
      <div class="cartao c-6">${cab("Serviços mais pedidos", "Oportunidades e peças já na loja, pela leitura da IA.")}${servHtml}</div>
    </div></section>`;

  $("#aba-geral").innerHTML = avisoColeta(c) + blocoNota(d, c.unidade || c.nome) + indice + secaoMetas(d) + agi + con + ret + fmt + ctx;
  desenharGraficos();
}

// ---------- listas e conversa (gaveta) ----------
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
  g.hidden = false; esconderDica();
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

function itemLista(a, m) {
  const selos = [];
  if (a.de_anuncio) selos.push(`<span class="selo anuncio">${ic("anuncio")}anúncio</span>`);
  if (a.recrutamento) selos.push(`<span class="selo">vaga</span>`);
  if (a.tipo && a.tipo !== "oportunidade") selos.push(`<span class="selo">${esc(TIPOS[a.tipo] || a.tipo)}</span>`);
  if (!a.iniciado_pela_loja) {
    if (a.resposta_em) selos.push(`<span class="selo ${a.util_min <= m.primeira_resposta_min ? "bom" : "rui"}">${ic("relogio")}1ª resposta ${esc(fmtMin(a.util_min))}</span>`);
    else selos.push(`<span class="selo rui">${ic("relogio")}sem resposta</span>`);
  } else selos.push(`<span class="selo">loja começou</span>`);
  if (a.tipo === "oportunidade") {
    const passos = checklistDe(a, m), feitos = passos.filter((p) => p[1]).length;
    selos.push(`<span class="selo ${feitos === passos.length ? "bom" : feitos * 2 >= passos.length ? "ate" : "rui"}">${feitos} de ${passos.length} passos</span>`);
    if (a.chamou_loja === false && a.marcou_dia === false) selos.push(`<span class="selo rui">${ic("balcao")}modo balcão</span>`);
    if (a.servico && SERVICOS[a.servico]) selos.push(`<span class="selo">${esc(SERVICOS[a.servico])}</span>`);
  } else {
    if (a.preco) selos.push(`<span class="selo">preço</span>`);
    if (a.orcamento_sumiu) selos.push(a.retorno ? `<span class="selo bom">retorno em ${esc(String(a.retorno_dias).replace(".", ","))} d</span>` : `<span class="selo rui">sem retorno</span>`);
  }
  if (a.cobrou_status) selos.push(`<span class="selo rui">perguntou se estava pronto</span>`);
  if (a.msgs_loja > 0 && a.audios_loja === a.msgs_loja) selos.push(`<span class="selo">${ic("mic")}só áudio</span>`);
  if (a.viu_sem_responder) selos.push(`<span class="selo rui">${ic("olho")}viu e não respondeu</span>`);
  return `<button type="button" class="item" data-contato="${esc(a.contato)}" data-inicio="${esc(a.inicio)}" data-fim="${esc(a.fim)}" data-resumo="${esc(JSON.stringify(a))}">
    <div class="cab"><span class="quem">${esc(fmtContato(a.contato, a.nome))}</span><span class="quando">${esc(fmtDataHora(a.inicio))}</span></div>
    <div class="selos">${selos.join("")}</div>
    <div class="txt">${a.msgs_cliente} mensagem(ns) do cliente · ${a.msgs_loja} da loja</div></button>`;
}
function mostrarLinhas(titulo, linhas, mais = "") {
  const m = metas();
  abrirGaveta(titulo, `<p class="lista-cab">${linhas.length} atendimento(s) · ${esc(periodoTxt())}${mais}</p>${linhas.length ? `<div class="lista">${linhas.map((a) => itemLista(a, m)).join("")}</div>` : `<div class="cartao"><p class="vazio">Nenhum atendimento nesse filtro no período.</p></div>`}`);
}
async function abrirLista(filtro, titulo) {
  abrirGaveta(titulo || "Atendimentos", `<div class="cartao"><p class="vazio">Carregando…</p></div>`);
  const linhas = await rpc("atendimento_lista", { p_conta: estado.conta.id, p_de: estado.de, p_ate: estado.ate, p_filtro: filtro });
  mostrarLinhas(titulo || "Atendimentos", linhas || [], (linhas || []).length >= 500 ? " · mostrando os 500 mais recentes" : "");
}

async function abrirConversa(contato, inicio, fim, resumoTxt) {
  abrirGaveta(fmtContato(contato), `<div class="cartao"><p class="vazio">Carregando conversa…</p></div>`, true);
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
      if (a.tipo) partes.push(`<div class="leitura">Leitura da IA: ${esc(TIPOS[a.tipo] || a.tipo)}${a.servico && SERVICOS[a.servico] ? " · " + esc(SERVICOS[a.servico]) : ""}${a.ia_atualizada ? "" : " · teve mensagem nova depois da última leitura"}</div>`);
      else if (!a.iniciado_pela_loja && a.msgs_loja > 0) partes.push(`<div class="leitura">A IA ainda não leu este atendimento com o checklist.</div>`);
      for (const [nomePasso, feito, trecho, explicacao] of passos) {
        const det = !trecho ? "" : explicacao ? `<span class="explica">${esc(trecho)}</span>` : `<q>${esc(trecho)}</q>`;
        partes.push(`<div class="passo-check ${feito ? "bom" : "rui"}"><span class="marca-p">${ic(feito ? "check" : "x")}</span><div><strong>${esc(nomePasso)}</strong>${det}</div></div>`);
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
      const cls = min <= m.primeira_resposta_min ? "bom" : min <= m.primeira_resposta_min * 4 ? "ate" : "rui";
      html += `<div class="espera ${cls}">${ic("relogio")}loja respondeu em ${esc(fmtMin(min))} (corrido)</div>`;
      esperaDesde = null;
    }
    const fora = ini && (t < ini || t > fimT) ? " fora" : "";
    let ancora = "";
    if (ini && !marcado && t >= ini) { ancora = ' id="inicio-atend"'; marcado = true; }
    let corpo = "";
    if (x.tipo === "texto") corpo = esc(x.texto);
    else if (x.tipo === "audio") {
      corpo = `<span class="midia">${ic("mic")}áudio de ${x.audio_segundos ?? "?"} s</span>`;
      if (x.transcricao) corpo += `\n${esc(x.transcricao)}`;
      else if (x.transcricao_status === "pendente") corpo += `\n<span class="midia">transcrição pendente</span>`;
      else if (x.transcricao_status === "erro") corpo += `\n<span class="midia">não foi possível transcrever</span>`;
    } else if (x.tipo === "imagem") {
      corpo = `<span class="midia">${ic("camera")}foto</span>${x.texto ? "\n" + esc(x.texto) : ""}`;
      if (x.transcricao) corpo += `\n<span class="midia">o que aparece: ${esc(x.transcricao)}</span>`;
      else if (x.transcricao_status === "pendente") corpo += `\n<span class="midia">descrição pendente</span>`;
    } else corpo = `<span class="midia">(${esc(x.tipo)})</span>${x.texto ? "\n" + esc(x.texto) : ""}`;
    if (x.anuncio) corpo = `<span class="midia">${ic("anuncio")}veio do anúncio${x.anuncio.titulo ? ": " + esc(x.anuncio.titulo) : ""}</span>\n` + corpo;
    if (x.automatica) corpo = `<span class="midia">mensagem automática, não conta como resposta</span>\n` + corpo;
    if (x.parcial) corpo += `\n<span class="midia">só a prévia da lista (conversa não aberta na coleta)</span>`;
    const lida = !x.de_loja && x.lida_em ? ` · vista ${esc(fmtHora(x.lida_em))}` : "";
    html += `<div class="msg ${x.de_loja ? "loja" : ""}${fora}"${ancora}>${corpo}<span class="hora">${x.de_loja ? "Loja" : "Cliente"} · ${esc(fmtHora(x.enviada_em))}${lida}</span></div>`;
  }
  if (esperaDesde !== null) html += `<div class="espera rui">${ic("relogio")}cliente esperando há ${esc(fmtMin((Date.now() - esperaDesde) / 60000))}</div>`;
  $("#gaveta-conteudo").innerHTML = topo + `<div class="conversa">${html || '<p class="vazio">Sem mensagens.</p>'}</div>`;
  const el = $("#inicio-atend"); if (el) el.scrollIntoView({ block: "start" });
}

// ---------- agora ----------
async function carregarAgora() {
  const f = await rpc("atendimento_filas", { p_conta: estado.conta.id });
  if (estado.aba !== "agora") return;
  const m = metas();
  const item = (contato, nome, quando, selos, txt) => `<button type="button" class="item" data-contato="${esc(contato)}">
    <div class="cab"><span class="quem">${esc(fmtContato(contato, nome))}</span><span class="quando">${quando}</span></div>
    ${selos ? `<div class="selos">${selos}</div>` : ""}${txt ? `<div class="txt">${esc(txt)}</div>` : ""}</button>`;
  const lista = (itens, vazio) => itens.length ? itens.join("") : `<p class="vazio">${vazio}</p>`;
  const esp = (f.esperando || []).map((x) => {
    const selos = [`<span class="selo ${x.espera_util_min <= m.primeira_resposta_min ? "bom" : "rui"}">${ic("relogio")}${esc(fmtMin(x.espera_util_min))} com a loja aberta</span>`];
    if (x.de_anuncio) selos.push(`<span class="selo anuncio">${ic("anuncio")}anúncio</span>`);
    if (x.primeira) selos.push(`<span class="selo">primeira mensagem</span>`);
    if (x.lida_em) selos.push(`<span class="selo rui">${ic("olho")}vista às ${esc(fmtHora(x.lida_em))}</span>`);
    return item(x.contato, x.nome, `há ${esc(fmtMin(x.espera_corrida_min))}`, selos.join(""), x.ultimo_texto);
  });
  const comp = (f.compromissos || []).map((x) => {
    const quando = x.data === f.hoje ? "hoje" : x.data < f.hoje ? "ontem" : "amanhã";
    const selos = [`<span class="selo ${quando === "ontem" ? "rui" : "ate"}">${ic("calendario")}${quando}${quando === "ontem" ? ": o cliente veio?" : ""}</span>`];
    if (x.relembrou === "sim") selos.push(`<span class="selo bom">${ic("check")}já relembrou</span>`);
    if (x.ultima_loja) selos.push(`<span class="selo">última mensagem da loja ${esc(fmtDataHora(x.ultima_loja))}</span>`);
    return item(x.contato, x.nome, esc(fmtDataCurta(x.data)), selos.join(""), x.trecho ? `"${x.trecho}"` : "");
  });
  const ret = (f.retornos || []).map((x) => item(x.contato, x.nome, `${esc(String(x.dias).replace(".", ","))} dias`,
    `<span class="selo ate">${esc(x.etapa)}</span><span class="selo">${x.retornos_feitos} retorno(s) feito(s)</span>`, x.preco ? "Preço: " + x.preco : ""));
  const conv = (f.sem_convite || []).map((x) => item(x.contato, x.nome, esc(fmtDataHora(x.fim)),
    x.de_anuncio ? `<span class="selo anuncio">${ic("anuncio")}anúncio</span>` : "", x.preco ? "Preço: " + x.preco : ""));
  const fila = (cls, cont, urgente, titulo, desc, corpo) => `<div class="cartao ${cls}"><div class="fila-cab"><span class="contagem ${urgente && cont ? "urgente" : ""}">${cont}</span><div><h3>${esc(titulo)}</h3><p>${esc(desc)}</p></div></div>${corpo}</div>`;
  $("#aba-agora").innerHTML = `<section class="secao"><div class="secao-cab"><div><h2>O que fazer agora</h2><p>Quem está esperando, quem combinou de vir e quem precisa de retorno. Atualiza sozinho a cada minuto. Clique num contato pra abrir a conversa.</p></div></div>
    <div class="filas">
      ${fila("p-neu", esp.length, true, "Esperando resposta", "O cliente falou por último e a loja ainda não respondeu (últimos 7 dias). Mais antigos primeiro.", lista(esp, "Ninguém esperando. Bom trabalho."))}
      ${fila("p-com", comp.length, false, "Compromissos pra lembrar", "Dia combinado pra trazer a peça. Hoje e amanhã: lembrar o cliente. Ontem: confirmar se veio e remarcar se não veio.", lista(comp, "Nenhum compromisso entre ontem e amanhã (ou a IA ainda não leu)."))}
      ${fila("p-ret", ret.length, false, "Retornos de orçamento pra hoje", "Receberam preço, não responderam, e já passou do D+1, D+3 ou D+7 sem a loja voltar a chamar.", lista(ret, "Nenhum retorno pendente."))}
      ${fila("p-con", conv.length, false, "Oportunidades sem convite pra loja", "Últimos 14 dias, pela leitura da IA. Bom pra retomar com convite e dia.", lista(conv, "Nenhum caso (ou a IA ainda não leu)."))}
    </div></section>`;
}

// ---------- histórico ----------
const BASE_MANUAL = { rotulo: "Análise manual 01/10 a 10/11", atendimentos: 148, mediana: "~10h*", ate24: "64%*", convite: "0%" };
async function carregarHistorico() {
  const alvo = $("#aba-historico");
  alvo.innerHTML = `<div class="cartao"><p class="vazio">Carregando…</p></div>`;
  const [semanas, atual] = await Promise.all([
    rpc("atendimento_semanas", { p_conta: estado.conta.id }),
    rpc("atendimento_painel", { p_conta: estado.conta.id, p_de: periodo("semana")[0], p_ate: hojeYMD() }),
  ]);
  if (estado.aba !== "historico") return;
  estado.acoes.clear(); estado.graficos.clear();
  const ordem = [...semanas].sort((a, b) => (a.semana < b.semana ? -1 : 1));
  let graficos;
  if (ordem.length < 2) {
    graficos = `<div class="cartao"><p class="vazio">${ordem.length ? "Só uma semana fechada até agora. Os gráficos aparecem a partir da segunda." : "Nenhuma semana fechada ainda: a primeira fecha na terça às 8h."} A tabela abaixo já mostra a semana atual.</p></div>`;
  } else {
    const xs = ordem.map((s) => fmtDataCurta(s.semana));
    const xsLongo = ordem.map((s) => `Semana de ${fmtDataCurta(s.semana)} a ${fmtDataCurta(somaDias(s.semana, 6))}`);
    const pilares = PILARES.map((p) => ({ nome: p.nome, cor: `var(--${p.c})`, v: ordem.map((s) => s.metricas?.nota?.pilares?.[p.k]?.pontos ?? null) }));
    graficos = `<div class="detalhe">
      <div class="cartao c-6">${cab("Nota por semana", "Faixa verde: 85 ou mais. Amarela: 70 a 84. Vermelha: abaixo de 70.")}
        ${graficoLinhas({ xs, xsLongo, zonas: true, rotFim: true, rotulo: "Nota por semana", series: [{ nome: "Nota", cor: "var(--navy)", v: ordem.map((s) => s.metricas?.nota?.valor ?? null) }] })}</div>
      <div class="cartao c-6">${cab("Pilares por semana", "Pontos de cada pilar, de 0 a 100. Passe o mouse pra ver os valores da semana.")}
        ${graficoLinhas({ xs, xsLongo, ticks: [0, 50, 100], rotulo: "Pontos de cada pilar por semana", series: pilares })}
        <div class="legenda">${PILARES.map((p) => `<span><i style="background:var(--${p.c});height:3px;border-radius:2px;width:14px"></i>${esc(p.nome)}</span>`).join("")}</div></div>
    </div>`;
  }
  const kv = (d, p, k) => d.nota?.pilares?.[p]?.kpis?.[k] || {};
  const td = (v, sit) => `<td><span class="celula">${esc(v)}${sit ? chipSit(sit, true) : ""}</span></td>`;
  const linhaSemana = (rot, d, cls = "") => {
    const N = d.nota || {}, V = d.volume || {};
    const k = (p, kk, un) => { const K = kv(d, p, kk); return td(fmtKpi(K.valor, un), K.valor === null || K.valor === undefined ? null : situacao(K.pontos)); };
    return `<tr class="${cls}"><td class="esq">${esc(rot)}</td><td><span class="chip-nota ${faixaNota(N.valor).cls}">${fmtNota(N.valor)}</span></td>
      ${PILARES.map((p) => `<td>${fmtNota(N.pilares?.[p.k]?.pontos)}</td>`).join("")}
      <td>${n(V.atendimentos)}</td>${k("agilidade", "primeira_resposta", "min")}${k("agilidade", "respondidas_24h", "%")}
      ${k("conducao", "convite", "%")}${k("compromisso", "compromisso", "%")}${k("retorno", "retorno", "%")}${k("formato", "audio", "%")}</tr>`;
  };
  let tabela = `<div class="tabela-rolagem"><table class="tab"><thead><tr><th class="esq">Semana</th><th>Nota</th>${PILARES.map((p) => `<th>${esc(p.nome)}</th>`).join("")}
    <th>Atendimentos</th><th>1ª resposta</th><th>Em até 24h</th><th>Chamou pra loja</th><th>Compromisso</th><th>Retorno</th><th>Áudio</th></tr></thead><tbody>`;
  tabela += linhaSemana(`Semana atual (desde ${fmtDataCurta(periodo("semana")[0])})`, atual, "atual");
  for (const s of [...ordem].reverse()) tabela += linhaSemana(`${fmtDataCurta(s.semana)} a ${fmtDataCurta(somaDias(s.semana, 6))}${s.metricas?.semana_parcial ? " (parcial)" : ""}`, s.metricas || {});
  if (estado.conta.slug === "sapataria-nacoes") {
    const b = BASE_MANUAL;
    tabela += `<tr><td class="esq">${b.rotulo}</td><td>–</td>${PILARES.map(() => "<td>–</td>").join("")}<td>${b.atendimentos}</td><td>${b.mediana}</td><td>${b.ate24}</td><td>${b.convite}</td><td>–</td><td>–</td><td>–</td></tr>`;
  }
  tabela += `</tbody></table></div>`;
  const rodape = estado.conta.slug === "sapataria-nacoes" ? `<p class="nota-rodape">* A análise manual mediu tempo corrido, lido no WhatsApp Web, sem os áudios. Serve de referência do "antes", não é comparação exata.</p>` : "";
  alvo.innerHTML = `<section class="secao"><div class="secao-cab"><div><h2>Evolução semana a semana</h2><p>Cada semana fecha na terça às 8h e fica congelada, mesmo se as metas mudarem depois. A semana atual é calculada agora e muda até o fechamento.</p></div></div>${graficos}</section>
    <section class="secao"><div class="secao-cab"><div><h2>Semana a semana em números</h2><p>Nota, pontos de cada pilar e os principais indicadores. O ícone mostra se o indicador bateu a meta.</p></div></div>
      <div class="cartao">${tabela}${rodape}</div></section>`;
  desenharGraficos();
}

// ---------- como funciona ----------
function desenharRegras() {
  estado.acoes.clear(); estado.graficos.clear();
  const m = metas(), w = pesos();
  const pisoTxt = (k) => ({ primeira_resposta: `${Math.max(120, m.primeira_resposta_min * 4)} min ou mais`,
    respondidas_24h: `${Math.max(0, Math.min(60, m.resposta_24h_pct - 20))}% ou menos`,
    audio: `${Math.min(100, Math.max(70, m.audio_max_pct + 30))}% ou mais` }[k] || "0%");
  const composicao = segmentada(PILARES.map((p) => ({ nome: `${p.nome} ${w[p.k]}%`, v: w[p.k], cor: `var(--${p.c})`, tinta: p.c === "for" ? "var(--tinta)" : "#fff", sub: p.desc })));
  let corpo = "";
  for (const p of PILARES) {
    corpo += `<tr class="grupo p-${p.c}"><td colspan="4"><span class="pino"></span>${esc(p.nome)} · peso ${w[p.k]}%</td></tr>`;
    corpo += p.kpis.map((k) => `<tr><td class="esq quebra">${esc(k.nome)}${k.detalhe ? `<br><span class="suave">${esc(k.detalhe)}</span>` : ""}</td><td>${esc(fmtMeta(k, m[META_DO_KPI[k.k]]))}</td><td>${esc(pisoTxt(k.k))}</td><td class="esq quebra suave">${esc(k.ia ? "Leitura da IA" : "Conta do sistema")}</td></tr>`).join("");
  }
  const def = (cl, titulo, txt) => `<div class="definicao p-${cl}"><span class="pino"></span><div><strong>${esc(titulo)}</strong>${esc(txt)}</div></div>`;
  $("#aba-regras").innerHTML = `
    <section class="secao"><div class="secao-cab"><div><h2>Como a nota é feita</h2><p>A nota vai de 0 a 100 e é da unidade, não de uma pessoa. Ela junta cinco pilares, cada um com um peso.</p></div></div>
      <div class="detalhe">
        <div class="cartao c-7">${cab("O peso de cada pilar", "Quanto cada parte conta na nota. A rede pode mudar os pesos na Configuração.")}${composicao}
          <div class="texto" style="margin-top:18px">
            <p>Cada indicador vale <strong>100 pontos quando bate a meta</strong> e 0 no piso. No meio, é proporcional. O pilar é a média dos seus indicadores.</p>
            <p>Indicador com menos de 3 casos no período fica sem nota (1 ou 2 conversas não dizem nada). Pilar sem dado sai da conta e os pesos dos outros são redistribuídos.</p>
            <p>Toda semana fecha na terça às 8h e a nota dela fica congelada, mesmo se as metas mudarem depois.</p>
          </div></div>
        <div class="cartao c-5">${cab("Faixas da nota")}
          <div class="definicoes">
            <div class="definicao"><span>${chipSit(faixaNota(90), true)}</span><div><strong>85 ou mais: bom</strong>A unidade bate quase todas as metas.</div></div>
            <div class="definicao"><span>${chipSit(faixaNota(75), true)}</span><div><strong>70 a 84: atenção</strong>Algumas metas ficaram pelo caminho.</div></div>
            <div class="definicao"><span>${chipSit(faixaNota(40), true)}</span><div><strong>Abaixo de 70: precisa melhorar</strong>Vale olhar as metas com mais pontos perdidos.</div></div>
          </div>
          <div class="nota-rodape">Cada indicador também mostra a situação: ${chipSit(situacao(100))} com 100 pontos, ${chipSit(situacao(80))} de 70 a 99 e ${chipSit(situacao(10))} abaixo de 70.</div></div>
      </div></section>
    <section class="secao"><div class="secao-cab"><div><h2>Indicadores, metas e pisos</h2><p>Meta vale 100 pontos; piso vale 0. As metas são da rede e valem igual pras três unidades.</p></div></div>
      <div class="cartao"><div class="tabela-rolagem"><table class="tab"><thead><tr><th class="esq">Indicador</th><th>Meta (100 pontos)</th><th>Piso (0 ponto)</th><th class="esq">Quem mede</th></tr></thead><tbody>${corpo}</tbody></table></div></div></section>
    <section class="secao"><div class="secao-cab"><div><h2>O que a IA confere em cada conversa</h2><p>Uma vez por dia, de madrugada. A IA não dá opinião: responde sim ou não e copia o trecho da conversa que comprova. Lê texto, áudio transcrito e a descrição das fotos.</p></div></div>
      <div class="detalhe">
        <div class="cartao c-6"><div class="definicoes">
          ${def("neu", "Tipo da conversa", "Oportunidade de serviço novo, peça que já está na loja, vaga de emprego ou outro assunto. O checklist vale só pra oportunidade.")}
          ${def("con", "Entendeu o caso", "Pediu foto, perguntou o problema, o tamanho, o material ou a marca antes de passar preço.")}
          ${def("con", "Explicou o que está incluso", "Disse o que vai ser feito ou o que acompanha o serviço, além do preço. Conta só pra quem recebeu preço.")}
          ${def("con", "Falou dos diferenciais", "Citou um diferencial concreto da loja (garantia, experiência com grife, avaliação sem custo, rapidez).")}
          ${def("con", "Chamou pra trazer a peça", "Convidou o cliente a vir ou trazer a peça. Só passar o endereço porque o cliente pediu não conta.")}
        </div></div>
        <div class="cartao c-6"><div class="definicoes">
          ${def("com", "Compromisso firmado", "Ficou combinado um dia ou horário concreto, confirmado pelos dois lados. \"Quando puder\" não conta.")}
          ${def("com", "Relembrou o compromisso", "A loja voltou a falar pra lembrar ou confirmar a visita. Conta só depois que a data passou.")}
          ${def("neu", "Modo balcão", "Oportunidade em que a loja respondeu, mas não chamou pra loja nem firmou compromisso.")}
          ${def("neu", "Peça já na loja", "Marca quando o cliente teve que perguntar se a peça estava pronta, sem a loja ter avisado antes.")}
        </div></div>
      </div></section>
    <section class="secao"><div class="secao-cab"><div><h2>Como contamos o tempo</h2></div></div>
      <div class="cartao"><div class="definicoes">
        ${def("agi", "Atendimento", "A conversa com um contato. Um novo começa quando a conversa fica 8 dias parada.")}
        ${def("agi", "1ª resposta", "Da primeira mensagem do cliente até a primeira mensagem da loja, contando só minutos com a loja aberta. Mensagem automática (saudação do anúncio) e reação com emoji não contam como resposta.")}
        ${def("ret", "Orçamento", "Mensagem da loja com valor em reais, em texto ou em áudio transcrito.")}
        ${def("ret", "Retorno", "A loja manda nova mensagem 12h ou mais depois do orçamento, sem o cliente ter respondido. D+1 até 36h, D+3 até 84h, D+7 até 180h.")}
        ${def("neu", "Recrutamento", "Contato que fala de vaga, currículo, emprego ou salário sai de todas as contas.")}
        ${def("agi", "Viu e não respondeu", "O celular da loja abriu a mensagem e passou mais de 30 min (loja aberta) sem resposta.")}
      </div></div></section>`;
}

// ---------- configuração ----------
const METAS_ROTULOS = {
  primeira_resposta_min: "1ª resposta até (minutos, loja aberta)", resposta_24h_pct: "Respondidos em até 24h (%)",
  entendeu_pct: "Entendeu o caso (%)", incluso_pct: "Explicou o que está incluso, de quem recebeu preço (%)",
  diferencial_pct: "Falou dos diferenciais (%)", convite_pct: "Chamou pra trazer a peça (%)",
  compromisso_pct: "Compromisso firmado (%)", relembrou_pct: "Relembrou o compromisso (%)",
  retorno_pct: "Retorno de orçamento sem resposta (%)", audio_max_pct: "Mensagens da loja em áudio, no máximo (%)",
};

function desenharConfig() {
  estado.acoes.clear(); estado.graficos.clear();
  const c = estado.conta, r = rede(), m = metas(), w = pesos(), av = estado.avisos || {};
  const [cls, txt] = statusConexao(c);
  const dias = [[1, "Segunda"], [2, "Terça"], [3, "Quarta"], [4, "Quinta"], [5, "Sexta"], [6, "Sábado"], [0, "Domingo"]];
  const h = c.horario || {};
  const linhasHorario = dias.map(([d, nome]) => {
    const v = h[d]; const fechado = !Array.isArray(v);
    return `<span>${nome}</span><input type="time" data-dia="${d}" data-p="0" value="${fechado ? "10:00" : esc(v[0])}" ${fechado ? "disabled" : ""} aria-label="${nome} abre">
      <input type="time" data-dia="${d}" data-p="1" value="${fechado ? "22:00" : esc(v[1])}" ${fechado ? "disabled" : ""} aria-label="${nome} fecha">
      <label class="check fechado-lbl"><input type="checkbox" data-fechado="${d}" ${fechado ? "checked" : ""}> fechado</label>`;
  }).join("");
  const metasForm = PILARES.map((p) => `<div class="metas-grupo p-${p.c}"><strong><i></i>${esc(p.nome)}</strong>
    ${p.kpis.map((k) => { const mk = META_DO_KPI[k.k]; return `<label class="meta-campo" for="meta-${mk}">${esc(METAS_ROTULOS[mk])}<input type="number" id="meta-${mk}" data-meta="${mk}" min="0" max="${mk.endsWith("_pct") ? 100 : 1440}" value="${esc(m[mk])}"></label>`; }).join("")}</div>`).join("");
  const pesosForm = PILARES.map((p) => `<label class="peso-campo p-${p.c}" for="peso-${p.k}"><i></i>${esc(p.nome)}<input type="number" id="peso-${p.k}" data-peso="${p.k}" min="0" max="100" value="${esc(w[p.k])}"></label>`).join("");
  const aviso = (k) => av[k] ? `${esc(av[k].valor)} <span class="suave">(${esc(haQuanto(av[k].em))})</span>` : `<span class="suave">nenhuma rodada ainda</span>`;
  const lote = estado.ultimoLote;
  const area = (id, valor, rows) => `<textarea id="${id}" rows="${rows}" maxlength="3000">${esc(valor || "")}</textarea>`;
  const ls = (rot, val) => `<div class="linha-simples"><span>${esc(rot)}</span><span>${val}</span></div>`;

  const secaoRede = `<section class="secao"><div class="secao-cab"><div><h2>Metas e pesos da rede · ${esc(r.nome)}</h2><p>Valem pras ${contasDaRede().length} unidades, pra comparação ser justa. Semana já fechada não muda.</p></div></div>
    <div class="config-grade">
      <div class="cartao">${cab("Metas", "O valor que vale 100 pontos em cada indicador.")}<div class="metas-form">${metasForm}</div></div>
      <div style="display:grid;gap:16px">
        <div class="cartao">${cab("Peso de cada pilar na nota", "Precisam somar 100. Recomendação: manter fixos por pelo menos três meses, pra evolução ser comparável.")}
          <div class="pesos-form">${pesosForm}<div class="soma"><span>Soma</span><strong id="soma-pesos" class="num"></strong></div><div id="previa-pesos"></div></div></div>
        <div class="cartao">${cab("O que a IA precisa saber da loja", "A IA usa esses textos pra reconhecer quando a equipe falou dos diferenciais e do que está incluso. Um item por linha.")}
          <div class="form-grade">
            <label class="campo">Diferenciais da loja${area("txt-diferenciais", r.diferenciais, 6)}</label>
            <label class="campo">O que está incluso nos serviços (ex.: "troca de sola inclui limpeza e hidratação")${area("txt-incluso", r.incluso, 5)}</label>
            <div><button class="btn" type="button" id="btn-salvar-rede">Salvar metas, pesos e textos</button></div>
          </div></div>
      </div>
    </div></section>`;

  const secaoUnidade = `<section class="secao"><div class="secao-cab"><div><h2>Unidade ${esc(c.unidade || c.nome)}</h2><p>Horário e mensagens automáticas desta unidade. Troque a unidade no seletor do topo.</p></div></div>
    <div class="cartao">${cab("Horário e mensagens automáticas", "O horário conta o tempo de resposta só com a loja aberta e monta o mapa de calor.")}
      <div class="config-grade">
        <div class="grade-horario">${linhasHorario}</div>
        <div class="form-grade">
          <label class="campo">Mensagens automáticas, uma por linha (saudação do anúncio, ausência). Ficam na conversa, mas não contam como resposta.
            <textarea id="textos-auto" rows="4">${esc((c.textos_automaticos || []).join("\n"))}</textarea></label>
          <div><button class="btn" type="button" id="btn-salvar-unidade">Salvar horário e mensagens automáticas</button></div>
        </div>
      </div></div></section>`;

  const secaoAdmin = ehAdmin() ? `<section class="secao"><div class="secao-cab"><div><h2>Conexão e acessos</h2><p>Só a The New Ads vê esta parte.</p></div></div>
    <div class="config-grade">
      <div class="cartao">${cab(`Conexão com a NeoGo · ${c.unidade || c.nome}`, "O sistema só escuta. Não existe envio de mensagem por aqui.")}
        <div class="linhas-simples">
          ${ls("Situação", `<span class="status ${cls}" style="color:var(--tinta-2)">${esc(txt)}</span>`)}
          ${ls("Instância", c.instance_id ? esc(c.instance_nome || c.instance_id) : "nenhuma ainda")}
          ${ls("Mensagens guardadas", `${n(c.mensagens)}${c.primeira_mensagem_em ? ` <span class="suave">desde ${esc(fmtDataHora(c.primeira_mensagem_em, true))}</span>` : ""}`)}
          ${c.importadas ? ls("Importadas do WhatsApp Web", n(c.importadas)) : ""}
          ${ls("Último evento recebido", `${esc(c.ultimo_evento_tipo || "–")}${c.ultimo_evento_em ? ` <span class="suave">${esc(haQuanto(c.ultimo_evento_em))}</span>` : ""}`)}
        </div>
        <div class="form-grade" style="margin-top:14px">
          <label class="campo">Endereço do webhook desta unidade (funciona como senha, não compartilhe)
            <div class="copiar"><input type="text" readonly value="${esc(c.webhook)}" id="webhook"><button class="btn-sec" type="button" id="btn-copiar">${ic("copiar")}Copiar</button></div></label>
          <ol class="passos">
            <li>Conecte o WhatsApp da unidade na NeoGo lendo o QR code com o celular da loja.</li>
            <li>Na instância, abra os webhooks e use um <strong>slot livre</strong>. Se já tiver um slot apontando pro n8n, não mexa nele.</li>
            <li>Cole o endereço acima, marque os eventos <code>Message</code> e <code>Receipt</code> (ou todos) e ative.</li>
            <li>Mande uma mensagem de outro número pra loja e responda pelo celular. Em até 1 minuto a situação muda pra "Recebendo".</li>
          </ol>
          <p class="nota-rodape">A primeira instância que mandar evento fica presa a esta unidade. Cada unidade tem o próprio endereço.</p>
        </div></div>
      <div class="cartao">${cab("OpenAI (áudios, fotos e leitura da IA)", "Áudio transcrito e foto descrita assim que chegam. Checklist em lote, uma vez por dia, às 4h.")}
        <div class="linhas-simples">
          ${ls("Áudios e fotos", aviso("transcricao"))}
          ${ls("Aguardando / com falha nesta unidade", `${n(c.midias_pendentes)} / ${n(c.midias_erro)}`)}
          ${ls("Leitura da IA", aviso("ia"))}
          ${ls("Último lote", lote ? `${esc(`${lote.status} (${lote.itens} itens)`)} <span class="suave">${esc(fmtDataHora(lote.criado_em))}</span>` : "nenhum")}
        </div>
        <ol class="passos" style="margin-top:14px">
          <li>Crie a chave em <code>platform.openai.com</code>, em API keys.</li>
          <li>No Supabase do CRM: Edge Functions, Secrets, adicionar <code>OPENAI_API_KEY</code> com a chave.</li>
          <li>Pronto: áudios e fotos começam a ser lidos em até 5 minutos e o primeiro lote sai às 4h.</li>
        </ol></div>
      <div class="cartao larga">${cab("Quem acessa", "Dono da rede vê as unidades e ajusta metas. Equipe vê só a própria unidade, sem configuração. Conta que já existe (gestor, CRM) só ganha o acesso, sem trocar a senha.")}
        <div class="config-grade">
          <div id="lista-usuarios"><p class="vazio">Carregando…</p></div>
          <form id="form-usuario" class="form-grade">
            <h4>Liberar ou alterar acesso</h4>
            <label class="campo">Nome<input type="text" id="u-nome" maxlength="200" required></label>
            <label class="campo">E-mail<input type="email" id="u-email" maxlength="200" required></label>
            <label class="campo">Senha inicial (só pra conta nova, mínimo 8)<input type="text" id="u-senha" autocomplete="off" minlength="8"></label>
            <label class="campo">Tipo de acesso<select id="u-papel">
              <option value="unidade">Equipe da unidade</option><option value="rede">Dono da rede (${esc(r.nome)})</option><option value="admin">Administrador (The New Ads)</option></select></label>
            <fieldset id="u-contas" class="campo"><legend>Unidades</legend>${estado.contas.map((x) => `<label class="check"><input type="checkbox" value="${esc(x.id)}"> ${esc(x.unidade || x.nome)}</label>`).join("")}</fieldset>
            <div><button class="btn" type="submit" id="btn-salvar-usuario">Salvar acesso</button></div>
            <p class="erro" id="erro-usuario" role="alert"></p>
          </form>
        </div></div>
    </div></section>` : "";

  $("#aba-config").innerHTML = secaoRede + secaoUnidade + secaoAdmin;

  const atualizarSoma = () => {
    const vals = Object.fromEntries($$("[data-peso]").map((i) => [i.dataset.peso, Number(i.value) || 0]));
    const s = Object.values(vals).reduce((t, v) => t + v, 0);
    const el = $("#soma-pesos"); el.textContent = s + (s === 100 ? "" : " (precisa ser 100)"); el.style.color = s === 100 ? "var(--bom)" : "var(--rui)";
    $("#previa-pesos").innerHTML = segmentada(PILARES.map((p) => ({ nome: p.nome, v: vals[p.k], cor: `var(--${p.c})`, tinta: p.c === "for" ? "var(--tinta)" : "#fff" })));
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
  $("#lista-usuarios").innerHTML = `<div>${lista.map((u) => `<div class="usuario">
      <span><strong>${esc(u.nome || u.email)}</strong><small>${esc(u.email || "")}</small></span>
      <span>${esc(PAPEIS[u.papel] || u.papel)}${u.papel === "unidade" ? `<small>${esc((u.contas || []).map(nomeConta).join(", "))}</small>` : ""}</span>
      <span class="acoes-u">${u.ultimo_acesso ? "entrou " + esc(haQuanto(u.ultimo_acesso)) : "nunca entrou"}
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
