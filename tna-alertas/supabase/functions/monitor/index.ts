// Monitor do TNA Alertas. Tres rotinas, escolhidas por ?tarefa=:
//   sites  (pg_cron a cada 10 min): pagina no ar, formulario e GTM presentes,
//          e decide o alerta do tracking do n8n a partir de tracking_saude.
//   leads  (pg_cron de hora em hora): gasto sem lead e queda de lead por campanha.
//          As 8h (ou com ?diario=1) tambem roda a queda do dia anterior e
//          atualiza a lista de paginas que sao destino de anuncio ativo.
// ?dry=1 calcula tudo sem gravar e sem notificar, pra testar.
//
// Regra de notificacao fica no banco (alerta_abrir / alerta_resolver): um
// alerta por problema, avisa ao abrir, ao piorar e no lembrete; avisa de novo
// so quando resolve.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const GRAPH = "https://graph.facebook.com/v21.0";
const META_TOKEN = Deno.env.get("META_ADS_TOKEN")!;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

// urgency high: sem isso o Android segura a notificacao ate o app abrir.
const OPCOES_ENVIO = { urgency: "high", TTL: 86400 } as const;
const APP_URL = "https://thenewads.com.br/alertas";
const UA = "Mozilla/5.0 (compatible; TNA-Monitor/1.0; +https://thenewads.com.br)";

// Gasto sem lead: alerta quando o gasto desde o ultimo lead passa de
// MULT_CPL vezes o custo por lead medio (com piso), ou seja, pela media ja
// deveriam ter chegado MULT_CPL leads e nao chegou nenhum.
const MULT_CPL = 5;
const PISO_GASTO = 15;
const DIAS_BASE = 14;
const MIN_LEADS_BASE = 10;
// Queda: dia fechado com menos de 40% da media de leads e gasto normal.
const QUEDA_FATOR = 0.4;
const QUEDA_GASTO_MIN = 0.6;
const QUEDA_MEDIA_MIN = 3;

const LEAD_RE = /lead|messaging_conversation_started|contact|complete_registration|submit_application|schedule/i;
const URL_FORA_RE = /wa\.me|whatsapp|facebook\.com|instagram\.com|fb\.me|m\.me|fb\.com/i;

type Ctx = { dry: boolean; log: unknown[]; abertos: Map<string, any> };

// ---------- notificacao ----------

async function enviarPush(titulo: string, corpo: string) {
  const { data: subs } = await supabase.from("push_subscriptions").select("*");
  if (!subs?.length) return;
  const payload = JSON.stringify({ title: titulo, body: corpo, url: APP_URL });
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        OPCOES_ENVIO,
      );
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }));
}

interface Alerta {
  chave: string;
  slug: string | null;
  tipo: string;
  nivel: "critico" | "atencao";
  titulo: string;
  mensagem: string;
  url?: string | null;
  lembrete?: number | null;
  dados?: Record<string, unknown>;
}

async function abrir(ctx: Ctx, a: Alerta) {
  if (ctx.dry) {
    ctx.log.push({ abriria: a.chave, nivel: a.nivel, titulo: a.titulo, mensagem: a.mensagem, ja_aberto: ctx.abertos.has(a.chave) });
    return;
  }
  const { data, error } = await supabase.rpc("alerta_abrir", {
    p_chave: a.chave,
    p_slug: a.slug,
    p_tipo: a.tipo,
    p_nivel: a.nivel,
    p_titulo: a.titulo,
    p_mensagem: a.mensagem,
    p_url: a.url ?? null,
    p_lembrete_horas: a.lembrete ?? null,
    p_dados: a.dados ?? {},
  });
  if (error) throw new Error(`alerta_abrir ${a.chave}: ${error.message}`);
  ctx.log.push({ chave: a.chave, notificou: data });
  if (data) await enviarPush(`${a.nivel === "critico" ? "🔴" : "🟡"} ${a.titulo}`, a.mensagem);
}

