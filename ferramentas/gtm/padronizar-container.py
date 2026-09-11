# -*- coding: utf-8 -*-
"""
Padroniza o container GTM do funil da The New Ads e transforma em template.

Entrada:  export cru do GTM (JSON)
Saida:    mesmo JSON com nomes padronizados, eventos renomeados e placeholders 111

Nao toca em: logica de disparo das tags que ficam, codigo das Custom JS
(so o seletor), customTemplate, folders, builtInVariable.

Uso:
    python ferramentas/gtm/padronizar-container.py <entrada.json> <saida.json>
"""
import json, sys, copy, io

DOMINIO_ATUAL = ".trafegocomdouglas.com"
DOMINIO_PLACEHOLDER = ".111.com.br"

PADRAO_META = {
    "PageView", "AddPaymentInfo", "AddToCart", "AddToWishlist", "CompleteRegistration",
    "Contact", "CustomizeProduct", "Donate", "FindLocation", "InitiateCheckout", "Lead",
    "Purchase", "Schedule", "Search", "StartTrial", "SubmitApplication", "Subscribe",
    "ViewContent",
}


# ---------------------------------------------------------------- utilidades
def param(obj, chave):
    for p in obj.get("parameter", []):
        if p.get("key") == chave:
            return p
    return None


def set_param(obj, chave, valor, tipo="TEMPLATE"):
    p = param(obj, chave)
    if p is None:
        obj.setdefault("parameter", []).append({"type": tipo, "key": chave, "value": valor})
    else:
        p["type"] = tipo
        p["value"] = valor


def del_param(obj, chave):
    obj["parameter"] = [p for p in obj.get("parameter", []) if p.get("key") != chave]


def por_nome(lista, nome):
    achados = [x for x in lista if x.get("name") == nome]
    if len(achados) != 1:
        raise SystemExit("ERRO: esperava 1 item chamado %r, achei %d" % (nome, len(achados)))
    return achados[0]


def proximo_id(itens, campo):
    return str(max(int(x[campo]) for x in itens) + 1)


def custom_event_filter(evento):
    return [{
        "type": "EQUALS",
        "parameter": [
            {"type": "TEMPLATE", "key": "arg0", "value": "{{_event}}"},
            {"type": "TEMPLATE", "key": "arg1", "value": evento},
        ],
    }]


def aplicar_evento(tag, evento):
    """GA4 e API mexem em eventName. FB alterna padrao x custom conforme o nome."""
    if tag["type"] == "gaawe":
        set_param(tag, "eventName", evento)
    elif tag["type"].startswith("cvt_") and param(tag, "pixelId") is not None:
        if evento in PADRAO_META:
            set_param(tag, "eventName", "standard")
            set_param(tag, "standardEventName", evento)
            del_param(tag, "customEventName")
        else:
            set_param(tag, "eventName", "custom")
            set_param(tag, "customEventName", evento)
            del_param(tag, "standardEventName")
    else:
        raise SystemExit("ERRO: nao sei aplicar evento na tag %r" % tag["name"])


