// Seleção múltipla e ações em lote, no estilo do ClickUp: cada tarefa tem uma caixa de seleção,
// o cabeçalho do grupo marca tudo de uma vez e uma barra no rodapé aplica a mudança em todas.
// Carrega antes do app.js; só é chamada de dentro dos renders, quando S já existe.

const selecionadas = new Set();
let ancoraSel = null; // última tarefa clicada, para o shift+clique pegar o intervalo

const MARCA_SEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';
const TRACO_SEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M7 12h10"/></svg>';

/* ---------------- estado ---------------- */
// A seleção só vale para tarefas que ainda existem e continuam visíveis no filtro atual.
function idsVisiveis() {
  return (S.grupos || []).flatMap((g) => g.itens.map((t) => t.id));
}
function idsSelecionados() {
  const visiveis = new Set(idsVisiveis());
  return [...selecionadas].filter((id) => visiveis.has(id));
}
function limparSelecao(render = true) {
  if (!selecionadas.size) return;
  selecionadas.clear();
  ancoraSel = null;
  if (render) renderResultadoAtual();
  renderBarraLote();
}

function alternarSel(id, evento) {
  const ordem = idsVisiveis();
  if (evento?.shiftKey && ancoraSel && ancoraSel !== id) {
    const a = ordem.indexOf(ancoraSel), b = ordem.indexOf(id);
    if (a >= 0 && b >= 0) {
      const ligar = !selecionadas.has(id);
      for (const x of ordem.slice(Math.min(a, b), Math.max(a, b) + 1)) ligar ? selecionadas.add(x) : selecionadas.delete(x);
      ancoraSel = id;
      renderResultadoAtual();
      renderBarraLote();
      return;
    }
  }
  selecionadas.has(id) ? selecionadas.delete(id) : selecionadas.add(id);
  ancoraSel = id;
  renderResultadoAtual();
  renderBarraLote();
}

function marcarGrupo(chave) {
  const g = (S.grupos || []).find((x) => String(x.chave) === String(chave));
  if (!g) return;
  const ids = g.itens.map((t) => t.id);
  const todas = ids.length && ids.every((id) => selecionadas.has(id));
  for (const id of ids) todas ? selecionadas.delete(id) : selecionadas.add(id);
  ancoraSel = null;
  renderResultadoAtual();
  renderBarraLote();
}

/* ---------------- caixas ---------------- */
function caixaSel(t) {
  const on = selecionadas.has(t.id);
  return `<button type="button" class="sel-box${on ? " on" : ""}" role="checkbox" aria-checked="${on}"
    aria-label="Selecionar ${esc(t.titulo)}" title="Selecionar (shift para intervalo)"
    onclick="event.stopPropagation();alternarSel('${t.id}',event)">${MARCA_SEL}</button>`;
}

// Caixa geral da barra: pega tudo que está passando pelos filtros, em todos os grupos da tela.
function caixaTodas() {
  return `<button type="button" id="sel-todas" class="sel-box sel-todas" role="checkbox" aria-checked="false"
    aria-label="Marcar todas as tarefas filtradas" title="Marcar todas as tarefas filtradas"
    onclick="marcarTodas()">${MARCA_SEL}</button>`;
}

function marcarTodas() {
  const ids = idsVisiveis();
  if (!ids.length) return;
  const todas = ids.every((id) => selecionadas.has(id));
  if (todas) selecionadas.clear();
  else for (const id of ids) selecionadas.add(id);
  ancoraSel = null;
  renderResultadoAtual();
  renderBarraLote();
}

// O estado vem depois do render da lista, porque a barra é montada antes de os grupos existirem.
function atualizarCaixaTodas() {
  const el = document.getElementById("sel-todas");
  if (!el) return;
  const ids = idsVisiveis();
  const n = ids.filter((id) => selecionadas.has(id)).length;
  el.classList.toggle("on", !!ids.length && n === ids.length);
  el.classList.toggle("parcial", n > 0 && n < ids.length);
  el.setAttribute("aria-checked", !ids.length ? "false" : n === ids.length ? "true" : n ? "mixed" : "false");
  el.disabled = !ids.length;
  el.innerHTML = n && n < ids.length ? TRACO_SEL : MARCA_SEL;
  el.title = !ids.length ? "Nenhuma tarefa para marcar"
    : n === ids.length ? "Desmarcar todas" : `Marcar as ${ids.length} tarefas filtradas`;
}

