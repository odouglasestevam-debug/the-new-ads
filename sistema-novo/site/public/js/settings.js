/* ---------------- ajustes ---------------- */
function vistaConfigPainel(aba) {
  return paineisConfig()[aba]();
}

function paineisConfig() {
  return {
    seguranca: () => `
      <div class="bloco">
        <h3>Verificação em duas etapas <span class="selo nao" id="selo-2fa" style="margin-left:8px">verificando...</span></h3>
        <p>Com isso ligado, entrar e trocar a senha passam a exigir o código de 6 dígitos de um aplicativo autenticador.</p>
        <div id="area-2fa"></div>
      </div>
      <div class="bloco">
        <h3>Trocar senha</h3>
        <p>Mínimo de 8 caracteres.</p>
        <div class="campo"><label for="senha-nova">Nova senha</label><input type="password" id="senha-nova" autocomplete="new-password"></div>
        <div class="campo"><label for="senha-confirma">Repetir a nova senha</label><input type="password" id="senha-confirma" autocomplete="new-password"></div>
        <button class="btn btn-largo" id="btn-trocar-senha" type="button">Salvar nova senha</button>
        <div class="aviso" id="aviso-senha"></div>
      </div>
      ${blocoNotificacoes()}`,

    equipe: () => `
      ${pode.administrar() ? `
      <div class="bloco">
        <h3>Convidar para ${escapar(empresaAtual.nome)}</h3>
        <p>Se a pessoa ainda não tem conta, o CRM gera um link de convite para você mandar a ela. Se já tem, ela só ganha acesso a esta empresa.</p>
        <div class="campo"><label for="conv-email">E-mail</label><input type="email" id="conv-email" autocomplete="off"></div>
        <div class="campo"><label for="conv-papel">Nível de acesso</label>
          <select id="conv-papel">${opcoesPapel("vendedor")}</select></div>
        <button class="btn btn-largo" id="btn-convidar" type="button">Convidar</button>
        <div class="aviso" id="aviso-convite"></div>
        <div id="link-convite"></div>
      </div>
      <div class="bloco">
        <h3>O que cada nível faz</h3>
        <div class="par"><span class="r">Dono</span><span class="v">tudo na empresa, inclusive equipe e integrações</span></div>
        <div class="par"><span class="r">Gestor</span><span class="v">todos os leads, distribui entre vendedores</span></div>
        <div class="par"><span class="r">Vendedor</span><span class="v">só os leads em que é responsável</span></div>
        <div class="par"><span class="r">Leitura</span><span class="v">vê todos os leads, não altera nada</span></div>
      </div>` : ""}
      <div class="bloco" style="grid-column:1/-1">
        <h3>Equipe de ${escapar(empresaAtual.nome)}</h3>
        <p>${pode.administrar() ? "Troque o nível, envie a recuperação de acesso ao e-mail do membro ou remova da empresa." : "Quem tem acesso a esta empresa e com qual nível."}</p>
        ${equipe.length ? equipe.map((m) => `
          <div class="par" style="grid-template-columns:1fr auto;align-items:center">
            <span class="v">${escapar(m.nome||m.email)}${m.nome?` <span class="sub-cel">${escapar(m.email)}</span>`:""}${m.user_id === usuario.id ? ' <span class="sub-cel">(você)</span>' : ""}</span>
            ${pode.administrar() ? `
              <span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
                <select class="etapa-sel membro-papel" data-user="${m.user_id}">${opcoesPapel(m.papel)}</select>
                <button class="mini membro-link" data-user="${m.user_id}" type="button">Enviar recuperação</button>
                <button class="mini membro-remover" data-user="${m.user_id}" data-email="${escapar(m.email)}" type="button">Remover</button>
              </span>` : `<span class="num">${escapar(NOME_PAPEL[m.papel] || m.papel)}</span>`}
          </div>`).join("")
          : '<div class="vazio-bloco">Ninguém na equipe desta empresa ainda.</div>'}
        <div class="aviso" id="aviso-equipe"></div>
        <div id="link-membro"></div>
      </div>`,

    integracoes: () => painelIntegracoes(),
    distribuicao: () => painelDistribuicao(),
    disponibilidade: () => painelDisponibilidade(),

    empresas: () => `
      <div class="bloco">
        <h3>Nova empresa</h3>
        <p>Cada cliente é uma empresa. Depois de criar, convide o dono dela na aba Equipe.</p>
        <div class="campo"><label for="emp-nome">Nome</label><input type="text" id="emp-nome" autocomplete="off"></div>
        <button class="btn btn-largo" id="btn-criar-empresa" type="button">Criar empresa</button>
        <div class="aviso" id="aviso-empresa"></div>
      </div>
      <div class="bloco">
        <h3>Empresas (${empresas.length})</h3>
        ${empresas.map((e) => `<div class="par"><span class="r">${escapar(e.slug)}</span><span class="v">${escapar(e.nome)}</span></div>`).join("")
          || '<div class="vazio-bloco">Nenhuma empresa ainda.</div>'}
      </div>`,

    dados: () => `
      <div class="bloco">
        <h3>Atualizar dados</h3>
        <p>Recarrega leads e anotações direto do banco.</p>
        <button class="btn btn-largo btn-fantasma" id="btn-recarregar">Atualizar agora</button>
        <div class="aviso" id="aviso-recarregar"></div>
      </div>
      <div class="bloco">
        <h3>Sessão</h3>
        <p>Sair encerra a sessão neste aparelho.</p>
        <button class="btn btn-largo btn-fantasma" id="btn-sair-ajustes">Sair da conta</button>
      </div>`,
    atendimento: () => painelAtendimento(),
  };
}

