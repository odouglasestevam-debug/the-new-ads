// Chave pública do projeto do CRM. O acesso real é decidido pelas regras do banco (RLS), não pela chave.
const SUPABASE_URL = "https://xrvjlhseyqfgyvwwlwwb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9DQ3pGVnensKAXdBxtdV3Q_Ud2pUEwK";
// Lido antes do cliente do Supabase, que consome o fragmento da URL ao iniciar.
const TIPO_LINK = new URLSearchParams(location.hash.slice(1)).get("type");
const ERRO_LINK = new URLSearchParams(location.hash.slice(1)).get("error_description");
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ETAPAS = [
  { id: "novo",        nome: "Novo lead",        cor: "#8A8A8A" },
  { id: "contato",     nome: "Em contato",       cor: "#60A5FA" },
  { id: "qualificado", nome: "Qualificado",      cor: "#22D3EE" },
  { id: "proposta",    nome: "Proposta enviada", cor: "#FF6A00" },
  { id: "cliente",     nome: "Cliente",          cor: "#4ADE80" },
  { id: "perdido",     nome: "Perdido",          cor: "#F87171" },
];
const NOME_ETAPA = Object.fromEntries(ETAPAS.map((e) => [e.id, e.nome]));
const NOME_PAPEL = { agencia: "Agência", dono: "Dono", gestor: "Gestor", vendedor: "Vendedor", leitura: "Leitura" };
const NOME_CANAL = { site: "Site", ctwa: "WhatsApp", meta_form: "Formulário Meta", manual: "Manual" };

// Cada canal tem a sua forma de origem. Mensagem (CTWA) e formulário nativo trazem
// nomes resolvidos pela Meta; site traz os parâmetros de UTM do padrão do /funil.
const CAMPOS_ORIGEM = {
  ctwa: [["campanha_nome", "campanha"], ["conjunto_nome", "conjunto"], ["anuncio_nome", "anúncio"]],
  meta_form: [["campanha_nome", "campanha"], ["conjunto_nome", "conjunto"], ["anuncio_nome", "anúncio"]],
  site: [["utm_source", "source"], ["utm_medium", "medium"], ["utm_campaign", "campaign"], ["utm_content", "content"],
         ["utm_term", "term"], ["utm_placement", "placement"], ["ad_id", "ad_id"]],
  manual: [],
};
function camposOrigem(o) {
  return (CAMPOS_ORIGEM[o?.canal] || []).filter(([campo]) => o[campo]).map(([campo, rotulo]) => [rotulo, o[campo]]);
}
function campanhaDaOrigem(o) {
  return o ? (o.canal === "site" ? o.utm_campaign : o.campanha_nome) || "" : "";
}
const CHAVE_EMPRESA = "crm_empresa_atual";

let usuario = null;
let ehAgencia = false;
let empresas = [];
let empresaAtual = null;
let papel = null;        // agencia | dono | gestor | vendedor | leitura
let equipe = [];
let leads = [];
let notas = [];
let vistaAtual = "kanban";
let abaAjustes = "seguranca";
let busca = "";
let filtroCadastro = "todos";
let formularios = [];
let formEditando = null;   // cópia em edição; null mostra a lista
let conversas = [];
let conversaAberta = null; // id da conversa aberta na vista Conversas
let mensagensPorConversa = {};
let integracaoWhats = null; // estado vindo da função integracoes (sem segredos)
let canaisWhats = [];       // números ligados da empresa: [{canal, numero}]

/* ---------------- permissões (espelham o banco; o banco é quem manda) ---------------- */
const pode = {
  editarTodos: () => ["agencia", "dono", "gestor"].includes(papel),
  editarLead: (l) => pode.editarTodos() || (papel === "vendedor" && l.responsavel_id === usuario.id),
  criarLead: () => ["agencia", "dono", "gestor", "vendedor"].includes(papel),
  distribuir: () => pode.editarTodos(),
  administrar: () => ["agencia", "dono"].includes(papel),
  excluir: () => ["agencia", "dono"].includes(papel),
};

/* ---------------- utilidades ---------------- */
function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function dataCurta(iso) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
}
function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

// Telefone no formato do banco (+5511999999999). Aceita o que a pessoa digitar com DDD.
function normalizarTelefone(bruto) {
  const d = String(bruto || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return "+55" + d;
  if (d.length >= 12 && d.length <= 15) return "+" + d;
  return undefined; // inválido
}
function telefoneLegivel(t) {
  const m = String(t || "").match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (t || "");
}

// Origens ordenadas: a primeira é a de entrada, a última a mais recente.
function origensDoLead(l) {
  return [...(l.lead_origens || [])].sort((a, b) => new Date(a.recebido_em) - new Date(b.recebido_em));
}
function ultimaOrigem(l) {
  const o = origensDoLead(l);
  return o[o.length - 1] || null;
}
function nomeResponsavel(id) {
  if (!id) return "";
  return equipe.find((m) => m.user_id === id)?.email || "";
}

const ICONE_WHATSAPP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.7 15l-1.3 4.7 4.8-1.2A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8 0-1.3.7-2 .9-2.2.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.5-.3.3c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.4.1.6-.1l.9-1c.2-.2.4-.2.6-.1l1.8.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>';
const ICONE_NOTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M4 10h16M4 15h10"/></svg>';

// Enquanto o chat não existe, o botão abre o WhatsApp comum.
function botaoWhatsApp(lead, rotulo) {
  if (!lead.telefone) return "";
  const url = `https://wa.me/${lead.telefone.replace(/\D/g, "")}`;
  return `<a class="zap${rotulo ? " zap-largo" : ""}" href="${url}" target="_blank" rel="noopener"
             draggable="false" title="Abrir conversa no WhatsApp"
             data-link-externo>${ICONE_WHATSAPP}${rotulo ? `<span>${rotulo}</span>` : ""}</a>`;
}
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-link-externo]")) event.stopPropagation();
}, true);