function caixaGrupo(g) {
  const ids = (g.itens || []).map((t) => t.id);
  if (!ids.length) return "";
  const n = ids.filter((id) => selecionadas.has(id)).length;
  const estado = n === 0 ? "" : n === ids.length ? " on" : " parcial";
  return `<button type="button" class="sel-box${estado}" role="checkbox" aria-checked="${n === ids.length ? "true" : n ? "mixed" : "false"}"
    aria-label="Selecionar todas as tarefas do grupo" title="Marcar todas"
    onclick="event.stopPropagation();marcarGrupo('${String(g.chave).replace(/'/g, "\\'")}')">${n && n < ids.length ? TRACO_SEL : MARCA_SEL}</button>`;
}

/* ---------------- barra de ações ---------------- */
function renderBarraLote() {
  const barra = document.getElementById("barra-lote");
  atualizarCaixaTodas();
  if (!barra) return;
  const n = idsSelecionados().length;
  document.body.classList.toggle("com-lote", n > 0);
  if (!n) { barra.classList.remove("ativa"); barra.innerHTML = ""; return; }
  const btn = (acao, rotulo, icone = "") => `<button type="button" class="lote-btn" data-menu onclick="${acao}(this)">${icone}<span>${rotulo}</span></button>`;
  barra.innerHTML = `
    <span class="lote-n">${n} ${n === 1 ? "tarefa selecionada" : "tarefas selecionadas"}</span>
    <div class="lote-acoes">
      ${btn("menuLoteStatus", "Status")}
      ${btn("menuLoteResp", "Responsável", ICONES.pessoa)}
      ${btn("menuLoteData", "Entrega", ICONES.calendario)}
      ${btn("menuLotePrio", "Prioridade", ICONES.bandeira)}
      <button type="button" class="lote-btn" onclick="loteConcluir()" title="Concluir todas">${ICONES.check}<span>Concluir</span></button>
      ${btn("menuLoteMais", "Mais", ICONES.mais)}
    </div>
    <button type="button" class="lote-x" onclick="limparSelecao()" aria-label="Limpar seleção" title="Limpar seleção">${ICONES.fechar}</button>`;
  barra.classList.add("ativa");
}

/* ---------------- gravação em lote ---------------- */
let loteOcupado = false;
async function aplicarLote(patch, mensagem) {
  const ids = idsSelecionados();
  if (!ids.length || loteOcupado) return;
  loteOcupado = true;
  const { error } = await db().from("tarefas").update(patch).in("id", ids);
  loteOcupado = false;
  if (error) return toast(erroBanco(error, "Não deu pra salvar em lote"), true);
  if (patch.lista_id) await db().from("tarefas").update({ lista_id: patch.lista_id }).in("tarefa_pai_id", ids);
  await recarregarERender();
  toast(`${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}: ${mensagem}`);
}

function menuLoteStatus(ancora) {
  abrirMenu(ancora, [...S.status].sort((a, b) => a.ordem - b.ordem).map((s) => ({
    t: s.nome, cor: s.cor,
    acao: () => aplicarLote({ status_id: s.id }, `status alterado para ${s.nome}.`),
  })));
}

function menuLotePrio(ancora) {
  const cores = { urgente: "#EF4444", alta: "#EAB308", normal: "#3B82F6", baixa: "#9CA3AF" };
  abrirMenu(ancora, PRIORIDADES.map((p) => ({
    t: p.nome, cor: cores[p.id],
    acao: () => aplicarLote({ prioridade: p.id }, `prioridade alterada para ${p.nome}.`),
  })));
}

