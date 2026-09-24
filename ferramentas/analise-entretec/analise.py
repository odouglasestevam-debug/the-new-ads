# -*- coding: utf-8 -*-
"""
Analise de performance da conta Google Ads da Entretec.
Foco: custo por lead, custo por clique, candidatas a negativacao e o que NAO mexer.
Roda pelo Agendador de Tarefas do Windows. Somente leitura, nunca altera a conta.
"""
import os
import re
import sys
import datetime
import collections
import traceback

RAIZ = r"C:\Users\odoug\OneDrive\Documentos\the new ads"
sys.path.insert(0, os.path.join(RAIZ, ".claude", "skills", "google-ads-ratos", "scripts"))
SAIDA = os.path.join(RAIZ, "clientes", "entretec", "relatorios")
LOG = os.path.join(SAIDA, "_execucoes.log")
CID = "3529405554"

# volume minimo para tratar um numero como sinal, e nao como ruido
MIN_CONV = 3
MIN_CLIQUES = 25


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
    n = re.sub(r"^SEARCH_[A-Z]+_\d\d_", "", nome)
    for p in ("CAPTACAO_LEADS_CONVERSOES_", "CONVERSOES_", "CAPTACAO_LEADS_"):
        n = n.replace(p, "")
    n = n.replace("[ENTRETEC] [SEARCH] [SP] ", "").replace("_SP", "").strip("_ ")
    return n[:40] if n else nome[:40]


