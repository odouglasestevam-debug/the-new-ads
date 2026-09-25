/* ---------------- horário de atendimento e transferência ----------------
   O gestor define o horário de cada dia. Dentro dele, quem recebe um lead tem alguns
   minutos para mandar mensagem; se não mandar, o lead passa para o próximo da fila.
   Fora do horário a contagem só começa depois que a empresa abre. Quem faz a conta é o
   banco, a cada minuto: esta tela só configura e mostra. */

const DIAS_SEMANA = [["1", "Segunda"], ["2", "Terça"], ["3", "Quarta"], ["4", "Quinta"],
  ["5", "Sexta"], ["6", "Sábado"], ["0", "Domingo"]];
const NOME_ESTADO = { online: "Online", ocupado: "Ocupado", offline: "Offline" };

let atendimentoAtual = null;
let atendimentoRascunho = null;
let atendimentoCarregando = false;
let atendimentoAviso = "";

const horariosPadrao = () => Object.fromEntries(DIAS_SEMANA.map(([d]) => [d, d === "0" ? null : ["08:00", "20:00"]]));

function rascunhoAtendimento(d) {
  return {
    ativo: !!d.ativo,
    horarios: d.horarios && Object.keys(d.horarios).length ? JSON.parse(JSON.stringify(d.horarios)) : horariosPadrao(),
    minutos_resposta: d.minutos_resposta ?? 10,
    minutos_apos_abertura: d.minutos_apos_abertura ?? 30,
  };
}

async function carregarAtendimento() {
  if (!empresaAtual || !pode.administrar() || atendimentoCarregando) return;
  const id = empresaAtual.id;
  atendimentoCarregando = true;
  const { data, error } = await sb.rpc("crm_obter_atendimento", { p_empresa: id });
  if (empresaAtual?.id !== id) { atendimentoCarregando = false; return; }
  atendimentoCarregando = false;
  if (error || !data) { atendimentoAviso = "Não deu pra carregar: " + (error?.message || "sem dados"); }
  else { atendimentoAtual = data; atendimentoRascunho = rascunhoAtendimento(data); }
  if (vistaAtual === "config" && abaAjustes === "atendimento") render();
}

function painelAtendimento() {
  if (!pode.administrar()) return '<div class="bloco"><p>Só a agência ou o dono da empresa configuram o atendimento.</p></div>';
  if (!atendimentoRascunho) {
    return `<div class="bloco"><h3>Horário de atendimento</h3>
      <p>${atendimentoAviso ? escapar(atendimentoAviso) : "Carregando..."}</p></div>`;
  }
  const r = atendimentoRascunho;
  const a = atendimentoAtual || {};
  const abertura = a.proxima_abertura ? new Date(a.proxima_abertura).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

  const linhas = DIAS_SEMANA.map(([dia, nome]) => {
    const par = r.horarios[dia];
    const aberto = Array.isArray(par) && par.length === 2;
    return `
      <div class="dia-atendimento">
        <label class="check"><input type="checkbox" data-dia-aberto="${dia}" ${aberto ? "checked" : ""}><span>${nome}</span></label>
        <input type="time" data-dia-abre="${dia}" value="${aberto ? escapar(par[0]) : "08:00"}" ${aberto ? "" : "disabled"}>
        <span class="ate">às</span>
        <input type="time" data-dia-fecha="${dia}" value="${aberto ? escapar(par[1]) : "20:00"}" ${aberto ? "" : "disabled"}>
      </div>`;
  }).join("");

  return `
    <div class="bloco">
      <h3>Horário de atendimento
        <span class="selo ${r.ativo ? (a.aberto_agora ? "sim" : "nao") : "nao"}" style="margin-left:8px">${
          !r.ativo ? "desligado" : a.aberto_agora ? "aberto agora" : "fechado agora"}</span></h3>
      <p>Define quando a equipe atende. Fora desse horário o lead espera, e a cobrança começa ${r.minutos_apos_abertura} minutos depois da abertura.${
        !a.aberto_agora && r.ativo && abertura ? ` Próxima abertura: ${escapar(abertura)}.` : ""}</p>
      <label class="check" style="margin-bottom:14px"><input type="checkbox" id="atend-ativo" ${r.ativo ? "checked" : ""}><span>Cobrar prazo de resposta nesta empresa</span></label>
      <div class="dias-atendimento">${linhas}</div>
      <div class="cores" style="grid-template-columns:1fr 1fr;margin-top:16px">
        <div class="campo"><label for="atend-minutos">Minutos para começar o atendimento</label>
          <input type="number" id="atend-minutos" min="1" max="240" value="${r.minutos_resposta}"></div>
        <div class="campo"><label for="atend-apos">Minutos após a abertura (lead da madrugada)</label>
          <input type="number" id="atend-apos" min="0" max="240" value="${r.minutos_apos_abertura}"></div>
      </div>
      <p class="ajuda">Começar o atendimento é mandar mensagem para o lead. Quem não mandar dentro do prazo perde o lead para o próximo da fila, e o CRM avisa quem receber.</p>
      <button class="btn btn-largo" type="button" id="atend-salvar" style="margin-top:12px">Salvar horário</button>
      <div class="aviso" id="aviso-atendimento">${atendimentoAviso ? escapar(atendimentoAviso) : ""}</div>
      ${a.aguardando ? `<p class="ajuda">${a.aguardando} ${a.aguardando === 1 ? "lead aguardando primeira resposta" : "leads aguardando primeira resposta"} agora.</p>` : ""}
    </div>`;
}

