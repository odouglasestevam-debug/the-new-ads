// Limite de tentativas de login do painel.
//
// O contador vive no banco, nao no navegador: limpar o storage nao devolve
// tentativa. Quem confere o codigo de desbloqueio e o proprio Postgres, contra
// o mesmo fator TOTP que o funil usa, entao o segredo do MFA nunca sai de la.
//
// Nada disso e alcancavel com a chave publica: as funcoes so tem grant pra
// service role, que existe apenas aqui no servidor.

import { rpcValor } from "../_lib/supabase.js";

const LIMITE = 3;

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Sem IP nao da pra contar tentativa por origem. Cai num balde unico em vez de
// travar o login inteiro.
function origem(request) {
  return request.headers.get("CF-Connecting-IP") || "desconhecido";
}

// Se o guard cair, o login continua funcionando. Trancar todo mundo por causa
// de uma falha de infraestrutura seria pior que a brecha que ele cobre, ainda
// mais com o segundo fator valendo de qualquer jeito.
const LIVRE = { bloqueado: false, restantes: LIMITE, segundos: 0, degradado: true };

export async function onRequestGet({ request, env }) {
  try {
    return json(await rpcValor(env, "painel_estado", { p_ip: origem(request) }));
  } catch {
    return json(LIVRE);
  }
}

export async function onRequestPost({ request, env }) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return json({ error: "corpo_invalido" }, 400);
  }

  const ip = origem(request);

  try {
    if (corpo.acao === "erro") {
      return json(await rpcValor(env, "painel_registrar_erro", { p_ip: ip }));
    }

    if (corpo.acao === "sucesso") {
      await rpcValor(env, "painel_registrar_sucesso", { p_ip: ip });
      return json({ bloqueado: false, restantes: LIMITE, segundos: 0 });
    }

    if (corpo.acao === "desbloquear") {
      const codigo = String(corpo.codigo || "").replace(/\D/g, "");
      if (codigo.length !== 6) {
        return json({ ok: false, motivo: "codigo_invalido" });
      }
      return json(await rpcValor(env, "painel_desbloquear", { p_ip: ip, p_codigo: codigo }));
    }

    return json({ error: "acao_desconhecida" }, 400);
  } catch {
    return json(LIVRE);
  }
}
