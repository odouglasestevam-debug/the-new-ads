// Financeiro | The New Ads
// Lê tudo do Supabase (cópia do Asaas mantida pela Edge Function "financeiro") e escreve só o que é do app:
// nome de contato, pausa e observação do cliente, e a configuração da cobrança.
import { ETAPAS, VARIAVEIS, formatarBRL, formatarData, modeloDaEtapa, montarMensagem, telefoneWhatsApp } from "./mensagem.js?v=1";

const SUPABASE_URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co";
const SUPABASE_KEY = "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
const FUNCAO = `${SUPABASE_URL}/functions/v1/financeiro`;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const S = { d: null, cli: new Map(), porCliente: new Map(), carregadoEm: 0, busca: "", inativos: false, filtroHist: "todas", ultimoTexto: null };
const ABERTAS = ["a_vencer", "vence_hoje", "atrasada"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const FORMAS = { PIX: "Pix", BOLETO: "boleto", CREDIT_CARD: "cartão", DEBIT_CARD: "débito", TRANSFER: "transferência", DEPOSIT: "depósito" };
const CICLOS = { WEEKLY: "por semana", BIWEEKLY: "a cada 15 dias", MONTHLY: "por mês", BIMONTHLY: "a cada 2 meses", QUARTERLY: "por trimestre", SEMIANNUALLY: "por semestre", YEARLY: "por ano" };
const FATOR_MENSAL = { WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, MONTHLY: 1, BIMONTHLY: 1 / 2, QUARTERLY: 1 / 3, SEMIANNUALLY: 1 / 6, YEARLY: 1 / 12 };

/* ---------------- utilidades ---------------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const brl = formatarBRL;
const soma = (lista) => lista.reduce((t, c) => t + Number(c.valor || 0), 0);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const mesDe = (iso) => String(iso || "").slice(0, 7);
const valida = (c) => c.situacao !== "excluida" && c.situacao !== "estornada";
function somarDias(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function somarMes(mes, n) {
  let [a, m] = mes.split("-").map(Number);
  m += n;
  while (m < 1) { m += 12; a--; }
  while (m > 12) { m -= 12; a++; }
  return `${a}-${String(m).padStart(2, "0")}`;
}
function nomeMes(mes, comAno = true) {
  const [a, m] = mes.split("-");
  return MESES[Number(m) - 1] + (comAno ? ` de ${a}` : "");
}
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function quando(ts) {
  if (!ts) return "nunca";
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.round(min / 60)} h`;
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
function nomeCliente(id) {
  const c = S.cli.get(id);
  return c?.nome || "Cliente sem nome";
}

let toastTimer;
function toast(msg, erro = false) {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast ver" + (erro ? " erro" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, erro ? 5000 : 2800);
}
function aviso(id, msg, tipo) {
  const el = $(id);
  if (!el) return;
  el.className = "aviso" + (tipo ? " " + tipo : "");
  el.textContent = msg;
}

const ICONE_AVISO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
const ICONE_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const ICONE_VOLTAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
const faixa = (tipo, html) => `<div class="faixa ${tipo}">${tipo === "info" ? ICONE_INFO : ICONE_AVISO}<div>${html}</div></div>`;

/* ---------------- autenticação ---------------- */
async function precisaSegundaEtapa() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw new Error("Não foi possível verificar a segurança da sessão. Entre novamente.");
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btn-entrar");
  btn.disabled = true;
  aviso("aviso-login", "Entrando...");
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value.trim(), password: $("senha").value });
  btn.disabled = false;
  if (error) {
    aviso("aviso-login", error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não deu pra entrar: " + error.message, "erro");
    return;
  }
  aviso("aviso-login", "");
  try {
    if (await precisaSegundaEtapa()) return pedirCodigo();
    await entrar();
  } catch (err) { aviso("aviso-login", err.message, "erro"); }
});

function pedirCodigo() {
  $("form-login").hidden = true;
  $("form-codigo").hidden = false;
  $("codigo-2fa").focus();
}

$("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const codigo = $("codigo-2fa").value.replace(/\D/g, "");
  if (codigo.length !== 6) return aviso("aviso-codigo", "O código tem 6 dígitos.", "erro");
  const btn = $("btn-verificar");
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
    $("codigo-2fa").value = "";
    return aviso("aviso-codigo", erro, "erro");
  }
  entrar();
});

async function sair() {
  await sb.auth.signOut();
  location.hash = "";
  location.reload();
}

async function entrar() {
  const { data, error } = await sb.from("financeiro_usuarios").select("user_id").limit(1);
  if (error || !data?.length) {
    $("form-login").hidden = true;
    $("form-codigo").hidden = true;
    $("sem-acesso").hidden = false;
    $("tela-login").hidden = false;
    $("app").hidden = true;
    return;
  }
  $("tela-login").hidden = true;
  $("app").hidden = false;
  if (!location.hash || location.hash === "#/") history.replaceState(null, "", "#/mes");
  $("conteudo").innerHTML = '<div class="carregando">Carregando...</div>';
  await carregar().catch((err) => toast("Não deu pra carregar: " + err.message, true));
  render();
}

/* ---------------- dados ---------------- */
async function todas(tabela, ajustar = (q) => q) {
  const linhas = [];
  const passo = 1000;
  for (let ini = 0; ; ini += passo) {
    const { data, error } = await ajustar(sb.from(tabela).select("*")).range(ini, ini + passo - 1);
    if (error) throw new Error(error.message);
    linhas.push(...data);
    if (data.length < passo) return linhas;
  }
}

async function carregar() {
  const desde = somarDias(hoje(), -60);
  const [cobrancas, clientes, assinaturas, config, mensagens, avisos, sync, evento] = await Promise.all([
    todas("financeiro_cobrancas", (q) => q.order("vencimento").order("asaas_id")),
    todas("financeiro_clientes", (q) => q.order("asaas_id")),
    todas("financeiro_assinaturas", (q) => q.order("asaas_id")),
    sb.from("financeiro_config").select("*").single(),
    todas("financeiro_mensagens", (q) => q.gte("dia", desde).order("atualizado_em", { ascending: false })),
    sb.from("financeiro_avisos").select("*").order("criado_em", { ascending: false }).limit(30),
    sb.from("financeiro_sincronizacoes").select("*").order("inicio", { ascending: false }).limit(1),
    sb.from("financeiro_eventos").select("evento, recebido_em").order("recebido_em", { ascending: false }).limit(1),
  ]);
  for (const r of [config, avisos, sync, evento]) if (r.error) throw new Error(r.error.message);
  S.d = { cobrancas, clientes, assinaturas, config: config.data, mensagens, avisos: avisos.data, sync: sync.data[0] || null, evento: evento.data[0] || null };
  S.cli = new Map(clientes.map((c) => [c.asaas_id, c]));
  S.porCliente = new Map();
  for (const c of cobrancas) {
    if (!S.porCliente.has(c.cliente_id)) S.porCliente.set(c.cliente_id, []);
    S.porCliente.get(c.cliente_id).push(c);
  }
  S.carregadoEm = Date.now();
}

async function recarregar() {
  const btn = document.querySelector('[data-acao="recarregar"]');
  btn?.classList.add("girando");
  try {
    await carregar();
    render();
  } catch (err) {
    toast("Não deu pra atualizar: " + err.message, true);
  } finally {
    btn?.classList.remove("girando");
  }
}

/* ---------------- rotas ---------------- */
function rota() {
  const partes = (location.hash || "#/mes").slice(2).split("/");
  return { tela: partes[0] || "mes", arg: partes[1] ? decodeURIComponent(partes[1]) : null };
}

