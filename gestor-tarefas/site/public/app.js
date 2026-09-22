// Gestor de tarefas da The New Ads.
// Chave pública do projeto Supabase. Quem vê o quê é decidido pelo banco (RLS em tarefas.*), não pela chave.
const SUPABASE_URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
const VAPID_PUBLICA = "BIjOKRvucz3-CKve2E9L04tSd3hb3eEc5nU7AUzpggPhZC7_97hsh75ABRG56WIS9eU7xdf4hH4NHSJ9TW9SheI";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// As tabelas ficam no schema tarefas; a API acessa pelas views tarefas_* em public (mesmo RLS).
const VIEWS = { tarefas: "tarefas_tarefas", tarefa_responsaveis: "tarefas_responsaveis", tarefas_visao: "tarefas_visao" };
const db = () => ({ from: (tabela) => sb.from(VIEWS[tabela] || "tarefas_" + tabela) });

const PRIORIDADES = [
  { id: "urgente", nome: "Urgente", peso: 0 },
  { id: "alta", nome: "Alta", peso: 1 },
  { id: "normal", nome: "Normal", peso: 2 },
  { id: "baixa", nome: "Baixa", peso: 3 },
];
const PESO_PRIO = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.peso]));
const NOME_PRIO = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.nome]));
const SITUACOES = [
  { id: "atrasada", nome: "Atrasadas", cor: "#EF4444" },
  { id: "vence_hoje", nome: "Vence hoje", cor: "#FACC15" },
  { id: "a_vencer", nome: "A vencer", cor: "#60A5FA" },
  { id: "sem_data", nome: "Sem data", cor: "#8A8A8A" },
  { id: "concluida", nome: "Concluídas", cor: "#4ADE80" },
];
const NOME_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.id, s.nome]));
const RECORRENCIAS = { diaria: ["dia", "dias"], semanal: ["semana", "semanas"], mensal: ["mês", "meses"], anual: ["ano", "anos"] };

const S = {
  user: null, eu: null,
  usuarios: [], status: [], projetos: [], pastas: [], listas: [], tarefas: [],
  comentarios: [], aberta: null, abaAjustes: "conta", add: null, grupos: [], ultimo: null,
};
const expandidos = new Set(lerLocal("tf_expandidos", []));

function novoFiltro(extra = {}) {
  return { busca: "", local: [], status: [], responsavel: "", prioridade: "", prazo: [], dias: "7", de: "", ate: "", agrupar: "situacao", visao: "lista", ordenar: "prazo", concluidas: false, ...extra };
}
const filtros = {
  central: novoFiltro({ prazo: ["atrasada", "vence_hoje"], agrupar: "pasta" }),
  minhas: novoFiltro({ responsavel: "eu" }),
  local: novoFiltro({ agrupar: "status" }),
};

