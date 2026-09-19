// Ações rápidas da tarefa sem abrir a gaveta (menu ⋯) e seletor de status com cor.

/* ---------------- status com cor ---------------- */
function botaoStatus(t, grande) {
  return `<button type="button" class="status-pill${grande ? " grande" : ""}" data-menu style="--st:${esc(t.status_cor)}"
    onclick="event.stopPropagation();menuStatus(this,'${t.id}')" aria-label="Status: ${esc(t.status_nome)}. Trocar status">
    <span class="bolinha"></span><span class="nome">${esc(t.status_nome)}</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button>`;
}

function menuStatus(ancora, id) {
  const t = S.tarefas.find((x) => x.id === id);
  abrirMenu(ancora, [...S.status].sort((a, b) => a.ordem - b.ordem).map((s) => ({
    t: s.nome, cor: s.cor, atual: s.id === t.status_id,
    acao: () => { if (s.id !== t.status_id) salvarTarefa(id, { status_id: s.id }, { silencioso: true }); },
  })));
}

/* ---------------- menu ⋯ da tarefa ---------------- */
function botaoMaisTarefa(t) {
  return `<button type="button" class="icone-btn mini mais-tarefa" data-menu onclick="event.stopPropagation();menuTarefa(this,'${t.id}')"
    aria-label="Mais ações de ${esc(t.titulo)}" title="Mais ações">${ICONES.mais}</button>`;
}

function menuTarefa(ancora, id) {
  const t = S.tarefas.find((x) => x.id === id);
  if (!t) return;
  const sub = !!t.tarefa_pai_id;
  abrirMenu(ancora, [
    { t: "Abrir", acao: () => abrirTarefa(id) },
    ...(sub ? [] : [{ t: "Mover para…", acao: () => moverTarefaPara(id) }]),
    { t: sub ? "Duplicar" : "Duplicar para…", acao: () => duplicarTarefa(id) },
    { t: "Copiar link", acao: () => copiarLinkTarefa(id) },
    "-",
    { t: "Excluir", perigo: true, acao: () => excluirTarefa(id) },
  ]);
}

async function copiarLinkTarefa(id) {
  const t = S.tarefas.find((x) => x.id === id);
  const link = `${location.origin}/#/lista/${t.lista_id}?t=${t.id}`;
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copiado.");
  } catch {
    toast("Não deu pra copiar automaticamente: " + link, true);
  }
}

/* ---------------- escolher espaço/pasta e lista ---------------- */
// Locais que têm listas: raiz de cada espaço e cada pasta (com o caminho completo).
function locaisComListas() {
  const locais = [];
  for (const p of S.projetos) {
    if (listasEm(p.id, null).length) locais.push({ v: `projeto:${p.id}`, t: `${p.nome}`, listas: listasEm(p.id, null) });
    for (const pa of S.pastas.filter((x) => x.projeto_id === p.id)) {
      const listas = listasEm(p.id, pa.id);
      if (listas.length) locais.push({ v: `pasta:${pa.id}`, t: [p.nome, ...caminhoPasta(pa.id)].join(" › "), listas });
    }
  }
  return locais.sort((a, b) => a.t.localeCompare(b.t, "pt-BR", { numeric: true }));
}

function escolherDestino({ titulo, botao, listaAtual, extra = "" }) {
  const locais = locaisComListas();
  if (!locais.length) { toast("Não existe nenhuma lista para escolher.", true); return Promise.resolve(null); }
  const atual = locais.find((l) => l.listas.some((x) => x.id === listaAtual)) || locais[0];
  const opcoesLista = (local, sel) => local.listas.map((l) => `<option value="${l.id}"${l.id === sel ? " selected" : ""}>${esc(l.nome)}</option>`).join("");
  return abrirModal(`
    <form id="form-destino">
      <h2>${esc(titulo)}</h2>
      <div class="campo" style="margin-top:14px"><label for="destino-local">Espaço / pasta</label>
        <select id="destino-local">${locais.map((l) => `<option value="${l.v}"${l === atual ? " selected" : ""}>${esc(l.t)}</option>`).join("")}</select></div>
      <div class="campo"><label for="destino-lista">Lista</label>
        <select id="destino-lista">${opcoesLista(atual, listaAtual)}</select></div>
      ${extra}
      <div class="acoes"><button type="button" class="btn btn-fantasma" onclick="fecharModal(null)">Cancelar</button>
        <button class="btn">${esc(botao)}</button></div>
    </form>`, (m) => {
    m.querySelector("#destino-local").addEventListener("change", (e) => {
      const local = locais.find((l) => l.v === e.target.value);
      m.querySelector("#destino-lista").innerHTML = opcoesLista(local, null);
    });
    m.querySelector("#form-destino").addEventListener("submit", (e) => {
      e.preventDefault();
      const extras = Object.fromEntries([...m.querySelectorAll("[data-extra]")].map((el) => [el.dataset.extra, el.type === "checkbox" ? el.checked : el.value]));
      fecharModal({ lista: m.querySelector("#destino-lista").value, ...extras });
    });
  });
}

