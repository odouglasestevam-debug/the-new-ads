// Service worker do gestor de tarefas: só recebe o push do lembrete de prazo e abre o app no clique.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Navegação vai sempre à rede (nada de versão velha presa no cache). Só sem internet
// cai na última página guardada, pra o app instalado abrir com um aviso em vez de tela de erro.
const CACHE = "tarefas-shell-v1";
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
  let dados = { titulo: "Tarefas", corpo: "Você tem tarefas para hoje", url: "/" };
  try {
    dados = { ...dados, ...event.data.json() };
  } catch (e) {
    if (event.data) dados.corpo = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.corpo,
      icon: "/icons/icone-192.png",
      badge: "/icons/icone-192.png",
      data: { url: dados.url || "/" },
      tag: "tarefas-lembrete",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL("/#/central", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if ("focus" in janela) {
          janela.navigate?.(destino);
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
