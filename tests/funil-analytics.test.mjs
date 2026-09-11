import test from 'node:test';
import assert from 'node:assert/strict';
import * as BI from '../the-new-ads-site/funil/analytics-core.mjs';
import { fixture } from './funil-analytics.fixture.mjs';
const now = new Date('2026-09-11T20:00:00Z');
const empty = () => ({ leads: [], eventos: [], agendamentos: [], etapas: [], midia: [] });
const p = { start: '2026-09-01', end: '2026-09-07' };
const lead = (id, extra = {}) => ({ id, created_at: '2026-09-02T14:00:00Z', nicho: 'vet', ad_id: '123', etapa: 'novo', qualificado: null, simulado: false, ...extra });
const media = (extra = {}) => ({ data: '2026-09-02', source_id: '123', anuncio: 'AD01_VET', investimento: 100, impressoes: 1000, cliques_no_link: 10, simulado: false, ...extra });
function view(raw, niche = '') { return BI.slice(BI.prepare(raw, 'real', now), p, niche); }

test('custo por nicho associa por ID mesmo com nome alterado e conserva gasto sem conversão', () => {
  const raw = empty(); raw.leads = [lead('1', { utm_content: 'nome%20velho', qualificado: true })]; raw.midia = [media({ anuncio: 'Nome inteiramente novo' }), media({ source_id: '456', anuncio: 'AD03_EVENTOS', investimento: 50 })];
  assert.equal(BI.metrics(view(raw, 'vet')).cpql, 100);
  assert.equal(BI.metrics(view(raw, 'eventos')).spend, 50);
  assert.equal(BI.metrics(view(raw, 'eventos')).cpl, null);
  assert.equal(BI.metrics(view(raw)).spend, 150);
});
test('nome só serve de fallback sem ID e com correspondência única', () => {
  const raw = empty(); raw.midia = [media()]; raw.leads = [lead('1', { ad_id: 'inexistente', utm_content: 'AD01_VET' }), lead('2', { ad_id: null, utm_content: 'AD01_VET' })];
  const d = view(raw); assert.equal(d.leads[0].match, 'sem_correspondencia'); assert.equal(d.leads[1].match, 'nome'); assert.equal(BI.metrics(d).paidLeads, 1);
  raw.midia.push(media({ source_id: '456' })); assert.equal(BI.metrics(view(raw)).paidLeads, 0);
});
test('leads sem atribuição não diluem CPL e nulo não se torna desqualificado', () => {
  const raw = empty(); raw.midia = [media()]; raw.leads = [lead('1'), lead('2', { ad_id: null }), lead('3', { ad_id: null, qualificado: false })];
  const m = BI.metrics(view(raw)); assert.equal(m.cpl, 100); assert.equal(m.leads, 3); assert.equal(m.unclassified, 2); assert.equal(m.rejected, 1);
});
test('reagendamento não duplica lead e reuniões pendentes não viram no-show', () => {
  const raw = empty(); raw.leads = [lead('1', { qualificado: true }), lead('2')]; raw.midia = [media()];
  raw.agendamentos = ['no_show', 'realizada', 'cancelada'].map((situacao, i) => ({ id: String(i), lead_id: '1', created_at: '2026-09-03T13:00:00Z', inicio: '2026-09-05T13:00:00Z', situacao }));
  raw.agendamentos.push({ id: '4', lead_id: '2', created_at: '2026-09-03T13:00:00Z', inicio: '2026-09-06T13:00:00Z', situacao: 'agendado' });
  const m = BI.metrics(view(raw)); assert.equal(m.booked, 2); assert.equal(m.held, 1); assert.equal(m.noShowRate, .5); assert.equal(m.pending, 1); assert.equal(m.cpHeld, 100);
});
test('conversão posterior acompanha coorte do lead e valor negociado prevalece', () => {
  const raw = empty(); raw.leads = [lead('1', { etapa: 'cliente', fee_mensal: 1500, meses_previstos: 4, valor_contrato: 5000, fechado_em: '2026-09-10T12:00:00Z' })]; raw.midia = [media()];
  raw.etapas = [{ lead_id: '1', para: 'proposta', em: '2026-09-09T12:00:00Z' }, { lead_id: '1', para: 'cliente', em: '2026-09-10T12:00:00Z' }];
  const m = BI.metrics(view(raw)); assert.equal(m.won, 1); assert.equal(m.proposals, 1); assert.equal(m.revenue, 5000); assert.equal(m.contractReturn, 50);
  assert.equal(BI.contractValue({ valor_contrato: 0, fee_mensal: 1500, meses_previstos: 4 }), 0); assert.equal(BI.contractValue({}), null);
});
test('janela respeita São Paulo e não inclui o dia seguinte', () => {
  assert.equal(BI.day('2026-09-08T02:59:59Z'), '2026-09-07'); assert.equal(BI.day('2026-09-08T03:00:00Z'), '2026-09-08');
  const raw = empty(); raw.leads = [lead('1', { created_at: '2026-09-08T02:59:59Z' }), lead('2', { created_at: '2026-09-08T03:00:00Z' })]; assert.equal(view(raw).leads.length, 1);
  assert.deepEqual(BI.previousPeriod(p), { start: '2026-08-25', end: '2026-08-31' });
});
test('visitantes da coorte acompanham retorno posterior, sem misturar visitantes antigos', () => {
  const raw = empty();
  const ev = (visitor_id, tipo, date, passo = null) => ({ visitor_id, tipo, created_at: date + 'T14:00:00Z', passo, nicho: 'vet' });
  raw.eventos = [ev('old', 'form_view', '2026-08-30'), ev('old', 'form_start', '2026-09-02'), ev('new', 'form_view', '2026-09-02'), ev('new', 'form_start', '2026-09-09'), ev('orphan', 'form_view', '2026-09-02'), ev('orphan', 'form_step', '2026-09-03', 2)];
  const j = BI.journey(view(raw)); assert.equal(j.rows[0].k, 2); assert.equal(j.rows[1].k, 1); assert.equal(j.rows[3].k, 0); assert.equal(j.orphanSteps, 1);
  assert.ok(j.rows.every(r => r.k <= r.n));
});
test('modos real e simulação são mutuamente exclusivos em todas as fontes', () => {
  const raw = fixture(now); raw.leads.push(lead('real')); raw.midia.push(media());
  const real = BI.prepare(raw, 'real', now), sim = BI.prepare(raw, 'simulado', now);
  assert.equal(real.leads.length, 1); assert.equal(sim.leads.length, 68); assert.equal(real.eventos.length, 0); assert.equal(real.midia.length, 1);
});
test('faturamento anunciado é uma dimensão independente de qualificado', () => {
  const raw = empty(); raw.leads = [lead('1', { qualificado: true, faturamento: 'R$ 30 mil a R$ 69 mil' }), lead('2', { qualificado: true, faturamento: 'R$ 70 mil a R$ 199 mil' })];
  const m = BI.metrics(view(raw)); assert.equal(m.qualified, 2); assert.equal(m.highRevenue, 1);
  assert.equal(BI.revenueBand('R$ 500 mil ou mais'), 'alto'); assert.equal(BI.revenueBand(null), null);
});
test('conflito no nicho mantém verba no total, sem duplicação entre nichos', () => {
  const raw = empty(); raw.leads = [lead('1'), lead('2', { nicho: 'eventos' })]; raw.midia = [media()];
  assert.equal(BI.metrics(view(raw, 'vet')).spend, 0); assert.equal(BI.metrics(view(raw, 'eventos')).spend, 0); assert.equal(BI.metrics(view(raw, 'desconhecido')).spend, 100);
});
test('estatística lida com zero e é reproduzível sem falsa precisão', () => {
  assert.equal(BI.wilson(0, 0), null); assert.equal(BI.wilson(4, 3), null); const ci = BI.wilson(0, 3); assert.ok(ci[1] > .5);
  const groups = [{ k: 4, n: 10 }, { k: 1, n: 10 }]; assert.deepEqual(BI.bestProbability(groups, 500), BI.bestProbability(groups, 500));
  assert.equal(BI.metrics(view(empty())).cac, null);
});
test('filtro por anúncio acompanha leads, visitantes e origens não atribuídas', () => {
  const raw = empty(); raw.midia = [media()]; raw.leads = [lead('1'), lead('2', { ad_id: null })];
  raw.eventos = [{ visitor_id: 'v1', tipo: 'form_view', created_at: '2026-09-02T14:00:00Z', ad_id: '123' }, { visitor_id: 'v2', tipo: 'form_view', created_at: '2026-09-02T14:00:00Z' }];
  const prepared = BI.prepare(raw, 'real', now), attributed = BI.slice(prepared, p, '', '123'), other = BI.slice(prepared, p, '', 'nao_atribuido');
  assert.equal(BI.metrics(attributed).leads, 1); assert.equal(BI.journey(attributed).rows[0].k, 1);
  assert.equal(BI.metrics(other).leads, 1); assert.equal(BI.journey(other).rows[0].k, 1);
});
test('simulação completa reconcilia 68 leads, 3 presenças e 2 contratos', () => {
  const data = BI.prepare(fixture(now), 'simulado', now), d = BI.slice(data, BI.period(data, 'all')), m = BI.metrics(d);
  assert.equal(m.leads, 68); assert.equal(m.held, 3); assert.equal(m.won, 2); assert.equal(m.revenue, 12000);
  assert.equal(BI.journey(d).rows[0].k, 442); assert.equal(BI.journey(d).rows[4].k, 68); assert.equal(BI.journey(d).rows.at(-1).k, 45);
  assert.ok(Math.abs(BI.weekly(d).reduce((s, w) => s + w.spend, 0) - m.spend) < .00001);
  assert.equal(BI.cohortRows(d).reduce((s, c) => s + c.m.won, 0), m.won);
});