async function resolver(ctx: Ctx, chave: string, avisar: boolean, corpo: string) {
  if (!ctx.abertos.has(chave)) return;
  if (ctx.dry) {
    ctx.log.push({ resolveria: chave, avisar });
    return;
  }
  const { data, error } = await supabase.rpc("alerta_resolver", { p_chave: chave, p_avisar: avisar });
  if (error) throw new Error(`alerta_resolver ${chave}: ${error.message}`);
  ctx.log.push({ chave, resolvido: true, avisou: !!data });
  if (data) await enviarPush(`🟢 ${data}`, corpo);
}

// ---------- datas (horario de Sao Paulo) ----------

function dataBRT(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function horaBRT(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(d));
}
function horaMinBRT(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
}
function addDias(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function ddmm(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
function reais(v: number) {
  return "R$ " + v.toFixed(2).replace(".", ",");
}
function horasDesde(iso: string | null) {
  return iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : Infinity;
}
function linkGerenciador(contaAnuncio: string) {
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${contaAnuncio.replace(/^act_/, "")}`;
}

// ---------- sites ----------

function normalizarUrl(u: string) {
  try {
    const x = new URL(u);
    const path = x.pathname === "/" ? "/" : x.pathname.replace(/\/+$/, "");
    return `${x.protocol}//${x.host.toLowerCase()}${path}`;
  } catch {
    return u;
  }
}

function descreverFalta(m: string) {
  if (/form/i.test(m)) return "o formulário";
  if (/GTM/i.test(m)) return "o GTM (rastreamento)";
  return m;
}

async function checarSite(s: any): Promise<{ ok: boolean; status: number | null; erro?: string; abriu?: boolean }> {
  try {
    const res = await fetch(s.url, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20000),
    });
    const status = res.status;
    if (!(s.status_ok as number[]).includes(status)) {
      await res.body?.cancel();
      return { ok: false, status, erro: `Erro ${status} ao abrir` };
    }
    if (status === 200 && s.marcadores?.length) {
      const html = await res.text();
      const falta = (s.marcadores as string[]).filter((m) => !new RegExp(m, "i").test(html));
      if (falta.length) {
        return { ok: false, status, abriu: true, erro: `A página abre, mas está sem ${falta.map(descreverFalta).join(" e ")}` };
      }
    } else {
      await res.body?.cancel();
    }
    return { ok: true, status };
  } catch (e) {
    const nome = (e as Error)?.name;
    return {
      ok: false,
      status: null,
      erro: nome === "TimeoutError" ? "Não respondeu em 20 segundos" : `Não conectou (${String((e as Error)?.message ?? e).slice(0, 80)})`,
    };
  }
}

async function rodarSites(ctx: Ctx) {
  const { data: sites, error } = await supabase.from("sites_monitorados").select("*").eq("ativo", true);
  if (error) throw error;

  const checados = await Promise.all((sites ?? []).map(async (s) => ({ s, r: await checarSite(s) })));
  const resumo = [];

  for (const { s, r } of checados) {
    const falhas = r.ok ? 0 : s.falhas_seguidas + 1;
    resumo.push({ site: s.nome, status: r.status, ok: r.ok, erro: r.erro, falhas });
    if (!ctx.dry) {
      await supabase.from("sites_monitorados").update({
        falhas_seguidas: falhas,
        ultimo_status: r.status,
        ultimo_erro: r.ok ? null : r.erro,
        ultimo_check: new Date().toISOString(),
        ...(r.ok ? { ultimo_ok: new Date().toISOString() } : {}),
      }).eq("id", s.id);
    }

    const chave = `site:${s.url}`;
    if (!r.ok && falhas >= 2) {
      const desde = s.ultimo_ok ? ` Última vez no ar: ${ddmm(dataBRT(new Date(s.ultimo_ok)))} às ${horaMinBRT(new Date(s.ultimo_ok))}.` : "";
      await abrir(ctx, {
        chave,
        slug: s.slug,
        tipo: "site",
        nivel: "critico",
        titulo: r.abriu ? `${s.nome} com problema` : `${s.nome} fora do ar`,
        mensagem: `${r.erro}. ${s.url}${desde}`,
        url: s.url,
        lembrete: 24,
        dados: { status: r.status },
      });
    } else if (r.ok) {
      await resolver(ctx, chave, true, `${s.nome} voltou a abrir normalmente.`);
    }
  }
  return resumo;
}

