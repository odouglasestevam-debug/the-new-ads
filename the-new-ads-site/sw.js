const CACHE_NAME = "tna-alertas-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "The New Ads", body: "Nova notificacao", url: "/alertas" };
  try {
    data = event.data.json();
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/alertas" },
    vibrate: [200, 100, 200],
  };

  // Oferta da Black Friday (funcao "ofertas"): vibracao longa, foto do produto,
  // e a de preco-alvo fica na tela ate tocar. No iPhone so o titulo (🛒/🔥)
  // diferencia: o iOS ignora imagem, vibracao e requireInteraction.
  if (data.tipo === "oferta") {
    options.vibrate = data.especial ? [600, 150, 600, 150, 600, 150, 600] : [400, 150, 400];
    options.tag = data.tag || "oferta";
    options.renotify = true;
    options.requireInteraction = !!data.especial;
    if (data.image) options.image = data.image;
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/alertas";
  // Link de fora (oferta): abre direto a loja ou o Pelando.
  if (/^https?:\/\//.test(url) && !url.startsWith(self.location.origin)) {
    event.waitUntil(self.clients.openWindow(url));
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/alertas") && "focus" in client) {
          // Oferta sem link manda pra /alertas#ofertas: troca de aba no app aberto.
          if (url.includes("#") && "navigate" in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
