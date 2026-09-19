/* ---------------- integrações ---------------- */
async function chamarIntegracoes(corpo) {
  const { data: sessao } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/integracoes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${sessao.session.access_token}` },
    body: JSON.stringify({ empresa_id: empresaAtual.id, ...corpo }),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || `Erro ${res.status}`);
  return dados;
}

function seloIntegracao(e) {
  return !e?.existe ? '<span class="selo nao">desligado</span>'
    : e.status === "ativa" ? '<span class="selo sim">conectado</span>'
    : e.status === "erro" ? '<span class="selo alerta">com erro</span>'
    : '<span class="selo nao">aguardando teste</span>';
}

// Guarda o aviso de cada bloco entre redesenhos (salvar redesenha a tela).
let avisosIntegracao = {};

function painelIntegracoes() {
  const todas = integracaoWhats;
  if (!todas) return '<div class="bloco" style="grid-column:1/-1"><p>Carregando integrações...</p></div>';
  if (todas.erroCarga) return `<div class="bloco" style="grid-column:1/-1"><div class="aviso erro">${escapar(todas.erroCarga)}</div></div>`;
  const copiar = (id, valor) => `<code class="codigo" id="${id}">${escapar(valor)}</code><button class="mini" type="button" data-copiar="${id}">Copiar</button>`;
  const botoes = (prefixo, e) => `
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" type="button" data-integ-salvar="${prefixo}">Salvar</button>
      ${e.existe ? `<button class="btn btn-fantasma" type="button" data-integ-testar="${prefixo}">Testar conexão</button>` : ""}
      ${e.existe ? `<button class="btn btn-fantasma" type="button" data-integ-desligar="${prefixo}">Desligar</button>` : ""}
    </div>`;
  const aviso = (prefixo) => {
    const a = avisosIntegracao[prefixo];
    return `<div class="aviso ${a?.tipo || ""}" id="aviso-${prefixo}">${a ? escapar(a.msg) : ""}</div>`;
  };
  const salvoOu = (salvo, exemplo) => salvo ? "Salvo. Deixe vazio para manter" : exemplo;

  const ng = todas.whatsapp_nao_oficial || { existe: false };
  const ngc = ng.config || {};
  const of = todas.whatsapp_oficial || { existe: false };
  const ofc = of.config || {};
  const mt = todas.meta || { existe: false };
  const mtc = mt.config || {};

  return `
    <div class="bloco">
      <h3>WhatsApp NeoGo ${seloIntegracao(ng)}</h3>
      <p>API não oficial. O número continua no celular da empresa e as conversas aparecem aqui. Sem janela de 24h.</p>
      <div class="campo"><label for="ng-base">URL da API NeoGo</label><input type="url" id="ng-base" value="${escapar(ngc.base_url || "")}" placeholder="https://api.seu-servidor-neogo.com" autocomplete="off"></div>
      <div class="campo"><label for="ng-inst">ID da instância</label><input type="text" id="ng-inst" value="${escapar(ngc.instance_id || "")}" autocomplete="off"></div>
      <div class="campo"><label for="ng-token">Token da instância</label><input type="password" id="ng-token" autocomplete="new-password" placeholder="${salvoOu(ng.token_salvo, "token da instância, não a Global Key")}"></div>
      ${botoes("ng", ng)}
      ${aviso("ng")}
    </div>
    <div class="bloco">
      <h3>Webhook da NeoGo</h3>
      ${ng.existe ? `
      <p>A NeoGo aceita até 3 webhooks por instância. Se a instância já manda eventos para o n8n, use um slot livre: o CRM não substitui slot ocupado.</p>
      <div class="campo"><label>URL do webhook</label>${copiar("ng-url", ng.webhook_url)}</div>
      <div class="campo"><label>Secret do slot (assinatura)</label>${copiar("ng-secret", ng.webhook_secret || "")}</div>
      ${ngc.webhook_slot ? `<p>Registrado no slot ${escapar(ngc.webhook_slot)}.</p>` : ""}
      <details class="manual"><summary>Registrar automaticamente com a Global API Key</summary>
        <p>A Global Key é usada só neste registro e não fica guardada no CRM.</p>
        <div class="campo"><label for="ng-global">Global API Key</label><input type="password" id="ng-global" autocomplete="new-password"></div>
        <div class="campo"><label for="ng-slot">Slot</label><select id="ng-slot"><option value="1">1</option><option value="2" selected>2</option><option value="3">3</option></select></div>
        <button class="btn btn-largo btn-fantasma" type="button" id="ng-registrar">Registrar webhook</button>
      </details>
      ${aviso("ng-webhook")}`
      : "<p>Salve a NeoGo ao lado para gerar a URL do webhook.</p>"}
    </div>

    <div class="bloco">
      <h3>Meta Ads, nomes dos anúncios ${seloIntegracao(mt)}</h3>
      <p>Token com <b>ads_read</b> na conta de anúncios do cliente. É com ele que o CRM transforma o ID do anúncio de quem chama no WhatsApp em nome de campanha, conjunto e anúncio.</p>
      <div class="campo"><label for="mt-token">Token de acesso</label><input type="password" id="mt-token" autocomplete="new-password" placeholder="${salvoOu(mt.token_salvo, "EAA...")}"></div>
      <div class="campo"><label for="mt-conta">Conta de anúncios (opcional, para o teste)</label><input type="text" id="mt-conta" value="${escapar(mtc.ad_account_id ? "act_" + mtc.ad_account_id : "")}" placeholder="act_123456789" autocomplete="off"></div>
      ${mt.existe && mtc.nome_conta ? `<p>Conta: ${escapar(mtc.nome_conta)}</p>` : ""}
      ${botoes("mt", mt)}
      ${aviso("mt")}
    </div>

    <div class="bloco">
      <h3>WhatsApp API oficial ${seloIntegracao(of)}</h3>
      <p>${of.existe && ofc.numero_exibido ? `Número ${escapar(ofc.numero_exibido)}${ofc.nome_verificado ? ` · ${escapar(ofc.nome_verificado)}` : ""}. ` : ""}Cloud API da Meta. Token e App Secret ficam cifrados e nunca aparecem de novo.</p>
      <div class="campo"><label for="wa-pnid">Phone Number ID</label><input type="text" id="wa-pnid" inputmode="numeric" value="${escapar(ofc.phone_number_id || "")}" autocomplete="off"></div>
      <div class="campo"><label for="wa-waba">WhatsApp Business Account ID</label><input type="text" id="wa-waba" inputmode="numeric" value="${escapar(ofc.waba_id || "")}" autocomplete="off">
        ${of.token_salvo ? '<button class="mini" type="button" id="wa-numeros" style="margin-top:8px">Buscar números desta conta</button><span class="ajuda">Troque o ID da conta acima e busque: o CRM lista os números e preenche o Phone Number ID.</span>' : ""}</div>
      <div id="lista-numeros-wa"></div>
      <div class="campo"><label for="wa-token">Token permanente (usuário do sistema)</label><input type="password" id="wa-token" autocomplete="new-password" placeholder="${salvoOu(of.token_salvo, "EAA...")}"></div>
      <div class="campo"><label for="wa-secret">App Secret</label><input type="password" id="wa-secret" autocomplete="new-password" placeholder="${salvoOu(of.app_secret_salvo, "32 caracteres do app")}"></div>
      ${botoes("wa", of)}
      ${of.existe ? `
      <div class="origem" style="margin-top:14px">
        <p style="margin-bottom:10px">${ofc.webhook_inscrito
          ? "Webhook configurado. As mensagens que chegam no número entram em Conversas."
          : "Falta o webhook: sem ele o CRM envia mas não recebe. O botão abaixo configura na Meta por você, usando o token e o App Secret já salvos."}</p>
        <button class="btn btn-largo btn-fantasma" type="button" data-integ-webhook="wa">${ofc.webhook_inscrito ? "Reconfigurar webhook" : "Configurar webhook na Meta"}</button>
        <p class="ajuda" style="margin-top:8px">Use isso num app dedicado ao CRM. Se o app já envia webhook para outro sistema, o CRM recusa em vez de derrubar.</p>
      </div>
      <details class="manual" style="margin-top:12px"><summary>Preferindo configurar na mão</summary>
        <p>No app da Meta, em WhatsApp, Configuração, cole os dois valores e assine o campo <b>messages</b>.</p>
        <div class="campo"><label>URL de retorno</label>${copiar("wa-url", of.webhook_url)}</div>
        <div class="campo"><label>Token de verificação</label>${copiar("wa-verify", of.verify_token || "")}</div>
      </details>` : ""}
      ${aviso("wa")}
    </div>`;
}

async function carregarIntegracoes() {
  try {
    integracaoWhats = await chamarIntegracoes({ acao: "ver" });
  } catch (err) {
    integracaoWhats = { erroCarga: err.message };
  }
  if (vistaAtual === "config" && abaAjustes === "integracoes") render();
}

const TIPO_POR_PREFIXO = { ng: "whatsapp_nao_oficial", wa: "whatsapp_oficial", mt: "meta" };
const NOME_POR_PREFIXO = { ng: "a NeoGo", wa: "o WhatsApp oficial", mt: "o token da Meta" };

function camposIntegracao(prefixo) {
  const v = (id) => document.getElementById(id)?.value.trim() || "";
  if (prefixo === "ng") return { base_url: v("ng-base"), instance_id: v("ng-inst"), instance_token: v("ng-token") };
  if (prefixo === "mt") return { token: v("mt-token"), ad_account_id: v("mt-conta") };
  return { phone_number_id: v("wa-pnid"), waba_id: v("wa-waba"), token: v("wa-token"), app_secret: v("wa-secret") };
}

function ligarIntegracoes() {
  if (vistaAtual !== "config" || abaAjustes !== "integracoes") return;
  if (!integracaoWhats) { carregarIntegracoes(); return; }

  document.querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(document.getElementById(b.dataset.copiar).textContent); b.textContent = "Copiado"; }
    catch (err) { b.textContent = "Selecione e copie"; }
  }));

  const avisar = (prefixo, msg, tipo) => {
    avisosIntegracao[prefixo] = { msg, tipo: tipo || "" };
    const alvo = document.getElementById("aviso-" + prefixo);
    if (alvo) { alvo.className = "aviso " + (tipo || ""); alvo.textContent = msg; }
  };
  // atualiza só o bloco que mudou, sem perder o que já foi carregado dos outros
  const aplicar = (prefixo, estado) => {
    integracaoWhats = { ...integracaoWhats, [TIPO_POR_PREFIXO[prefixo]]: estado };
    render();
  };

  document.querySelectorAll("[data-integ-salvar]").forEach((b) => b.addEventListener("click", async () => {
    const p = b.dataset.integSalvar;
    b.disabled = true;
    avisar(p, "Salvando...");
    try {
      const estado = await chamarIntegracoes({ acao: "salvar", tipo: TIPO_POR_PREFIXO[p], ...camposIntegracao(p) });
      avisosIntegracao[p] = { msg: "Salvo. Agora clique em Testar conexão.", tipo: "ok" };
      aplicar(p, estado);
    } catch (err) {
      b.disabled = false;
      avisar(p, err.message, "erro");
    }
  }));

  document.querySelectorAll("[data-integ-testar]").forEach((b) => b.addEventListener("click", async () => {
    const p = b.dataset.integTestar;
    b.disabled = true;
    avisar(p, "Testando...");
    try {
      const r = await chamarIntegracoes({ acao: "testar", tipo: TIPO_POR_PREFIXO[p] });
      avisosIntegracao[p] = r.ok
        ? { msg: r.aviso || (p === "mt" ? "Token válido. Os próximos leads de anúncio chegam com os nomes." : "Conectado. Falta conferir o webhook para as mensagens chegarem."), tipo: r.parcial ? "" : "ok" }
        : { msg: r.erro, tipo: "erro" };
      aplicar(p, r.estado || integracaoWhats[TIPO_POR_PREFIXO[p]]);
    } catch (err) {
      b.disabled = false;
      avisar(p, err.message, "erro");
    }
  }));

  document.querySelectorAll("[data-integ-desligar]").forEach((b) => b.addEventListener("click", async () => {
    const p = b.dataset.integDesligar;
    if (!confirm(`Desligar ${NOME_POR_PREFIXO[p]} desta empresa? As credenciais são apagadas. O histórico de conversas fica.`)) return;
    try {
      const estado = await chamarIntegracoes({ acao: "desligar", tipo: TIPO_POR_PREFIXO[p] });
      avisosIntegracao[p] = null;
      aplicar(p, estado);
    } catch (err) {
      avisar(p, err.message, "erro");
    }
  }));

  document.getElementById("wa-numeros")?.addEventListener("click", async (ev) => {
    const alvo = document.getElementById("lista-numeros-wa");
    ev.target.disabled = true;
    alvo.innerHTML = '<div class="aviso">Perguntando para a Meta...</div>';
    try {
      const r = await chamarIntegracoes({ acao: "numeros", tipo: "whatsapp_oficial", waba_id: document.getElementById("wa-waba").value.trim() });
      ev.target.disabled = false;
      if (!r.numeros?.length) { alvo.innerHTML = '<div class="aviso">Essa conta não tem número nenhum ligado.</div>'; return; }
      alvo.innerHTML = `<div class="origem" style="margin-top:4px">${r.numeros.map((n) => `
        <div class="par"><span>${escapar(n.numero || "")}${n.nome ? ` · ${escapar(n.nome)}` : ""}</span>
          <button class="mini" type="button" data-usar-numero="${escapar(n.id)}">Usar este</button></div>`).join("")}</div>`;
      alvo.querySelectorAll("[data-usar-numero]").forEach((botao) => botao.addEventListener("click", () => {
        document.getElementById("wa-pnid").value = botao.dataset.usarNumero;
        alvo.innerHTML = '<div class="aviso ok">Número escolhido. Clique em Salvar e depois em Testar conexão.</div>';
      }));
    } catch (err) {
      ev.target.disabled = false;
      alvo.innerHTML = `<div class="aviso erro">${escapar(err.message)}</div>`;
    }
  });

  document.querySelectorAll("[data-integ-webhook]").forEach((b) => b.addEventListener("click", async () => {
    const p = b.dataset.integWebhook;
    b.disabled = true;
    avisar(p, "Configurando na Meta...");
    try {
      const r = await chamarIntegracoes({ acao: "registrar_webhook", tipo: TIPO_POR_PREFIXO[p] });
      avisosIntegracao[p] = { msg: r.aviso || "Webhook configurado.", tipo: "ok" };
      aplicar(p, r.estado);
    } catch (err) {
      b.disabled = false;
      avisar(p, err.message, "erro");
    }
  }));

  document.getElementById("ng-registrar")?.addEventListener("click", async (ev) => {
    const globalKey = document.getElementById("ng-global").value.trim();
    const slot = Number(document.getElementById("ng-slot").value);
    if (!globalKey) { avisar("ng-webhook", "Informe a Global API Key.", "erro"); return; }
    ev.target.disabled = true;
    avisar("ng-webhook", "Registrando na NeoGo...");
    try {
      const r = await chamarIntegracoes({ acao: "registrar_webhook", tipo: "whatsapp_nao_oficial", global_key: globalKey, slot });
      avisosIntegracao["ng-webhook"] = { msg: `Webhook registrado no slot ${slot}. Mande uma mensagem para o número para ver chegar em Conversas.`, tipo: "ok" };
      aplicar("ng", r.estado);
    } catch (err) {
      ev.target.disabled = false;
      avisar("ng-webhook", err.message, "erro");
    }
  });
}

