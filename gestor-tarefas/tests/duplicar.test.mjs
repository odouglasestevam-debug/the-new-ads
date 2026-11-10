import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const ler = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');

test('duplicar espaço, pasta e lista: cópia de cliente, opções, travas e avisos', async () => {
  const db = new PGlite();
  const douglas = randomUUID(), pedro = randomUUID(), saiu = randomUUID();
  let checks = 0;
  const igual = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
  const negado = async (fn, padrao) => { await assert.rejects(fn, padrao); checks++; };
  const como = async (id, sql, params = []) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub: id, role: 'authenticated', aal: 'aal2'})]);
    await tx.exec('set local role authenticated');
    return tx.query(sql, params);
  });
  const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const todos = async (sql, params = []) => (await db.query(sql, params)).rows;
  const duplicar = async (quem, args) => (await como(quem,
    'select public.tarefas_duplicar($1,$2,$3,$4,$5,$6,$7,$8,$9) as r',
    [args.tipo, args.id, args.nome, args.projeto ?? null, args.pasta ?? null, args.tarefas ?? true, args.resp ?? true, args.manter ?? false, args.concluidas ?? false])).rows[0].r;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema privado;create schema vault;
      create table auth.users(id uuid primary key,email text,aud text,role text);
      create table auth.mfa_factors(user_id uuid,status text);
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth,privado to authenticated,service_role;`);
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [douglas, 'odouglasestevam@gmail.com', pedro, 'pedro@test.local', saiu, 'saiu@test.local']);
    await db.exec(await ler('0001_estrutura.sql'));
    const m2 = await ler('0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    for (const m of ['0003_views_publicas.sql', '0004_integridade_e_seguranca.sql', '0005_acessos_por_membro.sql', '0006_excluir_membro.sql',
      '0007_recorrencia_avancada.sql', '0008_recorrencia_ancorada.sql', '0009_notificacoes.sql', '0011_notificacoes_por_espaco.sql', '0016_duplicar_estrutura.sql']) await db.exec(await ler(m));
    await db.query("insert into tarefas.usuarios(user_id,nome,email,acesso_total) values($1,'Pedro','pedro@test.local',true),($2,'Saiu','saiu@test.local',true)", [pedro, saiu]);
    await db.query("insert into tarefas.push_inscricoes(user_id,endpoint,p256dh,auth) values($1,'https://web.push.apple.com/pedro',repeat('a',87),repeat('b',22))", [pedro]);

    // Molde parecido com Modelos > 00 - Cliente tráfego, com uma subpasta para provar a cópia em profundidade.
    const modelos = (await um("insert into tarefas.projetos(nome,cor,notifica) values ('Modelos','#123456',false) returning id")).id;
    const tna = (await um("insert into tarefas.projetos(nome) values ('The New Ads') returning id")).id;
    const molde = (await um('insert into tarefas.pastas(projeto_id,nome) values($1,$2) returning id', [modelos, '00 - Cliente tráfego'])).id;
    const extra = (await um('insert into tarefas.pastas(projeto_id,pasta_pai_id,nome) values($1,$2,$3) returning id', [modelos, molde, 'Extra'])).id;
    const contrato = (await um('insert into tarefas.listas(projeto_id,pasta_id,nome) values($1,$2,$3) returning id', [modelos, molde, 'Contrato'])).id;
    const gestao = (await um('insert into tarefas.listas(projeto_id,pasta_id,nome) values($1,$2,$3) returning id', [modelos, molde, 'Gestão de Tráfego'])).id;
    await db.query('insert into tarefas.listas(projeto_id,pasta_id,nome) values($1,$2,$3)', [modelos, extra, 'Sub']);
    const st = Object.fromEntries((await todos('select nome,id from tarefas.status')).map(s => [s.nome, s.id]));
    const tarefa = async (lista, titulo, extra = {}) => (await um(
      `insert into tarefas.tarefas(lista_id,titulo,status_id,prioridade,data_entrega,tarefa_pai_id,recorrencia,recorrencia_dias_semana,criado_por)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [lista, titulo, extra.status || st['A fazer'], extra.prioridade || 'normal', extra.entrega || null, extra.pai || null, extra.rec || null, extra.dias || null, douglas])).id;
    const setup = await tarefa(gestao, 'Setup inicial', {status: st['Em andamento'], entrega: '2026-01-10'});
    await tarefa(gestao, 'Criar conta de anúncio', {pai: setup});
    await tarefa(gestao, 'Subtarefa feita', {pai: setup, status: st['Concluído']});
    await tarefa(gestao, 'Já concluída', {status: st['Concluído']});
    const revisao = await tarefa(gestao, 'Revisão diária de budget', {rec: 'semanal', dias: [1, 3, 5], entrega: '2026-01-12', prioridade: 'urgente', status: st['Em andamento']});
    await tarefa(contrato, 'Enviar contrato');
    await db.query('insert into tarefas.tarefa_responsaveis(tarefa_id,user_id) values($1,$2),($1,$3),($4,$2)', [setup, pedro, saiu, revisao]);
    await db.query('update tarefas.usuarios set ativo=false where user_id=$1', [saiu]);
    const tarefasMolde = (await um('select count(*)::int n from tarefas.tarefas t join tarefas.listas l on l.id=t.lista_id where l.projeto_id=$1', [modelos])).n;

    await negado(() => duplicar(pedro, {tipo: 'pasta', id: molde, nome: 'Intruso', projeto: tna}), /Só admin/);
    await negado(() => db.transaction(async tx => { await tx.exec('set local role anon'); return tx.query("select public.tarefas_duplicar('lista',gen_random_uuid(),'x')"); }), /permission denied/);

    // Cliente novo a partir do molde, com o padrão da skill de onboarding.
    const cliente = await duplicar(douglas, {tipo: 'pasta', id: molde, nome: '  Cliente Novo ', projeto: tna});
    igual([cliente.pastas, cliente.listas, cliente.tarefas], [2, 3, 4], 'pasta + subpasta, 3 listas, só abertas e a subtarefa aberta');
    const pasta = await um('select * from tarefas.pastas where id=$1', [cliente.id]);
    igual([pasta.nome, pasta.projeto_id, pasta.pasta_pai_id], ['Cliente Novo', tna, null], 'nome aparado, raiz do espaço de destino');
    const sub = await um('select * from tarefas.pastas where pasta_pai_id=$1', [cliente.id]);
    igual([sub.nome, sub.projeto_id], ['Extra', tna], 'subpasta vai junto para o espaço novo');
    igual((await todos('select l.nome from tarefas.listas l where l.pasta_id=any($1) order by l.nome', [[cliente.id, sub.id]])).map(r => r.nome), ['Contrato', 'Gestão de Tráfego', 'Sub']);
    const copia = await todos(`select t.titulo,t.status_id,t.data_entrega::text entrega,t.prioridade,t.recorrencia,t.recorrencia_dias_semana dias,t.tarefa_pai_id,t.id,l.projeto_id
      from tarefas.tarefas t join tarefas.listas l on l.id=t.lista_id where l.pasta_id=$1 order by t.titulo`, [cliente.id]);
    igual(copia.map(t => t.titulo), ['Criar conta de anúncio', 'Enviar contrato', 'Revisão diária de budget', 'Setup inicial'], 'concluídas ficam de fora');
    igual(new Set(copia.map(t => t.status_id)), new Set([st['A fazer']]), 'tudo volta para o primeiro status aberto');
    const proxima = (await um("select privado.tarefas_proxima_data(privado.tarefas_hoje()-1,'semanal',1,'{1,3,5}',null,null,null,null)::text d")).d;
    const porTitulo = Object.fromEntries(copia.map(t => [t.titulo, t]));
    igual(porTitulo['Revisão diária de budget'].entrega, proxima, 'recorrente nasce na próxima data da regra');
    igual([porTitulo['Revisão diária de budget'].dias, porTitulo['Revisão diária de budget'].prioridade], [[1, 3, 5], 'urgente'], 'regra e prioridade copiadas');
    igual(porTitulo['Setup inicial'].entrega, null, 'tarefa comum sem data');
    igual(porTitulo['Criar conta de anúncio'].tarefa_pai_id, porTitulo['Setup inicial'].id, 'subtarefa presa na mãe copiada');
    igual((await todos('select user_id from tarefas.tarefa_responsaveis where tarefa_id=$1', [porTitulo['Setup inicial'].id])).map(r => r.user_id), [pedro], 'responsável inativo não vem');
    igual((await um('select count(*)::int n from tarefas.atribuicoes_fila where user_id=$1', [pedro])).n, 2, 'Pedro entra na fila de aviso das tarefas dele');
    igual((await um('select count(*)::int n from tarefas.tarefas t join tarefas.listas l on l.id=t.lista_id where l.projeto_id=$1', [modelos])).n, tarefasMolde, 'molde intacto');

    await negado(() => duplicar(douglas, {tipo: 'pasta', id: molde, nome: 'cliente novo', projeto: tna}), /Já existe uma pasta/);
    await negado(() => duplicar(douglas, {tipo: 'pasta', id: molde, nome: 'Loop', projeto: modelos, pasta: extra}), /dentro dela mesma/);
    await negado(() => duplicar(douglas, {tipo: 'lista', id: gestao, nome: 'X', projeto: tna, pasta: extra}), /não está nesse espaço/);
    await negado(() => duplicar(douglas, {tipo: 'lista', id: gestao, nome: '   ', projeto: modelos}), /Dê um nome/);
    igual((await um("select count(*)::int n from tarefas.pastas where nome='Loop'")).n, 0, 'erro não deixa nada pela metade');

    // Cópia fiel: mantém status, datas e concluídas. Dentro de Modelos não gera aviso.
    const filaAntes = (await um('select count(*)::int n from tarefas.atribuicoes_fila')).n;
    const fiel = await duplicar(douglas, {tipo: 'lista', id: gestao, nome: 'Gestão (cópia)', projeto: modelos, pasta: molde, manter: true, concluidas: true});
    igual(fiel.tarefas, 5, 'todas, inclusive concluídas');
    const f = Object.fromEntries((await todos('select titulo,status_id,data_entrega::text entrega,recorrencia_base::text base,concluida_em from tarefas.tarefas where lista_id=$1', [fiel.id])).map(t => [t.titulo, t]));
    igual([f['Setup inicial'].status_id, f['Setup inicial'].entrega], [st['Em andamento'], '2026-01-10'], 'status e data mantidos');
    igual([f['Revisão diária de budget'].entrega, f['Revisão diária de budget'].base], ['2026-01-12', '2026-01-12'], 'âncora da série mantida');
    igual(f['Já concluída'].concluida_em !== null, true, 'concluída continua concluída');
    igual((await um('select count(*)::int n from tarefas.atribuicoes_fila')).n, filaAntes, 'espaço sem notificação não avisa ninguém');

    const vazia = await duplicar(douglas, {tipo: 'lista', id: gestao, nome: 'Só a lista', projeto: tna, tarefas: false});
    igual([vazia.listas, vazia.tarefas], [1, 0], 'sem tarefas');

    const espaco = await duplicar(douglas, {tipo: 'projeto', id: modelos, nome: 'Modelos 2'});
    const novoEspaco = await um('select cor,notifica from tarefas.projetos where id=$1', [espaco.id]);
    igual([novoEspaco.cor, novoEspaco.notifica], ['#123456', false], 'cor e silêncio de notificação vêm do original');
    igual([espaco.pastas, espaco.listas], [2, 4], 'espaço inteiro com as pastas e listas, incluindo a cópia feita antes');
    await negado(() => duplicar(douglas, {tipo: 'projeto', id: modelos, nome: 'the new ads'}), /Já existe um espaço/);
    console.log(`Duplicar: ${checks} verificações de cópia, opções, travas e avisos OK.`);
  } finally { await db.close(); }
});