function menuLoteData(ancora, campo = "data_entrega") {
  const nome = campo === "data_inicio" ? "data de início" : "data de entrega";
  abrirCalendario(ancora, null, (iso) => aplicarLote({ [campo]: iso }, iso ? `${nome} para ${dataBR(iso, true)}.` : `${nome} removida.`),
    campo === "data_entrega" ? loteRecorrencia : null, campo === "data_entrega" ? regraComum() : null);
}

// Quando todas as marcadas repetem igual, o calendário circula os dias dessa regra.
function regraComum() {
  const ids = idsSelecionados();
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  const chave = (t) => JSON.stringify([t.recorrencia, t.recorrencia_intervalo || 1, t.recorrencia_dias_semana || [],
    t.recorrencia_mensal, t.recorrencia_dia_mes, t.recorrencia_ordem, t.recorrencia_dia_semana]);
  if (!tarefas.length || !tarefas[0].recorrencia || tarefas.some((t) => chave(t) !== chave(tarefas[0]))) return null;
  return tarefas[0];
}

// Depois de configurar a repetição, reabre o calendário para escolher o dia de início já com os dias circulados.
function reabrirEntregaLote() {
  const btn = [...document.querySelectorAll("#barra-lote .lote-btn")].find((b) => b.textContent.includes("Entrega"));
  if (btn && idsSelecionados().length) menuLoteData(btn);
}

// Recorrência em lote: semanal pergunta os dias; o banco limpa as regras do tipo anterior.
async function loteRecorrencia(rec) {
  if (!rec) return aplicarLote({ recorrencia: null }, "recorrência removida.");
  if (rec !== "semanal") {
    const nomes = { diaria: "diária", mensal: "mensal", anual: "anual" };
    await aplicarLote({ recorrencia: rec }, `repetição ${nomes[rec]}.`);
    return reabrirEntregaLote();
  }
  const dias = await abrirModal(`
    <form id="form-dias-lote">
      <h2>Repetir toda semana</h2>
      <p style="color:var(--nevoa);font-size:13.5px;margin:6px 0 12px">Escolha os dias. Sem nenhum, repete no mesmo dia da semana da entrega.</p>
      <div class="dias-semana" role="group" aria-label="Dias da semana">
        ${BOTOES_SEMANA.map(([i, l]) => `<button type="button" class="dia-semana" aria-pressed="false" data-dia="${i}" title="${NOMES_SEMANA[i]}">${l}</button>`).join("")}
      </div>
      <div class="acoes"><button type="button" class="btn btn-fantasma" onclick="fecharModal(null)">Cancelar</button>
        <button class="btn">Aplicar</button></div>
    </form>`, (m) => {
    m.querySelectorAll("[data-dia]").forEach((b) => b.addEventListener("click", () => {
      const on = !b.classList.contains("ligado");
      b.classList.toggle("ligado", on);
      b.setAttribute("aria-pressed", on);
    }));
    m.querySelector("#form-dias-lote").addEventListener("submit", (e) => {
      e.preventDefault();
      fecharModal([...m.querySelectorAll("[data-dia].ligado")].map((b) => Number(b.dataset.dia)).sort());
    });
  });
  if (!dias) return;
  const quais = dias.length ? `, ${dias.length === 7 ? "todos os dias" : "na " + listaNatural(BOTOES_SEMANA.filter(([d]) => dias.includes(d)).map(([d]) => DIAS_SEMANA[d]))}` : "";
  await aplicarLote({ recorrencia: "semanal", recorrencia_dias_semana: dias.length ? dias : null }, `repete toda semana${quais}.`);
  reabrirEntregaLote();
}

function menuLoteResp(ancora) {
  const ids = idsSelecionados();
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  const itens = S.usuarios.filter((u) => u.ativo || tarefas.some((t) => t.responsaveis.includes(u.user_id))).map((u) => {
    const quantas = tarefas.filter((t) => t.responsaveis.includes(u.user_id)).length;
    const todas = quantas === tarefas.length;
    return {
      t: u.nome + (quantas && !todas ? ` (em ${quantas})` : ""), cor: corDoNome(u.nome), atual: todas,
      acao: () => loteResponsavel(u, todas),
    };
  });
  if (tarefas.some((t) => t.responsaveis.length)) {
    itens.push("-", { t: "Tirar todos os responsáveis", acao: () => loteLimparResp() });
  }
  abrirMenu(ancora, itens);
}