/* ---------------- utilidades ---------------- */
function lerLocal(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
}
function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function norm(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
function porNome(a, b) {
  return a.nome.localeCompare(b.nome, "pt-BR", { numeric: true, sensitivity: "base" });
}
function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function dataBR(iso, comAno) {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return comAno || a !== hojeSP().slice(0, 4) ? `${d}/${m}/${a.slice(2)}` : `${d}/${m}`;
}
function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}
function dias(n) {
  return `${n} ${n === 1 ? "dia" : "dias"}`;
}
function iniciais(nome) {
  const p = String(nome || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}
function corDoNome(nome) {
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 32%)`;
}
function usuario(id) {
  return S.usuarios.find((u) => u.user_id === id);
}
function statusPorId(id) {
  return S.status.find((s) => s.id === id);
}
function primeiroStatus(tipo) {
  return S.status.filter((s) => s.tipo === tipo).sort((a, b) => a.ordem - b.ordem)[0];
}

const ICONES = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
  pasta: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  lista: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
  mais: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  bandeira: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 21V4h11l-1.5 4L16 12H7v9Z"/></svg>',
  repetir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  sub: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v10a4 4 0 0 0 4 4h9"/><path d="m15 13 4 4-4 4"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  pessoa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.3-3.4 4-5.2 7-5.2s5.7 1.8 7 5.2"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
};

/* ---------------- avisos, modal e menu ---------------- */
let timerToast;
function toast(msg, erro) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast ativo" + (erro ? " erro" : "");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.className = "toast"; }, erro ? 5000 : 2600);
}
function erroBanco(error, padrao) {
  const m = error?.message || "";
  if (m.includes("tarefas_check") || m.includes("data_inicio")) return "A data de início não pode ser depois da entrega.";
  if (m.includes("violates foreign key") && m.includes("status")) return "Esse status está em uso por alguma tarefa.";
  if (m.includes("pelo menos um admin")) return "O gestor precisa de pelo menos um admin ativo.";
  if (m.includes("dentro dela mesma")) return "Uma pasta não pode ficar dentro dela mesma.";
  return (padrao || "Não deu certo") + (m ? `: ${m}` : ".");
}

let resolverModal = null;
function abrirModal(html, aoAbrir) {
  const veu = document.getElementById("modal-veu");
  document.getElementById("modal").innerHTML = html;
  veu.classList.add("ativo");
  aoAbrir?.(document.getElementById("modal"));
  return new Promise((r) => { resolverModal = r; });
}
function fecharModal(valor) {
  document.getElementById("modal-veu").classList.remove("ativo");
  const r = resolverModal;
  resolverModal = null;
  r?.(valor);
}
document.getElementById("modal-veu").addEventListener("mousedown", (e) => {
  if (e.target.id === "modal-veu") fecharModal(null);
});

function pedirTexto({ titulo, rotulo, valor = "", botao = "Salvar", extra = "" }) {
  return abrirModal(`
    <form id="form-modal">
      <h2>${esc(titulo)}</h2>
      <div class="campo" style="margin-top:14px"><label for="modal-texto">${esc(rotulo)}</label>
        <input type="text" id="modal-texto" value="${esc(valor)}" required maxlength="200"></div>
      ${extra}
      <div class="acoes"><button type="button" class="btn btn-fantasma" onclick="fecharModal(null)">Cancelar</button>
        <button class="btn">${esc(botao)}</button></div>
    </form>`, (m) => {
    const input = m.querySelector("#modal-texto");
    input.focus();
    input.select();
    m.querySelector("#form-modal").addEventListener("submit", (e) => {
      e.preventDefault();
      const extras = Object.fromEntries([...m.querySelectorAll("[data-extra]")].map((el) => [el.dataset.extra, el.value]));
      const texto = input.value.trim();
      if (texto) fecharModal({ texto, ...extras });
    });
  });
}
function confirmar({ titulo, texto, botao = "Excluir" }) {
  return abrirModal(`
    <h2>${esc(titulo)}</h2><p>${texto}</p>
    <div class="acoes"><button class="btn btn-fantasma" onclick="fecharModal(false)">Cancelar</button>
      <button class="btn btn-perigo" id="btn-confirmar">${esc(botao)}</button></div>`,
  (m) => m.querySelector("#btn-confirmar").addEventListener("click", () => fecharModal(true)));
}
function escolher({ titulo, rotulo, opcoes, valor, botao = "Mover" }) {
  return abrirModal(`
    <form id="form-modal">
      <h2>${esc(titulo)}</h2>
      <div class="campo" style="margin-top:14px"><label for="modal-sel">${esc(rotulo)}</label>
        <select id="modal-sel">${opcoes.map((o) => `<option value="${esc(o.v)}"${o.v === valor ? " selected" : ""}>${esc(o.t)}</option>`).join("")}</select></div>
      <div class="acoes"><button type="button" class="btn btn-fantasma" onclick="fecharModal(null)">Cancelar</button>
        <button class="btn">${esc(botao)}</button></div>
    </form>`, (m) => m.querySelector("#form-modal").addEventListener("submit", (e) => {
    e.preventDefault();
    fecharModal(m.querySelector("#modal-sel").value);
  }));
}

function abrirMenu(ancora, itens) {
  const menu = document.getElementById("menu-flutuante");
  menu.innerHTML = itens.map((it, i) => it === "-" ? "<hr>" :
    `<button data-i="${i}" class="${it.perigo ? "perigo" : ""}${it.atual ? " atual" : ""}">${it.cor ? `<span class="bolinha-menu" style="background:${esc(it.cor)}"></span>` : ""}${esc(it.t)}${it.atual ? '<span class="marcado-menu">✓</span>' : ""}</button>`).join("");
  menu.classList.add("ativo");
  ancoraMenu = ancora;
  const r = ancora.getBoundingClientRect();
  const largura = menu.offsetWidth, altura = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.right - largura, innerWidth - largura - 8)) + "px";
  menu.style.top = (r.bottom + altura + 8 > innerHeight ? Math.max(8, r.top - altura - 4) : r.bottom + 4) + "px";
  menu.onclick = (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    fecharMenu();
    itens[Number(b.dataset.i)].acao();
  };
}
function fecharMenu() {
  document.getElementById("menu-flutuante").classList.remove("ativo", "painel");
  ancoraMenu = null;
}
// Menus e janelinhas (status, datas, filtros, ⋯): qualquer clique fora fecha; clicar de novo no
// mesmo botão fecha em vez de reabrir; rolar a página também fecha, porque a janela fica solta na tela.
let ancoraMenu = null, ignorarClique = null;
function menuAberto() { return document.getElementById("menu-flutuante").classList.contains("ativo"); }
document.addEventListener("pointerdown", (e) => {
  if (!menuAberto() || e.target.closest("#menu-flutuante")) return;
  if (ancoraMenu && ancoraMenu.isConnected && ancoraMenu.contains(e.target)) ignorarClique = ancoraMenu;
  fecharMenu();
}, true);
document.addEventListener("click", (e) => {
  if (ignorarClique && ignorarClique.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
  ignorarClique = null;
}, true);
document.addEventListener("scroll", (e) => {
  if (menuAberto() && !(e.target instanceof Element && e.target.closest("#menu-flutuante"))) fecharMenu();
}, true);
// Só a mudança de largura fecha o menu: no celular, esconder a barra do navegador ou abrir o
// teclado dispara resize de altura e fechava a janelinha na cara do usuário sem motivo.
let larguraJanela = innerWidth;
window.addEventListener("resize", () => {
  if (innerWidth === larguraJanela) return;
  larguraJanela = innerWidth;
  if (menuAberto()) fecharMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.getElementById("modal-veu").classList.contains("ativo")) fecharModal(null);
  else if (document.getElementById("menu-flutuante").classList.contains("ativo")) fecharMenu();
  else if (S.add) cancelarAdicionar();
  else if (S.aberta) fecharTarefa();
});

/* ---------------- autenticação ---------------- */
function aviso(id, msg, tipo) {
  const el = document.getElementById(id);
  el.className = "aviso" + (tipo ? " " + tipo : "");
  el.textContent = msg;
}

async function precisaSegundaEtapa() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw new Error("Não foi possível verificar a segurança da sessão. Tente entrar novamente.");
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("btn-entrar");
  btn.disabled = true;
  aviso("aviso-login", "Entrando...");
  const { data, error } = await sb.auth.signInWithPassword({
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("senha").value,
  });
  btn.disabled = false;
  if (error) {
    aviso("aviso-login", error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não deu pra entrar: " + error.message, "erro");
    return;
  }
  aviso("aviso-login", "");
  try {
    if (await precisaSegundaEtapa()) return pedirCodigo();
    await entrar(data.session);
  } catch (err) { aviso("aviso-login", err.message, "erro"); }
});

function pedirCodigo() {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-codigo").style.display = "";
  document.getElementById("codigo-2fa").focus();
}

document.getElementById("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codigo = document.getElementById("codigo-2fa").value.replace(/\D/g, "");
  if (codigo.length !== 6) return aviso("aviso-codigo", "O código tem 6 dígitos.", "erro");
  const btn = document.getElementById("btn-verificar");
  btn.disabled = true;
  aviso("aviso-codigo", "Verificando...");
  const { data: fatores } = await sb.auth.mfa.listFactors();
  const fator = (fatores?.totp || []).find((f) => f.status === "verified");
  let erro = fator ? null : "Nenhum aplicativo autenticador cadastrado.";
  if (fator) {
    const { data: desafio, error: e1 } = await sb.auth.mfa.challenge({ factorId: fator.id });
    const { error: e2 } = e1 ? { error: e1 } : await sb.auth.mfa.verify({ factorId: fator.id, challengeId: desafio.id, code: codigo });
    erro = e2 ? (e2.message.includes("Invalid") ? "Código incorreto ou expirado." : e2.message) : null;
  }
  btn.disabled = false;
  if (erro) {
    document.getElementById("codigo-2fa").value = "";
    return aviso("aviso-codigo", erro, "erro");
  }
  const { data } = await sb.auth.getSession();
  entrar(data.session);
});

async function sair() {
  await sb.auth.signOut();
  location.hash = "";
  location.reload();
}

async function iniciar() {
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (!data.session) return;
    if (await precisaSegundaEtapa()) return pedirCodigo();
    await entrar(data.session);
  } catch (err) { aviso("aviso-login", err.message, "erro"); }
}

async function entrar(sessao) {
  S.user = sessao.user;
  const { data: eu, error } = await db().from("usuarios").select("*").eq("user_id", S.user.id).maybeSingle();
  if (error || !eu || !eu.ativo) {
    document.getElementById("form-login").style.display = "none";
    document.getElementById("form-codigo").style.display = "none";
    document.getElementById("sem-acesso").style.display = "";
    if (error) document.querySelector("#sem-acesso .sub").textContent = "Não deu pra conferir seu acesso: " + error.message;
    return;
  }
  S.eu = eu;
  document.getElementById("tela-login").style.display = "none";
  document.getElementById("app").classList.add("ativo");
  const usuarioNome = document.getElementById("usuario-nome");
  if (usuarioNome) usuarioNome.textContent = eu.nome + " · " + eu.email;
  try {
    await carregar();
  } catch (e) {
    toast(erroBanco(e, "Não deu pra carregar"), true);
  }
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/central");
  rotear();
  registrarServiceWorker();
  setInterval(atualizarEmSegundoPlano, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizarEmSegundoPlano(); });
}

/* ---------------- dados ---------------- */
async function buscarTodas(tabela, ordem) {
  const todas = [];
  for (let de = 0; ; de += 1000) {
    let consulta = db().from(tabela).select("*").order(ordem);
    if (ordem !== "id") consulta = consulta.order(tabela === "usuarios" ? "user_id" : "id");
    const { data, error } = await consulta.range(de, de + 999);
    if (error) throw error;
    todas.push(...data);
    if (data.length < 1000) return todas;
  }
}

async function carregar() {
  const [usuarios, status, projetos, pastas, listas, tarefas] = await Promise.all([
    buscarTodas("usuarios", "nome"), buscarTodas("status", "ordem"), buscarTodas("projetos", "nome"),
    buscarTodas("pastas", "nome"), buscarTodas("listas", "nome"), buscarTodas("tarefas_visao", "id"),
  ]);
  const eu = usuarios.find(u => u.user_id === S.user?.id && u.ativo);
  if (!eu) {
    bloquearInterface();
    throw new Error("Seu acesso não está disponível. Entre novamente.");
  }
  Object.assign(S, { eu, usuarios, status, projetos: projetos.sort(porNome), pastas: pastas.sort(porNome), listas: listas.sort(porNome), tarefas });
  if (S.aberta && !tarefas.some(t => t.id === S.aberta)) {
    fecharTarefa();
    S.comentarios = [];
    document.getElementById('gaveta').innerHTML = '';
  }
  if (S.add && !listas.some(l => l.id === S.add.lista_id)) S.add = null;
}

let carregando = false;
async function atualizarEmSegundoPlano() {
  if (carregando || document.hidden || !S.eu || gravacoesPendentes.size) return;
  const foco = document.activeElement;
  const preservar = S.add || S.aberta || (typeof editorMembro !== 'undefined' && editorMembro) ||
    foco?.matches('input, textarea, select') || document.getElementById('modal-veu').classList.contains('ativo');
  const eraAdmin = S.eu.admin;
  carregando = true;
  try {
    await carregar();
    if (!preservar || (eraAdmin && !S.eu.admin)) renderTudo();
    else {
      renderArvore(); renderContadores();
      if (document.getElementById('lista-tarefas')) renderResultadoAtual();
    }
  } catch { /* tenta de novo no próximo ciclo */ }
  carregando = false;
}

async function recarregarERender() {
  try {
    await carregar();
  } catch (e) {
    toast(erroBanco(e, "Não deu pra atualizar"), true);
  }
  renderTudo();
}

/* ---------------- estrutura (projeto > pastas > listas) ---------------- */
function pastasFilhas(projetoId, paiId) {
  return S.pastas.filter((p) => p.projeto_id === projetoId && (p.pasta_pai_id || null) === (paiId || null));
}
function listasEm(projetoId, pastaId) {
  return S.listas.filter((l) => l.projeto_id === projetoId && (l.pasta_id || null) === (pastaId || null));
}
function pastasDescendentes(pastaId) {
  const ids = new Set([pastaId]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const p of S.pastas) if (p.pasta_pai_id && ids.has(p.pasta_pai_id) && !ids.has(p.id)) { ids.add(p.id); mudou = true; }
  }
  return ids;
}
function listasDoLocal(ref) {
  const [tipo, id] = String(ref).split(":");
  if (tipo === "lista") return new Set([id]);
  if (tipo === "projeto") return new Set(S.listas.filter((l) => l.projeto_id === id).map((l) => l.id));
  if (tipo === "pasta") {
    const pastas = pastasDescendentes(id);
    return new Set(S.listas.filter((l) => l.pasta_id && pastas.has(l.pasta_id)).map((l) => l.id));
  }
  return null;
}
function caminhoPasta(pastaId) {
  const nomes = [];
  let p = S.pastas.find((x) => x.id === pastaId);
  while (p) {
    nomes.unshift(p.nome);
    p = S.pastas.find((x) => x.id === p.pasta_pai_id);
  }
  return nomes;
}
function caminhoLista(listaId) {
  const l = S.listas.find((x) => x.id === listaId);
  if (!l) return [];
  const projeto = S.projetos.find((p) => p.id === l.projeto_id);
  return [projeto?.nome, ...(l.pasta_id ? caminhoPasta(l.pasta_id) : []), l.nome].filter(Boolean);
}
// Opções de lista para selects, com o caminho completo.
function opcoesListas(listaIds) {
  return S.listas
    .filter((l) => !listaIds || listaIds.has(l.id))
    .map((l) => ({ v: l.id, t: caminhoLista(l.id).join(" › ") }))
    .sort((a, b) => a.t.localeCompare(b.t, "pt-BR", { numeric: true }));
}

function contagemAbertas(listaIds) {
  let abertas = 0, atrasadas = 0;
  for (const t of S.tarefas) {
    if (!listaIds.has(t.lista_id) || t.situacao === "concluida") continue;
    abertas++;
    if (t.situacao === "atrasada") atrasadas++;
  }
  return { abertas, atrasadas };
}

/* ---------------- rotas ---------------- */
function rotaAtual() {
  const [caminho, busca] = location.hash.replace(/^#\/?/, "").split("?");
  const [tipo, id] = caminho.split("/");
  return { tipo: tipo || "central", id, tarefa: new URLSearchParams(busca || "").get("t") };
}
function irPara(hash) {
  fecharMenuLateral();
  location.hash = hash;
}
window.addEventListener("hashchange", rotear);

function rotear() {
  if (!S.eu) return;
  // "Minhas tarefas" saiu do menu: o Modo eu da Central faz o mesmo.
  if (rotaAtual().tipo === "minhas") history.replaceState(null, "", "#/central");
  limparSelecao(false);
  const r = rotaAtual();
  if (r.tarefa && S.tarefas.some((t) => t.id === r.tarefa)) abrirTarefa(r.tarefa, true);
  else if (S.aberta && !r.tarefa) fecharTarefa(true);
  renderTudo();
}

function renderTudo() {
  if (!S.eu) return;
  document.querySelectorAll('[data-acao="novo-projeto"]').forEach(b => { b.hidden = !S.eu.admin; });
  renderArvore();
  renderContadores();
  const r = rotaAtual();
  document.querySelectorAll("[data-rota]").forEach((b) => b.classList.toggle("ativo", b.dataset.rota === "#/" + r.tipo));
  if (r.tipo === "ajustes") renderAjustes();
  else renderVisao(r);
  if (S.aberta) renderGaveta();
}

/* ---------------- barra lateral ---------------- */
function renderContadores() {
  const atrasadas = S.tarefas.filter((t) => t.situacao === "atrasada").length;
  const minhas = S.tarefas.filter((t) => (t.situacao === "atrasada" || t.situacao === "vence_hoje") && t.responsaveis.includes(S.user.id)).length;
  document.getElementById("cont-atraso").textContent = atrasadas || "";
  document.getElementById("cont-atraso").title = atrasadas ? `${atrasadas} em atraso` : "";
  const contMinhas = document.getElementById("cont-minhas");
  if (contMinhas) contMinhas.textContent = minhas || "";
}

function renderArvore() {
  const r = rotaAtual();
  const ativo = `${r.tipo}:${r.id}`;
  const html = [];
  const qtd = (ids) => {
    const c = contagemAbertas(ids);
    return c.atrasadas ? `<span class="qtd alerta" title="${c.atrasadas} em atraso">${c.abertas}</span>` : `<span class="qtd">${c.abertas || ""}</span>`;
  };
  const no = (tipo, obj, nivel, temFilhos, conteudoIcone) => {
    const chave = `${tipo}:${obj.id}`;
    const aberto = expandidos.has(chave);
    return `<div class="no ${tipo}${chave === ativo ? " ativo" : ""}" style="padding-left:${6 + nivel * 14}px" onclick="irPara('#/${tipo}/${obj.id}')">
      ${tipo === "lista" ? '<span class="seta vazia"></span>' : `<button class="seta${aberto ? " aberta" : ""}${temFilhos ? "" : " vazia"}" onclick="event.stopPropagation();alternar('${chave}')" aria-label="${aberto ? "Recolher" : "Expandir"}">${ICONES.seta}</button>`}
      ${conteudoIcone}<span class="nome">${esc(obj.nome)}</span>${tipo === "lista" ? qtd(listasDoLocal(chave)) : ""}
      ${S.eu.admin ? `<button class="icone-btn mini mais" data-menu onclick="event.stopPropagation();menuDe('${tipo}','${obj.id}',this)" aria-label="Opções">${ICONES.mais}</button>` : ''}
    </div>`;
  };
  const desenharConteudo = (projetoId, pastaId, nivel) => {
    for (const p of pastasFilhas(projetoId, pastaId)) {
      const temFilhos = pastasFilhas(projetoId, p.id).length || listasEm(projetoId, p.id).length;
      html.push(no("pasta", p, nivel, temFilhos, ICONES.pasta));
      if (expandidos.has("pasta:" + p.id)) desenharConteudo(projetoId, p.id, nivel + 1);
    }
    for (const l of listasEm(projetoId, pastaId)) html.push(no("lista", l, nivel, false, ICONES.lista));
  };
  for (const p of S.projetos) {
    const temFilhos = S.pastas.some((x) => x.projeto_id === p.id) || S.listas.some((x) => x.projeto_id === p.id);
    html.push(no("projeto", p, 0, temFilhos, `<span class="ponto" style="background:${esc(p.cor)}"></span>`));
    if (expandidos.has("projeto:" + p.id)) desenharConteudo(p.id, null, 1);
  }
  document.getElementById("arvore").innerHTML = html.join("") ||
    `<div class="arvore-vazia">${S.eu.admin ? 'Nenhum espaço ainda. Use o + acima para criar o primeiro.' : 'Nenhum espaço liberado. Peça acesso ao administrador.'}</div>`;
}

function alternar(chave) {
  expandidos.has(chave) ? expandidos.delete(chave) : expandidos.add(chave);
  gravarLocal("tf_expandidos", [...expandidos]);
  renderArvore();
}
function expandirAte(tipo, id) {
  let pastaId = null, projetoId = null;
  if (tipo === "lista") { const l = S.listas.find((x) => x.id === id); pastaId = l?.pasta_id; projetoId = l?.projeto_id; }
  if (tipo === "pasta") { const p = S.pastas.find((x) => x.id === id); pastaId = p?.pasta_pai_id; projetoId = p?.projeto_id; }
  if (projetoId) expandidos.add("projeto:" + projetoId);
  while (pastaId) {
    expandidos.add("pasta:" + pastaId);
    pastaId = S.pastas.find((x) => x.id === pastaId)?.pasta_pai_id;
  }
  gravarLocal("tf_expandidos", [...expandidos]);
}

function abrirMenuLateral() { document.getElementById("app").classList.add("menu-aberto"); }
function fecharMenuLateral() { document.getElementById("app").classList.remove("menu-aberto"); }

/* ---------------- criar, renomear, mover, excluir estrutura ---------------- */
async function novoProjeto() {
  const r = await pedirTexto({
    titulo: "Novo espaço", rotulo: "Nome", botao: "Criar",
    extra: '<div class="campo"><label for="modal-cor">Cor</label><input type="color" id="modal-cor" data-extra="cor" value="#FF6A00" style="width:60px;height:38px;padding:3px;background:var(--grafite);border:1px solid var(--linha);border-radius:8px"></div>',
  });
  if (!r) return;
  const { data, error } = await db().from("projetos").insert({ nome: r.texto, cor: r.cor.toUpperCase() }).select().single();
  if (error) return toast(erroBanco(error, "Não deu pra criar"), true);
  expandidos.add("projeto:" + data.id);
  gravarLocal("tf_expandidos", [...expandidos]);
  await recarregarERender();
  irPara("#/projeto/" + data.id);
}

async function novaPasta(projetoId, paiId) {
  const r = await pedirTexto({ titulo: paiId ? "Nova subpasta" : "Nova pasta", rotulo: "Nome", botao: "Criar" });
  if (!r) return;
  const { data, error } = await db().from("pastas").insert({ projeto_id: projetoId, pasta_pai_id: paiId || null, nome: r.texto }).select().single();
  if (error) return toast(erroBanco(error, "Não deu pra criar"), true);
  S.pastas.push(data);
  expandirAte("pasta", data.id);
  await recarregarERender();
  irPara("#/pasta/" + data.id);
}

async function novaLista(projetoId, pastaId) {
  const r = await pedirTexto({ titulo: "Nova lista", rotulo: "Nome", botao: "Criar" });
  if (!r) return;
  const { data, error } = await db().from("listas").insert({ projeto_id: projetoId, pasta_id: pastaId || null, nome: r.texto }).select().single();
  if (error) return toast(erroBanco(error, "Não deu pra criar"), true);
  S.listas.push(data);
  expandirAte("lista", data.id);
  await recarregarERender();
  irPara("#/lista/" + data.id);
}

const TABELA = { projeto: "projetos", pasta: "pastas", lista: "listas" };
function objeto(tipo, id) {
  return S[TABELA[tipo]].find((x) => x.id === id);
}

async function renomear(tipo, id) {
  const obj = objeto(tipo, id);
  const r = await pedirTexto({ titulo: "Renomear", rotulo: "Nome", valor: obj.nome });
  if (!r) return;
  const { error } = await db().from(TABELA[tipo]).update({ nome: r.texto }).eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra renomear"), true);
  recarregarERender();
}

async function mudarCor(id) {
  const p = objeto("projeto", id);
  const r = await pedirTexto({
    titulo: "Nome e cor do espaço", rotulo: "Nome", valor: p.nome,
    extra: `<div class="campo"><label for="modal-cor">Cor</label><input type="color" id="modal-cor" data-extra="cor" value="${esc(p.cor)}" style="width:60px;height:38px;padding:3px;background:var(--grafite);border:1px solid var(--linha);border-radius:8px"></div>`,
  });
  if (!r) return;
  const { error } = await db().from("projetos").update({ nome: r.texto, cor: r.cor.toUpperCase() }).eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra salvar"), true);
  recarregarERender();
}

async function mover(tipo, id) {
  const opcoes = [];
  const proibidas = tipo === "pasta" ? pastasDescendentes(id) : new Set();
  for (const p of S.projetos) {
    opcoes.push({ v: `projeto:${p.id}`, t: `${p.nome} (raiz do espaço)` });
    for (const pa of S.pastas.filter((x) => x.projeto_id === p.id && !proibidas.has(x.id))) {
      opcoes.push({ v: `pasta:${pa.id}`, t: [p.nome, ...caminhoPasta(pa.id)].join(" › ") });
    }
  }
  const obj = objeto(tipo, id);
  const pai = tipo === "pasta" ? obj.pasta_pai_id : obj.pasta_id;
  const escolha = await escolher({ titulo: tipo === "pasta" ? "Mover pasta" : "Mover lista", rotulo: "Para onde", opcoes, valor: pai ? `pasta:${pai}` : `projeto:${obj.projeto_id}` });
  if (!escolha) return;
  const [destTipo, destId] = escolha.split(":");
  const projetoId = destTipo === "projeto" ? destId : S.pastas.find((x) => x.id === destId).projeto_id;
  const pastaId = destTipo === "pasta" ? destId : null;
  const patch = tipo === "pasta" ? { projeto_id: projetoId, pasta_pai_id: pastaId } : { projeto_id: projetoId, pasta_id: pastaId };
  const { error } = await db().from(TABELA[tipo]).update(patch).eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra mover"), true);
  await recarregarERender();
  expandirAte(tipo, id);
  renderArvore();
  toast("Movido.");
}

async function excluir(tipo, id) {
  const obj = objeto(tipo, id);
  const ids = listasDoLocal(`${tipo}:${id}`);
  const n = S.tarefas.filter((t) => ids.has(t.lista_id)).length;
  const oque = { projeto: "o espaço", pasta: "a pasta", lista: "a lista" }[tipo];
  const ok = await confirmar({
    titulo: `Excluir ${oque}?`,
    texto: `<b>${esc(obj.nome)}</b> será excluído${tipo === "projeto" ? "" : "a"} junto com tudo o que tem dentro${n ? `, incluindo <b>${n} ${n === 1 ? "tarefa" : "tarefas"}</b>` : ""}. Não tem como desfazer.`,
  });
  if (!ok) return;
  const { error } = await db().from(TABELA[tipo]).delete().eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra excluir"), true);
  const r = rotaAtual();
  await recarregarERender();
  if (r.id && TABELA[r.tipo] && !objeto(r.tipo, r.id)) irPara("#/central");
  toast("Excluído.");
}

function menuDe(tipo, id, ancora) {
  if (!S.eu.admin) return;
  const obj = objeto(tipo, id);
  const itens = [];
  if (tipo === "projeto") {
    itens.push({ t: "Nova pasta", acao: () => novaPasta(id, null) }, { t: "Nova lista", acao: () => novaLista(id, null) }, "-",
      { t: "Nome e cor", acao: () => mudarCor(id) });
  }
  if (tipo === "pasta") {
    itens.push({ t: "Nova subpasta", acao: () => novaPasta(obj.projeto_id, id) }, { t: "Nova lista", acao: () => novaLista(obj.projeto_id, id) }, "-",
      { t: "Renomear", acao: () => renomear(tipo, id) }, { t: "Mover", acao: () => mover(tipo, id) });
  }
  if (tipo === "lista") {
    itens.push({ t: "Renomear", acao: () => renomear(tipo, id) }, { t: "Mover", acao: () => mover(tipo, id) });
  }
  itens.push("-", { t: "Excluir", perigo: true, acao: () => excluir(tipo, id) });
  abrirMenu(ancora, itens);
}

/* ---------------- filtros ---------------- */
function casaPrazo(p, t, f) {
  if (p === "a_vencer") return t.situacao === "a_vencer" && (!f.dias || t.dias_para_vencer <= Number(f.dias));
  return t.situacao === p;
}

function filtroDaRota(r) {
  return r.tipo === "central" ? filtros.central : r.tipo === "minhas" ? filtros.minhas : filtros.local;
}

function mudarFiltro(campo, valor) {
  const f = filtroDaRota(rotaAtual());
  if (Array.isArray(f[campo])) {
    f[campo] = f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor];
  } else {
    f[campo] = valor;
  }
  renderVisao(rotaAtual());
}
function soPrazo(valor) {
  const f = filtroDaRota(rotaAtual());
  f.prazo = f.prazo.length === 1 && f.prazo[0] === valor ? [] : [valor];
  renderVisao(rotaAtual());
}
function limparFiltros() {
  const r = rotaAtual();
  const chave = r.tipo === "central" ? "central" : r.tipo === "minhas" ? "minhas" : "local";
  const { agrupar, visao, ordenar, _escopo } = filtros[chave];
  filtros[chave] = novoFiltro({ agrupar, visao, ordenar, _escopo, ...(chave === "minhas" ? { responsavel: "eu" } : {}) });
  renderVisao(r);
}

/* ---------------- visão de tarefas (central, minhas, projeto, pasta, lista) ---------------- */
function vazioSemLista(r) {
  if (!S.eu.admin) return '<div class="vazio"><h3>Nenhuma lista disponível</h3>Peça ao administrador para liberar um espaço ou uma lista para você.</div>';
  if (!S.projetos.length) {
    return `<div class="vazio"><h3>Comece criando um espaço</h3>Espaço guarda pastas, pasta guarda subpastas e listas, e lista guarda as tarefas.<br>
      <button class="btn" onclick="novoProjeto()">Novo espaço</button></div>`;
  }
  if (r.tipo === "central" || r.tipo === "minhas") {
    return `<div class="vazio"><h3>Nenhuma lista ainda</h3>Toda tarefa mora numa lista. Crie uma lista dentro de um espaço pelo menu ⋯ na barra lateral.</div>`;
  }
  const obj = objeto(r.tipo, r.id);
  const projetoId = r.tipo === "projeto" ? r.id : obj.projeto_id;
  return `<div class="vazio"><h3>Nenhuma lista aqui</h3>Crie uma lista para começar a lançar tarefas.<br>
    <button class="btn" onclick="novaLista('${projetoId}', ${r.tipo === "pasta" ? `'${r.id}'` : "null"})">Nova lista</button></div>`;
}

function abrirPainel(ancora, html) {
  const menu = document.getElementById("menu-flutuante");
  menu.innerHTML = html;
  menu.onclick = null;
  menu.classList.add("ativo", "painel");
  ancoraMenu = ancora;
  const r = ancora.getBoundingClientRect();
  const largura = menu.offsetWidth, altura = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.left, innerWidth - largura - 8)) + "px";
  // Abre abaixo; se não couber, acima do botão; em último caso, colado no topo.
  const abaixo = r.bottom + 6, acima = r.top - altura - 6;
  menu.style.top = (abaixo + altura <= innerHeight - 8 ? abaixo : acima >= 8 ? acima : Math.max(8, innerHeight - altura - 8)) + "px";
}

function renderResultado(r, f, escopo) {
  S.ultimo = { r, f, escopo };
  // Cartões de prazo: contam tudo o que passa pelos outros filtros, sem o filtro de prazo.
  const base = filtrar(f, escopo, { ignorarPrazo: true });
  const conta = (p) => base.filter((t) => casaPrazo(p, t, f)).length;
  const card = (p, rotulo) => `<button class="card-prazo ${p}${f.prazo.length === 1 && f.prazo[0] === p ? " ligado" : ""}" onclick="soPrazo('${p}')">
      <span class="n">${conta(p)}</span><span class="r">${rotulo}</span></button>`;
  document.getElementById("resumo").innerHTML =
    card("atrasada", "Em atraso") + card("vence_hoje", "Vencem hoje") +
    card("a_vencer", f.dias ? `A vencer em ${f.dias} dias` : "A vencer") + card("sem_data", "Sem data");

  const tarefas = filtrar(f, escopo).sort((a, b) => ordenarVisao(a, b, f.ordenar));
  const alvo = document.getElementById("lista-tarefas");
  if (f.visao === "quadro") { renderQuadro(alvo, tarefas, escopo); return renderBarraLote(); }
  if (f.agrupar === "pasta") { renderPorLista(alvo, tarefas, escopo); return renderBarraLote(); }
  const mostrarCaminho = r.tipo !== "lista";
  const grupos = tarefas.length ? agrupar(tarefas, f.agrupar) : [{ chave: "tudo", nome: "", itens: [] }];
  S.grupos = grupos;
  alvo.innerHTML = grupos.map((g) => `
    <div class="grupo">
      ${g.nome ? `<div class="grupo-cabeca ${g.classe || ""}"><span class="bolinha" style="background:${g.cor}"></span><h2>${esc(g.nome)}</h2><span class="n">${g.itens.length}</span></div>` : ""}
      <div class="tabela" role="list">
        ${g.itens.length ? `<div class="cab-colunas"><span class="col-check">${caixaGrupo(g)}</span><span>Tarefa</span><span>Status</span><span>Responsável</span><span>Entrega</span><span class="col-prio">Prioridade</span><span></span></div>` : ""}
        ${g.itens.map((t) => linhaTarefa(t, mostrarCaminho)).join("")}
        ${linhaAdicionar(g, escopo)}
      </div>
    </div>`).join("") + (tarefas.length ? "" : `<p class="dica-vazia">${S.tarefas.some((t) => !escopo || escopo.has(t.lista_id)) ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa ainda."}</p>`);
  const campo = document.getElementById("add-titulo");
  if (campo) {
    campo.focus();
    campo.setSelectionRange(campo.value.length, campo.value.length);
  }
  renderBarraLote();
}

function renderResultadoAtual() {
  if (S.ultimo) renderResultado(S.ultimo.r, S.ultimo.f, S.ultimo.escopo);
}

function ordenar(a, b) {
  if (a.situacao === "concluida" && b.situacao === "concluida") return (b.concluida_em || "").localeCompare(a.concluida_em || "");
  const da = a.data_entrega || "9999", dbb = b.data_entrega || "9999";
  if (da !== dbb) return da < dbb ? -1 : 1;
  if (PESO_PRIO[a.prioridade] !== PESO_PRIO[b.prioridade]) return PESO_PRIO[a.prioridade] - PESO_PRIO[b.prioridade];
  return a.criado_em.localeCompare(b.criado_em);
}

function ordenarVisao(a, b, modo) {
  if (modo === "titulo") return a.titulo.localeCompare(b.titulo, "pt-BR", { sensitivity: "base" }) || ordenar(a, b);
  if (modo === "recentes") return b.criado_em.localeCompare(a.criado_em) || ordenar(a, b);
  if (modo === "prioridade") return PESO_PRIO[a.prioridade] - PESO_PRIO[b.prioridade] || ordenar(a, b);
  return ordenar(a, b);
}

function renderQuadro(alvo, tarefas, escopo) {
  S.grupos = S.status.map(st => ({ chave: st.id, nome: st.nome, cor: st.cor,
    preset: { status_id: st.id }, itens: tarefas.filter(t => t.status_id === st.id) }));
  alvo.innerHTML = `<div class="quadro">${S.grupos.map(g => `<section class="quadro-coluna" aria-label="${esc(g.nome)}">
    <div class="grupo-cabeca">${caixaGrupo(g)}<span class="bolinha" style="background:${g.cor}"></span><h2>${esc(g.nome)}</h2><span class="n">${g.itens.length}</span></div>
    <div class="quadro-itens">${g.itens.map(t => `<article class="quadro-cartao">
      <div class="quadro-topo">${caixaSel(t)}<button class="quadro-titulo" onclick="abrirTarefa('${t.id}')">${esc(t.titulo)}</button>${botaoMaisTarefa(t)}</div>
      <p class="quadro-lista">${esc(caminhoLista(t.lista_id).join(' › '))}</p>
      <div class="quadro-meta">${celulaPrazo(t)}<span class="resp">${avatares(t.responsaveis)}</span></div>
      <div class="quadro-meta"><span class="prio ${t.prioridade}">${ICONES.bandeira}${NOME_PRIO[t.prioridade]}</span>
      ${botaoStatus(t)}</div>
    </article>`).join('') || '<p class="quadro-vazio">Nenhuma tarefa</p>'}</div>${linhaAdicionar(g, escopo)}</section>`).join('')}</div>`;
  const campo = document.getElementById("add-titulo");
  if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
}

function agrupar(tarefas, modo) {
  if (!modo) return [{ chave: "tudo", nome: "", itens: tarefas }];
  const mapa = new Map();
  const add = (chave, meta, t) => {
    if (!mapa.has(chave)) mapa.set(chave, { chave, ...meta, itens: [] });
    mapa.get(chave).itens.push(t);
  };
  for (const t of tarefas) {
    if (modo === "situacao") {
      const sit = SITUACOES.find((x) => x.id === t.situacao);
      const quando = { vence_hoje: hojeSP(), a_vencer: emDias(1) }[sit.id] || null;
      add(sit.id, { nome: sit.nome, cor: sit.cor, classe: sit.id, ordem: SITUACOES.indexOf(sit), preset: { data_entrega: quando } }, t);
    } else if (modo === "status") {
      add(t.status_id, { nome: t.status_nome, cor: t.status_cor, ordem: t.status_ordem, preset: { status_id: t.status_id } }, t);
    } else if (modo === "projeto") {
      add(t.lista_id, { nome: caminhoLista(t.lista_id).join(" › "), cor: t.projeto_cor, preset: { lista_id: t.lista_id } }, t);
    } else if (modo === "responsavel") {
      if (!t.responsaveis.length) add("~", { nome: "Sem responsável", cor: "#8A8A8A", ordem: "~", preset: {} }, t);
      for (const id of t.responsaveis) {
        const u = usuario(id);
        add(id, { nome: u?.nome || "Usuário removido", cor: corDoNome(u?.nome || id), ordem: u?.nome || "~~", preset: { responsaveis: [id] } }, t);
      }
    }
  }
  const grupos = [...mapa.values()];
  return grupos.sort((a, b) => a.ordem === undefined ? a.nome.localeCompare(b.nome, "pt-BR") :
    typeof a.ordem === "number" ? a.ordem - b.ordem : String(a.ordem).localeCompare(String(b.ordem), "pt-BR"));
}

function avatares(ids) {
  if (!ids.length) return '<span class="sem">·</span>';
  return ids.slice(0, 4).map((id) => {
    const u = usuario(id);
    return `<span class="avatar" style="background:${corDoNome(u?.nome || id)}" title="${esc(u?.nome || "Usuário removido")}">${esc(iniciais(u?.nome))}</span>`;
  }).join("") + (ids.length > 4 ? `<span class="avatar">+${ids.length - 4}</span>` : "");
}

function celulaPrazo(t) {
  if (!t.data_entrega) return '<span class="sem">Sem data</span>';
  const data = `<span class="data">${dataBR(t.data_entrega)}</span>`;
  if (t.situacao === "atrasada") return `<div class="prazo atrasada">${data}<br><span class="atraso">${dias(t.dias_atraso)} em atraso</span></div>`;
  if (t.situacao === "vence_hoje") return `<div class="prazo vence_hoje">${data}<span class="dica">Vence hoje</span></div>`;
  if (t.situacao === "a_vencer") return `<div class="prazo">${data}<span class="dica">${t.dias_para_vencer === 1 ? "Amanhã" : `em ${dias(t.dias_para_vencer)}`}</span></div>`;
  return `<div class="prazo">${data}<span class="dica"${t.dias_atraso ? ' style="color:var(--vermelho)"' : ""}>${t.dias_atraso ? `entregue com ${dias(t.dias_atraso)} de atraso` : "no prazo"}</span></div>`;
}

function linhaTarefa(t, mostrarCaminho) {
  const subs = S.tarefas.filter((s) => s.tarefa_pai_id === t.id);
  const pai = t.tarefa_pai_id ? S.tarefas.find((x) => x.id === t.tarefa_pai_id) : null;
  const meta = [];
  if (pai) meta.push(`<span>${ICONES.sub} ${esc(pai.titulo)}</span>`);
  if (mostrarCaminho) meta.push(`<span>${esc(caminhoLista(t.lista_id).join(" › "))}</span>`);
  if (subs.length) meta.push(`<span>${subs.filter((s) => s.situacao === "concluida").length}/${subs.length} subtarefas</span>`);
  if (t.recorrencia) meta.push(`<span class="rec" title="${esc(descreverRecorrencia(t))}">${ICONES.repetir}</span>`);
  const feita = t.situacao === "concluida";
  return `<div class="linha ${t.situacao}" role="listitem" onclick="abrirTarefa('${t.id}')">
    <div class="col-check">${caixaSel(t)}<button class="check${feita ? " feito" : ""}" style="--st:${esc(t.status_cor)}" onclick="event.stopPropagation();alternarConclusao('${t.id}')" aria-label="${feita ? "Reabrir" : "Concluir"}" title="${feita ? "Reabrir" : "Concluir"}">${ICONES.check}</button></div>
    <div class="col-titulo t-principal"><button class="t-titulo tarefa-link" onclick="event.stopPropagation();abrirTarefa('${t.id}')">${esc(t.titulo)}</button>${meta.length ? `<div class="t-meta">${meta.join("")}</div>` : ""}</div>
    <div class="col-status" onclick="event.stopPropagation()">${botaoStatus(t)}</div>
    <div class="col-resp resp">${avatares(t.responsaveis)}</div>
    <div class="col-prazo">${celulaPrazo(t)}</div>
    <div class="col-prio"><span class="prio ${t.prioridade}">${ICONES.bandeira}${NOME_PRIO[t.prioridade]}</span></div>
    <div class="col-mais">${botaoMaisTarefa(t)}</div>
  </div>`;
}

/* ---------------- ações de tarefa ---------------- */
function emDias(n) {
  const [a, m, d] = hojeSP().split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

/* Lançar tarefa em linha, como no ClickUp: a linha fica sempre no fim do grupo,
   o clique abre o campo com o cursor piscando e os ícones de data, responsável e prioridade. */
// Tarefa mora em lista, nunca em pasta nem em espaço: só dá para adivinhar a lista quando
// a tela tem uma só (página da lista). Com várias, quem escolhe é o usuário.
function listaPadraoAdd(escopo) {
  const opcoes = opcoesListas(escopo);
  return opcoes.length === 1 ? opcoes[0].v : null;
}

function linhaAdicionar(g, escopo) {
  if (!opcoesListas(escopo).length) return "";
  if (S.add?.grupo === g.chave) return formAdicionar(escopo);
  return `<button class="linha-add" onclick="abrirAdicionar('${g.chave}')"><span class="sinal">+</span>Adicionar tarefa</button>`;
}

function abrirAdicionar(chave) {
  if (criandoTarefa) return;
  const g = (S.grupos || []).find((x) => x.chave === chave);
  const escopo = S.ultimo?.escopo;
  S.add = {
    grupo: chave, titulo: "", data_entrega: null, responsaveis: modoEuAtivo() ? [S.user.id] : [], prioridade: "normal",
    recorrencia: null, status_id: null, lista_id: null, ...(g?.preset || {}),
  };
  if (!S.add.lista_id) S.add.lista_id = listaPadraoAdd(escopo);
  if (!opcoesListas(escopo).length) return toast("Crie uma lista antes de lançar tarefa.", true);
  renderResultadoAtual();
  // Sem lista definida (pasta ou espaço), a primeira coisa é escolher onde a tarefa vai morar.
  if (!S.add.lista_id) document.getElementById("add-lista")?.click();
}

function cancelarAdicionar() {
  if (criandoTarefa) return;
  S.add = null;
  renderResultadoAtual();
}

function formAdicionar(escopo) {
  const a = S.add;
  const destino = S.listas.find((l) => l.id === a.lista_id);
  const caminho = destino ? caminhoLista(destino.id).slice(1).join(" › ") : "Escolher lista";
  const resp = a.responsaveis.map((id) => usuario(id)).filter(Boolean);
  const prio = a.prioridade !== "normal" ? `<span class="prio ${a.prioridade}">${ICONES.bandeira}${NOME_PRIO[a.prioridade]}</span>` : ICONES.bandeira;
  return `<form class="linha-add aberta" id="form-add" onsubmit="salvarAdicionar(event)">
    <input type="text" id="add-titulo" placeholder="Nome da tarefa" maxlength="300" autocomplete="off"
      value="${esc(a.titulo)}" oninput="S.add.titulo = this.value">
    <div class="add-acoes">
      <button type="button" class="add-btn${destino ? "" : " precisa"}" id="add-lista" data-menu onclick="menuAddLista(this)"
        title="${destino ? "Lista da tarefa" : "Escolha a lista"}">${ICONES.lista}<span>${esc(caminho)}</span></button>
      <button type="button" class="add-btn" data-menu id="add-data" onclick="abrirDataAdd(this)" title="Data de entrega" aria-label="Data de entrega">
        ${ICONES.calendario}${a.data_entrega ? `<span>${esc(rotuloData(a.data_entrega))}</span>` : ""}
      </button>
      ${a.recorrencia ? `<button type="button" class="add-btn ligado" data-menu onclick="abrirDataAdd(this)" title="Repete">${ICONES.repetir}</button>` : ""}
      <button type="button" class="add-btn" data-menu onclick="menuAddResp(this)" title="Responsável" aria-label="Responsável">
        ${resp.length ? resp.map((u) => `<span class="avatar" style="background:${corDoNome(u.nome)}">${esc(iniciais(u.nome))}</span>`).join("") : ICONES.pessoa}
      </button>
      <button type="button" class="add-btn" data-menu onclick="menuAddPrio(this)" title="Prioridade" aria-label="Prioridade">${prio}</button>
      <button type="button" class="add-btn" onclick="cancelarAdicionar()" title="Cancelar" aria-label="Cancelar">${ICONES.fechar}</button>
      <button class="btn btn-pequeno">Salvar</button>
    </div>
  </form>`;
}


/* ---------------- calendário com datas prontas (estilo ClickUp) ---------------- */
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function comoData(iso) {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
function comoIso(data) {
  return data.toISOString().slice(0, 10);
}
function somarDias(iso, n) {
  const d = comoData(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return comoIso(d);
}
function diaDaSemana(iso) {
  return comoData(iso).getUTCDay();
}
// Próximo dia da semana pedido (0 = domingo). Hoje não conta, é sempre o próximo.
function proximo(iso, alvo) {
  const falta = (alvo - diaDaSemana(iso) + 7) % 7;
  return somarDias(iso, falta === 0 ? 7 : falta);
}
function rotuloData(iso) {
  const hoje = hojeSP();
  if (iso === hoje) return "hoje";
  if (iso === somarDias(hoje, 1)) return "amanhã";
  return `${DIAS_SEMANA[diaDaSemana(iso)]}, ${dataBR(iso)}`;
}

function atalhosDeData() {
  const hoje = hojeSP();
  // No sábado ou domingo, "este fim de semana" é o próprio dia; nos outros, o próximo sábado.
  const dow = diaDaSemana(hoje);
  const sabado = dow === 6 || dow === 0 ? hoje : proximo(hoje, 6);
  const proximoSabado = dow === 0 ? proximo(hoje, 6) : somarDias(sabado, 7);
  return [
    { t: "Hoje", d: hoje },
    { t: "Amanhã", d: somarDias(hoje, 1) },
    { t: "Este fim de semana", d: sabado },
    { t: "Semana que vem", d: proximo(hoje, 1) },
    { t: "Próximo fim de semana", d: proximoSabado },
    { t: "Em 2 semanas", d: somarDias(hoje, 14) },
    { t: "Em 4 semanas", d: somarDias(hoje, 28) },
  ];
}

let calendario = null;

// aoEscolher(iso | null) grava a data; aoRepetir, quando existe, abre a recorrência.
// regra: tarefa (ou rascunho) com recorrência, para circular os dias em que ela cai.
function abrirCalendario(ancora, valor, aoEscolher, aoRepetir, regra) {
  calendario = { ancora, valor: valor || null, mes: (valor || hojeSP()).slice(0, 7), aoEscolher, aoRepetir, regra };
  renderCalendario();
}

function escolherData(iso) {
  const aoEscolher = calendario.aoEscolher;
  fecharMenu();
  calendario = null;
  aoEscolher(iso);
}
function mudarMes(passo) {
  const [a, m] = calendario.mes.split("-").map(Number);
  calendario.mes = comoIso(new Date(Date.UTC(a, m - 1 + passo, 1))).slice(0, 7);
  renderCalendario();
}

function renderCalendario() {
  const { valor, mes, aoRepetir, regra } = calendario;
  const hoje = hojeSP();
  const [ano, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const inicio = somarDias(comoIso(primeiro), -primeiro.getUTCDay());
  const celulas = [];
  for (let i = 0; i < 42; i++) {
    const iso = somarDias(inicio, i);
    const foraDoMes = iso.slice(0, 7) !== mes;
    if (i >= 35 && foraDoMes) break;
    const classes = ["dia"];
    if (foraDoMes) classes.push("fora");
    if (iso === hoje) classes.push("hoje");
    if (iso === valor) classes.push("marcado");
    const recorre = regra?.recorrencia && iso >= hoje && diaDaRecorrencia(regra, iso);
    if (recorre) classes.push("recorre");
    celulas.push(`<button type="button" class="${classes.join(" ")}"${recorre ? ' title="Dia da recorrência"' : ""} onclick="escolherData('${iso}')">${Number(iso.slice(8))}</button>`);
  }
  abrirPainel(calendario.ancora, `
    <div class="cal">
      <div class="cal-atalhos">
        ${atalhosDeData().map((a) => `<button type="button" onclick="escolherData('${a.d}')"><span>${a.t}</span><em>${rotuloData(a.d)}</em></button>`).join("")}
      </div>
      <div class="cal-mes">
        <button type="button" class="icone-btn mini" onclick="mudarMes(-1)" aria-label="Mês anterior">‹</button>
        <strong>${MESES[m - 1]} ${ano}</strong>
        <button type="button" class="icone-btn mini" onclick="mudarMes(1)" aria-label="Próximo mês">›</button>
      </div>
      <div class="cal-grade">
        ${DIAS_SEMANA.map((d) => `<span class="cal-cab">${d}</span>`).join("")}
        ${celulas.join("")}
      </div>
      <div class="cal-rodape">
        ${valor ? '<button type="button" class="limpar" onclick="escolherData(null)">Sem data</button>' : "<span></span>"}
        ${aoRepetir ? '<button type="button" class="limpar" onclick="abrirRepetir()">Configurar recorrência</button>' : ""}
      </div>
    </div>`);
}

function abrirRepetir() {
  const { ancora, aoRepetir } = calendario;
  fecharMenu();
  calendario = null;
  abrirMenu(ancora, [
    { t: "Não repete", acao: () => aoRepetir(null) },
    ...Object.entries({ diaria: "Diária", semanal: "Semanal", mensal: "Mensal", anual: "Anual" }).map(([v, nome]) => ({ t: nome, acao: () => aoRepetir(v) })),
  ]);
}

function abrirDataAdd(ancora) {
  abrirCalendario(ancora, S.add.data_entrega, (iso) => {
    S.add.data_entrega = iso;
    renderResultadoAtual();
  }, (rec) => {
    S.add.recorrencia = rec;
    renderResultadoAtual();
  }, S.add);
}

function menuAddLista(ancora) {
  abrirMenu(ancora, opcoesListas(S.ultimo?.escopo).map((o) => ({
    t: o.t, acao: () => { S.add.lista_id = o.v; renderResultadoAtual(); },
  })));
}
function menuAddResp(ancora) {
  abrirMenu(ancora, S.usuarios.filter((u) => u.ativo).map((u) => ({
    t: (S.add.responsaveis.includes(u.user_id) ? "✓ " : "") + u.nome,
    acao: () => {
      S.add.responsaveis = S.add.responsaveis.includes(u.user_id)
        ? S.add.responsaveis.filter((x) => x !== u.user_id) : [...S.add.responsaveis, u.user_id];
      renderResultadoAtual();
    },
  })));
}
function menuAddPrio(ancora) {
  abrirMenu(ancora, PRIORIDADES.map((x) => ({
    t: (S.add.prioridade === x.id ? "✓ " : "") + x.nome,
    acao: () => { S.add.prioridade = x.id; renderResultadoAtual(); },
  })));
}

let criandoTarefa = false;
async function salvarAdicionar(e) {
  e.preventDefault();
  if (criandoTarefa || !S.add) return;
  const a = S.add;
  const titulo = (a.titulo || "").trim();
  if (!titulo) return document.getElementById("add-titulo")?.focus();
  if (!a.lista_id) {
    toast("Escolha a lista: tarefa mora em lista, não em pasta.", true);
    return document.getElementById("add-lista")?.click();
  }
  const status = a.status_id || primeiroStatus("aberto")?.id;
  if (!status) return toast("Crie pelo menos um status aberto em Ajustes.", true);
  criandoTarefa = true;
  const botao = e.target.querySelector('button:not([type="button"])');
  if (botao) { botao.disabled = true; botao.textContent = "Salvando…"; }
  try {
  const { data, error } = await db().from("tarefas").insert({
    lista_id: a.lista_id, titulo, status_id: status, data_entrega: a.data_entrega,
    prioridade: a.prioridade, recorrencia: a.recorrencia || null,
  }).select().single();
  if (error) return toast(erroBanco(error, "Não deu pra criar"), true);
  // A tarefa já existe: não deixar uma falha posterior causar um segundo INSERT.
  a.titulo = "";
  if (document.getElementById("add-titulo")) document.getElementById("add-titulo").value = "";
  let erroResponsaveis = null;
  if (a.responsaveis.length) {
    const resposta = await db().from("tarefa_responsaveis").insert(a.responsaveis.map((user_id) => ({ tarefa_id: data.id, user_id })));
    erroResponsaveis = resposta.error;
  }
  gravarLocal("tf_ultima_lista", a.lista_id);
  a.titulo = "";
  await carregar();
  renderArvore();
  renderContadores();
  renderResultadoAtual();
  // A tarefa nova pode criar (ou esvaziar) grupos: a linha de lançamento segue no grupo onde ela caiu.
  if (!(S.grupos || []).some((g) => g.chave === a.grupo)) {
    const destino = (S.grupos || []).find((g) => g.itens.some((t) => t.id === data.id)) || (S.grupos || [])[0];
    if (destino) {
      a.grupo = destino.chave;
      renderResultadoAtual();
    }
  }
  const visivel = S.ultimo && filtrar(S.ultimo.f, S.ultimo.escopo).some((t) => t.id === data.id);
  if (!visivel) toast("Tarefa criada. Ela não aparece aqui por causa dos filtros.");
  if (erroResponsaveis) {
    S.add = null;
    renderResultadoAtual();
    await abrirTarefa(data.id);
    toast("A tarefa foi criada, mas os responsáveis não foram salvos. Selecione-os nos detalhes.", true);
  }
  } catch {
    toast("Não foi possível atualizar. Confira a lista antes de tentar criar novamente.", true);
  } finally {
    criandoTarefa = false;
    if (botao) { botao.disabled = false; botao.textContent = "Salvar"; }
  }
}

function novaTarefaRapida() {
  if (rotaAtual().tipo === "ajustes") {
    irPara("#/central");
    rotear();
  }
  const primeiro = (S.grupos || [])[0];
  if (primeiro) abrirAdicionar(primeiro.chave);
  else toast("Crie uma lista em um espaço para adicionar tarefas.");
}

const gravacoesPendentes = new Map();
function salvarTarefa(id, patch, opcoes = {}) {
  const anterior = gravacoesPendentes.get(id) || Promise.resolve();
  const atual = anterior.catch(() => {}).then(() => gravarTarefa(id, patch, opcoes)).catch(() => {
    toast("Não foi possível salvar a alteração. Verifique sua conexão e tente novamente.", true);
    return false;
  }).finally(() => { if (gravacoesPendentes.get(id) === atual) gravacoesPendentes.delete(id); });
  gravacoesPendentes.set(id, atual);
  return atual;
}
async function gravarTarefa(id, patch, { silencioso } = {}) {
  const antes = S.tarefas.find((t) => t.id === id);
  const { data, error } = await db().from("tarefas").update(patch).eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    toast(erroBanco(error, "Não deu pra salvar"), true);
    renderTudo();
    return false;
  }
  if (patch.lista_id) {
    const { error: erroSub } = await db().from("tarefas").update({ lista_id: patch.lista_id }).eq("tarefa_pai_id", id);
    if (erroSub) toast("A tarefa foi movida, mas houve um erro ao mover as subtarefas. Atualize e confira a lista.", true);
  }
  await carregar();
  const depois = S.tarefas.find((t) => t.id === id);
  if (antes && depois && !antes.proxima_id && depois.proxima_id) {
    const prox = S.tarefas.find((t) => t.id === depois.proxima_id);
    toast(`Tarefa recorrente: a próxima foi criada${prox?.data_entrega ? ` para ${dataBR(prox.data_entrega, true)}` : ""}.`);
  } else if (!silencioso) {
    toast("Salvo.");
  }
  renderTudo();
  return true;
}

function alternarConclusao(id) {
  if (gravacoesPendentes.has(id)) return;
  const t = S.tarefas.find((x) => x.id === id);
  if (!t) return;
  const destino = primeiroStatus(t.situacao === "concluida" ? "aberto" : "concluido");
  if (!destino) return toast("Não existe status do tipo " + (t.situacao === "concluida" ? "aberto" : "concluído") + ".", true);
  salvarTarefa(id, { status_id: destino.id }, { silencioso: true });
}

async function abrirTarefa(id, semHash) {
  S.aberta = id;
  S.comentarios = [];
  document.getElementById("app").classList.add("gaveta-aberta");
  document.getElementById("gaveta").inert = false;
  if (!semHash) {
    const base = location.hash.split("?")[0] || "#/central";
    history.replaceState(null, "", `${base}?t=${id}`);
  }
  renderGaveta();
  const { data } = await db().from("comentarios").select("*").eq("tarefa_id", id).order("criado_em");
  if (S.aberta === id) {
    S.comentarios = data || [];
    renderComentarios();
  }
}

function fecharTarefa(semHash) {
  S.aberta = null;
  document.getElementById("app").classList.remove("gaveta-aberta");
  document.getElementById("gaveta").inert = true;
  if (!semHash) history.replaceState(null, "", location.hash.split("?")[0]);
}

function renderGaveta() {
  const t = S.tarefas.find((x) => x.id === S.aberta);
  const el = document.getElementById("gaveta");
  if (!t) {
    fecharTarefa();
    return;
  }
  const foco = document.activeElement;
  if (foco && el.contains(foco) && foco.matches("textarea, input[type=text], input[type=number]")) return;

  const subs = S.tarefas.filter((s) => s.tarefa_pai_id === t.id).sort(ordenar);
  const pai = t.tarefa_pai_id ? S.tarefas.find((x) => x.id === t.tarefa_pai_id) : null;
  const criador = usuario(t.criado_por);
  let faixa = "";
  if (t.situacao === "atrasada") {
    faixa = `<div class="faixa-atraso">${ICONES.alerta}<span><b>${dias(t.dias_atraso)} em atraso.</b> A entrega era ${dataBR(t.data_entrega, true)}.</span></div>`;
  } else if (t.situacao === "concluida" && t.data_entrega) {
    faixa = t.dias_atraso
      ? `<div class="faixa-atraso">${ICONES.alerta}<span>Concluída em ${dataBR(t.concluida_em, true)}, <b>${dias(t.dias_atraso)} depois</b> da entrega.</span></div>`
      : `<div class="faixa-atraso faixa-ok">${ICONES.check}<span>Concluída no prazo em ${dataBR(t.concluida_em, true)}.</span></div>`;
  } else if (t.situacao === "vence_hoje") {
    faixa = `<div class="faixa-atraso" style="background:#fff9ed;border-color:#e9d6a8;color:var(--amarelo)">${ICONES.alerta}<span>Vence hoje.</span></div>`;
  }

  el.innerHTML = `
    <div class="g-topo">
      <button class="check${t.situacao === "concluida" ? " feito" : ""}" style="--st:${esc(t.status_cor)}" onclick="alternarConclusao('${t.id}')" title="${t.situacao === "concluida" ? "Reabrir" : "Concluir"}" aria-label="${t.situacao === "concluida" ? "Reabrir" : "Concluir"}">${ICONES.check}</button>
      <div class="g-caminho">${esc(caminhoLista(t.lista_id).join(" › "))}</div>
      <button class="icone-btn" onclick="fecharTarefa()" aria-label="Fechar">${ICONES.fechar}</button>
    </div>
    <div class="g-corpo">
      ${pai ? `<button class="limpar" style="margin-bottom:8px;display:inline-flex;gap:6px;align-items:center" onclick="abrirTarefa('${pai.id}')">${ICONES.sub.replace("<svg", '<svg width="13" height="13"')} ${esc(pai.titulo)}</button>` : ""}
      <textarea class="g-titulo" id="g-titulo" rows="1" maxlength="300" aria-label="Título">${esc(t.titulo)}</textarea>
      ${faixa}
      <div class="g-grade">
        <span class="rotulo">Status</span>
        ${botaoStatus(t, true)}
        <span class="rotulo">Prioridade</span>
        <select onchange="salvarTarefa('${t.id}', { prioridade: this.value })">
          ${PRIORIDADES.map((p) => `<option value="${p.id}"${p.id === t.prioridade ? " selected" : ""}>${p.nome}</option>`).join("")}
        </select>
        <span class="rotulo">Início</span>
        <button type="button" class="campo-data" data-menu onclick="calendarioDaTarefa(this, '${t.id}', 'data_inicio')">
          ${ICONES.calendario}<span>${t.data_inicio ? esc(rotuloData(t.data_inicio)) : "Sem data"}</span></button>
        <span class="rotulo">Entrega</span>
        <button type="button" class="campo-data${t.situacao === "atrasada" ? " atrasada" : ""}" data-menu onclick="calendarioDaTarefa(this, '${t.id}', 'data_entrega')">
          ${ICONES.calendario}<span>${t.data_entrega ? esc(rotuloData(t.data_entrega)) : "Sem data"}</span></button>
        <span class="rotulo">Responsáveis</span>
        <div class="resp-escolha">
          ${S.usuarios.filter((u) => u.ativo || t.responsaveis.includes(u.user_id)).map((u) => `<button class="chip${t.responsaveis.includes(u.user_id) ? " ligado" : ""}" onclick="alternarResponsavel('${t.id}','${u.user_id}')">
            <span class="avatar" style="background:${corDoNome(u.nome)}">${esc(iniciais(u.nome))}</span>${esc(u.nome)}</button>`).join("")}
        </div>
        <span class="rotulo">Repetir</span>
        <div class="duas">
          <select onchange="salvarTarefa('${t.id}', { recorrencia: this.value || null })">
            <option value="">Não repete</option>
            ${Object.entries({ diaria: "Diária", semanal: "Semanal", mensal: "Mensal", anual: "Anual" }).map(([v, n]) => `<option value="${v}"${t.recorrencia === v ? " selected" : ""}>${n}</option>`).join("")}
          </select>
          ${t.recorrencia ? `<div class="duas" style="flex:1"><span style="color:var(--nevoa);font-size:13px;flex:none">a cada</span>
            <input type="number" min="1" max="365" value="${t.recorrencia_intervalo}" onchange="salvarTarefa('${t.id}', { recorrencia_intervalo: Math.max(1, Number(this.value) || 1) })" aria-label="Intervalo" style="max-width:70px">
            <span style="color:var(--nevoa);font-size:13px;flex:none">${RECORRENCIAS[t.recorrencia][t.recorrencia_intervalo === 1 ? 0 : 1]}</span></div>` : ""}
        </div>
        ${blocoRegraRecorrencia(t)}
        <span class="rotulo">Lista</span>
        <select onchange="salvarTarefa('${t.id}', { lista_id: this.value })" ${pai ? 'disabled title="Subtarefa fica na lista da tarefa principal"' : ""}>
          ${opcoesListas().map((o) => `<option value="${o.v}"${o.v === t.lista_id ? " selected" : ""}>${esc(o.t)}</option>`).join("")}
        </select>
      </div>
      ${resumoRecorrencia(t)}

      <span class="rotulo">Descrição</span>
      <textarea id="g-descricao" placeholder="Detalhes, links, contexto..." rows="4">${esc(t.descricao || "")}</textarea>

      ${pai ? "" : `<div class="g-secao">
        <h3>Subtarefas <span>${subs.length ? `${subs.filter((s) => s.situacao === "concluida").length}/${subs.length}` : ""}</span></h3>
        <div class="sub-lista">${subs.map((s) => `<div class="sub-item ${s.situacao}" onclick="abrirTarefa('${s.id}')">
          <button class="check${s.situacao === "concluida" ? " feito" : ""}" style="--st:${esc(s.status_cor)}" onclick="event.stopPropagation();alternarConclusao('${s.id}')" aria-label="Concluir">${ICONES.check}</button>
          <span class="t">${esc(s.titulo)}</span>
          ${s.data_entrega ? `<span class="d ${s.situacao}">${s.situacao === "atrasada" ? `${dias(s.dias_atraso)} atraso` : dataBR(s.data_entrega)}</span>` : ""}
          <span class="resp">${s.responsaveis.length ? avatares(s.responsaveis) : ""}</span>
        </div>`).join("")}</div>
        <form class="form-inline" id="form-sub"><input type="text" id="sub-titulo" placeholder="Nova subtarefa" maxlength="300" autocomplete="off"><button class="btn btn-fantasma btn-pequeno">Adicionar</button></form>
      </div>`}

      <div class="g-secao">
        <h3>Comentários</h3>
        <div id="comentarios"></div>
        <form id="form-comentario" style="margin-top:8px">
          <textarea id="comentario-texto" rows="2" placeholder="Escreva um comentário" style="min-height:64px"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-pequeno">Comentar</button></div>
        </form>
      </div>

      <div class="g-rodape">
        <span>Criada ${criador ? `por ${esc(criador.nome)} ` : ""}em ${dataHora(t.criado_em)}</span>
        <button class="btn btn-perigo btn-pequeno" onclick="excluirTarefa('${t.id}')">Excluir tarefa</button>
      </div>
    </div>`;

  const titulo = el.querySelector("#g-titulo");
  const ajustar = () => { titulo.style.height = "auto"; titulo.style.height = titulo.scrollHeight + "px"; };
  ajustar();
  titulo.addEventListener("input", ajustar);
  titulo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); titulo.blur(); } });
  titulo.addEventListener("blur", () => {
    const novo = titulo.value.replace(/\s+/g, " ").trim();
    if (novo && novo !== t.titulo) salvarTarefa(t.id, { titulo: novo });
    else titulo.value = t.titulo;
  });
  const desc = el.querySelector("#g-descricao");
  desc.addEventListener("blur", () => {
    const novo = desc.value.trim() || null;
    if (novo !== (t.descricao || null)) salvarTarefa(t.id, { descricao: novo });
  });
  el.querySelector("#form-sub")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el.querySelector("#sub-titulo");
    const tituloSub = input.value.trim();
    if (!tituloSub) return;
    const { error } = await db().from("tarefas").insert({ lista_id: t.lista_id, tarefa_pai_id: t.id, titulo: tituloSub, status_id: primeiroStatus("aberto").id });
    if (error) return toast(erroBanco(error, "Não deu pra criar"), true);
    input.value = "";
    await carregar();
    input.blur();
    renderTudo();
    document.getElementById("sub-titulo")?.focus();
  });
  el.querySelector("#form-comentario").addEventListener("submit", enviarComentario);
  el.querySelector("#comentario-texto").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) el.querySelector("#form-comentario").requestSubmit();
  });
  renderComentarios();
}

