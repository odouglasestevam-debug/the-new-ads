"""Tendência de custo: janelas de 30/14/7/3 dias, oscilação normal e causa da variação.

Custo por resultado = custo por mil / 1000 / taxa de cliques / conversão do clique.
Como é um produto, a variação do custo se divide exatamente entre os três fatores (em log),
e dá para dizer qual deles puxou o custo para cima ou para baixo.
"""
import datetime as dt
import math

from comum import brl, f

TOL = 0.15          # variação abaixo de 15% conta como estável
MIN_RES_3D = 3      # menos que isso nos 3 dias = volume pequeno, conclusão fraca
MIN_IMPR_CTR = 300  # abaixo disso a taxa de cliques da janela não aparece

CAUSA = {
    "custo por mil": "leilão ou público mais caro",
    "taxa de cliques": "criativo perdendo força ou público saturado (ver frequência e anúncios)",
    "conversão do clique": "depois do clique: página, atendimento, rastreio ou clique de pior qualidade",
}


def m(gasto=0.0, impr=0.0, cliques=0.0, res=0.0, freq=None):
    return {"gasto": f(gasto), "impr": f(impr), "cliques": f(cliques), "res": f(res), "freq": freq}


def soma(a, b):
    return m(a["gasto"] + b["gasto"], a["impr"] + b["impr"], a["cliques"] + b["cliques"], a["res"] + b["res"])


def cpr(x):
    return x["gasto"] / x["res"] if x and x["res"] else None


def cpm(x):
    return x["gasto"] / x["impr"] * 1000 if x and x["impr"] else None


def ctr(x):
    return x["cliques"] / x["impr"] if x and x["impr"] else None


def cvr(x):
    return x["res"] / x["cliques"] if x and x["cliques"] else None


def janelas_de_diario(diario, per):
    """diario = {data: m(...)} -> {"30d": m, "14d": m, "7d": m, "3d": m} somando os dias."""
    out = {}
    for rot, (ini, fim) in per["janelas"].items():
        tot = m()
        for d, v in diario.items():
            if ini <= d <= fim:
                tot = soma(tot, v)
        out[rot] = tot
    return out


def dias_com_entrega(diario, per):
    """Dias dos últimos 30 (até ontem) em que houve gasto, em ordem."""
    ini, fim = per["janelas"]["30d"]
    return sorted(d for d, v in diario.items() if ini <= d <= fim and v["gasto"] > 0)


def faixa_oscilacao(diario, per):
    """Custo de cada bloco de 3 dias com entrega seguidos nos 30 dias, sem contar o bloco atual.

    Conta só dias com gasto, para campanha com programação de horários (ex.: segunda a sexta)
    não ter blocos vazios. Devolve (p20, p80, pior, n_blocos) ou None se não houver base.
    """
    serie = [diario[d] for d in dias_com_entrega(diario, per)]
    custos = []
    for i in range(len(serie) - 3):  # o último bloco é o dos últimos 3 dias, fica de fora
        b = soma(soma(serie[i], serie[i + 1]), serie[i + 2])
        custos.append(b["gasto"] / b["res"] if b["res"] else math.inf)
    if len(custos) < 8:
        return None
    custos.sort()
    q = lambda p: custos[min(len(custos) - 1, int(p * (len(custos) - 1) + 0.5))]  # noqa: E731
    return q(0.2), q(0.8), custos[-1], len(custos)


def classifica(W):
    c30, c14, c7, c3 = (cpr(W.get(k)) for k in ("30d", "14d", "7d", "3d"))
    if not c30:
        return "SEM BASE (nenhum resultado em 30 dias)"
    if c3 is None:
        g3 = W["3d"]["gasto"]
        if g3 > c30:
            return f"3 DIAS SEM RESULTADO (gastou {brl(g3)}; o custo médio do mês é {brl(c30)})"
        return "3 dias sem resultado, mas com gasto menor que o custo médio de um resultado (ainda normal)"
    r7 = c7 / c30 - 1 if c7 else None
    r3 = c3 / c30 - 1
    r14 = c14 / c30 - 1 if c14 else None
    if r7 is not None and r7 > TOL and r3 > TOL:
        rot = "SUBINDO" + (" (14, 7 e 3 dias acima do mês)" if r14 and r14 > 0 else " (7 e 3 dias acima do mês)")
    elif r3 > TOL:
        rot = "SUBINDO SÓ NOS ÚLTIMOS 3 DIAS"
    elif r7 is not None and r7 > TOL:
        rot = "SUBIU NA SEMANA, MAS OS ÚLTIMOS 3 DIAS VOLTARAM"
    elif r7 is not None and r7 < -TOL and r3 < -TOL:
        rot = "CAINDO"
    elif r3 < -TOL:
        rot = "CAINDO SÓ NOS ÚLTIMOS 3 DIAS"
    else:
        rot = "ESTÁVEL"
    if W["3d"]["res"] < MIN_RES_3D:
        rot += f" | 3 dias com só {W['3d']['res']:.0f} resultado(s): volume pequeno, conclusão fraca"
    return rot


