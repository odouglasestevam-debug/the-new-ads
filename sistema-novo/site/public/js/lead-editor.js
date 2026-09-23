/* ---------------- criar e editar lead ---------------- */
// Serve para lead novo (lead = null) e para completar cadastro de um existente.
function formularioLead(lead) {
  const novo = !lead;
  const div = document.createElement("div");
  div.className = "fundo-modal fundo-centro";
  const opcoesResponsavel = equipe
    .filter((m) => m.papel !== "leitura")
    .map((m) => `<option value="${m.user_id}"${(lead?.responsavel_id || (papel === "vendedor" ? usuario.id : "")) === m.user_id ? " selected" : ""}>${escapar(m.nome||m.email)}</option>`)
    .join("");

  div.innerHTML = `
    <div class="caixa-modal">
      <h2>${novo ? "Novo lead" : "Editar cadastro"}</h2>
      <p class="ajuda">Telefone com DDD. Sem telefone o lead fica marcado como cadastro incompleto.</p>
      <div class="campo"><label for="fl-nome">Nome</label><input type="text" id="fl-nome" value="${escapar(lead?.nome || "")}" autocomplete="off"></div>
      <div class="campo"><label for="fl-tel">Telefone</label><input type="tel" id="fl-tel" value="${escapar(telefoneLegivel(lead?.telefone))}" placeholder="(11) 99999-9999" autocomplete="off"></div>
      <div class="campo"><label for="fl-email">E-mail</label><input type="email" id="fl-email" value="${escapar(lead?.email || "")}" autocomplete="off"></div>
      ${pode.distribuir() ? `
      <div class="campo"><label for="fl-resp">Responsável</label>
        <select id="fl-resp"><option value="">${novo?'Usar distribuição da empresa':'sem responsável'}</option>${opcoesResponsavel}</select>
        ${novo?'<p class="ajuda">Se a automação estiver desligada, fica sem responsável.</p>':''}</div>` : ""}
      <div class="aviso" id="fl-aviso"></div>
      <div class="acoes-modal">
        <button class="btn btn-fantasma" type="button" id="fl-cancelar">Cancelar</button>
        <button class="btn" type="button" id="fl-salvar">Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(div);

  const fechar = () => {div.remove();document.removeEventListener('keydown',aoTeclar);};
  const aoTeclar = event => {if(event.key==='Escape')fechar();};
  document.addEventListener('keydown',aoTeclar);
  div.addEventListener("click", (e) => { if (e.target === div) fechar(); });
  div.querySelector("#fl-cancelar").addEventListener("click", fechar);
  div.querySelector("#fl-nome").focus();

  div.querySelector("#fl-salvar").addEventListener("click", async () => {
    const aviso = div.querySelector("#fl-aviso");
    const telefone = normalizarTelefone(div.querySelector("#fl-tel").value);
    if (telefone === undefined) { aviso.className = "aviso erro"; aviso.textContent = "Telefone inválido. Use DDD e número."; return; }
    const campos = {
      nome: div.querySelector("#fl-nome").value.trim() || null,
      telefone,
      email: div.querySelector("#fl-email").value.trim() || null,
    };
    const resp = div.querySelector("#fl-resp");
    if (resp) campos.responsavel_id = resp.value || null;
    else if (novo && papel === "vendedor") campos.responsavel_id = usuario.id;

    if (!campos.nome && !campos.telefone && !campos.email) {
      aviso.className = "aviso erro"; aviso.textContent = "Preencha pelo menos nome, telefone ou e-mail."; return;
    }

    aviso.className = "aviso";
    aviso.textContent = "Salvando...";

    let resultado;
    if (novo) {
      resultado = await sb.from("leads").insert({ ...campos, empresa_id: empresaAtual.id }).select("*, lead_origens(*)").single();
      if (!resultado.error) {
        await sb.from("lead_origens").insert({ empresa_id: empresaAtual.id, lead_id: resultado.data.id, canal: "manual" });
      }
    } else {
      resultado = await sb.from("leads").update(campos).eq("id", lead.id).select("*, lead_origens(*)").single();
    }

    if (resultado.error) {
      aviso.className = "aviso erro";
      aviso.textContent = resultado.error.code === "23505"
        ? "Já existe um lead com esse telefone nesta empresa."
        : "Não deu pra salvar: " + resultado.error.message;
      return;
    }
    fechar();
    await carregarTudo();
    if (!novo) abrirLead(lead.id);
  });
}

async function excluirLead(l) {
  if (!confirm(`Excluir "${l.nome || "esse lead"}" pra sempre? Apaga também as anotações e origens. Não tem como desfazer.`)) return false;
  const { data, error } = await sb.from("leads").delete().eq("id", l.id).select("id");
  if (error || !data?.length) { alert(error ? "Não deu pra excluir: " + error.message : "Sem permissão para excluir."); return false; }
  leads = leads.filter((x) => x.id !== l.id);
  notas = notas.filter((n) => n.lead_id !== l.id);
  return true;
}
