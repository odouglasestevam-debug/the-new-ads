/* ---------------- detalhe do lead ---------------- */
function abrirLead(id, abaInicial) {
  const l = leads.find((x) => x.id === id);
  if (!l) return;
  let abaAtual = abaInicial || "anotacoes";

  const div = document.createElement("div");
  div.className = "fundo-modal";
  document.body.appendChild(div);
  let fechar = () => { div.remove(); document.removeEventListener("keydown", aoTeclar); };
  function aoTeclar(e) { if (e.key === "Escape") fechar(); }
  document.addEventListener("keydown", aoTeclar);
  div.addEventListener("click", (e) => { if (e.target === div) fechar(); });

  const par = (rotulo, valor) =>
    `<div class="par"><span class="r">${rotulo}</span><span class="v${valor ? "" : " vazio"}">${valor ? escapar(valor) : "vazio"}</span></div>`;

  function abaAnotacoes() {
    const doLead = notas.filter((n) => n.lead_id === l.id);
    const historico = doLead.length
      ? doLead.map((n) => `
          <div class="nota">
            <div class="nota-topo">
              <span class="nota-data">${dataHora(n.criado_em)} · ${escapar(nomeResponsavel(n.autor_id) || "")}</span>
              ${n.autor_id === usuario.id || pode.excluir() ? `<button class="nota-apagar" data-nota="${n.id}" type="button" title="Apagar">✕</button>` : ""}
            </div>
            <p>${escapar(n.texto)}</p>
          </div>`).join("")
      : '<div class="vazio-bloco">Nenhuma anotação ainda.</div>';
    const form = pode.editarLead(l) ? `
      <div class="campo"><label for="nova-nota">Nova anotação</label>
        <textarea id="nova-nota" rows="3" placeholder="O que aconteceu nessa conversa?"></textarea></div>
      <button class="btn btn-largo" id="salvar-nota" type="button">Salvar anotação</button>
      <div class="aviso" id="aviso-nota"></div>` : "";
    return form + `<div class="historico">${historico}</div>`;
  }

  function abaOrigem() {
    const lista = origensDoLead(l);
    if (!lista.length) return '<div class="vazio-bloco">Nenhuma origem registrada.</div>';
    return lista.map((o, i) => `
      <div class="origem">
        <div class="origem-topo">
          ${seloCanal(o)}
          <span class="num">${i === 0 ? "entrada · " : i === lista.length - 1 ? "mais recente · " : ""}${dataHora(o.recebido_em)}</span>
        </div>
        ${o.canal === "site" ? `
          ${par("utm_source", o.utm_source)}
          ${par("utm_medium", o.utm_medium)}
          ${par("utm_campaign", o.utm_campaign)}
          ${par("utm_content", o.utm_content)}
          ${par("utm_term", o.utm_term)}
          ${par("utm_placement", o.utm_placement)}
          ${par("ad_id", o.ad_id)}
          ${o.pagina_url ? par("Página", o.pagina_url) : ""}
          ${o.dados?.formulario ? par("Formulário", o.dados.formulario) : ""}
          ${Object.entries(o.dados?.respostas || {}).map(([pergunta, resposta]) =>
            par(escapar(pergunta), Array.isArray(resposta) ? resposta.join(", ") : resposta)).join("")}` : ""}
        ${o.canal === "ctwa" || o.canal === "meta_form" ? `
          ${par("Campanha", o.campanha_nome)}
          ${par("Conjunto", o.conjunto_nome)}
          ${par("Anúncio", o.anuncio_nome)}
          ${par(o.canal === "ctwa" ? "source_id" : "ad_id", o.ad_id)}
          ${o.ctwa_clid ? par("ctwa_clid", o.ctwa_clid) : ""}` : ""}
        ${o.canal === "manual" ? '<div class="sub-cel">Cadastrado manualmente pela equipe.</div>' : ""}
      </div>`).join("");
  }

  function abaDados() {
    return `
      <div class="grupo">
        <h3>Contato</h3>
        ${par("Nome", l.nome)}
        ${par("Telefone", telefoneLegivel(l.telefone))}
        ${par("E-mail", l.email)}
        ${par("Cadastro", l.cadastro_incompleto ? "incompleto (sem telefone)" : "completo")}
        ${par("Responsável", nomeResponsavel(l.responsavel_id))}
        ${par("Entrou em", dataHora(l.criado_em))}
        ${pode.editarLead(l) ? '<button class="ver-lead" type="button" id="editar-cadastro" style="margin-top:14px">Editar cadastro</button>' : ""}
      </div>
      ${pode.excluir() ? '<div class="grupo"><button class="ver-lead perigo" type="button" id="excluir-lead">Excluir lead</button></div>' : ""}`;
  }

  const conversa = conversas.find((c) => c.lead_id === l.id) || null;
  if (!conversa && abaAtual === "conversa") abaAtual = "anotacoes";
  if (conversa && !abaInicial) abaAtual = "conversa";

  const ABAS = [
    ...(conversa ? [{ id: "conversa", nome: "Conversa", conta: () => conversa.nao_lidas || 0 }] : []),
    { id: "anotacoes", nome: "Anotações", conta: () => notas.filter((n) => n.lead_id === l.id).length },
    { id: "origem", nome: "Origem", conta: () => (l.lead_origens || []).length },
    { id: "dados", nome: "Dados", conta: () => 0 },
  ];

  // Chegou mensagem nova enquanto a ficha está aberta na conversa: atualiza.
  const aoAtualizar = () => {
    if (abaAtual === "conversa" && document.body.contains(div)) (garantirMensagens(conversa.id) || Promise.resolve()).then(desenhar);
  };
  document.addEventListener("conversas-atualizadas", aoAtualizar);
  const fecharOriginal = fechar;
  fechar = () => { document.removeEventListener("conversas-atualizadas", aoAtualizar); fecharOriginal(); };

  function desenhar() {
    if (abaAtual === "conversa" && conversa) {
      const carregando = garantirMensagens(conversa.id);
      if (carregando && !carregando.redesenhoFicha) {
        carregando.redesenhoFicha = true;
        carregando.then(() => { if (document.body.contains(div)) desenhar(); });
      }
    }
    if (abaAtual === "conversa" && conversa?.nao_lidas) {
      conversa.nao_lidas = 0;
      atualizarContadorConversas();
      sb.rpc("marcar_conversa_lida", { p_conversa: conversa.id });
    }
    const corpo = abaAtual === "conversa" ? htmlChat(conversa)
      : abaAtual === "anotacoes" ? abaAnotacoes() : abaAtual === "origem" ? abaOrigem() : abaDados();
    div.innerHTML = `
      <div class="gaveta">
        <div class="cabeca">
          <div>
            <h2>${escapar(l.nome || "Lead sem nome")}</h2>
            <div class="sub-cel">${escapar(NOME_ETAPA[l.etapa] || l.etapa)} ${l.cadastro_incompleto ? '· <span style="color:var(--vermelho)">cadastro incompleto</span>' : ""}</div>
          </div>
          <button class="fechar" type="button" aria-label="Fechar">✕</button>
        </div>
        ${conversa ? "" : botaoWhatsApp(l, "Conversar no WhatsApp")}
        ${l.cadastro_incompleto && pode.editarLead(l) ? '<button class="btn btn-largo" id="completar" type="button" style="margin-bottom:22px">Completar cadastro</button>' : ""}
        <div class="abas">
          ${ABAS.map((a) => {
            const n = a.conta();
            return `<button class="aba${a.id === abaAtual ? " ativa" : ""}" data-aba="${a.id}" type="button">${a.nome}${n ? `<span class="aba-conta">${n}</span>` : ""}</button>`;
          }).join("")}
        </div>
        <div class="aba-corpo">${corpo}</div>
      </div>`;

    div.querySelector(".fechar").addEventListener("click", fechar);
    div.querySelectorAll(".aba").forEach((b) => b.addEventListener("click", () => { abaAtual = b.dataset.aba; desenhar(); }));
    if (abaAtual === "conversa" && conversa) ligarChat(div, conversa, () => { desenhar(); if (vistaAtual === "conversas") render(); });
    const completar = div.querySelector("#completar");
    if (completar) completar.addEventListener("click", () => { fechar(); formularioLead(l); });

    const salvarNota = div.querySelector("#salvar-nota");
    if (salvarNota) {
      salvarNota.addEventListener("click", async () => {
        const texto = div.querySelector("#nova-nota").value.trim();
        const aviso = div.querySelector("#aviso-nota");
        if (!texto) { aviso.className = "aviso erro"; aviso.textContent = "Escreva algo antes de salvar."; return; }
        const { data, error } = await sb.from("lead_notas")
          .insert({ empresa_id: empresaAtual.id, lead_id: l.id, texto, autor_id: usuario.id }).select().single();
        if (error) { aviso.className = "aviso erro"; aviso.textContent = "Não deu pra salvar: " + error.message; return; }
        notas.unshift(data);
        desenhar();
        render();
      });
    }
    div.querySelectorAll(".nota-apagar").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("Apagar essa anotação?")) return;
        const { data, error } = await sb.from("lead_notas").delete().eq("id", b.dataset.nota).select("id");
        if (error || !data?.length) { alert("Não deu pra apagar."); return; }
        notas = notas.filter((n) => n.id !== b.dataset.nota);
        desenhar();
        render();
      });
    });

    const editar = div.querySelector("#editar-cadastro");
    if (editar) editar.addEventListener("click", () => { fechar(); formularioLead(l); });
    const excluir = div.querySelector("#excluir-lead");
    if (excluir) excluir.addEventListener("click", async () => { if (await excluirLead(l)) { fechar(); render(); } });
  }

  desenhar();
}