function calendarioDaTarefa(ancora, id, campo) {
  const t = S.tarefas.find((x) => x.id === id);
  abrirCalendario(ancora, t[campo], (iso) => salvarTarefa(id, { [campo]: iso }),
    campo === "data_entrega" ? (rec) => salvarTarefa(id, { recorrencia: rec }) : null,
    campo === "data_entrega" ? t : null);
}

function renderComentarios() {
  const alvo = document.getElementById("comentarios");
  if (!alvo) return;
  alvo.innerHTML = S.comentarios.length ? S.comentarios.map((c) => {
    const autor = usuario(c.autor_id);
    const podeApagar = c.autor_id === S.user.id || S.eu.admin;
    return `<div class="comentario"><div class="quem"><b>${esc(autor?.nome || "Usuário removido")}</b>${dataHora(c.criado_em)}
      ${podeApagar ? `<button class="apagar" onclick="apagarComentario('${c.id}')">apagar</button>` : ""}</div>
      <div class="txt">${esc(c.texto)}</div></div>`;
  }).join("") : '<p style="color:var(--nevoa);font-size:13.5px">Nenhum comentário.</p>';
}

let enviandoComentario = false;
async function enviarComentario(e) {
  e.preventDefault();
  if (enviandoComentario) return;
  const tarefaId = S.aberta;
  const campo = document.getElementById("comentario-texto");
  const texto = campo.value.trim();
  if (!texto) return;
  enviandoComentario = true;
  const botao = e.target.querySelector('button');
  botao.disabled = true;
  try {
  const { data, error } = await db().from("comentarios").insert({ tarefa_id: tarefaId, texto }).select().single();
  if (error) return toast(erroBanco(error, "Não deu pra comentar"), true);
  if (S.aberta !== tarefaId) return;
  campo.value = "";
  S.comentarios.push(data);
  renderComentarios();
  } catch { toast("Não foi possível enviar o comentário. Tente novamente.", true); }
  finally { enviandoComentario = false; botao.disabled = false; }
}

