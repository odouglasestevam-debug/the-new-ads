// Instalar como app (PWA). O service worker é registrado já na tela de entrar,
// porque o Chrome só oferece a instalação depois que ele está ativo.
let pedidoInstalacao = null;

function appInstalado() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
function ehIphone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pedidoInstalacao = e;
  document.dispatchEvent(new Event("instalacao-mudou"));
});
window.addEventListener("appinstalled", () => {
  pedidoInstalacao = null;
  document.dispatchEvent(new Event("instalacao-mudou"));
});

async function instalarApp() {
  if (!pedidoInstalacao) return false;
  pedidoInstalacao.prompt();
  await pedidoInstalacao.userChoice.catch(() => null);
  pedidoInstalacao = null;
  document.dispatchEvent(new Event("instalacao-mudou"));
  return true;
}

function painelInstalar() {
  let corpo;
  if (appInstalado()) {
    corpo = '<p class="desc">Você está usando o app instalado.</p>';
  } else if (pedidoInstalacao) {
    corpo = '<p class="desc">Instala o Financeiro na tela inicial, com ícone próprio e sem a barra do navegador.</p><button class="btn" data-acao="instalar">Instalar app</button>';
  } else if (ehIphone()) {
    corpo = `<p class="desc">No iPhone a instalação é pelo Safari:</p>
      <ol class="passos"><li>Abra financeiro.thenewads.com.br no <b>Safari</b></li>
      <li>Toque em <b>Compartilhar</b> (quadrado com seta para cima)</li>
      <li>Escolha <b>Adicionar à Tela de Início</b> e confirme</li></ol>
      <p class="desc">No iPhone, a notificação de pagamento só funciona com o app instalado.</p>`;
  } else {
    corpo = '<p class="desc">No Android e no computador, abra o menu do navegador (⋮) e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>. Se não aparecer, recarregue a página uma vez.</p>';
  }
  return `<section class="cartao" id="instalar-app"><h2>Instalar no celular</h2>${corpo}</section>`;
}

window.instalacao = { appInstalado, ehIphone, instalarApp, painelInstalar };