// O monitor de tracking (rotina na nuvem, 9h e 18h) so grava o diagnostico em
// tracking_saude. Quem decide se vira notificacao e daqui.
async function avaliarTracking(ctx: Ctx) {
  const { data: rows } = await supabase.from("tracking_saude").select("*");
  const recentes = (rows ?? []).filter((t) => horasDesde(t.checked_at) <= 14);

  const maisRecente = Math.min(...(rows ?? []).map((t) => horasDesde(t.checked_at)));
  if (rows?.length && maisRecente > 26) {
    await abrir(ctx, {
      chave: "tracking:parado",
      slug: null,
      tipo: "tracking",
      nivel: "atencao",
      titulo: "Monitor de tracking parado",
      mensagem: `A checagem do tracking do n8n não roda há ${Math.floor(maisRecente)} horas. Conferir a rotina na nuvem.`,
      lembrete: 24,
    });
  } else {
    await resolver(ctx, "tracking:parado", true, "A checagem do tracking voltou a rodar.");
  }

  const semAcesso = recentes.filter((t) => t.checagem_falhou);
  if (semAcesso.length) {
    await abrir(ctx, {
      chave: "tracking:checagem",
      slug: null,
      tipo: "tracking",
      nivel: "atencao",
      titulo: "Checagem do tracking sem acesso ao n8n",
      mensagem: `Não deu pra verificar ${semAcesso.length} cliente(s) porque a API do n8n não respondeu.`,
      lembrete: 24,
    });
  } else {
    await resolver(ctx, "tracking:checagem", true, "A checagem do tracking voltou a ler o n8n.");
  }

  for (const t of rows ?? []) {
    const chave = `tracking:${t.slug}`;
    const recente = horasDesde(t.checked_at) <= 14;
    if (recente && t.nivel === "critico" && !t.checagem_falhou) {
      await abrir(ctx, {
        chave,
        slug: t.slug,
        tipo: "tracking",
        nivel: "critico",
        titulo: `${t.nome}: tracking com falha`,
        mensagem: String(t.status_texto ?? "").slice(0, 220),
        lembrete: 24,
      });
    } else if (recente && (t.nivel === "ok" || t.nivel === "atencao")) {
      await resolver(ctx, chave, true, `${t.nome}: tracking enviando eventos normalmente.`);
    }
  }
}

// ---------- leads ----------

async function graphTodas(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", META_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const out: any[] = [];
  let next: string | null = url.toString();
  while (next) {
    const res = await fetch(next, { signal: AbortSignal.timeout(30000) });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    out.push(...(json.data ?? []));
    next = json.paging?.next ?? null;
  }
  return out;
}

// "lead": o resultado da campanha e lead ou conversa; "outro": a campanha
// otimiza pra outra coisa (engajamento, alcance, compra); "indef": dia sem resultado.
function leadsDaLinha(row: any): { leads: number; tipo: "lead" | "outro" | "indef" } {
  const results = (row.results ?? []) as { indicator?: string; values?: { value: string }[] }[];
  const deLead = results.filter((r) => LEAD_RE.test(r.indicator ?? ""));
  if (deLead.length) {
    return { leads: deLead.reduce((s, r) => s + Number(r.values?.[0]?.value ?? 0), 0), tipo: "lead" };
  }
  if (results.some((r) => Number(r.values?.[0]?.value ?? 0) > 0)) return { leads: 0, tipo: "outro" };
  const acts: Record<string, number> = {};
  for (const a of row.actions ?? []) acts[a.action_type] = (acts[a.action_type] ?? 0) + Number(a.value ?? 0);
  const l = (acts["lead"] ?? acts["onsite_conversion.lead_grouped"] ?? 0) +
    (acts["onsite_conversion.messaging_conversation_started_7d"] ?? 0);
  return { leads: l, tipo: l > 0 ? "lead" : "indef" };
}

