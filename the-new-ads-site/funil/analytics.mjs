import * as BI from './analytics-core.mjs';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './analytics-config.mjs';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = v => v === null || v === undefined || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const precise = v => v === null || v === undefined || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const number = v => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v);
const percent = v => v === null || v === undefined || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(v);
const dateLabel = v => v ? v.slice(8, 10) + '/' + v.slice(5, 7) : '—';
const fullDate = v => v ? `${dateLabel(v)}/${v.slice(0, 4)}` : '—';
const duration = v => v === null ? '—' : v < 1 ? `${Math.round(v * 24)}h` : `${v.toFixed(1).replace('.', ',')}d`;
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  funnel: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>', niches: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M2 21v-3a6 6 0 0 1 12 0v3M17 15a4 4 0 0 1 5 4v2"/>',
  media: '<path d="m3 10 17-6v16L3 14zM7 16l2 5h3l-2-5M20 9h2v6h-2"/>', commercial: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 12c6 4 12 4 18 0M10 14h4"/>', quality: '<path d="m12 3 9 4v6c0 4-9 8-9 8s-9-4-9-8V7zM8 12l3 3 5-6"/>',
  arrow: '<path d="M7 17 17 7M7 7h10v10"/>', back: '<path d="M19 12H5m6-6-6 6 6 6"/>', download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>', refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', check: '<path d="m5 12 4 4L19 6"/>', chevron: '<path d="m9 5 7 7-7 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.info}</svg>`;
const VIEWS = { overview: ['Visão geral', 'Acompanhe o caminho entre investimento, oportunidades e contratos.'], funnel: ['Funil e conversão', 'Localize o último passo alcançado e o que precisa ser investigado.'], niches: ['Nichos e qualidade', 'Compare custo e perfil do lead antes de escolher onde concentrar a verba.'], media: ['Mídia e criativos', 'Conecte cada anúncio aos resultados que ele trouxe para o negócio.'], commercial: ['Comercial e receita', 'Acompanhe presença, propostas e contratos das coortes captadas.'], quality: ['Qualidade dos dados', 'Veja o que sustenta os números e o que ainda precisa ser registrado.'] };
const params = new URLSearchParams(location.search);
const state = { view: VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'overview', niche: BI.NICHES[params.get('nicho')] ? params.get('nicho') : '', range: ['7', '28', '56', '90', 'all', 'custom'].includes(params.get('periodo')) ? params.get('periodo') : '56', mode: params.get('dados') === 'simulado' ? 'simulado' : 'real', start: params.get('inicio') || '', end: params.get('fim') || '', ad: params.get('anuncio') || '', sort: 'spend', descending: true, search: '', page: 0 };
let raw = null, sb = null, loadedAt = null, charts = [], current = null, exporting = [], updating = false, loadVersion = 0;