// Clicar num nome que já está em todas remove; nos outros casos, coloca nas que ainda não têm.
async function loteResponsavel(u, remover) {
  const ids = idsSelecionados();
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  let error;
  if (remover) {
    ({ error } = await db().from("tarefa_responsaveis").delete().in("tarefa_id", ids).eq("user_id", u.user_id));
  } else {
    const faltando = tarefas.filter((t) => !t.responsaveis.includes(u.user_id)).map((t) => ({ tarefa_id: t.id, user_id: u.user_id }));
    if (!faltando.length) return;
    ({ error } = await db().from("tarefa_responsaveis").insert(faltando));
  }
  if (error) return toast(erroBanco(error, "Não deu pra salvar os responsáveis"), true);
  await recarregarERender();
  toast(remover ? `${u.nome} saiu de ${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}.` : `${u.nome} agora responde por ${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}.`);
}

async function loteLimparResp() {
  const ids = idsSelecionados();
  const { error } = await db().from("tarefa_responsaveis").delete().in("tarefa_id", ids);
  if (error) return toast(erroBanco(error, "Não deu pra tirar os responsáveis"), true);
  await recarregarERender();
  toast("Responsáveis removidos.");
}

function loteConcluir() {
  const ids = idsSelecionados();
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  const abertas = tarefas.some((t) => t.situacao !== "concluida");
  const destino = primeiroStatus(abertas ? "concluido" : "aberto");
  if (!destino) return toast("Não existe status do tipo " + (abertas ? "concluído" : "aberto") + ".", true);
  aplicarLote({ status_id: destino.id }, abertas ? "concluídas." : "reabertas.");
}

function menuLoteMais(ancora) {
  abrirMenu(ancora, [
    { t: "Duplicar para…", acao: () => duplicarTarefas(idsSelecionados()) },
    { t: "Mover para…", acao: () => loteMover() },
    { t: "Copiar links", acao: () => copiarLinksTarefas(idsSelecionados()) },
    { t: "Data de início…", acao: () => menuLoteData(ancora, "data_inicio") },
    "-",
    { t: "Excluir", perigo: true, acao: () => loteExcluir() },
  ]);
}

async function loteMover() {
  const ids = idsSelecionados();
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  if (tarefas.some((t) => t.tarefa_pai_id)) return toast("Tire as subtarefas da seleção: elas seguem a tarefa principal.", true);
  const r = await escolherDestino({ titulo: `Mover ${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}`, botao: "Mover", listaAtual: tarefas[0]?.lista_id });
  if (!r) return;
  await aplicarLote({ lista_id: r.lista }, `movidas para ${caminhoLista(r.lista).join(" › ")}.`);
}

async function loteExcluir() {
  const ids = idsSelecionados();
  const subs = S.tarefas.filter((s) => ids.includes(s.tarefa_pai_id) && !ids.includes(s.id)).length;
  const ok = await confirmar({
    titulo: `Excluir ${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}?`,
    texto: `${ids.length} ${ids.length === 1 ? "tarefa" : "tarefas"}${subs ? ` e ${subs} ${subs === 1 ? "subtarefa" : "subtarefas"}` : ""} serão excluídas. Não tem como desfazer.`,
  });
  if (!ok) return;
  const { error } = await db().from("tarefas").delete().in("id", ids);
  if (error) return toast(erroBanco(error, "Não deu pra excluir"), true);
  if (ids.includes(S.aberta)) fecharTarefa();
  selecionadas.clear();
  ancoraSel = null;
  await recarregarERender();
  toast(`${ids.length} ${ids.length === 1 ? "tarefa excluída" : "tarefas excluídas"}.`);
}

/* ---------------- atalhos ---------------- */
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !selecionadas.size) return;
  if (document.getElementById("modal-veu").classList.contains("ativo") || menuAberto() || S.add || S.aberta) return;
  limparSelecao();
});