async function apagarComentario(id) {
  const { error } = await db().from("comentarios").delete().eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra apagar"), true);
  S.comentarios = S.comentarios.filter((c) => c.id !== id);
  renderComentarios();
}

async function alternarResponsavel(tarefaId, userId) {
  const t = S.tarefas.find((x) => x.id === tarefaId);
  const { error } = t.responsaveis.includes(userId)
    ? await db().from("tarefa_responsaveis").delete().eq("tarefa_id", tarefaId).eq("user_id", userId)
    : await db().from("tarefa_responsaveis").insert({ tarefa_id: tarefaId, user_id: userId });
  if (error) return toast(erroBanco(error, "Não deu pra salvar"), true);
  await carregar();
  renderTudo();
}

async function excluirTarefa(id) {
  const t = S.tarefas.find((x) => x.id === id);
  const subs = S.tarefas.filter((s) => s.tarefa_pai_id === id).length;
  const ok = await confirmar({
    titulo: "Excluir tarefa?",
    texto: `<b>${esc(t.titulo)}</b>${subs ? ` e ${subs} ${subs === 1 ? "subtarefa" : "subtarefas"}` : ""} serão excluídas. Não tem como desfazer.`,
  });
  if (!ok) return;
  const { error } = await db().from("tarefas").delete().eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra excluir"), true);
  fecharTarefa();
  await recarregarERender();
  toast("Tarefa excluída.");
}

