// Duplicar uma ou várias tarefas em várias listas de uma vez, e copiar os links.
// A janela mostra as listas agrupadas por espaço, com caixa para marcar o espaço inteiro.
// Carrega antes do app.js; só é chamada depois que S existe.

function rotuloListaNoEspaco(l) {
  return l.pasta_id ? [...caminhoPasta(l.pasta_id), l.nome].join(" › ") : l.nome;
}

// Resolve com { listas: [ids], ...extras } ou null.
function escolherListas({ titulo, botao, extra = "" }) {
  const espacos = S.projetos
    .map((p) => ({ p, listas: S.listas.filter((l) => l.projeto_id === p.id)
      .sort((a, b) => rotuloListaNoEspaco(a).localeCompare(rotuloListaNoEspaco(b), "pt-BR", { numeric: true })) }))
    .filter((e) => e.listas.length);
  if (!espacos.length) { toast("Não existe nenhuma lista para escolher.", true); return Promise.resolve(null); }
  return abrirModal(`
    <form id="form-listas" class="form-listas">
      <h2>${esc(titulo)}</h2>
      <input type="search" id="busca-listas" placeholder="Buscar pasta ou lista" aria-label="Buscar pasta ou lista" autocomplete="off">
      <div class="grupos-listas">
        ${espacos.map(({ p, listas }) => `<fieldset class="espaco-listas" data-espaco="${p.id}">
          <legend><label class="caixa-check"><input type="checkbox" data-marca-espaco="${p.id}"> <b>${esc(p.nome)}</b></label>
            <span class="n-espaco" data-n="${p.id}">0/${listas.length}</span></legend>
          ${listas.map((l) => `<label class="caixa-check lista-op" data-busca="${esc(norm(p.nome + " " + rotuloListaNoEspaco(l)))}">
            <input type="checkbox" data-lista="${l.id}" data-de="${p.id}"> ${esc(rotuloListaNoEspaco(l))}</label>`).join("")}
        </fieldset>`).join("")}
      </div>
      ${extra}
      <div class="acoes"><button type="button" class="btn btn-fantasma" onclick="fecharModal(null)">Cancelar</button>
        <button class="btn" id="btn-listas" disabled>${esc(botao)}</button></div>
    </form>`, (m) => {
    m.classList.add("modal-largo");
    const caixas = [...m.querySelectorAll("[data-lista]")];
    const atualizar = () => {
      for (const { p } of espacos) {
        const doEspaco = caixas.filter((c) => c.dataset.de === p.id);
        const n = doEspaco.filter((c) => c.checked).length;
        const geral = m.querySelector(`[data-marca-espaco="${p.id}"]`);
        geral.checked = n === doEspaco.length;
        geral.indeterminate = n > 0 && n < doEspaco.length;
        m.querySelector(`[data-n="${p.id}"]`).textContent = `${n}/${doEspaco.length}`;
      }
      const total = caixas.filter((c) => c.checked).length;
      const btn = m.querySelector("#btn-listas");
      btn.disabled = !total;
      btn.textContent = total ? `${botao} em ${total} ${total === 1 ? "lista" : "listas"}` : botao;
    };
    caixas.forEach((c) => c.addEventListener("change", atualizar));
    m.querySelectorAll("[data-marca-espaco]").forEach((g) => g.addEventListener("change", () => {
      // Marca/desmarca só as listas que aparecem na busca atual.
      caixas.filter((c) => c.dataset.de === g.dataset.marcaEspaco && !c.closest("label").hidden).forEach((c) => { c.checked = g.checked; });
      atualizar();
    }));
    m.querySelector("#busca-listas").addEventListener("input", (e) => {
      const q = norm(e.target.value);
      m.querySelectorAll(".lista-op").forEach((l) => { l.hidden = !!q && !l.dataset.busca.includes(q); });
      m.querySelectorAll(".espaco-listas").forEach((f) => { f.hidden = ![...f.querySelectorAll(".lista-op")].some((l) => !l.hidden); });
    });
    m.querySelector("#form-listas").addEventListener("submit", (e) => {
      e.preventDefault();
      const listas = caixas.filter((c) => c.checked).map((c) => c.dataset.lista);
      if (!listas.length) return;
      const extras = Object.fromEntries([...m.querySelectorAll("[data-extra]")].map((el) => [el.dataset.extra, el.type === "checkbox" ? el.checked : el.value]));
      fecharModal({ listas, ...extras });
    });
    m.querySelector("#busca-listas").focus();
  }).finally(() => document.getElementById("modal")?.classList.remove("modal-largo"));
}

