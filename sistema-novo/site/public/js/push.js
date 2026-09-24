/* ---------------- notificação no celular ----------------
   Avisa o atendente quando um lead é atribuído a ele. O aparelho se inscreve aqui,
   o servidor manda pelo serviço do próprio sistema operacional, e tocar na
   notificação abre a ficha do lead. A chave abaixo é pública por definição:
   ela só permite receber, quem assina o envio é a chave privada, que fica no cofre do banco. */
const PUSH_CHAVE_PUBLICA = "BBJmCzhSikD8uQtq6sVd-NEPHH4jfKq0nS7C3LvHC9SIwsXMHZo0MuN_tvJsgOnlI0eY2Rl9cbts3vIUuBTTDgg";

let pushEstado = { suporte: null, permissao: null, inscrito: false, ocupado: false, aviso: "" };
let pushRegistro = null;

const noCelularApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instaladoNaTela = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function base64ParaBytes(base64) {
  const limpo = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(limpo);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

// Registra o service worker e, se a pessoa já autorizou, renova a inscrição.
// Renovar sempre é de propósito: o navegador troca o endereço do aparelho de tempos em tempos.
async function prepararPush() {
  pushEstado.suporte = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!pushEstado.suporte) return;
  pushEstado.permissao = Notification.permission;
  try {
    await navigator.serviceWorker.register("/sw.js");
    // registrar não basta: o service worker precisa estar ativo para aceitar a inscrição
    pushRegistro = await navigator.serviceWorker.ready;
    pushEstado.inscrito = !!(await pushRegistro.pushManager.getSubscription());
  } catch (err) {
    console.error("push:", err);
  }
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

function blocoNotificacoes() {
  const aviso = pushEstado.aviso ? `<div class="aviso ${pushEstado.aviso.tipo || ""}" id="aviso-push">${escapar(pushEstado.aviso.msg)}</div>` : '<div class="aviso" id="aviso-push"></div>';

  // No iPhone o push só existe com o app na tela de início. É regra da Apple, não do CRM.
  if (noCelularApple() && !instaladoNaTela()) {
    return `
      <div class="bloco">
        <h3>Notificação no celular <span class="selo nao" style="margin-left:8px">falta instalar</span></h3>
        <p>No iPhone e no iPad, a notificação só funciona com o CRM instalado na tela de início.</p>
        <div class="par"><span class="r">1</span><span class="v">toque no botão de compartilhar do Safari</span></div>
        <div class="par"><span class="r">2</span><span class="v">escolha "Adicionar à Tela de Início"</span></div>
        <div class="par"><span class="r">3</span><span class="v">abra o CRM por esse ícone e volte aqui para ligar</span></div>
      </div>`;
  }
  if (pushEstado.suporte === false) {
    return `
      <div class="bloco">
        <h3>Notificação no celular <span class="selo nao" style="margin-left:8px">sem suporte</span></h3>
        <p>Este navegador não recebe notificação. Abra o CRM no Chrome, no Edge, no Firefox ou no Safari do iPhone com o app instalado.</p>
      </div>`;
  }
  if (pushEstado.permissao === "denied") {
    return `
      <div class="bloco">
        <h3>Notificação no celular <span class="selo nao" style="margin-left:8px">bloqueada</span></h3>
        <p>A notificação foi bloqueada para este site. Libere nas permissões do navegador (o cadeado ao lado do endereço) e recarregue a página.</p>
      </div>`;
  }

  const ligada = pushEstado.inscrito && pushEstado.permissao === "granted";
  return `
    <div class="bloco">
      <h3>Notificação no celular <span class="selo ${ligada ? "sim" : "nao"}" style="margin-left:8px">${ligada ? "ligada" : "desligada"}</span></h3>
      <p>Quando um lead for atribuído a você, o aviso chega neste aparelho e abre direto na ficha. Vale por aparelho: ligue no celular que você usa para atender.</p>
      ${ligada
        ? `<button class="btn btn-largo" type="button" data-push="teste" ${pushEstado.ocupado ? "disabled" : ""}>Mandar uma notificação de teste</button>
           <button class="btn btn-largo btn-fantasma" type="button" data-push="desligar" ${pushEstado.ocupado ? "disabled" : ""} style="margin-top:8px">Desligar neste aparelho</button>`
        : `<button class="btn btn-largo" type="button" data-push="ligar" ${pushEstado.ocupado ? "disabled" : ""}>Ligar notificação neste aparelho</button>`}
      ${!instaladoNaTela() ? '<p class="ajuda" style="margin-top:8px">No Android funciona pelo navegador, mas instalando o CRM na tela de início a notificação fica mais confiável.</p>' : ""}
      ${aviso}
    </div>`;
}

function ligarPush() {
  renovarPush();
  document.querySelectorAll("[data-push]").forEach((botao) => botao.addEventListener("click", async () => {
    const acao = botao.dataset.push;
    pushEstado.ocupado = true;
    pushEstado.aviso = { msg: acao === "teste" ? "Mandando..." : "Um instante...", tipo: "" };
    render();
    try {
      if (acao === "ligar") {
        await ligarNotificacoes();
        pushEstado.aviso = { msg: "Pronto. Este aparelho vai avisar quando um lead for seu.", tipo: "ok" };
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

/* Tocar na notificação abre a ficha do lead, mesmo que ele seja de outra empresa. */
let leadDaUrlTratado = false;

async function abrirLeadDaUrl(url) {
  const alvo = new URL(url || location.href);
  const id = alvo.searchParams.get("lead");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
  history.replaceState(null, "", location.pathname);
  if (!empresaAtual) return;

  if (leads.some((l) => l.id === id)) { abrirLead(id, "conversa"); return; }
  const { data } = await sb.from("leads").select("id, empresa_id").eq("id", id).maybeSingle();
  if (!data) return;
  if (data.empresa_id !== empresaAtual.id && empresas.some((e) => e.id === data.empresa_id)) {
    await trocarEmpresa(data.empresa_id);
  }
  if (leads.some((l) => l.id === id)) abrirLead(id, "conversa");
}

function ligarLeadDaUrl() {
  if (leadDaUrlTratado || !empresaAtual) return;
  leadDaUrlTratado = true;
  abrirLeadDaUrl(location.href);
}

// Registra assim que a página carrega, mesmo antes do login: a tela de Ajustes
// precisa saber o estado, e assinar exige o service worker já ativo.
if ("serviceWorker" in navigator) prepararPush();

navigator.serviceWorker?.addEventListener("message", (evento) => {
  if (evento.data?.tipo === "abrir-lead") abrirLeadDaUrl(evento.data.url);
});