/* ---------------- ajustes ---------------- */
function renderAjustes() {
  document.getElementById("barra-titulo").textContent = "Ajustes";
  document.title = "Ajustes | Tarefas";
  const abas = [["conta", "Minha conta"], ["notificacoes", "Notificações"], ["usuarios", "Membros"], ["status", "Status"]];
  const main = document.getElementById("conteudo");
  main.innerHTML = `
    <div class="topo"><div><h1>Ajustes</h1></div></div>
    <div class="abas">${abas.map(([id, nome]) => `<button class="${S.abaAjustes === id ? "ativo" : ""}" onclick="S.abaAjustes='${id}';renderAjustes()">${nome}</button>`).join("")}</div>
    <div id="aba"></div>`;
  ({ conta: abaConta, notificacoes: abaNotificacoes, usuarios: abaUsuarios, status: abaStatus })[S.abaAjustes]();
}

function temaAtual() {
  try { return ["claro", "escuro", "sistema"].includes(localStorage.getItem("tf_tema")) ? localStorage.getItem("tf_tema") : "claro"; }
  catch { return "claro"; }
}

function abaConta() {
  document.getElementById("aba").innerHTML = `
    <div class="painel">
      <h2>${esc(S.eu.nome)}</h2>
      <p class="desc">${esc(S.eu.email)} · ${S.eu.admin ? "Admin" : "Membro"}. A conta é a mesma do CRM: trocar a senha aqui troca lá também.</p>
      <form id="form-senha" style="max-width:360px">
        <div class="campo"><label for="nova-senha">Nova senha</label><input type="password" id="nova-senha" autocomplete="new-password" minlength="8" required></div>
        <div class="campo"><label for="nova-senha-2">Repita a senha</label><input type="password" id="nova-senha-2" autocomplete="new-password" minlength="8" required></div>
        <button class="btn">Trocar senha</button>
        <p class="aviso" id="aviso-senha"></p>
      </form>
    </div>
    <div class="painel">
      <h2>Aparência</h2>
      <p class="desc">Vale só neste aparelho.</p>
      <label class="campo" style="display:block;max-width:360px"><span class="rotulo">Tema</span>
        <select data-tema aria-label="Tema do aplicativo">
          ${[["claro", "Claro"], ["escuro", "Escuro"], ["sistema", "Igual ao sistema"]].map(([v, n]) => `<option value="${v}"${temaAtual() === v ? " selected" : ""}>${n}</option>`).join("")}
        </select></label>
    </div>
    ${typeof painelInstalar === "function" ? painelInstalar() : ""}
    <div class="painel">
      <h2>Sair</h2>
      <p class="desc">Encerra a sessão neste aparelho. Os lembretes de prazo continuam chegando se a notificação estiver ativada.</p>
      <button class="btn btn-perigo" data-acao="sair">Sair da conta</button>
    </div>`;
  document.getElementById("form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nova = document.getElementById("nova-senha").value;
    if (nova !== document.getElementById("nova-senha-2").value) return aviso("aviso-senha", "As duas senhas não são iguais.", "erro");
    aviso("aviso-senha", "Salvando...");
    const { error } = await sb.auth.updateUser({ password: nova });
    if (error) return aviso("aviso-senha", "Não deu pra trocar: " + error.message, "erro");
    e.target.reset();
    aviso("aviso-senha", "Senha trocada.", "ok");
  });
}

