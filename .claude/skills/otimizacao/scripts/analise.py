"""Transforma meta.json e google.json num texto por cliente, base do relatório da revisão.

Cada cliente da carteira vira um bloco (CLIENTE: nome) com a conta Meta e depois a Google,
na ordem de carteira.json. Conta sem gasto aparece dentro do bloco do cliente, numa linha.

Uso: python analise.py [--fim AAAA-MM-DD] [--saida pasta] [--plataforma meta|google|todas]
Grava analise.txt na pasta de saída e imprime o mesmo conteúdo.
"""
import sys

sys.dont_write_bytecode = True  # sem __pycache__ no repositório (sincroniza sozinho)

import datetime as dt
import io
import json
import re
from collections import Counter, defaultdict

from comum import args_padrao, brl, carteira, custo_por, f, pasta_saida, pct, periodos, rotulo_periodo
from tendencia import ctr_janelas, janelas_de_diario, linhas_tendencia, m, sinal_fadiga

p = args_padrao(__doc__)
p.add_argument("--plataforma", default="todas", choices=["meta", "google", "todas"])
args = p.parse_args()
per = periodos(args.fim)
pasta = pasta_saida(args, per)

# Cada conta escreve no próprio buffer; no fim os buffers são juntados por cliente.
_buf = defaultdict(io.StringIO)
_atual = [("geral", "")]


def w(*partes):
    print(*partes, file=_buf[_atual[0]])


def conta_atual(plat, cid):
    _atual[0] = (plat, str(cid))


STATUS_CONTA_META = {1: "ATIVA", 2: "DESATIVADA", 3: "PAGAMENTO PENDENTE", 7: "EM ANÁLISE DE RISCO",
                     8: "LIQUIDAÇÃO PENDENTE", 9: "PERÍODO DE CARÊNCIA", 100: "FECHAMENTO PENDENTE", 101: "FECHADA"}

# Quem aparece no histórico de atividades da Meta:
#   "PH Machado" = alterações feitas pela API (pelo Claude). "Meta" com rule_info = regra automática.
#   "Meta" sem regra = evento do sistema (análise, cobrança, entrega), descartado.
ATOR_API = {"PH Machado"}
EVENTO_IGNORADO = {"add_images", "edit_images", "update_ad_run_status_to_be_set_after_review",
                   "first_delivery_event", "ad_account_billing_charge", "funding_event_successful",
                   "create_audience", "update_audience"}
STATUS_TRANSITORIO = {"Processo pendente", "Análise pendente"}


def _valor(v):
    """Formata old/new_value da Meta: dinheiro vem em centavos dentro de um dict."""
    if isinstance(v, dict):
        for k in ("old_value", "new_value"):
            if isinstance(v.get(k), (int, float)) and v.get("type") == "payment_amount":
                return brl(v[k] / 100)
        return ""
    if isinstance(v, list):
        return ""
    return str(v)[:25] if v is not None else ""


def descreve_atividade(ev):
    """Devolve (dia, quem, tipo, objeto + mudança) ou None se for ruído."""
    tipo_raw = ev.get("event_type", "")
    if tipo_raw in EVENTO_IGNORADO:
        return None
    try:
        ed = json.loads(ev.get("extra_data") or "{}")
    except ValueError:
        ed = {}
    if not isinstance(ed, dict):
        ed = {}
    ator = ev.get("actor_name") or ""
    if ator == "Meta":
        regra = (ed.get("rule_info") or {}).get("rule_latest_name")
        if not regra:
            return None
        quem = f"regra automática \"{regra[:40]}\""
    elif ator in ATOR_API:
        quem = "API"
    elif ator:
        quem = ator
    else:
        return None
    velho, novo = _valor(ed.get("old_value")), _valor(ed.get("new_value"))
    if velho in STATUS_TRANSITORIO or novo in STATUS_TRANSITORIO:
        return None
    mud = f" ({velho} -> {novo})" if (velho or novo) and "url" not in tipo_raw else ""
    tipo = ev.get("translated_event_type") or tipo_raw
    return ev.get("event_time", "")[:10], quem, tipo, (ev.get("object_name") or "")[:45] + mud


def lista(v):
    return v if isinstance(v, list) else []


