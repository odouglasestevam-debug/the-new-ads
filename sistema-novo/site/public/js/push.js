/* ---------------- app instalado e notificação no celular ----------------
   Avisa o atendente a cada mensagem nova dos leads dele e quando um lead é atribuído a ele
   (dono e gestor também recebem mensagem de lead sem responsável; a regra fica no banco, 0032).
   O aparelho se inscreve aqui, o servidor manda pelo serviço do próprio sistema operacional,
   e tocar na notificação abre a conversa. A chave abaixo é pública por definição:
   ela só permite receber, quem assina o envio é a chave privada, que fica no cofre do banco. */
const PUSH_CHAVE_PUBLICA = "BBJmCzhSikD8uQtq6sVd-NEPHH4jfKq0nS7C3LvHC9SIwsXMHZo0MuN_tvJsgOnlI0eY2Rl9cbts3vIUuBTTDgg";

let pushEstado = { suporte: null, permissao: null, inscrito: false, ocupado: false, aviso: "" };
let pushRegistro = null;
let pedidoInstalacao = null;

const noCelularApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instaladoNaTela = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const notificacaoLigada = () => pushEstado.inscrito && pushEstado.permissao === "granted";

function base64ParaBytes(base64) {
  const limpo = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(limpo);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

// Redesenha só quando a faixa do topo da lista mudaria; render() a toda hora tiraria o foco da busca.
function redesenharSeFaixaMudou(antes) {
  if (usuario && empresaAtual && vistaAtual === "conversas" && JSON.stringify(estadoFaixa()) !== antes) render();
}

// Registra o service worker e, se a pessoa já autorizou, renova a inscrição.
// Renovar sempre é de propósito: o navegador troca o endereço do aparelho de tempos em tempos.
async function prepararPush() {
  const antes = JSON.stringify(estadoFaixa());
  pushEstado.suporte = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!pushEstado.suporte) { redesenharSeFaixaMudou(antes); return; }
  pushEstado.permissao = Notification.permission;
  try {
    await navigator.serviceWorker.register("/sw.js");
    // registrar não basta: o service worker precisa estar ativo para aceitar a inscrição
    pushRegistro = await navigator.serviceWorker.ready;
    pushEstado.inscrito = !!(await pushRegistro.pushManager.getSubscription());
  } catch (err) {
    console.error("push:", err);
  }
  redesenharSeFaixaMudou(antes);
}

// Depois que existe sessão, renova a inscrição deste aparelho uma vez por carregamento:
// o navegador troca o endereço de tempos em tempos e o banco precisa acompanhar.
let pushRenovado = false;
async function renovarPush() {
  if (pushRenovado || !usuario || !pushEstado.suporte) return;
  pushRenovado = true;
  try {
    if (!pushRegistro) await prepararPush();
    const inscricao = await pushRegistro?.pushManager.getSubscription();
    if (inscricao && Notification.permission === "granted") await guardarInscricao(inscricao);
  } catch (err) {
    console.error("push:", err);
  }
}

async function guardarInscricao(inscricao) {
  const bruta = inscricao.toJSON();
  const { error } = await sb.rpc("crm_salvar_push", {
    p_endpoint: bruta.endpoint,
    p_p256dh: bruta.keys?.p256dh,
    p_auth: bruta.keys?.auth,
  });
  if (error) throw new Error(error.message);
}

async function ligarNotificacoes() {
  if (!pushRegistro) await prepararPush();
  if (!pushEstado.suporte) throw new Error("Este navegador não recebe notificação.");
  const permissao = await Notification.requestPermission();
  pushEstado.permissao = permissao;
  if (permissao !== "granted") throw new Error("Você precisa permitir a notificação para o navegador.");
  const inscricao = await pushRegistro.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ParaBytes(PUSH_CHAVE_PUBLICA),
  });
  await guardarInscricao(inscricao);
  pushEstado.inscrito = true;
}

async function desligarNotificacoes() {
  const inscricao = await pushRegistro?.pushManager.getSubscription();
  if (inscricao) {
    await sb.rpc("crm_apagar_push", { p_endpoint: inscricao.endpoint });
    await inscricao.unsubscribe();
  }
  pushEstado.inscrito = false;
}