function abaUsuarios() {
  renderMembros();
}

async function salvarUsuario(userId, patch) {
  if (patch.nome === "") return toast("O nome não pode ficar vazio.", true);
  const { error } = await db().from("usuarios").update(patch).eq("user_id", userId);
  if (error) toast(erroBanco(error, "Não deu pra salvar"), true);
  else toast("Salvo.");
  await carregar();
  renderAjustes();
}

function abaStatus() {
  const admin = S.eu.admin;
  const lista = [...S.status].sort((a, b) => a.ordem - b.ordem);
  document.getElementById("aba").innerHTML = `
    <div class="painel">
      <h2>Status das tarefas</h2>
      <p class="desc">Valem para todas as listas. Status do tipo <b>concluído</b> marca a tarefa como feita: ela sai do atraso e, se for recorrente, gera a próxima.${admin ? "" : " Só admin altera."}</p>
      <div class="rolagem"><table class="tab-simples">
        <thead><tr><th>Ordem</th><th>Cor</th><th>Nome</th><th>Tipo</th><th></th></tr></thead>
        <tbody>${lista.map((s, i) => `<tr>
          <td style="white-space:nowrap">${admin ? `<button class="icone-btn mini" ${i === 0 ? "disabled" : ""} onclick="moverStatus('${s.id}',-1)" aria-label="Subir">↑</button><button class="icone-btn mini" ${i === lista.length - 1 ? "disabled" : ""} onclick="moverStatus('${s.id}',1)" aria-label="Descer">↓</button>` : i + 1}</td>
          <td><input type="color" value="${esc(s.cor)}" ${admin ? "" : "disabled"} onchange="salvarStatus('${s.id}', { cor: this.value.toUpperCase() })" aria-label="Cor"></td>
          <td>${admin ? `<input type="text" value="${esc(s.nome)}" maxlength="40" onchange="salvarStatus('${s.id}', { nome: this.value.trim() })" aria-label="Nome">` : esc(s.nome)}</td>
          <td>${admin ? `<select onchange="salvarStatus('${s.id}', { tipo: this.value })" aria-label="Tipo"><option value="aberto"${s.tipo === "aberto" ? " selected" : ""}>Aberto</option><option value="concluido"${s.tipo === "concluido" ? " selected" : ""}>Concluído</option></select>` : (s.tipo === "aberto" ? "Aberto" : "Concluído")}</td>
          <td>${admin ? `<button class="btn btn-perigo btn-pequeno" onclick="apagarStatus('${s.id}')">Excluir</button>` : ""}</td>
        </tr>`).join("")}</tbody>
      </table></div>
      ${admin ? `<form class="form-inline" id="form-status" style="margin-top:14px;max-width:420px"><input type="text" id="novo-status" placeholder="Novo status" maxlength="40" required><button class="btn btn-pequeno">Adicionar</button></form>` : ""}
    </div>`;
  document.getElementById("form-status")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("novo-status").value.trim();
    const concluido = primeiroStatus("concluido");
    const ordem = concluido ? concluido.ordem : Math.max(0, ...S.status.map((s) => s.ordem)) + 1;
    if (concluido) {
      for (const s of S.status.filter((x) => x.ordem >= ordem)) await db().from("status").update({ ordem: s.ordem + 1 }).eq("id", s.id);
    }
    const { error } = await db().from("status").insert({ nome, ordem, cor: "#A78BFA" });
    if (error) toast(erroBanco(error, "Não deu pra criar"), true);
    await carregar();
    renderAjustes();
  });
}

