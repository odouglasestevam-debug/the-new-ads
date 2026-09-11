# -*- coding: utf-8 -*-
"""
Padroniza o TEMPLATE-PADRAO-FUNIL: nomes de variaveis, pastas e agrupamento.

Nao muda logica de disparo, acionadores, codigo de Custom JS nem HTML de tag.
Renomear variavel atualiza toda referencia {{nome}} em qualquer lugar do JSON.

Uso:
    python ferramentas/gtm/padronizar-template-funil.py <entrada.json> <saida.json>
"""
import json, sys, io

# ---------------------------------------------------------------- pastas
# A ordem e alfabetica no GTM, entao o prefixo numerico controla o agrupamento.
PASTAS = [
    "00 | Setup",
    "01 | GA4",
    "02 | API",
    "03 | FB",
    "04 | Google Ads",
    "05 | IDs",
    "06 | Utilitarios",
    "07 | Cookies",
    "08 | Camada de dados",
    "09 | Consulta",
    "10 | Input",
    "11 | Acionadores",
]

# ---------------------------------------------------------------- variaveis
# de -> para. O numero do prefixo casa com o numero da pasta.
VARIAVEIS = {
    # 05 | IDs: tudo que troca de valor a cada cliente
    "id-ga4":                        "05 | ID | GA4",
    "id-meta ads":                   "05 | ID | Meta Pixel",
    "id-google ads":                 "05 | ID | Google Ads",
    "id-google ads-lead (antigo)":   "05 | ID | Google Ads Label Lead",
    "id-google ads-whatsapp":        "05 | ID | Google Ads Label WhatsApp",
    "Id-Visitor-api":                "05 | ID | Visitor API",
    "api-transport_url":             "05 | ID | Transport URL",

    # 06 | Utilitarios
    "api-event_id":                          "06 | Util | event_id",
    "UTM - Persist":                         "06 | Util | UTM Persist",
    "UTM'S":                                 "06 | Util | GA4 Event Settings",
    "user_data-api-consulta-all data":       "06 | Util | user_data GA4",
    "user_data-google-consulta-all data":    "06 | Util | user_data Google Ads",

    # 07 | Cookies
    "cookie-LeadEmail":            "07 | Cookie | LeadEmail",
    "cookie-LeadEmail-ajustado":   "07 | Cookie | LeadEmail decodificado",
    "cookie-LeadFirstName":        "07 | Cookie | LeadFirstName",
    "cookie-LeadLastName":         "07 | Cookie | LeadLastName",
    "cookie-LeadPhone":            "07 | Cookie | LeadPhone",
    "Cookie LeadCity":             "07 | Cookie | LeadCity",
    "Cookie LeadState":            "07 | Cookie | LeadState",
    "Cookie LeadCountry":          "07 | Cookie | LeadCountry",
    "cookie-ga":                   "07 | Cookie | _ga",
    "Cookie - __gtm_campaign_url": "07 | Cookie | __gtm_campaign_url",

    # 08 | Camada de dados
    "dlv - utm_source":             "08 | dlv | utm_source",
    "dlv - utm_medium":             "08 | dlv | utm_medium",
    "dlv - utm_campaign":           "08 | dlv | utm_campaign",
    "dlv - utm_content":            "08 | dlv | utm_content",
    "dlv - utm_term":               "08 | dlv | utm_term",
    "dlv - visitorApiCity":         "08 | dlv | visitorApiCity",
    "dlv - visitorApiRegion":       "08 | dlv | visitorApiRegion",
    "dlv - visitorApiCountryCode":  "08 | dlv | visitorApiCountryCode",
    "utm_source":                   "08 | URL | utm_source",
    "utm_medium":                   "08 | URL | utm_medium",
    "utm_campaign":                 "08 | URL | utm_campaign",
    "utm_content":                  "08 | URL | utm_content",
    "utm_term":                     "08 | URL | utm_term",

    # 09 | Consulta: decidem de qual fonte o valor vem
    "jsc - city (dlv|cookie)":     "09 | Consulta | city",
    "jsc - city (fb)":             "09 | Consulta | city (fb)",
    "jsc - state (dlv|cookie)":    "09 | Consulta | state",
    "jsc - Country (dlv|cookie)":  "09 | Consulta | country",
    "user-consulta-email":         "09 | Consulta | email",
    "user-consulta-firstname":     "09 | Consulta | firstname",
    "user-consulta-lastname":      "09 | Consulta | lastname",
    "user-consulta-phone":         "09 | Consulta | phone",

    # 10 | Input: leem o campo do formulario
    "user-input-email":     "10 | Input | email",
    "user-input-firstname": "10 | Input | firstname",
    "user-input-lastname":  "10 | Input | lastname",
    "user-input-fullname":  "10 | Input | fullname",
    "user-input-phone":     "10 | Input | phone",
}

# pasta de cada variavel, pelo prefixo do nome novo
PASTA_POR_PREFIXO = {
    "05": "05 | IDs",
    "06": "06 | Utilitarios",
    "07": "07 | Cookies",
    "08": "08 | Camada de dados",
    "09": "09 | Consulta",
    "10": "10 | Input",
}

# ---------------------------------------------------------------- tags
def pasta_da_tag(nome):
    if " | GA4 | " in nome or nome == "00 | Tag de Configuracao":
        return "01 | GA4"
    if " | API | " in nome:
        return "02 | API"
    if " | FB | " in nome:
        return "03 | FB"
    if " | Google Ads | " in nome:
        return "04 | Google Ads"
    return "00 | Setup"


