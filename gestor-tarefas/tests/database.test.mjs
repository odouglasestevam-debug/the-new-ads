import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const ler = path => readFile(new URL(path, import.meta.url), 'utf8');
test('migrações e permissões no PostgreSQL isolado, sem dados reais', async () => {
  const db = new PGlite();
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
      insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','odouglasestevam@gmail.com');
    `);
    await db.exec(await ler('../supabase/migrations/0001_estrutura.sql'));
    // Cron/Vault réseau pertencem ao Supabase. As funções SQL são testadas aqui.
    const m2 = await ler('../supabase/migrations/0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    await db.exec(await ler('../supabase/migrations/0003_views_publicas.sql'));
    await db.exec(await ler('../supabase/migrations/0004_integridade_e_seguranca.sql'));
    const baseline = await db.exec(await ler('../supabase/tests/acesso.sql'));
    const result = baseline.at(-1).rows[0];
    assert.equal(result.ok, result.total, result.falhas);
    assert.equal(result.sobras, 0);
    console.log(`Permissões/recorrência existentes: ${result.ok}/${result.total}`);
    const uid = '00000000-0000-0000-0000-000000000001';
    await db.exec(`insert into auth.mfa_factors(user_id,status) values ('${uid}','verified');`);
    for (const [aal, permitido] of [['aal1', false], ['aal2', true]]) {
      await db.exec(`select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated","aal":"${aal}"}',false); set role authenticated;`);
      const r = await db.query('select privado.tarefas_usuario() as permitido');
      assert.equal(r.rows[0].permitido, permitido, `MFA ${aal}`);
      await db.exec('reset role');
    }
    const p = (await db.query("insert into tarefas.projetos(nome) values ('Teste') returning id")).rows[0].id;
    const l = (await db.query(`insert into tarefas.listas(projeto_id,nome) values ('${p}','A'),('${p}','B') returning id`)).rows;
    const st = (await db.query("select id from tarefas.status where tipo='aberto' order by ordem limit 1")).rows[0].id;
    const t = (await db.query(`insert into tarefas.tarefas(lista_id,titulo,status_id) values ('${l[0].id}','Principal','${st}') returning id`)).rows[0].id;
    const sub = (await db.query(`insert into tarefas.tarefas(lista_id,titulo,status_id,tarefa_pai_id) values ('${l[0].id}','Sub','${st}','${t}') returning id`)).rows[0].id;
    await assert.rejects(db.exec(`update tarefas.tarefas set tarefa_pai_id='${sub}' where id='${t}'`), /subtarefa/);
    await db.exec(`update tarefas.tarefas set lista_id='${l[1].id}' where id='${t}'`);
    assert.equal((await db.query(`select lista_id from tarefas.tarefas where id='${sub}'`)).rows[0].lista_id,l[1].id);
    await assert.rejects(db.exec(`update tarefas.status set tipo='concluido' where id='${st}'`), /Mova as tarefas/);
    await assert.rejects(db.exec(`insert into tarefas.push_inscricoes(user_id,endpoint,p256dh,auth) values ('${uid}','https://127.0.0.1/secret',repeat('a',87),repeat('b',22))`), /não permitido/);
    await db.exec(`insert into tarefas.push_inscricoes(user_id,endpoint,p256dh,auth) values ('${uid}','https://fcm.googleapis.com/push/test',repeat('a',87),repeat('b',22))`);
    console.log('MFA, hierarquia, movimentação atômica, status e endpoints: OK');
  } finally { await db.close(); }
});
