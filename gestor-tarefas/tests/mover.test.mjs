import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
const ler = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');

test('mover espaço, pasta e lista leva todo o conteúdo junto', async () => {
  const db = new PGlite();
  const admin = randomUUID(), membro = randomUUID();
  const como = async (id, sql, params = []) => db.transaction(async tx => {
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: 'authenticated', aal: 'aal2' })]);
    await tx.exec('set local role authenticated');
    return tx.query(sql, params);
  });
  const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];
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
    `);
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [admin, 'odouglasestevam@gmail.com', membro, 'membro@test.local']);
    await db.exec(await ler('0001_estrutura.sql'));
    const m2 = await ler('0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    for (const f of ['0003_views_publicas.sql', '0004_integridade_e_seguranca.sql', '0005_acessos_por_membro.sql', '0006_excluir_membro.sql',
      '0007_recorrencia_avancada.sql', '0008_recorrencia_ancorada.sql', '0009_mover_espaco.sql']) {
      await db.exec(await ler(f));
    }
    await db.query("insert into tarefas.usuarios(user_id,nome,email,acesso_total) values($1,'Membro','membro@test.local',false)", [membro]);

    // Origem: espaço com lista na raiz e pasta > subpasta > lista, cada lista com tarefa e subtarefa.
    const origem = randomUUID(), destino = randomUUID(), pastaDestino = randomUUID();
    const pasta = randomUUID(), sub = randomUUID(), listaRaiz = randomUUID(), listaPasta = randomUUID(), listaSub = randomUUID();
    await db.query("insert into tarefas.projetos(id,nome) values($1,'Tubarão'),($2,'Churn')", [origem, destino]);
    await db.query("insert into tarefas.pastas(id,projeto_id,nome) values($1,$2,'Cliente X'),($3,$4,'Saíram em 2026')", [pasta, origem, pastaDestino, destino]);
    await db.query("insert into tarefas.pastas(id,projeto_id,pasta_pai_id,nome) values($1,$2,$3,'Site')", [sub, origem, pasta]);
    await db.query("insert into tarefas.listas(id,projeto_id,pasta_id,nome) values($1,$4,null,'Interno'),($2,$4,$5,'Tráfego'),($3,$4,$6,'Loja')",
      [listaRaiz, listaPasta, listaSub, origem, pasta, sub]);
    const st = (await um("select id from tarefas.status where tipo='aberto' order by ordem limit 1")).id;
    for (const l of [listaRaiz, listaPasta, listaSub]) {
      const t = (await um("insert into tarefas.tarefas(lista_id,titulo,status_id) values($1,'T',$2) returning id", [l, st])).id;
      await db.query("insert into tarefas.tarefas(lista_id,titulo,status_id,tarefa_pai_id) values($1,'S',$2,$3)", [l, st, t]);
    }
    await db.query('insert into tarefas.acesso_espacos(user_id,projeto_id) values($1,$2)', [membro, origem]);
    await db.query('insert into tarefas.bloqueio_listas(user_id,lista_id) values($1,$2)', [membro, listaSub]);

    // Só admin, e nunca para dentro dele mesmo.
    await assert.rejects(como(membro, 'select public.tarefas_mover_espaco($1,$2,$3)', [origem, destino, null]), /Só administrador/);
    await assert.rejects(como(admin, 'select public.tarefas_mover_espaco($1,$2,$3)', [origem, origem, null]), /dele mesmo/);
    await assert.rejects(como(admin, 'select public.tarefas_mover_espaco($1,$2,$3)', [origem, null, pasta]), /dele mesmo/);

    const nova = (await como(admin, 'select public.tarefas_mover_espaco($1,$2,$3) as id', [origem, null, pastaDestino])).rows[0].id;
    const pastaNova = await um('select nome, projeto_id, pasta_pai_id from tarefas.pastas where id=$1', [nova]);
    assert.deepEqual(pastaNova, { nome: 'Tubarão', projeto_id: destino, pasta_pai_id: pastaDestino }, 'espaço virou pasta no destino');
    assert.equal((await um('select count(*)::int n from tarefas.projetos where id=$1', [origem])).n, 0, 'espaço de origem apagado');
    for (const id of [pasta, sub]) assert.equal((await um('select projeto_id from tarefas.pastas where id=$1', [id])).projeto_id, destino, 'pasta foi junto');
    assert.equal((await um('select pasta_pai_id from tarefas.pastas where id=$1', [pasta])).pasta_pai_id, nova, 'pasta da raiz entrou na pasta nova');
    assert.equal((await um('select pasta_id from tarefas.listas where id=$1', [listaRaiz])).pasta_id, nova, 'lista da raiz entrou na pasta nova');
    for (const id of [listaRaiz, listaPasta, listaSub]) assert.equal((await um('select projeto_id from tarefas.listas where id=$1', [id])).projeto_id, destino, 'lista foi junto');
    assert.equal((await um('select count(*)::int n from tarefas.tarefas')).n, 6, 'nenhuma tarefa perdida');
    assert.equal((await um('select count(*)::int n from tarefas.acesso_espacos where user_id=$1', [membro])).n, 0, 'liberação do espaço de origem sai');
    assert.equal((await um('select count(*)::int n from tarefas.bloqueio_listas where user_id=$1', [membro])).n, 1, 'bloqueio de lista continua');

    // Pasta de volta para outro espaço: subpasta e listas acompanham.
    const outro = randomUUID();
    await db.query("insert into tarefas.projetos(id,nome) values($1,'The New Ads')", [outro]);
    await como(admin, 'update public.tarefas_pastas set projeto_id=$1, pasta_pai_id=null where id=$2', [outro, pasta]);
    assert.equal((await um('select projeto_id from tarefas.pastas where id=$1', [sub])).projeto_id, outro, 'subpasta acompanhou');
    for (const id of [listaPasta, listaSub]) assert.equal((await um('select projeto_id from tarefas.listas where id=$1', [id])).projeto_id, outro, 'lista da pasta acompanhou');

    // Lista sozinha para uma pasta de outro espaço: o espaço se ajusta pela pasta.
    await como(admin, 'update public.tarefas_listas set pasta_id=$1, projeto_id=$2 where id=$3', [pastaDestino, destino, listaSub]);
    assert.deepEqual(await um('select projeto_id, pasta_id from tarefas.listas where id=$1', [listaSub]), { projeto_id: destino, pasta_id: pastaDestino });
    console.log('Mover espaço, pasta e lista: OK');
  } finally { await db.close(); }
});
