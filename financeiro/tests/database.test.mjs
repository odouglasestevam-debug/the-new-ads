// Migração e regras do financeiro num PostgreSQL isolado (PGlite), sem nenhum dado real.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const ler = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const DOUGLAS = '00000000-0000-0000-0000-00000000000d';
const PEDRO = '00000000-0000-0000-0000-00000000000e';

async function novoBanco() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema privado; create schema vault;
    create table auth.users(id uuid primary key, email text);
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid, status text);
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth, privado, vault to authenticated, service_role;
    grant select on vault.decrypted_secrets to service_role;
    insert into auth.users values ('${DOUGLAS}', 'OdouglasEstevam@gmail.com'), ('${PEDRO}', 'pedro@exemplo.com');
    insert into vault.decrypted_secrets values ('financeiro_vapid_publica', 'BPUBLICA'), ('tarefas_cron', 'outro');
  `);
  await db.exec(await ler('../supabase/migrations/0001_estrutura.sql'));
  return db;
}

// Troca o "hoje" como superusuário e volta ao papel em que o teste estava.
async function hoje(db, d) {
  const papel = (await db.query('select current_user u')).rows[0].u;
  await db.exec(`reset role; create or replace function privado.financeiro_hoje() returns date language sql stable as $$ select '${d}'::date $$; set role ${papel};`);
}
async function como(db, papel, sub, aal = 'aal1') {
  await db.exec('reset role');
  const claims = papel === 'service_role' ? { role: 'service_role' } : papel === 'anon' ? { role: 'anon' } : { sub, role: 'authenticated', aal };
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false); set role ${papel};`);
}
const pagamento = (id, cliente, venc, extra = {}) => ({ id, customer: cliente, value: 1500, netValue: 1495.01, billingType: 'BOLETO', status: 'PENDING', dueDate: venc, invoiceUrl: `https://www.asaas.com/i/${id}`, description: 'Gestão de tráfego', ...extra });
const salvar = (db, p, avisar = true) => db.query('select public.financeiro_salvar_cobranca($1, $2) as s', [JSON.stringify(p), avisar]).then((r) => r.rows[0].s);
const envios = async (db) => (await db.query('select cobranca_id, etapa, celular, dias_atraso from public.financeiro_envios_de_hoje()')).rows;
const mapa = (rows) => Object.fromEntries(rows.map((r) => [r.cobranca_id, r.etapa]));
const msg = (db, c, etapa, tel, situacao, erro = null) => db.query('select public.financeiro_registrar_mensagem($1,$2,$3,$4,$5,$6)', [c, etapa, tel, 'texto', situacao, erro]);
const avisos = async (db) => (await db.query('select chave, titulo, corpo from financeiro.avisos order by criado_em, chave')).rows;

