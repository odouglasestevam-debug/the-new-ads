# -*- coding: utf-8 -*-
"""
Analise recorrente da conta Google Ads da Entretec.
Coleta os dados, compara com a semana anterior, levanta alertas e grava o relatorio.
Roda pelo Agendador de Tarefas do Windows. Nao altera nada na conta, so le.
"""
import os
import sys
import datetime
import collections
import traceback

RAIZ = r"C:\Users\odoug\OneDrive\Documentos\the new ads"
sys.path.insert(0, os.path.join(RAIZ, ".claude", "skills", "google-ads-ratos", "scripts"))
SAIDA = os.path.join(RAIZ, "clientes", "entretec", "relatorios")
LOG = os.path.join(SAIDA, "_execucoes.log")
CID = "3529405554"


def log(msg):
    os.makedirs(SAIDA, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write("[{:%Y-%m-%d %H:%M:%S}] {}\n".format(datetime.datetime.now(), msg))


def brl(v):
    return "R$ " + "{:,.2f}".format(v).replace(",", "X").replace(".", ",").replace("X", ".")


def pct(a, b):
    if not b:
        return "novo" if a else "0%"
    return "{:+.0f}%".format((a - b) / b * 100)


def curto(nome):
    """Tira o prefixo repetido do padrao de nomenclatura e devolve so o que identifica."""
    import re
    n = re.sub(r"^SEARCH_[A-Z]+_\d\d_", "", nome)
    for p in ("CAPTACAO_LEADS_CONVERSOES_", "CONVERSOES_", "CAPTACAO_LEADS_"):
        n = n.replace(p, "")
    n = n.replace("[ENTRETEC] [SEARCH] [SP] ", "").replace("_SP", "").strip("_ ")
    return n[:40] if n else nome[:40]


def main():
    from lib import init_client, run_query
    init_client()

    hoje = datetime.date.today()
    f1, i1 = hoje - datetime.timedelta(days=1), hoje - datetime.timedelta(days=7)
    f0, i0 = hoje - datetime.timedelta(days=8), hoje - datetime.timedelta(days=14)
    P1 = "segments.date BETWEEN '{}' AND '{}'".format(i1, f1)
    P0 = "segments.date BETWEEN '{}' AND '{}'".format(i0, f0)
    num = lambda m, k: float(m.get(k, 0) or 0)

    def campanhas(P):
        out = {}
        q = ("SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, "
             "metrics.cost_micros, metrics.conversions, metrics.search_impression_share, "
             "metrics.search_budget_lost_impression_share FROM campaign WHERE campaign.status='ENABLED' AND " + P)
        for r in run_query(CID, q):
            m, c = r["metrics"], r["campaign"]
            out[c["id"]] = dict(nome=c["name"], custo=num(m, "cost_micros") / 1e6,
                                cliques=int(num(m, "clicks")), imp=int(num(m, "impressions")),
                                conv=num(m, "conversions"),
                                perdido_orc=m.get("search_budget_lost_impression_share"))
        return out

    atual, ant = campanhas(P1), campanhas(P0)
    tot = lambda d, k: sum(v[k] for v in d.values())
    alertas, sugestoes = [], []

    # 1) campanhas limitadas por orcamento
    for cid, c in atual.items():
        p = c["perdido_orc"]
        if p is not None and float(p) > 0.10 and c["custo"] > 50:
            alertas.append("**{}** perdeu **{:.0f}%** das impressoes por limite de orcamento (gastou {} na semana)".format(
                curto(c["nome"]), float(p) * 100, brl(c["custo"])))

    # 2) CPA piorando mais de 30%
    for cid, c in atual.items():
        a = ant.get(cid)
        if not a or c["conv"] < 2 or a["conv"] < 2:
            continue
        cpa1, cpa0 = c["custo"] / c["conv"], a["custo"] / a["conv"]
        if cpa1 > cpa0 * 1.30:
            alertas.append("**{}**: CPA subiu de {} para {} ({})".format(
                curto(c["nome"]), brl(cpa0), brl(cpa1), pct(cpa1, cpa0)))

    # 3) gasto relevante sem conversao
    for cid, c in atual.items():
        if c["conv"] == 0 and c["custo"] > 100:
            alertas.append("**{}** gastou {} na semana sem nenhuma conversao".format(curto(c["nome"]), brl(c["custo"])))

    # 4) segmentacao geografica faltando (regra 11 da skill)
    geo = collections.Counter()
    for r in run_query(CID, "SELECT campaign.id, campaign_criterion.type FROM campaign_criterion WHERE campaign.status='ENABLED'"):
        if r["campaign_criterion"]["type_"] == "LOCATION":
            geo[r["campaign"]["id"]] += 1
    for cid, c in atual.items():
        if geo[cid] == 0:
            alertas.append("**{}** esta SEM segmentacao geografica, veiculando para qualquer lugar".format(curto(c["nome"])))

    # 5) anuncio reprovado / grupo sem anuncio ativo
    porgrupo = collections.Counter()
    q = ("SELECT campaign.name, ad_group.id, ad_group.name, ad_group_ad.status, "
         "ad_group_ad.policy_summary.approval_status FROM ad_group_ad "
         "WHERE campaign.status='ENABLED' AND ad_group.status='ENABLED'")
    for r in run_query(CID, q):
        a = r["ad_group_ad"]
        chave = (r["campaign"]["name"], r["ad_group"]["name"])
        porgrupo.setdefault(chave, 0)
        if a["status"] == "ENABLED":
            porgrupo[chave] += 1
        if a["policy_summary"].get("approval_status") == "DISAPPROVED":
            alertas.append("Anuncio REPROVADO em {} / {}".format(curto(r["campaign"]["name"]), r["ad_group"]["name"][:22]))
    for (camp, grupo), n in porgrupo.items():
        if n == 0:
            alertas.append("Grupo **{}** em {} esta ativo mas sem anuncio ativo".format(grupo, curto(camp)))

    # 6) termos de busca caros sem conversao
    termos = collections.defaultdict(lambda: [0.0, 0.0, 0, ""])
    q = ("SELECT campaign.name, search_term_view.search_term, metrics.cost_micros, metrics.conversions, "
         "metrics.clicks FROM search_term_view WHERE campaign.status='ENABLED' AND " + P1)
    for r in run_query(CID, q):
        m = r["metrics"]
        t = termos[r["search_term_view"]["search_term"]]
        t[0] += num(m, "cost_micros") / 1e6
        t[1] += num(m, "conversions")
        t[2] += int(num(m, "clicks"))
        t[3] = r["campaign"]["name"]
    caros = sorted([(v[0], k, v) for k, v in termos.items() if v[1] == 0 and v[0] >= 60], reverse=True)[:10]
    for custo, termo, v in caros:
        sugestoes.append("Negativar ou revisar **{}**: {} em {} cliques, zero conversao ({})".format(
            '"' + termo + '"', brl(custo), v[2], curto(v[3])))

    # 7) indice de qualidade baixo com gasto
    q = ("SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, "
         "ad_group_criterion.quality_info.post_click_quality_score, metrics.cost_micros FROM keyword_view "
         "WHERE campaign.status='ENABLED' AND ad_group_criterion.negative=false AND " + P1)
    for r in run_query(CID, q):
        qi = r["ad_group_criterion"].get("quality_info") or {}
        custo = num(r["metrics"], "cost_micros") / 1e6
        if qi.get("quality_score") and int(qi["quality_score"]) <= 4 and custo >= 50:
            sugestoes.append("Indice de qualidade **{}/10** em {}: {} na semana, experiencia da pagina {}".format(
                qi["quality_score"], '"' + r["ad_group_criterion"]["keyword"]["text"] + '"',
                brl(custo), qi.get("post_click_quality_score", "?")))

    # ---------------- relatorio ----------------
    L = []
    L.append("# Entretec, analise de {:%d/%m} a {:%d/%m}\n".format(i1, f1))
    L.append("Gerado em {:%d/%m/%Y as %H:%M}. Comparacao com {:%d/%m} a {:%d/%m}.\n".format(datetime.datetime.now(), i0, f0))

    c1, c0 = tot(atual, "custo"), tot(ant, "custo")
    v1, v0 = tot(atual, "conv"), tot(ant, "conv")
    k1, k0 = tot(atual, "cliques"), tot(ant, "cliques")
    L.append("## Visao geral\n")
    L.append("| Metrica | Semana atual | Semana anterior | Variacao |")
    L.append("|---|---:|---:|---:|")
    L.append("| Investimento | {} | {} | {} |".format(brl(c1), brl(c0), pct(c1, c0)))
    L.append("| Cliques | {} | {} | {} |".format(k1, k0, pct(k1, k0)))
    L.append("| Leads | {:.0f} | {:.0f} | {} |".format(v1, v0, pct(v1, v0)))
    L.append("| CPA | {} | {} | {} |\n".format(
        brl(c1 / v1) if v1 else "sem leads", brl(c0 / v0) if v0 else "sem leads",
        pct(c1 / v1 if v1 else 0, c0 / v0 if v0 else 0)))

    L.append("## Por campanha\n")
    L.append("| Campanha | Investido | Leads | CPA | Leads (sem. anterior) |")
    L.append("|---|---:|---:|---:|---:|")
    for cid, c in sorted(atual.items(), key=lambda x: -x[1]["custo"]):
        a = ant.get(cid, {})
        L.append("| {} | {} | {:.0f} | {} | {:.0f} |".format(
            curto(c["nome"]), brl(c["custo"]), c["conv"],
            brl(c["custo"] / c["conv"]) if c["conv"] else "sem leads", a.get("conv", 0)))
    L.append("")

    L.append("## Alertas ({})\n".format(len(alertas)))
    L.append("\n".join("{}. {}".format(i, x) for i, x in enumerate(alertas, 1)) if alertas else "Nenhum alerta nesta semana.")
    L.append("")
    L.append("## Sugestoes ({})\n".format(len(sugestoes)))
    L.append("\n".join("{}. {}".format(i, x) for i, x in enumerate(sugestoes, 1)) if sugestoes else "Nenhuma sugestao automatica nesta semana.")
    L.append("\nNenhuma alteracao foi feita na conta. Tudo acima e proposta, aguardando decisao.\n")

    os.makedirs(SAIDA, exist_ok=True)
    arq = os.path.join(SAIDA, "{:%Y-%m-%d}.md".format(hoje))
    texto = "\n".join(L)
    with open(arq, "w", encoding="utf-8") as f:
        f.write(texto)
    with open(os.path.join(SAIDA, "_ultimo.md"), "w", encoding="utf-8") as f:
        f.write(texto)
    log("OK  relatorio {} | {} alertas, {} sugestoes | investimento {}, {:.0f} leads".format(
        os.path.basename(arq), len(alertas), len(sugestoes), brl(c1), v1))
    print(arq)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log("ERRO  {}: {}".format(type(e).__name__, str(e)[:300].replace("\n", " ")))
        print("FALHOU:", e, file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