interface Dia {
  gasto: number;
  leads: number;
}

async function rodarLeads(ctx: Ctx, diario: boolean) {
  const { data: clientes, error } = await supabase
    .from("clientes_meta_contas")
    .select("slug, nome, conta_anuncio")
    .eq("ativo", true);
  if (error) throw error;

  const hoje = dataBRT();
  const ontem = addDias(hoje, -1);
  const resumo: unknown[] = [];
  const campanhasAvaliadas = new Set<string>();

  for (const cli of clientes ?? []) {
    try {
      const [campanhas, linhas] = await Promise.all([
        graphTodas(`${cli.conta_anuncio}/campaigns`, { fields: "id,name,effective_status", limit: "200" }),
        graphTodas(`${cli.conta_anuncio}/insights`, {
          level: "campaign",
          time_increment: "1",
          time_range: JSON.stringify({ since: addDias(hoje, -30), until: hoje }),
          fields: "campaign_id,campaign_name,spend,results,actions",
          limit: "500",
        }),
      ]);
      const status = new Map(campanhas.map((c: any) => [c.id, c.effective_status]));

      const porCampanha = new Map<string, { nome: string; dias: Map<string, Dia>; temLead: boolean; temOutro: boolean }>();
      for (const l of linhas) {
        const c = porCampanha.get(l.campaign_id) ?? { nome: l.campaign_name, dias: new Map(), temLead: false, temOutro: false };
        const { leads, tipo } = leadsDaLinha(l);
        c.dias.set(l.date_start, { gasto: Number(l.spend ?? 0), leads });
        c.temLead ||= tipo === "lead";
        c.temOutro ||= tipo === "outro";
        porCampanha.set(l.campaign_id, c);
      }

      for (const [id, c] of porCampanha) {
        if (!c.temLead || c.temOutro) continue;
        const chave = `sem_lead:${id}`;
        const ativa = status.get(id) === "ACTIVE";
        const hojeDia = c.dias.get(hoje) ?? { gasto: 0, leads: 0 };

        if (!ativa) {
          await resolver(ctx, chave, false, "");
          continue;
        }
        if (hojeDia.gasto <= 0 && !ctx.abertos.has(chave)) continue;
        campanhasAvaliadas.add(id);

        if (!ctx.dry) {
          await supabase.from("monitor_leads_snap").insert({
            slug: cli.slug, campanha_id: id, campanha: c.nome, data: hoje, gasto: hojeDia.gasto, leads: hojeDia.leads,
          });
        }
        const { data: snaps } = await supabase
          .from("monitor_leads_snap")
          .select("data, gasto, leads, capturado_em")
          .eq("campanha_id", id)
          .gte("data", addDias(hoje, -3))
          .order("capturado_em");
        const snapsDe = (d: string) => (snaps ?? []).filter((s) => s.data === d);
        // gasto acumulado no momento em que o dia chegou ao total de leads final
        const gastoNoUltimoLead = (d: string, leadsFinal: number) =>
          snapsDe(d).find((s) => Number(s.leads) >= leadsFinal)?.gasto;

        // gasto desde o ultimo lead
        let gastoDesde = 0;
        let ultimoLead = "";
        const diasSemLead = new Set<string>();
        if (hojeDia.leads > 0) {
          const g = gastoNoUltimoLead(hoje, hojeDia.leads);
          gastoDesde = g == null ? 0 : Math.max(0, hojeDia.gasto - Number(g));
          ultimoLead = "hoje";
        } else {
          gastoDesde = hojeDia.gasto;
          diasSemLead.add(hoje);
          for (let i = 1; i <= 30; i++) {
            const d = addDias(hoje, -i);
            const dia = c.dias.get(d);
            if (!dia) continue;
            if (dia.leads === 0) {
              gastoDesde += dia.gasto;
              diasSemLead.add(d);
              continue;
            }
            const g = gastoNoUltimoLead(d, dia.leads);
            if (g != null) gastoDesde += Math.max(0, dia.gasto - Number(g));
            ultimoLead = ddmm(d);
            break;
          }
          if (!ultimoLead) ultimoLead = "há mais de 30 dias";
        }

        // base: ultimos 14 dias com gasto, fora hoje e fora a sequencia sem lead
        const base = [...c.dias.entries()]
          .filter(([d, v]) => d < hoje && !diasSemLead.has(d) && v.gasto > 0)
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .slice(0, DIAS_BASE);
        const somaG = base.reduce((s, [, v]) => s + v.gasto, 0);
        const somaL = base.reduce((s, [, v]) => s + v.leads, 0);
        const baseOk = somaL >= MIN_LEADS_BASE;
        const cpl = baseOk ? somaG / somaL : null;
        const mediaDia = base.length ? somaL / base.length : 0;
        const limite = cpl ? Math.max(MULT_CPL * cpl, PISO_GASTO) : null;

        const info = {
          cliente: cli.slug, campanha: c.nome, gasto_hoje: hojeDia.gasto, leads_hoje: hojeDia.leads,
          gasto_desde_ultimo_lead: Math.round(gastoDesde * 100) / 100, ultimo_lead: ultimoLead,
          cpl: cpl ? Math.round(cpl * 100) / 100 : null, media_dia: Math.round(mediaDia * 10) / 10, limite,
        };
        resumo.push(info);

        const mensagem = `${c.nome}: ${reais(gastoDesde)} gastos sem nenhum lead. Último lead: ${ultimoLead}.` +
          (cpl ? ` A média é ${mediaDia.toFixed(0)} leads por dia, 1 a cada ${reais(cpl)}.` : "");

        const url = linkGerenciador(cli.conta_anuncio);
        if (limite != null && gastoDesde >= limite) {
          await abrir(ctx, {
            chave, slug: cli.slug, tipo: "sem_lead", nivel: "critico",
            titulo: `${cli.nome}: gastando sem lead`, mensagem, url, lembrete: 24, dados: info,
          });
        } else if (limite == null && ctx.abertos.has(chave) && hojeDia.leads === 0) {
          // base estragada pela propria sequencia sem lead: mantem aberto
          await abrir(ctx, {
            chave, slug: cli.slug, tipo: "sem_lead", nivel: "critico",
            titulo: `${cli.nome}: gastando sem lead`, mensagem, url, lembrete: 24, dados: info,
          });
        } else {
          await resolver(ctx, chave, true, `${c.nome} voltou a gerar lead.`);
        }

        // queda do dia anterior, uma vez por dia
        if (diario) {
          const y = c.dias.get(ontem);
          const baseQ = [...c.dias.entries()]
            .filter(([d, v]) => d < ontem && v.gasto > 0)
            .sort((a, b) => (a[0] < b[0] ? 1 : -1))
            .slice(0, DIAS_BASE);
          if (y && baseQ.length >= 5) {
            const mL = baseQ.reduce((s, [, v]) => s + v.leads, 0) / baseQ.length;
            const mG = baseQ.reduce((s, [, v]) => s + v.gasto, 0) / baseQ.length;
            if (mL >= QUEDA_MEDIA_MIN && y.gasto >= QUEDA_GASTO_MIN * mG && y.leads > 0 && y.leads < QUEDA_FATOR * mL) {
              await abrir(ctx, {
                chave: `queda:${id}:${ontem}`, slug: cli.slug, tipo: "queda_lead", nivel: "atencao",
                titulo: `${cli.nome}: leads caíram`,
                mensagem: `${c.nome}: ontem (${ddmm(ontem)}) foram ${y.leads} leads com ${reais(y.gasto)} gastos. A média é ${mL.toFixed(0)} leads por dia.`,
                url: linkGerenciador(cli.conta_anuncio),
                dados: { leads_ontem: y.leads, media: mL },
              });
            }
          }
        }
      }

      if (diario) await atualizarPaginasDeAnuncio(ctx, cli);
    } catch (err) {
      resumo.push({ cliente: cli.slug, erro: String(err).slice(0, 200) });
    }
  }

  // problema aberto de campanha que nem apareceu mais (conta desligada etc.).
  // Se alguma conta deu erro na leitura, nao da pra saber: deixa como esta.
  const algumaContaFalhou = resumo.some((r: any) => r?.erro);
  if (!algumaContaFalhou) {
    for (const [chave] of ctx.abertos) {
      if (chave.startsWith("sem_lead:") && !campanhasAvaliadas.has(chave.slice(9))) {
        await resolver(ctx, chave, false, "");
      }
    }
  }

  if (diario) {
    for (const [chave, p] of ctx.abertos) {
      if (chave.startsWith("queda:") && horasDesde(p.aberto_em) > 20) await resolver(ctx, chave, false, "");
    }
    if (!ctx.dry) await supabase.from("monitor_leads_snap").delete().lt("data", addDias(hoje, -10));
  }
  return resumo;
}

