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
  abrirMenu(ancora, [
    ...[...S.status].sort((a, b) => a.ordem - b.ordem).map((s) => ({
      t: s.nome, cor: s.cor, atual: s.id === t.status_id,
      acao: () => { if (s.id !== t.status_id) salvarTarefa(id, { status_id: s.id }, { silencioso: true }); },
    })),
    ...itemNovoStatus(id),
  ]);
}

// Status vale para todas as listas e o banco só deixa admin criar, então membro não vê a opção.
function itemNovoStatus(id) {
  return S.eu?.admin ? ["-", { t: "+ Novo status", classe: "acao-menu", acao: () => novoStatusDaTarefa(id) }] : [];
}

async function novoStatusDaTarefa(id) {
  const r = await pedirNovoStatus();
  if (!r) return;
  const novo = await criarStatus(r);
  if (!novo) return recarregarERender();
  toast(`Status “${novo.nome}” criado.`);
  // Quem abriu o seletor queria trocar o status desta tarefa: o novo já vai para ela.
  if (id && S.tarefas.some((t) => t.id === id)) salvarTarefa(id, { status_id: novo.id }, { silencioso: true });
  else recarregarERender();
}

function pedirNovoStatus() {
  const sugerida = corLivreStatus();
  return abrirModal(`
    <form id="form-modal" class="form-novo-status">
      <h2>Novo status</h2>
      <div class="campo" style="margin-top:14px"><label for="status-nome">Nome do status</label>
        <input type="text" id="status-nome" required maxlength="40" autocomplete="off" placeholder="Ex.: Aguardando cliente"></div>
      <div class="campo"><span class="legenda-cor" id="legenda-cor">Cor</span>
        <div class="paleta-status" role="radiogroup" aria-labelledby="legenda-cor">
          ${CORES_STATUS.map((c) => `<label class="amostra-cor" style="--c:${c}" title="${c}"><input type="radio" name="cor-status" value="${c}"${c === sugerida ? " checked" : ""} aria-label="Cor ${c}"><span></span></label>`).join("")}
          <label class="amostra-cor outra" title="Outra cor"><input type="color" id="cor-livre" value="${sugerida}" aria-label="Escolher outra cor"><span></span></label>
        </div></div>
      <div class="previa-status" aria-hidden="true"><span class="status-pill" style="--st:${sugerida}"><span class="bolinha"></span><span class="nome">Prévia</span></span></div>
      <p class="aviso erro" id="aviso-status" role="alert"></p>
      <div class="acoes"><button type="button" class="btn btn-fantasma" onclick="fecharModal(null)">Cancelar</button>
        <button class="btn" id="btn-criar-status">Criar</button></div>
    </form>`, (m) => {
    const nome = m.querySelector("#status-nome"), livre = m.querySelector("#cor-livre"), aviso = m.querySelector("#aviso-status");
    const pill = m.querySelector(".previa-status .status-pill"), botao = m.querySelector("#btn-criar-status");
    let cor = sugerida;
    const atualizar = () => {
      pill.style.setProperty("--st", cor);
      pill.querySelector(".nome").textContent = nome.value.trim() || "Prévia";
      const repetido = nomeStatusEmUso(nome.value);
      aviso.textContent = repetido ? `Já existe o status “${repetido.nome}”.` : "";
      botao.disabled = !!repetido;
      m.querySelector(".amostra-cor.outra").classList.toggle("escolhida", !CORES_STATUS.includes(cor));
    };
    m.querySelectorAll('input[name="cor-status"]').forEach((el) => el.addEventListener("change", () => { cor = el.value; atualizar(); }));
    livre.addEventListener("input", () => {
      cor = livre.value.toUpperCase();
      m.querySelectorAll('input[name="cor-status"]').forEach((el) => { el.checked = el.value === cor; });
      atualizar();
    });
    nome.addEventListener("input", atualizar);
    atualizar();
    nome.focus();
    m.querySelector("#form-modal").addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = nome.value.trim();
      if (texto && !nomeStatusEmUso(texto)) fecharModal({ nome: texto, cor });
    });
  });
}

// O quadradinho colorido abre os status, com concluir/reabrir em cima para seguir num clique só.
function menuStatusDoQuadrado(ancora, id) {
  const t = S.tarefas.find((x) => x.id === id);
  if (!t) return;
  const feita = t.situacao === "concluida";
  const atalho = primeiroStatus(feita ? "aberto" : "concluido");
  abrirMenu(ancora, [
    ...(atalho && atalho.id !== t.status_id ? [{ t: feita ? "Reabrir" : "Concluir", cor: atalho.cor, acao: () => alternarConclusao(id) }, "-"] : []),
    ...[...S.status].sort((a, b) => a.ordem - b.ordem).map((s) => ({
      t: s.nome, cor: s.cor, atual: s.id === t.status_id,
      acao: () => { if (s.id !== t.status_id) salvarTarefa(id, { status_id: s.id }, { silencioso: true }); },
    })),
    ...itemNovoStatus(id),
  ]);
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
    { t: "Duplicar para…", acao: () => duplicarTarefa(id) },
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

// Mesma janela do lote: escolhe uma ou várias listas, agrupadas por espaço (duplicar.js).
function duplicarTarefa(id) {
  return duplicarTarefas([id]);
}
