"""Coleta de todas as contas Meta com gasto nos últimos 14 dias.

Uso: python coleta_meta.py [--fim AAAA-MM-DD] [--saida pasta]
Grava meta.json na pasta de saída e imprime o caminho no fim.
"""
import sys

sys.dont_write_bytecode = True  # sem __pycache__ no repositório (sincroniza sozinho)

import json
import sys
import time

from comum import SKILLS, args_padrao, carteira, pasta_saida, periodos

sys.path.insert(0, str(SKILLS / "meta-ads-ratos" / "scripts"))
from lib import init_api  # noqa: E402

args = args_padrao(__doc__).parse_args()
per = periodos(args.fim)
saida = pasta_saida(args, per) / "meta.json"

init_api()
from facebook_business.adobjects.adaccount import AdAccount  # noqa: E402

# Semana anterior + janelas de 30, 14, 7 e 3 dias (sobrepostas; a Meta calcula frequência e alcance de cada uma)
RANGES = [{"since": per["ant"][0], "until": per["ant"][1]}] + [
    {"since": a, "until": b} for a, b in per["janelas"].values()]
JANELA30 = {"since": per["janelas"]["30d"][0], "until": per["janelas"]["30d"][1]}
JANELA14 = {"since": per["ant"][0], "until": per["atu"][1]}

INS_FIELDS = ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "objective",
              "optimization_goal", "spend", "impressions", "reach", "frequency", "clicks",
              "inline_link_clicks", "ctr", "inline_link_click_ctr", "cpm", "results", "cost_per_result",
              "actions", "action_values"]


def rows(cursor):
    return [r.export_all_data() for r in cursor]


def safe(fn, label):
    for _ in range(6):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if any(c in msg for c in ['"code": 17', '"code": 80004', '"code": 4,', "User request limit"]):
                print(f"  limite de chamadas em {label}, esperando 60s", file=sys.stderr)
                time.sleep(60)
                continue
            return {"_erro": label, "msg": msg[:400]}
    return {"_erro": label, "msg": "limite de chamadas"}


CAMPOS_CONTA = ["id", "name", "account_status", "disable_reason", "currency", "amount_spent", "balance",
                "spend_cap", "is_prepay_account", "funding_source_details"]
resultado = {"periodos": per, "contas": []}
for item in carteira("meta"):  # só clientes ativos; conta de ex-cliente nem é consultada
    acc = AdAccount(item["conta"])
    a = safe(lambda: acc.api_get(fields=CAMPOS_CONTA).export_all_data(), "conta")
    if "_erro" in a:
        print(f"{item['cliente']}: erro ao ler a conta: {a['msg'][:150]}", file=sys.stderr)
        resultado["contas"].append({"id": item["conta"], "name": item["cliente"], "gasto_14d": 0, "erro_conta": a["msg"]})
        continue
    g14 = safe(lambda: rows(acc.get_insights(fields=["spend"], params={"time_range": JANELA14})), "gasto14")
    a["gasto_14d"] = float(g14[0]["spend"]) if isinstance(g14, list) and g14 else 0.0
    camps = safe(lambda: rows(acc.get_campaigns(
        fields=["id", "name", "objective", "effective_status", "daily_budget", "lifetime_budget",
                "bid_strategy", "start_time"],
        params={"effective_status": ["ACTIVE"], "limit": 200})), "campanhas")
    a["campanhas_ativas"] = camps
    a["n_camps_ativas"] = len(camps) if isinstance(camps, list) else None
    print(f"{a['name']}: gasto 14d {a['gasto_14d']:.2f}, campanhas ativas {a['n_camps_ativas']}", file=sys.stderr)
    if a["gasto_14d"] == 0:
        resultado["contas"].append(a)
        continue
    a["conjuntos_ativos"] = safe(lambda: rows(acc.get_ad_sets(
        fields=["id", "name", "campaign_id", "effective_status", "daily_budget", "lifetime_budget",
                "optimization_goal", "bid_strategy", "learning_stage_info", "created_time", "destination_type"],
        params={"effective_status": ["ACTIVE"], "limit": 300})), "conjuntos")
    a["anuncios"] = safe(lambda: rows(acc.get_ads(
        fields=["id", "name", "adset_id", "campaign_id", "effective_status", "created_time", "issues_info"],
        params={"effective_status": ["ACTIVE", "WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW"], "limit": 500})),
        "anuncios")
    for nivel in ["campaign", "adset", "ad"]:
        a[f"ins_{nivel}"] = safe(lambda: rows(acc.get_insights(
            fields=INS_FIELDS, params={"level": nivel, "time_ranges": RANGES, "limit": 500})), f"ins_{nivel}")
    # Série diária de 30 dias: base para saber se os últimos 3 dias saem da oscilação normal do mês
    for nivel in ["campaign", "adset"]:
        a[f"diario_{nivel}"] = safe(lambda: rows(acc.get_insights(
            fields=["campaign_id", "adset_id", "spend", "impressions", "inline_link_clicks", "results"],
            params={"level": nivel, "time_range": JANELA30, "time_increment": 1, "limit": 500})), f"diario_{nivel}")
    a["ins_ontem"] = safe(lambda: rows(acc.get_insights(
        fields=["campaign_id", "campaign_name", "spend", "impressions", "results"],
        params={"level": "campaign", "time_range": {"since": per["ontem"], "until": per["ontem"]}, "limit": 200})),
        "ontem")
    a["ins_hoje"] = safe(lambda: rows(acc.get_insights(
        fields=["campaign_id", "campaign_name", "spend", "impressions", "results"],
        params={"level": "campaign", "date_preset": "today", "limit": 200})), "hoje")
    a["ins_30d"] = safe(lambda: rows(acc.get_insights(
        fields=["spend", "impressions", "frequency", "results", "cost_per_result"],
        params={"date_preset": "last_30d"})), "30d")
    a["atividades"] = safe(lambda: rows(acc.get_activities(
        fields=["event_time", "event_type", "translated_event_type", "object_name", "object_type",
                "actor_name", "extra_data"],
        params={"since": per["ant"][0], "limit": 300})), "atividades")
    resultado["contas"].append(a)

with open(saida, "w", encoding="utf-8") as fh:
    json.dump(resultado, fh, ensure_ascii=False, indent=1)
print(f"OK {saida}")