def erro(v):
    return isinstance(v, dict) and "_erro" in v


# --------------------------------------------------------------------------- Meta

def resultado_meta(r):
    """(quantidade, indicador) do campo results da Meta."""
    for it in r.get("results", []) or []:
        v = it.get("values") or []
        if v:
            ind = it.get("indicator", "")
            for pre in ("actions:", "onsite_conversion.", "offsite_conversion."):
                ind = ind.replace(pre, "")
            return f(v[0].get("value")), ind
    return 0.0, ""


def acao(r, chave, campo="actions"):
    for it in r.get(campo, []) or []:
        if it.get("action_type") == chave:
            return f(it.get("value"))
    return 0.0


def saldo_prepago(c):
    txt = (c.get("funding_source_details") or {}).get("display_string", "")
    m = re.search(r"R\$\s?([\d\.]+,\d{2})", txt)
    return f(m.group(1).replace(".", "").replace(",", ".")) if m else None


def por_periodo(linhas, chave_id):
    """{id: {"ant": linha, "30d": linha, "14d": ..., "7d": ..., "3d": ..., "atu": linha de 7d}}"""
    out_ = defaultdict(dict)
    for r in lista(linhas):
        rot = rotulo_periodo(per, r.get("date_start"), r.get("date_stop"))
        if rot:
            out_[r[chave_id]][rot] = r
            if rot == "7d":
                out_[r[chave_id]]["atu"] = r
    return out_


def metricas_meta(r):
    return m(r.get("spend"), r.get("impressions"), r.get("inline_link_clicks"), resultado_meta(r)[0], r.get("frequency"))


def janelas_meta(por_rot):
    return {k: metricas_meta(por_rot.get(k, {})) for k in ("30d", "14d", "7d", "3d")}


def diario_meta(linhas, chave_id):
    out_ = defaultdict(dict)
    for r in lista(linhas):
        out_[r.get(chave_id)][r["date_start"]] = metricas_meta(r)
    return out_


def idade(created_time):
    try:
        return (dt.date.fromisoformat(per["hoje"]) - dt.date.fromisoformat(created_time[:10])).days
    except (TypeError, ValueError):
        return None


