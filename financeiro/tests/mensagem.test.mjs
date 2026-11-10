import test from 'node:test';
import assert from 'node:assert/strict';
import { montarMensagem, telefoneWhatsApp, formatarBRL, formatarData } from '../site/public/mensagem.js';

const modeloAntes = 'Olá, {contato}! Tudo bem?\n\nSegue a fatura da The New Ads.\n\nValor: {valor}\nVencimento: {vencimento}\nReferente a: {descricao}\n\nPara pagar por Pix, boleto ou cartão: {link}';

test('mensagem de cobrança', () => {
  const dados = { contato: 'Lucas', valor: 1500, vencimento: '2026-11-20', descricao: 'Gestão de tráfego', link_fatura: 'https://www.asaas.com/i/abc' };
  assert.equal(montarMensagem(modeloAntes, dados),
    'Olá, Lucas! Tudo bem?\n\nSegue a fatura da The New Ads.\n\nValor: R$ 1.500,00\nVencimento: 20/11/2026\nReferente a: Gestão de tráfego\n\nPara pagar por Pix, boleto ou cartão: https://www.asaas.com/i/abc');
  const semDescricao = montarMensagem(modeloAntes, { ...dados, descricao: null });
  assert.ok(!semDescricao.includes('Referente a'), 'linha some quando a variável está vazia');
  assert.ok(semDescricao.includes('Vencimento: 20/11/2026\n\nPara pagar'));
  assert.ok(montarMensagem(modeloAntes, { ...dados, contato: '' }).startsWith('Olá! Tudo bem?'), 'saudação sem nome');
  assert.equal(montarMensagem('Atrasado há {dias_atraso} dias. {outra}', { dias_atraso: 3 }), 'Atrasado há 3 dias. {outra}', 'variável desconhecida fica como está');
  assert.ok(!montarMensagem(modeloAntes, dados).includes('—'), 'sem travessão');
});

test('telefone, valor e data', () => {
  assert.equal(telefoneWhatsApp('48996936361'), '5548996936361');
  assert.equal(telefoneWhatsApp('(48) 3333-4444'), '554833334444');
  assert.equal(telefoneWhatsApp('5548996936361'), '5548996936361');
  assert.equal(telefoneWhatsApp('048996936361'), '5548996936361');
  assert.equal(telefoneWhatsApp('996936361'), null, 'sem DDD não manda');
  assert.equal(telefoneWhatsApp(null), null);
  assert.equal(formatarBRL(1234567.8).replace(/\s/g, ' '), 'R$ 1.234.567,80');
  assert.equal(formatarData('2026-11-05'), '05/11/2026');
  assert.equal(formatarData('2026-11-05T10:00:00Z', true), '05/11');
});

test('a função usa a mesma mensagem da tela', async () => {
  const { readFile } = await import('node:fs/promises');
  const tela = await readFile(new URL('../site/public/mensagem.js', import.meta.url), 'utf8');
  const funcao = await readFile(new URL('../supabase/functions/financeiro/mensagem.js', import.meta.url), 'utf8');
  assert.equal(funcao, tela, 'rode node scripts/preparar-funcao.mjs');
});
