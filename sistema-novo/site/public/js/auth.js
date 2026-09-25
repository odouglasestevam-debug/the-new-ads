/* ---------------- autenticação ---------------- */
async function iniciar() {
  if (ERRO_LINK) {
    const aviso = document.getElementById("aviso-login");
    aviso.className = "aviso erro";
    aviso.textContent = "Esse link expirou ou já foi usado. Peça um novo link de acesso a quem te convidou.";
    history.replaceState(null, "", location.pathname);
  }
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  if (TIPO_LINK === "invite" || TIPO_LINK === "recovery") {
    history.replaceState(null, "", location.pathname);
    pedirNovaSenha(TIPO_LINK);
    return;
  }
  if (await bloquearEntrada()) return;
  entrarNoApp(data.session);
}

function pedirNovaSenha(tipo) {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-definir-senha").style.display = "";
  document.getElementById("definir-senha-texto").textContent = tipo === "invite"
    ? "Você foi convidado para o CRM. Crie a sua senha para entrar."
    : "Crie uma nova senha para entrar.";
  document.getElementById("definir-senha").focus();
}

document.getElementById("form-definir-senha").addEventListener("submit", async (e) => {
  e.preventDefault();
  const aviso = document.getElementById("aviso-definir-senha");
  const nova = document.getElementById("definir-senha").value;
  if (nova.length < 8) { aviso.className = "aviso erro"; aviso.textContent = "A senha precisa ter pelo menos 8 caracteres."; return; }
  if (nova !== document.getElementById("definir-senha-2").value) { aviso.className = "aviso erro"; aviso.textContent = "As duas senhas não são iguais."; return; }
  const btn = document.getElementById("btn-definir-senha");
  btn.disabled = true;
  aviso.className = "aviso";
  aviso.textContent = "Salvando...";
  const { error } = await sb.auth.updateUser({ password: nova });
  btn.disabled = false;
  if (error) { aviso.className = "aviso erro"; aviso.textContent = "Não deu pra salvar: " + error.message; return; }
  document.getElementById("form-definir-senha").style.display = "none";
  if (await bloquearEntrada()) return;
  const { data } = await sb.auth.getSession();
  entrarNoApp(data.session);
});

async function precisaSegundaEtapa() {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) throw new Error("Não foi possível verificar a segurança da sessão. Tente novamente.");
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

async function bloquearEntrada() {
  try { if (await precisaSegundaEtapa()) { pedirCodigo(); return true; } return false; }
  catch {
    document.getElementById('form-login').style.display = '';
    document.getElementById('form-definir-senha').style.display = 'none';
    const aviso = document.getElementById('aviso-login');
    aviso.className = 'aviso erro';
    aviso.textContent = 'Não foi possível verificar a segurança da sessão. Tente entrar novamente.';
    return true;
  }
}

function pedirCodigo() {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-codigo").style.display = "";
  document.getElementById("codigo-2fa").focus();
}

async function verificarCodigo(codigo) {
  const { data: fatores, error: erroFatores } = await sb.auth.mfa.listFactors();
  if (erroFatores) return { erro: erroFatores.message };
  const fator = (fatores?.totp || []).find((f) => f.status === "verified");
  if (!fator) return { erro: "Nenhum aplicativo autenticador cadastrado." };
  const { data: desafio, error: erroDesafio } = await sb.auth.mfa.challenge({ factorId: fator.id });
  if (erroDesafio) return { erro: erroDesafio.message };
  const { error } = await sb.auth.mfa.verify({ factorId: fator.id, challengeId: desafio.id, code: codigo });
  return error ? { erro: error.message } : { ok: true };
}

document.getElementById("form-codigo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const aviso = document.getElementById("aviso-codigo");
  const btn = document.getElementById("btn-verificar");
  const codigo = document.getElementById("codigo-2fa").value.replace(/\D/g, "");
  if (codigo.length !== 6) { aviso.className = "aviso erro"; aviso.textContent = "O código tem 6 dígitos."; return; }
  btn.disabled = true;
  aviso.className = "aviso";
  aviso.textContent = "Verificando...";
  const resultado = await verificarCodigo(codigo);
  btn.disabled = false;
  if (resultado.erro) {
    aviso.className = "aviso erro";
    aviso.textContent = resultado.erro.includes("Invalid") ? "Código incorreto ou expirado." : resultado.erro;
    document.getElementById("codigo-2fa").value = "";
    return;
  }
  const { data } = await sb.auth.getSession();
  document.getElementById("form-codigo").style.display = "none";
  entrarNoApp(data.session);
});

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const aviso = document.getElementById("aviso-login");
  const btn = document.getElementById("btn-entrar");
  btn.disabled = true;
  aviso.className = "aviso";
  aviso.textContent = "Entrando...";
  const { data, error } = await sb.auth.signInWithPassword({
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("senha").value,
  });
  btn.disabled = false;
  if (error) {
    aviso.className = "aviso erro";
    aviso.textContent = error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não deu pra entrar: " + error.message;
    return;
  }
  aviso.textContent = "";
  if (await bloquearEntrada()) return;
  entrarNoApp(data.session);
});

