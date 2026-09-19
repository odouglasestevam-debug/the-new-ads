/* ---------------- formulários ---------------- */
const URL_SCRIPT_FORM = "https://crm.thenewads.com.br/f.js";
const TIPOS_CAMPO = { texto: "Texto curto", paragrafo: "Texto longo", selecao: "Lista de seleção", opcoes: "Escolha única", multipla: "Múltipla escolha" };

function configPadrao() {
  return {
    titulo: "Fale com a nossa equipe",
    subtitulo: "Preencha e entramos em contato pelo WhatsApp.",
    botao: "Quero ser atendido",
    redirect_url: "",
    sucesso: "Recebemos seus dados. Em breve entraremos em contato.",
    email: "opcional",
    campos: [],
    visual: { modo: "auto", tema: "auto", cor_botao: "#111111", cor_texto_botao: "#ffffff", raio: 8 },
  };
}

function codigoFormulario(f) {
  return `<script src="${URL_SCRIPT_FORM}" data-form="${f.chave}" async><\/script>`;
}

function leadsDoFormulario(f) {
  return leads.filter((l) => (l.lead_origens || []).some((o) => o.formulario_id === f.id)).length;
}

function vistaFormularios() {
  const cartoes = formularios.map((f) => `
    <div class="bloco">
      <h3>${escapar(f.nome)} ${f.ativo ? '<span class="selo sim" style="margin-left:6px">ativo</span>' : '<span class="selo nao" style="margin-left:6px">desativado</span>'}</h3>
      <p>${leadsDoFormulario(f)} lead(s) recebido(s)${f.config?.redirect_url ? ` · envia para ${escapar(f.config.redirect_url)}` : " · sem redirect, mostra mensagem"}</p>
      <code class="codigo">${escapar(codigoFormulario(f))}</code>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" type="button" data-editar-form="${f.id}">Editar</button>
        <button class="btn btn-fantasma" type="button" data-copiar-form="${f.id}">Copiar código</button>
      </div>
    </div>`).join("");

  return `
    <div class="topo">
      <div><h1>Formulários</h1><div class="desc">Formulários para colar no site de ${escapar(empresaAtual.nome)}. Os leads entram aqui com a tag Site e as UTMs.</div></div>
      <div class="ferramentas"><button class="btn" id="btn-novo-form" type="button">Novo formulário</button></div>
    </div>
    ${formularios.length ? `<div class="lista-forms">${cartoes}</div>`
      : '<div class="tabela-caixa"><div class="vazio-geral">Nenhum formulário ainda. Crie o primeiro e cole o código no site do cliente.</div></div>'}
    <div class="bloco" style="margin-top:18px">
      <h3>Como instalar</h3>
      <p>Cole o código no lugar onde o formulário deve aparecer: bloco HTML no WordPress, widget HTML no Elementor, embed no Webflow ou Wix. O formulário copia a fonte e a cor do botão principal do site sozinho.</p>
      <p style="margin-bottom:0">Para não perder a origem de quem entra por uma página e preenche em outra, cole também <code class="codigo" style="display:inline;padding:2px 6px">&lt;script src="${URL_SCRIPT_FORM}" async&gt;&lt;/script&gt;</code> no cabeçalho de todas as páginas. Sem o data-form ele só guarda as UTMs.</p>
    </div>`;
}

