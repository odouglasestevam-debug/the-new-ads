/* ---------------- kanban ---------------- */
function vistaKanban() {
  const conhecidas = new Set(ETAPAS.map((e) => e.id));
  const colunas = ETAPAS.map((etapa) => {
    const doGrupo = leads.filter((l) => (conhecidas.has(l.etapa) ? l.etapa : "novo") === etapa.id);
    const cartoes = doGrupo.map((l) => {
      const o = ultimaOrigem(l);
      const qtdNotas = notas.filter((n) => n.lead_id === l.id).length;
      const editavel = pode.editarLead(l);
      return `
      <div class="cartao" ${editavel ? 'draggable="true"' : ""} data-id="${l.id}">
        <div class="c-topo">
          <div class="c-ident">
            <div class="n">${escapar(l.nome || "sem nome")}</div>
            <div class="e">${escapar(telefoneLegivel(l.telefone) || l.email || "")}</div>
          </div>
          ${botaoWhatsApp(l)}
        </div>
        ${o ? `<div class="utms">
          <div style="margin-bottom:4px">${seloCanal(o)}</div>
          ${camposOrigem(o).map(([rotulo, valor]) => `<span class="utm" title="${escapar(valor)}"><i>${rotulo}</i>${escapar(valor)}</span>`).join("")}
        </div>` : ""}
        <div class="meta">
          ${seloCadastro(l)}
          ${qtdNotas ? `<span class="sinal">${ICONE_NOTA}${qtdNotas}</span>` : ""}
        </div>
        <div class="c-rodape">
          <span class="data">${dataCurta(l.criado_em)}</span>
          ${seletorEtapa(l)}
        </div>
      </div>`;
    }).join("");

    return `
      <div class="coluna" data-etapa="${etapa.id}">
        <div class="cabeca">
          <span class="ponto" style="background:${etapa.cor}"></span>
          <span class="titulo">${etapa.nome}</span>
          <span class="qtd">${doGrupo.length}</span>
        </div>
        <div class="corpo">${cartoes || '<div class="vazio">vazio</div>'}</div>
      </div>`;
  }).join("");

  return `
    <div class="topo">
      <div><h1>Kanban</h1><div class="desc">${escapar(empresaAtual.nome)}. Arraste o cartão entre colunas ou use o seletor dentro dele.</div></div>
      <div class="ferramentas">${botaoNovoLead()}</div>
    </div>
    <div class="kanban">${colunas}</div>`;
}