function copiaDaTarefa(x, extra) {
  return {
    titulo: x.titulo, descricao: x.descricao, status_id: x.status_id, prioridade: x.prioridade,
    data_inicio: x.data_inicio, data_entrega: x.data_entrega, recorrencia: x.recorrencia,
    recorrencia_intervalo: x.recorrencia_intervalo, recorrencia_dias_semana: x.recorrencia_dias_semana,
    recorrencia_mensal: x.recorrencia_mensal, recorrencia_dia_mes: x.recorrencia_dia_mes,
    recorrencia_ordem: x.recorrencia_ordem, recorrencia_dia_semana: x.recorrencia_dia_semana, ...extra,
  };
}

let duplicando = false;
async function duplicarTarefas(ids) {
  if (duplicando) return;
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  if (!tarefas.length) return;
  const escolhidas = new Set(ids);
  // Subtarefa marcada junto com a mãe vai dentro da mãe; marcada sozinha vira tarefa própria no destino.
  const topo = tarefas.filter((t) => !t.tarefa_pai_id || !escolhidas.has(t.tarefa_pai_id));
  const subsDe = (t) => S.tarefas.filter((s) => s.tarefa_pai_id === t.id);
  const nSubs = topo.reduce((n, t) => n + subsDe(t).length, 0);
  const uma = topo.length === 1;
  const r = await escolherListas({
    titulo: uma ? `Duplicar "${topo[0].titulo}"` : `Duplicar ${topo.length} tarefas`,
    botao: "Duplicar",
    extra: `${uma ? `<div class="campo"><label for="dup-nome">Nome da cópia</label><input type="text" id="dup-nome" data-extra="nome" maxlength="300" value="${esc(topo[0].titulo)}"></div>` : ""}
      ${nSubs ? `<label class="caixa-check"><input type="checkbox" data-extra="subs" checked> Incluir ${nSubs} ${nSubs === 1 ? "subtarefa" : "subtarefas"}</label>` : ""}
      <label class="caixa-check" style="margin-top:6px"><input type="checkbox" data-extra="resp" checked> Manter responsáveis</label>`,
  });
  if (!r) return;
  const comSubs = !!r.subs, comResp = r.resp !== false, nome = uma ? (r.nome || "").trim() || topo[0].titulo : null;
  duplicando = true;
  toast(`Duplicando em ${r.listas.length} ${r.listas.length === 1 ? "lista" : "listas"}…`);
  let copias = 0, falhas = 0, motivo = "";
  const criadas = [];
  const avisos = new Set();
  const copiarResp = async (pares) => {
    const linhas = comResp ? pares.flatMap(([de, para]) => de.responsaveis.map((user_id) => ({ tarefa_id: para, user_id }))) : [];
    if (!linhas.length) return;
    const { error } = await db().from("tarefa_responsaveis").insert(linhas);
    if (error) avisos.add("responsáveis");
  };
  // O finally é obrigatório: sem ele, um erro no meio deixaria a trava ligada e os próximos cliques não fariam nada.
  try {
    for (const lista of r.listas) {
      const linhas = topo.map((t) => copiaDaTarefa(t, { lista_id: lista, tarefa_pai_id: null, ...(nome ? { titulo: nome } : {}) }));
      const { data: novas, error } = await db().from("tarefas").insert(linhas).select("id");
      if (error || !novas || novas.length !== topo.length) {
        falhas++;
        motivo = motivo || (error ? (error.message || error.code || "o banco recusou") : `o banco devolveu ${novas ? novas.length : 0} de ${topo.length} cópias`);
        console.error("duplicar: falhou em", caminhoLista(lista).join(" › "), error);
        continue;
      }
      copias += novas.length;
      criadas.push(...novas.map((x) => x.id));
      await copiarResp(topo.map((t, i) => [t, novas[i].id]));
      if (!comSubs) continue;
      for (let i = 0; i < topo.length; i++) {
        const subs = subsDe(topo[i]);
        if (!subs.length) continue;
        const { data: ns, error: e } = await db().from("tarefas")
          .insert(subs.map((s) => copiaDaTarefa(s, { lista_id: lista, tarefa_pai_id: novas[i].id }))).select("id");
        if (e || !ns) { avisos.add("subtarefas"); console.error("duplicar: subtarefas", e); continue; }
        await copiarResp(subs.map((s, j) => [s, ns[j].id]));
      }
    }
  } catch (e) {
    falhas = r.listas.length - Math.min(falhas, r.listas.length);
    motivo = motivo || String(e?.message || e);
    console.error("duplicar:", e);
  } finally {
    duplicando = false;
  }
  await recarregarERender();
  // Confere no banco que as cópias existem mesmo: insert aceito e linha invisível depois seria pior que erro.
  if (criadas.length) {
    const { data: conferidas, error: eConf } = await db().from("tarefas_visao").select("id").in("id", criadas);
    if (!eConf && conferidas && conferidas.length !== criadas.length) {
      console.error("duplicar: o banco aceitou mas não devolveu", { pedidas: criadas.length, achadas: conferidas.length });
      return toast(`O banco aceitou ${criadas.length} ${criadas.length === 1 ? "cópia" : "cópias"}, mas devolveu ${conferidas.length}. Avise o Claude.`, true);
    }
  }
  const ok = r.listas.length - falhas;
  // Com um destino só, o aviso diz o caminho, para dar pra conferir onde a cópia caiu.
  const onde = ok === 1 && r.listas.length === 1 ? caminhoLista(r.listas[0]).join(" › ") : `${ok} ${ok === 1 ? "lista" : "listas"}`;
  const base = `${copias} ${copias === 1 ? "cópia criada" : "cópias criadas"} em ${onde}`;
  const problemas = [falhas ? `${falhas} ${falhas === 1 ? "lista falhou" : "listas falharam"}${motivo ? ` (${motivo})` : ""}` : "",
    avisos.size ? `sem copiar ${[...avisos].join(" e ")}` : ""].filter(Boolean);
  if (!copias && falhas) return toast(`Não deu pra duplicar${motivo ? ": " + motivo : "."}`, true);
  // Com um destino só, o aviso leva direto para lá, para dar pra conferir a cópia na hora.
  const ir = ok === 1 && r.listas.length === 1 ? { rotulo: "Abrir lista", fn: () => irPara(`#/lista/${r.listas[0]}`) } : null;
  toast(problemas.length ? `${base}, mas ${problemas.join("; ")}.` : `${base}.`, problemas.length > 0, ir);
}

async function copiarLinksTarefas(ids) {
  const tarefas = S.tarefas.filter((t) => ids.includes(t.id));
  const texto = tarefas.map((t) => `${t.titulo}: ${location.origin}/#/lista/${t.lista_id}?t=${t.id}`).join("\n");
  try {
    await navigator.clipboard.writeText(texto);
    toast(tarefas.length === 1 ? "Link copiado." : `${tarefas.length} links copiados, um por linha.`);
  } catch {
    toast("Não deu pra copiar automaticamente.", true);
  }
}
