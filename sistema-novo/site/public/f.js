/* Formulário do CRM The New Ads.
   Uso no site do cliente:
     <script src="https://crm.thenewads.com.br/f.js" data-form="CHAVE" async></script>
   O formulário aparece no lugar do script, com a fonte e as cores do botão do site.
   Colado em todas as páginas (mesmo sem data-form), só guarda as UTMs da visita. */
(function () {
  "use strict";
  var API = "https://xrvjlhseyqfgyvwwlwwb.supabase.co/functions/v1/form";
  var CHAVE_ORIGEM = "tna_crm_origem";
  var VALIDADE_ORIGEM = 30 * 24 * 3600 * 1000;
  var PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_placement", "ad_id", "fbclid", "gclid"];

  /* ---------- origem: última visita com parâmetro vale por 30 dias ---------- */
  function lerStorage() {
    try { return JSON.parse(localStorage.getItem(CHAVE_ORIGEM) || "null"); } catch (e) { return null; }
  }
  function capturarOrigem() {
    var p = new URLSearchParams(location.search);
    var achou = {};
    var tem = false;
    PARAMS.forEach(function (k) {
      var v = p.get(k) || (k === "utm_placement" ? p.get("posicionamento") : null);
      if (v) { achou[k] = v; tem = true; }
    });
    if (!tem) return;
    achou.referrer = document.referrer || "";
    achou.ts = Date.now();
    try { localStorage.setItem(CHAVE_ORIGEM, JSON.stringify(achou)); } catch (e) {}
  }
  function origemAtual() {
    var salva = lerStorage();
    var o = salva && Date.now() - (salva.ts || 0) < VALIDADE_ORIGEM ? salva : {};
    var saida = {};
    PARAMS.forEach(function (k) { if (o[k]) saida[k] = String(o[k]); });
    saida.referrer = o.referrer || document.referrer || "";
    saida.pagina_url = location.href;
    return saida;
  }
  capturarOrigem();

  /* ---------- leitura da identidade visual do site ---------- */
  function rgba(texto) {
    var m = String(texto || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (x) { return parseFloat(x); });
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function luminancia(c) {
    function canal(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
  }
  function saturacao(c) {
    var max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    return max === 0 ? 0 : (max - min) / max;
  }
  function fundoDe(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
    }
    var b = rgba(getComputedStyle(document.body).backgroundColor);
    return b && b.a > 0.5 ? b : { r: 255, g: 255, b: 255, a: 1 };
  }
  function botaoDoSite(host) {
    var seletor = "button, input[type=submit], input[type=button], a.button, a.btn, .btn, .button, [class*='btn'], " +
      ".elementor-button, .wp-block-button__link, .wp-element-button, [role=button]";
    var melhor = null, melhorNota = -1;
    var lista = document.querySelectorAll(seletor);
    for (var i = 0; i < lista.length && i < 200; i++) {
      var el = lista[i];
      if (host.contains(el) || el.closest("[data-tna-crm-form]")) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 24) continue;
      var st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none") continue;
      var fundo = rgba(st.backgroundColor);
      if (!fundo || fundo.a < 0.6) continue;
      // Botão principal costuma ser o mais colorido; tamanho desempata.
      var nota = saturacao(fundo) * 10 + Math.min(r.width * r.height, 40000) / 40000;
      if (nota > melhorNota) { melhorNota = nota; melhor = { fundo: st.backgroundColor, texto: st.color, raio: st.borderRadius }; }
    }
    return melhor;
  }
  function visualFinal(host, visual) {
    visual = visual || {};
    var fundo = fundoDe(host.parentElement || document.body);
    var escuroAuto = luminancia(fundo) < 0.4;
    var tema = visual.tema === "escuro" ? true : visual.tema === "claro" ? false : escuroAuto;
    var botao = botaoDoSite(host) || {};
    var manual = visual.modo === "manual";
    return {
      escuro: tema,
      corBotao: (manual && visual.cor_botao) || botao.fundo || (tema ? "#ffffff" : "#111111"),
      corTextoBotao: (manual && visual.cor_texto_botao) || botao.texto || (tema ? "#111111" : "#ffffff"),
      raio: (manual && visual.raio != null && visual.raio !== "") ? visual.raio + "px" : (botao.raio || "8px"),
      fonte: getComputedStyle(host.parentElement || document.body).fontFamily,
      corTexto: getComputedStyle(host.parentElement || document.body).color,
    };
  }

  /* ---------- desenho ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mascaraTelefone(v) {
    var d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }

  function css(v) {
    var borda = v.escuro ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.18)";
    var campo = v.escuro ? "rgba(255,255,255,.06)" : "#ffffff";
    var apoio = v.escuro ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.6)";
    return ":host{all:initial;display:block;font-family:" + v.fonte + ";color:" + v.corTexto + "}" +
      "*{box-sizing:border-box;font-family:inherit}" +
      "form{display:flex;flex-direction:column;gap:14px;width:100%;max-width:520px;margin:0 auto}" +
      "h3{margin:0;font-size:1.35em;line-height:1.25;color:inherit}" +
      ".sub{margin:-6px 0 2px;font-size:.95em;color:" + apoio + ";line-height:1.45}" +
      "label{display:flex;flex-direction:column;gap:6px;font-size:.92em;font-weight:600;color:inherit}" +
      ".obr{color:" + apoio + ";font-weight:400}" +
      "input,select,textarea{width:100%;font-size:16px;padding:12px 14px;border:1px solid " + borda + ";border-radius:" + v.raio +
      ";background:" + campo + ";color:inherit;outline:none;transition:border-color .15s,box-shadow .15s}" +
      "select option{color:#111}" +
      "textarea{min-height:90px;resize:vertical}" +
      "input:focus,select:focus,textarea:focus{border-color:" + v.corBotao + ";box-shadow:0 0 0 3px color-mix(in srgb," + v.corBotao + " 25%,transparent)}" +
      "[aria-invalid=true]{border-color:#e5484d}" +
      "fieldset{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}" +
      "legend{font-size:.92em;font-weight:600;margin-bottom:6px;padding:0}" +
      ".opcao{flex-direction:row;align-items:center;gap:10px;font-weight:400}" +
      ".opcao input{width:18px;height:18px;margin:0;accent-color:" + v.corBotao + "}" +
      "button{font-size:1em;font-weight:700;padding:14px 18px;border:0;border-radius:" + v.raio + ";background:" + v.corBotao +
      ";color:" + v.corTextoBotao + ";cursor:pointer;transition:opacity .15s}" +
      "button:hover{opacity:.9}button:disabled{opacity:.6;cursor:wait}" +
      ".erro{color:#e5484d;font-size:.88em;font-weight:500;min-height:1em;margin:0}" +
      ".ok{padding:18px;border:1px solid " + borda + ";border-radius:" + v.raio + ";line-height:1.5}" +
      ".isca{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}";
  }

  function campoExtra(c, i) {
    var id = "c" + i;
    var obr = c.obrigatorio ? " required" : "";
    var marca = c.obrigatorio ? "" : ' <span class="obr">(opcional)</span>';
    var titulo = "<span>" + esc(c.rotulo) + marca + "</span>";
    var opcoes = Array.isArray(c.opcoes) ? c.opcoes : [];
    if (c.tipo === "selecao") {
      return '<label>' + titulo + '<select name="' + esc(c.id) + '"' + obr + '><option value="">Selecione</option>' +
        opcoes.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join("") + "</select></label>";
    }
    if (c.tipo === "opcoes" || c.tipo === "multipla") {
      var tipo = c.tipo === "opcoes" ? "radio" : "checkbox";
      return '<fieldset data-grupo="' + esc(c.id) + '"' + (c.obrigatorio ? ' data-obrigatorio="1"' : "") + '><legend>' + esc(c.rotulo) + marca + "</legend>" +
        opcoes.map(function (o, j) {
          return '<label class="opcao"><input type="' + tipo + '" name="' + esc(c.id) + '" value="' + esc(o) + '" id="' + id + "_" + j + '">' + esc(o) + "</label>";
        }).join("") + "</fieldset>";
    }
    if (c.tipo === "paragrafo") {
      return '<label>' + titulo + '<textarea name="' + esc(c.id) + '"' + obr + ' maxlength="2000"></textarea></label>';
    }
    return '<label>' + titulo + '<input type="text" name="' + esc(c.id) + '"' + obr + ' maxlength="300"></label>';
  }

  function render(host, config, opcoes) {
    opcoes = opcoes || {};
    host.setAttribute("data-tna-crm-form", "1");
    var raiz = host.shadowRoot || host.attachShadow({ mode: "open" });
    var v = visualFinal(host, config.visual);
    var emailModo = config.email || "opcional";
    var inicio = Date.now();

    raiz.innerHTML = "<style>" + css(v) + "</style>" +
      '<form novalidate>' +
      (config.titulo ? "<h3>" + esc(config.titulo) + "</h3>" : "") +
      (config.subtitulo ? '<p class="sub">' + esc(config.subtitulo) + "</p>" : "") +
      '<label><span>Nome</span><input type="text" name="nome" autocomplete="name" required maxlength="150"></label>' +
      '<label><span>WhatsApp</span><input type="tel" name="telefone" autocomplete="tel-national" inputmode="tel" placeholder="(11) 99999-9999" required></label>' +
      (emailModo !== "oculto" ? '<label><span>E-mail' + (emailModo === "obrigatorio" ? "" : ' <span class="obr">(opcional)</span>') + "</span>" +
        '<input type="email" name="email" autocomplete="email"' + (emailModo === "obrigatorio" ? " required" : "") + ' maxlength="200"></label>' : "") +
      (config.campos || []).map(campoExtra).join("") +
      '<div class="isca" aria-hidden="true"><input type="text" name="empresa_site" tabindex="-1" autocomplete="off"></div>' +
      '<p class="erro" role="alert"></p>' +
      '<button type="submit">' + esc(config.botao || "Enviar") + "</button>" +
      "</form>";

    var form = raiz.querySelector("form");
    var erro = raiz.querySelector(".erro");
    var tel = form.elements.telefone;
    tel.addEventListener("input", function () { tel.value = mascaraTelefone(tel.value); });

    function falhar(msg, campo) {
      erro.textContent = msg;
      var alvo = campo && (form.querySelector('[name="' + campo + '"]'));
      if (alvo) { alvo.setAttribute("aria-invalid", "true"); alvo.focus(); }
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      erro.textContent = "";
      Array.prototype.forEach.call(form.querySelectorAll("[aria-invalid]"), function (el) { el.removeAttribute("aria-invalid"); });

      var nome = form.elements.nome.value.trim();
      var digitos = tel.value.replace(/\D/g, "");
      var email = form.elements.email ? form.elements.email.value.trim() : "";
      if (!nome) return falhar("Informe seu nome.", "nome");
      if (digitos.length < 10) return falhar("Informe seu WhatsApp com DDD.", "telefone");
      if (emailModo === "obrigatorio" && !email) return falhar("Informe seu e-mail.", "email");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return falhar("E-mail inválido.", "email");

      var respostas = {};
      var campos = config.campos || [];
      for (var i = 0; i < campos.length; i++) {
        var c = campos[i];
        var valor;
        if (c.tipo === "multipla") {
          valor = Array.prototype.map.call(form.querySelectorAll('[name="' + c.id + '"]:checked'), function (x) { return x.value; });
        } else if (c.tipo === "opcoes") {
          var marcado = form.querySelector('[name="' + c.id + '"]:checked');
          valor = marcado ? marcado.value : "";
        } else {
          valor = (form.querySelector('[name="' + c.id + '"]') || {}).value || "";
        }
        var vazio = Array.isArray(valor) ? !valor.length : !String(valor).trim();
        if (c.obrigatorio && vazio) return falhar("Responda: " + c.rotulo, c.id);
        respostas[c.id] = valor;
      }

      if (opcoes.preview) {
        erro.textContent = "";
        raiz.querySelector("button").textContent = "Pré-visualização: nada foi enviado";
        return;
      }

      var botao = raiz.querySelector("button");
      botao.disabled = true;
      var rotuloBotao = botao.textContent;
      botao.textContent = "Enviando...";

      fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          k: opcoes.chave, nome: nome, telefone: digitos, email: email, respostas: respostas,
          origem: origemAtual(), tempo_ms: Date.now() - inicio, empresa_site: form.elements.empresa_site.value,
        }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, dados: d }; });
      }).then(function (res) {
        if (res.status !== 200 || !res.dados.ok) {
          botao.disabled = false;
          botao.textContent = rotuloBotao;
          return falhar(res.dados.erro || "Não conseguimos enviar agora. Tente de novo.", res.dados.campo);
        }
        try { (window.dataLayer = window.dataLayer || []).push({ event: "tna_crm_lead", formulario: opcoes.chave }); } catch (err) {}
        if (res.dados.redirect) { location.href = res.dados.redirect; return; }
        raiz.innerHTML = "<style>" + css(v) + '</style><div class="ok" role="status">' + esc(config.sucesso) + "</div>";
      }).catch(function () {
        botao.disabled = false;
        botao.textContent = rotuloBotao;
        falhar("Sem conexão. Verifique a internet e tente de novo.");
      });
    });
  }

  function montar(host, chave) {
    if (host.getAttribute("data-tna-crm-form")) return;
    host.setAttribute("data-tna-crm-form", "carregando");
    fetch(API + "?k=" + encodeURIComponent(chave)).then(function (r) {
      if (!r.ok) throw new Error("form");
      return r.json();
    }).then(function (config) {
      host.removeAttribute("data-tna-crm-form");
      render(host, config, { chave: chave });
    }).catch(function () {
      host.removeAttribute("data-tna-crm-form");
    });
  }

  window.TNACRMForm = { render: render, origemAtual: origemAtual };

  var atual = document.currentScript;
  if (atual && atual.getAttribute("data-form")) {
    var host = document.createElement("div");
    atual.parentNode.insertBefore(host, atual);
    montar(host, atual.getAttribute("data-form"));
  }
  function montarDivs() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-tna-form]"), function (el) {
      montar(el, el.getAttribute("data-tna-form"));
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montarDivs);
  else montarDivs();
})();
