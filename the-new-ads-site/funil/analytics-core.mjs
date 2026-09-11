// Regras de BI compartilhadas pela interface e pelos testes. Nenhuma escrita no banco.
export const NICHES = { vet: 'Veterinária', eventos: 'Eventos', generico: 'Negócios locais', desconhecido: 'Sem nicho identificado' };
export const COLORS = { vet: '#54cbb7', eventos: '#b59aee', generico: '#ff914d', desconhecido: '#9ba2ac' };
export const STAGES = { novo: 'Novo lead', agendou: 'Agendou', qualificado: 'Qualificado', reuniao: 'Reunião feita', proposta: 'Proposta', cliente: 'Cliente', no_show: 'No-show', perdido: 'Perdido', desqualificado: 'Desqualificado' };
export const CLOSED = new Set(['cliente', 'perdido', 'desqualificado']);
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
export const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
export const sum = (rows, field) => rows.reduce((s, r) => s + num(r[field]), 0);
export const ratio = (k, n) => n > 0 ? k / n : null;
export const unique = (rows, field) => new Set(rows.map(r => r[field]).filter(Boolean)).size;
export function day(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = Object.fromEntries(dayFormat.formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const addDays = (date, n) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
export const daysBetween = (a, b) => (new Date(b) - new Date(a)) / 86400000;
export function week(date) { const d = new Date(`${day(date)}T12:00:00Z`); return addDays(day(date), -((d.getUTCDay() + 6) % 7)); }
export function median(values) {
  const a = values.filter(Number.isFinite).sort((x, y) => x - y), i = Math.floor(a.length / 2);
  return a.length ? (a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2) : null;
}
export function wilson(k, n) {
  if (!n || k < 0 || k > n) return null;
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, e = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - e), Math.min(1, c + e)];
}
function clean(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function adName(v) { try { return clean(decodeURIComponent(String(v).replace(/\+/g, ' '))); } catch { return clean(v); } }
export function revenueBand(v) {
  const x = clean(v);
  if (!x) return null;
  if (/^70|r\$\s*70\b|^200|r\$\s*200\b|^500|r\$\s*500\b/.test(x)) return 'alto';
  if (/^ate|^30|r\$\s*30\b/.test(x)) return 'baixo';
  return null;
}
export function contractValue(l) {
  // Um valor negociado explícito tem precedência, inclusive zero.
  if (l.valor_contrato !== null && l.valor_contrato !== undefined && l.valor_contrato !== '') return num(l.valor_contrato);
  return num(l.fee_mensal) > 0 && num(l.meses_previstos) > 0 ? num(l.fee_mensal) * num(l.meses_previstos) : null;
}
export function prepare(raw, mode = 'real', now = new Date()) {
  const simulated = mode === 'simulado';
  const visible = r => (r.simulado === true) === simulated;
  const today = day(now.toISOString());
  const data = Object.fromEntries(['leads', 'eventos', 'agendamentos', 'etapas', 'midia'].map(k => [k, (raw[k] || []).filter(visible)]));
  data.leads = data.leads.filter(r => day(r.created_at) && day(r.created_at) <= today);
  data.eventos = data.eventos.filter(r => day(r.created_at) && new Date(r.created_at) <= now);
  data.etapas = data.etapas.filter(r => new Date(r.em) <= now);
  data.midia = data.midia.filter(r => day(r.data) && day(r.data) <= today);
  const evidence = new Map(), mediaNames = new Map();
  for (const r of [...data.leads, ...data.eventos]) {
    if (!r.ad_id || !NICHES[r.nicho] || r.nicho === 'desconhecido') continue;
    const id = String(r.ad_id);
    if (!evidence.has(id)) evidence.set(id, new Set());
    evidence.get(id).add(r.nicho);
  }
  const media = data.midia.map(m => {
    const key = m.source_id ? String(m.source_id) : `nome:${adName(m.anuncio)}`;
    const ev = evidence.get(key);
    const code = String(m.anuncio || '').match(/\bAD0?([1-6])(?:_|\b)/i);
    const inferred = code ? ['vet', 'vet', 'eventos', 'eventos', 'generico', 'generico'][Number(code[1]) - 1] : null;
    const niche = ev?.size === 1 ? [...ev][0] : ev?.size > 1 ? 'desconhecido' : inferred || 'desconhecido';
    const method = ev?.size === 1 ? 'ad_id' : ev?.size > 1 ? 'conflito' : inferred ? 'codigo_ad' : 'sem_mapa';
    const name = adName(m.anuncio);
    if (name) { if (!mediaNames.has(name)) mediaNames.set(name, new Set()); mediaNames.get(name).add(key); }
    return { ...m, key, niche, method };
  });
  const mediaIds = new Set(media.map(m => m.key));
  const withAttribution = l => {
    let adKey = l.ad_id ? String(l.ad_id) : null, match = adKey && mediaIds.has(adKey) ? 'ad_id' : 'sem_correspondencia';
    // Nome é fallback somente quando não há ID e o nome aponta para um único anúncio.
    if (!adKey) { const names = mediaNames.get(adName(l.utm_content)); if (names?.size === 1) { adKey = [...names][0]; match = 'nome'; } }
    return { ...l, adKey, match, niche: NICHES[l.nicho] ? l.nicho : 'desconhecido' };
  };
  const leads = data.leads.map(withAttribution), eventos = data.eventos.map(withAttribution);
  return { ...data, leads, eventos, midia: media, now, today, mode };
}
export function period(data, range = '56', start = '', end = '') {
  const dates = [...data.leads.map(r => day(r.created_at)), ...data.midia.map(r => day(r.data)), ...data.eventos.map(r => day(r.created_at))].filter(Boolean).sort();
  if (range === 'custom') return { start, end: end > data.today ? data.today : end };
  return { start: range === 'all' ? dates[0] || data.today : addDays(data.today, 1 - Number(range)), end: data.today };
}
export const inPeriod = (value, p) => !!day(value) && day(value) >= p.start && day(value) <= p.end;
export function previousPeriod(p) { const count = Math.round(daysBetween(p.start, p.end)) + 1; return { start: addDays(p.start, -count), end: addDays(p.start, -1) }; }
export function slice(data, p, niche = '', ad = '') {
  const leads = data.leads.filter(l => inPeriod(l.created_at, p) && (!niche || l.niche === niche) && (!ad || (l.adKey || 'nao_atribuido') === ad));
  const ids = new Set(leads.map(l => l.id));
  const firstVisit = new Map();
  for (const e of data.eventos) if (e.visitor_id && e.tipo === 'form_view' && (!firstVisit.has(e.visitor_id) || e.created_at < firstVisit.get(e.visitor_id).created_at)) firstVisit.set(e.visitor_id, e);
  const visitorIds = new Set([...firstVisit.values()].filter(e => inPeriod(e.created_at, p) && (!niche || (NICHES[e.nicho] ? e.nicho : 'desconhecido') === niche) && (!ad || (e.adKey || 'nao_atribuido') === ad)).map(e => e.visitor_id));
  return { ...data, p, niche, ad, leads,
    eventos: data.eventos.filter(e => visitorIds.has(e.visitor_id)),
    eventPeriod: data.eventos.filter(e => inPeriod(e.created_at, p) && (!niche || (NICHES[e.nicho] ? e.nicho : 'desconhecido') === niche) && (!ad || (e.adKey || 'nao_atribuido') === ad)),
    agendamentos: data.agendamentos.filter(a => ids.has(a.lead_id) && new Date(a.created_at) <= data.now),
    etapas: data.etapas.filter(e => ids.has(e.lead_id)),
    midia: data.midia.filter(m => inPeriod(m.data, p) && (!niche || m.niche === niche) && (!ad || m.key === ad)),
  };
}
export function metrics(d) {
  const spend = sum(d.midia, 'investimento'), clicks = sum(d.midia, 'cliques_no_link'), impressions = sum(d.midia, 'impressoes');
  const mediaKeys = new Set(d.midia.map(m => m.key));
  const reached = new Map();
  for (const e of d.etapas) { if (!reached.has(e.lead_id)) reached.set(e.lead_id, new Set()); reached.get(e.lead_id).add(e.para); }
  const passed = (l, stage) => l.etapa === stage || reached.get(l.id)?.has(stage);
  const qualified = d.leads.filter(l => l.qualificado === true), highRevenue = d.leads.filter(l => revenueBand(l.faturamento) === 'alto');
  const bookedIds = new Set(d.agendamentos.filter(a => a.situacao !== 'cancelada').map(a => a.lead_id));
  const heldIds = new Set(d.agendamentos.filter(a => a.situacao === 'realizada').map(a => a.lead_id));
  const proposal = d.leads.filter(l => passed(l, 'proposta') || passed(l, 'cliente'));
  const won = d.leads.filter(l => passed(l, 'cliente'));
  const booked = d.leads.filter(l => bookedIds.has(l.id)), held = d.leads.filter(l => heldIds.has(l.id));
  const paid = rows => rows.filter(l => mediaKeys.has(l.adKey));
  const cost = rows => spend > 0 ? ratio(spend, paid(rows).length) : null;
  const resolved = d.agendamentos.filter(a => ['realizada', 'no_show'].includes(a.situacao));
  const noShow = resolved.filter(a => a.situacao === 'no_show');
  const revenueKnown = won.filter(l => contractValue(l) !== null);
  const revenue = revenueKnown.reduce((s, l) => s + contractValue(l), 0);
  const paidRevenue = paid(revenueKnown).reduce((s, l) => s + contractValue(l), 0);
  const open = d.leads.filter(l => !CLOSED.has(l.etapa));
  const pending = d.agendamentos.filter(a => a.situacao === 'agendado' && new Date(a.inicio) <= d.now);
  return { spend, clicks, impressions, leads: d.leads.length, qualified: qualified.length, highRevenue: highRevenue.length,
    rejected: d.leads.filter(l => l.qualificado === false).length, unclassified: d.leads.filter(l => l.qualificado !== true && l.qualificado !== false).length,
    booked: booked.length, held: held.length, proposals: proposal.length, won: won.length, revenue, paidRevenue, unknownRevenue: won.length - revenueKnown.length,
    fee: sum(won, 'fee_mensal'), open: open.length, pipelineValue: open.reduce((s, l) => s + (contractValue(l) || 0), 0),
    paidLeads: paid(d.leads).length, paidQualified: paid(qualified).length, paidBooked: paid(booked).length, paidHeld: paid(held).length, paidWon: paid(won).length, paidProposals: paid(proposal).length,
    cpl: cost(d.leads), cpql: cost(qualified), cpHigh: cost(highRevenue), cpBooked: cost(booked), cpHeld: cost(held), cpProposal: cost(proposal), cac: cost(won),
    qualification: ratio(qualified.length, d.leads.length), showRate: ratio(resolved.length - noShow.length, resolved.length), noShowRate: ratio(noShow.length, resolved.length),
    noShow: noShow.length, resolved: resolved.length, meetings: d.agendamentos.length, cancelled: d.agendamentos.filter(a => a.situacao === 'cancelada').length, pending: pending.length,
    ctr: ratio(clicks, impressions), cpc: ratio(spend, clicks), cpm: ratio(spend * 1000, impressions), contractReturn: spend > 0 ? paidRevenue / spend : null,
    lists: { qualified, highRevenue, booked, held, proposal, won, open, paidLeads: paid(d.leads) },
  };
}
// Interseções sequenciais: a passagem nunca compara pessoas de coortes diferentes.
export function journey(d) {
  const all = new Map();
  for (const e of d.eventos) {
    if (!all.has(e.visitor_id)) all.set(e.visitor_id, new Map());
    const key = e.tipo === 'form_step' ? `step_${e.passo}` : e.tipo;
    const row = all.get(e.visitor_id), time = new Date(e.created_at).getTime();
    if (!row.has(key) || row.get(key) > time) row.set(key, time);
  }
  const definitions = [
    ['form_view', 'Viu o formulário', null], ['form_start', 'Iniciou o formulário', .35],
    ['step_1', 'Respondeu o nome', null], ['step_2', 'Respondeu o e-mail', null],
    ['lead', 'Informou o WhatsApp', null], ['step_4', 'Informou se já investe', null],
    ['step_5', 'Informou o faturamento', null], ['step_6', 'Informou a verba', null],
    ['form_complete', 'Concluiu o formulário', null],
  ];
  let previous = [...all.keys()], previousKey = null;
  const rows = definitions.map(([key, label, ref]) => {
    const eligible = previous.filter(id => all.get(id).has(key) && (!previousKey || all.get(id).get(key) >= all.get(id).get(previousKey)));
    const raw = [...all.values()].filter(x => x.has(key)).length;
    const n = previous.length, k = eligible.length;
    const row = { key, label, k, n, raw, lost: n - k, rate: ratio(k, n), ci: wilson(k, n), ref, ids: new Set(eligible) };
    previous = eligible; previousKey = key;
    return row;
  });
  // Agenda tem seu próprio ponto de entrada: somente qualificados chegam até aqui.
  const agenda = ['scheduler_view', 'slot_selected', 'schedule'].map((key, index, keys) => {
    const entrants = [...all].filter(([, events]) => events.has('scheduler_view'));
    const before = entrants.filter(([, ev]) => keys.slice(0, index).every((k, i) => ev.has(k) && (!i || ev.get(k) >= ev.get(keys[i - 1]))));
    const after = before.filter(([, ev]) => ev.has(key) && (!index || ev.get(key) >= ev.get(keys[index - 1])));
    return { key, label: ['Abriu a agenda', 'Escolheu um horário', 'Confirmou a reunião'][index], k: after.length, n: before.length, rate: ratio(after.length, before.length), ci: wilson(after.length, before.length) };
  });
  return { rows, agenda, orphanSteps: rows.reduce((s, r) => s + r.raw - r.k, 0) };
}
export function daily(d) {
  const map = new Map();
  for (let date = d.p.start; date <= d.p.end; date = addDays(date, 1)) map.set(date, { date, spend: 0, leads: 0, qualified: 0, clicks: 0 });
  for (const m of d.midia) { const r = map.get(day(m.data)); if (r) { r.spend += num(m.investimento); r.clicks += num(m.cliques_no_link); } }
  for (const l of d.leads) { const r = map.get(day(l.created_at)); if (r) { r.leads++; if (l.qualificado === true) r.qualified++; } }
  return [...map.values()];
}
export function weekly(d) {
  const map = new Map();
  for (const r of daily(d)) { const date = week(r.date); if (!map.has(date)) map.set(date, { date, spend: 0, leads: 0, qualified: 0, clicks: 0, days: 0 }); const w = map.get(date); for (const k of ['spend', 'leads', 'qualified', 'clicks']) w[k] += r[k]; w.days++; }
  const mediaKeys = new Set(d.midia.map(m => m.key));
  for (const w of map.values()) { const qualified = d.leads.filter(l => week(l.created_at) === w.date && l.qualificado === true && mediaKeys.has(l.adKey)); w.paidQualified = qualified.length; w.cpql = w.spend > 0 ? ratio(w.spend, qualified.length) : null; w.partial = w.days < 7 || addDays(w.date, 6) >= d.today; }
  return [...map.values()];
}
export function adRows(d) {
  const keys = new Set([...d.midia.map(m => m.key), ...d.leads.map(l => l.adKey || 'nao_atribuido')]);
  return [...keys].map(key => {
    const midia = d.midia.filter(m => m.key === key), leads = d.leads.filter(l => (l.adKey || 'nao_atribuido') === key), ids = new Set(leads.map(l => l.id));
    const mini = { ...d, leads, midia, agendamentos: d.agendamentos.filter(a => ids.has(a.lead_id)), etapas: d.etapas.filter(e => ids.has(e.lead_id)) };
    return { key, label: midia.at(-1)?.anuncio || leads[0]?.utm_content || 'Sem anúncio identificado', niche: midia[0]?.niche || leads[0]?.niche || 'desconhecido', method: midia[0]?.method || 'sem_mapa', m: metrics(mini) };
  });
}
export function cohortRows(d) {
  const keys = [...new Set(d.leads.map(l => week(l.created_at)))].sort();
  return keys.map(date => {
    const leads = d.leads.filter(l => week(l.created_at) === date), ids = new Set(leads.map(l => l.id));
    const m = metrics({ ...d, leads, midia: d.midia.filter(r => week(r.data) === date), agendamentos: d.agendamentos.filter(a => ids.has(a.lead_id)), etapas: d.etapas.filter(e => ids.has(e.lead_id)) });
    return { date, age: Math.floor(daysBetween(`${addDays(date, 6)}T23:59:59-03:00`, d.now)), m };
  });
}
export function velocity(d) {
  const logs = new Map();
  for (const e of [...d.etapas].sort((a, b) => a.em.localeCompare(b.em))) { if (!logs.has(e.lead_id)) logs.set(e.lead_id, {}); const t = logs.get(e.lead_id); if (!t[e.para]) t[e.para] = e.em; }
  const steps = [['novo', 'agendou'], ['agendou', 'reuniao'], ['reuniao', 'proposta'], ['proposta', 'cliente'], ['novo', 'cliente']];
  return steps.map(([from, to]) => {
    const values = [], ages = [];
    for (const l of d.leads) { const log = { ...(logs.get(l.id) || {}), novo: l.created_at }; if (!log.cliente && l.fechado_em) log.cliente = l.fechado_em; if (!log[from]) continue; if (log[to] && new Date(log[to]) >= new Date(log[from])) values.push(daysBetween(log[from], log[to])); else if (!CLOSED.has(l.etapa) && (from === 'novo' || l.etapa === from)) ages.push(daysBetween(log[from], d.now)); }
    const med = median(values);
    return { from, to, median: med, n: values.length, open: ages.length, overdue: med === null ? null : ages.filter(v => v > med).length };
  });
}
export function distribution(leads, field) {
  const map = new Map(); for (const l of leads) { const key = l[field] === true ? 'Sim' : l[field] === false ? 'Não' : String(l[field] || 'Não informado'); if (!map.has(key)) map.set(key, { label: key, n: 0, qualified: 0 }); const r = map.get(key); r.n++; if (l.qualificado === true) r.qualified++; } return [...map.values()].sort((a, b) => b.n - a.n);
}
export function heatmap(leads) {
  const cells = Array.from({ length: 7 }, () => Array(8).fill(0));
  const format = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  for (const l of leads) { const p = Object.fromEntries(format.formatToParts(new Date(l.created_at)).map(x => [x.type, x.value])); cells[['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday)][Math.floor(Number(p.hour) / 3)]++; }
  return cells;
}
export function quality(d) {
  const m = metrics(d), journeyData = journey(d);
  const noVisitor = d.eventPeriod.filter(e => !e.visitor_id).length;
  return [
    { label: 'Leads com anúncio no período', value: m.paidLeads, total: m.leads, detail: 'Denominador dos custos de aquisição. Sem correspondência não entra no CPL pago.', good: m.paidLeads === m.leads },
    { label: 'Associação por nome', value: d.leads.filter(l => l.match === 'nome').length, detail: 'Fallback somente sem ad_id e com nome único. Revise as UTMs.', good: !d.leads.some(l => l.match === 'nome') },
    { label: 'Investimento sem nicho', value: sum(d.midia.filter(r => r.niche === 'desconhecido'), 'investimento'), money: true, detail: 'Permanece no total. Não é distribuído arbitrariamente entre nichos.', good: !d.midia.some(r => r.niche === 'desconhecido' && num(r.investimento) > 0) },
    { label: 'Qualificados abaixo de R$ 70 mil', value: d.leads.filter(l => l.qualificado === true && revenueBand(l.faturamento) === 'baixo').length, detail: 'Permitidos pela regra atual: só barra faturamento baixo E verba até R$ 1 mil.', good: true },
    { label: 'Perfil ainda não informado', value: m.unclassified, detail: 'Não são desqualificados. Podem ter parado após o telefone.', good: true },
    { label: 'Eventos fora da sequência', value: journeyData.orphanSteps, detail: 'Ocorrências sem os passos anteriores. Excluídas das taxas sequenciais.', good: journeyData.orphanSteps === 0 },
    { label: 'Eventos sem visitante', value: noVisitor, detail: 'Não permitem deduplicação por navegador.', good: noVisitor === 0 },
    { label: 'Reuniões aguardando resultado', value: m.pending, detail: 'Horário já passou e a situação segue agendado. Não contam como no-show.', good: m.pending === 0 },
    { label: 'Contratos sem valor', value: m.unknownRevenue, detail: 'Valor não preenchido. O painel não atribui R$ 6 mil automaticamente.', good: m.unknownRevenue === 0 },
  ];
}
// Monte Carlo com semente: resultado reproduzível ao alternar abas.
export function bestProbability(groups, iterations = 6000) {
  if (groups.length < 2 || groups.some(g => !g.n)) return groups.map(() => null);
  let seed = 98123;
  const rand = () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed + .5) / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const gamma = a => { const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { const x = normal(); let v = 1 + c * x; if (v <= 0) continue; v = v ** 3; const u = rand(); if (u < 1 - .0331 * x ** 4 || Math.log(u) < .5 * x * x + d * (1 - v + Math.log(v))) return d * v; } };
  const wins = groups.map(() => 0);
  for (let i = 0; i < iterations; i++) { let max = -1, winner = 0; groups.forEach((g, j) => { const x = gamma(g.k + 1), v = x / (x + gamma(g.n - g.k + 1)); if (v > max) { max = v; winner = j; } }); wins[winner]++; }
  return wins.map(n => n / iterations);
}
