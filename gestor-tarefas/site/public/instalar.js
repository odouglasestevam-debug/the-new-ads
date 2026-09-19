// Instalar como app (PWA). O service worker é registrado cedo, já na tela de entrar,
// porque o Chrome só oferece a instalação depois que ele está ativo.
let pedidoInstalacao = null;

function appInstalado() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
function ehIphone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  pedidoInstalacao = e;
  atualizarBotaoInstalar();
});
window.addEventListener("appinstalled", () => {
  pedidoInstalacao = null;
  atualizarBotaoInstalar();
  if (typeof toast === "function") toast("App instalado. Ele já aparece na tela inicial.");
});

async function instalarApp() {
  if (pedidoInstalacao) {
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice.catch(() => null);
    pedidoInstalacao = null;
    atualizarBotaoInstalar();
    return;
  }
  // Sem o convite do navegador (iPhone, ou Chrome que ainda não liberou): mostra o passo a passo.
  if (typeof S !== "undefined") { S.abaAjustes = "conta"; }
  location.hash = "#/ajustes";
  setTimeout(() => document.getElementById("instalar-app")?.scrollIntoView({ block: "center" }), 300);
}

// Botão da barra lateral só aparece quando dá pra instalar e o app ainda não está instalado.
function atualizarBotaoInstalar() {
  const botao = document.getElementById("btn-instalar");
  if (botao) botao.hidden = appInstalado() || !(pedidoInstalacao || ehIphone());
  const painel = document.getElementById("instalar-app");
  if (painel) painel.outerHTML = painelInstalar();
}

function painelInstalar() {
  let corpo;
  if (appInstalado()) {
    corpo = '<p class="desc">Você está usando o app instalado.</p>';
  } else if (pedidoInstalacao) {
    corpo = '<p class="desc">Instala o Tarefas na tela inicial, com ícone próprio e sem a barra do navegador.</p><button class="btn" onclick="instalarApp()">Instalar app</button>';
  } else if (ehIphone()) {
    corpo = `<p class="desc">No iPhone a instalação é pelo Safari:</p>
      <ol class="passos-instalar"><li>Abra tarefas.thenewads.com.br no <b>Safari</b></li>
      <li>Toque no botão <b>Compartilhar</b> (quadrado com seta para cima)</li>
      <li>Escolha <b>Adicionar à Tela de Início</b> e confirme</li></ol>
      <p class="desc">No iPhone, a notificação de prazo só funciona com o app instalado.</p>`;
  } else {
    corpo = `<p class="desc">No Android e no computador, abra o menu do navegador (⋮) e toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>. Se a opção não aparecer, recarregue a página uma vez.</p>`;
  }
  return `<div class="painel" id="instalar-app"><h2>Instalar no celular</h2>${corpo}</div>`;
}

document.addEventListener("DOMContentLoaded", atualizarBotaoInstalar);
