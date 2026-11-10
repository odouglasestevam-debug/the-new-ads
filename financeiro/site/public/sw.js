// Service worker do Financeiro: recebe o push (pagamento, previsto do mês, atraso, falha) e abre a tela certa.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Navegação vai sempre à rede (nada de versão velha presa no cache). Sem internet,
// cai na última página guardada pra o app instalado abrir com aviso em vez de tela de erro.
const CACHE = "financeiro-shell-v1";
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE).then((c) => c.put("/", copia)).catch(() => {});
        return resposta;
      })
      .catch(() => caches.match("/").then((r) => r || new Response("Sem conexão.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))),
  );
});

self.addEventListener("push", (event) => {
  let dados = { titulo: "Financeiro", corpo: "Novidade no financeiro", url: "/#/mes" };
  try {
    dados = { ...dados, ...event.data.json() };
  } catch (e) {
    if (event.data) dados.corpo = event.data.text();
  }
  // Sem tag: dois pagamentos no mesmo minuto precisam aparecer como dois avisos.
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icons/icone-192.png",
      badge: "/icons/icone-192.png",
      data: { url: dados.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/#/mes", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      const janela = janelas.find((j) => "focus" in j);
      if (!janela) return self.clients.openWindow(destino);
      janela.postMessage({ tipo: "abrir", url: destino });
      return janela.focus();
    }),
  );
});
