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
const RENITA = "00000000-0000-0000-0000-000000000003";
const atendimentoNotaSoma = (n) => Object.values(n.pilares).reduce((s, p) => s + Number(p.peso), 0);

test("monitor de atendimento: recebimento, cálculo, filas e acesso", async () => {
  const db = new PGlite();
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const um = async (sql, params) => (await q(sql, params))[0];
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema privado; create schema vault; create schema extensions; create schema cron;
      create table auth.users(id uuid primary key, email text, last_sign_in_at timestamptz);
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
      insert into auth.users(id, email) values ('${DOUGLAS}', 'odouglasestevam@gmail.com'), ('${OUTRO}', 'outra@pessoa.com'), ('${RENITA}', 'dona@rede.com');
    `);
    for (const f of ["0001_estrutura.sql", "0002_servidor.sql", "0003_calculo.sql", "0004_painel_e_rotinas.sql", "0005_mensagem_automatica.sql",
      "0006_rede_acessos_nota.sql"]) await db.exec(await ler(f));
    assert.equal((await um("select count(*)::int n from cron.job where jobname like 'atendimento-%'")).n, 5);

    // Rede com as três unidades, Douglas como admin
    const rede = await um("select id, metas, pesos from atendimento.redes where slug = 'sapataria-do-futuro'");
    assert.equal(rede.pesos.agilidade + rede.pesos.conducao + rede.pesos.compromisso + rede.pesos.retorno + rede.pesos.formato, 100);
    const unidades = await q("select slug, unidade, textos_automaticos from atendimento.contas where rede_id = $1 order by unidade", [rede.id]);
    assert.deepEqual(unidades.map((u) => u.unidade), ["Anália Franco", "Nações", "Tietê"]);
    assert.deepEqual(unidades[2].textos_automaticos, ["Oi! Como podemos ajudar?"], "unidade nova herda a saudação automática");
    assert.equal((await um("select papel from atendimento.usuarios where user_id = $1", [DOUGLAS])).papel, "admin");
    const tiete = (await um("select id from atendimento.contas where slug = 'sapataria-tiete'")).id;

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

    // ===== Checklist de qualidade (versão 2): a leitura antiga volta pro lote =====
    const itens2 = await q("select * from public.atendimento_para_classificar(100)");
    assert.deepEqual(itens2.map((i) => i.chave.split("|")[1]).sort(), [A, B, E, F, G].sort(), "lidos pelo checklist antigo são relidos");
    assert.match(itens2[0].contexto, /Data de hoje: \d{2}\/\d{2}\/\d{4}/);
    assert.match(itens2[0].contexto, /Diferenciais da loja \(escrito pela dona\):\n- Rede com mais de 30 anos/);
    const lote2 = (await um("select public.atendimento_lote_criado('batch_2', 'file_2', 'gpt-6.1-terra', $1::jsonb) id",
      [JSON.stringify(itens2.map((i) => ({ k: i.chave, ate: i.lido_ate })))])).id;
    const vazio = { passou_preco: false, entendeu: false, trecho_entendeu: "", incluso: false, trecho_incluso: "", diferencial: false,
      trecho_diferencial: "", chamou_para_loja: false, trecho_convite: "", marcou_dia: false, trecho_dia: "", data_compromisso: "",
      relembrou: "nao_se_aplica", trecho_relembrou: "", cobrou_status: false, recrutamento: false };
    const checklist = {
      [A]: { tipo: "oportunidade", servico: "bordado_estampa", passou_preco: true, entendeu: true, trecho_entendeu: "Qual o tamanho do bordado?",
        incluso: true, trecho_incluso: "inclui a linha e o acabamento", diferencial: true, trecho_diferencial: "avaliação sem compromisso",
        chamou_para_loja: true, trecho_convite: "Consegue trazer amanhã?", marcou_dia: true, trecho_dia: "Levo amanhã às 15h",
        data_compromisso: "2026-11-03", relembrou: "nao" },
      [B]: { tipo: "oportunidade", servico: "calcados", passou_preco: true },
      [E]: { tipo: "oportunidade", servico: "roupas_costura", passou_preco: true, diferencial: true, trecho_diferencial: "garantia de 90 dias",
        data_compromisso: "2026-02-30" },
      [F]: { tipo: "acompanhamento", servico: "calcados" },
      [G]: { tipo: "outro", servico: "nao_identificado" },
    };
    const res2 = itens2.map((it, i) => ({ i, ...vazio, ...checklist[it.chave.split("|")[1]] }));
    assert.equal((await um("select public.atendimento_salvar_classificacoes($1, $2::jsonb) n", [lote2, JSON.stringify(res2)])).n, 5);
    await db.query("select public.atendimento_lote_atualizar($1, 'concluido', 'completed', null)", [lote2]);
    assert.equal((await um("select data_compromisso from atendimento.classificacoes where contato = $1", [E])).data_compromisso, null, "data inválida vira nula");
    assert.equal((await q("select * from public.atendimento_para_classificar(100)")).length, 0, "nada mudou, nada a reler");

    // Compromisso aguardando cuja data passou: relê uma vez pra saber se a loja relembrou
    await db.exec(`update atendimento.classificacoes set relembrou = 'aguardando', data_compromisso = '2026-11-05', analisado_em = '2026-11-04' where contato = '${A}'`);
    assert.deepEqual((await q("select * from public.atendimento_para_classificar(100)")).map((i) => i.chave.split("|")[1]), [A]);
    await db.exec(`update atendimento.classificacoes set analisado_em = now() where contato = '${A}'`);
    assert.equal((await q("select * from public.atendimento_para_classificar(100)")).length, 0, "relê uma vez só");
    await db.exec(`update atendimento.classificacoes set relembrou = 'nao', data_compromisso = '2026-11-03' where contato = '${A}'`);

    const d2 = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_painel($1, '2026-11-02', '2026-11-08') d", [conta.id])).d);
    const Q = d2.qualidade;
    assert.deepEqual([Q.atendimentos, Q.analisados, Q.oportunidades, Q.outros, Q.acompanhamento], [4, 4, 3, 1, 0], "F começou pela loja e fica fora");
    assert.deepEqual([Q.entendeu, Q.passou_preco, Q.incluso, Q.diferencial, Q.convite, Q.compromisso, Q.relembrou_aplicavel, Q.relembrou, Q.balcao],
      [1, 3, 1, 2, 1, 1, 1, 0, 2], "checklist");
    assert.deepEqual(Q.servicos, { bordado_estampa: 1, calcados: 1, roupas_costura: 1 }, "G é outro: fica fora dos serviços");
    assert.equal(Number(Q.tempo_ate_preco_mediana_min), 20, "A 20 min, B 40 min de loja, E 20 min");
    assert.equal(d2.loja.com_preco_chamou, 1, "bloco antigo continua");
    const N = d2.nota;
    assert.equal(N.amostra_pequena, true);
    assert.equal(N.completa, false, "retorno e formato sem amostra mínima");
    assert.equal(N.pilares.agilidade.kpis.primeira_resposta.pontos, 100, "mediana 15 min = meta");
    assert.equal(Math.round(N.pilares.agilidade.kpis.respondidas_24h.valor), 80);
    assert.equal(N.pilares.agilidade.kpis.respondidas_24h.pontos, 57.1, "80% entre piso 60 e meta 95");
    assert.equal(N.pilares.conducao.kpis.diferencial.pontos, 100, "67% passa a meta de 60%");
    assert.equal(N.pilares.conducao.pontos, 57.8, "(41,7 + 47,6 + 100 + 41,7) / 4");
    assert.equal(N.pilares.compromisso.kpis.relembrou.valor, null, "1 caso só: sem nota");
    assert.equal(N.pilares.compromisso.pontos, 66.7);
    assert.equal(N.pilares.retorno.pontos, null);
    assert.equal(N.valor, 67, "(78,55×25 + 57,75×30 + 66,7×25) / 80");
    assert.equal(atendimentoNotaSoma(N), 100);

    const listaQ = (f) => comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_lista($1, '2026-11-02', '2026-11-08', $2) l", [conta.id, f])).l);
    assert.deepEqual((await listaQ("balcao")).map((x) => x.contato).sort(), [B, E].sort());
    assert.deepEqual((await listaQ("sem_entendeu")).map((x) => x.contato).sort(), [B, E].sort());
    assert.deepEqual((await listaQ("nao_relembrou")).map((x) => x.contato), [A]);
    const linhaA = (await listaQ("compromisso"))[0];
    assert.equal(linhaA.trecho_incluso, "inclui a linha e o acabamento");
    assert.equal(linhaA.tipo, "oportunidade");
    const filas2 = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_filas($1) f", [conta.id])).f);
    assert.deepEqual(filas2.sem_convite.map((x) => x.contato).sort(), [B, E].sort(), "oportunidades sem convite");
    assert.ok(Array.isArray(filas2.compromissos));

    // ===== Foto: fica pendente, é descrita e a IA lê a descrição =====
    const H = "5548911110008";
    await msg(H, false, T("09", "11:00"), "Dá pra arrumar?", { tipo: "imagem", midia: { media_key: "k", direct_path: "/v/t62/x", mimetype: "image/jpeg" } });
    const fotoH = await um("select id, transcricao_status from atendimento.mensagens where wa_id = $1", ["W" + seq]);
    assert.equal(fotoH.transcricao_status, "pendente");
    const pend2 = await q("select * from public.atendimento_audios_pendentes(5)");
    assert.deepEqual(pend2.map((p) => p.tipo), ["imagem"]);
    await db.query("select public.atendimento_salvar_transcricao($1, $2, null)", [fotoH.id, "Tênis branco com a sola descolando na ponta"]);
    await msg(H, true, T("09", "11:10"), "Arrumamos sim! Traz pra gente ver");
    await msg(H, false, T("09", "11:20"), null, { tipo: "imagem" });
    assert.equal((await um("select transcricao_status from atendimento.mensagens where wa_id = $1", ["W" + seq])).transcricao_status, "sem_midia");
    const itH = (await q("select * from public.atendimento_para_classificar(100)")).find((i) => i.chave.includes(H));
    assert.match(itH.conversa, /Cliente \(foto, o que aparece: Tênis branco com a sola descolando na ponta\): Dá pra arrumar\?/);
    assert.match(itH.conversa, /Cliente \(foto, sem descrição\)/);

    // ===== Configuração =====
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_unidade($1, '{"1":["22:00","10:00"]}', '[]')`, [conta.id])), /horario_invalido/);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_unidade($1, '{}', '[1]')`, [conta.id])), /textos_invalidos/);
    await comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_unidade($1, '{"1":["09:00","18:00"]}', '["Oi! Como podemos ajudar?","Olá, estamos fechados agora"]')`, [conta.id]));
    const cfg = await um("select horario, textos_automaticos from atendimento.contas where id = $1", [conta.id]);
    assert.deepEqual(cfg.horario["1"], ["09:00", "18:00"]);
    assert.equal(cfg.horario["0"], null, "dia não enviado fica fechado");
    assert.equal((await um("select count(*)::int n from atendimento.mensagens where automatica")).n, 1);
    await comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_unidade($1, '{"1":["09:00","18:00"]}', '[]')`, [conta.id]));
    assert.equal((await um("select count(*)::int n from atendimento.mensagens where automatica")).n, 0, "tirar o texto desmarca");
    await comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_unidade($1, '{"1":["09:00","18:00"]}', '["Oi! Como podemos ajudar?"]')`, [conta.id]));

    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_rede($1, '{"x":1}', '{}', null, null)`, [rede.id])), /meta_invalida/);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_rede($1, '{"convite_pct":120}', '{}', null, null)`, [rede.id])), /meta_invalida/);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_rede($1, '{}', '{"formato":10}', null, null)`, [rede.id])), /pesos_soma/);
    await comoUsuario(DOUGLAS, () => db.query(`select public.atendimento_salvar_rede($1, '{"primeira_resposta_min":10}', '{"formato":0,"retorno":20}', null, 'Troca de sola inclui limpeza')`, [rede.id]));
    const rede2 = await um("select metas, pesos, incluso, diferenciais from atendimento.redes where id = $1", [rede.id]);
    assert.equal(rede2.metas.primeira_resposta_min, 10);
    assert.equal(rede2.metas.retorno_pct, 80, "metas não enviadas ficam como estavam");
    assert.deepEqual([rede2.pesos.formato, rede2.pesos.retorno], [0, 20]);
    assert.equal(rede2.incluso, "Troca de sola inclui limpeza");
    assert.match(rede2.diferenciais, /30 anos/, "texto não enviado fica como estava");
    const d3 = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_painel($1, '2026-11-02', '2026-11-08') d", [conta.id])).d);
    assert.equal(d3.nota.pilares.formato.peso, 0);
    assert.equal(d3.nota.pilares.agilidade.kpis.primeira_resposta.meta, 10);

    // ===== Acesso por papel =====
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_contas()")), /sem_acesso/);
    await db.query("select public.atendimento_cadastrar_usuario($1, 'Equipe Tietê', 'Outra@Pessoa.com', 'unidade', null, $2::uuid[])", [OUTRO, [tiete]]);
    await db.query("select public.atendimento_cadastrar_usuario($1, 'Renita', 'dona@rede.com', 'rede', $2, null)", [RENITA, rede.id]);
    await assert.rejects(db.query("select public.atendimento_cadastrar_usuario($1, 'x', 'x@x.com', 'unidade', null, '{}'::uuid[])", [OUTRO]), /contas_invalidas/);
    await assert.rejects(db.query("select public.atendimento_cadastrar_usuario($1, 'x', 'x@x.com', 'chefe', null, null)", [OUTRO]), /papel_invalido/);
    assert.equal((await um("select public.atendimento_eh_admin($1) a", [OUTRO])).a, false);

    const vEquipe = await comoUsuario(OUTRO, async () => (await um("select public.atendimento_contas() c")).c);
    assert.deepEqual(vEquipe.contas.map((c) => c.unidade), ["Tietê"]);
    assert.equal(vEquipe.perfil.papel, "unidade");
    assert.equal(vEquipe.contas[0].webhook, null, "equipe não vê o endereço do webhook");
    assert.equal(vEquipe.redes[0].gere, false);
    assert.equal(vEquipe.redes[0].diferenciais, null);
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_painel($1, '2026-11-02', '2026-11-08')", [conta.id])), /sem_permissao/);
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_conversa($1, $2)", [conta.id, A])), /sem_permissao/);
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_lista($1, '2026-11-02', '2026-11-08', 'todos')", [conta.id])), /sem_permissao/);
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_filas($1)", [conta.id])), /sem_permissao/);
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_semanas($1)", [conta.id])), /sem_permissao/);
    await comoUsuario(OUTRO, () => db.query("select public.atendimento_painel($1, '2026-11-02', '2026-11-08')", [tiete]));
    const redeEquipe = await comoUsuario(OUTRO, async () => (await um("select public.atendimento_rede($1, '2026-11-02', '2026-11-08') r", [rede.id])).r);
    assert.deepEqual(redeEquipe.map((x) => x.unidade), ["Tietê"], "na visão de rede a equipe só vê a própria unidade");
    await assert.rejects(comoUsuario(OUTRO, () => db.query(`select public.atendimento_salvar_rede($1, '{}', '{}', null, null)`, [rede.id])), /sem_permissao/);
    await assert.rejects(comoUsuario(OUTRO, () => db.query(`select public.atendimento_salvar_unidade($1, '{}', '[]')`, [tiete])), /sem_permissao/);
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_usuarios()")), /sem_permissao/);

    const vRenita = await comoUsuario(RENITA, async () => (await um("select public.atendimento_contas() c")).c);
    assert.equal(vRenita.contas.length, 3);
    assert.ok(vRenita.contas.every((c) => c.webhook === null), "dona da rede não vê o webhook");
    assert.equal(vRenita.redes[0].gere, true);
    assert.equal(vRenita.ultimo_lote, null);
    const redeRenita = await comoUsuario(RENITA, async () => (await um("select public.atendimento_rede($1, '2026-11-02', '2026-11-08') r", [rede.id])).r);
    assert.equal(redeRenita.length, 3);
    assert.equal(redeRenita.find((x) => x.unidade === "Nações").calc.nota.valor !== undefined, true);
    await comoUsuario(RENITA, () => db.query(`select public.atendimento_salvar_rede($1, '{"convite_pct":85}', '{}', null, null)`, [rede.id]));
    await comoUsuario(RENITA, () => db.query(`select public.atendimento_salvar_unidade($1, '{"0":["14:00","20:00"],"1":["10:00","22:00"]}', '[]')`, [tiete]));
    await assert.rejects(comoUsuario(RENITA, () => db.query("select public.atendimento_usuarios()")), /sem_permissao/);

    const usuarios = await comoUsuario(DOUGLAS, async () => (await um("select public.atendimento_usuarios() u")).u);
    assert.deepEqual(usuarios.map((u) => [u.papel, u.email]), [["admin", "odouglasestevam@gmail.com"], ["rede", "dona@rede.com"], ["unidade", "outra@pessoa.com"]]);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query("select public.atendimento_usuario_remover($1)", [DOUGLAS])), /nao_remove_a_si/);
    await comoUsuario(DOUGLAS, () => db.query("select public.atendimento_usuario_remover($1)", [OUTRO]));
    await assert.rejects(comoUsuario(OUTRO, () => db.query("select public.atendimento_contas()")), /sem_acesso/);

    // 2FA: com fator cadastrado, só com sessão aal2; anon nem chama
    await db.exec(`insert into auth.mfa_factors(user_id, status) values ('${DOUGLAS}', 'verified')`);
    await assert.rejects(comoUsuario(DOUGLAS, () => db.query("select public.atendimento_contas()")), /sem_acesso/);
    await db.exec(`select set_config('request.jwt.claims', '{"sub":"${DOUGLAS}","role":"authenticated","aal":"aal2"}', false); set role authenticated;`);
    const contas = (await um("select public.atendimento_contas() c")).c;
    await db.exec("reset role");
    assert.equal(contas.contas.length, 3);
    assert.equal(contas.perfil.admin, true);
    assert.match(contas.contas.find((c) => c.slug === "sapataria-nacoes").webhook, /atendimento-webhook\?c=sapataria-nacoes&t=[0-9a-f]{48}$/);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from atendimento.mensagens"), /permission denied/);
    await assert.rejects(db.query("select * from atendimento.redes"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_registrar('a','b','{}')"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_cron_ok('x')"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_cadastrar_usuario(gen_random_uuid(), 'a', 'a@a.com', 'admin', null, null)"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_eh_admin(gen_random_uuid())"), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.atendimento_painel(gen_random_uuid(), current_date, current_date)"), /permission denied/);
    await assert.rejects(db.query("select public.atendimento_rede(gen_random_uuid(), current_date, current_date)"), /permission denied/);
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
    const refeitas = (await um("select atendimento.fechar_semanas_desde('2026-10-01', true) n")).n;
    assert.ok(refeitas >= 1, "refaz as semanas desde a primeira mensagem");
    assert.equal((await um("select atendimento.fechar_semanas_desde('2026-10-01') n")).n, 0, "sem refazer, não mexe no que já fechou");
    const sem = await um("select metricas from atendimento.semanas s join atendimento.contas c on c.id = s.conta_id where c.slug = 'sapataria-nacoes' and semana = '2026-11-02'");
    assert.ok(sem.metricas.nota && sem.metricas.nota.pilares.conducao, "semana fechada guarda a nota");

    // Dados de exemplo pra conferir a tela sem banco (ATD_FIXTURES=caminho.json)
    if (process.env.ATD_FIXTURES) {
      const f = {};
      await comoUsuario(DOUGLAS, async () => {
        const um1 = async (sql, p) => Object.values(await um(sql, p))[0];
        f.atendimento_contas = await um1("select public.atendimento_contas()");
        f.atendimento_rede = await um1("select public.atendimento_rede($1, '2026-11-02', '2026-11-12')", [rede.id]);
        f.atendimento_rede_semanas = await um1("select public.atendimento_rede_semanas($1)", [rede.id]);
        f.atendimento_painel = await um1("select public.atendimento_painel($1, '2026-11-02', '2026-11-12')", [conta.id]);
        f.atendimento_lista = await um1("select public.atendimento_lista($1, '2026-11-02', '2026-11-12', 'todos')", [conta.id]);
        f.atendimento_filas = await um1("select public.atendimento_filas($1)", [conta.id]);
        f.atendimento_semanas = await um1("select public.atendimento_semanas($1)", [conta.id]);
        f.atendimento_usuarios = await um1("select public.atendimento_usuarios()");
        f.atendimento_conversa = await um1("select public.atendimento_conversa($1, $2)", [conta.id, A]);
      });
      await writeFile(process.env.ATD_FIXTURES, JSON.stringify(f));
    }
  } finally {
    await db.close();
  }
});