def veredito(rot, posicao):
    """Junta o rótulo das janelas com a posição dos últimos 3 dias na oscilação do mês."""
    base, _, resto = rot.partition(" | ")
    aviso = f" | {resto}" if resto else ""
    if posicao is None:
        return rot
    if base.startswith("SUBINDO (") and posicao == "fora":
        return f"TENDÊNCIA DE ALTA: semana e últimos 3 dias acima do mês, fora da oscilação normal. Agir.{aviso}"
    if base.startswith("SUBINDO (") and posicao == "dentro":
        return (f"ALTA LEVE: a semana está mais cara que o mês, mas os últimos 3 dias seguem dentro da oscilação "
                f"normal. Acompanhar, ainda não é tendência firme.{aviso}")
    if base == "SUBINDO SÓ NOS ÚLTIMOS 3 DIAS" and posicao == "dentro":
        return f"OSCILAÇÃO: só os últimos 3 dias subiram e estão dentro do normal do mês. Esperar.{aviso}"
    if base == "SUBINDO SÓ NOS ÚLTIMOS 3 DIAS" and posicao == "fora":
        return (f"ALTA RECENTE FORA DO NORMAL: a semana ainda está boa, mas os últimos 3 dias saíram da faixa do mês. "
                f"Olhar agora, pode ser começo de tendência.{aviso}")
    if base.startswith("3 DIAS SEM RESULTADO") and posicao == "dentro":
        return f"{base}, mas isso já aconteceu outras vezes no mês (dentro da oscilação).{aviso}"
    return rot


def decompoe(base, atual):
    """Variação de cada fator e qual mais puxou o custo por resultado."""
    partes, contrib = [], {}
    for nome, fn, sinal in (("custo por mil", cpm, 1), ("taxa de cliques", ctr, -1), ("conversão do clique", cvr, -1)):
        a, b = fn(base), fn(atual)
        if a and b:
            partes.append(f"{nome} {(b / a - 1) * 100:+.0f}%")
            contrib[nome] = sinal * math.log(b / a)
    ca, cb = cpr(base), cpr(atual)
    if not (ca and cb and contrib):
        return " | ".join(partes), ""
    total = math.log(cb / ca)
    if abs(total) < math.log(1 + TOL):
        return " | ".join(partes), "custo estável"
    if total > 0:
        nome = max(contrib, key=contrib.get)
        return " | ".join(partes), f"o que mais subiu o custo: {nome} ({CAUSA[nome]})"
    nome = min(contrib, key=contrib.get)
    return " | ".join(partes), f"o que mais baixou o custo: {nome}"