test('estrutura, cópia do Asaas, avisos e regras de cobrança', async () => {
  const db = await novoBanco();
  try {
    assert.deepEqual((await db.query('select user_id::text, nome from financeiro.usuarios')).rows, [{ user_id: DOUGLAS, nome: 'Douglas' }], 'só o Douglas, achado pelo e-mail sem diferenciar maiúscula');
    assert.equal((await db.query('select privado.financeiro_brl(1500) a, privado.financeiro_brl(1234567.8) b, privado.financeiro_brl(0.5) c')).rows[0].a, 'R$ 1.500,00');
    const brl = (await db.query('select privado.financeiro_brl(1234567.8) b, privado.financeiro_brl(0.5) c')).rows[0];
    assert.equal(brl.b, 'R$ 1.234.567,80');
    assert.equal(brl.c, 'R$ 0,50');

    await hoje(db, '2026-11-10');
    await como(db, 'service_role');
    await db.query('select public.financeiro_salvar_cliente($1)', [JSON.stringify({ id: 'cus_A', name: 'Agari Drinks', mobilePhone: '(48) 99693-6361', email: 'a@a.com' })]);
    await db.query('select public.financeiro_salvar_cliente($1)', [JSON.stringify({ id: 'cus_B', name: 'Sem Celular Ltda', mobilePhone: '', phone: null })]);
    await db.query('select public.financeiro_salvar_cliente($1)', [JSON.stringify({ id: 'cus_C', name: 'Clínica C', phone: '4833334444' })]);
    assert.equal((await db.query("select celular from financeiro.clientes where asaas_id='cus_A'")).rows[0].celular, '48996936361');
    assert.equal((await db.query("select celular from financeiro.clientes where asaas_id='cus_B'")).rows[0].celular, null);

    // Edição do app sobrevive ao sincronismo
    await db.exec("update financeiro.clientes set contato = 'Lucas', observacao = 'paga sempre no dia' where asaas_id = 'cus_A'");
    await db.query('select public.financeiro_salvar_cliente($1)', [JSON.stringify({ id: 'cus_A', name: 'Agari Drinks LTDA', mobilePhone: '48996936361' })]);
    const a = (await db.query("select nome, contato, observacao from financeiro.clientes where asaas_id='cus_A'")).rows[0];
    assert.deepEqual(a, { nome: 'Agari Drinks LTDA', contato: 'Lucas', observacao: 'paga sempre no dia' });

    assert.equal(await salvar(db, pagamento('pay_1', 'cus_A', '2026-11-20')), 'a_vencer');
    await salvar(db, pagamento('pay_2', 'cus_A', '2026-11-21'));
    assert.equal(await salvar(db, pagamento('pay_3', 'cus_B', '2026-11-10')), 'vence_hoje');
    assert.equal(await salvar(db, pagamento('pay_4', 'cus_C', '2026-11-05', { status: 'OVERDUE' })), 'atrasada');
    await salvar(db, pagamento('pay_5', 'cus_C', '2026-10-01', { status: 'RECEIVED', paymentDate: '2026-10-01' }), false);
    await salvar(db, pagamento('pay_7', 'cus_C', '2026-06-01', { status: 'RECEIVED', paymentDate: '2026-06-02' }), true);
    // Cliente que só aparece pela cobrança (webhook antes do sincronismo de clientes)
    await salvar(db, pagamento('pay_8', 'cus_NOVO', '2026-12-30'));
    assert.equal((await db.query("select count(*)::int n from financeiro.clientes where asaas_id='cus_NOVO'")).rows[0].n, 1);
    await assert.rejects(salvar(db, { id: 'x', value: 1 }), /sem id, cliente ou vencimento/);

    // Pagou: um aviso só, mesmo com CONFIRMED e depois RECEIVED
    await salvar(db, pagamento('pay_6', 'cus_A', '2026-11-08', { status: 'OVERDUE' }));
    await salvar(db, pagamento('pay_6', 'cus_A', '2026-11-08', { status: 'CONFIRMED', billingType: 'PIX', clientPaymentDate: '2026-11-09' }));
    await salvar(db, pagamento('pay_6', 'cus_A', '2026-11-08', { status: 'RECEIVED', billingType: 'PIX', clientPaymentDate: '2026-11-09', paymentDate: '2026-11-10' }));
    let av = await avisos(db);
    assert.equal(av.length, 1, 'pagamento antigo (pay_7) e carga sem aviso (pay_5) não avisam');
    assert.deepEqual(av[0], { chave: 'pagamento:pay_6', titulo: 'Agari Drinks LTDA pagou', corpo: 'R$ 1.500,00 via Pix. 1 dia depois do vencimento (08/11).' });
    await salvar(db, pagamento('pay_9', 'cus_C', '2026-11-12', { status: 'RECEIVED', billingType: 'BOLETO', paymentDate: '2026-11-10' }));
    assert.equal((await avisos(db)).find((x) => x.chave === 'pagamento:pay_9').corpo, 'R$ 1.500,00 via boleto. Vencimento 12/11.');

    const visao = (await db.query("select asaas_id, situacao, dias_atraso, dias_para_vencer, dias_atraso_pagamento, cliente_contato from financeiro.cobrancas_visao where asaas_id in ('pay_4','pay_6') order by 1")).rows;
    assert.deepEqual(visao, [
      { asaas_id: 'pay_4', situacao: 'atrasada', dias_atraso: 5, dias_para_vencer: -5, dias_atraso_pagamento: null, cliente_contato: 'Clínica C' },
      { asaas_id: 'pay_6', situacao: 'paga', dias_atraso: 0, dias_para_vencer: -2, dias_atraso_pagamento: 1, cliente_contato: 'Lucas' },
    ]);

    // Modo teste (cobrança desligada): 10 dias antes, no dia e atraso
    assert.deepEqual(mapa(await envios(db)), { pay_1: 'antes', pay_3: 'no_dia', pay_4: 'atraso' });
    await msg(db, 'pay_1', 'antes', '5548996936361', 'simulada');
    await msg(db, 'pay_3', 'no_dia', null, 'simulada', 'Cliente sem celular no Asaas');
    await msg(db, 'pay_4', 'atraso', '554833334444', 'simulada');
    assert.deepEqual(mapa(await envios(db)), {}, 'simulado conta como feito no modo teste');

    await hoje(db, '2026-11-11');
    assert.deepEqual(mapa(await envios(db)), { pay_2: 'antes', pay_3: 'atraso', pay_4: 'atraso' }, 'antes só uma vez; atraso todo dia');

    // Liga a cobrança no dia 11: pay_1 já estava na janela dos 10 dias quando o Asaas ainda avisava
    await como(db, 'authenticated', DOUGLAS);
    await db.exec('update public.financeiro_config set cobranca_ativa = true');
    await como(db, 'service_role');
    assert.equal((await db.query('select ativada_em::text d from financeiro.config')).rows[0].d, '2026-11-11');
    await msg(db, 'pay_4', 'atraso', '554833334444', 'simulada');
    const ligada = mapa(await envios(db));
    assert.deepEqual(ligada, { pay_2: 'antes', pay_3: 'atraso', pay_4: 'atraso' }, 'pay_1 fica de fora; simulado de hoje não segura o envio real');

    // Falha: 3 tentativas e vira aviso; enviada nunca volta a falhou
    for (let i = 0; i < 2; i++) await msg(db, 'pay_2', 'antes', '5548996936361', 'falhou', 'n8n respondeu 500');
    assert.ok(mapa(await envios(db)).pay_2, 'ainda tenta com 2 falhas');
    await msg(db, 'pay_2', 'antes', '5548996936361', 'falhou', 'n8n respondeu 500');
    assert.equal(mapa(await envios(db)).pay_2, undefined, 'parou na terceira');
    av = await avisos(db);
    assert.ok(av.some((x) => x.chave === 'falha:pay_2:2026-11-11' && x.corpo === 'Agari Drinks LTDA: n8n respondeu 500.'));
    await msg(db, 'pay_3', 'atraso', null, 'falhou', 'Cliente sem celular no Asaas');
    assert.ok((await avisos(db)).some((x) => x.chave === 'falha:pay_3:2026-11-11'), 'sem celular avisa na primeira');
    assert.equal(mapa(await envios(db)).pay_3, undefined);
    await msg(db, 'pay_4', 'atraso', '554833334444', 'enviada');
    await msg(db, 'pay_4', 'atraso', '554833334444', 'falhou', 'tarde demais');
    assert.equal((await db.query("select situacao from financeiro.mensagens where cobranca_id='pay_4' and dia='2026-11-11'")).rows[0].situacao, 'enviada');

    // Pausar cliente tira tudo dele
    await hoje(db, '2026-11-12');
    assert.ok(mapa(await envios(db)).pay_4);
    await db.exec("update financeiro.clientes set cobranca_pausada = true where asaas_id = 'cus_C'");
    assert.equal(mapa(await envios(db)).pay_4, undefined);
    await db.exec("update financeiro.clientes set cobranca_pausada = false where asaas_id = 'cus_C'");

    // Atraso longo: avisa quem cruzou o limite (10 dias), não quem está atrasado há meses
    await salvar(db, pagamento('pay_velho', 'cus_C', '2026-08-01', { status: 'OVERDUE' }));
    await hoje(db, '2026-11-15');
    assert.equal((await db.query('select public.financeiro_gerar_avisos_atraso() n')).rows[0].n, 1);
    assert.equal((await db.query('select public.financeiro_gerar_avisos_atraso() n')).rows[0].n, 0, 'não repete');
    assert.deepEqual((await avisos(db)).find((x) => x.chave === 'atraso:pay_4'), { chave: 'atraso:pay_4', titulo: 'Clínica C: 10 dias de atraso', corpo: 'R$ 1.500,00 venceu em 05/11 e continua em aberto. A cobrança automática segue todo dia.' });

    // Dia 1: previsto do mês
    await salvar(db, pagamento('pay_dez', 'cus_A', '2026-12-10', { value: 2500 }));
    await hoje(db, '2026-12-01');
    await db.query('select public.financeiro_gerar_aviso_mes()');
    assert.deepEqual((await avisos(db)).find((x) => x.chave === 'mes:2026-12'), { chave: 'mes:2026-12', titulo: 'Previsto para dezembro', corpo: 'R$ 4.000,00 em 2 cobranças. Mais R$ 7.500,00 de meses anteriores em aberto.' });

    // Fila de push
    const reservar = async () => (await db.query('select id, inscricoes from public.financeiro_reservar_avisos()')).rows;
    assert.equal((await reservar()).length, 0, 'sem aparelho inscrito, nada sai da fila');
    await db.exec(`reset role; insert into financeiro.push_inscricoes(user_id, endpoint, p256dh, auth) values ('${DOUGLAS}', 'https://fcm.googleapis.com/fcm/send/x', 'p', 'a'); set role service_role;`);
    const pend = await reservar();
    assert.ok(pend.length >= 5);
    assert.equal(pend[0].inscricoes.length, 1);
    assert.equal((await reservar()).length, 0, 'reservado não sai de novo (webhook e cron juntos)');
    await db.query('select public.financeiro_marcar_aviso($1, true, null)', [pend[0].id]);
    await db.query('select public.financeiro_marcar_aviso($1, false, $2)', [pend[1].id, 'HTTP 500']);
    const volta = await reservar();
    assert.deepEqual(volta.map((x) => x.id), [pend[1].id], 'o que falhou volta para a fila');

    // Lote (carga do Asaas)
    assert.equal((await db.query("select public.financeiro_salvar_lote('clientes', $1) n", [JSON.stringify([{ id: 'cus_L1', name: 'L1' }, { id: 'cus_L2', name: 'L2' }])])).rows[0].n, 2);
    assert.equal((await db.query("select public.financeiro_salvar_lote('assinaturas', $1) n", [JSON.stringify([{ id: 'sub_1', customer: 'cus_L1', value: 900, cycle: 'MONTHLY', status: 'ACTIVE', nextDueDate: '2026-12-15' }])])).rows[0].n, 1);
    await assert.rejects(db.query("select public.financeiro_salvar_lote('outra', '[]')"), /Tipo desconhecido/);
    await db.query("select public.financeiro_marcar_sumido('cobranca', 'pay_2')");
    assert.equal((await db.query("select situacao from financeiro.cobrancas_visao where asaas_id='pay_2'")).rows[0].situacao, 'excluida');
    assert.equal((await db.query("select count(*)::int n from public.financeiro_envios_de_hoje() where cobranca_id='pay_2'")).rows[0].n, 0, 'excluída não é cobrada');

    // Webhook repetido só é ignorado depois de processado
    const ev = (id) => db.query('select public.financeiro_registrar_evento($1, $2, $3, $4) r', [id, 'PAYMENT_RECEIVED', 'pay_6', '{}']).then((r) => r.rows[0].r);
    assert.equal(await ev('evt_1'), false);
    assert.equal(await ev('evt_1'), false, 'falhou no meio: processa de novo');
    await db.query("select public.financeiro_evento_processado('evt_1')");
    assert.equal(await ev('evt_1'), true);

    const s = (await db.query("select public.financeiro_iniciar_sync('agendada') id")).rows[0].id;
    await db.query("select public.financeiro_concluir_sync($1, false, null, 'HTTP 401 invalid_access_token')", [s]);
    assert.ok((await avisos(db)).some((x) => x.chave === 'sync:2026-12-01' && x.titulo === 'Falha ao ler o Asaas'));
    console.log('Cópia do Asaas, avisos, modo teste, virada, falhas, pausa, atraso longo e mês: OK');
  } finally { await db.close(); }
});

