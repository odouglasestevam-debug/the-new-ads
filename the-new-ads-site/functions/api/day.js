// GET /api/day?date=YYYY-MM-DD
// Retorna a grade completa do expediente daquele dia: 3 horarios livres
// aparecem como "available" (agendaveis), o resto (ocupado de verdade ou
// simplesmente nao liberado) aparece como "blocked" -- mostra a agenda mais
// cheia sem inventar compromisso nenhum, so nao oferece o resto. A mistura
// manha/tarde dos 3 ofertados muda de acordo com a hora local de quem esta
// acessando agora (ver composicaoPorHora).

import {
  getAccessToken,
  freeBusy,
  jsonResponse,
  corsHeaders,
  isWeekday,
  expedienteSlots,
  overlapsBusy,
  proximosDiasUteis,
  isoDate,
} from "../_lib/google-calendar.js";

const OFERTA_POR_DIA = 3;
const DIAS_AGENDAVEIS = 2;
const LIMITE_MANHA = 12; // hora local (Brasilia) que separa manha de tarde no expediente

// Hash simples e deterministico: mesma data (+ categoria) sempre cai no mesmo
// resultado (nao muda a cada reload), mas dias diferentes caem em horarios
// diferentes, entao a agenda nao parece sempre "9h e 10h liberados".
function hashData(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Escolhe `quantidade` indices dentro de um pool (array de slots livres),
// variando por semente (data+pool) em vez de sempre pegar os primeiros.
function escolherDoPool(pool, semente, quantidade) {
  if (pool.length <= quantidade) {
    return pool.map((s) => s.idx);
  }
  const h = hashData(semente);
  const escolhidos = new Set();
  let tentativa = 0;
  while (escolhidos.size < quantidade && tentativa < pool.length * 3) {
    const posicao = (h + tentativa * 7 + tentativa * tentativa) % pool.length;
    escolhidos.add(posicao);
    tentativa += 1;
  }
  return [...escolhidos].map((posicao) => pool[posicao].idx);
}

// Descobre o horario local de quem esta acessando agora, via geolocalizacao
// da propria Cloudflare (request.cf.timezone) -- sem precisar de JS no
// cliente. Cai pro fuso do negocio se a info nao vier (ex: dev local).
function horaAtualDoVisitante(request, env) {
  const timezone = (request.cf && request.cf.timezone) || env.TIMEZONE || "America/Sao_Paulo";
  try {
    const formatado = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).format(new Date());
    return Number(formatado.replace(/\D/g, "")) % 24;
  } catch {
    return 12; // fuso invalido, assume meio do dia
  }
}

// Regra de composicao: quantos horarios de manha vs de tarde oferecer,
// dependendo de que hora do dia a pessoa esta navegando agora.
// - navegando de manha: puxa mais manha (fica "no clima" de hoje ainda)
// - navegando de tarde: puxa mais tarde
// - navegando fora do expediente (noite/madrugada): mostra as pontas do dia
//   (inicio da manha + final da tarde), sem favorecer nenhum periodo
function composicaoPorHora(hora) {
  if (hora >= 5 && hora < LIMITE_MANHA) return { periodo: "manha", manha: 2, tarde: 1 };
  if (hora >= LIMITE_MANHA && hora < 17) return { periodo: "tarde", manha: 1, tarde: 2 };
  return { periodo: "fora", manha: 1, tarde: 2 };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get("date");

    if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return jsonResponse({ error: "date invalido, use YYYY-MM-DD" }, 400);
    }

    const [y, m, d] = dateParam.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1, d));

    if (!isWeekday(day)) {
      return jsonResponse({ error: "dia_nao_util" }, 400);
    }

    const diasPermitidos = proximosDiasUteis(DIAS_AGENDAVEIS).map(isoDate);
    if (!diasPermitidos.includes(dateParam)) {
      return jsonResponse({ error: "dia_nao_liberado", diasPermitidos }, 403);
    }

    const expedienteInicio = Number(env.EXPEDIENTE_INICIO || 9);
    const expedienteFim = Number(env.EXPEDIENTE_FIM || 18);
    const duracaoMin = Number(env.DURACAO_MINUTOS || 60);

    const slots = expedienteSlots(day, expedienteInicio, expedienteFim, duracaoMin);

    const accessToken = await getAccessToken(env);
    const busy = await freeBusy(
      env,
      accessToken,
      slots[0].start.toISOString(),
      slots[slots.length - 1].end.toISOString()
    );

    const now = new Date();
    const livres = slots
      .map((s, idx) => ({ ...s, idx, livre: s.start > now && !overlapsBusy(s.start, s.end, busy) }))
      .filter((s) => s.livre);

    const poolManha = livres.filter((s) => s.idx + expedienteInicio < LIMITE_MANHA);
    const poolTarde = livres.filter((s) => s.idx + expedienteInicio >= LIMITE_MANHA);

    const hora = horaAtualDoVisitante(request, env);
    const composicao = composicaoPorHora(hora);

    let manhaWanted = Math.min(composicao.manha, poolManha.length);
    let tardeWanted = Math.min(composicao.tarde, poolTarde.length);
    let faltam = OFERTA_POR_DIA - (manhaWanted + tardeWanted);
    if (faltam > 0) {
      const extraTarde = Math.min(faltam, poolTarde.length - tardeWanted);
      tardeWanted += extraTarde;
      faltam -= extraTarde;
      const extraManha = Math.min(faltam, poolManha.length - manhaWanted);
      manhaWanted += extraManha;
      faltam -= extraManha;
    }

    let idxManha, idxTarde;
    if (composicao.periodo === "fora") {
      // pontas do dia: pega o mais cedo da manha e o mais tarde da tarde,
      // completa o resto (se precisar de mais de 1 em algum lado) por hash.
      const ordenadoManhaAsc = [...poolManha];
      const ordenadoTardeDesc = [...poolTarde].reverse();
      idxManha = ordenadoManhaAsc.slice(0, manhaWanted).map((s) => s.idx);
      idxTarde = ordenadoTardeDesc.slice(0, tardeWanted).map((s) => s.idx);
    } else {
      idxManha = escolherDoPool(poolManha, `${dateParam}-manha`, manhaWanted);
      idxTarde = escolherDoPool(poolTarde, `${dateParam}-tarde`, tardeWanted);
    }

    const indicesOfertados = new Set([...idxManha, ...idxTarde]);

    const resultado = slots.map((s, idx) => ({
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      status: indicesOfertados.has(idx) ? "available" : "blocked",
    }));

    return jsonResponse({ date: dateParam, timezone: env.TIMEZONE || "America/Sao_Paulo", slots: resultado });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) }, 500);
  }
}