function vistaConfig() {
  const painel = paineisConfig();
  // submenu vertical, agrupado: o que é da pessoa, o que é da empresa e o que é da agência
  const GRUPOS = [
    ["Sua conta", [["seguranca", "Segurança"], ["disponibilidade", "Disponibilidade"]]],
    ["Empresa", [["equipe", "Equipe"],
      ...(pode.administrar() ? [["distribuicao", "Distribuição"], ["atendimento", "Atendimento"],
        ["formularios", "Formulários"], ["integracoes", "Integrações"]] : [])]],
    ...(ehAgencia ? [["Agência", [["empresas", "Empresas"]]]] : []),
    ["Manutenção", [["dados", "Dados"]]],
  ].filter(([, itens]) => itens.length);

  const valida = GRUPOS.some(([, itens]) => itens.some(([id]) => id === abaAjustes));
  if (!valida) abaAjustes = "seguranca";

  const menu = GRUPOS.map(([titulo, itens]) => `
    <div class="grupo-ajuste">
      <span class="titulo-grupo">${titulo}</span>
      ${itens.map(([id, rot]) => `<button class="aba${abaAjustes === id ? " ativa" : ""}" data-aba-ajuste="${id}" type="button"${abaAjustes === id ? ' aria-current="page"' : ""}>${rot}</button>`).join("")}
    </div>`).join("");

  // o editor de formulário tem layout próprio e não entra na grade de cartões
  const corpo = abaAjustes === "formularios"
    ? (formEditando ? vistaEditorFormulario() : vistaFormularios())
    : `<div class="cartoes-config">${(painel[abaAjustes] || painel.seguranca)()}</div>`;

  return `
    <div class="topo"><div><h1>Ajustes</h1><div class="desc">Conta, equipe e manutenção.</div></div></div>
    <div class="ajustes">
      <nav class="menu-ajustes" aria-label="Seções de ajustes">${menu}</nav>
      <div class="corpo-ajustes">${corpo}</div>
    </div>`;
}