// Paginas que sao destino de anuncio ativo entram no monitor de site sozinhas.
async function atualizarPaginasDeAnuncio(ctx: Ctx, cli: { slug: string; nome: string; conta_anuncio: string }) {
  const ads = await graphTodas(`${cli.conta_anuncio}/ads`, {
    effective_status: JSON.stringify(["ACTIVE"]),
    fields: "creative{object_url,link_url,object_story_spec{link_data{link},video_data{call_to_action}},asset_feed_spec{link_urls}}",
    limit: "200",
  });
  const urls = new Set<string>();
  const coletar = (o: unknown) => {
    if (Array.isArray(o)) return o.forEach(coletar);
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === "string" && /^https?:\/\//.test(v) && ["link", "object_url", "link_url", "website_url", "value"].includes(k)) {
          if (!URL_FORA_RE.test(v)) urls.add(normalizarUrl(v));
        } else coletar(v);
      }
    }
  };
  ads.forEach((a) => coletar(a.creative));
  if (!urls.size) return;

  const { data: existentes } = await supabase.from("sites_monitorados").select("id, url");
  const porUrl = new Map((existentes ?? []).map((e) => [normalizarUrl(e.url), e.id]));
  for (const u of urls) {
    if (ctx.dry) {
      ctx.log.push({ pagina_de_anuncio: u, nova: !porUrl.has(u) });
      continue;
    }
    const id = porUrl.get(u);
    if (id) {
      await supabase.from("sites_monitorados").update({ visto_em_anuncio: new Date().toISOString() }).eq("id", id);
    } else {
      await supabase.from("sites_monitorados").insert({
        slug: cli.slug, nome: `${cli.nome}: página do anúncio`, url: u, origem: "anuncio",
        visto_em_anuncio: new Date().toISOString(),
      });
    }
  }
}

