/* ---------------- dados ---------------- */
async function carregarTudo() {
  const empresaId = empresaAtual.id;
  const [resLeads, resNotas, resEquipe, resForms, resConversas, resCanais] = await Promise.all([
    sb.from("leads").select("*, lead_origens(*)").eq("empresa_id", empresaAtual.id).order("criado_em", { ascending: false }),
    sb.from("lead_notas").select("*").eq("empresa_id", empresaAtual.id).order("criado_em", { ascending: false }),
    sb.rpc("membros_da_empresa", { p_empresa: empresaAtual.id }),
    sb.from("formularios").select("*").eq("empresa_id", empresaAtual.id).order("criado_em"),
    sb.from("conversas").select("*").eq("empresa_id", empresaAtual.id).order("ultima_mensagem_em", { ascending: false }),
    sb.rpc("canais_whatsapp", { p_empresa: empresaAtual.id }),
  ]);
  if (empresaAtual?.id !== empresaId) return;
  if (resLeads.error) console.error("leads:", resLeads.error.code);
  leads = resLeads.data || [];
  notas = resNotas.data || [];
  equipe = resEquipe.data || [];
  formularios = resForms.data || [];
  conversas = resConversas.data || [];
  canaisWhats = resCanais.data || [];
  document.getElementById("cont-leads").textContent = leads.length || "";
  atualizarContadorConversas();
  render();
}

function atualizarContadorConversas() {
  const naoLidas = conversas.reduce((soma, c) => soma + (c.nao_lidas || 0), 0);
  document.getElementById("cont-conversas").textContent = naoLidas || "";
}

// Enquanto a pessoa está no CRM, busca conversas novas a cada 10 segundos.
let atualizandoConversas = false;
async function atualizarConversas() {
  if (!empresaAtual || document.hidden) return;
  if (atualizandoConversas) return;
  atualizandoConversas = true;
  const empresaId = empresaAtual.id;
  try {
  const { data } = await sb.from("conversas").select("*").eq("empresa_id", empresaAtual.id)
    .order("ultima_mensagem_em", { ascending: false });
  if (!data || empresaAtual?.id !== empresaId) return;
  const mudou = JSON.stringify(data.map((c) => [c.id, c.ultima_mensagem_em, c.nao_lidas])) !==
    JSON.stringify(conversas.map((c) => [c.id, c.ultima_mensagem_em, c.nao_lidas]));
  // Recibos mudam mensagens sem alterar a data da conversa.
  if (conversaAberta) await carregarMensagens(conversaAberta);
  if (empresaAtual?.id !== empresaId) return;
  const novoLead = data.some((c) => !leads.find((l) => l.id === c.lead_id));
  const anteriores = new Map(conversas.map((c) => [c.id, c]));
  conversas = data;
  atualizarContadorConversas();
  if (novoLead) { await carregarTudo(); return; }
  for (const c of data) {
    const antes = anteriores.get(c.id);
    if (c.id !== conversaAberta && (!antes || antes.ultima_mensagem_em !== c.ultima_mensagem_em)) delete mensagensPorConversa[c.id];
  }
  if (vistaAtual === "conversas" && (mudou || conversaAberta)) {
    render();
  } else {
    document.dispatchEvent(new CustomEvent("conversas-atualizadas"));
  }
  } finally { atualizandoConversas = false; }
}
setInterval(() => atualizarConversas().catch(() => {}), 10000);
window.addEventListener("online", () => atualizarConversas().catch(() => {}));
document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizarConversas().catch(() => {}); });