def analisa_meta(D):
    for c in D["contas"]:
        conta_atual("meta", c["id"])
        if c.get("erro_conta"):
            w("=" * 100)
            w(f"META | {c['name']} | {c['id']} | ERRO ao ler a conta ({c['erro_conta'][:120]})")
            continue
        if not c.get("gasto_14d"):
            st = STATUS_CONTA_META.get(c.get("account_status"), c.get("account_status"))
            w("=" * 100)
            if c.get("n_camps_ativas"):
                w(f"META | {c['name']} | {c['id']} | !! SEM GASTO em 14 dias, mas com {c['n_camps_ativas']} "
                  f"campanha(s) ativa(s) | conta {st} | {(c.get('funding_source_details') or {}).get('display_string', '')}")
            else:
                w(f"META | {c['name']} | {c['id']} | sem gasto em 14 dias e sem campanha ativa | conta {st}")
            continue
        camps = {x["id"]: x for x in lista(c.get("campanhas_ativas"))}
        conjs = {x["id"]: x for x in lista(c.get("conjuntos_ativos"))}
        ads = {x["id"]: x for x in lista(c.get("anuncios"))}
        st = STATUS_CONTA_META.get(c.get("account_status"), c.get("account_status"))
        bc = por_periodo(c.get("ins_campaign"), "campaign_id")
        gasto_atu = sum(f(v.get("atu", {}).get("spend")) for v in bc.values())
        gasto_ant = sum(f(v.get("ant", {}).get("spend")) for v in bc.values())
        res_atu = sum(resultado_meta(v.get("atu", {}))[0] for v in bc.values())
        res_ant = sum(resultado_meta(v.get("ant", {}))[0] for v in bc.values())
        saldo = saldo_prepago(c) if c.get("is_prepay_account") else None
        media = gasto_atu / 7
        txt_saldo = f" | saldo pré-pago {brl(saldo)} (~{saldo / media:.0f} dias)" if saldo is not None and media else ""
        w("=" * 100)
        w(f"META | {c['name']} | {c['id']} | conta {st}{txt_saldo}")
        w(f"  TOTAL gasto {brl(gasto_ant)} -> {brl(gasto_atu)} ({pct(gasto_atu, gasto_ant)}) | resultados "
          f"{res_ant:.0f} -> {res_atu:.0f} | custo/resultado {custo_por(gasto_ant, res_ant)} -> {custo_por(gasto_atu, res_atu)}")
        for k in ("ins_campaign", "ins_adset", "ins_ad", "conjuntos_ativos", "anuncios", "atividades", "diario_campaign", "diario_adset"):
            if erro(c.get(k)):
                w(f"  ERRO na coleta de {k}: {c[k]['msg'][:200]}")
        t30 = lista(c.get("ins_30d"))
        if t30:
            w(f"  30 dias: gasto {brl(t30[0].get('spend'))} | frequência {f(t30[0].get('frequency')):.2f}")

        ontem = {r["campaign_id"]: r for r in lista(c.get("ins_ontem"))}
        hoje = {r["campaign_id"]: r for r in lista(c.get("ins_hoje"))}
        dc = diario_meta(c.get("diario_campaign"), "campaign_id")
        ds = diario_meta(c.get("diario_adset"), "adset_id")
        w("  CAMPANHAS (semana anterior -> esta semana; tendência em 30/14/7/3 dias até ontem)")
        for cid in sorted(set(bc) | set(camps), key=lambda x: -f(bc.get(x, {}).get("atu", {}).get("spend"))):
            a, t = bc.get(cid, {}).get("ant", {}), bc.get(cid, {}).get("atu", {})
            nome = next((r.get("campaign_name") for r in bc.get(cid, {}).values() if r.get("campaign_name")),
                        camps.get(cid, {}).get("name", "?"))
            ga, gt = f(a.get("spend")), f(t.get("spend"))
            if cid not in camps and not ga and not gt:
                continue
            ra, ind = resultado_meta(a)
            rt, ind2 = resultado_meta(t)
            orc = camps.get(cid, {}).get("daily_budget")
            compras = acao(t, "offsite_conversion.fb_pixel_purchase") or acao(t, "purchase")
            receita = acao(t, "offsite_conversion.fb_pixel_purchase", "action_values") or acao(t, "purchase", "action_values")
            roas = f" | ROAS {receita / gt:.2f} ({compras:.0f} compras, {brl(receita)})" if receita and gt else ""
            o, h = ontem.get(cid, {}), hoje.get(cid, {})
            w(f"   [{'ATIVA' if cid in camps else 'off'}] {nome[:60]}")
            w(f"      gasto {brl(ga)} -> {brl(gt)} ({pct(gt, ga)}) | {ind2 or ind} {ra:.0f} -> {rt:.0f} | "
              f"custo {custo_por(ga, ra)} -> {custo_por(gt, rt)} ({pct(gt / rt if rt else 0, ga / ra if ra else 0)}) | "
              f"freq7 {f(t.get('frequency')):.2f} | CTR link {f(a.get('inline_link_click_ctr')):.2f}% -> "
              f"{f(t.get('inline_link_click_ctr')):.2f}% | CPM {brl(a.get('cpm'))} -> {brl(t.get('cpm'))}"
              f" | orç/dia {brl(f(orc) / 100) if orc else 'no conjunto'}{roas}")
            w(f"      ontem {brl(o.get('spend'))}, {resultado_meta(o)[0]:.0f} resultado(s) | hoje até agora {brl(h.get('spend'))}")
            if cid in camps and gt:
                w("      TENDÊNCIA")
                for linha in linhas_tendencia(janelas_meta(bc[cid]), dc.get(cid, {}), per,
                                              (a.get("frequency"), t.get("frequency"))):
                    w(f"        {linha}")

        w("  CONJUNTOS")
        bs = por_periodo(c.get("ins_adset"), "adset_id")
        conj_por_camp = Counter(conjs[sid].get("campaign_id") for sid in conjs
                                if f(bs.get(sid, {}).get("7d", {}).get("spend")))
        for sid in sorted(set(bs) | set(conjs), key=lambda x: -f(bs.get(x, {}).get("atu", {}).get("spend"))):
            a, t = bs.get(sid, {}).get("ant", {}), bs.get(sid, {}).get("atu", {})
            meta = conjs.get(sid, {})
            ga, gt = f(a.get("spend")), f(t.get("spend"))
            if sid not in conjs and not gt:
                continue
            ra, rt = resultado_meta(a)[0], resultado_meta(t)[0]
            aprend = (meta.get("learning_stage_info") or {}).get("status", "")
            orc = meta.get("daily_budget")
            w(f"   [{'ATIVO' if sid in conjs else 'off'}] {((t or a).get('adset_name') or meta.get('name', '?'))[:55]} | "
              f"gasto {brl(ga)} -> {brl(gt)} | res {ra:.0f} -> {rt:.0f} | custo {custo_por(ga, ra)} -> {custo_por(gt, rt)} | "
              f"freq7 {f(t.get('frequency')):.2f} | alcance {t.get('reach', 0)} | aprendizado {aprend or '-'} | "
              f"orç/dia {brl(f(orc) / 100) if orc else '-'} | criado {meta.get('created_time', '')[:10]}")
            if sid in conjs and gt and conj_por_camp.get(meta.get("campaign_id"), 0) > 1:
                for linha in linhas_tendencia(janelas_meta(bs[sid]), ds.get(sid, {}), per,
                                              (a.get("frequency"), t.get("frequency"))):
                    w(f"        {linha}")

        w("  ANÚNCIOS (por gasto na semana; FADIGA = 14+ dias no ar e taxa de cliques da semana 20%+ abaixo do mês)")
        bd = por_periodo(c.get("ins_ad"), "ad_id")
        linhas = []
        for aid in set(bd) | set(ads):
            a, t = bd.get(aid, {}).get("ant", {}), bd.get(aid, {}).get("atu", {})
            meta = ads.get(aid, {})
            ga, gt = f(a.get("spend")), f(t.get("spend"))
            status = meta.get("effective_status", "off")
            problema = status in ("WITH_ISSUES", "DISAPPROVED") and (
                meta.get("campaign_id") in camps or meta.get("created_time", "") >= per["ant"][0])
            if not gt and not ga and status != "ACTIVE" and not problema:
                continue
            ra, rt = resultado_meta(a)[0], resultado_meta(t)[0]
            issues = meta.get("issues_info")
            Wad = janelas_meta(bd.get(aid, {}))
            dias = idade(meta.get("created_time"))
            sinal = sinal_fadiga(Wad, dias) if status == "ACTIVE" else ""
            linhas.append((gt, f"   [{status[:11]}] {((t or a).get('ad_name') or meta.get('name', '?'))[:50]} | "
                               f"conj {((t or a).get('adset_name') or '')[:25]} | gasto {brl(ga)} -> {brl(gt)} | "
                               f"res {ra:.0f} -> {rt:.0f} | custo 30d {custo_por(Wad['30d']['gasto'], Wad['30d']['res'])} "
                               f"7d {custo_por(gt, rt)} | cliques no link 30/14/7/3d {ctr_janelas(Wad)} | "
                               f"freq 7d {f(t.get('frequency')):.2f} | {dias if dias is not None else '?'} dias no ar"
                               + (f" | {sinal}" if sinal else "")
                               + (f" | PROBLEMA {json.dumps(issues, ensure_ascii=False)[:200]}" if issues and problema else "")))
        for _, linha in sorted(linhas, key=lambda x: -x[0]):
            w(linha)

        alteracoes = Counter()
        for ev in lista(c.get("atividades")):
            mudanca = descreve_atividade(ev)
            if mudanca:
                alteracoes[mudanca] += 1
        if alteracoes:
            w("  ALTERAÇÕES (desde o início do período anterior; API = feitas pelo Claude)")
            for (dia, quem, tipo, obj), n in sorted(alteracoes.items(), reverse=True)[:40]:
                w(f"   {dia} | {quem} | {tipo} | {obj}" + (f" (x{n})" if n > 1 else ""))


