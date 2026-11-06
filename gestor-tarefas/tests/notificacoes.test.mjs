import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mensagemAtribuicao, mensagemUrgente } from '../supabase/functions/tarefas-lembrete/mensagens.ts';
const ler = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');

const DOUGLAS = '00000000-0000-0000-0000-000000000001';
const PEDRO = '00000000-0000-0000-0000-000000000002';
const IGOR = '00000000-0000-0000-0000-000000000003';

test('urgente 2x no primeiro dia e 1x depois, atribuição avisa quem criou e quem atribuiu', async () => {
  const db = new PGlite();
  const um = async (sql) => (await db.query(sql)).rows[0];
  const todos = async (sql) => (await db.query(sql)).rows;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema privado; create schema vault;
      create table auth.users(id uuid primary key, email text, aud text, role text);
      create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid,status text);
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth,privado to authenticated,service_role;
      insert into auth.users(id,email) values ('${DOUGLAS}','odouglasestevam@gmail.com'),('${PEDRO}','pedro@teste.com'),('${IGOR}','igor@teste.com');
    `);
    await db.exec(await ler('0001_estrutura.sql'));
    const m2 = await ler('0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    for (const f of ['0003_views_publicas.sql', '0004_integridade_e_seguranca.sql', '0005_acessos_por_membro.sql', '0006_excluir_membro.sql', '0007_recorrencia_avancada.sql', '0008_recorrencia_ancorada.sql', '0009_notificacoes.sql', '0011_notificacoes_por_espaco.sql']) {
      await db.exec(await ler(f));
    }

    // Igor só tem acesso ao segundo espaço, como no gestor real.
    await db.exec(`
      insert into tarefas.usuarios(user_id,nome,email,admin,ativo,acesso_total) values
        ('${DOUGLAS}','Douglas','odouglasestevam@gmail.com',true,true,true),
        ('${PEDRO}','Pedro','pedro@teste.com',false,true,true),
        ('${IGOR}','Igor','igor@teste.com',false,true,false)
      on conflict (user_id) do update set nome=excluded.nome, admin=excluded.admin, ativo=true, acesso_total=excluded.acesso_total;
      insert into tarefas.push_inscricoes(user_id,endpoint,p256dh,auth) values
        ('${DOUGLAS}','https://web.push.apple.com/douglas',repeat('a',87),repeat('b',22)),
        ('${PEDRO}','https://web.push.apple.com/pedro',repeat('a',87),repeat('b',22)),
        ('${IGOR}','https://web.push.apple.com/igor',repeat('a',87),repeat('b',22));
    `);
    const projeto = (await um(`insert into tarefas.projetos(nome) values ('The New Ads') returning id`)).id;
    const outro = (await um(`insert into tarefas.projetos(nome) values ('Tubarão Ads') returning id`)).id;
    await db.exec(`insert into tarefas.acesso_espacos(user_id,projeto_id) values ('${IGOR}','${outro}')`);
    const lista = (await um(`insert into tarefas.listas(projeto_id,nome) values ('${projeto}','Gestão') returning id`)).id;
    const aberto = (await um(`select id from tarefas.status where tipo='aberto' order by ordem limit 1`)).id;
    const concluido = (await um(`select id from tarefas.status where tipo='concluido' order by ordem limit 1`)).id;
    const hoje = (await um(`select privado.tarefas_hoje()::text as d`)).d;
    const hojeMais = n => `('${hoje}'::date + ${n})`;

    const criar = async ({ titulo, prioridade = 'normal', criador = DOUGLAS, entrega = 'null', inicio = 'null', recorrencia = 'null' }) =>
      (await um(`insert into tarefas.tarefas(lista_id,titulo,status_id,prioridade,data_inicio,data_entrega,recorrencia,criado_por)
        values ('${lista}','${titulo}','${aberto}','${prioridade}',${inicio},${entrega},${recorrencia},'${criador}') returning id`)).id;
    const atribuir = async (tarefa, pessoa, sessao) => {
      if (sessao) await db.exec(`select set_config('request.jwt.claims','{"sub":"${sessao}"}',false)`);
      await db.exec(`insert into tarefas.tarefa_responsaveis(tarefa_id,user_id) values ('${tarefa}','${pessoa}')`);
      await db.exec(`select set_config('request.jwt.claims','',false)`);
    };
    const fila = () => todos(`select tarefa_id,user_id,ator_id from tarefas.atribuicoes_fila where enviado_em is null order by id`);
    const limparFila = () => db.exec('delete from tarefas.atribuicoes_fila');

    // ---- em aviso: quando o urgente começa a tocar
    const emAviso = async (inicio, entrega, rec) =>
      (await um(`select privado.tarefas_urgente_em_aviso(${inicio},${entrega},${rec}) as r`)).r;
    assert.equal(await emAviso('null', hojeMais(30), `'mensal'`), false, 'recorrente sem início espera a entrega');
    assert.equal(await emAviso('null', hojeMais(0), `'mensal'`), true, 'recorrente avisa no dia da entrega');
    assert.equal(await emAviso('null', hojeMais(-3), `'mensal'`), true, 'recorrente atrasada segue avisando');
    assert.equal(await emAviso('null', hojeMais(30), 'null'), true, 'avulsa sem início é urgente desde já');
    assert.equal(await emAviso('null', 'null', 'null'), true, 'avulsa sem data é urgente desde já');
    assert.equal(await emAviso(hojeMais(2), hojeMais(5), 'null'), false, 'início no futuro segura o aviso');
    assert.equal(await emAviso(hojeMais(-1), hojeMais(5), `'semanal'`), true, 'início no passado vale mesmo em recorrente');

    // ---- devida: horários em São Paulo (UTC-3)
    const devida = async (vezes, anterior, ultimo, agora) =>
      (await um(`select privado.tarefas_urgente_devida(${vezes},${anterior},${ultimo},'${agora}'::timestamptz) as r`)).r;
    const sp = h => `2026-12-07 ${h}:00:05-03`;
    assert.equal(await devida(0, false, 'null', sp('08')), true, 'primeiro aviso às 8h');
    assert.equal(await devida(1, false, `'${sp('08')}'`, sp('13')), false, 'antes das 14h não repete');
    assert.equal(await devida(1, false, `'${sp('08')}'`, sp('14')), true, 'segundo aviso às 14h');
    assert.equal(await devida(2, false, `'${sp('14')}'`, sp('19')), false, 'terceiro nunca');
    assert.equal(await devida(0, true, 'null', sp('08')), true, 'dia seguinte: 1 aviso');
    assert.equal(await devida(1, true, `'${sp('08')}'`, sp('14')), false, 'dia seguinte: sem segundo');
    assert.equal(await devida(1, false, `'${sp('15')}'`, sp('16')), false, 'criada à tarde não toca duas vezes seguidas');
    assert.equal(await devida(1, false, `'${sp('15')}'`, sp('18')), true, 'criada às 15h: segundo às 18h');

    // ---- atribuição
    const propria = await criar({ titulo: 'Minha' });
    await atribuir(propria, DOUGLAS);
    assert.equal((await fila()).length, 0, 'tarefa criada para si mesmo não avisa');

    const doPedro = await criar({ titulo: 'Do Pedro para Douglas', criador: PEDRO });
    await atribuir(doPedro, DOUGLAS, PEDRO);
    assert.deepEqual(await fila(), [{ tarefa_id: doPedro, user_id: DOUGLAS, ator_id: PEDRO }], 'criada e atribuída por outro avisa');
    await limparFila();

    const semSessao = await criar({ titulo: 'Pela skill' });
    await atribuir(semSessao, PEDRO);
    assert.deepEqual(await fila(), [{ tarefa_id: semSessao, user_id: PEDRO, ator_id: DOUGLAS }], 'sem sessão vale quem criou');
    await limparFila();

    const bloqueada = await criar({ titulo: 'Sem acesso' });
    await atribuir(bloqueada, IGOR, DOUGLAS);
    assert.equal((await fila()).length, 0, 'quem não enxerga a lista não recebe o título por push');

    const semAparelho = await criar({ titulo: 'Sem aparelho' });
    await db.exec(`delete from tarefas.push_inscricoes where user_id='${PEDRO}'`);
    await atribuir(semAparelho, PEDRO, DOUGLAS);
    assert.equal((await fila()).length, 0, 'sem aparelho inscrito não enfileira');
    await db.exec(`insert into tarefas.push_inscricoes(user_id,endpoint,p256dh,auth) values ('${PEDRO}','https://web.push.apple.com/pedro',repeat('a',87),repeat('b',22))`);

    // Concluir recorrente copia responsáveis para a próxima: isso não é atribuição nova.
    const serie = await criar({ titulo: 'Recorrente', entrega: hojeMais(0), recorrencia: `'semanal'` });
    await atribuir(serie, PEDRO, DOUGLAS);
    await limparFila();
    await db.exec(`update tarefas.tarefas set status_id='${concluido}' where id='${serie}'`);
    const proxima = (await um(`select proxima_id from tarefas.tarefas where id='${serie}'`)).proxima_id;
    assert.ok(proxima, 'próxima ocorrência criada');
    assert.equal((await um(`select count(*)::int c from tarefas.tarefa_responsaveis where tarefa_id='${proxima}'`)).c, 1, 'responsável copiado');
    assert.equal((await fila()).length, 0, 'cópia da recorrência não avisa');

    // Reserva: agrupa por pessoa, some o que deixou de valer, não duplica e tenta de novo.
    const a = await criar({ titulo: 'Lote A' });
    const b = await criar({ titulo: 'Lote B' });
    const removida = await criar({ titulo: 'Removida antes de sair' });
    for (const t of [a, b, removida]) await atribuir(t, PEDRO, DOUGLAS);
    await db.exec(`delete from tarefas.tarefa_responsaveis where tarefa_id='${removida}'`);
    let pacote = await todos('select * from public.tarefas_atribuicoes_reservar()');
    assert.equal(pacote.length, 1, 'um pacote por pessoa');
    assert.deepEqual(pacote[0].itens.map(i => i.titulo), ['Lote A', 'Lote B'], 'só o que ainda vale');
    assert.equal(pacote[0].itens[0].ator, 'Douglas');
    assert.equal(pacote[0].itens[0].criador, 'Douglas');
    assert.equal(pacote[0].inscricoes.length, 1);
    assert.equal((await todos('select * from public.tarefas_atribuicoes_reservar()')).length, 0, 'reservado não sai de novo');
    await db.exec(`update tarefas.atribuicoes_fila set reservado_em = now() - interval '6 minutes'`);
    pacote = await todos('select * from public.tarefas_atribuicoes_reservar()');
    assert.equal(pacote.length, 1, 'envio que falhou tenta de novo depois de 5 minutos');
    await db.query(`select public.tarefas_atribuicoes_marcar($1::bigint[])`, [pacote[0].itens.map(i => i.fila_id)]);
    await db.exec(`update tarefas.atribuicoes_fila set reservado_em = now() - interval '6 minutes'`);
    assert.equal((await todos('select * from public.tarefas_atribuicoes_reservar()')).length, 0, 'enviado sai da fila');
    await db.exec(`delete from tarefas.tarefa_responsaveis where tarefa_id='${a}'`);
    await atribuir(a, PEDRO, DOUGLAS);
    assert.equal((await fila()).length, 1, 'tirar e atribuir de novo avisa de novo');
    await limparFila();

    // ---- urgentes
    const nota = await criar({ titulo: 'Emitir nota fiscal', prioridade: 'urgente', entrega: hojeMais(0), recorrencia: `'mensal'` });
    const futura = await criar({ titulo: 'Urgente de mês que vem', prioridade: 'urgente', entrega: hojeMais(30), recorrencia: `'mensal'` });
    const amanha = await criar({ titulo: 'Recorrente urgente amanhã', prioridade: 'urgente', entrega: hojeMais(1), recorrencia: `'mensal'` });
    const normal = await criar({ titulo: 'Normal de hoje', entrega: hojeMais(0) });
    for (const t of [nota, futura, amanha, normal]) await db.exec(`insert into tarefas.tarefa_responsaveis(tarefa_id,user_id) values ('${t}','${DOUGLAS}')`);

    const urgentes = () => todos('select * from public.tarefas_urgentes_pendentes()');
    let u = await urgentes();
    assert.equal(u.length, 1, 'só quem tem urgente em aviso');
    assert.deepEqual(u[0].itens.map(i => [i.titulo, i.vez, i.dias_para_vencer]), [['Emitir nota fiscal', 1, 0]]);

    // Resumo das 8h não conta de novo a urgente em aviso, mas segue contando a que ainda não começou.
    const resumo = await um(`select * from public.tarefas_lembretes_pendentes() where user_id='${DOUGLAS}'`);
    assert.equal(resumo.hoje, 1, 'hoje: só a normal, a urgente tem push próprio');
    assert.equal(resumo.amanha, 1, 'amanhã: urgente recorrente ainda fora do aviso');

    const registrar = t => db.query(`select public.tarefas_urgentes_registrar('${DOUGLAS}',$1::uuid[])`, [t]);
    await registrar([nota]);
    const vezes = async () => todos(`select vez from tarefas.urgentes_enviados where tarefa_id='${nota}' order by vez`);
    assert.deepEqual(await vezes(), [{ vez: 1 }]);
    const horaAgora = (await um(`select extract(hour from now() at time zone 'America/Sao_Paulo')::int h`)).h;
    assert.equal((await urgentes()).length, 0, 'logo depois do aviso não sai outro');

    // Com folga de horas: só sai segundo se já passou das 14h em São Paulo.
    await db.exec(`update tarefas.urgentes_enviados set enviado_em = now() - interval '6 hours'`);
    u = await urgentes();
    if (horaAgora >= 14) {
      assert.equal(u[0].itens[0].vez, 2, 'segundo aviso do primeiro dia');
      assert.equal(mensagemUrgente(u[0].itens).titulo, 'Urgente: ainda em aberto');
    } else assert.equal(u.length, 0, 'antes das 14h espera');

    await registrar([nota]);
    assert.deepEqual(await vezes(), [{ vez: 1 }, { vez: 2 }]);
    assert.equal((await urgentes()).length, 0, 'primeiro dia para em 2');

    // Ontem foi o primeiro dia: hoje só 1.
    await db.exec(`update tarefas.urgentes_enviados set dia = dia - 1, enviado_em = enviado_em - interval '1 day'`);
    u = await urgentes();
    assert.equal(u[0].itens[0].vez, 1, 'dia seguinte volta a dever 1');
    await registrar([nota]);
    await db.exec(`update tarefas.urgentes_enviados set enviado_em = now() - interval '6 hours' where dia = '${hoje}'`);
    assert.equal((await urgentes()).length, 0, 'dia seguinte não tem segundo aviso');

    // Concluir encerra e a próxima ocorrência mantém a prioridade.
    await db.exec(`delete from tarefas.urgentes_enviados where dia = '${hoje}'`);
    assert.equal((await urgentes()).length, 1);
    await db.exec(`update tarefas.tarefas set status_id='${concluido}' where id='${nota}'`);
    assert.equal((await urgentes()).length, 0, 'concluída para de avisar');
    const proximaNota = await um(`select prioridade from tarefas.tarefas where id=(select proxima_id from tarefas.tarefas where id='${nota}')`);
    assert.equal(proximaNota.prioridade, 'urgente', 'recorrência mantém a prioridade');

    // Muitas urgentes viram um aviso só.
    for (const n of ['A', 'B', 'C', 'D']) {
      const t = await criar({ titulo: `Urgente ${n}`, prioridade: 'urgente', entrega: hojeMais(-2) });
      await db.exec(`insert into tarefas.tarefa_responsaveis(tarefa_id,user_id) values ('${t}','${PEDRO}')`);
    }
    await limparFila();
    u = (await urgentes()).filter(x => x.user_id === PEDRO);
    assert.equal(u.length, 1);
    assert.deepEqual(mensagemUrgente(u[0].itens), {
      titulo: '4 tarefas urgentes', corpo: 'Urgente A · Urgente B · Urgente C e mais 1', url: '/#/central',
    });

    // Modelos e Churn não são operação: molde nunca é concluído, cliente que saiu não gera aviso.
    await db.exec(`insert into tarefas.projetos(nome,notifica) values ('Modelos',false),('Churn',false)`);
    const listaDe = async espaco => (await um(`insert into tarefas.listas(projeto_id,nome)
      select id,'Lista' from tarefas.projetos where nome='${espaco}' returning id`)).id;
    for (const espaco of ['Modelos', 'Churn']) {
      const l = await listaDe(espaco);
      const t = (await um(`insert into tarefas.tarefas(lista_id,titulo,status_id,prioridade,data_entrega,criado_por)
        values ('${l}','Urgente em ${espaco}','${aberto}','urgente','${hoje}','${PEDRO}') returning id`)).id;
      const n = (await um(`insert into tarefas.tarefas(lista_id,titulo,status_id,data_entrega,criado_por)
        values ('${l}','Normal em ${espaco}','${aberto}','${hoje}','${PEDRO}') returning id`)).id;
      await db.exec(`delete from tarefas.lembretes_enviados`);
      const antes = (await um(`select hoje from public.tarefas_lembretes_pendentes() where user_id='${DOUGLAS}'`))?.hoje ?? 0;
      await atribuir(t, DOUGLAS, PEDRO);
      await atribuir(n, DOUGLAS, PEDRO);
      assert.equal((await fila()).length, 0, `atribuição em ${espaco} não avisa`);
      const devidas = (await urgentes()).flatMap(x => x.itens).map(i => i.titulo);
      assert.ok(!devidas.includes(`Urgente em ${espaco}`), `urgente em ${espaco} não avisa`);
      assert.equal((await um(`select hoje from public.tarefas_lembretes_pendentes() where user_id='${DOUGLAS}'`))?.hoje ?? 0, antes, `resumo não conta ${espaco}`);
    }

    // Quem não enxerga a lista não recebe, nem por urgência.
    const urgenteBloqueada = await criar({ titulo: 'Urgente bloqueada', prioridade: 'urgente', entrega: hojeMais(0) });
    await db.exec(`insert into tarefas.tarefa_responsaveis(tarefa_id,user_id) values ('${urgenteBloqueada}','${IGOR}')`);
    assert.equal((await urgentes()).filter(x => x.user_id === IGOR).length, 0, 'sem acesso à lista não recebe');

    // Tabelas e funções novas não ficam ao alcance do app.
    await db.exec(`select set_config('request.jwt.claims','{"sub":"${PEDRO}","role":"authenticated","aal":"aal1"}',false); set role authenticated;`);
    await assert.rejects(db.query('select * from tarefas.atribuicoes_fila'), /permission denied/);
    await assert.rejects(db.query('select * from tarefas.urgentes_enviados'), /permission denied/);
    await assert.rejects(db.query('select * from public.tarefas_urgentes_pendentes()'), /permission denied/);
    await assert.rejects(db.query('select * from public.tarefas_atribuicoes_reservar()'), /permission denied/);
    await db.exec('reset role');
    console.log('Notificações: início do aviso, 2x no primeiro dia, 1x depois, fila de atribuição, recorrência, acesso e permissões OK.');
  } finally { await db.close(); }
});

test('service worker mostra cada aviso separado e o clique abre a tarefa do aviso', async () => {
  const codigo = await readFile(new URL('../site/public/sw.js', import.meta.url), 'utf8');
  const h = {};
  const mostradas = [];
  const abertas = [];
  const mensagens = [];
  let janelas = [];
  const self = {
    addEventListener: (nome, fn) => { h[nome] = fn; },
    location: { origin: 'https://tarefas.thenewads.com.br' },
    skipWaiting() {},
    clients: { claim() {}, matchAll: async () => janelas, openWindow: async (u) => abertas.push(u) },
    registration: { showNotification: async (titulo, opcoes) => mostradas.push({ titulo, opcoes }) },
  };
  vm.runInNewContext(codigo, { self, URL, fetch, Response, caches: {} });
  let espera;
  const evento = (extra) => ({ ...extra, waitUntil: (p) => { espera = p; } });

  h.push(evento({ data: { json: () => ({ titulo: 'Tarefa urgente', corpo: 'Nota', url: '/#/lista/l1?t=t1' }) } }));
  await espera;
  assert.equal(mostradas[0].titulo, 'Tarefa urgente');
  assert.equal(mostradas[0].opcoes.tag, undefined, 'sem tag um aviso não apaga o outro');
  assert.equal(mostradas[0].opcoes.data.url, '/#/lista/l1?t=t1');

  const clique = () => evento({ notification: { close() {}, data: { url: '/#/lista/l1?t=t1' } } });
  h.notificationclick(clique());
  await espera;
  assert.deepEqual(abertas, ['https://tarefas.thenewads.com.br/#/lista/l1?t=t1'], 'app fechado abre na tarefa');

  let focou = false;
  janelas = [{ focus: () => { focou = true; }, postMessage: (m) => mensagens.push(m) }];
  h.notificationclick(clique());
  await espera;
  assert.equal(focou, true);
  assert.equal(JSON.stringify(mensagens), JSON.stringify([{ tipo: 'abrir', url: 'https://tarefas.thenewads.com.br/#/lista/l1?t=t1' }]), 'app aberto recebe a rota');
  assert.equal(abertas.length, 1, 'não abre uma segunda janela');
});

test('texto das notificações diz quem criou e quem atribuiu', () => {
  const base = { fila_id: 1, tarefa_id: 't1', lista_id: 'l1', titulo: 'Emitir nota fiscal' };
  const url = '/#/lista/l1?t=t1';
  assert.deepEqual(mensagemAtribuicao([{ ...base, ator: 'Pedro', criador: 'Pedro' }]),
    { titulo: 'Pedro criou e te atribuiu uma tarefa', corpo: 'Emitir nota fiscal', url });
  assert.deepEqual(mensagemAtribuicao([{ ...base, ator: 'Pedro', criador: 'Igor' }]),
    { titulo: 'Pedro te atribuiu uma tarefa', corpo: 'Emitir nota fiscal (criada por Igor)', url });
  assert.deepEqual(mensagemAtribuicao([{ ...base, ator: null, criador: 'Igor' }]),
    { titulo: 'Tarefa atribuída a você', corpo: 'Emitir nota fiscal (criada por Igor)', url });
  assert.deepEqual(mensagemAtribuicao([{ ...base, ator: null, criador: null }]),
    { titulo: 'Tarefa atribuída a você', corpo: 'Emitir nota fiscal', url });
  const lote = ['A', 'B'].map((titulo, i) => ({ ...base, fila_id: i, titulo, ator: 'Pedro', criador: 'Pedro' }));
  assert.equal(mensagemAtribuicao(lote).titulo, 'Pedro te atribuiu 2 tarefas');
  assert.equal(mensagemAtribuicao(lote).url, '/#/central');
  assert.equal(mensagemAtribuicao([lote[0], { ...lote[1], ator: 'Igor' }]).titulo, '2 tarefas novas para você');

  const urgente = { tarefa_id: 't1', lista_id: 'l1', titulo: 'Emitir nota fiscal', vez: 1 };
  assert.deepEqual(mensagemUrgente([{ ...urgente, dias_para_vencer: 0 }]),
    { titulo: 'Tarefa urgente', corpo: 'Emitir nota fiscal (vence hoje)', url });
  assert.equal(mensagemUrgente([{ ...urgente, dias_para_vencer: -1 }]).corpo, 'Emitir nota fiscal (atrasada há 1 dia)');
  assert.equal(mensagemUrgente([{ ...urgente, dias_para_vencer: -5 }]).corpo, 'Emitir nota fiscal (atrasada há 5 dias)');
  assert.equal(mensagemUrgente([{ ...urgente, dias_para_vencer: 1 }]).corpo, 'Emitir nota fiscal (vence amanhã)');
  assert.equal(mensagemUrgente([{ ...urgente, dias_para_vencer: null }]).corpo, 'Emitir nota fiscal');
  assert.equal(mensagemUrgente([{ ...urgente, dias_para_vencer: 0, vez: 2 }]).titulo, 'Urgente: ainda em aberto');
});
