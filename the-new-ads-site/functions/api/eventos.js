// GET /api/eventos?inicio=ISO&fim=ISO
// Lista os eventos da agenda do Google no intervalo pedido.
//
// Exige sessao do painel: sem isso, a agenda inteira ficaria publica.
// A validacao usa o proprio banco: a consulta a funil_acesso so devolve linha
// pra quem esta na lista de acesso, entao serve de prova de identidade.

import { getAccessToken, listEvents, jsonResponse } from "../_lib/google-calendar.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../_lib/supabase.js";

const JANELA_MAXIMA_DIAS = 62;

async function temAcesso(autorizacao) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/funil_acesso?select=user_id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: autorizacao },
    });
    if (!res.ok) return false;
    const linhas = await res.json();
    return Array.isArray(linhas) && linhas.length > 0;
  } catch {
    return false;
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const autorizacao = request.headers.get("authorization") || "";
    if (!autorizacao.startsWith("Bearer ") || !(await temAcesso(autorizacao))) {
      return jsonResponse({ error: "sem_sessao" }, 401);
    }

    const url = new URL(request.url);
    const inicio = new Date(url.searchParams.get("inicio") || "");
    const fim = new Date(url.searchParams.get("fim") || "");

    if (isNaN(inicio) || isNaN(fim) || fim <= inicio) {
      return jsonResponse({ error: "intervalo_invalido" }, 400);
    }

    const dias = (fim - inicio) / 86400000;
    if (dias > JANELA_MAXIMA_DIAS) {
      return jsonResponse({ error: "intervalo_longo_demais", message: `Maximo de ${JANELA_MAXIMA_DIAS} dias por consulta.` }, 400);
    }

    const accessToken = await getAccessToken(env);
    const eventos = await listEvents(env, accessToken, inicio.toISOString(), fim.toISOString());

    return jsonResponse({
      eventos: eventos.map((e) => ({
        id: e.id,
        titulo: e.summary || "(sem titulo)",
        descricao: e.description || "",
        inicio: e.start?.dateTime || e.start?.date || null,
        fim: e.end?.dateTime || e.end?.date || null,
        diaInteiro: !e.start?.dateTime,
        meet: e.hangoutLink || null,
        link: e.htmlLink || null,
        convidados: (e.attendees || []).map((a) => a.email).filter(Boolean),
      })),
    });
  } catch (err) {
    return jsonResponse({ error: "falha_ao_listar", message: String(err.message || err) }, 500);
  }
}