function ligarAtendimento() {
  if (vistaAtual !== "config" || abaAjustes !== "atendimento") return;
  if (!atendimentoRascunho && !atendimentoCarregando && !atendimentoAviso) { carregarAtendimento(); return; }
  const r = atendimentoRascunho;
  if (!r) return;

  document.querySelectorAll("[data-dia-aberto]").forEach((c) => c.addEventListener("change", () => {
    const dia = c.dataset.diaAberto;
    const abre = document.querySelector(`[data-dia-abre="${dia}"]`).value || "08:00";
    const fecha = document.querySelector(`[data-dia-fecha="${dia}"]`).value || "20:00";
    r.horarios[dia] = c.checked ? [abre, fecha] : null;
    render();
  }));
  document.querySelectorAll("[data-dia-abre],[data-dia-fecha]").forEach((i) => i.addEventListener("change", () => {
    const dia = i.dataset.diaAbre || i.dataset.diaFecha;
    r.horarios[dia] = [document.querySelector(`[data-dia-abre="${dia}"]`).value,
                       document.querySelector(`[data-dia-fecha="${dia}"]`).value];
  }));
  document.getElementById("atend-ativo")?.addEventListener("change", (e) => { r.ativo = e.target.checked; render(); });

  document.getElementById("atend-salvar")?.addEventListener("click", async (ev) => {
    const aviso = document.getElementById("aviso-atendimento");
    r.minutos_resposta = Number(document.getElementById("atend-minutos").value) || 10;
    r.minutos_apos_abertura = Number(document.getElementById("atend-apos").value);
    if (Number.isNaN(r.minutos_apos_abertura)) r.minutos_apos_abertura = 30;

    const invalido = Object.entries(r.horarios).find(([, par]) => Array.isArray(par) && par[0] >= par[1]);
    if (invalido) { aviso.className = "aviso erro"; aviso.textContent = "O horário de fechar precisa ser depois do de abrir."; return; }
    if (r.ativo && !Object.values(r.horarios).some((par) => Array.isArray(par))) {
      aviso.className = "aviso erro"; aviso.textContent = "Marque pelo menos um dia de atendimento."; return;
    }

    ev.target.disabled = true;
    aviso.className = "aviso";
    aviso.textContent = "Salvando...";
    const { data, error } = await sb.rpc("crm_salvar_atendimento", {
      p_empresa: empresaAtual.id, p_ativo: r.ativo, p_horarios: r.horarios,
      p_minutos_resposta: r.minutos_resposta, p_minutos_apos_abertura: r.minutos_apos_abertura,
      p_revisao: atendimentoAtual?.revisao ?? 0,
    });
    if (error) {
      atendimentoAviso = error.message.includes("configuracao_alterada")
        ? "Outra pessoa salvou antes de você. Recarreguei os dados: confira e salve de novo."
        : "Não deu pra salvar: " + error.message;
      if (error.message.includes("configuracao_alterada")) await carregarAtendimento();
      render();
      return;
    }
    atendimentoAtual = data;
    atendimentoRascunho = rascunhoAtendimento(data);
    atendimentoAviso = "Horário salvo.";
    render();
  });
}

/* ---------------- transferir o atendimento ---------------- */
let atendentesEmpresa = { empresa: null, lista: null, carregando: false };

async function garantirAtendentes(aoCarregar) {
  if (!empresaAtual) return;
  if (atendentesEmpresa.empresa === empresaAtual.id && atendentesEmpresa.lista) return;
  if (atendentesEmpresa.carregando) return;
  atendentesEmpresa = { empresa: empresaAtual.id, lista: null, carregando: true };
  const { data } = await sb.rpc("crm_atendentes", { p_empresa: empresaAtual.id });
  atendentesEmpresa = { empresa: empresaAtual.id, lista: data || [], carregando: false };
  aoCarregar?.();
}

function blocoTransferir(l) {
  if (!pode.editarLead(l)) return "";
  const lista = (atendentesEmpresa.lista || []).filter((a) => a.user_id !== l.responsavel_id);
  if (!atendentesEmpresa.lista) return '<div class="grupo"><h3>Transferir atendimento</h3><p class="ajuda">Carregando a equipe...</p></div>';
  if (!lista.length) return '<div class="grupo"><h3>Transferir atendimento</h3><p class="ajuda">Não há outra pessoa para receber este lead nesta empresa.</p></div>';
  return `
    <div class="grupo">
      <h3>Transferir atendimento</h3>
      <p class="ajuda">A pessoa recebe a notificação na hora e o prazo de resposta recomeça para ela.</p>
      <div class="campo"><label for="transf-para">Passar para</label>
        <select id="transf-para">
          ${lista.map((a) => `<option value="${a.user_id}">${escapar((a.nome || a.email || "").split("@")[0])} · ${NOME_ESTADO[a.estado] || a.estado}</option>`).join("")}
        </select></div>
      <button class="ver-lead" type="button" id="transf-fazer">Transferir</button>
      <div class="aviso" id="aviso-transf"></div>
    </div>`;
}

function ligarTransferir(raiz, l, aoMudar) {
  garantirAtendentes(aoMudar);
  const botao = raiz.querySelector("#transf-fazer");
  if (!botao) return;
  botao.addEventListener("click", async () => {
    const destino = raiz.querySelector("#transf-para").value;
    const aviso = raiz.querySelector("#aviso-transf");
    botao.disabled = true;
    aviso.className = "aviso";
    aviso.textContent = "Transferindo...";
    const { error } = await sb.rpc("crm_transferir_lead", { p_lead: l.id, p_para: destino });
    if (error) {
      botao.disabled = false;
      aviso.className = "aviso erro";
      aviso.textContent = error.message.includes("sem_permissao") ? "Você não pode transferir este lead."
        : error.message.includes("destino_invalido") ? "Escolha outra pessoa da equipe."
        : "Não deu pra transferir: " + error.message;
      return;
    }
    l.responsavel_id = destino;
    await carregarTudo();
    aoMudar?.();
  });
}
