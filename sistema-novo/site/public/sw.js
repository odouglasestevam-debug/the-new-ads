// Service worker do CRM: existe para receber notificação e abrir a ficha certa ao tocar.
// De propósito não guarda arquivo em cache: o CRM muda com frequência e cache velho
// devolveria tela antiga com banco novo, que é pior que carregar da rede.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let dados = {};
  try { dados = evento.data ? evento.data.json() : {}; } catch { dados = {}; }
  const titulo = dados.titulo || "CRM";
  const url = dados.url || "/";
  evento.waitUntil(self.registration.showNotification(titulo, {
    body: dados.corpo || "",
    icon: "/icones/icone-192.png",
    badge: "/icones/icone-192.png",
    data: { url },
    // mesma tag para o mesmo lead: chegar duas vezes não empilha duas notificações
    tag: dados.url || "crm",
    renotify: true,
    requireInteraction: false,
  }));
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "/", self.location.origin);
  evento.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const aba of abas) {
      if (new URL(aba.url).origin !== destino.origin) continue;
      await aba.focus();
      // app já aberto: manda a ficha para a aba em vez de recarregar tudo
      aba.postMessage({ tipo: "abrir-lead", url: destino.href });
      return;
    }
    await self.clients.openWindow(destino.href);
  })());
});
