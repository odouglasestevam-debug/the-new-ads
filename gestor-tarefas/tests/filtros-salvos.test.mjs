import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const ler = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');

test('filtros salvos: cada pessoa só vê e altera os próprios', async () => {
  const db = new PGlite();
  const douglas = randomUUID(), pedro = randomUUID(), crm = randomUUID();
  let checks = 0;
  const igual = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };
  const negado = async (fn, padrao) => { await assert.rejects(fn, padrao); checks++; };
  const como = async (id, sql, params = []) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({sub: id, role: 'authenticated', aal: 'aal2'})]);
    await tx.exec('set local role authenticated');
    return tx.query(sql, params);
  });
  const anonimo = async sql => db.transaction(async tx => { await tx.exec('set local role anon'); return tx.query(sql); });
  const nomes = async id => (await como(id, 'select nome from public.tarefas_filtros_salvos order by nome')).rows.map(r => r.nome);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema privado;create schema vault;
      create table auth.users(id uuid primary key,email text,aud text,role text);
      create table auth.mfa_factors(user_id uuid,status text);
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth,privado to authenticated,service_role;`);
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)', [douglas, 'odouglasestevam@gmail.com', pedro, 'pedro@test.local', crm, 'crm@test.local']);
    await db.exec(await ler('0001_estrutura.sql'));
    const m2 = await ler('0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    for (const m of ['0003_views_publicas.sql', '0004_integridade_e_seguranca.sql', '0005_acessos_por_membro.sql']) await db.exec(await ler(m));
    await db.query("insert into tarefas.usuarios(user_id,nome,email) values($1,'Pedro','pedro@test.local')", [pedro]);
    await db.exec(await ler('0015_filtros_salvos.sql'));

    const filtro = JSON.stringify({prioridade: 'urgente', prazo: ['atrasada'], combinacao: 'e'});
    const criado = (await como(douglas, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2) returning id,user_id', ['Urgentes atrasadas', filtro])).rows[0];
    igual(criado.user_id, douglas, 'dono vem da sessão');
    await como(pedro, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2)', ['Meu filtro', filtro]);
    igual(await nomes(douglas), ['Urgentes atrasadas'], 'Douglas vê só o dele');
    igual(await nomes(pedro), ['Meu filtro'], 'Pedro vê só o dele');
    igual(await nomes(crm), [], 'usuário do CRM não vê nada');
    await negado(() => anonimo('select * from public.tarefas_filtros_salvos'));
    await negado(() => como(crm, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2)', ['Intrusão', filtro]));
    await negado(() => como(pedro, 'insert into public.tarefas_filtros_salvos(user_id,nome,filtro) values($1,$2,$3)', [douglas, 'Plantado', filtro]));
    igual((await como(pedro, 'update public.tarefas_filtros_salvos set nome=$1 where id=$2 returning id', ['Mexi', criado.id])).rows.length, 0, 'não altera o de outra pessoa');
    igual((await como(pedro, 'delete from public.tarefas_filtros_salvos where id=$1 returning id', [criado.id])).rows.length, 0, 'não apaga o de outra pessoa');
    await negado(() => como(douglas, 'update public.tarefas_filtros_salvos set user_id=$1 where id=$2', [pedro, criado.id]));
    await negado(() => como(douglas, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2)', ['  urgentes ATRASADAS ', filtro]), /filtros_salvos_nome_idx/);
    await como(pedro, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2)', ['Urgentes atrasadas', filtro]);
    igual((await nomes(pedro)).length, 2, 'mesmo nome em pessoas diferentes é permitido');
    await negado(() => como(douglas, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2)', ['   ', filtro]), /filtros_salvos_nome_check/);
    await negado(() => como(douglas, 'insert into public.tarefas_filtros_salvos(nome,filtro) values($1,$2)', ['Lista', '[1,2]']), /filtros_salvos_filtro_check/);
    await negado(() => como(douglas, "insert into public.tarefas_filtros_salvos(nome,filtro) values('Gigante', jsonb_build_object('x', repeat(md5(random()::text), 400)))"), /filtros_salvos_filtro_check/);
    const novo = JSON.stringify({prioridade: 'alta'});
    igual((await como(douglas, 'update public.tarefas_filtros_salvos set filtro=$1 where id=$2 returning filtro', [novo, criado.id])).rows[0].filtro, {prioridade: 'alta'}, 'dono substitui o conteúdo');
    await db.query('update tarefas.usuarios set ativo=false where user_id=$1', [pedro]);
    igual(await nomes(pedro), [], 'inativo não vê os próprios filtros');
    await db.query('delete from tarefas.usuarios where user_id=$1', [pedro]);
    igual((await db.query('select count(*)::int n from tarefas.filtros_salvos where user_id=$1', [pedro])).rows[0].n, 0, 'excluir membro apaga os filtros dele');
    console.log(`Filtros salvos: ${checks} verificações de dono, isolamento e validação OK.`);
  } finally { await db.close(); }
});