async function desenhar2FA() {
  const area = document.getElementById("area-2fa");
  const selo = document.getElementById("selo-2fa");
  if (!area) return;
  const { data, error } = await sb.auth.mfa.listFactors();
  // a pessoa pode ter trocado de aba enquanto carregava
  if (!document.body.contains(area)) return;
  if (error) { area.innerHTML = `<div class="aviso erro">Não deu pra checar: ${escapar(error.message)}</div>`; return; }
  const ativo = (data?.totp || []).find((f) => f.status === "verified");

  if (ativo) {
    selo.className = "selo sim";
    selo.textContent = "ligada";
    area.innerHTML = `
      <div class="par"><span class="r">Ativado em</span><span class="v">${dataCurta(ativo.created_at)}</span></div>
      <button class="ver-lead" id="remover-2fa" type="button" style="width:auto;margin-top:16px;padding:8px 14px">Desativar verificação em duas etapas</button>
      <div class="aviso" id="aviso-2fa"></div>`;
    document.getElementById("remover-2fa").addEventListener("click", async () => {
      if (!confirm("Desativar a verificação em duas etapas?")) return;
      const { error: erro } = await sb.auth.mfa.unenroll({ factorId: ativo.id });
      if (erro) { document.getElementById("aviso-2fa").textContent = "Não deu pra desativar: " + erro.message; return; }
      desenhar2FA();
    });
    return;
  }

  selo.className = "selo nao";
  selo.textContent = "desligada";
  area.innerHTML = `<button class="btn btn-largo" id="ativar-2fa" type="button">Ativar</button><div class="aviso" id="aviso-2fa"></div>`;
  document.getElementById("ativar-2fa").addEventListener("click", async () => {
    const aviso = document.getElementById("aviso-2fa");
    aviso.textContent = "Gerando o código...";
    const { data: atuais } = await sb.auth.mfa.listFactors();
    for (const pendente of (atuais?.totp || []).filter((f) => f.status !== "verified")) {
      await sb.auth.mfa.unenroll({ factorId: pendente.id });
    }
    const { data: inscricao, error: erro } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Autenticador", issuer: "CRM The New Ads" });
    if (erro) { aviso.className = "aviso erro"; aviso.textContent = "Não deu pra gerar: " + erro.message; return; }

    area.innerHTML = `
      <ol class="passos-2fa">
        <li>Abra o aplicativo autenticador e adicione uma conta pelo código QR</li>
        <li>Aponte a câmera para o código abaixo</li>
        <li>Digite aqui o número de 6 dígitos que aparecer</li>
      </ol>
      <div class="qr-caixa"><img src="${inscricao.totp.qr_code}" alt="Código QR" width="190" height="190"></div>
      <details class="manual"><summary>Não consegue ler o código?</summary>
        <p>Adicione manualmente com esta chave:</p><code class="chave-2fa">${escapar(inscricao.totp.secret)}</code></details>
      <div class="campo" style="margin-top:18px">
        <label for="confirma-2fa">Código do aplicativo</label>
        <input type="text" id="confirma-2fa" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"
               style="letter-spacing:.4em;font-family:var(--mono);text-align:center">
      </div>
      <button class="btn btn-largo" id="confirmar-2fa" type="button">Confirmar e ativar</button>
      <div class="aviso" id="aviso-2fa"></div>`;

    document.getElementById("confirmar-2fa").addEventListener("click", async () => {
      const campo = document.getElementById("confirma-2fa");
      const avisoC = document.getElementById("aviso-2fa");
      const codigo = campo.value.replace(/\D/g, "");
      if (codigo.length !== 6) { avisoC.className = "aviso erro"; avisoC.textContent = "O código tem 6 dígitos."; return; }
      const { data: desafio, error: e1 } = await sb.auth.mfa.challenge({ factorId: inscricao.id });
      if (e1) { avisoC.className = "aviso erro"; avisoC.textContent = e1.message; return; }
      const { error: e2 } = await sb.auth.mfa.verify({ factorId: inscricao.id, challengeId: desafio.id, code: codigo });
      if (e2) { avisoC.className = "aviso erro"; avisoC.textContent = "Código incorreto, tente com o próximo."; campo.value = ""; return; }
      desenhar2FA();
    });
  });
}

// A aba ativa continua visível quando a navegação de ajustes rola no celular.
function mostrarAbaAjustes(){
  const abas=document.querySelector('.abas-ajustes'),ativa=abas?.querySelector('.ativa');
  if(!abas||!ativa||abas.scrollWidth<=abas.clientWidth)return;
  const a=abas.getBoundingClientRect(),b=ativa.getBoundingClientRect();
  if(b.left<a.left||b.right>a.right)abas.scrollLeft+=b.left-a.left-12;
}
window.addEventListener('resize',mostrarAbaAjustes);
