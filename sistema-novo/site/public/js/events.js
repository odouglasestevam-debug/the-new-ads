/* ---------------- eventos das vistas ---------------- */
function ligarEventos() {
  const movel = document.getElementById("empresa-sel-movel");
  if (movel) movel.addEventListener("change", () => trocarEmpresa(movel.value));

  const campoBusca = document.getElementById("busca");
  if (campoBusca) {
    campoBusca.addEventListener("input", (e) => {
      busca = e.target.value;
      const posicao = e.target.selectionStart;
      render();
      const novo = document.getElementById("busca");
      if (novo) { novo.focus(); novo.setSelectionRange(posicao, posicao); }
    });
  }
  const filtro = document.getElementById("filtro-cadastro");
  if (filtro) filtro.addEventListener("change", (e) => { filtroCadastro = e.target.value; render(); });
  document.querySelectorAll('[data-responsabilidade]').forEach(b=>b.onclick=()=>{
    filtrosLeads.responsavel=b.dataset.responsabilidade;render();document.querySelector(`[data-responsabilidade="${filtrosLeads.responsavel}"]`)?.focus({preventScroll:true});
  });
  document.getElementById('filtro-etapa')?.addEventListener('change',e=>{filtrosLeads.etapa=e.target.value;render();document.getElementById('filtro-etapa')?.focus({preventScroll:true});});
  document.getElementById('ordem-leads')?.addEventListener('change',e=>{filtrosLeads.ordem=e.target.value;render();const painel=document.querySelector('.filtros-adicionais');if(painel)painel.open=true;document.getElementById('ordem-leads')?.focus({preventScroll:true});});
  document.querySelectorAll('[data-limpar-leads]').forEach(b=>b.onclick=()=>{limparFiltrosLeads();document.getElementById('busca')?.focus();});
  document.querySelectorAll('[data-abrir-lead]').forEach(b=>b.onclick=()=>abrirLead(b.dataset.abrirLead));
  document.getElementById('ir-etapa')?.addEventListener('change',e=>{
    const coluna=document.querySelector(`.coluna[data-etapa="${e.target.value}"]`),quadro=document.querySelector('.kanban');
    if(coluna&&quadro)quadro.scrollTo({left:coluna.offsetLeft-quadro.offsetLeft,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
  });

  document.querySelectorAll(".lead-etapa").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", (e) => moverLead(e.target.dataset.id, e.target.value));
  });

  document.querySelectorAll(".cartao, .linha-lead").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("select, a, button")) return;
      abrirLead(el.dataset.id);
    });
  });

  const novo = document.getElementById("btn-novo-lead");
  if (novo) novo.addEventListener("click", () => formularioLead(null));

  document.querySelectorAll(".lead-responsavel").forEach((sel) => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async () => {
      const valor = sel.value || null;
      const { data, error } = await sb.from("leads").update({ responsavel_id: valor }).eq("id", sel.dataset.id).select("id");
      if (error || !data?.length) { alert("Não deu pra trocar o responsável" + (error ? ": " + error.message : ".")); render(); return; }
      const lead = leads.find((l) => l.id === sel.dataset.id);
      if (lead) lead.responsavel_id = valor;
    });
  });

  ligarEquipe();
  ligarFormularios();
  ligarConversas();
  ligarIntegracoes();
  ligarDistribuicao();

  ligarArrasto();

  document.querySelectorAll("[data-aba-ajuste]").forEach((b) => {
    b.addEventListener("click", () => { abaAjustes = b.dataset.abaAjuste; render(); });
  });
  const sairAjustes = document.getElementById("btn-sair-ajustes");
  if (sairAjustes) sairAjustes.addEventListener("click", sair);
  if (document.getElementById("area-2fa")) desenhar2FA();

  const btnSenha = document.getElementById("btn-trocar-senha");
  if (btnSenha) {
    btnSenha.addEventListener("click", async () => {
      const nova = document.getElementById("senha-nova").value;
      const confirma = document.getElementById("senha-confirma").value;
      const aviso = document.getElementById("aviso-senha");
      if (nova.length < 8) { aviso.className = "aviso erro"; aviso.textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
      if (nova !== confirma) { aviso.className = "aviso erro"; aviso.textContent = "As duas senhas não são iguais."; return; }
      const { data: fatores } = await sb.auth.mfa.listFactors();
      if ((fatores?.totp || []).some((f) => f.status === "verified")) {
        const codigo = prompt("Digite o código de 6 dígitos do autenticador para confirmar:");
        if (codigo === null) return;
        const conferencia = await verificarCodigo(String(codigo).replace(/\D/g, ""));
        if (conferencia.erro) { aviso.className = "aviso erro"; aviso.textContent = "Código não confere. A senha não foi alterada."; return; }
      }
      btnSenha.disabled = true;
      const { error } = await sb.auth.updateUser({ password: nova });
      btnSenha.disabled = false;
      if (error) { aviso.className = "aviso erro"; aviso.textContent = "Não deu pra trocar: " + error.message; return; }
      aviso.className = "aviso ok";
      aviso.textContent = "Senha trocada.";
    });
  }

  const btnRecarregar = document.getElementById("btn-recarregar");
  if (btnRecarregar) {
    btnRecarregar.addEventListener("click", async () => {
      await carregarTudo();
      const aviso = document.getElementById("aviso-recarregar");
      if (aviso) { aviso.className = "aviso ok"; aviso.textContent = "Dados atualizados."; }
    });
  }
}

