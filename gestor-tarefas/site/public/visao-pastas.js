// Visão "Pasta e lista", no layout do ClickUp: um bloco por lista (com o caminho do espaço/pasta),
// dentro dele um grupo por status, e as tarefas com responsável, datas e prioridade editáveis na própria linha.
// Lido sob demanda: este arquivo carrega antes do app.js, onde fica lerLocal.
let colapsadosCache = null;
function colapsados() { return (colapsadosCache ??= new Set(lerLocal("tf_colapsados", []))); }

function alternarColapso(chave) {
  const c = colapsados();
  c.has(chave) ? c.delete(chave) : c.add(chave);
  gravarLocal("tf_colapsados", [...c]);
  renderResultadoAtual();
}

const SETA_BLOCO = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 9l5 6 5-6z"/></svg>';
function iconeStatus(tipo) {
  return tipo === "concluido"
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="var(--st)"/><path d="m8 12.5 2.8 2.8L16.5 9.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--st)" stroke-width="2.4" stroke-dasharray="3.2 2.6"/></svg>';
}

function renderPorLista(alvo, tarefas, escopo) {
  const porLista = new Map();
  for (const t of tarefas) {
    if (!porLista.has(t.lista_id)) porLista.set(t.lista_id, []);
    porLista.get(t.lista_id).push(t);
  }
  // Na lista aberta, a própria lista aparece mesmo sem tarefas, para dar para lançar.
  if (!tarefas.length && escopo?.size === 1) porLista.set([...escopo][0], []);
  const listas = [...porLista.keys()].sort((a, b) =>
    caminhoLista(a).join(" / ").localeCompare(caminhoLista(b).join(" / "), "pt-BR", { numeric: true }));
  const statusOrdenados = [...S.status].sort((a, b) => a.ordem - b.ordem);
  S.grupos = [];

  const blocos = listas.map((listaId) => {
    const caminho = caminhoLista(listaId);
    const chaveLista = "l:" + listaId;
    const aberto = !colapsados().has(chaveLista);
    const itens = porLista.get(listaId);
    let grupos = statusOrdenados.map((st) => ({ st, itens: itens.filter((t) => t.status_id === st.id) })).filter((g) => g.itens.length);
    if (!grupos.length) grupos = [{ st: statusOrdenados.find((s) => s.tipo === "aberto") || statusOrdenados[0], itens: [] }];
    const html = grupos.map(({ st, itens: doStatus }) => {
      const chave = `${listaId}|${st.id}`;
      const g = { chave, nome: st.nome, preset: { lista_id: listaId, status_id: st.id }, itens: doStatus };
      S.grupos.push(g);
      const grupoAberto = !colapsados().has("s:" + chave);
      return `<div class="cu-grupo">
        <div class="cu-grupo-cab">
          <button class="cu-seta${grupoAberto ? "" : " fechada"}" onclick="alternarColapso('s:${chave}')" aria-label="${grupoAberto ? "Recolher" : "Expandir"} ${esc(st.nome)}">${SETA_BLOCO}</button>
          ${caixaGrupo(g)}
          <span class="cu-selo" style="--st:${esc(st.cor)}">${iconeStatus(st.tipo)}${esc(st.nome)}</span>
          <span class="cu-qtd">${doStatus.length}</span>
        </div>
        ${grupoAberto ? `<div class="cu-tabela" role="list">
          ${doStatus.length ? `<div class="cu-cab"><span>Nome</span><span>Responsável</span><span>Data inicial</span><span>Data de vencimento</span><span>Prioridade</span><span></span></div>` : ""}
          ${doStatus.map((t) => linhaClickup(t)).join("")}
          ${linhaAdicionar(g, escopo)}
        </div>` : ""}
      </div>`;
    }).join("");
    return `<section class="cu-bloco">
      <div class="cu-bloco-cab">
        <button class="cu-seta${aberto ? "" : " fechada"}" onclick="alternarColapso('${chaveLista}')" aria-label="${aberto ? "Recolher" : "Expandir"} lista">${SETA_BLOCO}</button>
        <div class="cu-bloco-nome">
          <div class="cu-caminho">${esc(caminho.slice(0, -1).join(" / "))}</div>
          <div class="cu-lista"><button class="cu-lista-link" onclick="irPara('#/lista/${listaId}')">${esc(caminho.at(-1) || "")}</button>
            ${S.eu.admin ? `<button class="icone-btn mini" data-menu onclick="menuDe('lista','${listaId}',this)" aria-label="Opções da lista">${ICONES.mais}</button>` : ""}
            ${aberto ? "" : `<span class="cu-qtd">${itens.length}</span>`}</div>
        </div>
      </div>
      ${aberto ? html : ""}
    </section>`;
  }).join("");

  alvo.innerHTML = blocos || `<p class="dica-vazia">${S.tarefas.some((t) => !escopo || escopo.has(t.lista_id)) ? "Nenhuma tarefa com esses filtros." : "Nenhuma tarefa ainda."}</p>`;
  const campo = document.getElementById("add-titulo");
  if (campo) { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }
}