async function salvarStatus(id, patch) {
  if (patch.nome === "") return toast("O nome não pode ficar vazio.", true);
  if (patch.tipo === "aberto" && S.status.filter((s) => s.tipo === "concluido" && s.id !== id).length === 0) {
    toast("Precisa existir pelo menos um status do tipo concluído.", true);
    return renderAjustes();
  }
  const { error } = await db().from("status").update(patch).eq("id", id);
  if (error) toast(erroBanco(error, "Não deu pra salvar"), true);
  await recarregarERender();
}

async function moverStatus(id, direcao) {
  const lista = [...S.status].sort((a, b) => a.ordem - b.ordem);
  const i = lista.findIndex((s) => s.id === id);
  const outro = lista[i + direcao];
  if (!outro) return;
  const a = lista[i];
  await db().from("status").update({ ordem: outro.ordem === a.ordem ? a.ordem + direcao : outro.ordem }).eq("id", a.id);
  await db().from("status").update({ ordem: a.ordem }).eq("id", outro.id);
  await recarregarERender();
}

async function apagarStatus(id) {
  const s = statusPorId(id);
  const emUso = S.tarefas.filter((t) => t.status_id === id).length;
  if (emUso) return toast(`"${s.nome}" está em ${emUso} ${emUso === 1 ? "tarefa" : "tarefas"}. Mude essas tarefas de status antes de excluir.`, true);
  if (S.status.filter((x) => x.tipo === s.tipo).length === 1) return toast(`Precisa existir pelo menos um status ${s.tipo === "aberto" ? "aberto" : "concluído"}.`, true);
  const ok = await confirmar({ titulo: "Excluir status?", texto: `<b>${esc(s.nome)}</b> será excluído.` });
  if (!ok) return;
  const { error } = await db().from("status").delete().eq("id", id);
  if (error) toast(erroBanco(error, "Não deu pra excluir"), true);
  await recarregarERender();
}