# --------------------------------------------------------------------------- Google

def gm(r, campo):
    return f(r.get("metrics", {}).get(campo))


def custo(r):
    return gm(r, "cost_micros") / 1e6


def diario_google(linhas, chave):
    """{id: {data: m}}; conversões pela data em que aconteceram (não pela data do clique)."""
    out_ = defaultdict(dict)
    for r in lista(linhas):
        out_[chave(r)][r["segments"]["date"]] = m(custo(r), gm(r, "impressions"), gm(r, "clicks"),
                                                   gm(r, "conversions_by_conversion_date"))
    return out_


def analisa_google(D):
    for c in D["contas"]:
        conta_atual("google", c["id"])
        estrutura = lista(c.get("estrutura"))
        if not c.get("gasto_14d"):
            w("=" * 100)
            if estrutura:
                w(f"GOOGLE | {c['nome']} | {c['id']} | !! SEM GASTO em 14 dias, mas com {len(estrutura)} campanha(s) ativa(s)")
            else:
                w(f"GOOGLE | {c['nome']} | {c['id']} | sem gasto em 14 dias e sem campanha ativa")
            continue
        camps = {x["campaign"]["id"]: x for x in estrutura}
        ca = {r["campaign"]["id"]: r for r in lista(c.get("camp_ant"))}
        ct = {r["campaign"]["id"]: r for r in lista(c.get("camp_atu"))}
        co = {r["campaign"]["id"]: r for r in lista(c.get("camp_ontem"))}
        ga = sum(custo(r) for r in ca.values())
        gt = sum(custo(r) for r in ct.values())
        va = sum(gm(r, "conversions") for r in ca.values())
        vt = sum(gm(r, "conversions") for r in ct.values())
        w("=" * 100)
        w(f"GOOGLE | {c['nome']} | {c['id']}")
        w(f"  TOTAL gasto {brl(ga)} -> {brl(gt)} ({pct(gt, ga)}) | conversões {va:.1f} -> {vt:.1f} | "
          f"custo/conv {custo_por(ga, va)} -> {custo_por(gt, vt)} | ontem {brl(sum(custo(r) for r in co.values()))}")
        for k, v in c.items():
            if erro(v):
                w(f"  ERRO na coleta de {k}: {v['_erro'][:200]}")
        diario = c.get("gasto_diario") if isinstance(c.get("gasto_diario"), dict) else {}
        if diario:
            ini = dt.date.fromisoformat(per["ant"][0])
            dias = [(ini + dt.timedelta(days=i)).isoformat() for i in range(14)]
            zerados = [d[8:10] + "/" + d[5:7] for d in dias if not diario.get(d)]
            if zerados:
                w(f"  !! DIAS SEM GASTO nos últimos 14: {', '.join(zerados)} | hoje até agora {brl(diario.get(per['hoje'], 0))}")
        for lim in lista(c.get("limite_conta")):
            ab = lim.get("account_budget", {})
            fim = ab.get("approved_end_date_time")
            teto = f(ab.get("approved_spending_limit_micros")) / 1e6
            if not teto or (fim and fim[:10] < per["hoje"]):
                continue
            resta = teto - f(ab.get("amount_served_micros")) / 1e6
            media = gt / 7
            w(f"  LIMITE DA CONTA: {brl(teto)}, restam {brl(resta)}"
              + (f" (~{resta / media:.1f} dias no ritmo atual)" if media else "")
              + (f", vale até {fim[:10]}" if fim else ""))

        dcg = diario_google(c.get("diario_campanha"), lambda r: r["campaign"]["id"])
        dgg = diario_google(c.get("diario_grupo"), lambda r: r["ad_group"]["id"])
        dag = diario_google(c.get("diario_anuncio"), lambda r: r["ad_group_ad"]["ad"]["id"])
        w("  CAMPANHAS (semana anterior -> esta semana; tendência em 30/14/7/3 dias até ontem, conversão pela data em que aconteceu)")
        for cid in sorted(set(camps) | set(ct) | set(ca), key=lambda x: -custo(ct.get(x, {}))):
            e = camps.get(cid, {})
            a, t, o = ca.get(cid, {}), ct.get(cid, {}), co.get(cid, {})
            nome = (e or t or a).get("campaign", {}).get("name", "?")
            ec = e.get("campaign", {})
            alvo = f(ec.get("target_cpa", {}).get("target_cpa_micros")) or f(ec.get("maximize_conversions", {}).get("target_cpa_micros"))
            orc = f(e.get("campaign_budget", {}).get("amount_micros")) / 1e6
            ma, mt = t.get("metrics", {}), a.get("metrics", {})
            is_txt = ""
            if "search_impression_share" in ma:
                is_txt = (f" | parcela de impr. {f(ma.get('search_impression_share')) * 100:.0f}% "
                          f"(perde {f(ma.get('search_budget_lost_impression_share')) * 100:.0f}% por orçamento, "
                          f"{f(ma.get('search_rank_lost_impression_share')) * 100:.0f}% por classificação)")
            cta = gm(a, "clicks") / gm(a, "impressions") * 100 if gm(a, "impressions") else 0
            ctt = gm(t, "clicks") / gm(t, "impressions") * 100 if gm(t, "impressions") else 0
            w(f"   [{'ATIVA' if e else 'off'}] {nome[:70]} | {ec.get('advertising_channel_type', '')} | "
              f"{ec.get('bidding_strategy_type', '')}{f' alvo {brl(alvo / 1e6)}' if alvo else ''} | "
              f"orç/dia {brl(orc) if orc else '-'} | status {ec.get('primary_status', '')} "
              f"{','.join(r for r in ec.get('primary_status_reasons', []) if r != 'UNKNOWN')}")
            w(f"      gasto {brl(custo(a))} -> {brl(custo(t))} ({pct(custo(t), custo(a))}) | conv {gm(a, 'conversions'):.1f} -> "
              f"{gm(t, 'conversions'):.1f} | custo/conv {custo_por(custo(a), gm(a, 'conversions'))} -> "
              f"{custo_por(custo(t), gm(t, 'conversions'))} | CTR {cta:.2f}% -> {ctt:.2f}% | CPC "
              f"{custo_por(custo(a), gm(a, 'clicks'))} -> {custo_por(custo(t), gm(t, 'clicks'))}{is_txt} | ontem {brl(custo(o))}")
            if e and custo(t):
                w("      TENDÊNCIA")
                for linha in linhas_tendencia(janelas_de_diario(dcg.get(cid, {}), per), dcg.get(cid, {}), per):
                    w(f"        {linha}")

        w("  GRUPOS DE ANÚNCIOS")
        gra = {r["ad_group"]["id"]: r for r in lista(c.get("grupo_ant"))}
        grt = {r["ad_group"]["id"]: r for r in lista(c.get("grupo_atu"))}
        grupos_por_camp = Counter(r["campaign"]["id"] for r in grt.values() if custo(r))
        for gid in sorted(set(gra) | set(grt), key=lambda x: -custo(grt.get(x, {}))):
            a, t = gra.get(gid, {}), grt.get(gid, {})
            r0 = t or a
            w(f"   {r0['campaign']['name'][:40]} > {r0['ad_group']['name'][:35]} | gasto {brl(custo(a))} -> {brl(custo(t))} | "
              f"conv {gm(a, 'conversions'):.1f} -> {gm(t, 'conversions'):.1f} | custo/conv "
              f"{custo_por(custo(a), gm(a, 'conversions'))} -> {custo_por(custo(t), gm(t, 'conversions'))}")
            if custo(t) and grupos_por_camp.get(r0["campaign"]["id"], 0) > 1:
                for linha in linhas_tendencia(janelas_de_diario(dgg.get(gid, {}), per), dgg.get(gid, {}), per):
                    w(f"        {linha}")

        w("  ANÚNCIOS")
        ada = {r["ad_group_ad"]["ad"]["id"]: r for r in lista(c.get("anuncio_ant"))}
        adt = {r["ad_group_ad"]["ad"]["id"]: r for r in lista(c.get("anuncio_atu"))}
        for aid in sorted(set(ada) | set(adt), key=lambda x: -custo(adt.get(x, {}))):
            a, t = ada.get(aid, {}), adt.get(aid, {})
            r0 = t or a
            ad = r0["ad_group_ad"]
            cta = gm(a, "clicks") / gm(a, "impressions") * 100 if gm(a, "impressions") else 0
            ctt = gm(t, "clicks") / gm(t, "impressions") * 100 if gm(t, "impressions") else 0
            w(f"   [{ad.get('status', '')}] {r0['campaign']['name'][:30]} > {r0['ad_group']['name'][:25]} | anúncio {aid} "
              f"{ad['ad'].get('type_', '')} | força {ad.get('ad_strength', '-')} | "
              f"{ad.get('policy_summary', {}).get('approval_status', '')} | gasto {brl(custo(a))} -> {brl(custo(t))} | "
              f"conv {gm(a, 'conversions'):.1f} -> {gm(t, 'conversions'):.1f} | "
              f"taxa de cliques 30/14/7/3d {ctr_janelas(janelas_de_diario(dag.get(aid, {}), per))}"
              + (f" | {sinal}" if (sinal := sinal_fadiga(janelas_de_diario(dag.get(aid, {}), per), None, "QUEDA")) else ""))

        termos = [r for r in lista(c.get("termos_atu")) if not gm(r, "conversions")]
        if termos:
            w("  TERMOS DE PESQUISA SEM CONVERSÃO NO PERÍODO ATUAL (maiores gastos)")
            for r in termos[:20]:
                st = r["search_term_view"]
                w(f"   \"{st['search_term']}\" [{st.get('status', '')}] | {r['campaign']['name'][:35]} > "
                  f"{r['ad_group']['name'][:25]} | {brl(custo(r))} | {gm(r, 'clicks'):.0f} cliques")

        alt = Counter()
        for ev in lista(c.get("alteracoes")):
            ce = ev["change_event"]
            if ce.get("client_type") in ("GOOGLE_ADS_AUTOMATED_RULE", "GOOGLE_ADS_RECOMMENDATIONS_AUTO_APPLY", "INTERNAL_TOOL", "OTHER"):
                origem = ce.get("client_type")
            else:
                origem = ce.get("user_email", "?")
            nome_camp = camps.get(str(ce.get("campaign", "")).split("/")[-1], {}).get("campaign", {}).get("name", "")
            alt[(ce["change_date_time"][:10], origem, ce.get("client_type", ""), ce.get("change_resource_type", ""),
                 ce.get("resource_change_operation", ""), nome_camp[:40])] += 1
        if alt:
            w("  HISTÓRICO DE ALTERAÇÕES (agrupado)")
            for (dia, quem, cliente, recurso, op, camp), n in sorted(alt.items(), reverse=True)[:30]:
                w(f"   {dia} | {quem} via {cliente} | {recurso} {op} | {camp} | x{n}")