function chart(id, type, labels, datasets, options = {}) {
  const canvas = $(id); if (!canvas) return;
  if (!window.Chart) { canvas.parentElement.innerHTML = '<div class="chart-missing">Gráfico indisponível. Consulte os valores na tabela desta seção.</div>'; return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  charts.push(new Chart(canvas, { type, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, animation: reduced ? false : { duration: 180 }, interaction: { intersect: false, mode: 'index' }, plugins: { legend: { display: true, position: 'bottom', align: 'start', labels: { usePointStyle: true, pointStyle: 'rect', boxWidth: 7, boxHeight: 7, padding: 18, color: '#a0a3a8', font: { size: 11, family: 'Switzer, system-ui' } } }, tooltip: { backgroundColor: '#232323', borderColor: '#424242', borderWidth: 1, padding: 12, callbacks: { label: c => `${c.dataset.label}: ${c.dataset.money ? precise(c.parsed.y ?? c.parsed) : number(c.parsed.y ?? c.parsed)}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#a0a3a8', maxRotation: 0, maxTicksLimit: 8, font: { size: 10 } } }, y: { beginAtZero: true, border: { display: false }, grid: { color: '#292929' }, ticks: { color: '#a0a3a8', precision: 0, maxTicksLimit: 5, font: { size: 10 } } } }, ...options } }));
}
function canvas(id, label, tall = false) { return `<div class="chart${tall ? ' tall' : ''}"><canvas id="${id}" role="img" aria-label="${esc(label)}">${esc(label)}. Os valores estão disponíveis na tabela da seção.</canvas></div>`; }
function panel(title, desc, content, span = 6, footer = '', action = '') {
  return `<section class="panel span-${span}"><div class="panel-head"><div><h2>${title}</h2>${desc ? `<p>${desc}</p>` : ''}</div>${action}</div><div class="panel-body">${content}</div>${footer ? `<div class="panel-foot">${footer}</div>` : ''}</section>`;
}
function table(headers, rows, label, { rawRows = false } = {}) {
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table><caption class="sr-only">${esc(label)}</caption><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => rawRows ? row : `<tr>${row.map(v => `<td>${v}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">Nenhum registro neste recorte.</td></tr>`}</tbody></table></div>`;
}
function rate(k, n, interval = true) {
  const value = BI.ratio(k, n), ci = BI.wilson(k, n);
  return `<div class="rate-cell"><span>${percent(value)}</span><small>${number(k)} / ${number(n)}${ci && interval ? ` · IC ${percent(ci[0])}–${percent(ci[1])}` : ''}</small>${ci && interval ? `<div class="range-track" aria-hidden="true"><i class="range-ci" style="--lo:${ci[0] * 100}%;--width:${(ci[1] - ci[0]) * 100}%"></i><i class="range-dot" style="--point:${value * 100}%"></i></div>` : ''}</div>`;
}
function delta(value, previous, lower = false, eligible = true) {
  if (!eligible || state.range === 'all') return '';
  if (value === null || previous === null || !previous) return '<div class="metric-delta">Sem base anterior comparável</div>';
  const v = (value - previous) / previous;
  const tone = Math.abs(v) < .005 ? '' : (lower ? v < 0 : v > 0) ? 'good' : 'bad';
  return `<div class="metric-delta"><b class="${tone}">${v > 0 ? '+' : ''}${percent(v)}</b> vs. período anterior</div>`;
}
function metric(label, value, sub, detail = '', change = '') { return `<div class="metric"><div class="metric-label"><span>${label}</span>${detail ? `<span class="help" tabindex="0" title="${esc(detail)}" aria-label="${esc(detail)}">${icon('info')}</span>` : ''}</div><div class="metric-value">${value}</div><div class="metric-sub">${sub}</div>${change}</div>`; }
function badgeNiche(n) { return `<span class="niche-identity"><i class="swatch" style="--series:${BI.COLORS[n] || BI.COLORS.desconhecido}"></i>${esc(BI.NICHES[n] || n)}</span>`; }
function go(view, label) { return `<button class="text-button" data-go="${view}">${label}</button>`; }
function emptyNotice(m) { return !m.leads && !m.spend && !current.d.eventos.length ? `<div class="empty"><h2>${state.mode === 'real' ? 'A conta ainda não tem dados de veiculação.' : 'Nenhum dado de teste neste recorte.'}</h2><p>${state.mode === 'real' ? 'Há uma única conta Meta Ads e ela ainda não gerou resultados reais. Quando a campanha rodar, os indicadores serão preenchidos aqui. Até lá, você pode validar o painel com os dados de teste inseridos no banco.' : 'Amplie o período ou limpe os filtros para encontrar os dados de teste inseridos.'}</p><button class="button" data-action="${state.mode === 'real' ? 'simulation' : 'clear'}">${state.mode === 'real' ? 'Ver dados de teste' : 'Limpar filtros'}</button></div>` : ''; }

function overview() {
  const { m, prev, d, niches } = current, weekly = BI.weekly(d);
  const largest = [...niches].filter(n => n.m.paidQualified > 0 && n.m.spend > 0).sort((a, b) => a.m.cpql - b.m.cpql)[0];
  const journey = BI.journey(d).rows;
  const loss = [...journey.slice(1)].sort((a, b) => b.lost - a.lost)[0];
  const costs = [['Lead captado', m.cpl, m.paidLeads], ['Lead qualificado', m.cpql, m.paidQualified], ['Reunião marcada', m.cpBooked, m.paidBooked], ['Reunião realizada', m.cpHeld, m.paidHeld], ['Proposta enviada', m.cpProposal, m.paidProposals], ['Cliente conquistado', m.cac, m.paidWon]];
  const maxCost = Math.max(1, ...costs.map(c => c[1] || 0));
  exporting = [['Etapa', 'Quantidade atribuída', 'Custo por resultado'], ...costs.map(c => [c[0], c[2], c[1]])];
  return `<div class="metrics">
    ${metric('Investimento em mídia', money(m.spend), `${number(m.clicks)} cliques · CPC ${precise(m.cpc)}`, 'Soma do investimento em Meta Ads nas datas selecionadas.', delta(m.spend, prev.spend))}
    ${metric('Leads captados', number(m.leads), `${number(m.paidLeads)} com anúncio identificado`, 'Leads únicos por registro no CRM, captados dentro do período.', delta(m.leads, prev.leads))}
    ${metric('Custo por qualificado', money(m.cpql), `${m.paidQualified} qualificados atribuídos`, 'Investimento ÷ leads qualificados com anúncio no recorte. Qualificação pela regra atual.', delta(m.cpql, prev.cpql, true, m.paidQualified >= 10 && prev.paidQualified >= 10))}
    ${metric('Valor contratado', money(m.revenue), `${m.won} contratos${m.unknownRevenue ? ` · ${m.unknownRevenue} sem valor` : ''}`, 'Valor total registrado dos contratos da coorte. Não equivale a receita recebida.')}
  </div>
  <div class="grid">
    ${panel('Aquisição ao longo do tempo', 'Volume de leads e qualificados por semana de captação.', canvas('overview-trend', 'Leads e qualificados por semana', true), 7, 'Barras mostram volume. Investimento e custos de cada semana estão na tabela abaixo.')}
    ${panel('Quanto custa avançar', 'Investimento acumulado por resultado atribuído.', costs.map(([label, value, count]) => `<div class="cost-row"><span>${label}</span><strong>${money(value)}</strong><small>${count} ${label.startsWith('Reunião') ? 'leads com reunião' : 'leads'} atribuídos</small><small>${count < 10 && count > 0 ? 'Amostra pequena' : count ? '' : 'Sem resultado'}</small><div class="cost-bar"><i style="--value:${value === null ? 0 : value / maxCost * 100}%"></i></div></div>`).join(''), 5, 'Marcadas: leads com agendamento não cancelado. Realizadas: leads que compareceram. Cada lead conta uma vez.')}
  </div>
  <div class="grid">
    ${panel('O que merece sua atenção', 'Leitura do recorte para orientar a próxima investigação.', `<div class="insight"><div class="insight-title">${largest ? `${BI.NICHES[largest.key]} tem o menor CPQL observado` : 'A qualidade vem antes da escala'}</div><p>${largest ? `${money(largest.m.cpql)} por qualificado, com ${largest.m.paidQualified} resultados atribuídos. Compare perfil e intervalo de incerteza antes de redistribuir a verba.` : 'Assim que houver leads atribuídos e qualificados, compare o custo entre os nichos.'}</p>${go('niches', 'Comparar os nichos')}</div><div class="insight"><div class="insight-title">${loss?.lost ? `${loss.lost} visitantes não chegaram a “${loss.label}”` : 'Acompanhe o caminho dentro do formulário'}</div><p>O último evento observado indica onde investigar. O painel não consegue afirmar o motivo da interrupção.</p>${go('funnel', 'Investigar a conversão')}</div><div class="insight"><div class="insight-title">${m.pending ? `${m.pending} reuniões precisam de um desfecho` : `${m.resolved} reuniões com resultado registrado`}</div><p>${m.pending ? 'Atualize a presença no Kanban para que no-show e custo por reunião reflitam a operação.' : `No-show observado: ${percent(m.noShowRate)}. Reuniões futuras e canceladas ficam fora dessa taxa.`}</p>${go('commercial', 'Ver a operação comercial')}</div>`, 7)}
    ${panel('O resultado comercial', 'A leitura do fundo precisa de tempo para amadurecer.', `<div class="big-ratio">${m.won} <span class="muted" style="font-size:16px">${m.won === 1 ? 'cliente conquistado' : 'clientes conquistados'}</span></div><div class="inline-facts"><div><strong>${money(m.cac)}</strong><small>CAC de mídia</small></div><div><strong>${m.contractReturn === null ? '—' : m.contractReturn.toFixed(1).replace('.', ',') + 'x'}</strong><small>Contratado / mídia</small></div></div><div class="rule"></div><p class="muted" style="font-size:13px">${m.won < 10 ? `São apenas ${m.won} fechamentos neste recorte. Uma venda pode mudar muito o CAC. Avalie nicho e oferta em janelas trimestrais.` : 'Compare a maturidade das coortes antes de avaliar a conversão comercial.'}</p><div class="rule"></div><p class="muted" style="font-size:12px">O retorno usa apenas contratos atribuídos. Custos de operação, margem, churn e recebimentos ainda não estão disponíveis.</p>`, 5)}
  </div>
  <section class="panel"><div class="panel-head"><div><h2>Aquisição semana a semana</h2><p>Custos são ponderados pelo volume; semanas incompletas estão sinalizadas.</p></div></div><div class="panel-body">${table(['Semana', 'Mídia', 'Cliques', 'Leads', 'Qualificados', 'CPQL pago', 'Qualificação'], weekly.map(w => [dateLabel(w.date) + (w.partial ? '<small>Semana parcial</small>' : ''), money(w.spend), w.clicks, w.leads, w.qualified, precise(w.cpql), rate(w.qualified, w.leads, false)]), 'Aquisição por semana')}</div></section>`;
}

function funnel() {
  const { d, m } = current, j = BI.journey(d), first = j.rows[0].k;
  const lost = [...j.rows.slice(1)].sort((a, b) => b.lost - a.lost);
  exporting = [['Passo', 'Visitantes na sequência', 'Base anterior', 'Taxa de passagem', 'Sem próximo passo'], ...j.rows.map(r => [r.label, r.k, r.n, r.rate, r.lost])];
  const commercial = [['Leads captados', m.leads, m.cpl], ['Qualificados pela regra', m.qualified, m.cpql], ['Leads com reunião marcada', m.booked, m.cpBooked], ['Leads que compareceram', m.held, m.cpHeld], ['Leads com proposta', m.proposals, m.cpProposal], ['Clientes conquistados', m.won, m.cac]];
  return `<div class="metrics">${metric('Visitantes na coorte', number(first), 'Primeira visita no período', 'Visitantes únicos por navegador; retornos fora da janela acompanham sua primeira visita.')}${metric('Iniciaram o formulário', percent(BI.ratio(j.rows[1].k, first)), `${j.rows[1].k} de ${first} visitantes`)}${metric('Informaram o WhatsApp', number(j.rows[4].k), 'Evento de otimização: Lead')}${metric('Concluíram o formulário', number(j.rows.at(-1).k), `${percent(BI.ratio(j.rows.at(-1).k, first))} desde a primeira visita`)}</div>
  <div class="grid">${panel('Da chegada ao formulário completo', 'Mesmos visitantes, na ordem observada. A taxa compara o passo anterior.', `<div class="funnel-head"><span>Passo registrado</span><span>Volume relativo</span><span>Pessoas</span><span>Passagem / IC 95%</span><span>Sem próximo</span></div>${j.rows.map((r, i) => `<div class="funnel-row ${r.key === 'lead' ? 'is-lead' : ''}"><span>${esc(r.label)}${r.key === 'lead' ? '<small>Evento Lead na Meta</small>' : ''}</span><div class="funnel-bar"><i style="--value:${first ? r.k / first * 100 : 0}%;--opacity:${1 - i * .055}"></i></div><strong>${r.k}</strong>${i ? rate(r.k, r.n) : '<span class="muted" style="text-align:right">Entrada</span>'}<span>${i ? r.lost : '—'}</span></div>`).join('')}`, 8, 'IC 95%: intervalo de Wilson. Eventos sem os passos anteriores são reportados em Qualidade dos dados. Troca de aparelho pode quebrar a identidade.')}
  ${panel('Maiores interrupções', 'Ordenadas por visitantes sem o próximo passo registrado.', lost.slice(0, 4).map(r => `<div class="insight"><div class="insight-title">Antes de ${esc(r.label.toLowerCase())}</div><p><strong class="warning">${r.lost} visitantes</strong> · ${percent(BI.ratio(r.lost, r.n))} da base de ${r.n}.</p></div>`).join(''), 4, 'Interrupção observada não prova abandono definitivo. Não há evento de saída nem duração por pergunta.')}
  ${panel('A agenda, em detalhe', 'Visitantes da coorte que abriram a agenda, acompanhados até a última atualização.', `<div class="agenda">${j.agenda.map((r, i) => `<div><strong>${r.k}</strong><span>${r.label}</span><div class="rule"></div><span>${i ? percent(r.rate) + ' de ' + r.n : 'Entrada na agenda'}</span></div>`).join('')}</div>`, 6, 'A agenda atende apenas quem passa pela qualificação. Não trate esse filtro de perfil como falha de conversão.')}
  ${panel('CRM: avanço dos leads', 'Coorte pela criação do lead; uma pessoa é contada uma vez por etapa.', table(['Resultado', 'Leads', 'Custo pago'], commercial.map(r => [r[0], r[1], precise(r[2])]), 'Resultados comerciais por etapa'), 6, 'Estado atual e histórico de etapas identificam propostas e contratos. Esse bloco usa registros do CRM, não visitantes do navegador.')}
  ${panel('Referências para investigação', 'Premissas do briefing. São hipóteses ajustáveis, não metas validadas pela sua operação.', table(['Transição', 'Observado', 'Hipótese do briefing', 'Base'], [
    ['Visita → início', percent(BI.ratio(j.rows[1].k, first)), '35%', `${j.rows[1].k} / ${first}`],
    ['Início → telefone', percent(BI.ratio(j.rows[4].k, j.rows[1].k)), '55%', `${j.rows[4].k} / ${j.rows[1].k}`],
    ['Telefone → completo', percent(BI.ratio(j.rows.at(-1).k, j.rows[4].k)), '75%', `${j.rows.at(-1).k} / ${j.rows[4].k}`],
    ['Agenda → confirmação', percent(BI.ratio(j.agenda[2].k, j.agenda[0].k)), '65%', `${j.agenda[2].k} / ${j.agenda[0].k}`],
    ['Presença em reuniões resolvidas', percent(m.showRate), '75%', `${m.resolved - m.noShow} / ${m.resolved}`],
  ], 'Referências de conversão'), 12, 'Cliques Meta e visitantes do Supabase são fontes e unidades diferentes. Não compõem a mesma taxa de conversão nem o mesmo gráfico de funil.')}</div>`;
}

function nicheTable(rows) {
  return table(['Nicho', 'Investimento', 'Leads', 'CPL pago', 'Qualificados', 'CPQL pago', 'Reunião marcada', 'Reunião feita', 'Clientes', 'CAC pago'], rows.map(({ key, m }) => [`<button class="row-link" data-niche="${key}">${badgeNiche(key)}${icon('arrow')}</button>`, money(m.spend), m.leads, precise(m.cpl), rate(m.qualified, m.leads), precise(m.cpql), `${m.booked}<small>${precise(m.cpBooked)} / lead</small>`, `${m.held}<small>${precise(m.cpHeld)} / lead</small>`, `${m.won}${m.won < 10 ? '<small>Amostra pequena</small>' : ''}`, precise(m.cac)]), 'Comparativo completo por nicho');
}
function nichesView() {
  const { niches, m, d } = current;
  const groups = niches.filter(n => n.m.leads > 0 && n.key !== 'desconhecido');
  const probs = BI.bestProbability(groups.map(n => ({ k: n.m.qualified, n: n.m.leads })));
  const lowPassed = d.leads.filter(l => l.qualificado === true && BI.revenueBand(l.faturamento) === 'baixo').length;
  exporting = [['Nicho', 'Investimento', 'Leads', 'Leads atribuídos', 'CPL', 'Qualificados', 'CPQL', 'Reuniões marcadas (leads)', 'Custo por marcada', 'Reuniões realizadas (leads)', 'Custo por realizada', 'Clientes', 'CAC', 'Valor contratado'], ...niches.map(n => [BI.NICHES[n.key], n.m.spend, n.m.leads, n.m.paidLeads, n.m.cpl, n.m.qualified, n.m.cpql, n.m.booked, n.m.cpBooked, n.m.held, n.m.cpHeld, n.m.won, n.m.cac, n.m.revenue])];
  return `<div class="notice info">${icon('info')}<p><strong>Qualificado não significa faturamento ≥ R$ 70 mil.</strong> A regra atual barra apenas quem fatura menos de R$ 70 mil <strong>e</strong> declara verba de até R$ 1 mil. ${lowPassed} leads abaixo do corte passaram no filtro.</p></div>
  <div class="metrics">${metric('Qualificados pela regra', number(m.qualified), `${percent(m.qualification)} de ${m.leads} leads`)}${metric('Faturamento ≥ R$ 70 mil', number(m.highRevenue), 'Perfil declarado no formulário')}${metric('Custo por perfil ≥ R$ 70 mil', money(m.cpHigh), 'Somente leads atribuídos à mídia')}${metric('Perfil ainda não informado', number(m.unclassified), 'Separado de desqualificados')}</div>
  <div class="grid">${panel('Distribuição de verba e qualidade', 'Participação de cada nicho no investimento, nos leads e nos qualificados.', canvas('niches-mix', 'Participação por nicho em mídia, leads e qualificados'), 6)}
  ${panel('Qualificação com incerteza visível', 'A linha mostra o intervalo de 95%. A posição do ponto é a taxa observada.', groups.map((n, i) => `<div class="insight"><div style="display:flex;justify-content:space-between;gap:12px">${badgeNiche(n.key)}${rate(n.m.qualified, n.m.leads)}</div><p class="confidence" style="margin-top:10px">${probs[i] === null ? 'Ainda sem base para comparar probabilidades.' : `${percent(probs[i])} de probabilidade de ter a maior taxa de qualificação entre os nichos exibidos.`}</p></div>`).join('') || '<p class="muted">Sem leads para estimar a qualificação.</p>', 6, 'Modelo exploratório Beta(1,1), 6.000 sorteios reproduzíveis. Compara qualificação, não rentabilidade; não recomenda pausar anúncios.')}</div>
  <section class="panel"><div class="panel-head"><div><h2>Da verba ao cliente, por nicho</h2><p>Todos os custos usam leads com anúncio identificado no recorte. Clique no nicho para aprofundar.</p></div><button class="button" data-action="export">${icon('download')} CSV</button></div><div class="panel-body">${nicheTable(niches)}</div><div class="panel-foot">O CPL bruto pode ser parecido e o CPQL muito diferente. Nichos sem conversão continuam exibindo seu investimento.</div></section>
  <div class="section-heading"><div><h2>Quem está chegando</h2><p>Respostas declaradas pelos leads do recorte, incluindo campos não informados.</p></div></div>
  <div class="grid">${['faturamento', 'verba', 'ja_investe'].map((field, i) => panel(['Faturamento mensal', 'Verba mensal de mídia', 'Experiência com tráfego'][i], '', distributionHTML(BI.distribution(d.leads, field), d.leads.length), 4)).join('')}</div>
  <div class="grid">${panel('Faturamento × verba de mídia', 'Quantidade de leads por combinação de respostas. Mostra a composição que o booleano esconde.', profileMatrix(d.leads), 12)}</div>`;
}
function distributionHTML(rows, total) { return rows.map(r => `<div class="distribution-row"><div class="distribution-label"><span>${esc(r.label)}</span><strong>${r.n} <span class="muted">· ${percent(BI.ratio(r.n, total))}</span></strong></div><div class="distribution-bar"><i style="--value:${total ? r.n / total * 100 : 0}%"></i></div></div>`).join('') || '<p class="muted">Sem respostas neste recorte.</p>'; }
function profileMatrix(leads) {
  const rows = [...new Set(leads.map(l => l.faturamento || 'Não informado'))].sort(), cols = [...new Set(leads.map(l => l.verba || 'Não informado'))].sort();
  return table(['Faturamento / verba', ...cols.map(esc)], rows.map(r => [esc(r), ...cols.map(c => { const items = leads.filter(l => (l.faturamento || 'Não informado') === r && (l.verba || 'Não informado') === c); return `${items.length || '—'}${items.length ? `<small>${items.filter(l => l.qualificado === true).length} qualificados</small>` : ''}`; })]), 'Matriz de faturamento e verba');
}

function mediaView() {
  const { m, d } = current;
  exporting = [['Anúncio', 'ID', 'Nicho', 'Investimento', 'Impressões', 'Cliques', 'CTR', 'CPC', 'Leads', 'Qualificados', 'CPL', 'CPQL', 'Leads com reunião realizada', 'Clientes', 'CAC'], ...BI.adRows(d).map(a => [a.label, a.key, BI.NICHES[a.niche], a.m.spend, a.m.impressions, a.m.clicks, a.m.ctr, a.m.cpc, a.m.leads, a.m.qualified, a.m.cpl, a.m.cpql, a.m.held, a.m.won, a.m.cac])];
  return `<div class="metrics">${metric('Investimento', money(m.spend), `${number(m.impressions)} impressões`)}${metric('CTR de link', percent(m.ctr), `${number(m.clicks)} cliques / ${number(m.impressions)} impressões`, 'CTR ponderado: soma dos cliques ÷ soma das impressões.')}${metric('Custo por clique', precise(m.cpc), `CPM ${precise(m.cpm)}`)}${metric('Custo por lead', precise(m.cpl), `${m.paidLeads} leads atribuídos`, 'Sem correspondência com a mídia, o lead é mostrado, mas não entra no custo pago.')}</div>
  <div class="grid">${panel('Investimento e captação', 'Datas no fuso de São Paulo. A linha usa o eixo de valores em reais.', canvas('media-trend', 'Investimento e leads por dia', true), 8, 'Não há custo por sessão nem investimento por posicionamento; o painel não inventa esses rateios.')}${panel('Cobertura de atribuição', 'Até onde é possível associar custo e resultado.', `<div class="big-ratio">${percent(BI.ratio(m.paidLeads, m.leads))}</div><p class="muted" style="margin-top:8px">${m.paidLeads} de ${m.leads} leads têm anúncio com mídia no período.</p><div class="rule"></div><div class="cost-row"><span>Associação por ad_id</span><strong>${d.leads.filter(l => l.match === 'ad_id').length}</strong></div><div class="cost-row"><span>Fallback por nome</span><strong>${d.leads.filter(l => l.match === 'nome').length}</strong></div><div class="cost-row"><span>Fora do custo pago</span><strong>${m.leads - m.paidLeads}</strong></div>`, 4, 'IDs têm precedência. Nome só é aceito sem ID e quando identifica um único anúncio.')}</div>
  <section class="panel"><div class="panel-head"><div><h2>Performance dos criativos</h2><p>Ordene as colunas e acompanhe cada anúncio até o resultado comercial.</p></div></div><div class="table-controls"><label class="sr-only" for="ad-search">Buscar por anúncio ou ID</label><input type="search" id="ad-search" placeholder="Buscar anúncio ou ID…" value="${esc(state.search)}"><span class="muted" style="font-size:12px">${BI.adRows(d).length} anúncios / itens não atribuídos</span></div><div id="ads-table"></div></section>
  <section class="panel"><div class="panel-body"><details class="method"><summary>Ver investimento e captação por dia</summary>${table(['Dia', 'Investimento', 'Cliques', 'Leads', 'Qualificados'], BI.daily(d).map(r => [fullDate(r.date), precise(r.spend), r.clicks, r.leads, r.qualified]), 'Valores diários do gráfico de mídia')}</details></div></section>
  <div class="section-heading"><div><h2>Contexto da captação</h2><p>Distribuições de leads. Não há custo de mídia disponível nessas dimensões.</p></div></div><div class="grid">${panel('Posicionamentos', 'Origem declarada pelas UTMs dos leads.', distributionHTML(BI.distribution(d.leads, 'utm_placement'), m.leads), 6)}${panel('Quando os leads chegam', 'Horário de São Paulo; intervalos de três horas.', heatmapHTML(d.leads), 6, 'Serve para observar a chegada e organizar atendimento. Com pouco volume, não prova um melhor horário de mídia.')}</div>`;
}
function renderAds() {
  if (!$('ads-table')) return;
  let ads = BI.adRows(current.d).filter(a => `${a.label} ${a.key}`.toLowerCase().includes(state.search.toLowerCase()));
  ads.sort((a, b) => { const x = a.m[state.sort], y = b.m[state.sort]; if (x === null) return 1; if (y === null) return -1; return (state.descending ? -1 : 1) * (x - y); });
  const pages = Math.max(1, Math.ceil(ads.length / 12)); state.page = Math.min(state.page, pages - 1);
  const headers = [['Anúncio', null], ['Investimento', 'spend'], ['CTR', 'ctr'], ['CPC', 'cpc'], ['Leads', 'leads'], ['CPL', 'cpl'], ['Qualificados', 'qualified'], ['CPQL', 'cpql'], ['Reuniões feitas', 'held'], ['Clientes', 'won'], ['CAC', 'cac']].map(([label, key]) => key ? `<button class="sort" data-sort="${key}" aria-label="Ordenar por ${label}${state.sort === key ? state.descending ? ', decrescente' : ', crescente' : ''}">${label}${state.sort === key ? `<span aria-hidden="true">${state.descending ? '↓' : '↑'}</span>` : ''}</button>` : label);
  $('ads-table').innerHTML = table(headers, ads.slice(state.page * 12, (state.page + 1) * 12).map(a => [`<button class="row-link ad-label" data-ad="${esc(a.key)}">${esc(a.label)} ${icon('arrow')}</button><small>${esc(a.key)}</small><small>${esc(BI.NICHES[a.niche])}${a.method === 'codigo_ad' ? ' · nicho pelo código AD' : ''}</small>`, money(a.m.spend), percent(a.m.ctr), precise(a.m.cpc), a.m.leads, precise(a.m.cpl), `${a.m.qualified}<small>${percent(a.m.qualification)} dos leads</small>`, precise(a.m.cpql), a.m.held, a.m.won, precise(a.m.cac)]), 'Performance por anúncio') + `<div class="table-pager"><span>${ads.length} resultados · página ${state.page + 1} de ${pages}</span><div><button class="button plain" data-page="-1" ${state.page === 0 ? 'disabled' : ''}>Anterior</button><button class="button plain" data-page="1" ${state.page === pages - 1 ? 'disabled' : ''}>Próxima</button></div></div>`;
}
function heatmapHTML(leads) {
  const cells = BI.heatmap(leads), max = Math.max(1, ...cells.flat()), days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  return `<div class="heat-grid" role="img" aria-label="Chegada de leads por dia e hora. Cada célula exibe a quantidade."><span></span>${Array.from({ length: 8 }, (_, i) => `<span class="heat-label">${String(i * 3).padStart(2, '0')}h</span>`).join('')}${cells.map((row, i) => `<span class="heat-label">${days[i]}</span>${row.map((n, j) => `<span tabindex="0" class="heat-cell ${n / max > .6 ? 'light' : ''}" style="--heat:${n / max * 85}%" title="${days[i]}, ${j * 3}h a ${j * 3 + 3}h: ${n} leads">${n || '·'}</span>`).join('')}`).join('')}</div>`;
}

function commercial() {
  const { m, d } = current, co = BI.cohortRows(d), velocity = BI.velocity(d), totalTime = velocity.at(-1);
  exporting = [['Semana de captação', 'Idade mínima (dias)', 'Leads', 'Qualificados', 'Leads com reunião', 'Leads que compareceram', 'Propostas', 'Clientes', 'Valor contratado'], ...co.map(r => [r.date, Math.max(0, r.age), r.m.leads, r.m.qualified, r.m.booked, r.m.held, r.m.proposals, r.m.won, r.m.revenue])];
  return `<div class="metrics">${metric('Leads com reunião', number(m.booked), `${m.meetings} agendamentos no total`)}${metric('Custo por reunião feita', money(m.cpHeld), `${m.paidHeld} leads atribuídos que compareceram`)}${metric('No-show observado', percent(m.noShowRate), `${m.noShow} de ${m.resolved} reuniões resolvidas`, 'No-show ÷ (realizadas + no-show). Canceladas e sem resultado ficam fora.')}${metric('Valor contratado', money(m.revenue), `${m.won} clientes · ${money(m.fee)} em fees mensais`, 'Fees registrados nos contratos conquistados; não representa MRR ativo, pois não há churn ou vigência.')}</div>
  ${m.won < 10 ? `<div class="notice">${icon('info')}<p><strong>${m.won} fechamentos no recorte.</strong> Trate CAC e taxa de fechamento como descrição do que aconteceu. O briefing recomenda revisar oferta e nicho trimestralmente, porque a amostra no fundo é pequena.</p></div>` : ''}
  <div class="grid">${panel('Pipeline atual', 'Onde estão hoje os leads captados no período.', table(['Etapa', 'Leads', 'Valor registrado'], Object.entries(BI.STAGES).map(([key, label]) => { const leads = d.leads.filter(l => l.etapa === key); return [label, leads.length, money(leads.reduce((s, l) => s + (BI.contractValue(l) || 0), 0))]; }), 'Pipeline por etapa'), 6, `Pipeline aberto: ${m.open} leads · ${money(m.pipelineValue)} registrados. Não é previsão; não há probabilidade de fechamento aplicada.`)}
  ${panel('Presença e velocidade', 'Feche o ciclo de registro para enxergar o atendimento.', `<div class="cost-row"><span>Reuniões realizadas</span><strong>${m.resolved - m.noShow}</strong></div><div class="cost-row"><span>No-show confirmado</span><strong>${m.noShow}</strong></div><div class="cost-row"><span>Canceladas</span><strong>${m.cancelled}</strong></div><div class="cost-row"><span>Passadas sem desfecho</span><strong class="${m.pending ? 'warning' : ''}">${m.pending}</strong></div><div class="rule"></div><div class="inline-facts"><div><strong>${duration(totalTime.median)}</strong><small>Mediana até contrato · n=${totalTime.n}</small></div><div><strong>${totalTime.overdue ?? '—'}</strong><small>Abertos além dessa mediana</small></div></div><p class="muted" style="font-size:12px;margin-top:17px">Tempo calculado nos fechados favorece os ciclos mais rápidos. Os leads ainda abertos não podem ser ignorados.</p>`, 6, '<a class="text-button" href="/funil/">Atualizar presença no funil</a>')}
  </div>
  <section class="panel"><div class="panel-head"><div><h2>Coortes de captação</h2><p>Os resultados acompanham a semana em que o lead entrou, mesmo quando o contrato vem depois.</p></div></div><div class="panel-body">${table(['Semana', 'Maturidade', 'Leads', 'Qualificados', 'Marcaram', 'Compareceram', 'Propostas', 'Clientes', 'Conversão', 'Contratado'], co.map(r => [dateLabel(r.date), `${Math.max(0, r.age)} dias<small>${r.age < 28 ? 'Coorte recente' : r.age < 84 ? 'Em observação' : 'Janela trimestral'}</small>`, r.m.leads, r.m.qualified, r.m.booked, r.m.held, r.m.proposals, r.m.won, rate(r.m.won, r.m.leads), money(r.m.revenue)]), 'Coortes semanais de captação')}</div><div class="panel-foot">Maturidade = dias desde o fim da semana até a atualização. Coortes recentes têm menos tempo para converter. Não compare taxas como se estivessem igualmente maduras.</div></section>
  <div class="section-heading"><div><h2>Economia e tempo de venda</h2><p>Valor negociado, custo de mídia e tempos observados têm funções diferentes.</p></div></div><div class="grid">${panel('Tempo entre etapas', 'Primeira passagem registrada; mediana entre quem completou a transição.', table(['Transição', 'Mediana', 'Concluíram', 'Ainda abertos', 'Além da mediana'], velocity.map(v => [`${BI.STAGES[v.from]} → ${BI.STAGES[v.to]}`, duration(v.median), v.n, v.open, v.overdue ?? '—']), 'Tempo entre etapas'), 7, 'Sem registro da passagem, o tempo permanece indisponível. Leads perdidos ou desqualificados não entram como abertos.')}
  ${panel('Cenário de viabilidade', 'Premissas editáveis do briefing. Este cálculo não é uma previsão de receita.', `<div class="model-input"><label for="scenario-fee">Fee mensal (R$)</label><input id="scenario-fee" type="number" min="1" max="1000000" value="1500"></div><div class="model-input"><label for="scenario-months">Meses de contrato</label><input id="scenario-months" type="number" min="1" max="60" value="4"></div><div class="model-input"><label for="scenario-margin">Margem de contribuição (%)</label><input id="scenario-margin" type="number" min="1" max="100" value="50"></div><div id="scenario-result" aria-live="polite"></div>`, 5, 'A margem inicial de 50% é ilustrativa e precisa ser substituída pela sua. Não inclui churn, inadimplência, impostos adicionais ou custo comercial fora da margem.')}</div>`;
}
function renderScenario() {
  if (!$('scenario-result')) return;
  const inputs = ['scenario-fee', 'scenario-months', 'scenario-margin'].map($);
  if (inputs.some(el => !el.value || !el.validity.valid)) { $('scenario-result').innerHTML = '<p class="warning">Preencha valores positivos dentro dos limites.</p>'; return; }
  const [fee, months, margin] = inputs.map(el => Number(el.value)), contribution = fee * months * margin / 100;
  const cac = current.m.cac;
  $('scenario-result').innerHTML = `<div class="scenario-result"><span>Contribuição estimada por contrato</span><strong>${money(contribution)}</strong><p>${money(fee * months)} de valor bruto × ${margin}% de margem.</p></div><div class="cost-row" style="margin-top:12px"><span>CAC de mídia observado</span><strong>${money(cac)}</strong></div><p class="muted" style="font-size:12px;margin-top:13px">${cac === null ? 'Ainda sem CAC para comparar com a contribuição estimada.' : `Mídia consumiria ${percent(cac / contribution)} dessa contribuição. Payback de mídia aproximado: ${Math.ceil(cac / (fee * margin / 100))} meses, se a contribuição mensal prevista se realizar.`}</p>`;
}

function qualityView() {
  const { d, m } = current, checks = BI.quality(d), lastMedia = [...d.midia].map(r => r.data).sort().at(-1);
  exporting = [['Verificação', 'Valor', 'Total', 'Descrição'], ...checks.map(c => [c.label, c.value, c.total ?? '', c.detail])];
  return `<div class="metrics">${metric('Cobertura de atribuição', percent(BI.ratio(m.paidLeads, m.leads)), `${m.paidLeads} de ${m.leads} leads`)}${metric('Último dia de mídia', lastMedia ? dateLabel(lastMedia) : '—', lastMedia ? fullDate(lastMedia) : 'Sem mídia no recorte')}${metric('Fonte selecionada', state.mode === 'real' ? 'Conta Meta' : 'Dados de teste', state.mode === 'real' ? 'Uma única conta de anúncios' : 'Registros inseridos no banco')}${metric('Atualização do painel', loadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }), 'Consulta sob demanda, sem cache de dados')}</div>
  <div class="grid">${panel('Integridade do recorte', 'Pendências que mudam a interpretação dos indicadores.', `<div class="check-list">${checks.map(c => `<div class="check"><span>${esc(c.label)}</span><strong class="${c.good ? '' : 'warning'}">${c.money ? money(c.value) : c.value}${c.total !== undefined ? `<span class="muted" style="font-size:12px"> / ${c.total}</span>` : ''}</strong><p>${esc(c.detail)}</p></div>`).join('')}</div>`, 12)}</div>
  <div class="grid">${panel('Como ler este painel', 'Definições, unidades e limites de interpretação.', [
    ['CPL, CPQL e CAC de mídia', 'CPL = investimento ÷ leads atribuídos. CPQL troca o denominador por qualificados atribuídos. CAC usa os clientes atribuídos. Se não há investimento ou resultado, o custo aparece como indisponível, nunca como custo zero. O CAC não inclui ferramentas, equipe nem esforço comercial.'],
    ['Reuniões: quantidade de leads × quantidade de eventos', 'Custos por reunião usam leads únicos que marcaram (exclui canceladas) ou compareceram, evitando inflar resultados com reagendamentos. Presença e no-show usam agendamentos resolvidos. Um lead pode ter no-show e depois comparecer.'],
    ['Coorte e período de comparação', 'Datas são interpretadas em America/Sao_Paulo. Leads pertencem ao período em que foram criados; seus agendamentos, propostas e contratos posteriores acompanham essa coorte até a atualização. Visitantes pertencem à sua primeira visita registrada e seguem seus eventos posteriores. Mídia corresponde às datas de veiculação. A comparação anterior usa uma janela adjacente do mesmo tamanho; coortes mais antigas tiveram mais tempo para converter.'],
    ['Regra de qualificação', 'Desqualificado = faturamento abaixo de R$ 70 mil E verba até R$ 1 mil. Uma empresa abaixo do faturamento pode passar se declarar verba maior. O painel mostra faturamento ≥ R$ 70 mil separadamente e trata campos ainda não informados como pendentes.'],
    ['Associação de anúncios e nichos', 'source_id da mídia corresponde a ad_id dos leads. Nome só é fallback quando não existe ID e há uma correspondência única. O nicho do gasto é identificado por evidências de leads/eventos do anúncio na base selecionada. Sem evidência, AD01/02 = vet, AD03/04 = eventos, AD05/06 = genérico, conforme o briefing. Conflitos ou códigos desconhecidos ficam em “Sem nicho identificado”. Renomear criativos exige revisar esse mapeamento.'],
    ['Incerteza: intervalo e probabilidade', 'As taxas exibem numerador, denominador e intervalo de Wilson de 95%. A probabilidade de maior qualificação usa posterior Beta com prior uniforme, sorteios reproduzíveis e apenas os nichos exibidos com dados. Não mede probabilidade de ser o nicho mais rentável. Com poucos contratos, nenhum ranking de CAC representa uma conclusão estável.'],
    ['Valor contratado não é caixa, lucro ou LTV', 'O valor explicitamente registrado do contrato prevalece; na ausência dele, usa fee mensal × meses previstos. Sem ambos, o valor permanece ausente. Fees de contratos conquistados não equivalem a MRR ativo. Sem retenção, churn, recebimentos e margem, não é possível afirmar LTV, ROAS financeiro ou lucro.'],
    ['Referências, gargalos e causas', 'As referências de passagem vêm do briefing, não de um benchmark validado. O último evento registrado mostra uma interrupção, mas não revela intenção, tempo no campo ou motivo. O painel não atribui automaticamente perdas a preço, copy, ausência de horários ou página lenta.'],
    ['Frequência e alcance', 'Não somamos alcance diário nem fazemos média simples de frequência. Sem alcance deduplicado no período, essas métricas agregadas poderiam induzir uma leitura errada. CTR, CPC e CPM são recalculados a partir dos totais.'],
  ].map(([title, content]) => `<details class="method"><summary>${title}</summary><p>${content}</p></details>`).join(''), 12)}</div>`;
}

function shell(content) {
  const { p, m } = current, title = VIEWS[state.view];
  const url = new URL(location.href); url.search = ''; url.hash = state.view;
  if (state.niche) url.searchParams.set('nicho', state.niche);
  url.searchParams.set('periodo', state.range); url.searchParams.set('dados', state.mode);
  if (state.range === 'custom') { url.searchParams.set('inicio', p.start); url.searchParams.set('fim', p.end); }
  if (state.ad) url.searchParams.set('anuncio', state.ad);
  history.replaceState(null, '', url);
  return `<div class="layout"><aside class="sidebar"><a class="brand" href="/funil/"><img src="/funil/icone.svg" alt="" width="25" height="25">the new ads</a><a class="back-link" href="/funil/">${icon('back')} Voltar ao funil</a><div class="nav-title">Analytics</div><nav class="nav" aria-label="Áreas do analytics">${Object.entries(VIEWS).map(([key, [label]]) => `<a href="#${key}" data-nav="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(key)}${label}</a>`).join('')}</nav><div class="sidebar-foot"><div class="source-indicator"><i class="dot ${state.mode === 'simulado' ? 'sim' : ''}"></i>${state.mode === 'simulado' ? 'Dados de teste inseridos' : 'Conta Meta Ads'}</div>1 conta de anúncios + CRM<br>Leitura por coorte</div></aside>
  <div class="workspace"><header class="topbar"><div class="breadcrumb"><a href="/funil/">Funil</a>${icon('chevron')}<span>Analytics</span></div><div class="toolbar"><button class="button plain" data-action="refresh" ${updating ? 'disabled' : ''} aria-label="Atualizar dados">${icon('refresh')}<span>${updating ? 'Atualizando…' : 'Atualizar'}</span></button><button class="button" data-action="export" aria-label="Exportar dados desta seção em CSV">${icon('download')}<span>Exportar CSV</span></button></div></header>
  <main class="main" id="content" tabindex="-1"><div class="heading"><div><h1>${title[0]}</h1><p>${title[1]}</p></div><span class="tag ${state.mode === 'simulado' ? 'simulation' : ''}">${icon(state.mode === 'simulado' ? 'info' : 'check')}${state.mode === 'simulado' ? 'Dados de teste' : 'Conta Meta'}</span></div>
  <div class="filters"><div class="field"><label for="filter-niche">Nicho</label><select id="filter-niche"><option value="">Todos os nichos</option>${Object.entries(BI.NICHES).map(([k, label]) => `<option value="${k}" ${state.niche === k ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
  <div class="field range-field"><label>Período de captação</label><div class="segmented" role="group" aria-label="Período de captação">${[['7', '7 dias'], ['28', '28 dias'], ['56', '56 dias'], ['90', '90 dias'], ['all', 'Tudo'], ['custom', 'Datas']].map(([k, l]) => `<button data-range="${k}" aria-pressed="${state.range === k}">${l}</button>`).join('')}</div></div>
  <div class="field filter-tail"><label for="filter-mode">Fonte exibida</label><select id="filter-mode"><option value="real" ${state.mode === 'real' ? 'selected' : ''}>Conta Meta Ads</option><option value="simulado" ${state.mode === 'simulado' ? 'selected' : ''}>Dados de teste inseridos</option></select></div>
  ${state.range === 'custom' ? `<div class="field"><label for="date-start">De</label><input id="date-start" type="date" min="2020-01-01" max="${current.data.today}" value="${p.start}"></div><div class="field"><label for="date-end">Até</label><input id="date-end" type="date" min="2020-01-01" max="${current.data.today}" value="${p.end}"></div><button class="button" data-action="dates">Aplicar datas</button>` : ''}</div>
  <div class="period-note">${icon('clock')}<span>${fullDate(p.start)} a ${fullDate(p.end)} · São Paulo · Resultados acompanhados até ${fullDate(current.data.today)}</span>${state.niche || state.ad ? '<button class="text-button" data-action="clear">Limpar filtros</button>' : ''}${state.ad ? `<span class="tag">Anúncio ${esc(state.ad)} <button class="text-button" data-action="clear-ad">Remover anúncio</button></span>` : ''}</div>
  ${state.mode === 'simulado' ? '<div class="notice">' + icon('info') + '<p><strong>Dados de teste inseridos no banco.</strong> Estes números servem apenas para validar o funcionamento do analytics. Não vieram da conta de anúncios e não representam performance real da agência.</p></div>' : ''}
  ${emptyNotice(m)}${m.leads || m.spend || current.d.eventos.length ? content : ''}
  <footer class="footer"><span>The New Ads · Analytics do funil · ${state.mode === 'simulado' ? 'Dados de teste inseridos' : 'Conta Meta Ads'}</span><span>Atualizado às ${loadedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} · ${go('quality', 'Método e qualidade dos dados')}</span></footer></main></div></div>`;
}

function render() {
  if (!raw) return;
  const focused = document.activeElement;
  const focusId = focused?.id;
  charts.forEach(c => c.destroy()); charts = [];
  const data = BI.prepare(raw, state.mode, loadedAt);
  if (state.range === 'custom' && (!validDate(state.start) || !validDate(state.end) || state.start > state.end)) { state.start = BI.addDays(data.today, -55); state.end = data.today; }
  const p = BI.period(data, state.range, state.start, state.end), d = BI.slice(data, p, state.niche, state.ad);
  const m = BI.metrics(d), prev = BI.metrics(BI.slice(data, BI.previousPeriod(p), state.niche, state.ad));
  const niches = Object.keys(BI.NICHES).filter(k => !state.niche || k === state.niche).map(key => ({ key, m: BI.metrics(BI.slice(data, p, key, state.ad)) })).filter(n => n.key !== 'desconhecido' || n.m.leads || n.m.spend);
  current = { data, p, d, m, prev, niches };
  const content = ({ overview, funnel, niches: nichesView, media: mediaView, commercial, quality: qualityView })[state.view]();
  $('root').innerHTML = shell(content); $('root').setAttribute('aria-busy', 'false');
  renderCharts(); renderAds(); renderScenario();
  const nav = document.querySelector('.nav'), selected = nav.querySelector('[aria-current=page]');
  nav.scrollLeft = Math.max(0, selected.offsetLeft - nav.offsetLeft - (nav.clientWidth - selected.clientWidth) / 2);
  if (focusId && $(focusId)) $(focusId).focus({ preventScroll: true });
  $('announcement').textContent = `${VIEWS[state.view][0]}: ${m.leads} leads. ${state.mode === 'real' ? 'Conta Meta Ads' : 'Dados de teste inseridos'}.`;
}
function renderCharts() {
  const { d, niches } = current;
  if (state.view === 'overview') { const weeks = BI.weekly(d); chart('overview-trend', 'bar', weeks.map(w => dateLabel(w.date) + (w.partial ? '*' : '')), [{ label: 'Leads captados', data: weeks.map(w => w.leads), backgroundColor: '#80766a', borderRadius: 3, maxBarThickness: 32 }, { label: 'Qualificados', data: weeks.map(w => w.qualified), backgroundColor: '#ff914d', borderRadius: 3, maxBarThickness: 32 }]); }
  if (state.view === 'niches') {
    const totals = ['spend', 'leads', 'qualified'].map(k => niches.reduce((s, n) => s + n.m[k], 0));
    chart('niches-mix', 'bar', ['Investimento', 'Leads', 'Qualificados'], niches.map(n => ({ label: BI.NICHES[n.key], data: ['spend', 'leads', 'qualified'].map((k, i) => totals[i] ? n.m[k] / totals[i] * 100 : 0), backgroundColor: BI.COLORS[n.key], borderRadius: 3, maxBarThickness: 44 })), { scales: { x: { stacked: true, grid: { display: false }, ticks: { color: '#a0a3a8' } }, y: { stacked: true, beginAtZero: true, max: 100, grid: { color: '#292929' }, ticks: { color: '#a0a3a8', callback: v => v + '%' } } }, plugins: { legend: { position: 'bottom', labels: { color: '#a0a3a8', boxWidth: 8, boxHeight: 8 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(1)}%` } } } });
  }
  if (state.view === 'media') { const series = BI.daily(d); chart('media-trend', 'bar', series.map(r => dateLabel(r.date)), [{ label: 'Leads', data: series.map(r => r.leads), backgroundColor: '#80766a', order: 2, borderRadius: 2, yAxisID: 'y', maxBarThickness: 15 }, { label: 'Investimento (R$)', type: 'line', order: 1, data: series.map(r => r.spend), borderColor: '#ff914d', borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: .2, yAxisID: 'spend', money: true }], { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8, color: '#a0a3a8', maxRotation: 0 } }, y: { beginAtZero: true, grid: { color: '#292929' }, ticks: { color: '#a0a3a8', precision: 0 } }, spend: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { color: '#b39780', maxTicksLimit: 5, callback: v => 'R$ ' + v } } } }); }
}
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= '2020-01-01' && !isNaN(new Date(`${value}T12:00:00Z`)); }
function navigate(view) { state.view = view; state.page = 0; render(); $('content').focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); }
function exportCSV() {
  const safe = v => { const rawValue = v === null || v === undefined ? '' : String(v); return '"' + (/^[=+\-@\t\r]/.test(rawValue) ? "'" + rawValue : rawValue).replace(/"/g, '""') + '"'; };
  const rows = [['The New Ads', VIEWS[state.view][0]], ['Fonte', state.mode === 'real' ? 'Conta Meta Ads' : 'Dados de teste inseridos no banco'], ['Quantidade de contas de anúncios', 1], ['Captação de', current.p.start, 'até', current.p.end], ['Resultados até', current.data.today], ['Nicho', state.niche || 'todos'], ['Anúncio', state.ad || 'todos'], [], ...exporting];
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(safe).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `tna-${state.view}-${state.mode}-${current.p.start}-${current.p.end}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('announcement').textContent = 'CSV exportado com os filtros e a origem dos dados.';
}
document.addEventListener('click', async e => {
  const el = e.target.closest('button,a[data-nav]'); if (!el) return;
  if (el.dataset.nav || el.dataset.go) { e.preventDefault(); navigate(el.dataset.nav || el.dataset.go); }
  else if (el.dataset.range) { state.range = el.dataset.range; render(); document.querySelector(`[data-range="${state.range}"]`)?.focus({ preventScroll: true }); }
  else if (el.dataset.ad) { state.ad = el.dataset.ad; state.search = ''; navigate('overview'); }
  else if (el.dataset.niche) { state.niche = el.dataset.niche; render(); $('filter-niche').focus({ preventScroll: true }); }
  else if (el.dataset.sort) { state.descending = state.sort === el.dataset.sort ? !state.descending : true; state.sort = el.dataset.sort; renderAds(); document.querySelector(`[data-sort="${state.sort}"]`)?.focus({ preventScroll: true }); }
  else if (el.dataset.page) { state.page += Number(el.dataset.page); renderAds(); }
  else if (el.dataset.action === 'export') exportCSV();
  else if (el.dataset.action === 'refresh') await load();
  else if (el.dataset.action === 'simulation') { state.mode = 'simulado'; state.range = 'all'; render(); }
  else if (el.dataset.action === 'clear') { state.niche = ''; state.ad = ''; state.range = 'all'; render(); }
  else if (el.dataset.action === 'clear-ad') { state.ad = ''; render(); }
  else if (el.dataset.action === 'dates') { const start = $('date-start'), end = $('date-end'); end.setCustomValidity(''); if (start.value > end.value) end.setCustomValidity('A data final precisa ser igual ou posterior à inicial.'); if (!start.value || !end.value || !start.reportValidity() || !end.reportValidity()) return; state.start = start.value; state.end = end.value; render(); }
});
document.addEventListener('change', e => { if (e.target.id === 'filter-niche') { state.niche = e.target.value; state.ad = ''; render(); } if (e.target.id === 'filter-mode') { state.mode = e.target.value; state.ad = ''; render(); } });
document.addEventListener('input', e => { if (e.target.id === 'ad-search') { state.search = e.target.value; state.page = 0; renderAds(); } if (e.target.id.startsWith('scenario-')) renderScenario(); if (e.target.id === 'date-end') e.target.setCustomValidity(''); });
window.addEventListener('hashchange', () => { const key = location.hash.slice(1); if (VIEWS[key] && key !== state.view) { state.view = key; render(); } });

const TABLES = [
  ['leads', 'funil_leads', 'id,created_at,etapa,qualificado,nicho,ad_id,utm_content,utm_placement,faturamento,verba,ja_investe,fee_mensal,meses_previstos,valor_contrato,fechado_em,simulado', ['created_at', 'id']],
  ['agendamentos', 'funil_agendamentos', 'id,lead_id,created_at,inicio,situacao,nicho,ad_id,simulado', ['created_at', 'id']],
  ['eventos', 'funil_eventos', 'visitor_id,lead_id,tipo,passo,nicho,ad_id,utm_content,utm_placement,created_at,simulado', ['created_at', 'visitor_id', 'tipo', 'passo']],
  ['etapas', 'funil_etapas_log', 'lead_id,de,para,em,simulado', ['em', 'lead_id', 'para']],
  ['midia', 'tna_meta', 'data,anuncio,source_id,investimento,impressoes,cliques_no_link,frequencia,simulado', ['data', 'source_id']],
];
async function readTable([key, name, columns, order]) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    let query = sb.from(name).select(columns);
    for (const field of order) query = query.order(field, { ascending: true });
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw new Error(`Não foi possível ler ${name}: ${error.message}`);
    rows.push(...(data || [])); if (!data || data.length < 1000) break;
  }
  return [key, rows];
}
async function load() {
  if (updating) return; updating = true; const version = ++loadVersion;
  if (raw) render();
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (!data.session) { showLogin('Entre no funil para acessar o analytics.'); return; }
    const { data: aal, error: aalError } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { showLogin('Conclua a verificação em duas etapas no funil.'); return; }
    const results = await Promise.allSettled(TABLES.map(readTable));
    if (version !== loadVersion) return;
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length) throw new Error(failures.map(f => f.reason.message).join(' '));
    raw = Object.fromEntries(results.map(r => r.value)); loadedAt = new Date(); updating = false; render();
  } catch (error) {
    if (version !== loadVersion) return;
    updating = false;
    if (raw) { render(); $('content').insertAdjacentHTML('afterbegin', `<div class="notice" role="alert">${icon('info')}<p>Não foi possível atualizar. Os dados continuam sendo os da consulta anterior. ${esc(error.message)} <button class="text-button" data-action="refresh">Tentar novamente</button></p></div>`); }
    else { $('root').innerHTML = `<main class="error"><h1>Não foi possível carregar o analytics</h1><p>${esc(error.message)}</p><p>A análise precisa das cinco fontes para calcular custos e conversões corretamente.</p><button class="button primary" data-action="refresh">Tentar novamente</button> <a class="button" href="/funil/">Voltar ao funil</a></main>`; $('root').setAttribute('aria-busy', 'false'); }
  } finally { updating = false; }
}
function showLogin(message) { ++loadVersion; raw = null; charts.forEach(c => c.destroy()); charts = []; $('root').innerHTML = `<main class="error"><h1>Acesse seu analytics</h1><p>${esc(message)}</p><a class="button primary" href="/funil/">Entrar no funil</a></main>`; $('root').setAttribute('aria-busy', 'false'); }
async function start() {
  if (!window.supabase) { $('root').innerHTML = '<main class="error"><h1>Não foi possível conectar</h1><p>A biblioteca de autenticação não carregou. Verifique sua conexão e recarregue a página.</p><a class="button" href="/funil/analytics">Recarregar</a></main>'; $('root').setAttribute('aria-busy', 'false'); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((event, session) => { if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) showLogin('Sua sessão terminou. Entre novamente para consultar os dados.'); });
  await load();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