async function sair() {
  pararPresenca();
  pararTempoReal();
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(`crm:rascunho:${usuario?.id}:`)) sessionStorage.removeItem(key); } catch {}
  await sb.auth.signOut();
  location.reload();
}
document.getElementById("btn-sair").addEventListener("click", sair);

async function entrarNoApp(sessao) {
  usuario = sessao.user;
  document.getElementById("tela-login").style.display = "none";
  document.getElementById("app").classList.add("ativo");
  document.getElementById("usuario-email").textContent = usuario.email;
  await carregarEmpresas();
}

async function carregarEmpresas(selecionar) {
  const [resAgencia, resEmpresas, resMembros] = await Promise.all([
    sb.from("agencia_admins").select("user_id").eq("user_id", usuario.id).maybeSingle(),
    sb.from("empresas").select("id, nome, slug, ativo").order("nome"),
    sb.from("membros").select("empresa_id, papel").eq("user_id", usuario.id),
  ]);
  ehAgencia = !!resAgencia.data;
  empresas = resEmpresas.data || [];
  const papeis = Object.fromEntries((resMembros.data || []).map((m) => [m.empresa_id, m.papel]));
  empresas.forEach((e) => { e.papel = ehAgencia ? "agencia" : papeis[e.id]; });

  if (!empresas.length && ehAgencia) {
    // Agência sem nenhuma empresa: vai direto para criar a primeira.
    document.querySelector(".seletor-empresa").style.display = "none";
    document.getElementById("nav").style.display = "none";
    empresaAtual = null;
    papel = "agencia";
    document.getElementById("conteudo").innerHTML = `
      <div class="topo"><div><h1>Primeira empresa</h1><div class="desc">Crie o primeiro cliente para começar.</div></div></div>
      <div class="cartoes-config">${vistaConfigPainel("empresas")}</div>`;
    ligarEventos();
    return;
  }

  if (!empresas.length) {
    document.getElementById("nav").style.display = "none";
    document.querySelector(".seletor-empresa").style.display = "none";
    document.getElementById("conteudo").innerHTML = `
      <div class="topo"><div><h1>Sem acesso ainda</h1>
      <div class="desc">Sua conta (${escapar(usuario.email)}) ainda não foi adicionada a nenhuma empresa. Peça o acesso a quem administra o CRM.</div></div></div>`;
    return;
  }

  let salva = null;
  try { salva = localStorage.getItem(CHAVE_EMPRESA); } catch (err) {}
  const inicial = empresas.find((e) => e.id === (selecionar || salva)) || empresas[0];

  document.getElementById("nav").style.display = "";
  document.querySelector(".seletor-empresa").style.display = "";
  const sel = document.getElementById("empresa-sel");
  sel.innerHTML = empresas.map((e) => `<option value="${e.id}">${escapar(e.nome)}</option>`).join("");
  sel.onchange = () => trocarEmpresa(sel.value);
  await trocarEmpresa(inicial.id);
}

async function trocarEmpresa(id) {
  pararPresenca();
  resetarDistribuicao();
  pararTempoReal();
  empresaAtual = empresas.find((e) => e.id === id);
  papel = empresaAtual.papel;
  formEditando = null;
  conversaAberta = null;
  mensagensPorConversa = {};
  leads = [];
  notas = [];
  conversas = [];
  equipe = [];
  document.querySelectorAll('.fundo-modal').forEach(el=>el.remove());
  document.getElementById('conteudo').innerHTML = '<p role="status">Carregando empresa…</p>';
  integracaoWhats = null;
  canaisWhats = [];
  busca='';filtroCadastro='todos';Object.assign(filtrosLeads,{responsavel:'todos',etapa:'todas',ordem:'recentes'});
  filtroConv.busca = "";
  filtroConv.responsavel = "";
  filtroConv.canal = "";
  historicoCompleto.clear();
  listaConversaIds=null;totalNaoLidas=null;totalConversas=0;chaveListaConv='';
  clearTimeout(timerBuscaConv);sequenciaBuscaConv++;
  errosMensagens.clear();
  avisosIntegracao = {};
  if (vistaAtual === "formularios") vistaAtual = "kanban";  // Formulários virou aba dentro de Ajustes
  if (abaAjustes === "formularios" && !pode.administrar()) abaAjustes = "seguranca";
  if (["integracoes","distribuicao"].includes(abaAjustes) && !pode.administrar()) abaAjustes = "seguranca";
  try { localStorage.setItem(CHAVE_EMPRESA, id); } catch (err) {}
  document.getElementById("empresa-sel").value = id;
  document.getElementById("papel-atual").textContent = NOME_PAPEL[papel] || "";
  await carregarTudo();
  if (empresaAtual?.id === id) { iniciarTempoReal(id); iniciarPresenca(id); }
}