w(f"Período anterior {per['ant'][0]} a {per['ant'][1]} | atual {per['atu'][0]} a {per['atu'][1]} | ontem {per['ontem']}")
for plat, fn in (("meta", analisa_meta), ("google", analisa_google)):
    if args.plataforma not in (plat, "todas"):
        continue
    arq = pasta / f"{plat}.json"
    if not arq.exists():
        conta_atual("geral", "")
        w(f"!! {arq} não existe. Rode coleta_{plat}.py antes.")
        continue
    fn(json.load(open(arq, encoding="utf-8")))

# Junta os buffers por cliente, na ordem da carteira (Meta primeiro, depois Google).
clientes, contas_do_cliente = [], defaultdict(list)
for plat in ("meta", "google"):
    for item in carteira(plat):
        if item["cliente"] not in clientes:
            clientes.append(item["cliente"])
        contas_do_cliente[item["cliente"]].append((plat, str(item["conta"])))
usados = {("geral", "")}
partes = [_buf[("geral", "")].getvalue()]
for cli in clientes:
    blocos = [_buf[k].getvalue() for k in contas_do_cliente[cli] if k in _buf]
    usados.update(contas_do_cliente[cli])
    if any(blocos):
        partes.append("#" * 100 + f"\nCLIENTE: {cli}\n" + "".join(blocos))
for k in _buf:  # conta coletada que não está mais na carteira: aparece no fim, para não sumir em silêncio
    if k not in usados and _buf[k].getvalue():
        partes.append("#" * 100 + f"\nFORA DA CARTEIRA: {k[0]} {k[1]}\n" + _buf[k].getvalue())

texto = "".join(partes)
(pasta / "analise.txt").write_text(texto, encoding="utf-8")
print(texto)
