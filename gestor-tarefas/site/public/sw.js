// Service worker do gestor de tarefas: só recebe o push do lembrete de prazo e abre o app no clique.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
  const destino = new URL("/#/minhas", self.location.origin).href;
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
