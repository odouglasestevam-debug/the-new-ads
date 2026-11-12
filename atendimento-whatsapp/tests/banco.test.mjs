// Testa as migrações e as regras de cálculo num PostgreSQL isolado (PGlite), sem dado real.
// Rodar da raiz do repositório: node --test atendimento-whatsapp/tests/banco.test.mjs
// (usa o PGlite instalado em gestor-tarefas/node_modules)
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const aqui = dirname(fileURLToPath(import.meta.url));
const { PGlite } = await import(pathToFileURL(resolve(aqui, "../../gestor-tarefas/node_modules/@electric-sql/pglite/dist/index.js")).href);
const ler = (p) => readFile(resolve(aqui, "../supabase/migrations", p), "utf8");

const DOUGLAS = "00000000-0000-0000-0000-000000000001";
const OUTRO = "00000000-0000-0000-0000-000000000002";

test("monitor de atendimento: recebimento, cálculo, filas e acesso", async () => {
  const db = new PGlite();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const um = async (sql, params) => (await q(sql, params))[0];
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema privado; create schema vault; create schema extensions; create schema cron;
      create table auth.users(id uuid primary key, email text);
      create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid, status text);
      create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      create table vault.decrypted_secrets(id uuid primary key default gen_random_uuid(), name text unique, decrypted_secret text, description text);
      create function vault.create_secret(s text, n text, d text) returns uuid language sql as $$
        insert into vault.decrypted_secrets(name, decrypted_secret, description) values (n, s, d) returning id $$;
      create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
        select decode(substr(md5(random()::text) || md5(random()::text) || md5(random()::text) || md5(random()::text), 1, n * 2), 'hex') $$;
      create table cron.job(jobname text, schedule text, command text);
      create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ insert into cron.job values (a, b, c); select 1::bigint $$;
      grant usage on schema auth, privado to authenticated, service_role;
      insert into auth.users(id, email) values ('${DOUGLAS}', 'odouglasestevam@gmail.com'), ('${OUTRO}', 'outra@pessoa.com');
    `);
    for (const f of ["0001_estrutura.sql", "0002_servidor.sql", "0003_calculo.sql", "0004_painel_e_rotinas.sql", "0005_mensagem_automatica.sql"]) await db.exec(await ler(f));
    assert.equal((await um("select count(*)::int n from cron.job where jobname like 'atendimento-%'")).n, 5);

    const conta = await um("select id, url_token from atendimento.contas where slug = 'sapataria-nacoes'");
    const cron = (await um("select decrypted_secret s from vault.decrypted_secrets where name = 'atendimento_cron'")).s;
    assert.equal((await um("select public.atendimento_cron_ok($1) ok", [cron])).ok, true);
    assert.equal((await um("select public.atendimento_cron_ok('errado') ok")).ok, false);

    let seq = 0;
    const ev = async (e, token = conta.url_token, inst = "inst-1") =>
      (await um("select public.atendimento_registrar('sapataria-nacoes', $1, $2::jsonb) r", [token,
        JSON.stringify({ instance_id: inst, instance_nome: "Nações", tipo_evento: e.evento === "leitura" ? "Receipt" : "Message", ...e })])).r;
    const msg = (tel, deLoja, quando, texto, extra = {}) => ev({ evento: "mensagem", wa_id: "W" + ++seq, chat: tel + "@s.whatsapp.net",
      telefone: tel, de_loja: deLoja, enviada_em: quando, tipo: "texto", texto, nome: deLoja ? null : "Cliente " + tel.slice(-1), ...extra });
    const T = (dia, hora) => `2026-11-${dia}T${hora}:00-03:00`;

    // A: anúncio, resposta em 10 min, preço, cliente responde, combina dia, fecha com "Obrigada!"
    const A = "5548911110001";
    assert.equal(await msg(A, false, T("02", "14:00"), "Olá, vi seu anúncio, quanto custa bordar?", { anuncio: { source_id: "123", title: "Bordado" } }), "ok");
    const waA1 = "W" + seq;
    await msg(A, true, T("02", "14:10"), "Oi! Qual o tamanho do bordado?");
    await msg(A, false, T("02", "14:12"), "10cm no peito");
    await msg(A, true, T("02", "14:20"), "Fica R$ 45,00. Consegue trazer amanhã?");
    await msg(A, false, T("02", "14:25"), "Levo amanhã às 15h");
    await msg(A, true, T("02", "14:26"), "Combinado, te espero!");
    await msg(A, false, T("02", "14:27"), "Obrigada!");
    assert.equal(await ev({ evento: "leitura", ids: [waA1], em: T("02", "14:05") }), "ok");

    // Duplicada, token errado e outra instância
    assert.equal(await ev({ evento: "mensagem", wa_id: waA1, chat: A + "@s.whatsapp.net", telefone: A, de_loja: false,
      enviada_em: T("02", "14:00"), tipo: "texto", texto: "x" }), "duplicada");
    assert.equal(await ev({ evento: "outro" }, "0".repeat(48)), "nao_autorizado");
    assert.equal(await ev({ evento: "outro" }, conta.url_token, "inst-2"), "outra_instancia");

    // B: chega 23:30 de segunda, resposta 10:05 de terça (5 min de loja), orçamento em áudio, retorno no dia seguinte
    const B = "5548911110002";
    await msg(B, false, T("02", "23:30"), "Vocês consertam chuteira?");
    await msg(B, true, T("03", "10:05"), "Bom dia! Consertamos sim");
    await msg(B, false, T("03", "10:30"), "Quanto fica?");
    await msg(B, true, T("03", "10:40"), null, { tipo: "audio", audio_segundos: 30, audio_voz: true, midia: { media_key: "abc", url: "https://mmg.whatsapp.net/x" } });
    const audioB = await um("select id, transcricao_status from atendimento.mensagens where wa_id = $1", ["W" + seq]);
    assert.equal(audioB.transcricao_status, "pendente");
    const pend = await q("select * from public.atendimento_audios_pendentes(5)");
    assert.equal(pend.length, 1);
    await db.query("select public.atendimento_salvar_transcricao($1, $2, null)", [audioB.id, "Fica 120 reais pra colar a sola"]);
    await msg(B, true, T("04", "11:00"), "Oi! Conseguiu ver o orçamento?");

    // C: ninguém respondeu, mas o celular abriu
    const C = "5548911110003";
    await msg(C, false, T("03", "15:00"), "Qual o valor pra trocar o zíper?");
    await ev({ evento: "leitura", ids: ["W" + seq], em: T("03", "15:05") });

    // D: vaga de emprego (fora das contas)
    const D = "5548911110004";
    await msg(D, false, T("04", "16:00"), "Oi, vi a vaga de vendedora, ainda está aberta?");
    await msg(D, true, T("04", "16:30"), "Está sim, manda o currículo");

    // E: começa só com LID, depois o WhatsApp mostra o telefone; orçamento sem retorno
    const E = "5548911110005";
    assert.equal(await ev({ evento: "mensagem", wa_id: "W" + ++seq, chat: "999888@lid", lid: "999888", de_loja: false,
      enviada_em: T("05", "11:00"), tipo: "texto", texto: "Bom dia, fazem barra de calça?" }), "ok");
    assert.equal((await um("select contato from atendimento.mensagens where wa_id = $1", ["W" + seq])).contato, "lid:999888");
    await ev({ evento: "mensagem", wa_id: "W" + ++seq, chat: E + "@s.whatsapp.net", telefone: E, lid: "999888", de_loja: false,
      enviada_em: T("05", "11:05"), tipo: "texto", texto: "Quanto custa?" });
    assert.equal((await um("select count(*)::int n from atendimento.mensagens where contato = 'lid:999888'")).n, 0);
    await msg(E, true, T("05", "11:20"), "R$ 25,00");

    // F: a loja começa (peça pronta), cliente só agradece
    const F = "5548911110006";
    await msg(F, true, T("06", "10:00"), "Sua peça está pronta");
    await msg(F, false, T("06", "12:00"), "Ok obrigada");

    // G: recibo chega antes da mensagem; reação não conta como resposta
    const G = "5548911110007";
    await ev({ evento: "leitura", ids: ["WG1"], em: T("07", "10:50") });
    // saudação automática do anúncio sai antes da mensagem do cliente, no mesmo minuto: não pode virar resposta
    await msg(G, true, T("07", "10:00"), "Oi! Como podemos ajudar?");
    assert.equal((await um("select automatica from atendimento.mensagens where wa_id = $1", ["W" + seq])).automatica, true);
    await ev({ evento: "mensagem", wa_id: "WG1", chat: G + "@s.whatsapp.net", telefone: G, de_loja: false,
      enviada_em: T("07", "10:00"), tipo: "texto", texto: "Fazem pintura de bolsa?" });
    assert.ok((await um("select lida_em from atendimento.mensagens where wa_id = 'WG1'")).lida_em);
    await msg(G, true, T("07", "10:01"), "👍", { tipo: "reacao" });
    await msg(G, true, T("07", "11:00"), "Fazemos sim");

    // Minutos de loja: segunda 23:30 até terça 10:05 = 5 minutos
    const mu = await um(`select atendimento.minutos_uteis(horario, fuso, $1::timestamptz, $2::timestamptz)::numeric m from atendimento.contas`, [T("02", "23:30"), T("03", "10:05")]);
    assert.equal(Number(mu.m), 5);

    // IA: o que vai pro lote e a gravação do resultado
    const itens = await q("select * from public.atendimento_para_classificar(100)");
    const quem = itens.map((i) => i.chave.split("|")[1]).sort();
    assert.deepEqual(quem, [A, B, E, F, G].sort(), "A, B, E, F, G vão pro lote (C sem resposta, D é vaga)");
    assert.match(itens.find((i) => i.chave.includes(B)).conversa, /áudio transcrito, 30s\): Fica 120 reais/);
    const chaves = itens.map((i) => ({ k: i.chave, ate: i.lido_ate }));
    const lote = (await um("select public.atendimento_lote_criado('batch_1', 'file_1', 'gpt-6.1-terra', $1::jsonb) id", [JSON.stringify(chaves)])).id;
    assert.equal((await q("select * from public.atendimento_para_classificar(100)")).length, 0, "não reenvia o que está em lote aberto");
    const resultado = itens.map((it, i) => ({ i, chamou_para_loja: it.chave.includes(A), trecho_convite: it.chave.includes(A) ? "Consegue trazer amanhã?" : "",
      marcou_dia: it.chave.includes(A), trecho_dia: it.chave.includes(A) ? "Levo amanhã às 15h" : "", recrutamento: false }));
    assert.equal((await um("select public.atendimento_salvar_classificacoes($1, $2::jsonb) n", [lote, JSON.stringify(resultado)])).n, 5);
    await db.query("select public.atendimento_lote_atualizar($1, 'concluido', 'completed', null)", [lote]);

    // Painel como Douglas (sem 2FA cadastrado)
    const comoUsuario = async (uid, fn) => {
      await db.exec(`select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated","aal":"aal1"}', false); set role authenticated;`);
      try { return await fn(); } finally { await db.exec("reset role"); }
    };
    const d = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_painel($1, '2026-11-02', '2026-11-08') d", [conta.id])).d);

    assert.deepEqual([d.volume.atendimentos, d.volume.de_anuncio, d.volume.iniciados_pela_loja, d.volume.recrutamento], [5, 1, 1, 1], "volume");
    assert.deepEqual([d.resposta.atendimentos, d.resposta.respondidos, d.resposta.sem_resposta, d.resposta.ate_meta], [5, 4, 1, 2], "1ª resposta");
    assert.equal(Number(d.resposta.mediana_util_min), 15, "mediana de 10, 5, 20 e 60 min");
    assert.equal(Number(d.resposta.mediana_corrida_min), 40, "mediana corrida de 10, 635, 20 e 60 min");
    assert.equal(d.resposta.acima_24h, 1);
    assert.deepEqual([d.resposta.anuncio.atendimentos, d.resposta.anuncio.ate_meta], [1, 1]);
    assert.equal(d.durante.pendencias, 3, "sem contar 'Obrigada!' e 'Ok obrigada'");
    assert.equal(Number(d.durante.mediana_util_min), 8);
    assert.deepEqual([d.leitura.com_leitura, d.leitura.viu_sem_responder], [3, 1], "leitura");
    assert.deepEqual([d.formato.mensagens, d.formato.texto, d.formato.audio], [9, 8, 1], "formato sem reação e sem vaga");
    assert.deepEqual([d.retorno.orcamentos, d.retorno.cliente_respondeu, d.retorno.cliente_sumiu, d.retorno.com_retorno, d.retorno.retorno_ate_d1, d.retorno.sem_retorno],
      [3, 1, 2, 1, 1, 1], "retorno de orçamento");
    assert.deepEqual([d.loja.com_preco, d.loja.com_preco_analisados, d.loja.com_preco_chamou, d.loja.com_preco_sem_convite, d.loja.marcou_dia],
      [3, 3, 1, 2, 1], "chamar pra loja");
    assert.ok(d.calor.length > 0);

    const lista = (f) => comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_lista($1, '2026-11-02', '2026-11-08', $2) l", [conta.id, f])).l);
    assert.deepEqual((await lista("sem_resposta")).map((x) => x.contato), [C]);
    assert.deepEqual((await lista("preco_sem_convite")).map((x) => x.contato).sort(), [B, E].sort());
    assert.deepEqual((await lista("orcamento_com_retorno")).map((x) => x.contato), [B]);
    assert.deepEqual((await lista("recrutamento")).map((x) => x.contato), [D]);
    assert.deepEqual((await lista("viu_sem_responder")).map((x) => x.contato), [C]);

    const filas = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_filas($1) f", [conta.id])).f);
    assert.deepEqual(filas.retornos.map((x) => [x.contato, x.etapa]).sort(), [[B, "D+3"], [E, "D+1"]].sort(), "retornos do dia");
    assert.deepEqual(filas.sem_convite.map((x) => x.contato).sort(), [B, E].sort());

    const conversa = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_conversa($1, $2) c", [conta.id, E])).c);
    assert.equal(conversa.length, 3, "mensagens do LID ficaram junto do telefone");

    // Configuração: valida horário e metas
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_config($1, '{"1":["22:00","10:00"]}', '{}')`, [conta.id])), /horario_invalido/);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_config($1, '{}', '{"x":1}')`, [conta.id])), /meta_invalida/);
    await comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_config($1, '{"1":["09:00","18:00"]}', '{"primeira_resposta_min":10}')`, [conta.id]));
    const cfg = await um("select horario, metas from atendimento.contas where id = $1", [conta.id]);
    assert.deepEqual(cfg.horario["1"], ["09:00", "18:00"]);
    assert.equal(cfg.horario["0"], null, "dia não enviado fica fechado");
    assert.equal(cfg.metas.primeira_resposta_min, 10);
    assert.equal(cfg.metas.retorno_pct, 80, "metas não enviadas ficam como estavam");
    await comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_config($1, '{"1":["09:00","18:00"]}', '{}', '["Oi! Como podemos ajudar?","Olá, estamos fechados agora"]')`, [conta.id]));
    assert.equal((await um("select count(*)::int n from atendimento.mensagens where automatica")).n, 1);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_config($1, '{}', '{}', '[1]')`, [conta.id])), /textos_invalidos/);

    // Acesso: outro usuário não entra; com 2FA cadastrado, só com sessão aal2; anon nem chama
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_contas()")), /sem_acesso/);
    await db.exec(`insert into auth.mfa_factors(user_id, status) values ('${DOUGLAS}', 'verified')`);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query("select public.atendimento_contas()")), /sem_acesso/);
    await db.exec(`select set_config('request.jwt.claims', '{"sub":"${DOUGLAS}","role":"authenticated","aal":"aal2"}', false); set role authenticated;`);
    const contas = (await um("select public.atendimento_contas() c")).c;
    await db.exec("reset role");
    assert.equal(contas.contas.length, 1);
    assert.match(contas.contas[0].webhook, /atendimento-webhook\?c=sapataria-nacoes&t=[0-9a-f]{48}$/);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from atendimento.mensagens"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_registrar('a','b','{}')"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_cron_ok('x')"), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.atendimento_painel(gen_random_uuid(), current_date, current_date)"), /permission denied/);
    await db.exec("reset role");

    // Importação do WhatsApp Web: parcial trocada pela conversa completa, hora incerta fora, sem duplicar
    await db.exec("delete from auth.mfa_factors"); // volta o usuário de teste a sessão sem 2FA
    const pasta = await mkdtemp(resolve(tmpdir(), "lotes-"));
    const L = (o) => JSON.stringify(o);
    await writeFile(resolve(pasta, "lote-01.jsonl"), [
      L({ c: "554800000001", n: "", dt: "2026-11-11 14:21", de: "cliente", tipo: "texto", txt: "Oi! Como podemos ajudar?", parcial: true, nao_lidas: 1 }),
      L({ c: "554800000002", n: "", dt: "2026-11-10 00:00", hora_incerta: true, de: "cliente", tipo: "foto", txt: "", parcial: true }),
      L({ c: "554800000003", n: "", dt: "2026-11-12 10:16", de: "cliente", tipo: "texto", txt: "Teria alguma forma de arrumar?", parcial: true, nao_lidas: 6 }),
    ].join("\n"));
    await writeFile(resolve(pasta, "lote-02.jsonl"), [
      L({ c: "554800000001", n: "", dt: "2026-11-11 14:21", de: "cliente", tipo: "texto", txt: "Vocês reformam jaqueta?", anuncio: true }),
      L({ c: "554800000001", n: "", dt: "2026-11-11 14:21", de: "loja", tipo: "texto", txt: "Oi! Como podemos ajudar?" }),
      L({ c: "554800000001", n: "", dt: "2026-11-11 19:20", de: "loja", tipo: "texto", txt: "Boa noite, reformamos sim. Fica R$ 150,00" }),
      L({ c: "554800000001", n: "", dt: "2026-11-11 19:22", de: "cliente", tipo: "foto", txt: "" }),
      L({ c: "554800000001", n: "", dt: "2026-11-11 19:22", de: "cliente", tipo: "foto", txt: "" }),
      L({ c: "554800000001", n: "", dt: "2026-11-11 19:25", de: "cliente", tipo: "audio", txt: "", seg: null }),
    ].join("\n"));
    const sqlImport = execFileSync(process.execPath, [resolve(aqui, "../ferramentas/importar-whatsapp-web.mjs"), pasta, "sapataria-nacoes"], { encoding: "utf8" });
    const imp1 = (await db.query(sqlImport.split("\n").filter((l) => !l.startsWith("--")).join("\n"))).rows[0];
    assert.deepEqual([Number(imp1.inseridas), Number(imp1.no_arquivo)], [7, 7], "6 da conversa completa + 1 parcial sem coleta completa");
    const imp2 = (await db.query(sqlImport.split("\n").filter((l) => !l.startsWith("--")).join("\n"))).rows[0];
    assert.equal(Number(imp2.inseridas), 0, "rodar de novo não duplica");
    const web = await q("select contato, de_loja, tipo, automatica, anuncio is not null anuncio, transcricao_status from atendimento.mensagens where bruto->>'origem' = 'whatsapp_web' and contato = '554800000001' order by enviada_em, id");
    assert.deepEqual(web.map((x) => [x.de_loja, x.tipo, x.automatica]), [[false, "texto", false], [true, "texto", true], [true, "texto", false], [false, "imagem", false], [false, "imagem", false], [false, "audio", false]]);
    assert.equal(web[0].anuncio, true);
    assert.equal(web[5].transcricao_status, "sem_midia");
    const dWeb = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_painel($1, '2026-11-11', '2026-11-11') d", [conta.id])).d);
    assert.equal(Number(dWeb.resposta.mediana_corrida_min), 299, "1ª resposta conta da mensagem do cliente até a resposta humana, não a saudação");

    // Fechamento semanal (semana anterior a hoje) fica congelado
    const n1 = (await um("select atendimento.fechar_semanas() n")).n;
    const n2 = (await um("select count(*)::int n from atendimento.semanas")).n;
    console.log(`fechar_semanas: ${n1} conta(s), ${n2} semana(s) gravada(s)`);
  } finally {
    await db.close();
  }
});
