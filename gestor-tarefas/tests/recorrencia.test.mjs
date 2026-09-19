import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
const ler = file => readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8');

test('recorrência por dias da semana, dia do mês e dia da semana do mês', async () => {
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
    `);
    await db.exec(await ler('0001_estrutura.sql'));
    const m2 = await ler('0002_servidor_e_lembrete.sql');
    await db.exec(m2.slice(0, m2.indexOf('create extension')));
    for (const f of ['0003_views_publicas.sql', '0004_integridade_e_seguranca.sql', '0005_acessos_por_membro.sql', '0006_excluir_membro.sql', '0007_recorrencia_avancada.sql']) {
      await db.exec(await ler(f));
    }

    // 18/09/2026 é sexta. Semana começa no domingo (0).
    const casos = [
      ['semanal seg/qua/sex, sexta → segunda', `'2026-09-18','semanal',1,'{1,3,5}',null,null,null,null`, '2026-09-21'],
      ['semanal seg/qua/sex, segunda → quarta', `'2026-09-21','semanal',1,'{1,3,5}',null,null,null,null`, '2026-09-23'],
      ['a cada 2 semanas seg/qua/sex, sexta → segunda da semana alternada', `'2026-09-18','semanal',2,'{1,3,5}',null,null,null,null`, '2026-09-28'],
      ['a cada 2 semanas seg/qua, segunda → quarta da mesma semana', `'2026-09-14','semanal',2,'{1,3}',null,null,null,null`, '2026-09-16'],
      ['semanal sem dias escolhidos soma 7 (como antes)', `'2026-09-18','semanal',1,null,null,null,null,null`, '2026-09-25'],
      ['todo dia 10, depois do dia 10 → mês seguinte', `'2026-09-18','mensal',1,null,'dia_mes',10,null,null`, '2026-10-10'],
      ['todo dia 10, antes do dia 10 → mesmo mês', `'2026-09-05','mensal',1,null,'dia_mes',10,null,null`, '2026-09-10'],
      ['todo dia 31 em setembro cai no dia 30', `'2026-09-18','mensal',1,null,'dia_mes',31,null,null`, '2026-09-30'],
      ['último dia do mês', `'2026-09-30','mensal',1,null,'dia_mes',-1,null,null`, '2026-10-31'],
      ['toda 1ª segunda', `'2026-09-18','mensal',1,null,'dia_semana',null,1,1`, '2026-10-05'],
      ['toda 3ª quarta', `'2026-09-18','mensal',1,null,'dia_semana',null,3,3`, '2026-10-21'],
      ['toda última sexta (ainda em setembro)', `'2026-09-18','mensal',1,null,'dia_semana',null,-1,5`, '2026-09-25'],
      ['a cada 3 meses, dia 15', `'2026-09-18','mensal',3,null,'dia_mes',15,null,null`, '2026-12-15'],
      ['mensal sem regra soma 1 mês (como antes)', `'2026-01-31','mensal',1,null,null,null,null,null`, '2026-02-28'],
      ['diária a cada 2 dias', `'2026-09-18','diaria',2,null,null,null,null,null`, '2026-09-20'],
      ['anual', `'2026-09-18','anual',1,null,null,null,null,null`, '2027-09-18'],
    ];
    for (const [nome, args, esperado] of casos) {
      const r = await db.query(`select privado.tarefas_proxima_data(${args})::text as d`);
      assert.equal(r.rows[0].d, esperado, nome);
    }

    // Gatilho: concluir gera a próxima com a regra, o início anda junto e a regra é copiada.
    const st = (await db.query(`select id, tipo from tarefas.status order by ordem`)).rows;
    const aberto = st.find(s => s.tipo === 'aberto').id, feito = st.find(s => s.tipo === 'concluido').id;
    const p = (await db.query(`insert into tarefas.projetos(nome) values ('P') returning id`)).rows[0].id;
    const l = (await db.query(`insert into tarefas.listas(projeto_id,nome) values ('${p}','L') returning id`)).rows[0].id;
    const t = (await db.query(`insert into tarefas.tarefas(lista_id,titulo,status_id,data_inicio,data_entrega,recorrencia,recorrencia_dias_semana)
      values ('${l}','Rotina','${aberto}','2026-09-17','2026-09-18','semanal','{1,3,5}') returning id`)).rows[0].id;
    await db.exec(`update tarefas.tarefas set status_id='${feito}' where id='${t}'`);
    const prox = (await db.query(`select n.data_inicio::text i, n.data_entrega::text e, n.recorrencia_dias_semana::text d
      from tarefas.tarefas t join tarefas.tarefas n on n.id=t.proxima_id where t.id='${t}'`)).rows[0];
    assert.deepEqual(prox, { i: '2026-09-20', e: '2026-09-21', d: '{1,3,5}' }, 'próxima gerada pelo gatilho');

    // Trocar o tipo apaga a regra que não serve mais.
    await db.exec(`update tarefas.tarefas set recorrencia='diaria' where id=(select proxima_id from tarefas.tarefas where id='${t}')`);
    const limpo = (await db.query(`select recorrencia_dias_semana from tarefas.tarefas where id=(select proxima_id from tarefas.tarefas where id='${t}')`)).rows[0];
    assert.equal(limpo.recorrencia_dias_semana, null, 'regra semanal descartada ao virar diária');

    // Valores fora do permitido são recusados pelo banco.
    await assert.rejects(db.exec(`insert into tarefas.tarefas(lista_id,titulo,status_id,recorrencia,recorrencia_dias_semana) values ('${l}','x','${aberto}','semanal','{7}')`));
    await assert.rejects(db.exec(`insert into tarefas.tarefas(lista_id,titulo,status_id,recorrencia,recorrencia_mensal,recorrencia_ordem,recorrencia_dia_semana) values ('${l}','x','${aberto}','mensal','dia_semana',5,1)`));

    // A visão pública expõe os campos novos.
    const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='tarefas_visao' and column_name like 'recorrencia_%'`)).rows.map(r => r.column_name);
    assert.ok(cols.includes('recorrencia_dias_semana') && cols.includes('recorrencia_dia_semana'), 'colunas novas na view');
    console.log(`Recorrência: ${casos.length} regras de data, gatilho, limpeza e validação OK.`);
  } finally { await db.close(); }
});