function vistaEditorFormulario() {
  const f = formEditando;
  const c = f.config;
  const v = c.visual;
  const campos = c.campos.map((campo, i) => `
    <div class="campo-extra">
      <div class="linha">
        <div class="campo" style="margin:0"><label>Pergunta</label><input type="text" data-campo="${i}" data-prop="rotulo" value="${escapar(campo.rotulo)}"></div>
        <div class="campo" style="margin:0"><label>Tipo</label>
          <select data-campo="${i}" data-prop="tipo">${Object.entries(TIPOS_CAMPO).map(([id, nome]) => `<option value="${id}"${campo.tipo === id ? " selected" : ""}>${nome}</option>`).join("")}</select></div>
      </div>
      ${["selecao", "opcoes", "multipla"].includes(campo.tipo) ? `
        <div class="campo" style="margin:10px 0 0"><label>Opções (uma por linha)</label>
          <textarea rows="3" data-campo="${i}" data-prop="opcoes">${escapar((campo.opcoes || []).join("\n"))}</textarea></div>` : ""}
      <div class="acoes">
        <label class="check" style="margin-right:auto"><input type="checkbox" data-campo="${i}" data-prop="obrigatorio"${campo.obrigatorio ? " checked" : ""}> Obrigatória</label>
        <button class="mini" type="button" data-mover="${i}" data-dir="-1"${i === 0 ? " disabled" : ""}>Subir</button>
        <button class="mini" type="button" data-mover="${i}" data-dir="1"${i === c.campos.length - 1 ? " disabled" : ""}>Descer</button>
        <button class="mini" type="button" data-remover-campo="${i}">Remover</button>
      </div>
    </div>`).join("");

  return `
    <div class="topo">
      <div><h1>${f.id ? "Editar formulário" : "Novo formulário"}</h1><div class="desc">${escapar(empresaAtual.nome)}. As mudanças valem para o site assim que salvar.</div></div>
      <div class="ferramentas">
        <button class="btn btn-fantasma" id="form-cancelar" type="button">Voltar</button>
        <button class="btn" id="form-salvar" type="button">Salvar</button>
      </div>
    </div>
    <div class="aviso" id="aviso-form" style="margin:-10px 0 14px"></div>

    <div class="editor-form">
      <div>
        <div class="bloco" style="margin-bottom:14px">
          <h3>Básico</h3>
          <div class="campo"><label for="ff-nome">Nome interno</label><input type="text" id="ff-nome" data-raiz="nome" value="${escapar(f.nome)}" placeholder="Ex: Landing implante"></div>
          <label class="check"><input type="checkbox" data-raiz="ativo"${f.ativo ? " checked" : ""}> Formulário ativo (desativado some do site)</label>
        </div>

        <div class="bloco" style="margin-bottom:14px">
          <h3>Textos</h3>
          <div class="campo"><label>Título</label><input type="text" data-cfg="titulo" value="${escapar(c.titulo)}"></div>
          <div class="campo"><label>Subtítulo</label><input type="text" data-cfg="subtitulo" value="${escapar(c.subtitulo)}"></div>
          <div class="campo"><label>Texto do botão</label><input type="text" data-cfg="botao" value="${escapar(c.botao)}"></div>
        </div>

        <div class="bloco" style="margin-bottom:14px">
          <h3>Depois de enviar</h3>
          <p>Para onde a pessoa vai depois de enviar. Use a página de obrigado do cliente, onde fica o evento de conversão.</p>
          <div class="campo"><label>URL de redirect</label><input type="url" data-cfg="redirect_url" value="${escapar(c.redirect_url)}" placeholder="https://site-do-cliente.com.br/obrigado"></div>
          <div class="campo"><label>Mensagem se não houver redirect</label><input type="text" data-cfg="sucesso" value="${escapar(c.sucesso)}"></div>
        </div>

        <div class="bloco" style="margin-bottom:14px">
          <h3>Campos</h3>
          <p>Nome e WhatsApp são sempre obrigatórios, assim nenhum lead do site nasce com cadastro incompleto.</p>
          <div class="campo"><label>E-mail</label>
            <select data-cfg="email">
              ${[["opcional", "Opcional"], ["obrigatorio", "Obrigatório"], ["oculto", "Não pedir"]].map(([id, nome]) => `<option value="${id}"${c.email === id ? " selected" : ""}>${nome}</option>`).join("")}
            </select></div>
          ${campos}
          <button class="btn btn-largo btn-fantasma" id="add-campo" type="button">Adicionar pergunta</button>
        </div>

        <div class="bloco" style="margin-bottom:14px">
          <h3>Visual</h3>
          <p>No automático o formulário usa a fonte do site e copia a cor e o arredondamento do botão principal da página.</p>
          <div class="campo"><label>Cores do botão</label>
            <select data-visual="modo">
              <option value="auto"${v.modo !== "manual" ? " selected" : ""}>Automático, copiar do site</option>
              <option value="manual"${v.modo === "manual" ? " selected" : ""}>Definir manualmente</option>
            </select></div>
          ${v.modo === "manual" ? `
          <div class="cores">
            <div class="campo"><label>Botão</label><input type="color" data-visual="cor_botao" value="${escapar(v.cor_botao || "#111111")}"></div>
            <div class="campo"><label>Texto do botão</label><input type="color" data-visual="cor_texto_botao" value="${escapar(v.cor_texto_botao || "#ffffff")}"></div>
            <div class="campo"><label>Borda (px)</label><input type="number" min="0" max="40" data-visual="raio" value="${escapar(v.raio ?? 8)}"></div>
          </div>` : ""}
          <div class="campo"><label>Fundo onde vai ficar</label>
            <select data-visual="tema">
              ${[["auto", "Detectar pela página"], ["claro", "Fundo claro"], ["escuro", "Fundo escuro"]].map(([id, nome]) => `<option value="${id}"${(v.tema || "auto") === id ? " selected" : ""}>${nome}</option>`).join("")}
            </select></div>
        </div>

        ${f.chave ? `
        <div class="bloco">
          <h3>Código para o site</h3>
          <code class="codigo">${escapar(codigoFormulario(f))}</code>
          <button class="btn btn-largo btn-fantasma" type="button" data-copiar-form="${f.id}">Copiar código</button>
        </div>` : ""}
      </div>

      <div class="previa">
        <div class="previa-barra">
          <span class="num">Pré-visualização em um site de exemplo</span>
          <select id="previa-fundo" style="width:auto;padding:8px 10px;font-size:13px">
            <option value="claro">Site claro</option>
            <option value="escuro">Site escuro</option>
          </select>
        </div>
        <iframe id="previa-form" title="Pré-visualização do formulário"></iframe>
      </div>
    </div>`;
}