async function moverTarefaPara(id) {
  const t = S.tarefas.find((x) => x.id === id);
  const r = await escolherDestino({ titulo: `Mover "${t.titulo}"`, botao: "Mover", listaAtual: t.lista_id });
  if (!r || r.lista === t.lista_id) return;
  const { error } = await db().from("tarefas").update({ lista_id: r.lista }).eq("id", id);
  if (error) return toast(erroBanco(error, "Não deu pra mover"), true);
  await recarregarERender();
  toast(`Movida para ${caminhoLista(r.lista).join(" › ")}.`);
}

async function duplicarTarefa(id) {
  const t = S.tarefas.find((x) => x.id === id);
  const subs = S.tarefas.filter((s) => s.tarefa_pai_id === id);
  let destino = t.lista_id, comSubs = false, comResp = true, nome = t.titulo;
  if (!t.tarefa_pai_id) {
    const r = await escolherDestino({
      titulo: `Duplicar "${t.titulo}"`, botao: "Duplicar", listaAtual: t.lista_id,
      extra: `<div class="campo"><label for="dup-nome">Nome da cópia</label><input type="text" id="dup-nome" data-extra="nome" maxlength="300" value="${esc(t.titulo)}"></div>
        ${subs.length ? `<label class="caixa-check"><input type="checkbox" data-extra="subs" checked> Incluir ${subs.length} ${subs.length === 1 ? "subtarefa" : "subtarefas"}</label>` : ""}
        <label class="caixa-check" style="margin-top:6px"><input type="checkbox" data-extra="resp" checked> Manter responsáveis</label>`,
    });
    if (!r) return;
    destino = r.lista; comSubs = !!r.subs; comResp = r.resp !== false; nome = (r.nome || "").trim() || t.titulo;
  }
  const copia = (x, extra) => ({
    lista_id: destino, titulo: x.titulo, descricao: x.descricao, status_id: x.status_id, prioridade: x.prioridade,
    data_inicio: x.data_inicio, data_entrega: x.data_entrega, recorrencia: x.recorrencia,
    recorrencia_intervalo: x.recorrencia_intervalo, recorrencia_dias_semana: x.recorrencia_dias_semana,
    recorrencia_mensal: x.recorrencia_mensal, recorrencia_dia_mes: x.recorrencia_dia_mes,
    recorrencia_ordem: x.recorrencia_ordem, recorrencia_dia_semana: x.recorrencia_dia_semana, ...extra,
  });
  const { data: nova, error } = await db().from("tarefas").insert(copia(t, { titulo: nome, tarefa_pai_id: t.tarefa_pai_id })).select().single();
  if (error) return toast(erroBanco(error, "Não deu pra duplicar"), true);
  const avisos = [];
  const copiarResp = async (de, para) => {
    if (!comResp || !de.responsaveis.length) return;
    const { error: e } = await db().from("tarefa_responsaveis").insert(de.responsaveis.map((user_id) => ({ tarefa_id: para, user_id })));
    if (e) avisos.push("responsáveis");
  };
  await copiarResp(t, nova.id);
  if (comSubs) {
    for (const s of subs) {
      const { data: ns, error: e } = await db().from("tarefas").insert(copia(s, { tarefa_pai_id: nova.id })).select().single();
      if (e) { avisos.push("subtarefas"); break; }
      await copiarResp(s, ns.id);
    }
  }
  await recarregarERender();
  const onde = destino === t.lista_id ? "na mesma lista" : `em ${caminhoLista(destino).join(" › ")}`;
  toast(avisos.length ? `Duplicada ${onde}, mas sem copiar: ${[...new Set(avisos)].join(" e ")}.` : `Duplicada ${onde}.`, avisos.length > 0);
}