async function desativarPaginasAntigas(ctx: Ctx) {
  if (ctx.dry) return;
  const corte = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("sites_monitorados")
    .update({ ativo: false })
    .eq("origem", "anuncio")
    .eq("ativo", true)
    .lt("visto_em_anuncio", corte)
    .select("url");
  for (const s of data ?? []) await resolver(ctx, `site:${s.url}`, false, "");
}

// ---------- entrada ----------

Deno.serve(async (req: Request) => {
  const u = new URL(req.url);
  const tarefa = u.searchParams.get("tarefa") ?? "sites";
  const dry = u.searchParams.get("dry") === "1";
  const diario = u.searchParams.get("diario") === "1" || horaBRT() === 8;

  const { data: abertos } = await supabase.from("alertas_problemas").select("*").is("resolvido_em", null);
  const ctx: Ctx = { dry, log: [], abertos: new Map((abertos ?? []).map((p) => [p.chave, p])) };

  try {
    let resultado: unknown;
    if (tarefa === "leads") {
      resultado = await rodarLeads(ctx, diario);
      if (diario) await desativarPaginasAntigas(ctx);
    } else {
      resultado = await rodarSites(ctx);
      await avaliarTracking(ctx);
    }
    return new Response(JSON.stringify({ ok: true, tarefa, dry, diario, resultado, acoes: ctx.log }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, tarefa, erro: String(err), acoes: ctx.log }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
