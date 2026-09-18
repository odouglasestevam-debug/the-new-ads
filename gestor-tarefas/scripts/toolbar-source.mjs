// Remove implementações antigas para usar o módulo compartilhado filtros.js.
export function aplicarToolbar(source) {
  for(const [inicio,fim] of [
    ['function filtrar(', 'function filtroDaRota('],
    ['function renderVisao(', 'function vazioSemLista('],
    ['function contarFiltros(', 'function abrirPainel(']
  ]) {
    const a=source.indexOf(inicio),b=source.indexOf(fim,a);
    if(a<0 || b<a)throw new Error('Fonte incompatível: '+inicio);
    source=source.slice(0,a)+source.slice(b);
  }
  return source.replace('grupo: chave, titulo: "", data_entrega: null, responsaveis: [], prioridade: "normal",',
    'grupo: chave, titulo: "", data_entrega: null, responsaveis: modoEuAtivo() ? [S.user.id] : [], prioridade: "normal",');
}