function ligarEquipe() {
  const convidar = document.getElementById("btn-convidar");
  if (convidar) {
    convidar.addEventListener("click", async () => {
      const aviso = document.getElementById("aviso-convite");
      const email = document.getElementById("conv-email").value.trim();
      const papelNovo = document.getElementById("conv-papel").value;
      if (!email) { aviso.className = "aviso erro"; aviso.textContent = "Informe o e-mail."; return; }
      convidar.disabled = true;
      aviso.className = "aviso";
      aviso.textContent = "Convidando...";
      try {
        const r = await chamarEquipe({ acao: "convidar", email, papel: papelNovo });
        await carregarTudo();
        if (r.link) {
          mostrarLink("link-convite", r.link,
            `Convite criado para ${escapar(email)}. Mande este link só para essa pessoa: ele serve para ela criar a senha, uma única vez.`);
        } else {
          const avisoNovo = document.getElementById("aviso-convite");
          avisoNovo.className = "aviso ok";
          avisoNovo.textContent = `${email} já tinha conta e agora tem acesso a ${empresaAtual.nome}.`;
        }
      } catch (err) {
        aviso.className = "aviso erro";
        aviso.textContent = err.message;
        convidar.disabled = false;
      }
    });
  }

  document.querySelectorAll(".membro-papel").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const aviso = document.getElementById("aviso-equipe");
      const { data, error } = await sb.from("membros").update({ papel: sel.value })
        .eq("empresa_id", empresaAtual.id).eq("user_id", sel.dataset.user).select("user_id");
      if (error || !data?.length) {
        aviso.className = "aviso erro";
        aviso.textContent = error ? traduzirErro(error.message) : "Sem permissão para alterar.";
        await carregarTudo();
        return;
      }
      if (sel.dataset.user === usuario.id && !ehAgencia) { await carregarEmpresas(empresaAtual.id); return; }
      await carregarTudo();
      const novo = document.getElementById("aviso-equipe");
      if (novo) { novo.className = "aviso ok"; novo.textContent = "Nível atualizado."; }
    });
  });

  document.querySelectorAll(".membro-link").forEach((b) => {
    b.addEventListener("click", async () => {
      const aviso = document.getElementById("aviso-equipe");
      b.disabled = true;
      try {
        await chamarEquipe({ acao: "link_acesso", user_id: b.dataset.user });
        document.getElementById('link-membro')?.replaceChildren();
        aviso.className = 'aviso ok';
        aviso.textContent = 'Recuperação enviada ao e-mail da pessoa. Peça que confira a caixa de entrada e o spam.';
      } catch (err) {
        aviso.className = "aviso erro";
        aviso.textContent = err.message;
      }
      b.disabled = false;
    });
  });

  document.querySelectorAll(".membro-remover").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm(`Remover ${b.dataset.email} de ${empresaAtual.nome}? A pessoa perde o acesso a esta empresa. Os leads dela ficam sem responsável.`)) return;
      const aviso = document.getElementById("aviso-equipe");
      const { error: erroLeads } = await sb.from("leads").update({ responsavel_id: null })
        .eq("empresa_id", empresaAtual.id).eq("responsavel_id", b.dataset.user);
      if (erroLeads) { aviso.className = "aviso erro"; aviso.textContent = erroLeads.message; return; }
      const { data, error } = await sb.from("membros").delete()
        .eq("empresa_id", empresaAtual.id).eq("user_id", b.dataset.user).select("user_id");
      if (error || !data?.length) {
        aviso.className = "aviso erro";
        aviso.textContent = error ? traduzirErro(error.message) : "Sem permissão para remover.";
        return;
      }
      if (b.dataset.user === usuario.id && !ehAgencia) { location.reload(); return; }
      await carregarTudo();
    });
  });

  const criar = document.getElementById("btn-criar-empresa");
  if (criar) {
    criar.addEventListener("click", async () => {
      const aviso = document.getElementById("aviso-empresa");
      const nome = document.getElementById("emp-nome").value.trim();
      if (nome.length < 2) { aviso.className = "aviso erro"; aviso.textContent = "Informe o nome da empresa."; return; }
      const slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
      criar.disabled = true;
      const { data, error } = await sb.from("empresas").insert({ nome, slug }).select("id").single();
      criar.disabled = false;
      if (error) {
        aviso.className = "aviso erro";
        aviso.textContent = error.code === "23505" ? "Já existe uma empresa com esse nome." : "Não deu pra criar: " + error.message;
        return;
      }
      abaAjustes = "equipe";
      vistaAtual = "config";
      await carregarEmpresas(data.id);
    });
  }
}