/* ---------------- notificações (push) ---------------- */
function registrarServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function base64ParaBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bruto = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

async function abaNotificacoes() {
  const alvo = document.getElementById("aba");
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  let inscrito = false;
  if (suporta) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    inscrito = !!(reg && await reg.pushManager.getSubscription());
  }
  let estado;
  if (!suporta) {
    estado = ios && !instalado
      ? "No iPhone, a notificação só funciona com o app instalado: toque em Compartilhar e depois em Adicionar à Tela de Início, abra por lá e volte aqui."
      : "Este navegador não suporta notificações push.";
  } else if (Notification.permission === "denied") {
    estado = "As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.";
  } else {
    estado = inscrito ? "Ativadas neste aparelho." : "Desativadas neste aparelho.";
  }
  alvo.innerHTML = `
    <div class="painel">
      <h2>Lembrete de prazo</h2>
      <p class="desc">Todo dia às 8h, cada pessoa recebe no aparelho quantas tarefas dela estão atrasadas, vencem hoje e vencem amanhã. Só chega se tiver alguma. Ative em cada aparelho que você usa (computador e celular).</p>
      <p style="font-size:14px;margin-bottom:14px"><b>${esc(estado)}</b></p>
      <div class="chips">
        ${suporta && Notification.permission !== "denied" ? `<button class="btn" onclick="ativarPush()">${inscrito ? "Reativar neste aparelho" : "Ativar neste aparelho"}</button>` : ""}
        ${inscrito ? '<button class="btn btn-fantasma" onclick="testarPush()">Enviar teste</button><button class="btn btn-fantasma" onclick="desativarPush()">Desativar</button>' : ""}
      </div>
      <p class="aviso" id="aviso-push"></p>
    </div>`;
}

async function ativarPush() {
  try {
    aviso("aviso-push", "Ativando...");
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") return aviso("aviso-push", "Permissão não concedida.", "erro");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let inscricao = await reg.pushManager.getSubscription();
    if (!inscricao) inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(VAPID_PUBLICA) });
    const j = inscricao.toJSON();
    const { error } = await sb.rpc("tarefas_salvar_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error) return aviso("aviso-push", "Não deu pra salvar: " + error.message, "erro");
    await abaNotificacoes();
    await testarPush();
  } catch (e) {
    aviso("aviso-push", "Não deu pra ativar: " + e.message, "erro");
  }
}

async function testarPush() {
  aviso("aviso-push", "Enviando teste...");
  const { data: sessao } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tarefas-lembrete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session.access_token}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ acao: "teste" }),
  }).catch(() => null);
  const corpo = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) return aviso("aviso-push", corpo.erro || "Não deu pra enviar.", "erro");
  aviso("aviso-push", corpo.enviados ? `Teste enviado para ${corpo.enviados} ${corpo.enviados === 1 ? "aparelho" : "aparelhos"}.` : "Nenhum aparelho recebeu: " + (corpo.erros || []).join("; "), corpo.enviados ? "ok" : "erro");
}

async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const inscricao = reg && await reg.pushManager.getSubscription();
  if (inscricao) {
    await db().from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
    await inscricao.unsubscribe();
  }
  await abaNotificacoes();
}

/* ---------------- botões fixos ---------------- */
document.addEventListener("click", (e) => {
  const rota = e.target.closest("[data-rota]");
  if (rota) return irPara(rota.dataset.rota);
  const acao = e.target.closest("[data-acao]")?.dataset.acao;
  if (acao === "sair") sair();
  if (acao === "novo-projeto") novoProjeto();
  if (acao === "abrir-menu") abrirMenuLateral();
  if (acao === "fechar-menu") fecharMenuLateral();
  if (acao === "fechar-tarefa") fecharTarefa();
  if (acao === "nova-tarefa-rapida") novaTarefaRapida();
});

function bloquearInterface() {
  S.eu = null; S.user = null; S.aberta = null; S.add = null;
  for (const k of ["usuarios", "status", "projetos", "pastas", "listas", "tarefas", "comentarios", "grupos"]) S[k] = [];
  S.ultimo = null;
  document.getElementById("app").className = "app";
  for (const id of ["conteudo", "arvore", "gaveta", "usuario-nome"]) { const el = document.getElementById(id); if (el) el.innerHTML = ""; }
  fecharModal(null); fecharMenu();
  document.getElementById("tela-login").style.display = "";
  document.getElementById("form-login").style.display = "";
  document.getElementById("form-codigo").style.display = "none";
  document.getElementById("sem-acesso").style.display = "none";
  document.getElementById("senha").value = "";
}
sb.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT") bloquearInterface();
});
document.addEventListener("keydown", e => {
  if (!S.eu || e.target.matches("input,textarea,select,[contenteditable]")) return;
  if (document.getElementById("modal-veu").classList.contains("ativo") || S.aberta) return;
  if (e.key === "/") { e.preventDefault(); document.getElementById("busca")?.focus(); }
});
iniciar();
