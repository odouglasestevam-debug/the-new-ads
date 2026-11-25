"""Coleta de todas as contas Google Ads da MCC com gasto nos últimos 14 dias.

Uso: python coleta_google.py [--fim AAAA-MM-DD] [--saida pasta]
Grava google.json na pasta de saída e imprime o caminho no fim.
"""
import sys

sys.dont_write_bytecode = True  # sem __pycache__ no repositório (sincroniza sozinho)

import json
import sys

from comum import SKILLS, args_padrao, carteira, pasta_saida, periodos

sys.path.insert(0, str(SKILLS / "google-ads-ratos" / "scripts"))
from lib import init_client  # noqa: E402

args = args_padrao(__doc__).parse_args()
per = periodos(args.fim)
saida = pasta_saida(args, per) / "google.json"

client = init_client()
servico = client.get_service("GoogleAdsService")
from google.protobuf.json_format import MessageToDict  # noqa: E402


def gaql(cid, query):
    try:
        return [MessageToDict(r._pb, preserving_proto_field_name=True) for r in servico.search(customer_id=cid, query=query)]
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if hasattr(e, "failure"):
            msg = "; ".join(err.message for err in e.failure.errors)
        return {"_erro": msg[:400], "query": " ".join(query.split())[:200]}


def entre(p):
    return f"segments.date BETWEEN '{p[0]}' AND '{p[1]}'"


CAMP_METRICAS = ("metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, "
                 "metrics.conversions_value, metrics.search_impression_share, "
                 "metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share")
GRUPO_METRICAS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions"

resultado = {"periodos": per, "contas": []}
for item in carteira("google"):  # só clientes ativos; conta de ex-cliente nem é consultada
    cid = item["conta"]
    conta = {"id": cid, "nome": item["cliente"]}
    g14 = gaql(cid, f"SELECT segments.date, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '{per['ant'][0]}' AND '{per['hoje']}'")
    conta["gasto_diario"] = {r["segments"]["date"]: int(r.get("metrics", {}).get("cost_micros", 0)) / 1e6
                             for r in g14} if isinstance(g14, list) else g14
    conta["gasto_14d"] = sum(v for d, v in conta["gasto_diario"].items() if d <= per["atu"][1]) if isinstance(g14, list) else None
    conta["estrutura"] = gaql(cid, """
        SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
               campaign.bidding_strategy_type, campaign.primary_status, campaign.primary_status_reasons,
               campaign_budget.amount_micros, campaign.target_cpa.target_cpa_micros,
               campaign.maximize_conversions.target_cpa_micros
        FROM campaign WHERE campaign.status = 'ENABLED'""")
    n_ativas = len(conta["estrutura"]) if isinstance(conta["estrutura"], list) else None
    print(f"{conta['nome']}: gasto 14d {conta['gasto_14d']}, campanhas ativas {n_ativas}", file=sys.stderr)
    if not conta["gasto_14d"]:
        resultado["contas"].append(conta)
        continue
    for chave, p in (("ant", per["ant"]), ("atu", per["atu"])):
        conta[f"camp_{chave}"] = gaql(cid, f"SELECT campaign.id, campaign.name, {CAMP_METRICAS} FROM campaign WHERE {entre(p)} AND metrics.impressions > 0")
        conta[f"grupo_{chave}"] = gaql(cid, f"""
            SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, {GRUPO_METRICAS}
            FROM ad_group WHERE {entre(p)} AND metrics.impressions > 0""")
        conta[f"anuncio_{chave}"] = gaql(cid, f"""
            SELECT campaign.id, campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name,
                   ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad_strength,
                   ad_group_ad.policy_summary.approval_status, {GRUPO_METRICAS}
            FROM ad_group_ad WHERE {entre(p)} AND metrics.impressions > 0""")
    # Série diária de 30 dias por campanha, grupo e anúncio, para as janelas 30/14/7/3 e a oscilação.
    # Conversão pela data em que aconteceu: conversão que entra atrasada não infla o custo dos últimos dias.
    j30 = per["janelas"]["30d"]
    DIARIO = ("segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, "
              "metrics.conversions_by_conversion_date")
    conta["diario_campanha"] = gaql(cid, f"SELECT campaign.id, campaign.name, {DIARIO} FROM campaign "
                                         f"WHERE {entre(j30)} AND metrics.impressions > 0")
    conta["diario_grupo"] = gaql(cid, f"SELECT campaign.name, ad_group.id, ad_group.name, {DIARIO} FROM ad_group "
                                      f"WHERE {entre(j30)} AND metrics.impressions > 0")
    conta["diario_anuncio"] = gaql(cid, f"SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, "
                                        f"{DIARIO} FROM ad_group_ad WHERE {entre(j30)} AND metrics.impressions > 0")
    conta["limite_conta"] = gaql(cid, """
        SELECT account_budget.status, account_budget.approved_spending_limit_micros,
               account_budget.approved_spending_limit_type, account_budget.amount_served_micros,
               account_budget.approved_start_date_time, account_budget.approved_end_date_time
        FROM account_budget WHERE account_budget.status = 'APPROVED'""")
    conta["camp_ontem"] = gaql(cid, f"SELECT campaign.id, {GRUPO_METRICAS} FROM campaign WHERE segments.date = '{per['ontem']}' AND metrics.impressions > 0")
    conta["termos_atu"] = gaql(cid, f"""
        SELECT campaign.name, ad_group.name, search_term_view.search_term, search_term_view.status,
               {GRUPO_METRICAS}
        FROM search_term_view WHERE {entre(per['atu'])} AND metrics.cost_micros > 0
        ORDER BY metrics.cost_micros DESC LIMIT 300""")
    conta["alteracoes"] = gaql(cid, f"""
        SELECT change_event.change_date_time, change_event.change_resource_type, change_event.client_type,
               change_event.user_email, change_event.resource_change_operation, change_event.changed_fields,
               change_event.campaign, change_event.ad_group
        FROM change_event
        WHERE change_event.change_date_time >= '{per['ant'][0]} 00:00:00'
          AND change_event.change_date_time <= '{per['hoje']} 23:59:59'
        ORDER BY change_event.change_date_time DESC LIMIT 300""")
    resultado["contas"].append(conta)

with open(saida, "w", encoding="utf-8") as fh:
    json.dump(resultado, fh, ensure_ascii=False, indent=1)
print(f"OK {saida}")