# ------------------------------------------------------------------ execucao
def main(entrada, saida):
    doc = json.load(io.open(entrada, encoding="utf-8"))
    cv = doc["containerVersion"]
    tags, trigs, vars_ = cv["tag"], cv["trigger"], cv["variable"]
    log = []

    # ------------------------------------------------------ 1. remocoes
    for nome in ["cHTML - Calendly",
                 "wh-envio-de-email",
                 "02 | GA4 | view_forms",
                 "02 | FB | View_Forms",
                 "02 | API | View_Forms"]:
        tags.remove(por_nome(tags, nome))
        log.append("tag removida:        %s" % nome)

    for nome in ["08 | View_Calendly",   # event_type_viewed, orfao apos remover o cHTML
                 "03 | DOM Ready",
                 "05 | View_forms",
                 "view_form_novo"]:
        trigs.remove(por_nome(trigs, nome))
        log.append("acionador removido:  %s" % nome)

    # ------------------------------------------------------ 2. acionadores
    def repontar(atual, novo, evento, virar_custom_event=False):
        tr = por_nome(trigs, atual)
        tr["name"] = novo
        if virar_custom_event:
            tr["type"] = "CUSTOM_EVENT"
            tr.pop("filter", None)
        tr["customEventFilter"] = custom_event_filter(evento)
        log.append("acionador:           %-28s -> %-36s escuta %s" % (atual, novo, evento))

    repontar("06 | Iniciou_Forms",    "02 | CE | IniciouFormulario",       "IniciouFormulario")
    repontar("07 | Enviou Forms",     "04 | CE | CompletouFormulario",     "CompletouFormulario")
    repontar("10 | Enviou_Calendly",  "07 | CE | Schedule",                "Schedule")
    # orfaos reaproveitados, evita criar e deletar acionador a toa
    repontar("09 | Escolheu_horario", "06 | CE | scheduler_slot_selected", "scheduler_slot_selected")
    repontar("View_Calendly",         "05 | CE | scheduler_view",          "scheduler_view",
             virar_custom_event=True)

    # unico acionador realmente novo: passo 03
    trigs.append({
        "accountId": cv["container"]["accountId"],
        "containerId": cv["container"]["containerId"],
        "triggerId": proximo_id(trigs, "triggerId"),
        "name": "03 | CE | Lead",
        "type": "CUSTOM_EVENT",
        "customEventFilter": custom_event_filter("Lead"),
    })
    log.append("acionador criado:    03 | CE | Lead")

    # infra: so o nome, condicao intocada
    for atual, novo in [
        ("00 | All Pages",                     "00 | PV | All Pages"),
        ("01 | All Pages + Cookie not exists",  "00 | PV | All Pages + Cookie not exists"),
        ("02 | gtm.dom|visitor-api-success",   "01 | CE | gtm.dom OU visitor-api-success"),
        ("04 | visitor-api-success",           "00 | CE | visitor-api-success"),
    ]:
        por_nome(trigs, atual)["name"] = novo
        log.append("acionador renomeado: %-28s -> %s" % (atual, novo))

    id_trigger = {t["name"]: t["triggerId"] for t in trigs}

    # ------------------------------------------------------ 3. tags que ficam
    remap = [
        ("03 | GA4 | Iniciou_Forms",   "02 | GA4 | form_start",          "form_start",           "02 | CE | IniciouFormulario"),
        ("03 | FB | Iniciou_Forms",    "02 | FB | ViewContent",          "ViewContent",          "02 | CE | IniciouFormulario"),
        ("03 | API | Iniciou_Forms",   "02 | API | form_start",          "form_start",           "02 | CE | IniciouFormulario"),
        ("04 | GA4 | Enviou_Forms",    "04 | GA4 | form_submit",         "form_submit",          "04 | CE | CompletouFormulario"),
        ("04 | FB | Enviou_Forms",     "04 | FB | CompleteRegistration", "CompleteRegistration", "04 | CE | CompletouFormulario"),
        ("04 | API | Enviou_Forms",    "04 | API | form_submit",         "form_submit",          "04 | CE | CompletouFormulario"),
        ("05 | GA4 | View_Calendly",   "05 | GA4 | scheduler_view",      "scheduler_view",       "05 | CE | scheduler_view"),
        ("05 | FB | View_Calendly",    "05 | FB | SchedulerView",        "SchedulerView",        "05 | CE | scheduler_view"),
        ("05 | API | View_Calendly",   "05 | API | scheduler_view",      "scheduler_view",       "05 | CE | scheduler_view"),
        ("06 | GA4 | Enviou_Calendly", "07 | GA4 | schedule",            "schedule",             "07 | CE | Schedule"),
        ("06 | FB | Enviou_Calendly",  "07 | FB | Schedule",             "Schedule",             "07 | CE | Schedule"),
        ("06 | API | Enviou_Calendly", "07 | API | schedule",            "schedule",             "07 | CE | Schedule"),
    ]
    for atual, novo, evento, acionador in remap:
        t = por_nome(tags, atual)
        t["name"] = novo
        aplicar_evento(t, evento)
        t["firingTriggerId"] = [id_trigger[acionador]]
        log.append("tag:                 %-28s -> %-30s evento %-22s acionador %s"
                   % (atual, novo, evento, acionador))

    for atual, novo in [
        (u"0 | Tag de Configuração", "00 | Tag de Configuracao"),
        ("00 | setCookie HTML DataUsers",      "00 | setCookie DataUsers"),
        ("00 | setCookie HTML GeoLoc",         "00 | setCookie GeoLoc"),
    ]:
        por_nome(tags, atual)["name"] = novo
        log.append("tag renomeada:       %-28s -> %s" % (atual, novo))

    # ------------------------------------------------------ 4. tags novas
    # clone exato do passo 04, troca so o nome do evento e o acionador
    for base, novo, evento, acionador in [
        ("04 | GA4 | form_submit",         "03 | GA4 | generate_lead", "generate_lead", "03 | CE | Lead"),
        ("04 | FB | CompleteRegistration", "03 | FB | Lead",           "Lead",          "03 | CE | Lead"),
        ("04 | API | form_submit",         "03 | API | generate_lead", "generate_lead", "03 | CE | Lead"),
        ("04 | GA4 | form_submit",         "06 | GA4 | slot_selected", "slot_selected", "06 | CE | scheduler_slot_selected"),
        ("04 | FB | CompleteRegistration", "06 | FB | SlotSelected",   "SlotSelected",  "06 | CE | scheduler_slot_selected"),
        ("04 | API | form_submit",         "06 | API | slot_selected", "slot_selected", "06 | CE | scheduler_slot_selected"),
    ]:
        t = copy.deepcopy(por_nome(tags, base))
        t["tagId"] = proximo_id(tags, "tagId")
        t["name"] = novo
        t.pop("fingerprint", None)
        aplicar_evento(t, evento)
        t["firingTriggerId"] = [id_trigger[acionador]]
        tags.append(t)
        log.append("tag criada:          %-28s clone de %-30s acionador %s"
                   % (novo, base, acionador))

    # ------------------------------------------------------ 5. variaveis
    for nome, valor in [
        ("0 | GA4 - ID",               "G-111111111"),
        ("0 | FB - Pixel",             "111111111111111"),
        ("0 | transport_url",          "https://cloud.111.com.br"),
        ("0 | Visitor API Project ID", "111"),
    ]:
        set_param(por_nome(vars_, nome), "value", valor)
        log.append("placeholder:         %-28s = %s" % (nome, valor))

    # seletor das input: uma linha em cada, resto do codigo intocado
    for nome, de, para in [
        ("user-input-firstname", '[id="nomeField"]',                     '[id="nome"]'),
        ("user-input-lastname",  '[id="nomeField"]',                     '[id="nome"]'),
        ("user-input-email",     '[name="email"]',                       '[id="email"]'),
        ("user-input-phone",     '[name="whatsapp"], [name="telefone"]', '[id="telefone"]'),
    ]:
        p = param(por_nome(vars_, nome), "javascript")
        if de not in p["value"]:
            raise SystemExit("ERRO: seletor %r nao encontrado em %s" % (de, nome))
        p["value"] = p["value"].replace(de, para)
        log.append("seletor:             %-22s %-38s -> %s" % (nome, de, para))

    # ------------------------------------------------------ 6. dominio do cookie
    total = 0
    for nome in ["00 | setCookie DataUsers", "00 | setCookie GeoLoc"]:
        p = param(por_nome(tags, nome), "html")
        n = p["value"].count(DOMINIO_ATUAL)
        p["value"] = p["value"].replace(DOMINIO_ATUAL, DOMINIO_PLACEHOLDER)
        total += n
        log.append("dominio do cookie:   %-28s %d ocorrencia(s)" % (nome, n))
    if total != 7:
        raise SystemExit("ERRO: esperava 7 trocas de dominio, fiz %d" % total)

    # ------------------------------------------------------ 7. sanidade
    ids_validos = {t["triggerId"] for t in trigs} | {"2147479573"}
    for t in tags:
        for tid in t.get("firingTriggerId", []):
            if tid not in ids_validos:
                raise SystemExit("ERRO: tag %r aponta pro acionador inexistente %s"
                                 % (t["name"], tid))
    nomes = [t["name"] for t in tags]
    if len(nomes) != len(set(nomes)):
        raise SystemExit("ERRO: nome de tag duplicado")
    ids = [t["tagId"] for t in tags]
    if len(ids) != len(set(ids)):
        raise SystemExit("ERRO: tagId duplicado")

    usados = {tid for t in tags for tid in t.get("firingTriggerId", [])}
    orfaos = [t["name"] for t in trigs if t["triggerId"] not in usados]

    json.dump(doc, io.open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=4)

    print("\n".join(log))
    print("\n--- resumo ---")
    print("tags:        %d" % len(tags))
    print("acionadores: %d" % len(trigs))
    print("variaveis:   %d" % len(vars_))
    if orfaos:
        print("acionadores sem tag: %s" % ", ".join(orfaos))
    print("saida: %s" % saida)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
