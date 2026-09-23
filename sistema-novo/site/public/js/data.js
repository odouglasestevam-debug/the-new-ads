/* ---------------- dados ---------------- */
async function carregarTudo() {
  const empresaId = empresaAtual.id;
  const [resLeads, resNotas, resEquipe, resForms, resConversas, resCanais] = await Promise.all([
    sb.from("leads").select("*, lead_origens(*)").eq("empresa_id", empresaAtual.id).order("criado_em", { ascending: false }),
    sb.from("lead_notas").select("*").eq("empresa_id", empresaAtual.id).order("criado_em", { ascending: false }),
    sb.rpc("membros_da_empresa", { p_empresa: empresaAtual.id }),
    sb.from("formularios").select("*").eq("empresa_id", empresaAtual.id).order("criado_em"),
    sb.rpc('buscar_conversas_crm',parametrosConversas()),
    sb.rpc("canais_whatsapp", { p_empresa: empresaAtual.id }),
  ]);
  if (empresaAtual?.id !== empresaId) return;
  if (resLeads.error) console.error("leads:", resLeads.error.code);
  leads = resLeads.data || [];
  notas = resNotas.data || [];
  equipe = resEquipe.data || [];
  formularios = resForms.data || [];
  aceitarListaConversas(resConversas.data);
  canaisWhats = resCanais.data || [];
  document.getElementById("cont-leads").textContent = leadsComerciais().length || "";
  atualizarContadorConversas();
  render();
}

function atualizarContadorConversas() {
  const naoLidas = totalNaoLidas ?? conversas.reduce((soma, c) => soma + (c.nao_lidas || 0), 0);
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
  const chave=chaveFiltroConv();
  const { data: resultado } = await sb.rpc('buscar_conversas_crm',parametrosConversas(0,Math.max(50,Math.min(listaConversaIds?.length||50,200))));
  if (!resultado || empresaAtual?.id !== empresaId || chave!==chaveFiltroConv()) return;
  const data=resultado.items||[];
  const mudou = JSON.stringify(data.map((c) => [c.id, c.ultima_mensagem_em, c.nao_lidas])) !==
    JSON.stringify(conversas.map((c) => [c.id, c.ultima_mensagem_em, c.nao_lidas]));
  const mensagensAntes = JSON.stringify(mensagensPorConversa[conversaAberta] || []);
  // Recibos mudam mensagens sem alterar a data da conversa.
  if (conversaAberta) await carregarMensagens(conversaAberta);
  if (empresaAtual?.id !== empresaId) return;
  const novoLead = data.some((c) => !leads.find((l) => l.id === c.lead_id));
  const anteriores = new Map(conversas.map((c) => [c.id, c]));
  aceitarListaConversas(resultado);
  atualizarContadorConversas();
  if (novoLead) { await carregarTudo(); return; }
  for (const c of data) {
    const antes = anteriores.get(c.id);
    if (c.id !== conversaAberta && (!antes || antes.ultima_mensagem_em !== c.ultima_mensagem_em)) delete mensagensPorConversa[c.id];
  }
  if (vistaAtual === "conversas" && (mudou || mensagensAntes !== JSON.stringify(mensagensPorConversa[conversaAberta] || []))) {
    sincronizarInbox();
  } else {
    document.dispatchEvent(new CustomEvent("conversas-atualizadas"));
  }
  } finally { atualizandoConversas = false; }
}
setInterval(() => atualizarConversas().catch(() => {}), 10000);
window.addEventListener("online", () => atualizarConversas().catch(() => {}));
document.addEventListener("visibilitychange", () => { if (!document.hidden) atualizarConversas().catch(() => {}); });

let canalTempoReal = null;
let debounceTempoReal;
function pararTempoReal() {
  clearTimeout(debounceTempoReal);
  if (canalTempoReal) sb.removeChannel(canalTempoReal);
  canalTempoReal = null;
}
function iniciarTempoReal(empresaId) {
  pararTempoReal();
  const agendar = () => {
    clearTimeout(debounceTempoReal);
    debounceTempoReal = setTimeout(() => {
      if (empresaAtual?.id === empresaId) atualizarConversas().catch(() => {});
    },200);
  };
  canalTempoReal = sb.channel(`crm:${empresaId}:${usuario.id}`);
  for (const table of ['conversas','mensagens']) for (const event of ['INSERT','UPDATE']) {
    canalTempoReal.on('postgres_changes',{event,schema:'public',table,filter:`empresa_id=eq.${empresaId}`},agendar);
  }
  canalTempoReal.subscribe();
}
