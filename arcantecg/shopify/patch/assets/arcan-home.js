(() => {
  'use strict';
  // Navigation/filter enhancement only. Product forms, search and cart remain Shopify-native.
  document.addEventListener('click', event => {
    const button = event.target.closest('.arcan-home .menu-button');
    if (button) {
      const nav = document.getElementById(button.getAttribute('aria-controls'));
      if (!nav) return;
      const open = nav.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Fechar categorias' : 'Abrir categorias');
    }
    const filter = event.target.closest('[data-arcan-panel]');
    if (filter) {
      const section = filter.closest('.arcan-catalog');
      const panel = document.getElementById(filter.dataset.arcanPanel);
      if (!section || !panel) return;
      event.preventDefault();
      section.querySelectorAll('[data-arcan-products]').forEach(item => {item.hidden = item !== panel;});
      section.querySelectorAll('[data-arcan-panel]').forEach(item => {item.setAttribute('aria-current', String(item === filter));});
      const link = section.querySelector('.section-heading .text-link');
      if (link) link.href = filter.href;
      const count = panel.querySelectorAll('.arcan-product').length;
      section.querySelector('[data-arcan-announcement]').textContent = `${filter.textContent.trim()}: ${count} produtos nesta seleção.`;
    }
    if (!event.target.closest('#arcan-main-nav')) document.querySelectorAll('#arcan-main-nav details[open]').forEach(item => {item.open=false;});
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const nav = document.getElementById('arcan-main-nav');
    if (!nav) return;
    nav.querySelectorAll('details[open]').forEach(item => {item.open=false;});
    if (nav.classList.contains('open')) {
      nav.classList.remove('open');
      const button = document.querySelector('.arcan-home .menu-button');
      button.setAttribute('aria-expanded','false');
      button.setAttribute('aria-label','Abrir categorias');
      button.focus();
    }
  });
})();