async function testarNotificacao() {
  const { data: sessao } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/crm-notificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.session.access_token}` },
    body: JSON.stringify({ acao: "teste" }),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || `Erro ${res.status}`);
  return dados;
}

/* ---------------- instalar como app ---------------- */
// O Chrome (Android e computador) entrega o convite de instalação; o CRM guarda e usa no botão.
window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  const antes = JSON.stringify(estadoFaixa());
  pedidoInstalacao = evento;
  redesenharSeFaixaMudou(antes);
  if (usuario && vistaAtual === "config" && abaAjustes === "notificacoes") render();
});
window.addEventListener("appinstalled", () => {
  pedidoInstalacao = null;
  if (usuario) render();
});

async function instalarApp() {
  if (!pedidoInstalacao) return false;
  pedidoInstalacao.prompt();
  await pedidoInstalacao.userChoice.catch(() => null);
  pedidoInstalacao = null;
  return true;
}

function blocoInstalar() {
  let corpo;
  if (instaladoNaTela()) {
    corpo = '<p>Você está usando o CRM instalado. Ele abre pelo ícone, sem a barra do navegador.</p>';
  } else if (pedidoInstalacao) {
    corpo = `<p>Coloca o CRM na tela inicial e na lista de apps, com ícone próprio e sem a barra do navegador.</p>
      <button class="btn btn-largo" type="button" data-instalar>Instalar o CRM</button>`;
  } else if (noCelularApple()) {
    corpo = `<p>No iPhone e no iPad, a instalação é pelo Safari, e a notificação só funciona com o CRM instalado:</p>
      <ol class="passos-instalar">
        <li>Abra <b>crm.thenewads.com.br</b> no Safari</li>
        <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima)</li>
        <li>Escolha <b>Adicionar à Tela de Início</b> e confirme</li>
        <li>Abra o CRM pelo ícone novo e ligue a notificação aqui</li>
      </ol>`;
  } else {
    corpo = `<p>No Android, abra o menu do Chrome (os três pontinhos) e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
      No computador, use o ícone de instalar no fim da barra de endereço. Se a opção não aparecer, recarregue a página uma vez.</p>`;
  }
  return `<div class="bloco" id="instalar-app">
    <h3>Instalar no celular <span class="selo ${instaladoNaTela() ? "sim" : "nao"}" style="margin-left:8px">${instaladoNaTela() ? "instalado" : "no navegador"}</span></h3>
    ${corpo}
  </div>`;
}

function blocoNotificacoes() {
  const aviso = pushEstado.aviso ? `<div class="aviso ${pushEstado.aviso.tipo || ""}" id="aviso-push">${escapar(pushEstado.aviso.msg)}</div>` : '<div class="aviso" id="aviso-push"></div>';
  const oQueAvisa = `<p>Avisa a cada mensagem nova dos leads que são seus e quando um lead for atribuído a você. Dono e gestor também recebem as mensagens de lead sem responsável. Tocar no aviso abre a conversa.</p>`;

  // No iPhone o push só existe com o app na tela de início. É regra da Apple, não do CRM.
  if (noCelularApple() && !instaladoNaTela()) {
    return `
      <div class="bloco">
        <h3>Notificações <span class="selo nao" style="margin-left:8px">falta instalar</span></h3>
        ${oQueAvisa}
        <p class="ajuda">No iPhone e no iPad, instale o CRM primeiro (passo a passo acima) e ligue a notificação pelo app instalado.</p>
      </div>`;
  }
  if (pushEstado.suporte === false) {
    return `
      <div class="bloco">
        <h3>Notificações <span class="selo nao" style="margin-left:8px">sem suporte</span></h3>
        <p>Este navegador não recebe notificação. Abra o CRM no Chrome, no Edge, no Firefox ou no Safari do iPhone com o app instalado.</p>
      </div>`;
  }
  if (pushEstado.permissao === "denied") {
    return `
      <div class="bloco">
        <h3>Notificações <span class="selo nao" style="margin-left:8px">bloqueadas</span></h3>
        <p>A notificação foi bloqueada para este site. Libere nas permissões do navegador (o cadeado ao lado do endereço, ou Configurações do Android, Apps, CRM, Notificações) e recarregue a página.</p>
      </div>`;
  }

  const ligada = notificacaoLigada();
  return `
    <div class="bloco">
      <h3>Notificações <span class="selo ${ligada ? "sim" : "nao"}" style="margin-left:8px">${ligada ? "ligadas" : "desligadas"}</span></h3>
      ${oQueAvisa}
      <p class="ajuda">Vale por aparelho: ligue em cada celular e computador que você usa para atender.</p>
      ${ligada
        ? `<button class="btn btn-largo" type="button" data-push="teste" ${pushEstado.ocupado ? "disabled" : ""}>Mandar uma notificação de teste</button>
           <button class="btn btn-largo btn-fantasma" type="button" data-push="desligar" ${pushEstado.ocupado ? "disabled" : ""} style="margin-top:8px">Desligar neste aparelho</button>`
        : `<button class="btn btn-largo" type="button" data-push="ligar" ${pushEstado.ocupado ? "disabled" : ""}>Ligar notificações neste aparelho</button>`}
      ${aviso}
    </div>`;
}

/* ---------------- faixa no topo da lista de conversas ----------------
   Como o WhatsApp Web: enquanto o aparelho não avisa, a lista mostra como ligar.
   "Agora não" esconde por 7 dias neste aparelho. */
const CHAVE_FAIXA = "crm:faixa-app-dispensada";
function faixaDispensada() {
  try { return Date.now() - Number(localStorage.getItem(CHAVE_FAIXA) || 0) < 7 * 864e5; } catch { return false; }
}
function estadoFaixa() {
  if (pushEstado.suporte === null || faixaDispensada()) return null;
  if (noCelularApple() && !instaladoNaTela()) {
    return { titulo: "Receba as mensagens no iPhone", texto: "Instale o CRM na tela de início para ligar as notificações.", botao: "Como instalar", acao: "como-instalar" };
  }
  if (pushEstado.suporte && pushEstado.permissao === "denied") {
    return { titulo: "Notificações bloqueadas", texto: "Libere nas permissões do site para saber de cada mensagem nova.", botao: "Como liberar", acao: "como-instalar" };
  }
  if (pushEstado.suporte && !notificacaoLigada()) {
    return { titulo: "Receba notificações de mensagens novas", texto: "Avisa a cada mensagem dos seus leads e a cada lead atribuído a você.", botao: "Ativar notificações", acao: "ligar" };
  }
  if (pedidoInstalacao && !instaladoNaTela()) {
    return { titulo: "Instale o CRM", texto: "Abre pelo ícone, como um aplicativo, e as notificações ficam mais confiáveis.", botao: "Instalar", acao: "instalar" };
  }
  return null;
}

const ICONE_SINO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></svg>';

function faixaAvisoApp() {
  const f = estadoFaixa();
  if (!f) return "";
  return `<div class="faixa-app" role="region" aria-label="${escapar(f.titulo)}">
    <span class="faixa-icone">${ICONE_SINO}</span>
    <div class="faixa-texto"><strong>${escapar(f.titulo)}</strong><span>${escapar(f.texto)}</span>
      <button class="faixa-acao" type="button" data-faixa="${f.acao}" ${pushEstado.ocupado ? "disabled" : ""}>${escapar(f.botao)}</button></div>
    <button class="icone-btn faixa-fechar" type="button" data-faixa="dispensar" aria-label="Agora não" title="Agora não"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </div>`;
}

function irParaInstalacao() {
  vistaAtual = "config";
  abaAjustes = "notificacoes";
  render();
  document.getElementById("instalar-app")?.scrollIntoView({ block: "start" });
}

async function acaoFaixa(acao) {
  if (acao === "dispensar") {
    try { localStorage.setItem(CHAVE_FAIXA, String(Date.now())); } catch {}
    render();
    return;
  }
  if (acao === "como-instalar") { irParaInstalacao(); return; }
  if (acao === "instalar") { if (!(await instalarApp())) irParaInstalacao(); else render(); return; }
  pushEstado.ocupado = true;
  render();
  try {
    await ligarNotificacoes();
    toastFaixa("Pronto. Este aparelho vai avisar a cada mensagem nova.");
  } catch (err) {
    toastFaixa(err.message);
  }
  pushEstado.ocupado = false;
  render();
}

// Recado curto abaixo da lista; some sozinho.
function toastFaixa(texto) {
  const el = document.createElement("div");
  el.className = "recado-flutuante";
  el.setAttribute("role", "status");
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function ligarPush() {
  renovarPush();
  document.querySelectorAll("[data-faixa]").forEach((botao) => botao.addEventListener("click", () => acaoFaixa(botao.dataset.faixa)));
  document.querySelectorAll("[data-instalar]").forEach((botao) => botao.addEventListener("click", async () => {
    await instalarApp();
    render();
  }));
  document.querySelectorAll("[data-push]").forEach((botao) => botao.addEventListener("click", async () => {
    const acao = botao.dataset.push;
    pushEstado.ocupado = true;
    pushEstado.aviso = { msg: acao === "teste" ? "Mandando..." : "Um instante...", tipo: "" };
    render();
    try {
      if (acao === "ligar") {
        await ligarNotificacoes();
        pushEstado.aviso = { msg: "Pronto. Este aparelho vai avisar a cada mensagem nova e a cada lead seu.", tipo: "ok" };
      } else if (acao === "desligar") {
        await desligarNotificacoes();
        pushEstado.aviso = { msg: "Notificação desligada neste aparelho.", tipo: "" };
      } else {
        const r = await testarNotificacao();
        pushEstado.aviso = r.enviados
          ? { msg: "Mandei. Se não aparecer em alguns segundos, confira as permissões do aparelho.", tipo: "ok" }
          : { msg: "Nenhum aparelho recebeu: " + (r.erros || []).join(" | "), tipo: "erro" };
      }
    } catch (err) {
      pushEstado.aviso = { msg: err.message, tipo: "erro" };
    }
    pushEstado.ocupado = false;
    render();
  }));
}

// Conversa aberta e lida: a notificação dela sai da bandeja, como no WhatsApp.
async function fecharNotificacoesDoLead(leadId) {
  if (!leadId || !pushRegistro?.getNotifications) return;
  try {
    for (const n of await pushRegistro.getNotifications({ tag: "msg-" + leadId })) n.close();
  } catch {}
}

/* Tocar na notificação abre a conversa do lead, mesmo que ele seja de outra empresa. */
let leadDaUrlTratado = false;
const ehUuid = (texto) => /^[0-9a-f-]{36}$/i.test(texto || "");

async function abrirLeadDaUrl(url) {
  const alvo = new URL(url || location.href);
  const id = alvo.searchParams.get("lead");
  const conversaPedida = alvo.searchParams.get("conversa");
  if (!ehUuid(id)) return;
  history.replaceState(null, "", location.pathname);
  if (!empresaAtual) return;

  if (!leads.some((l) => l.id === id)) {
    const { data } = await sb.from("leads").select("id, empresa_id").eq("id", id).maybeSingle();
    if (!data) return;
    if (data.empresa_id !== empresaAtual.id && empresas.some((e) => e.id === data.empresa_id)) {
      await trocarEmpresa(data.empresa_id);
    }
    if (!leads.some((l) => l.id === id)) return;
  }

  let conversa = ehUuid(conversaPedida) ? conversaPedida : conversas.find((c) => c.lead_id === id)?.id;
  if (conversa && !conversas.some((c) => c.id === conversa)) {
    // mensagem que acabou de chegar está no topo da lista sem filtro
    Object.assign(filtroConv, { busca: "", estado: "todas", responsavel: "", canal: "", etapa: "" });
    await buscarListaConversas();
  }
  if (conversa && conversas.some((c) => c.id === conversa)) {
    vistaAtual = "conversas";
    mostrarContexto = false;
    abrirConversa(conversa);
    return;
  }
  abrirLead(id, "conversa");
}

function ligarLeadDaUrl() {
  if (leadDaUrlTratado || !empresaAtual) return;
  leadDaUrlTratado = true;
  abrirLeadDaUrl(location.href);
}

// Registra assim que a página carrega, mesmo antes do login: a tela de Ajustes
// precisa saber o estado, e assinar exige o service worker já ativo.
if ("serviceWorker" in navigator) prepararPush();
else pushEstado.suporte = false;

navigator.serviceWorker?.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "abrir-lead") abrirLeadDaUrl(evento.data.url);
  // o service worker pergunta antes de avisar: quem está com a conversa na tela não precisa do aviso
  if (evento.data?.tipo === "conversa-aberta?") {
    const aberta = conversas.find((c) => c.id === conversaAberta);
    const naTela = !!usuario && vistaAtual === "conversas" && !document.hidden && document.hasFocus() &&
      !!aberta && aberta.lead_id === evento.data.lead;
    evento.ports?.[0]?.postMessage(naTela);
  }
});