# ---------------------------------------------------------------- utilidades
def por_nome(lista, nome):
    achados = [x for x in lista if x.get("name") == nome]
    if len(achados) != 1:
        raise SystemExit("ERRO: esperava 1 item chamado %r, achei %d" % (nome, len(achados)))
    return achados[0]


def set_param(obj, chave, valor, tipo="TEMPLATE"):
    for p in obj.get("parameter", []):
        if p.get("key") == chave:
            p["type"] = tipo
            p["value"] = valor
            return
    obj.setdefault("parameter", []).append({"type": tipo, "key": chave, "value": valor})


def trocar_refs(no, de, para):
    """Troca {{de}} por {{para}} em toda string da arvore."""
    n = 0
    if isinstance(no, dict):
        for k, v in no.items():
            if isinstance(v, str):
                if de in v:
                    n += v.count(de)
                    no[k] = v.replace(de, para)
            else:
                n += trocar_refs(v, de, para)
    elif isinstance(no, list):
        for i, v in enumerate(no):
            if isinstance(v, str):
                if de in v:
                    n += v.count(de)
                    no[i] = v.replace(de, para)
            else:
                n += trocar_refs(v, de, para)
    return n


# ------------------------------------------------------------------ execucao
def main(entrada, saida):
    doc = json.load(io.open(entrada, encoding="utf-8"))
    cv = doc["containerVersion"]
    tags, trigs, vars_ = cv["tag"], cv["trigger"], cv["variable"]
    conta, cont_id = cv["container"]["accountId"], cv["container"]["containerId"]
    log = []

    # -------------------------------------------------- 1. ID do Google Ads
    # Estava cravado na tag de configuracao e a variavel ficou com o placeholder,
    # entao as tags de conversao apontavam pro ID errado.
    cfg = por_nome(tags, "00 | Google Ads | Configuracao")
    aw = None
    for p in cfg.get("parameter", []):
        if p.get("key") == "tagId":
            aw = p.get("value")
    if aw and aw.startswith("AW-"):
        set_param(cfg, "tagId", "{{id-google ads}}")
        set_param(por_nome(vars_, "id-google ads"), "value", aw)
        log.append("ID centralizado:     %s saiu da tag e virou valor da variavel" % aw)
    else:
        log.append("ID do Google Ads:    ja vinha de variavel, nada a fazer")

    # -------------------------------------------------- 2. renomear variaveis
    faltando = [n for n in VARIAVEIS if not [v for v in vars_ if v["name"] == n]]
    if faltando:
        raise SystemExit("ERRO: variaveis nao encontradas: %s" % ", ".join(faltando))

    for antigo, novo in sorted(VARIAVEIS.items(), key=lambda kv: -len(kv[0])):
        v = por_nome(vars_, antigo)
        refs = trocar_refs(cv, "{{%s}}" % antigo, "{{%s}}" % novo)
        v["name"] = novo
        log.append("variavel: %-36s -> %-38s %d referencia(s)" % (antigo, novo, refs))

    # -------------------------------------------------- 3. pastas
    cv["folder"] = []
    id_pasta = {}
    for i, nome in enumerate(PASTAS, start=1000):
        cv["folder"].append({
            "accountId": conta, "containerId": cont_id,
            "folderId": str(i), "name": nome,
        })
        id_pasta[nome] = str(i)
    log.append("pastas recriadas:    %s" % ", ".join(PASTAS))

    for t in tags:
        p = pasta_da_tag(t["name"])
        t["parentFolderId"] = id_pasta[p]
    for v in vars_:
        pref = v["name"][:2]
        p = PASTA_POR_PREFIXO.get(pref)
        if p:
            v["parentFolderId"] = id_pasta[p]
        else:
            v.pop("parentFolderId", None)
    for t in trigs:
        t["parentFolderId"] = id_pasta["11 | Acionadores"]

    # -------------------------------------------------- 4. sanidade
    ids = {f["folderId"] for f in cv["folder"]}
    for grupo, itens in (("tag", tags), ("variavel", vars_), ("acionador", trigs)):
        for x in itens:
            pf = x.get("parentFolderId")
            if pf is not None and pf not in ids:
                raise SystemExit("ERRO: %s %r em pasta inexistente %s" % (grupo, x["name"], pf))

    nomes = [v["name"] for v in vars_]
    if len(nomes) != len(set(nomes)):
        raise SystemExit("ERRO: nome de variavel duplicado")

    # toda referencia {{x}} precisa existir como variavel ou built-in
    existentes = set(nomes) | {b["name"] for b in cv.get("builtInVariable", [])} | {"_event"}
    import re
    bruto = json.dumps(cv, ensure_ascii=False)
    orfas = sorted({m for m in re.findall(r"\{\{([^{}]+)\}\}", bruto) if m not in existentes})
    if orfas:
        raise SystemExit("ERRO: referencia a variavel inexistente: %s" % ", ".join(orfas))

    json.dump(doc, io.open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=4)

    print("\n".join(log))
    print("\n--- resumo ---")
    print("tags %d | acionadores %d | variaveis %d | pastas %d"
          % (len(tags), len(trigs), len(vars_), len(cv["folder"])))
    for p in PASTAS:
        n = sum(1 for x in list(tags) + list(vars_) + list(trigs)
                if x.get("parentFolderId") == id_pasta[p])
        print("  %-22s %d item(ns)" % (p, n))
    print("saida: %s" % saida)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
