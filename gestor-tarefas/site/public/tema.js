// Aplicado antes do CSS para evitar um clarão ao reabrir o tema escuro.
(() => {
  const chave = 'tf_tema';
  const sistema = matchMedia('(prefers-color-scheme: dark)');
  const validar = valor => ['claro', 'escuro', 'sistema'].includes(valor) ? valor : 'claro';
  let preferencia = 'claro';
  try { preferencia = validar(localStorage.getItem(chave)); } catch { /* armazenamento indisponível */ }
  function aplicar() {
    const escuro = preferencia === 'escuro' || (preferencia === 'sistema' && sistema.matches);
    document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#181a20' : '#ffffff');
    document.querySelectorAll('[data-tema]').forEach(el => { el.value = preferencia; });
  }
  aplicar();
  document.addEventListener('DOMContentLoaded', aplicar);
  document.addEventListener('change', event => {
    if (!event.target.matches('[data-tema]')) return;
    preferencia = validar(event.target.value);
    try { localStorage.setItem(chave, preferencia); } catch { /* mantém nesta sessão */ }
    aplicar();
  });
  sistema.addEventListener('change', aplicar);
  window.addEventListener('storage', event => {
    if (event.key === chave || event.key === null) { preferencia = validar(event.newValue); aplicar(); }
  });
})();