let fundoPrevia = "claro";
function atualizarPrevia() {
  const iframe = document.getElementById("previa-form");
  if (!iframe || !formEditando) return;
  const escuro = fundoPrevia === "escuro";
  // Site de exemplo com botão próprio, para a detecção automática ter o que copiar.
  const site = escuro
    ? { fundo: "#101418", texto: "#f1f5f9", botao: "#22c55e", textoBotao: "#052e16", raio: "999px", fonte: "Georgia, serif" }
    : { fundo: "#f7f4ef", texto: "#1f2937", botao: "#1d4ed8", textoBotao: "#ffffff", raio: "6px", fonte: "Arial, Helvetica, sans-serif" };
  const config = escapar(JSON.stringify(formEditando.config));
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{margin:0;padding:28px;background:${site.fundo};color:${site.texto};font-family:${site.fonte}}
    .site-botao{display:inline-block;background:${site.botao};color:${site.textoBotao};border-radius:${site.raio};padding:10px 18px;font-weight:700;border:0;margin-bottom:22px}</style>
    </head><body><button class="site-botao">Botão do site</button><div id="alvo" data-preview-config="${config}"></div>
    <script src="/f.js"><\/script>
    <script src="/js/form-preview.js"><\/script>
    </body></html>`;
}

function ligarFormularios() {
  const novoForm = document.getElementById("btn-novo-form");
  if (novoForm) novoForm.addEventListener("click", () => {
    formEditando = { id: null, nome: "", ativo: true, config: configPadrao() };
    render();
  });

  document.querySelectorAll("[data-editar-form]").forEach((b) => b.addEventListener("click", () => {
    const f = formularios.find((x) => x.id === b.dataset.editarForm);
    const base = configPadrao();
    formEditando = JSON.parse(JSON.stringify({ ...f, config: { ...base, ...f.config, visual: { ...base.visual, ...(f.config?.visual || {}) } } }));
    render();
  }));

  document.querySelectorAll("[data-copiar-form]").forEach((b) => b.addEventListener("click", async () => {
    const f = formularios.find((x) => x.id === b.dataset.copiarForm);
    try { await navigator.clipboard.writeText(codigoFormulario(f)); b.textContent = "Copiado"; }
    catch (err) { b.textContent = "Selecione o código acima"; }
  }));

  if (!formEditando || !document.getElementById("previa-form")) return;
  const f = formEditando;
  const c = f.config;

  // Campos de texto só atualizam a prévia; mudanças de estrutura redesenham o editor.
  let espera;
  const previaDepois = () => { clearTimeout(espera); espera = setTimeout(atualizarPrevia, 350); };

  document.querySelectorAll("[data-raiz]").forEach((el) => el.addEventListener(el.type === "checkbox" ? "change" : "input", () => {
    f[el.dataset.raiz] = el.type === "checkbox" ? el.checked : el.value;
  }));
  document.querySelectorAll("[data-cfg]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
    c[el.dataset.cfg] = el.value;
    previaDepois();
  }));
  document.querySelectorAll("[data-visual]").forEach((el) => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
    c.visual[el.dataset.visual] = el.type === "number" ? Number(el.value) : el.value;
    if (el.dataset.visual === "modo") render(); else previaDepois();
  }));
  document.querySelectorAll("[data-campo]").forEach((el) => {
    const evento = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evento, () => {
      const campo = c.campos[Number(el.dataset.campo)];
      const prop = el.dataset.prop;
      if (prop === "obrigatorio") campo.obrigatorio = el.checked;
      else if (prop === "opcoes") campo.opcoes = el.value.split("\n").map((x) => x.trim()).filter(Boolean);
      else campo[prop] = el.value;
      if (prop === "tipo") render(); else previaDepois();
    });
  });

  document.getElementById("add-campo").addEventListener("click", () => {
    c.campos.push({ id: "p" + Date.now().toString(36), rotulo: "Nova pergunta", tipo: "texto", obrigatorio: false, opcoes: [] });
    render();
  });
  document.querySelectorAll("[data-remover-campo]").forEach((b) => b.addEventListener("click", () => {
    c.campos.splice(Number(b.dataset.removerCampo), 1);
    render();
  }));
  document.querySelectorAll("[data-mover]").forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.mover), j = i + Number(b.dataset.dir);
    [c.campos[i], c.campos[j]] = [c.campos[j], c.campos[i]];
    render();
  }));

  const seletorFundo = document.getElementById("previa-fundo");
  seletorFundo.value = fundoPrevia;
  seletorFundo.addEventListener("change", () => { fundoPrevia = seletorFundo.value; atualizarPrevia(); });

  document.getElementById("form-cancelar").addEventListener("click", () => {
    if (!confirm("Voltar sem salvar as mudanças?")) return;
    formEditando = null;
    render();
  });

  document.getElementById("form-salvar").addEventListener("click", async () => {
    const aviso = document.getElementById("aviso-form");
    const falha = (msg) => { aviso.className = "aviso erro"; aviso.textContent = msg; window.scrollTo(0, 0); };
    if (!String(f.nome).trim()) return falha("Dê um nome interno ao formulário.");
    if (c.redirect_url && !/^https:\/\/[^\s]+\.[^\s]+/.test(c.redirect_url)) return falha("O redirect precisa ser um endereço completo começando com https://");
    for (const campo of c.campos) {
      if (!String(campo.rotulo).trim()) return falha("Toda pergunta precisa de um texto.");
      if (["selecao", "opcoes", "multipla"].includes(campo.tipo) && !(campo.opcoes || []).length) {
        return falha(`A pergunta "${campo.rotulo}" precisa de pelo menos uma opção.`);
      }
      if (campo.tipo === "texto" || campo.tipo === "paragrafo") campo.opcoes = [];
    }
    const dados = { nome: String(f.nome).trim(), ativo: !!f.ativo, config: c };
    const res = f.id
      ? await sb.from("formularios").update(dados).eq("id", f.id).select().single()
      : await sb.from("formularios").insert({ ...dados, empresa_id: empresaAtual.id }).select().single();
    if (res.error) return falha("Não deu pra salvar: " + res.error.message);
    await carregarTudo();
    formEditando = null;
    render();
  });

  atualizarPrevia();
}