test('permissões: só o Douglas, só o que pode editar', async () => {
  const db = await novoBanco();
  try {
    await hoje(db, '2026-11-10');
    await como(db, 'service_role');
    await db.query('select public.financeiro_salvar_cliente($1)', [JSON.stringify({ id: 'cus_A', name: 'Agari', mobilePhone: '48996936361' })]);
    await salvar(db, pagamento('pay_1', 'cus_A', '2026-11-12'));

    await como(db, 'authenticated', DOUGLAS);
    assert.equal((await db.query('select count(*)::int n from public.financeiro_cobrancas')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from public.financeiro_envios_de_hoje()')).rows[0].n, 1, 'prévia na tela');
    assert.equal((await db.query('select public.financeiro_vapid_publica() v')).rows[0].v, 'BPUBLICA');
    await db.exec("update public.financeiro_clientes set contato = 'Lucas', cobranca_pausada = true where asaas_id = 'cus_A'");
    await assert.rejects(db.exec("update public.financeiro_clientes set nome = 'X'"), /permission denied/);
    await assert.rejects(db.exec("update public.financeiro_cobrancas set valor = 1"), /permission denied|cannot update/);
    await assert.rejects(db.exec("update public.financeiro_config set ativada_em = '2020-01-01'"), /permission denied/);
    await db.exec('update public.financeiro_config set dias_antes = 7');
    await assert.rejects(db.exec('update public.financeiro_config set dias_antes = 0'), /check/);
    await assert.rejects(db.query('select public.financeiro_salvar_cobranca($1, true)', [JSON.stringify(pagamento('pay_x', 'cus_A', '2026-11-12'))]), /permission denied/);
    await assert.rejects(db.query("select public.financeiro_ler_segredo('cron')"), /permission denied/);
    await db.query("select public.financeiro_salvar_push('https://fcm.googleapis.com/fcm/send/abc', 'p', 'a')");
    await assert.rejects(db.query("select public.financeiro_salvar_push('https://127.0.0.1/roubo', 'p', 'a')"), /check/);
    await db.exec("delete from public.financeiro_push_inscricoes");

    await como(db, 'authenticated', PEDRO);
    for (const v of ['financeiro_cobrancas', 'financeiro_clientes', 'financeiro_config', 'financeiro_avisos', 'financeiro_mensagens', 'financeiro_usuarios']) {
      assert.equal((await db.query(`select count(*)::int n from public.${v}`)).rows[0].n, 0, `Pedro não vê ${v}`);
    }
    assert.equal((await db.query('select count(*)::int n from public.financeiro_envios_de_hoje()')).rows[0].n, 0);
    const r = await db.query('update public.financeiro_config set cobranca_ativa = true');
    assert.equal(r.affectedRows, 0);
    await assert.rejects(db.query("select public.financeiro_salvar_push('https://fcm.googleapis.com/fcm/send/p', 'p', 'a')"), /Sem acesso/);
    await assert.rejects(db.query('select public.financeiro_vapid_publica()'), /Sem acesso/);

    await como(db, 'anon');
    await assert.rejects(db.query('select * from public.financeiro_cobrancas'), /permission denied/);

    // Com autenticador cadastrado, só entra com o segundo fator
    await db.exec('reset role');
    await db.exec(`insert into auth.mfa_factors(user_id, status) values ('${DOUGLAS}', 'verified')`);
    await como(db, 'authenticated', DOUGLAS, 'aal1');
    assert.equal((await db.query('select count(*)::int n from public.financeiro_cobrancas')).rows[0].n, 0);
    await como(db, 'authenticated', DOUGLAS, 'aal2');
    assert.equal((await db.query('select count(*)::int n from public.financeiro_cobrancas')).rows[0].n, 1);
    console.log('Permissões, colunas editáveis, MFA e endpoints de push: OK');
  } finally { await db.close(); }
});