function linhaClickup(t) {
  const subs = S.tarefas.filter((s) => s.tarefa_pai_id === t.id);
  const pai = t.tarefa_pai_id ? S.tarefas.find((x) => x.id === t.tarefa_pai_id) : null;
  const caminho = caminhoLista(t.lista_id);
  const icoCal = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3 10h18M12 13v5M9.5 15.5h5"/></svg>';
  const data = (campo, classe = "") => t[campo]
    ? `<span class="cu-data ${classe}">${campo === "data_entrega" && t.recorrencia ? `<span class="cu-rec" title="${esc(descreverRecorrencia(t))}">${ICONES.repetir}</span>` : ""}${dataBR(t[campo], true)}</span>`
    : `<span class="cu-vazio">${icoCal}</span>`;
  return `<div class="cu-linha ${t.situacao}" role="listitem" onclick="abrirTarefa('${t.id}')">
    <div class="cu-nome">
      ${caixaSel(t)}
      <button class="cu-status" style="--st:${esc(t.status_cor)}" data-menu onclick="event.stopPropagation();menuStatus(this,'${t.id}')"
        aria-label="Status: ${esc(t.status_nome)}" title="${esc(t.status_nome)}">${iconeStatus(t.status_tipo)}</button>
      <div class="cu-texto">
        <div class="cu-caminho">${esc(caminho.join(" / "))}</div>
        <div class="cu-titulo-linha">
          ${pai ? `<span class="cu-pai">${ICONES.sub}${esc(pai.titulo)} ›</span>` : ""}
          <button class="cu-titulo tarefa-link" onclick="event.stopPropagation();abrirTarefa('${t.id}')">${esc(t.titulo)}</button>
          ${subs.length ? `<span class="cu-subs" title="Subtarefas concluídas">☰ ${subs.filter((s) => s.situacao === "concluida").length}/${subs.length}</span>` : ""}
          ${t.recorrencia ? `<span class="cu-rec" title="${esc(descreverRecorrencia(t))}">${ICONES.repetir}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="cu-cel" data-menu onclick="event.stopPropagation();menuRespTarefa(this,'${t.id}')" title="Responsável">
      ${t.responsaveis.length ? avatares(t.responsaveis) : `<span class="cu-vazio">${ICONES.pessoa}</span>`}</div>
    <div class="cu-cel" data-menu onclick="event.stopPropagation();calendarioDaTarefa(this,'${t.id}','data_inicio')" title="Data inicial">${data("data_inicio")}</div>
    <div class="cu-cel" data-menu onclick="event.stopPropagation();calendarioDaTarefa(this,'${t.id}','data_entrega')" title="Data de vencimento">
      ${data("data_entrega", t.situacao)}${t.situacao === "atrasada" ? `<span class="cu-atraso">${dias(t.dias_atraso)}</span>` : ""}</div>
    <div class="cu-cel" data-menu onclick="event.stopPropagation();menuPrioTarefa(this,'${t.id}')" title="Prioridade">
      <span class="prio ${t.prioridade}">${ICONES.bandeira}${NOME_PRIO[t.prioridade]}</span></div>
    <div class="cu-cel cu-mais">${botaoMaisTarefa(t)}</div>
  </div>`;
}

function menuRespTarefa(ancora, id) {
  const t = S.tarefas.find((x) => x.id === id);
  abrirMenu(ancora, S.usuarios.filter((u) => u.ativo || t.responsaveis.includes(u.user_id)).map((u) => ({
    t: u.nome, cor: corDoNome(u.nome), atual: t.responsaveis.includes(u.user_id),
    acao: () => alternarResponsavel(id, u.user_id),
  })));
}

function menuPrioTarefa(ancora, id) {
  const t = S.tarefas.find((x) => x.id === id);
  const cores = { urgente: "#EF4444", alta: "#EAB308", normal: "#3B82F6", baixa: "#9CA3AF" };
  abrirMenu(ancora, PRIORIDADES.map((p) => ({
    t: p.nome, cor: cores[p.id], atual: t.prioridade === p.id,
    acao: () => { if (t.prioridade !== p.id) salvarTarefa(id, { prioridade: p.id }, { silencioso: true }); },
  })));
}
