// Dados sintéticos de teste. Não são importados pela aplicação nem enviados ao Supabase.
export function fixture(now = new Date()) {
  const data = { leads: [], eventos: [], agendamentos: [], etapas: [], midia: [] };
  const midnight = new Date(now); midnight.setUTCHours(12, 0, 0, 0);
  const at = (days, hours = 0) => new Date(midnight.getTime() - days * 86400000 + hours * 3600000).toISOString();
  const profiles = ['vet', 'eventos', 'generico'];
  for (let d = 56; d > 0; d--) for (let a = 1; a <= 6; a++) data.midia.push({ data: at(d).slice(0, 10), source_id: String(120000000000 + a), anuncio: `AD0${a}_${a < 3 ? 'VET' : a < 5 ? 'EVENTOS' : 'NEGOCIO_LOCAL'}_${a % 2 ? 'VIDEO' : 'ESTATICO'}`, investimento: 5 + (a * d % 11) / 10, impressoes: 185 + d * a % 90, cliques_no_link: (a + d) % 3, frequencia: 1.3, simulado: true });
  for (let i = 0; i < 442; i++) {
    const ago = 1 + i % 56, nicheIndex = i % 3, niche = profiles[nicheIndex], ad = nicheIndex * 2 + 1 + (i % 2), visitor = `visitor-${i}`;
    const base = { visitor_id: visitor, lead_id: i < 68 ? `lead-${i}` : null, nicho: niche, ad_id: String(120000000000 + ad), simulado: true };
    const event = (tipo, paso, seconds) => data.eventos.push({ ...base, tipo, passo: paso, created_at: new Date(new Date(at(ago)).getTime() + seconds * 1000).toISOString() });
    event('form_view', null, 0);
    if (i >= 134) continue;
    event('form_start', null, 2); event('form_step', 1, 4); event('form_step', 2, 6);
    if (i >= 68) continue;
    event('form_step', 3, 8); event('lead', null, 8);
    const qualified = i < 45 && (niche === 'vet' ? i % 9 !== 0 : niche === 'eventos' ? i === 1 : i < 14);
    const booked = [0, 2, 3, 6, 9, 12].includes(i), held = [0, 3, 6].includes(i), client = [0, 3].includes(i);
    const lead = { id: `lead-${i}`, created_at: at(ago), nicho: niche, ad_id: base.ad_id, etapa: client ? 'cliente' : held ? 'reuniao' : booked ? 'no_show' : qualified ? 'qualificado' : i < 45 ? 'desqualificado' : 'novo', qualificado: i < 45 ? qualified : null, faturamento: i < 45 ? (qualified ? i % 2 ? 'R$ 30 mil a R$ 69 mil' : 'R$ 70 mil a R$ 199 mil' : 'Ate R$ 30 mil') : null, verba: i < 45 ? qualified ? 'R$ 1,1 mil a R$ 3 mil' : 'Ate R$ 1 mil' : null, ja_investe: i < 45 ? i % 2 ? 'Nao, nunca investi' : 'Sim, com agencia ou gestor' : null, utm_placement: ['instagram_feed', 'instagram_stories', 'facebook_feed'][i % 3], utm_content: data.midia.find(m => m.source_id === base.ad_id).anuncio, simulado: true, fee_mensal: client ? 1500 : null, meses_previstos: client ? 4 : null, valor_contrato: client ? 6000 : null, fechado_em: client ? at(Math.max(1, ago - 10)) : null };
    data.leads.push(lead); data.etapas.push({ lead_id: lead.id, de: null, para: 'novo', em: at(ago), simulado: true });
    if (i < 45) { event('form_step', 4, 10); event('form_step', 5, 12); event('form_step', 6, 14); event('form_complete', null, 16); }
    if (qualified) event('scheduler_view', null, 18);
    if (booked) {
      event('slot_selected', null, 22); event('schedule', null, 28);
      data.agendamentos.push({ id: `meeting-${i}`, lead_id: lead.id, created_at: at(ago, 1), inicio: at(Math.max(1, ago - 3)), situacao: held ? 'realizada' : 'no_show', nicho: niche, ad_id: base.ad_id, simulado: true });
      data.etapas.push({ lead_id: lead.id, de: 'novo', para: 'agendou', em: at(ago, 1), simulado: true });
    }
    if (held) data.etapas.push({ lead_id: lead.id, de: 'agendou', para: 'reuniao', em: at(Math.max(1, ago - 3)), simulado: true });
    if (client) { data.etapas.push({ lead_id: lead.id, de: 'reuniao', para: 'proposta', em: at(Math.max(1, ago - 5)), simulado: true }); data.etapas.push({ lead_id: lead.id, de: 'proposta', para: 'cliente', em: lead.fechado_em, simulado: true }); }
  }
  return data;
}