function traduzirErro(msg) {
  return msg.includes("pelo menos um dono") ? "A empresa precisa de pelo menos um dono. Promova outra pessoa antes." : msg;
}

async function moverLead(id, etapa) {
  const lead = leads.find((l) => l.id === id);
  if (!lead || lead.etapa === etapa) return;
  const { data, error } = await sb.from("leads").update({ etapa }).eq("id", id).select("id");
  if (error || !data?.length) {
    alert(error ? "Não deu pra mover: " + error.message : "Você não tem permissão para mover este lead.");
    render();
    return;
  }
  lead.etapa = etapa;
  render();
}

function ligarArrasto() {
  let arrastando = null;
  document.querySelectorAll(".cartao[draggable]").forEach((cartao) => {
    cartao.addEventListener("dragstart", () => { arrastando = cartao.dataset.id; cartao.classList.add("arrastando"); });
    cartao.addEventListener("dragend", () => {
      arrastando = null;
      cartao.classList.remove("arrastando");
      document.querySelectorAll(".coluna").forEach((c) => c.classList.remove("alvo"));
    });
  });
  document.querySelectorAll(".coluna").forEach((coluna) => {
    coluna.addEventListener("dragover", (e) => { if (arrastando) { e.preventDefault(); coluna.classList.add("alvo"); } });
    coluna.addEventListener("dragleave", () => coluna.classList.remove("alvo"));
    coluna.addEventListener("drop", (e) => {
      e.preventDefault();
      coluna.classList.remove("alvo");
      if (arrastando) moverLead(arrastando, coluna.dataset.etapa);
    });
  });
}
