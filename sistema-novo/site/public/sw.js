// Service worker do CRM: recebe a notificação (lead atribuído, cada mensagem nova, lembrete e
// mensagem agendada que não saiu), junta as
// mensagens do mesmo lead numa notificação só, como o WhatsApp, e abre a conversa ao tocar.
// De propósito não guarda arquivo em cache: o CRM muda com frequência e cache velho
// devolveria tela antiga com banco novo, que é pior que carregar da rede.
// Versão 2026-11-24.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

// Sem internet, o app instalado abre um aviso em vez da tela de erro do navegador.
const SEM_CONEXAO = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff">
<title>CRM sem conexão</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f0f2f5;color:#111b21;font:15px/1.5 'Segoe UI',system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box">
<div><p style="font-size:18px;font-weight:600;margin:0 0 6px">Sem conexão com a internet</p>
<p style="color:#54656f;margin:0 0 18px">O CRM abre assim que a conexão voltar.</p>
<a href="/" style="display:inline-block;background:#00a884;color:#fff;text-decoration:none;font-weight:600;padding:10px 22px;border-radius:24px">Tentar de novo</a></div>
</body></html>`;

self.addEventListener("fetch", (evento) => {
  if (evento.request.mode !== "navigate") return;
  evento.respondWith(fetch(evento.request).catch(() =>
    new Response(SEM_CONEXAO, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })));
});

// Safari (iPhone, iPad e Mac) cancela a inscrição de quem recebe push sem mostrar nada.
const SEMPRE_MOSTRAR = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) &&
  !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(self.navigator.userAgent);

function leadDaUrl(url) {
  try { return new URL(url, self.location.origin).searchParams.get("lead") || ""; } catch { return ""; }
}

// Pergunta às janelas em primeiro plano se a conversa desse lead está aberta na tela.
function perguntar(janela, mensagem) {
  return new Promise((pronto) => {
    const canal = new MessageChannel();
    const limite = setTimeout(() => pronto(false), 400);
    canal.port1.onmessage = (e) => { clearTimeout(limite); pronto(e.data === true); };
    janela.postMessage(mensagem, [canal.port2]);
  });
}
async function conversaNaTela(lead) {
  if (!lead || SEMPRE_MOSTRAR) return false;
  const janelas = await self.clients.matchAll({ type: "window" });
  const visiveis = janelas.filter((j) => j.focused && j.visibilityState === "visible");
  const respostas = await Promise.all(visiveis.map((j) => perguntar(j, { tipo: "conversa-aberta?", lead })));
  return respostas.some(Boolean);
}

async function mostrar(dados) {
  const url = dados.url || "/";
  const lead = leadDaUrl(url);
  const tag = dados.tag || url || "crm";
  const ehMensagem = dados.tipo === "mensagem";
  // quem já está lendo a conversa não precisa do aviso dela, como no WhatsApp
  if (ehMensagem && await conversaNaTela(lead)) return;

  let linhas = [dados.corpo || ""];
  let quantidade = Number(dados.quantidade) || 1;
  if (ehMensagem) {
    for (const anterior of await self.registration.getNotifications({ tag })) {
      linhas = [...(anterior.data?.linhas || []), ...linhas];
      quantidade += Number(anterior.data?.quantidade) || 0;
    }
    linhas = linhas.slice(-4);
  }
  const titulo = (dados.titulo || "CRM") + (ehMensagem && quantidade > 1 ? ` · ${quantidade} mensagens` : "");
  await self.registration.showNotification(titulo, {
    body: linhas.join("\n"),
    icon: "/icones/icone-192.png",
    badge: "/icones/badge-96.png",
    tag,
    renotify: true,
    // lembrete fica na tela até a pessoa tocar: no computador, sumir sozinho é perder o retorno
    requireInteraction: dados.tipo === "lembrete",
    vibrate: [180, 80, 180],
    timestamp: Date.now(),
    data: { url, lead, linhas, quantidade },
  });
}

self.addEventListener("push", (evento) => {
  let dados = {};
  try { dados = evento.data ? evento.data.json() : {}; } catch { dados = { corpo: evento.data?.text() || "" }; }
  evento.waitUntil(mostrar(dados));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "/", self.location.origin);
  evento.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const aba of abas) {
      if (new URL(aba.url).origin !== destino.origin) continue;
      await aba.focus();
      // app já aberto: manda a conversa para a aba em vez de recarregar tudo
      aba.postMessage({ tipo: "abrir-lead", url: destino.href });
      return;
    }
    await self.clients.openWindow(destino.href);
  })());
});
