const alvoPrevia = document.getElementById('alvo');
if (alvoPrevia?.dataset.previewConfig && window.TNACRMForm) {
  window.TNACRMForm.render(alvoPrevia, JSON.parse(alvoPrevia.dataset.previewConfig), { preview:true });
}