def main():
    from lib import init_client, run_query
    init_client()
    num = lambda m, k: float(m.get(k, 0) or 0)

    hoje = datetime.date.today()
    f30, i30 = hoje - datetime.timedelta(days=1), hoje - datetime.timedelta(days=30)
    f7, i7 = hoje - datetime.timedelta(days=1), hoje - datetime.timedelta(days=7)
    fp, ip = hoje - datetime.timedelta(days=8), hoje - datetime.timedelta(days=14)
    P30 = "segments.date BETWEEN '{}' AND '{}'".format(i30, f30)
    P7 = "segments.date BETWEEN '{}' AND '{}'".format(i7, f7)
    PP = "segments.date BETWEEN '{}' AND '{}'".format(ip, fp)

    def campanhas(P):
        out = {}
        q = ("SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, "
             "metrics.conversions, metrics.average_cpc FROM campaign WHERE campaign.status='ENABLED' AND " + P)
        for r in run_query(CID, q):
            m, c = r["metrics"], r["campaign"]
            out[c["id"]] = dict(nome=c["name"], custo=num(m, "cost_micros") / 1e6, cliques=int(num(m, "clicks")),
                                conv=num(m, "conversions"), cpc=num(m, "average_cpc") / 1e6)
        return out

    d30, d7, dp = campanhas(P30), campanhas(P7), campanhas(PP)
    custo_conta = sum(c["custo"] for c in d30.values())
    conv_conta = sum(c["conv"] for c in d30.values())
    cpl_conta = custo_conta / conv_conta if conv_conta else 0
    cpc_conta = custo_conta / sum(c["cliques"] for c in d30.values()) if d30 else 0

    escalar, corrigir, observar, manter, tecnicos, negativar, cpl_acoes, nao_mexer = [], [], [], [], [], [], [], []

    # ---------- classificacao por campanha (base 30 dias) ----------
    for cid, c in sorted(d30.items(), key=lambda x: -x[1]["custo"]):
        nome, custo, conv = curto(c["nome"]), c["custo"], c["conv"]
        cpl = custo / conv if conv else 0
        s7 = d7.get(cid, {})
        if conv < MIN_CONV:
            if custo >= 300 and conv == 0:
                corrigir.append("**{}**: {} em 30 dias sem nenhum lead. Revisar oferta, pagina e termos antes de manter a verba".format(nome, brl(custo)))
            else:
                observar.append("**{}**: {} e {:.0f} leads em 30 dias. Volume baixo demais para concluir qualquer coisa".format(nome, brl(custo), conv))
            continue
        if cpl <= cpl_conta * 0.8:
            escalar.append("**{}**: CPL {} contra media de {} da conta, com {:.0f} leads. Tem espaco para mais verba".format(
                nome, brl(cpl), brl(cpl_conta), conv))
        elif cpl >= cpl_conta * 1.5:
            corrigir.append("**{}**: CPL {} contra media de {} da conta ({:.0f} leads em 30 dias)".format(
                nome, brl(cpl), brl(cpl_conta), conv))
        else:
            manter.append("**{}**: CPL {}, dentro da media. Gasto semanal {}".format(nome, brl(cpl), brl(s7.get("custo", 0))))

    # ---------- variacao semanal so quando tem volume ----------
    ja_classificadas = set()
    for cid, c in d30.items():
        nome = curto(c["nome"])
        if any(nome in x for x in escalar + corrigir):
            ja_classificadas.add(cid)
    for cid, c in d7.items():
        a = dp.get(cid)
        if not a:
            continue
        if c["conv"] >= MIN_CONV and a["conv"] >= MIN_CONV:
            cpl1, cpl0 = c["custo"] / c["conv"], a["custo"] / a["conv"]
            if cpl1 > cpl0 * 1.30:
                cpl_acoes.append("**{}**: CPL da semana subiu de {} para {} ({}), com volume suficiente para ser real".format(
                    curto(c["nome"]), brl(cpl0), brl(cpl1), pct(cpl1, cpl0)))
        elif c["custo"] >= 200 and cid not in ja_classificadas:
            nao_mexer.append("**{}**: variacao da semana sem significancia ({:.0f} lead(s) nesta semana, {:.0f} na anterior). Esperar acumular".format(
                curto(c["nome"]), c["conv"], a["conv"]))

    # ---------- candidatas a negativacao (30 dias) ----------
    termos = collections.defaultdict(lambda: [0.0, 0.0, 0, ""])
    q = ("SELECT campaign.name, search_term_view.search_term, metrics.cost_micros, metrics.conversions, "
         "metrics.clicks FROM search_term_view WHERE campaign.status='ENABLED' AND " + P30)
    for r in run_query(CID, q):
        m = r["metrics"]
        t = termos[r["search_term_view"]["search_term"]]
        t[0] += num(m, "cost_micros") / 1e6
        t[1] += num(m, "conversions")
        t[2] += int(num(m, "clicks"))
        t[3] = r["campaign"]["name"]
    cand = [(v[0], k, v) for k, v in termos.items() if v[1] == 0 and (v[0] >= 120 or v[2] >= 12)]
    for custo, termo, v in sorted(cand, reverse=True)[:12]:
        negativar.append("**{}**: {} em {} cliques, zero lead em 30 dias ({})".format(
            '"' + termo + '"', brl(custo), v[2], curto(v[3])))

    # ---------- custo por clique e qualidade ----------
    kws = []
    q = ("SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.quality_info.quality_score, "
         "ad_group_criterion.quality_info.creative_quality_score, ad_group_criterion.quality_info.post_click_quality_score, "
         "ad_group_criterion.quality_info.search_predicted_ctr, metrics.cost_micros, metrics.clicks, metrics.conversions, "
         "metrics.average_cpc FROM keyword_view WHERE campaign.status='ENABLED' AND ad_group_criterion.negative=false AND " + P30)
    for r in run_query(CID, q):
        k, m = r["ad_group_criterion"], r["metrics"]
        qi = k.get("quality_info") or {}
        kws.append(dict(camp=r["campaign"]["name"], texto=k["keyword"]["text"], custo=num(m, "cost_micros") / 1e6,
                        cliques=int(num(m, "clicks")), conv=num(m, "conversions"), cpc=num(m, "average_cpc") / 1e6,
                        qs=qi.get("quality_score"), anuncio=qi.get("creative_quality_score"),
                        pagina=qi.get("post_click_quality_score"), ctr=qi.get("search_predicted_ctr")))
    # qualidade baixa com gasto: onde da para baixar CPC sem mexer em lance
    for k in sorted([x for x in kws if x["qs"] and int(x["qs"]) <= 4 and x["custo"] >= 100], key=lambda x: -x["custo"])[:8]:
        causa = []
        if k["pagina"] == "BELOW_AVERAGE":
            causa.append("pagina de destino")
        if k["anuncio"] == "BELOW_AVERAGE":
            causa.append("texto do anuncio")
        if k["ctr"] == "BELOW_AVERAGE":
            causa.append("taxa de clique esperada")
        cpl_kw = k["custo"] / k["conv"] if k["conv"] else 0
        cpl_acoes.append("**{}** ({}): qualidade {}/10, CPC {} contra media de {} da conta. Ponto fraco: {}. {}".format(
            '"' + k["texto"] + '"', curto(k["camp"]), k["qs"], brl(k["cpc"]), brl(cpc_conta),
            " e ".join(causa) if causa else "nao identificado",
            "CPL {}".format(brl(cpl_kw)) if cpl_kw else "sem lead em 30 dias"))
    # keywords caras sem lead
    for k in sorted([x for x in kws if x["conv"] == 0 and x["custo"] >= 250], key=lambda x: -x["custo"])[:6]:
        corrigir.append("Keyword **{}** ({}): {} em {} cliques, zero lead em 30 dias. Candidata a pausa".format(
            '"' + k["texto"] + '"', curto(k["camp"]), brl(k["custo"]), k["cliques"]))

    # ---------- problemas tecnicos ----------
    geo = collections.Counter()
    for r in run_query(CID, "SELECT campaign.id, campaign_criterion.type FROM campaign_criterion WHERE campaign.status='ENABLED'"):
        if r["campaign_criterion"]["type_"] == "LOCATION":
            geo[r["campaign"]["id"]] += 1
    for cid, c in d30.items():
        if geo[cid] == 0:
            tecnicos.append("**{}** esta sem segmentacao geografica, veiculando para qualquer lugar".format(curto(c["nome"])))
    porgrupo = collections.Counter()
    q = ("SELECT campaign.name, ad_group.name, ad_group_ad.status, ad_group_ad.policy_summary.approval_status "
         "FROM ad_group_ad WHERE campaign.status='ENABLED' AND ad_group.status='ENABLED'")
    for r in run_query(CID, q):
        a = r["ad_group_ad"]
        chave = (r["campaign"]["name"], r["ad_group"]["name"])
        porgrupo.setdefault(chave, 0)
        if a["status"] == "ENABLED":
            porgrupo[chave] += 1
        if a["policy_summary"].get("approval_status") == "DISAPPROVED":
            tecnicos.append("Anuncio reprovado em {} / {}".format(curto(r["campaign"]["name"]), r["ad_group"]["name"][:24]))
    for (camp, grupo), n in porgrupo.items():
        if n == 0:
            tecnicos.append("Grupo **{}** em {} esta ativo e sem nenhum anuncio ativo, ou seja, nao veicula".format(grupo, curto(camp)))

    # ---------- relatorio ----------
    L = []
    A = L.append
    A("# Entretec, analise de performance\n")
    A("Gerado em {:%d/%m/%Y as %H:%M}. Base de 30 dias ({:%d/%m} a {:%d/%m}), comparacao semanal quando ha volume.\n".format(
        datetime.datetime.now(), i30, f30))
    A("## Referencia da conta (30 dias)\n")
    A("| Metrica | Valor |")
    A("|---|---:|")
    A("| Investimento | {} |".format(brl(custo_conta)))
    A("| Leads | {:.0f} |".format(conv_conta))
    A("| Custo por lead | {} |".format(brl(cpl_conta)))
    A("| Custo por clique | {} |\n".format(brl(cpc_conta)))
    A("Tudo abaixo compara cada campanha com esses numeros. Volume minimo para conclusao: {} leads ou {} cliques.\n".format(
        MIN_CONV, MIN_CLIQUES))

    def secao(titulo, itens, vazio):
        A("## {} ({})\n".format(titulo, len(itens)))
        A("\n".join("{}. {}".format(i, x) for i, x in enumerate(itens, 1)) if itens else vazio)
        A("")

    secao("Onde investir mais", escalar, "Nenhuma campanha com CPL suficientemente abaixo da media para escalar agora.")
    secao("O que corrigir", corrigir, "Nenhuma campanha ou keyword fora da faixa aceitavel.")
    secao("Negativacao sugerida", negativar, "Nenhum termo com gasto relevante e zero lead nos ultimos 30 dias.")
    secao("Como baixar o custo por clique e por lead", cpl_acoes, "Nenhuma oportunidade clara de reducao de CPC nesta leitura.")
    secao("Problemas tecnicos", tecnicos, "Nenhum problema tecnico encontrado.")
    secao("O que NAO fazer agora", observar + nao_mexer,
          "Nada em observacao: todas as campanhas tem volume suficiente para leitura.")
    A("## Manter como esta\n")
    A("\n".join("- {}".format(x) for x in manter) if manter else "Nenhuma campanha na faixa de manutencao.")
    A("\nNenhuma alteracao foi feita na conta. Tudo acima e proposta, aguardando decisao.\n")

    os.makedirs(SAIDA, exist_ok=True)
    arq = os.path.join(SAIDA, "{:%Y-%m-%d}.md".format(hoje))
    texto = "\n".join(L)
    for destino in (arq, os.path.join(SAIDA, "_ultimo.md")):
        with open(destino, "w", encoding="utf-8") as f:
            f.write(texto)
    log("OK  {} | escalar {}, corrigir {}, negativar {}, cpc {}, tecnicos {} | CPL conta {}".format(
        os.path.basename(arq), len(escalar), len(corrigir), len(negativar), len(cpl_acoes), len(tecnicos), brl(cpl_conta)))
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
