"""Funções compartilhadas pela coleta e pela análise da revisão de otimização."""
import argparse
import datetime as dt
import os
import sys
import tempfile
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]  # .claude/skills

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")


def carteira(plataforma):
    """Contas dos clientes ativos (carteira.json da skill). Nunca consultar conta fora daqui."""
    import json
    dados = json.loads((Path(__file__).resolve().parents[1] / "carteira.json").read_text(encoding="utf-8"))
    return dados[plataforma]


def periodos(fim=None):
    """Período atual = 7 dias completos terminando em `fim` (padrão: ontem); anterior = 7 dias antes."""
    hoje = dt.date.today()
    fim = dt.date.fromisoformat(fim) if fim else hoje - dt.timedelta(days=1)
    atu_ini = fim - dt.timedelta(days=6)
    ant_fim = atu_ini - dt.timedelta(days=1)
    ant_ini = ant_fim - dt.timedelta(days=6)
    janelas = {f"{n}d": ((fim - dt.timedelta(days=n - 1)).isoformat(), fim.isoformat()) for n in (30, 14, 7, 3)}
    return {
        "ant": (ant_ini.isoformat(), ant_fim.isoformat()),
        "atu": (atu_ini.isoformat(), fim.isoformat()),
        "janelas": janelas,  # 30d, 14d, 7d e 3d terminando ontem (7d = atu)
        "ontem": fim.isoformat(),
        "hoje": hoje.isoformat(),
    }


def rotulo_periodo(per, inicio, fim):
    """Converte (date_start, date_stop) da Meta no rótulo usado na análise."""
    if (inicio, fim) == per["ant"]:
        return "ant"
    for rot, jan in per["janelas"].items():
        if (inicio, fim) == jan:
            return rot
    return None


def args_padrao(descricao):
    p = argparse.ArgumentParser(description=descricao)
    p.add_argument("--fim", help="último dia do período atual (AAAA-MM-DD). Padrão: ontem")
    p.add_argument("--saida", help="pasta dos arquivos. Padrão: pasta temporária /otimizacao/<fim>")
    return p


def pasta_saida(args, per):
    pasta = Path(args.saida) if args.saida else Path(tempfile.gettempdir()) / "otimizacao" / per["atu"][1]
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def f(x):
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


def brl(x):
    return f"R${f(x):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(novo, velho):
    if not velho:
        return "n/a"
    return f"{(f(novo) / f(velho) - 1) * 100:+.0f}%"


def custo_por(gasto, qtd):
    return brl(gasto / qtd) if qtd else "-"