function render() {
  if (!S.d) return;
  const { tela, arg } = rota();
  const aba = tela === "cliente" ? "clientes" : tela;
  document.querySelectorAll("[data-aba]").forEach((a) => {
    if (a.dataset.aba === aba) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const telas = { mes: telaMes, clientes: telaClientes, cliente: telaCliente, metricas: telaMetricas, cobrancas: telaCobrancas, ajustes: telaAjustes };
  (telas[tela] || telaMes)(arg);
}

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

/* ---------------- peças ---------------- */
function forma(f) { return FORMAS[f] || ""; }

function estadoCobranca(c) {
  switch (c.situacao) {
    case "paga": {
      const atraso = c.dias_atraso_pagamento > 0 ? ` · ${plural(c.dias_atraso_pagamento, "dia", "dias")} depois` : "";
      return { cls: "paga", txt: `Pago ${formatarData(c.pago_em, true)}${atraso}` };
    }
    case "atrasada": return { cls: "atrasada", txt: `Venceu ${formatarData(c.vencimento, true)} · ${plural(c.dias_atraso, "dia", "dias")}` };
    case "vence_hoje": return { cls: "vence_hoje", txt: "Vence hoje" };
    case "a_vencer": return { cls: "a_vencer", txt: `Vence ${formatarData(c.vencimento, true)} · em ${plural(c.dias_para_vencer, "dia", "dias")}` };
    case "estornada": return { cls: "estornada", txt: "Estornada" };
    default: return { cls: "excluida", txt: "Excluída no Asaas" };
  }
}

function linhaCobranca(c, titulo, sub) {
  const e = estadoCobranca(c);
  // A forma de pagamento vai na linha de baixo: no estado, o texto quebrava em três linhas no celular.
  const detalhe = (sub ?? (c.descricao || "Sem descrição")) + (c.situacao === "paga" && forma(c.forma) ? ` · ${forma(c.forma)}` : "");
  return `<a class="linha" href="#/cliente/${encodeURIComponent(c.cliente_id)}">
    <div class="linha-principal"><span class="linha-nome">${esc(titulo ?? nomeCliente(c.cliente_id))}</span>
      <span class="linha-sub">${esc(detalhe)}</span></div>
    <div class="linha-valor"><span class="valor">${brl(c.valor)}</span><span class="estado ${e.cls}">${esc(e.txt)}</span></div>
  </a>`;
}

function blocoLista(titulo, lista, opcoes = {}) {
  if (!lista.length) return "";
  const ordenada = opcoes.ordenar ? lista.slice().sort(opcoes.ordenar) : lista;
  return `<section class="cartao">
    <h2>${esc(titulo)}<span class="contagem">${lista.length} · ${brl(soma(lista))}</span></h2>
    <div class="lista">${ordenada.map((c) => linhaCobranca(c)).join("")}</div>
  </section>`;
}

function semDados() {
  if (S.d.cobrancas.length) return "";
  const s = S.d.sync;
  if (s && s.ok === false) return faixa("perigo", `<b>A última leitura do Asaas falhou</b> (${esc(quando(s.inicio))}): ${esc(s.erro || "erro desconhecido")}`);
  return faixa("info", "<b>Ainda sem dados do Asaas.</b> Assim que a chave de API for cadastrada, a primeira conferência traz as cobranças dos últimos 13 meses e as dos próximos 70 dias.");
}

/* ---------------- tela: mês ---------------- */
function telaMes(arg) {
  const h = hoje();
  const atual = mesDe(h);
  const mes = /^\d{4}-\d{2}$/.test(arg || "") ? arg : atual;
  const validas = S.d.cobrancas.filter(valida);
  const doMes = validas.filter((c) => mesDe(c.vencimento) === mes);
  const pagas = doMes.filter((c) => c.situacao === "paga");
  const atrasadas = doMes.filter((c) => c.situacao === "atrasada");
  const abertas = doMes.filter((c) => c.situacao === "a_vencer" || c.situacao === "vence_hoje");
  const previsto = soma(doMes), recebido = soma(pagas), emAtraso = soma(atrasadas), aReceber = soma(abertas);
  const pct = previsto ? Math.round((recebido / previsto) * 100) : 0;
  const anteriores = mes === atual ? validas.filter((c) => c.situacao === "atrasada" && c.vencimento < mes + "-01") : [];
  const deOutros = validas.filter((c) => c.situacao === "paga" && mesDe(c.pago_em) === mes && mesDe(c.vencimento) !== mes);
  const mesAnt = somarMes(mes, -1);
  const doAnt = validas.filter((c) => mesDe(c.vencimento) === mesAnt);

  const largura = (v) => (previsto ? Math.max((v / previsto) * 100, v > 0 ? 1.5 : 0) : 0);
  const segmentos = [["seg-paga", recebido], ["seg-aberto", aReceber], ["seg-atrasada", emAtraso]]
    .filter(([, v]) => v > 0).map(([cls, v]) => `<span class="${cls}" style="width:${largura(v)}%"></span>`).join("");

  let comparacao = doAnt.length
    ? `${maiuscula(nomeMes(mesAnt, false))}: ${brl(soma(doAnt))} previsto, ${brl(soma(doAnt.filter((c) => c.situacao === "paga")))} recebido.`
    : "";
  if (deOutros.length) comparacao += ` Neste mês também entraram ${brl(soma(deOutros))} de cobranças de outros meses.`;

  const vencendoHoje = doMes.filter((c) => c.situacao === "vence_hoje");
  const aVencer = doMes.filter((c) => c.situacao === "a_vencer");
  const porVencimento = (a, b) => a.vencimento.localeCompare(b.vencimento) || nomeCliente(a.cliente_id).localeCompare(nomeCliente(b.cliente_id));
  const porPagamento = (a, b) => String(b.pago_em).localeCompare(String(a.pago_em));

  $("conteudo").innerHTML = `
    <div class="cabeca">
      <div class="troca-mes">
        <a class="icone-btn" href="#/mes/${somarMes(mes, -1)}" aria-label="Mês anterior">${ICONE_VOLTAR}</a>
        <h1>${esc(maiuscula(nomeMes(mes)))}</h1>
        <a class="icone-btn" href="#/mes/${somarMes(mes, 1)}" aria-label="Próximo mês" style="transform:scaleX(-1)">${ICONE_VOLTAR}</a>
      </div>
      ${mes !== atual ? '<a class="btn btn-fantasma btn-pequeno" href="#/mes">Voltar para este mês</a>' : ""}
    </div>
    ${semDados()}
    <section class="cartao destaque">
      <div>
        <div class="rotulo-heroi">Recebido</div>
        <div class="heroi">${brl(recebido)}</div>
        <div class="heroi-sub">de <b>${brl(previsto)}</b> previsto${previsto ? ` · ${pct}%` : ""}</div>
        <div class="segmentos" role="img" aria-label="Recebido ${brl(recebido)}, a receber ${brl(aReceber)}, em atraso ${brl(emAtraso)}">${segmentos}</div>
        <div class="legenda">
          <div><span class="chave"><i class="seg-paga"></i>Recebido</span><div class="valor">${brl(recebido)}</div><div class="qtd">${plural(pagas.length, "cobrança", "cobranças")}</div></div>
          <div><span class="chave"><i class="seg-aberto"></i>A receber</span><div class="valor">${brl(aReceber)}</div><div class="qtd">${plural(abertas.length, "cobrança", "cobranças")}</div></div>
          <div><span class="chave"><i class="seg-atrasada"></i>Em atraso</span><div class="valor">${brl(emAtraso)}</div><div class="qtd">${plural(atrasadas.length, "cobrança", "cobranças")}</div></div>
        </div>
      </div>
      ${comparacao ? `<div class="comparacao">${esc(comparacao)}</div>` : ""}
    </section>
    ${blocoLista("Em atraso", atrasadas, { ordenar: (a, b) => b.dias_atraso - a.dias_atraso })}
    ${blocoLista("Vence hoje", vencendoHoje, { ordenar: porVencimento })}
    ${blocoLista("A vencer", aVencer, { ordenar: porVencimento })}
    ${blocoLista("Pagos", pagas, { ordenar: porPagamento })}
    ${blocoLista("De meses anteriores, ainda em aberto", anteriores, { ordenar: (a, b) => b.dias_atraso - a.dias_atraso })}
    ${!doMes.length && S.d.cobrancas.length ? `<p class="vazio">Nenhuma cobrança com vencimento em ${esc(nomeMes(mes))}.</p>` : ""}`;
}

/* ---------------- tela: clientes ---------------- */
function assinaturasAtivas(clienteId) {
  return S.d.assinaturas.filter((a) => a.cliente_id === clienteId && a.status === "ACTIVE" && !a.excluida);
}

function clientesDaLista() {
  const h = hoje();
  const ativos = new Set(S.d.assinaturas.filter((a) => a.status === "ACTIVE" && !a.excluida).map((a) => a.cliente_id));
  const recentes = new Set(S.d.cobrancas.filter((c) => valida(c) && c.vencimento >= somarDias(h, -90)).map((c) => c.cliente_id));
  const emAberto = new Set(S.d.cobrancas.filter((c) => c.situacao === "atrasada").map((c) => c.cliente_id));
  return S.d.clientes.filter((c) => S.inativos || (!c.excluido && (ativos.has(c.asaas_id) || recentes.has(c.asaas_id) || emAberto.has(c.asaas_id))));
}

function situacaoCliente(id) {
  const atual = mesDe(hoje());
  const cobs = (S.porCliente.get(id) || []).filter(valida);
  const atrasadas = cobs.filter((c) => c.situacao === "atrasada");
  if (atrasadas.length) {
    const dias = Math.max(...atrasadas.map((c) => c.dias_atraso));
    return { ordem: 0, dias, valor: soma(atrasadas), cls: "atrasada", txt: `Em atraso · ${plural(dias, "dia", "dias")}` };
  }
  const doMes = cobs.filter((c) => mesDe(c.vencimento) === atual);
  const aberta = doMes.filter((c) => ABERTAS.includes(c.situacao)).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (aberta) { const e = estadoCobranca(aberta); return { ordem: 1, valor: soma(doMes), cls: e.cls, txt: e.txt }; }
  if (doMes.length) {
    const ultima = doMes.slice().sort((a, b) => String(b.pago_em).localeCompare(String(a.pago_em)))[0];
    return { ordem: 2, valor: soma(doMes), cls: "paga", txt: `Pago ${formatarData(ultima.pago_em, true)}` };
  }
  const proxima = cobs.filter((c) => ABERTAS.includes(c.situacao)).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (proxima) { const e = estadoCobranca(proxima); return { ordem: 3, valor: Number(proxima.valor), cls: e.cls, txt: e.txt }; }
  return { ordem: 4, valor: null, cls: "", txt: `Sem cobrança em ${nomeMes(atual, false)}` };
}

function resumoAssinatura(id) {
  const ass = assinaturasAtivas(id);
  if (!ass.length) return "Sem assinatura ativa";
  return ass.map((a) => `${brl(a.valor)} ${CICLOS[a.ciclo] || ""}${a.proximo_vencimento ? ` · vence dia ${Number(a.proximo_vencimento.slice(8, 10))}` : ""}`).join(" + ");
}

function listaClientesHtml() {
  const termo = S.busca.trim().toLowerCase();
  const linhas = clientesDaLista()
    .filter((c) => !termo || (c.nome || "").toLowerCase().includes(termo) || (c.contato || "").toLowerCase().includes(termo) || (c.cpf_cnpj || "").includes(termo))
    .map((c) => ({ c, s: situacaoCliente(c.asaas_id) }))
    .sort((a, b) => a.s.ordem - b.s.ordem || (b.s.dias || 0) - (a.s.dias || 0) || (a.c.nome || "").localeCompare(b.c.nome || ""));
  if (!linhas.length) return `<p class="vazio">${termo ? "Nenhum cliente encontrado." : "Nenhum cliente ativo."}</p>`;
  return `<div class="lista">${linhas.map(({ c, s }) => {
    const marcas = [
      c.cobranca_pausada ? '<span class="etiqueta alerta">Cobrança pausada</span>' : "",
      !telefoneWhatsApp(c.celular) ? '<span class="etiqueta perigo">Sem celular</span>' : "",
      c.excluido ? '<span class="etiqueta">Excluído no Asaas</span>' : "",
    ].join("");
    return `<a class="linha" href="#/cliente/${encodeURIComponent(c.asaas_id)}">
      <div class="linha-principal"><span class="linha-nome">${esc(c.nome || "Cliente sem nome")}</span>
        <span class="linha-sub">${esc(resumoAssinatura(c.asaas_id))}</span>${marcas ? `<div class="marcas">${marcas}</div>` : ""}</div>
      <div class="linha-valor">${s.valor != null ? `<span class="valor">${brl(s.valor)}</span>` : ""}<span class="estado ${s.cls}">${esc(s.txt)}</span></div>
    </a>`;
  }).join("")}</div>`;
}

function telaClientes() {
  const total = clientesDaLista().length;
  $("conteudo").innerHTML = `
    <div class="cabeca"><div><h1>Clientes</h1><p class="sub">${plural(total, "cliente", "clientes")}${S.inativos ? ", incluindo inativos" : " com assinatura ativa ou cobrança recente"}</p></div></div>
    ${semDados()}
    <div class="barra-busca">
      <input type="search" id="busca" placeholder="Buscar por nome ou CNPJ" value="${esc(S.busca)}" aria-label="Buscar cliente">
      <label class="check"><input type="checkbox" id="ver-inativos" ${S.inativos ? "checked" : ""}> <span>Mostrar inativos</span></label>
    </div>
    <section class="cartao" id="lista-clientes">${listaClientesHtml()}</section>`;
}

/* ---------------- tela: cliente ---------------- */
function telaCliente(id) {
  const c = S.cli.get(id);
  if (!c) {
    $("conteudo").innerHTML = `<a class="voltar" href="#/clientes">${ICONE_VOLTAR} Clientes</a><p class="vazio">Cliente não encontrado.</p>`;
    return;
  }
  const h = hoje();
  const cobs = (S.porCliente.get(id) || []).slice().sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  const validas = cobs.filter(valida);
  const abertas = validas.filter((x) => ABERTAS.includes(x.situacao));
  const atrasadas = validas.filter((x) => x.situacao === "atrasada");
  const pagas12 = validas.filter((x) => x.situacao === "paga" && x.vencimento >= somarDias(h, -365));
  const emDia = pagas12.filter((x) => !x.dias_atraso_pagamento).length;
  const comAtraso = pagas12.filter((x) => x.dias_atraso_pagamento > 0);
  const atrasoMedio = comAtraso.length ? Math.round(comAtraso.reduce((t, x) => t + x.dias_atraso_pagamento, 0) / comAtraso.length) : 0;
  const ids = new Set(cobs.map((x) => x.asaas_id));
  const mensagens = S.d.mensagens.filter((m) => ids.has(m.cobranca_id)).slice(0, 30);
  const tel = telefoneWhatsApp(c.celular);
  const ass = assinaturasAtivas(id);

  $("conteudo").innerHTML = `
    <a class="voltar" href="#/clientes">${ICONE_VOLTAR} Clientes</a>
    <div class="cabeca"><div><h1>${esc(c.nome || "Cliente sem nome")}</h1><p class="sub">${esc(resumoAssinatura(id))}</p></div></div>
    ${c.cobranca_pausada ? faixa("alerta", "<b>Cobrança automática pausada</b> para este cliente. Ele não recebe mensagem de cobrança pelo WhatsApp.") : ""}
    ${!tel ? faixa("perigo", "<b>Sem celular válido no Asaas.</b> A cobrança pelo WhatsApp não tem pra onde ir. Corrija o cadastro no Asaas e ele aparece aqui na próxima conferência.") : ""}
    <div class="numeros">
      <div class="numero"><div class="rot">Em aberto</div><div class="val">${brl(soma(abertas))}</div><div class="det">${atrasadas.length ? `${brl(soma(atrasadas))} em atraso` : plural(abertas.length, "cobrança", "cobranças")}</div></div>
      <div class="numero"><div class="rot">Recebido em 12 meses</div><div class="val">${brl(soma(pagas12))}</div><div class="det">${plural(pagas12.length, "pagamento", "pagamentos")}</div></div>
      <div class="numero"><div class="rot">Pagou em dia</div><div class="val">${pagas12.length ? `${emDia} de ${pagas12.length}` : "Sem histórico"}</div><div class="det">últimos 12 meses</div></div>
      <div class="numero"><div class="rot">Atraso médio</div><div class="val">${comAtraso.length ? plural(atrasoMedio, "dia", "dias") : "Nunca atrasou"}</div><div class="det">${comAtraso.length ? `quando atrasa (${comAtraso.length}x)` : "nos últimos 12 meses"}</div></div>
    </div>
    <div class="duas-colunas">
      <section class="cartao">
        <h2>Cobrança pelo WhatsApp</h2>
        <form id="form-cliente" data-id="${esc(id)}">
          <div class="campo"><label for="cli-contato">Nome na mensagem</label>
            <input type="text" id="cli-contato" maxlength="60" value="${esc(c.contato || "")}" placeholder="${esc(c.nome || "")}">
            <p class="dica">Como chamar o cliente: "Olá, Lucas!". Vazio usa o nome do cadastro no Asaas.</p></div>
          <label class="check"><input type="checkbox" id="cli-pausada" ${c.cobranca_pausada ? "checked" : ""}>
            <span>Pausar cobrança automática<small>Útil quando o cliente está negociando com você.</small></span></label>
          <div class="campo" style="margin-top:8px"><label for="cli-obs">Observação</label>
            <textarea id="cli-obs" maxlength="1000" style="min-height:70px" placeholder="Só você vê.">${esc(c.observacao || "")}</textarea></div>
          <button class="btn">Salvar</button>
          <p class="aviso" id="aviso-cliente"></p>
        </form>
      </section>
      <section class="cartao">
        <h2>Cadastro no Asaas</h2>
        <dl class="dados-cliente">
          <dt>CPF/CNPJ</dt><dd>${esc(c.cpf_cnpj || "Não informado")}</dd>
          <dt>Celular</dt><dd>${tel ? `${esc(c.celular)} · <a href="https://wa.me/${tel}" target="_blank" rel="noopener" style="color:var(--primaria)">abrir WhatsApp</a>` : '<span class="estado atrasada">Sem celular válido</span>'}</dd>
          <dt>E-mail</dt><dd>${esc(c.email || "Não informado")}</dd>
          ${ass.map((a) => `<dt>Assinatura</dt><dd>${brl(a.valor)} ${esc(CICLOS[a.ciclo] || "")}${a.descricao ? ` · ${esc(a.descricao)}` : ""}${a.proximo_vencimento ? `<br><span style="color:var(--texto-2)">Próximo vencimento ${formatarData(a.proximo_vencimento)}</span>` : ""}</dd>`).join("")}
        </dl>
        <p class="desc" style="margin-top:12px">Para mudar celular, e-mail ou valor, altere no Asaas. O app lê de lá.</p>
      </section>
    </div>
    <section class="cartao" style="margin-top:14px">
      <h2>Cobranças<span class="contagem">${cobs.length}</span></h2>
      ${cobs.length ? `<div class="lista">${cobs.map((x) => linhaCobranca(x, maiuscula(nomeMes(mesDe(x.vencimento))), x.descricao || "Sem descrição")).join("")}</div>` : '<p class="vazio">Nenhuma cobrança.</p>'}
    </section>
    <section class="cartao">
      <h2>Mensagens de cobrança<span class="contagem">últimos 60 dias</span></h2>
      ${mensagens.length ? tabelaMensagens(mensagens, false) : '<p class="vazio">Nenhuma mensagem nos últimos 60 dias.</p>'}
    </section>`;
}

function rotuloSituacaoMensagem(m) {
  if (m.situacao === "enviada") return `<span class="etiqueta ok">Enviada</span>`;
  if (m.situacao === "simulada") return `<span class="etiqueta info">Simulada</span>`;
  return `<span class="etiqueta perigo">Falhou${m.tentativas > 1 ? ` (${m.tentativas}x)` : ""}</span>`;
}

// Lista, não tabela: no celular cinco colunas espremiam o detalhe em uma palavra por linha.
function tabelaMensagens(lista, comCliente = true) {
  const cobPorId = new Map(S.d.cobrancas.map((c) => [c.asaas_id, c]));
  return `<div class="lista">${lista.map((m) => {
    const cob = cobPorId.get(m.cobranca_id);
    const titulo = comCliente && cob ? nomeCliente(cob.cliente_id) : ETAPAS[m.etapa] || m.etapa;
    const sub = [comCliente ? ETAPAS[m.etapa] || m.etapa : null, `dia ${formatarData(m.dia, true)}`, cob ? `${brl(cob.valor)}, vence ${formatarData(cob.vencimento, true)}` : null].filter(Boolean).join(" · ");
    const conteudo = `<div class="linha-principal"><span class="linha-nome">${esc(titulo)}</span><span class="linha-sub">${esc(sub)}</span>
        ${m.erro ? `<span class="linha-sub linha-erro">${esc(m.erro)}</span>` : ""}</div>
      <div class="linha-valor">${rotuloSituacaoMensagem(m)}</div>`;
    return comCliente && cob
      ? `<a class="linha" href="#/cliente/${encodeURIComponent(cob.cliente_id)}">${conteudo}</a>`
      : `<div class="linha">${conteudo}</div>`;
  }).join("")}</div>`;
}

/* ---------------- tela: métricas ---------------- */
function telaMetricas() {
  const h = hoje();
  const atual = mesDe(h);
  const validas = S.d.cobrancas.filter(valida);
  const ativas = S.d.assinaturas.filter((a) => a.status === "ACTIVE" && !a.excluida && !S.cli.get(a.cliente_id)?.excluido);
  const mrr = ativas.reduce((t, a) => t + Number(a.valor) * (FATOR_MENSAL[a.ciclo] ?? 1), 0);
  const clientesAtivos = new Set(ativas.map((a) => a.cliente_id)).size;
  const ticket = clientesAtivos ? mrr / clientesAtivos : 0;

  const venceram = validas.filter((c) => c.vencimento >= somarDias(h, -90) && c.vencimento < h);
  const inadimplente = venceram.filter((c) => c.situacao === "atrasada");
  const inad = soma(venceram) ? (soma(inadimplente) / soma(venceram)) * 100 : 0;
  const pagas180 = validas.filter((c) => c.situacao === "paga" && c.vencimento >= somarDias(h, -180));
  const pontuais = pagas180.filter((c) => !c.dias_atraso_pagamento).length;
  const pagasNoMes = validas.filter((c) => c.situacao === "paga" && mesDe(c.pago_em) === atual);
  const taxas = pagasNoMes.reduce((t, c) => t + (c.valor_liquido != null ? Number(c.valor) - Number(c.valor_liquido) : 0), 0);

  const meses = Array.from({ length: 12 }, (_, i) => somarMes(atual, i - 11));
  const serie = meses.map((m) => {
    const doMes = validas.filter((c) => mesDe(c.vencimento) === m);
    return {
      mes: m,
      recebido: soma(validas.filter((c) => c.situacao === "paga" && mesDe(c.pago_em) === m)),
      previsto: soma(doMes),
      aberto: soma(doMes.filter((c) => ABERTAS.includes(c.situacao))),
    };
  });
  S.serie = serie;

  $("conteudo").innerHTML = `
    <div class="cabeca"><div><h1>Métricas</h1><p class="sub">Calculado das cobranças do Asaas. Valores brutos, antes das taxas.</p></div></div>
    ${semDados()}
    <div class="numeros">
      <div class="numero"><div class="rot">Receita recorrente</div><div class="val">${brl(mrr)}</div><div class="det">por mês, assinaturas ativas</div></div>
      <div class="numero"><div class="rot">Clientes ativos</div><div class="val">${clientesAtivos}</div><div class="det">ticket médio ${brl(ticket)}</div></div>
      <div class="numero"><div class="rot">Inadimplência</div><div class="val">${venceram.length ? inad.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "Sem dados"}</div><div class="det">${brl(soma(inadimplente))} em aberto, venceu nos últimos 90 dias</div></div>
      <div class="numero"><div class="rot">Pagam em dia</div><div class="val">${pagas180.length ? Math.round((pontuais / pagas180.length) * 100) + "%" : "Sem dados"}</div><div class="det">${pontuais} de ${pagas180.length} nos últimos 6 meses</div></div>
    </div>
    <section class="cartao">
      <h2>Recebido por mês</h2>
      <p class="desc">Pela data em que o dinheiro entrou. ${taxas > 0 ? `Taxas do Asaas em ${nomeMes(atual, false)}: ${brl(taxas)}.` : ""}</p>
      <div class="grafico" id="grafico"></div>
    </section>
    <section class="cartao">
      <h2>Mês a mês</h2>
      <div class="lista so-celular">${serie.slice().reverse().map((s) => `<div class="linha"><div class="linha-principal"><span class="linha-nome">${esc(maiuscula(nomeMes(s.mes)))}</span>
        <span class="linha-sub">Previsto ${brl(s.previsto)}${s.aberto ? ` · ${brl(s.aberto)} em aberto` : ""}</span></div>
        <div class="linha-valor"><span class="valor">${brl(s.recebido)}</span><span class="linha-sub">recebido</span></div></div>`).join("")}</div>
      <div class="tabela-rolagem so-desktop"><table>
        <thead><tr><th>Mês</th><th class="n">Previsto</th><th class="n">Recebido no mês</th><th class="n">Ainda em aberto</th></tr></thead>
        <tbody>${serie.slice().reverse().map((s) => `<tr><td>${esc(maiuscula(nomeMes(s.mes)))}</td><td class="n">${brl(s.previsto)}</td><td class="n">${brl(s.recebido)}</td><td class="n">${s.aberto ? brl(s.aberto) : "Nada"}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="desc" style="margin-top:10px">Previsto e em aberto contam pelo vencimento; recebido conta pela data do pagamento.</p>
    </section>`;
  desenharGrafico();
}

// Um estilo por eixo: se o topo passa de 10 mil, todos os valores saem em "mil".
function eixoCompacto(v, emMil) {
  if (v === 0) return "0";
  if (emMil) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
function topoBonito(max) {
  if (max <= 0) return 1000;
  const pot = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pot >= max) return m * pot;
  return 10 * pot;
}

// Colunas finas (até 24px), canto de 4px só na ponta, valor só no maior mês e no mês atual; o resto no toque e na tabela.
function desenharGrafico() {
  const alvo = $("grafico");
  if (!alvo || !S.serie) return;
  const serie = S.serie;
  const W = Math.max(alvo.clientWidth, 280), H = 230, esq = 46, dir = 6, cima = 22, baixo = 26;
  const topo = topoBonito(Math.max(...serie.map((s) => s.recebido)));
  const altura = H - cima - baixo;
  const banda = (W - esq - dir) / serie.length;
  const larg = Math.min(24, banda - 2);
  const yDe = (v) => cima + altura - (v / topo) * altura;
  const maiorI = serie.reduce((mi, s, i) => (s.recebido > serie[mi].recebido ? i : mi), 0);
  const ticks = [0, topo / 2, topo];
  const emMil = topo >= 10000;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Recebido por mês nos últimos 12 meses">`;
  for (const t of ticks) {
    const y = yDe(t);
    svg += `<line class="grade" x1="${esq}" x2="${W - dir}" y1="${y}" y2="${y}"/><text class="eixo-texto" x="${esq - 8}" y="${y + 4}" text-anchor="end">${eixoCompacto(t, emMil)}</text>`;
  }
  serie.forEach((s, i) => {
    const x = esq + i * banda + (banda - larg) / 2;
    const y = yDe(s.recebido);
    const hgt = H - baixo - y;
    const r = Math.min(4, hgt, larg / 2);
    const caminho = hgt > 0
      ? `<path class="barra" d="M${x},${H - baixo} V${y + r} Q${x},${y} ${x + r},${y} H${x + larg - r} Q${x + larg},${y} ${x + larg},${y + r} V${H - baixo} Z"/>`
      : "";
    const [a, m] = s.mes.split("-");
    // Em tela estreita o ano não cabe ao lado do mês; ele continua na dica e na lista abaixo.
    const rotX = MESES[Number(m) - 1].slice(0, 3) + (banda >= 44 && (m === "01" || i === 0) ? `/${a.slice(2)}` : "");
    const rotular = s.recebido > 0 && (i === maiorI || i === serie.length - 1);
    svg += `<g class="coluna" data-i="${i}">
      <rect class="alvo" x="${esq + i * banda}" y="${cima}" width="${banda}" height="${altura}" tabindex="0" aria-label="${esc(maiuscula(nomeMes(s.mes)))}: ${brl(s.recebido)} recebido"/>
      ${caminho}
      ${rotular ? `<text class="rotulo-barra" x="${x + larg / 2}" y="${y - 6}" text-anchor="middle">${eixoCompacto(Math.round(s.recebido), emMil)}</text>` : ""}
      <text class="eixo-texto" x="${x + larg / 2}" y="${H - 8}" text-anchor="middle">${rotX}</text>
    </g>`;
  });
  svg += `<line class="grade" x1="${esq}" x2="${W - dir}" y1="${H - baixo}" y2="${H - baixo}"/></svg><div class="dica-grafico" id="dica-grafico" hidden></div>`;
  alvo.innerHTML = svg;

  const dica = $("dica-grafico");
  const mostrar = (g) => {
    const s = serie[Number(g.dataset.i)];
    const caixa = g.querySelector(".alvo").getBBox();
    alvo.querySelectorAll(".coluna.ativa").forEach((x) => x.classList.remove("ativa"));
    g.classList.add("ativa");
    dica.innerHTML = `<b>${esc(maiuscula(nomeMes(s.mes)))}</b>Recebido ${brl(s.recebido)}<br>Previsto ${brl(s.previsto)}`;
    dica.hidden = false;
    const xMeio = caixa.x + caixa.width / 2;
    dica.style.left = Math.min(Math.max(xMeio, 80), W - 80) + "px";
    dica.style.top = Math.max(yDe(s.recebido) - 8, 40) + "px";
  };
  const esconder = () => { dica.hidden = true; alvo.querySelectorAll(".coluna.ativa").forEach((x) => x.classList.remove("ativa")); };
  alvo.querySelectorAll(".coluna").forEach((g) => {
    g.addEventListener("mouseenter", () => mostrar(g));
    g.addEventListener("click", () => mostrar(g));
    g.querySelector(".alvo").addEventListener("focus", () => mostrar(g));
    g.querySelector(".alvo").addEventListener("blur", esconder);
  });
  alvo.querySelector("svg").addEventListener("mouseleave", esconder);
}

let redimensionar;
window.addEventListener("resize", () => {
  clearTimeout(redimensionar);
  redimensionar = setTimeout(() => { if (rota().tela === "metricas") desenharGrafico(); }, 150);
});

/* ---------------- tela: cobrança ---------------- */
function exemploMensagem(envios) {
  const h = hoje();
  const base = envios?.[0];
  if (base) return base;
  const prox = S.d.cobrancas.filter((c) => ABERTAS.includes(c.situacao)).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (prox) return { ...prox, contato: prox.cliente_contato, dias_atraso: prox.dias_atraso || 3 };
  return { contato: "Lucas", valor: 1500, vencimento: somarDias(h, 10), descricao: "Gestão de tráfego", link_fatura: "https://www.asaas.com/i/exemplo", dias_atraso: 3 };
}

async function telaCobrancas() {
  const cfg = S.d.config;
  const h = hoje();
  const ligada = cfg.cobranca_ativa;
  const deHoje = S.d.mensagens.filter((m) => m.dia === h);
  const semCelular = clientesDaLista().filter((c) => !c.excluido && !telefoneWhatsApp(c.celular));
  const historico = S.d.mensagens.filter((m) => S.filtroHist === "todas" || m.situacao === S.filtroHist).slice(0, 100);

  $("conteudo").innerHTML = `
    <div class="cabeca"><div><h1>Cobrança pelo WhatsApp</h1><p class="sub">Envio às 9h, com nova tentativa de hora em hora até as 18h para o que falhar.</p></div></div>
    <section class="cartao">
      <div class="estado-cobranca ${ligada ? "ligada" : ""}">
        <div>
          <div class="titulo"><i></i>${ligada ? `Ligada desde ${formatarData(cfg.ativada_em)}` : "Modo teste"}</div>
          <p>${ligada
            ? "As cobranças saem pelo número de cobrança. Confira se o WhatsApp e o SMS do Asaas continuam desligados, senão o cliente recebe duas vezes."
            : "Nada sai pelo WhatsApp. Todo dia o app registra o que mandaria, para você comparar com o que o Asaas está enviando antes de virar a chave."}</p>
        </div>
        ${ligada
          ? '<button class="btn btn-perigo" data-acao="desligar-cobranca">Voltar ao modo teste</button>'
          : '<button class="btn" data-acao="ligar-cobranca">Ligar cobrança</button>'}
      </div>
    </section>

    <section class="cartao">
      <h2>Hoje</h2>
      <div id="envios-hoje"><p class="vazio">Calculando...</p></div>
      ${deHoje.length ? `<h2 style="margin:16px 0 8px;font-size:13px;color:var(--texto-2)">Já registradas hoje</h2>${tabelaMensagens(deHoje)}` : ""}
    </section>

    ${semCelular.length ? `<section class="cartao"><h2>Sem celular válido no Asaas<span class="contagem">${semCelular.length}</span></h2>
      <p class="desc">Esses clientes não recebem cobrança pelo WhatsApp até o celular ser corrigido no Asaas.</p>
      <div class="lista">${semCelular.map((c) => `<a class="linha" href="#/cliente/${encodeURIComponent(c.asaas_id)}"><div class="linha-principal"><span class="linha-nome">${esc(c.nome || "Cliente sem nome")}</span><span class="linha-sub">${esc(c.celular ? `Cadastrado: ${c.celular}` : "Nenhum telefone cadastrado")}</span></div></a>`).join("")}</div></section>` : ""}

    <section class="cartao">
      <h2>Regras</h2>
      <form id="form-regras">
        <div class="regras">
          <div class="campo"><label for="dias-antes">Mandar a cobrança</label>
            <div class="inline-num"><input type="number" id="dias-antes" min="1" max="30" value="${cfg.dias_antes}" required><span>dias antes do vencimento</span></div></div>
          <div class="campo"><label for="avisar-atraso">Me avisar no celular quando o atraso chegar a</label>
            <div class="inline-num"><input type="number" id="avisar-atraso" min="1" max="90" value="${cfg.avisar_atraso_dias}" required><span>dias</span></div></div>
          <label class="check"><input type="checkbox" id="no-dia" ${cfg.avisar_no_dia ? "checked" : ""}><span>Lembrete no dia do vencimento</span></label>
          <label class="check"><input type="checkbox" id="atraso-diario" ${cfg.cobrar_atraso_diario ? "checked" : ""}><span>Em atraso, uma mensagem por dia até pagar</span></label>
          <label class="check"><input type="checkbox" id="enviar-pix" ${cfg.enviar_pix ? "checked" : ""}><span>Mandar o Pix copia e cola numa mensagem separada<small>No celular, o cliente só segura e copia. Não vale para cobrança no cartão.</small></span></label>
        </div>
        <div class="acoes" style="margin-top:10px"><button class="btn">Salvar regras</button></div>
        <p class="aviso" id="aviso-regras"></p>
      </form>
    </section>

    <section class="cartao">
      <h2>Textos</h2>
      <p class="desc">Clique numa variável para inserir onde está o cursor. Linha com variável vazia (ex.: cobrança sem descrição) some da mensagem.</p>
      <div class="variaveis">${VARIAVEIS.map(([v, d]) => `<button type="button" data-acao="variavel" data-var="${v}" title="${esc(d)}">${v}</button>`).join("")}</div>
      <form id="form-textos" class="textos">
        ${["antes", "no_dia", "atraso"].map((et) => `
          <div>
            <label class="rotulo" for="texto-${et}">${ETAPAS[et]}</label>
            <div class="texto-editor">
              <textarea id="texto-${et}" data-etapa="${et}" maxlength="1500" required>${esc(modeloDaEtapa(cfg, et))}</textarea>
              <div class="texto-mensagem" id="previa-${et}" aria-live="polite"></div>
            </div>
          </div>`).join("")}
        <div class="acoes"><button class="btn">Salvar textos</button></div>
        <p class="aviso" id="aviso-textos"></p>
      </form>
    </section>

    <section class="cartao">
      <h2>Histórico<span class="contagem">últimos 60 dias</span></h2>
      <div class="acoes" style="margin-bottom:10px">
        <select id="filtro-hist" style="width:auto" aria-label="Filtrar histórico">
          ${[["todas", "Todas"], ["enviada", "Enviadas"], ["simulada", "Simuladas"], ["falhou", "Falharam"]].map(([v, r]) => `<option value="${v}" ${S.filtroHist === v ? "selected" : ""}>${r}</option>`).join("")}
        </select>
      </div>
      ${historico.length ? tabelaMensagens(historico) : '<p class="vazio">Nenhuma mensagem registrada.</p>'}
    </section>`;

  const { data: envios, error } = await sb.rpc("financeiro_envios_de_hoje");
  const caixa = $("envios-hoje");
  if (!caixa) return;
  S.exemplo = exemploMensagem(envios);
  atualizarPrevias();
  if (error) { caixa.innerHTML = `<p class="aviso erro">Não deu pra calcular: ${esc(error.message)}</p>`; return; }
  if (!envios.length) {
    caixa.innerHTML = `<p class="vazio">${deHoje.length ? "Nada pendente: o que tinha para hoje já foi registrado abaixo." : "Nenhuma cobrança para mandar hoje."}</p>`;
    return;
  }
  caixa.innerHTML = `<p class="desc">${ligada ? "Saem na próxima rodada (9h, e de hora em hora até as 18h):" : "No modo teste, a próxima rodada registra estas como simuladas:"}</p>
    ${envios.map((e) => `<details class="envio">
      <summary class="linha"><div class="linha-principal"><span class="linha-nome">${esc(e.cliente_nome || "Cliente sem nome")}</span>
        <span class="linha-sub">${esc(ETAPAS[e.etapa])}${e.situacao_hoje === "falhou" ? ` · nova tentativa (${e.tentativas_hoje} de 3)` : ""}${!telefoneWhatsApp(e.celular) ? " · sem celular" : ""}</span></div>
        <div class="linha-valor"><span class="valor">${brl(e.valor)}</span><span class="estado ${e.etapa === "atraso" ? "atrasada" : e.etapa === "no_dia" ? "vence_hoje" : "a_vencer"}">${e.etapa === "atraso" ? `${plural(e.dias_atraso, "dia", "dias")} de atraso` : e.etapa === "no_dia" ? "Vence hoje" : `Vence ${formatarData(e.vencimento, true)}`}</span></div>
      </summary>
      <div class="texto-mensagem">${esc(montarMensagem(modeloDaEtapa(cfg, e.etapa), e))}</div>
    </details>`).join("")}`;
}

function atualizarPrevias() {
  if (!S.exemplo) return;
  for (const et of ["antes", "no_dia", "atraso"]) {
    const area = $("texto-" + et);
    const previa = $("previa-" + et);
    if (area && previa) previa.textContent = montarMensagem(area.value, S.exemplo);
  }
}

function abrirDialogo(html) {
  const d = $("dialogo");
  d.innerHTML = html;
  d.showModal();
  return d;
}

function dialogoLigar() {
  const d = abrirDialogo(`<div class="corpo">
      <h2>Ligar a cobrança pelo WhatsApp?</h2>
      <p>A partir da próxima rodada as mensagens saem de verdade pelo número de cobrança. Antes, confira:</p>
      <ol>
        <li>O último cliente deste ciclo já pagou (a virada combinada).</li>
        <li>O número de cobrança está conectado no NeoGo e foi testado.</li>
        <li>Os clientes foram avisados de que a cobrança passa a vir desse número.</li>
        <li>O WhatsApp e o SMS do Asaas vão ser desligados agora, senão o cliente recebe em dobro.</li>
      </ol>
      <p style="margin-top:10px">Quem já está na janela dos ${S.d.config.dias_antes} dias não recebe a primeira mensagem de novo, porque o Asaas já mandou.</p>
    </div>
    <div class="rodape"><button class="btn btn-fantasma" data-acao="fechar-dialogo">Cancelar</button><button class="btn" data-acao="confirmar-ligar">Ligar</button></div>`);
  return d;
}

async function mudarCobranca(ativa) {
  const { error } = await sb.from("financeiro_config").update({ cobranca_ativa: ativa }).eq("id", true);
  $("dialogo").close();
  if (error) return toast("Não deu pra salvar: " + error.message, true);
  await carregar();
  render();
  toast(ativa ? "Cobrança ligada." : "Voltou ao modo teste.");
}

/* ---------------- tela: ajustes ---------------- */
async function telaAjustes() {
  const s = S.d.sync;
  const ev = S.d.evento;
  const tema = (() => { try { return localStorage.getItem("fin_tema") || "claro"; } catch { return "claro"; } })();
  $("conteudo").innerHTML = `
    <div class="cabeca"><div><h1>Ajustes</h1></div></div>
    <section class="cartao" id="painel-push"><h2>Notificações</h2><p class="vazio">Verificando...</p></section>
    <section class="cartao">
      <h2>Dados do Asaas</h2>
      <dl class="dados-cliente">
        <dt>Última conferência</dt><dd>${s ? `${esc(quando(s.inicio))} · ${s.ok === false ? `<span class="estado atrasada">falhou: ${esc(s.erro || "")}</span>` : s.ok ? `<span class="estado paga">ok</span>${s.resumo ? ` <span style="color:var(--texto-2)">(${s.resumo.cobrancas ?? 0} cobranças, ${s.resumo.clientes ?? 0} clientes)</span>` : ""}` : "em andamento"}` : "nunca"}</dd>
        <dt>Último aviso do Asaas</dt><dd>${ev ? `${esc(quando(ev.recebido_em))} · ${esc(ev.evento)}` : "nenhum ainda"}</dd>
      </dl>
      <p class="desc" style="margin-top:12px">O Asaas avisa o app na hora de cada pagamento. Às 6h, 12h e 18h o app confere tudo com o Asaas, pra não perder nada se algum aviso falhar.</p>
      <div class="acoes"><button class="btn btn-fantasma" data-acao="sincronizar">Conferir agora</button></div>
      <p class="aviso" id="aviso-sync"></p>
    </section>
    <section class="cartao">
      <h2>Últimas notificações</h2>
      ${S.d.avisos.length ? `<div class="lista">${S.d.avisos.map((a) => `<a class="linha" href="${esc(a.url || "#/mes")}"><div class="linha-principal"><span class="linha-nome">${esc(a.titulo)}</span><span class="linha-sub">${esc(a.corpo)}</span></div><div class="linha-valor"><span class="estado ${a.enviado_em ? "paga" : a.tentativas ? "atrasada" : ""}">${a.enviado_em ? quando(a.criado_em) : a.tentativas ? "não chegou" : "na fila"}</span></div></a>`).join("")}</div>` : '<p class="vazio">Nenhuma ainda.</p>'}
    </section>
    ${window.instalacao.painelInstalar()}
    <section class="cartao">
      <h2>Aparência</h2>
      <label class="seletor-tema" style="justify-content:flex-start;margin:0">Tema <select data-tema aria-label="Tema"><option value="claro">Claro</option><option value="escuro">Escuro</option><option value="sistema">Sistema</option></select></label>
    </section>
    <section class="cartao"><h2>Conta</h2><div class="acoes"><button class="btn btn-fantasma" data-acao="sair">Sair</button></div></section>`;
  document.querySelectorAll("[data-tema]").forEach((el) => { el.value = tema; });
  await painelPush();
}

/* ---------------- notificações ---------------- */
function base64ParaBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bruto = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

async function painelPush() {
  const alvo = $("painel-push");
  if (!alvo) return;
  const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  let inscrito = false;
  if (suporta) {
    const reg = await navigator.serviceWorker.getRegistration("/");
    inscrito = !!(reg && (await reg.pushManager.getSubscription()));
  }
  let estado;
  if (!suporta) {
    estado = window.instalacao.ehIphone() && !window.instalacao.appInstalado()
      ? "No iPhone, a notificação só funciona com o app instalado: Compartilhar, Adicionar à Tela de Início, abrir por lá e voltar aqui."
      : "Este navegador não suporta notificações.";
  } else if (Notification.permission === "denied") {
    estado = "As notificações estão bloqueadas para este site. Libere nas configurações do navegador e volte aqui.";
  } else {
    estado = inscrito ? "Ativadas neste aparelho." : "Desativadas neste aparelho.";
  }
  alvo.innerHTML = `<h2>Notificações</h2>
    <p class="desc">Ative em cada aparelho que você usa. Sem isso nada chega.</p>
    <ul class="passos">
      <li><b>Pagamento:</b> na hora em que o cliente paga, com valor, forma e se foi em dia.</li>
      <li><b>Dia 1:</b> o previsto do mês.</li>
      <li><b>Atraso:</b> quando um cliente chega a ${S.d.config.avisar_atraso_dias} dias de atraso.</li>
      <li><b>Problema:</b> cobrança que não saiu ou leitura do Asaas que falhou.</li>
    </ul>
    <p style="margin-bottom:12px"><b>${esc(estado)}</b></p>
    <div class="acoes">
      ${suporta && Notification.permission !== "denied" ? `<button class="btn" data-acao="ativar-push">${inscrito ? "Reativar neste aparelho" : "Ativar neste aparelho"}</button>` : ""}
      ${inscrito ? '<button class="btn btn-fantasma" data-acao="testar-push">Enviar teste</button><button class="btn btn-fantasma" data-acao="desativar-push">Desativar</button>' : ""}
    </div>
    <p class="aviso" id="aviso-push"></p>`;
}

async function chamarFuncao(corpo) {
  const { data: sessao } = await sb.auth.getSession();
  const res = await fetch(FUNCAO, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token}`, apikey: SUPABASE_KEY },
    body: JSON.stringify(corpo),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) throw new Error(json.erro || "sem resposta do servidor");
  return json;
}

async function ativarPush() {
  try {
    aviso("aviso-push", "Ativando...");
    const permissao = await Notification.requestPermission();
    if (permissao !== "granted") return aviso("aviso-push", "Permissão não concedida.", "erro");
    const { data: chave, error: e1 } = await sb.rpc("financeiro_vapid_publica");
    if (e1 || !chave) return aviso("aviso-push", "O servidor de notificações ainda não foi configurado.", "erro");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let inscricao = await reg.pushManager.getSubscription();
    if (!inscricao) inscricao = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave) });
    const j = inscricao.toJSON();
    const { error } = await sb.rpc("financeiro_salvar_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error) return aviso("aviso-push", "Não deu pra salvar: " + error.message, "erro");
    await painelPush();
    await testarPush();
  } catch (e) {
    aviso("aviso-push", "Não deu pra ativar: " + e.message, "erro");
  }
}

async function testarPush() {
  aviso("aviso-push", "Enviando teste...");
  try {
    const r = await chamarFuncao({ acao: "teste" });
    aviso("aviso-push", r.enviados ? `Teste enviado para ${plural(r.enviados, "aparelho", "aparelhos")}.` : "Nenhum aparelho recebeu: " + (r.erros || []).join("; "), r.enviados ? "ok" : "erro");
  } catch (e) {
    aviso("aviso-push", "Não deu pra enviar: " + e.message, "erro");
  }
}

async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const inscricao = reg && (await reg.pushManager.getSubscription());
  if (inscricao) {
    await sb.from("financeiro_push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
    await inscricao.unsubscribe();
  }
  await painelPush();
}

async function sincronizarAgora(btn) {
  btn.disabled = true;
  aviso("aviso-sync", "Conferindo com o Asaas...");
  try {
    const r = await chamarFuncao({ acao: "sincronizar" });
    if (!r.ok) throw new Error(r.erro || "falhou");
    await carregar();
    render();
    toast(`Conferido: ${r.cobrancas} cobranças, ${r.clientes} clientes.`);
  } catch (e) {
    aviso("aviso-sync", "Não deu pra conferir: " + e.message, "erro");
    btn.disabled = false;
  }
}

/* ---------------- eventos ---------------- */
document.addEventListener("click", async (e) => {
  const alvo = e.target.closest("[data-acao]");
  if (!alvo) return;
  const acao = alvo.dataset.acao;
  if (acao === "sair") return sair();
  if (acao === "recarregar") return recarregar();
  if (acao === "instalar") { await window.instalacao.instalarApp(); return render(); }
  if (acao === "ativar-push") return ativarPush();
  if (acao === "testar-push") return testarPush();
  if (acao === "desativar-push") return desativarPush();
  if (acao === "sincronizar") return sincronizarAgora(alvo);
  if (acao === "ligar-cobranca") return dialogoLigar();
  if (acao === "confirmar-ligar") return mudarCobranca(true);
  if (acao === "desligar-cobranca") {
    abrirDialogo(`<div class="corpo"><h2>Voltar ao modo teste?</h2><p>A cobrança para de sair pelo WhatsApp a partir da próxima rodada. Se o WhatsApp do Asaas estiver desligado, os clientes ficam sem lembrete até você religar um dos dois.</p></div>
      <div class="rodape"><button class="btn btn-fantasma" data-acao="fechar-dialogo">Cancelar</button><button class="btn btn-perigo" data-acao="confirmar-desligar">Voltar ao modo teste</button></div>`);
    return;
  }
  if (acao === "confirmar-desligar") return mudarCobranca(false);
  if (acao === "fechar-dialogo") return $("dialogo").close();
  if (acao === "variavel") {
    const area = S.ultimoTexto && document.body.contains(S.ultimoTexto) ? S.ultimoTexto : $("texto-antes");
    if (!area) return;
    const ini = area.selectionStart ?? area.value.length;
    area.setRangeText(alvo.dataset.var, ini, area.selectionEnd ?? ini, "end");
    area.focus();
    atualizarPrevias();
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "busca") {
    S.busca = e.target.value;
    const lista = $("lista-clientes");
    if (lista) lista.innerHTML = listaClientesHtml();
  }
  if (e.target.matches("textarea[data-etapa]")) atualizarPrevias();
});

document.addEventListener("focusin", (e) => {
  if (e.target.matches("textarea[data-etapa]")) S.ultimoTexto = e.target;
});

document.addEventListener("change", (e) => {
  if (e.target.id === "ver-inativos") { S.inativos = e.target.checked; telaClientes(); }
  if (e.target.id === "filtro-hist") { S.filtroHist = e.target.value; telaCobrancas(); }
});

document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (form.id === "form-cliente") {
    e.preventDefault();
    aviso("aviso-cliente", "Salvando...");
    const mudanca = {
      contato: $("cli-contato").value.trim() || null,
      cobranca_pausada: $("cli-pausada").checked,
      observacao: $("cli-obs").value.trim() || null,
    };
    const { error } = await sb.from("financeiro_clientes").update(mudanca).eq("asaas_id", form.dataset.id);
    if (error) return aviso("aviso-cliente", "Não deu pra salvar: " + error.message, "erro");
    Object.assign(S.cli.get(form.dataset.id), mudanca);
    await carregar();
    render();
    toast("Cliente salvo.");
  }
  if (form.id === "form-regras") {
    e.preventDefault();
    aviso("aviso-regras", "Salvando...");
    const { error } = await sb.from("financeiro_config").update({
      dias_antes: Number($("dias-antes").value),
      avisar_atraso_dias: Number($("avisar-atraso").value),
      avisar_no_dia: $("no-dia").checked,
      cobrar_atraso_diario: $("atraso-diario").checked,
      enviar_pix: $("enviar-pix").checked,
    }).eq("id", true);
    if (error) return aviso("aviso-regras", "Não deu pra salvar: " + error.message, "erro");
    await carregar();
    toast("Regras salvas.");
    telaCobrancas();
  }
  if (form.id === "form-textos") {
    e.preventDefault();
    const textos = { texto_antes: $("texto-antes").value, texto_no_dia: $("texto-no_dia").value, texto_atraso: $("texto-atraso").value };
    if (Object.values(textos).some((t) => !t.includes("{link}"))) return aviso("aviso-textos", "Todo texto precisa ter {link}, senão o cliente não tem como pagar.", "erro");
    if (Object.values(textos).some((t) => t.includes("—"))) return aviso("aviso-textos", "Tire o travessão dos textos: use vírgula, ponto ou dois pontos.", "erro");
    aviso("aviso-textos", "Salvando...");
    const { error } = await sb.from("financeiro_config").update(textos).eq("id", true);
    if (error) return aviso("aviso-textos", "Não deu pra salvar: " + error.message, "erro");
    Object.assign(S.d.config, textos);
    aviso("aviso-textos", "Textos salvos.", "ok");
  }
});

// Clique na notificação com o app aberto: o service worker manda a rota.
navigator.serviceWorker?.addEventListener("message", (e) => {
  if (e.data?.tipo !== "abrir") return;
  location.hash = new URL(e.data.url).hash || "#/mes";
  recarregar();
});

// Voltou pro app depois de um tempo: busca de novo (alguém pode ter pago).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.d && Date.now() - S.carregadoEm > 60000) recarregar();
});
document.addEventListener("instalacao-mudou", () => { if (rota().tela === "ajustes") render(); });

/* ---------------- início ---------------- */
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  try {
    if (await precisaSegundaEtapa()) return pedirCodigo();
    await entrar();
  } catch (err) {
    aviso("aviso-login", err.message, "erro");
  }
})();