def linhas_tendencia(W, diario, per, freq_semana=None):
    """Texto do bloco de tendência de uma campanha ou conjunto (lista de linhas)."""
    W = dict(W)
    aviso_3d = None
    if diario:
        entrega = dias_com_entrega(diario, per)
        ini3 = per["janelas"]["3d"][0]
        cal3 = [d for d in entrega if d >= ini3]
        if len(cal3) < 3 and len(entrega) >= 3:
            ult = entrega[-3:]
            tot = m()
            for d in ult:
                tot = soma(tot, diario[d])
            W["3d"] = tot
            fora = 3 - len(cal3)
            aviso_3d = (f"3d = últimos 3 dias com entrega ({', '.join(d[8:10] + '/' + d[5:7] for d in ult)}); "
                        f"{fora} dos 3 dias de calendário até ontem ficaram sem gasto")
    if W["30d"]["gasto"] - W["7d"]["gasto"] < 0.05 * max(W["30d"]["gasto"], 1):
        return [f"custo/resultado 7d {brl(cpr(W['7d'])) if cpr(W['7d']) else '-'} ({W['7d']['res']:.0f} res, "
                f"{brl(W['7d']['gasto'])}) => sem base: tudo o que gastou foi nos últimos 7 dias (campanha nova ou religada)"]
    jan = " | ".join(
        f"{k} {brl(cpr(W[k])) if cpr(W[k]) else '-'} ({W[k]['res']:.0f} res, {brl(W[k]['gasto'])})" for k in ("30d", "14d", "7d", "3d"))
    c30 = cpr(W["30d"])
    if c30 is not None and c30 < 0.05:
        return [f"custo/resultado {jan}",
                "=> resultado é alcance, visita ou visualização (centavos por resultado): tendência pelo custo "
                "por resultado não se aplica; olhar custo por mil e taxa de cliques"]
    rot = classifica(W)
    out = [f"custo/resultado {jan}"]
    if aviso_3d:
        out.append(aviso_3d)
    faixa = faixa_oscilacao(diario, per) if diario else None
    c3 = cpr(W["3d"])
    posicao = None
    if faixa and W["3d"]["gasto"] > 0:
        p20, p80, pior, n = faixa
        fmt = lambda v: "sem resultado" if v == math.inf else brl(v)  # noqa: E731
        atual = c3 if c3 else math.inf
        if atual <= p80:
            posicao, txt = "dentro", "DENTRO da oscilação normal do mês"
        elif atual > pior:
            posicao, txt = "fora", "PIOR que qualquer bloco de 3 dias do mês"
        else:
            posicao, txt = "fora", "ACIMA da faixa normal do mês"
        out.append(f"oscilação: blocos de 3 dias no mês ficaram entre {fmt(p20)} e {fmt(p80)} (20% a 80% de {n} blocos); "
                   f"últimos 3 dias {fmt(atual)} => {txt}")
    out.insert(1, f"=> {veredito(rot, posicao)}")
    for rot in ("7d", "3d"):
        if rot == "3d" and W["3d"]["res"] < MIN_RES_3D:
            continue  # com 0 a 2 resultados, a divisão em fatores é ruído
        partes, causa = decompoe(W["30d"], W[rot])
        if partes:
            out.append(f"{rot} contra 30d: {partes}" + (f" => {causa}" if causa else ""))
    if freq_semana:
        out.append(f"frequência de 7 dias: semana anterior {f(freq_semana[0]):.2f} -> esta semana {f(freq_semana[1]):.2f}"
                   + (f" | 30 dias {f(W['30d'].get('freq')):.2f}" if W["30d"].get("freq") else ""))
    return out


def ctr_janelas(W):
    return " / ".join(
        f"{ctr(W[k]) * 100:.2f}%" if W.get(k) and W[k]["impr"] >= MIN_IMPR_CTR and ctr(W[k]) is not None else "-"
        for k in ("30d", "14d", "7d", "3d"))


def sinal_fadiga(W, idade_dias, rotulo="FADIGA"):
    """FADIGA quando o anúncio tem 14+ dias e a taxa de cliques da semana caiu 20%+ contra o mês.

    No Google (anúncio de pesquisa) não existe cansaço de criativo do mesmo jeito: usar rotulo="QUEDA".
    """
    if idade_dias is not None and idade_dias < 7:
        return "NOVO"
    c30, c7, c3 = ctr(W.get("30d")), ctr(W.get("7d")), ctr(W.get("3d"))
    if not (c30 and c7) or W["7d"]["impr"] < 1000:
        return ""
    queda7 = c7 / c30 - 1
    queda3 = (c3 / c30 - 1) if c3 and W["3d"]["impr"] >= MIN_IMPR_CTR else None
    if (idade_dias is None or idade_dias >= 14) and queda7 <= -0.2 and (queda3 is None or queda3 <= -0.15):
        return f"{rotulo} (taxa de cliques {queda7 * 100:+.0f}% na semana contra o mês)"
    if queda7 <= -0.2:
        return f"taxa de cliques caindo ({queda7 * 100:+.0f}% na semana contra o mês)"
    return ""
