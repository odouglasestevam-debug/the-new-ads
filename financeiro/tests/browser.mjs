// Abre o app num Chromium com o Supabase simulado e dados inventados (nenhum cliente real),
// passa por todas as telas no computador e no celular, claro e escuro, e salva capturas em tests/artifacts.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('site/public');
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
    const file = await readFile(path);
    const headers = await readFile(resolve(root, '_headers'), 'utf8');
    for (const line of headers.split('\n').filter((l) => l.startsWith('  '))) {
      const i = line.indexOf(':');
      res.setHeader(line.slice(0, i).trim(), line.slice(i + 1).trim());
    }
    res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' })[extname(path)] || 'application/octet-stream');
    res.end(file);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---------- dados inventados, calculados como a view do banco ----------
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dia = (n) => { const d = new Date(hoje + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const entre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const mesComDia = (deslocMes, d) => { const [a, m] = hoje.split('-').map(Number); const dt = new Date(Date.UTC(a, m - 1 + deslocMes, 1, 12)); const ult = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate(); return `${dt.toISOString().slice(0, 8)}${String(Math.min(d, ult)).padStart(2, '0')}`; };

const clientes = [
  ['cus_1', 'Clínica Sorriso Pleno', 'Marina', '48991112222', 1800, 5, 'cedo'],
  ['cus_2', 'Imobiliária Horizonte', null, '48993334444', 2500, 10, 'atrasa'],
  ['cus_3', 'Advocacia Martins e Lima', 'Dr. Paulo', '4833335555', 1500, 15, 'em_dia'],
  ['cus_4', 'Construtora Vale Alto', null, '', 3200, 20, 'em_dia'],
  ['cus_5', 'Estética Bella Forma', 'Carla', '48996667777', 1200, 25, 'devendo'],
  ['cus_6', 'Loja Rota 22', null, '48998889999', 990, 8, 'em_dia'],
  ['cus_7', 'Studio Pilates Núcleo', 'Ana', '48990001111', 1350, 12, 'pausado'],
  ['cus_8', 'Odonto Centro Integrado', null, '48992223333', 2100, 28, 'em_dia'],
];
const fx = { financeiro_clientes: [], financeiro_assinaturas: [], financeiro_cobrancas: [], financeiro_mensagens: [], financeiro_avisos: [], financeiro_usuarios: [{ user_id: 'u1', nome: 'Douglas' }] };
for (const [id, nome, contato, cel, valor, diaVenc, perfil] of clientes) {
  fx.financeiro_clientes.push({ asaas_id: id, nome, contato, celular: cel || null, cpf_cnpj: '12.345.678/0001-90', email: 'financeiro@exemplo.com', excluido: false, cobranca_pausada: perfil === 'pausado', observacao: null });
  fx.financeiro_assinaturas.push({ asaas_id: 'sub_' + id, cliente_id: id, valor, ciclo: 'MONTHLY', forma: 'BOLETO', status: 'ACTIVE', proximo_vencimento: mesComDia(1, diaVenc), descricao: 'Gestão de tráfego', excluida: false });
  for (let m = -11; m <= 1; m++) {
    const venc = mesComDia(m, diaVenc);
    let pago = null;
    if (venc < hoje) {
      if (perfil === 'cedo') pago = dia(entre(hoje, venc) - 2);
      else if (perfil === 'atrasa') pago = m === 0 ? null : dia(entre(hoje, venc) + 4);
      else if (perfil === 'devendo') pago = m >= -1 ? null : dia(entre(hoje, venc) + 1);
      else pago = venc;
    } else if (venc === hoje && perfil === 'cedo') pago = hoje;
    const situacao = pago ? 'paga' : venc < hoje ? 'atrasada' : venc === hoje ? 'vence_hoje' : 'a_vencer';
    const valorMes = valor + (m < -6 ? -200 : 0);
    fx.financeiro_cobrancas.push({
      asaas_id: `pay_${id}_${m}`, cliente_id: id, assinatura_id: 'sub_' + id, valor: valorMes, valor_liquido: valorMes - 1.99,
      forma: pago ? (perfil === 'cedo' ? 'PIX' : 'BOLETO') : 'BOLETO', status: pago ? 'RECEIVED' : situacao === 'atrasada' ? 'OVERDUE' : 'PENDING',
      vencimento: venc, pago_em: pago, descricao: 'Gestão de tráfego', link_fatura: `https://www.asaas.com/i/${id}${m}`, excluida: false,
      cliente_nome: nome, cliente_contato: contato || nome, cliente_celular: cel || null, cobranca_pausada: perfil === 'pausado', cliente_excluido: false,
      situacao, dias_atraso: situacao === 'atrasada' ? entre(venc, hoje) : 0, dias_para_vencer: entre(hoje, venc),
      dias_atraso_pagamento: pago ? Math.max(entre(venc, pago), 0) : null,
    });
  }
}
const pendente = fx.financeiro_cobrancas.find((c) => c.situacao === 'atrasada');
fx.financeiro_mensagens.push(
  { id: 'm1', cobranca_id: pendente.asaas_id, etapa: 'atraso', dia: hoje, telefone: '5548993334444', texto: 'x', situacao: 'simulada', tentativas: 1, erro: null, atualizado_em: new Date().toISOString() },
  { id: 'm2', cobranca_id: 'pay_cus_4_0', etapa: 'antes', dia: dia(-3), telefone: null, texto: 'x', situacao: 'simulada', tentativas: 1, erro: 'Sem celular válido no Asaas: não seria enviada.', atualizado_em: new Date().toISOString() },
);
fx.financeiro_avisos.push(
  { id: 'a1', titulo: 'Clínica Sorriso Pleno pagou', corpo: 'R$ 1.800,00 via Pix. Vencimento 05/11.', url: '#/cliente/cus_1', criado_em: new Date(Date.now() - 3600e3).toISOString(), enviado_em: new Date().toISOString(), tentativas: 1 },
  { id: 'a2', titulo: 'Previsto para novembro', corpo: 'R$ 14.640,00 em 8 cobranças.', url: '#/mes', criado_em: new Date(Date.now() - 86400e3 * 9).toISOString(), enviado_em: new Date().toISOString(), tentativas: 1 },
);
fx.financeiro_config = [{ id: true, cobranca_ativa: false, ativada_em: null, dias_antes: 10, avisar_no_dia: true, cobrar_atraso_diario: true, avisar_atraso_dias: 10, enviar_pix: true,
  texto_antes: 'Olá, {contato}! Tudo bem?\n\nSegue a fatura da The New Ads.\n\nValor: {valor}\nVencimento: {vencimento}\nReferente a: {descricao}\n\nPara pagar por Pix, boleto ou cartão: {link}',
  texto_no_dia: 'Olá, {contato}! Passando para lembrar que a fatura da The New Ads de {valor} vence hoje.\n\nPara pagar: {link}',
  texto_atraso: 'Olá, {contato}. A fatura da The New Ads de {valor}, com vencimento em {vencimento}, ainda consta em aberto.\n\nPara pagar: {link}\n\nSe já pagou, pode desconsiderar esta mensagem.' }];
fx.financeiro_sincronizacoes = [{ id: 1, origem: 'agendada', inicio: new Date(Date.now() - 2 * 3600e3).toISOString(), ok: true, resumo: { cobrancas: 104, clientes: 8 }, erro: null }];
fx.financeiro_eventos = [{ evento: 'PAYMENT_RECEIVED', recebido_em: new Date(Date.now() - 3600e3).toISOString() }];
const envios = fx.financeiro_cobrancas.filter((c) => ['atrasada', 'vence_hoje'].includes(c.situacao) || (c.situacao === 'a_vencer' && c.dias_para_vencer <= 10))
  .filter((c) => !c.cobranca_pausada).map((c) => ({ cobranca_id: c.asaas_id, cliente_id: c.cliente_id, cliente_nome: c.cliente_nome, contato: c.cliente_contato, celular: c.cliente_celular, etapa: c.situacao === 'atrasada' ? 'atraso' : c.situacao === 'vence_hoje' ? 'no_dia' : 'antes', valor: c.valor, vencimento: c.vencimento, descricao: c.descricao, link_fatura: c.link_fatura, dias_atraso: c.dias_atraso, tentativas_hoje: 0, situacao_hoje: null }));

const mock = (vazio) => `
window.fixture = ${JSON.stringify(vazio ? { ...fx, financeiro_cobrancas: [], financeiro_clientes: [], financeiro_assinaturas: [], financeiro_mensagens: [], financeiro_avisos: [], financeiro_sincronizacoes: [], financeiro_eventos: [] } : fx)};
window.fixture.envios = ${JSON.stringify(vazio ? [] : envios)};
window.fixture.escritas = [];
window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: { access_token: 't' } } }),
    signInWithPassword: async () => ({ data: {}, error: null }),
    signOut: async () => ({}),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }) },
  },
  rpc: async (nome) => {
    if (nome === 'financeiro_envios_de_hoje') return { data: fixture.envios, error: null };
    if (nome === 'financeiro_vapid_publica') return { data: 'BPUBLICA', error: null };
    return { data: null, error: null };
  },
  from: (tabela) => {
    let acao = 'select', carga, filtros = [], um = false, limite = null, ini = 0, fim = null;
    const q = {
      select: () => q, order: () => q, limit: (n) => { limite = n; return q; },
      range: (a, b) => { ini = a; fim = b; return q; },
      eq: (k, v) => { filtros.push((r) => r[k] === v); return q; },
      gte: (k, v) => { filtros.push((r) => r[k] >= v); return q; },
      update: (p) => { acao = 'update'; carga = p; return q; },
      delete: () => { acao = 'delete'; return q; },
      single: () => { um = true; return q; }, maybeSingle: () => { um = true; return q; },
      then: (ok) => {
        let linhas = (fixture[tabela] || []).filter((r) => filtros.every((f) => f(r)));
        if (acao !== 'select') { fixture.escritas.push({ tabela, acao, carga }); linhas.forEach((r) => Object.assign(r, carga)); return Promise.resolve({ data: null, error: null }).then(ok); }
        if (fim != null) linhas = linhas.slice(ini, fim + 1);
        if (limite != null) linhas = linhas.slice(0, limite);
        return Promise.resolve({ data: um ? linhas[0] || null : linhas, error: null }).then(ok);
      },
    };
    return q;
  },
}) };`;

const browser = await chromium.launch({ headless: true });
const erros = [];
try {
  await mkdir('tests/artifacts', { recursive: true });
  const telas = ['#/mes', '#/clientes', '#/cliente/cus_2', '#/metricas', '#/cobrancas', '#/ajustes'];
  for (const [nomeAparelho, viewport] of [['desktop', { width: 1280, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    for (const tema of ['claro', 'escuro']) {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', isMobile: nomeAparelho === 'celular', hasTouch: nomeAparelho === 'celular', deviceScaleFactor: nomeAparelho === 'celular' ? 2 : 1 });
      await ctx.addInitScript((t) => { try { localStorage.setItem('fin_tema', t); } catch {} }, tema);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => erros.push(`${nomeAparelho}/${tema}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/service worker|sw\.js|favicon/i.test(m.text())) erros.push(`${nomeAparelho}/${tema} console: ${m.text()}`); });
      await page.route('**/vendor/supabase.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mock(false) }));
      for (const tela of telas) {
        await page.goto(base + '/' + tela);
        await page.waitForSelector('#app:not([hidden]) .cabeca, #app:not([hidden]) .voltar');
        await page.waitForTimeout(250);
        const largura = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(largura <= viewport.width, `${tela} em ${nomeAparelho}/${tema} rola na horizontal (${largura}px)`);
        const nome = tela.replace('#/', '').replace('/', '-');
        await page.screenshot({ path: `tests/artifacts/${nomeAparelho}-${tema}-${nome}.png`, fullPage: true });
      }
      await ctx.close();
    }
  }

  // Interações principais (computador, claro)
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push('interação: ' + e.message));
  await page.route('**/vendor/supabase.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mock(false) }));
  await page.goto(base + '/#/mes');
  await page.waitForSelector('.heroi');
  const heroi = await page.textContent('.heroi');
  assert.match(heroi, /^R\$ /);
  assert.ok(await page.isVisible('text=Em atraso'), 'mês mostra quem está em atraso');

  await page.goto(base + '/#/clientes');
  await page.fill('#busca', 'horiz');
  assert.equal(await page.locator('#lista-clientes .linha').count(), 1, 'busca filtra');
  assert.ok(await page.isVisible('text=Sem celular') === false, 'só o cliente buscado');
  await page.fill('#busca', '');
  assert.ok(await page.locator('#lista-clientes .etiqueta.perigo').count() >= 1, 'marca cliente sem celular');

  await page.goto(base + '/#/cliente/cus_2');
  await page.fill('#cli-contato', 'Rafael');
  await page.check('#cli-pausada');
  await page.click('#form-cliente button');
  await page.waitForFunction(() => window.fixture.escritas.some((e) => e.tabela === 'financeiro_clientes'));
  const escritaCli = await page.evaluate(() => window.fixture.escritas.find((e) => e.tabela === 'financeiro_clientes').carga);
  assert.deepEqual(escritaCli, { contato: 'Rafael', cobranca_pausada: true, observacao: null });

  await page.goto(base + '/#/metricas');
  await page.waitForSelector('#grafico svg');
  assert.equal(await page.locator('#grafico .barra').count() >= 10, true, 'gráfico com as barras dos meses');
  await page.hover('#grafico .coluna:last-of-type .alvo');
  assert.ok(await page.isVisible('#dica-grafico'), 'dica aparece no hover');
  await page.screenshot({ path: 'tests/artifacts/desktop-claro-metricas-dica.png' });

  await page.goto(base + '/#/cobrancas');
  await page.waitForSelector('#envios-hoje details');
  const previa = await page.textContent('#previa-antes');
  assert.match(previa, /R\$ /, 'prévia montada com dado real da fila');
  assert.ok(!previa.includes('{'), 'prévia sem variável sobrando');
  await page.fill('#texto-no_dia', 'Sem link aqui');
  await page.click('#form-textos button');
  assert.match(await page.textContent('#aviso-textos'), /\{link\}/, 'barra texto sem link');
  await page.click('[data-acao="ligar-cobranca"]');
  assert.ok(await page.isVisible('#dialogo[open]'), 'pede confirmação antes de ligar');
  await page.screenshot({ path: 'tests/artifacts/desktop-claro-cobranca-ligar.png' });
  await page.click('[data-acao="confirmar-ligar"]');
  await page.waitForFunction(() => window.fixture.escritas.some((e) => e.tabela === 'financeiro_config' && e.carga.cobranca_ativa === true));
  await page.waitForSelector('text=Voltar ao modo teste');

  // Primeiro acesso, antes da chave do Asaas
  const vazio = await ctx.newPage();
  await vazio.route('**/vendor/supabase.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: mock(true) }));
  vazio.on('pageerror', (e) => erros.push('vazio: ' + e.message));
  await vazio.goto(base + '/#/mes');
  await vazio.waitForSelector('text=Ainda sem dados do Asaas');
  await vazio.screenshot({ path: 'tests/artifacts/desktop-claro-vazio.png', fullPage: true });
  for (const t of ['#/clientes', '#/metricas', '#/cobrancas', '#/ajustes']) {
    await vazio.goto(base + '/' + t);
    await vazio.waitForTimeout(200);
  }
  await ctx.close();

  assert.deepEqual(erros, [], 'nenhum erro de página');
  console.log('Telas, busca, edição de cliente, gráfico, textos, ligar cobrança e estado vazio: OK');
} finally {
  await browser.close();
  server.close();
}
