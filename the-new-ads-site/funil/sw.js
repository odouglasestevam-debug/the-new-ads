// Service worker do app do funil. Escopo /funil/, separado do TNA Alertas,
// pra que as inscricoes de push e as notificacoes dos dois apps nao se misturem.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let dados = { title: "The New Ads", body: "Nova movimentacao no funil", url: "/funil/" };
  try {
    dados = event.data.json();
  } catch (e) {
    if (event.data) dados.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(dados.title, {
      body: dados.body,
      icon: "/funil/icons/icone-192.png",
      badge: "/funil/icons/icone-192.png",
      data: { url: dados.url || "/funil/" },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || "/funil/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const janela of janelas) {
        if (janela.url.includes("/funil") && "focus" in janela) return janela.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    }),
  );
});
