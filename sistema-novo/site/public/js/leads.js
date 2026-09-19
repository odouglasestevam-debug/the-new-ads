/* ---------------- leads ---------------- */
function leadsFiltrados() {
  const termo = busca.trim().toLowerCase();
  return leads.filter((l) => {
    if (filtroCadastro === "incompleto" && !l.cadastro_incompleto) return false;
    if (!termo) return true;
    const o = ultimaOrigem(l) || {};
    return [l.nome, l.email, l.telefone, o.campanha_nome, o.conjunto_nome, o.anuncio_nome, o.utm_campaign, o.utm_medium, o.utm_content]
      .filter(Boolean).join(" ").toLowerCase().includes(termo);
  });
}

function seletorEtapa(l) {
  if (!pode.editarLead(l)) return `<span class="num">${escapar(NOME_ETAPA[l.etapa] || l.etapa)}</span>`;
  return `<select class="etapa-sel lead-etapa" data-id="${l.id}">
    ${ETAPAS.map((e) => `<option value="${e.id}"${l.etapa === e.id ? " selected" : ""}>${e.nome}</option>`).join("")}
    ${ETAPAS.some((e) => e.id === l.etapa) ? "" : `<option selected>${escapar(l.etapa)}</option>`}
  </select>`;
}

function vistaLeads() {
  const lista = leadsFiltrados();
  const linhas = lista.map((l) => {
    const o = ultimaOrigem(l);
    return `
    <tr class="linha-lead" data-id="${l.id}" style="cursor:pointer">
      <td>
        <div class="cel-contato">
          <div>
            <div class="nome-cel">${escapar(l.nome || "sem nome")}</div>
            <div class="sub-cel">${escapar(telefoneLegivel(l.telefone))}${l.email ? " · " + escapar(l.email) : ""}</div>
          </div>
          ${botaoWhatsApp(l)}
        </div>
      </td>
      <td>${seloCanal(o)}<div class="sub-cel">${escapar(campanhaDaOrigem(o))}</div></td>
      <td>${seloCadastro(l) || '<span class="selo sim">Completo</span>'}</td>
      <td>${pode.distribuir()
        ? `<select class="etapa-sel lead-responsavel" data-id="${l.id}">
             <option value="">sem responsável</option>
             ${equipe.filter((m) => m.papel !== "leitura").map((m) => `<option value="${m.user_id}"${l.responsavel_id === m.user_id ? " selected" : ""}>${escapar(m.email)}</option>`).join("")}
           </select>`
        : `<span class="num">${escapar(nomeResponsavel(l.responsavel_id) || "sem responsável")}</span>`}</td>
      <td>${seletorEtapa(l)}</td>
      <td class="num">${dataCurta(l.criado_em)}</td>
    </tr>`;
  }).join("");

  return `
    <div class="topo">
      <div><h1>Leads</h1><div class="desc">${lista.length} de ${leads.length} lead(s) em ${escapar(empresaAtual.nome)}.</div></div>
      <div class="ferramentas">
        <input type="search" id="busca" placeholder="Buscar nome, telefone, campanha" value="${escapar(busca)}">
        <select id="filtro-cadastro">
          <option value="todos"${filtroCadastro === "todos" ? " selected" : ""}>Todos</option>
          <option value="incompleto"${filtroCadastro === "incompleto" ? " selected" : ""}>Cadastro incompleto</option>
        </select>
        ${botaoNovoLead()}
      </div>
    </div>
    ${lista.length === 0
      ? `<div class="tabela-caixa"><div class="vazio-geral">${leads.length === 0 ? "Nenhum lead ainda." : "Nenhum lead com esse filtro."}</div></div>`
      : `<div class="tabela-caixa"><div class="rolagem"><table>
          <thead><tr><th>Contato</th><th>Origem</th><th>Cadastro</th><th>Responsável</th><th>Etapa</th><th>Entrou</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table></div></div>`}`;
}

