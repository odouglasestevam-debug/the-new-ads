import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
const ler = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');

test('alerta e erro do n8n: tarefa vence no mesmo dia, comentário em vez de repetir', async () => {
  const db = new PGlite();
  const douglas = randomUUID();
  const um = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema privado;create schema vault;
      create table auth.users(id uuid primary key,email text,aud text,role text);
      create table auth.mfa_factors(user_id uuid,status text);
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth,privado to authenticated,service_role;`);
    await db.query('insert into auth.users(id,email) values($1,$2)', [douglas, 'odouglasestevam@gmail.com']);
    await db.exec(await ler('0001_estrutura.sql'));
    const m2 = await ler('0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    for (const m of ['0003_views_publicas.sql', '0004_integridade_e_seguranca.sql', '0005_acessos_por_membro.sql', '0006_excluir_membro.sql',
      '0007_recorrencia_avancada.sql', '0008_recorrencia_ancorada.sql', '0009_notificacoes.sql', '0011_notificacoes_por_espaco.sql',
      '0012_tarefa_de_alerta.sql', '0014_tarefa_de_erro_n8n.sql', '0017_tarefa_de_erro_entrega_no_dia.sql']) await db.exec(await ler(m));
    const projeto = (await um("insert into tarefas.projetos(nome) values ('The New Ads') returning id")).id;
    const lista = (await um('insert into tarefas.listas(projeto_id,nome) values($1,$2) returning id', [projeto, 'Gestão de Tráfego'])).id;
    const hoje = (await um("select (now() at time zone 'America/Sao_Paulo')::date::text d")).d;

    const alerta = randomUUID();
    const r = (await um("select public.tarefa_de_alerta($1,'tracking:cliente',$2,'Analisar e resolver falha no tracking do Cliente','row_number nulo',now()) r", [alerta, lista])).r;
    assert.equal(r.acao, 'criada');
    const t = await um('select data_inicio::text inicio, data_entrega::text entrega, extract(isodow from data_entrega)::int dow from tarefas.tarefas where id=$1', [r.tarefa_id]);
    assert.equal(t.inicio, t.entrega, 'começa e vence no mesmo dia');
    assert.ok(t.dow <= 5, 'nunca em fim de semana');
    assert.ok(t.entrega >= hoje && (await um("select ($1::date - $2::date) n", [t.entrega, hoje])).n <= 2, 'hoje ou a segunda seguinte');
    assert.equal((await um('select situacao from tarefas.tarefas_visao where id=$1', [r.tarefa_id])).situacao, t.dow <= 5 && t.entrega === hoje ? 'vence_hoje' : 'a_vencer');
    assert.equal((await um("select public.tarefa_de_alerta($1,'tracking:cliente',$2,'x','y',now()) r", [alerta, lista])).r.acao, 'ja_tratado', 'mesmo alerta não repete');
    const outro = (await um("select public.tarefa_de_alerta($1,'tracking:cliente',$2,'Analisar e resolver falha no tracking do Cliente','de novo',now()) r", [randomUUID(), lista])).r;
    assert.deepEqual([outro.acao, outro.tarefa_id], ['comentada', r.tarefa_id], 'alerta novo vira comentário na tarefa aberta');

    const n8n = (await um("select public.n8n_erro_registrar('wf1',10,true,$1,'Analisar e resolver falha no n8n: Fluxo','Analisar e resolver falha no n8n: Fluxo','erro') r", [lista])).r;
    assert.equal(n8n.acao, 'criada');
    assert.equal((await um('select data_entrega::text e from tarefas.tarefas where id=$1', [n8n.tarefa_id])).e, t.entrega, 'erro do n8n segue a mesma regra');
    assert.equal((await um("select public.n8n_erro_registrar('wf1',11,true,$1,'Analisar e resolver falha no n8n: Fluxo','Analisar e resolver falha no n8n: Fluxo','erro 2') r", [lista])).r.acao, 'ja_comentada_hoje', 'no máximo um comentário por dia');
    console.log('Tarefa de erro: vence no dia, sem fim de semana, sem repetir e comentando uma vez por dia: OK.');
  } finally { await db.close(); }
});
