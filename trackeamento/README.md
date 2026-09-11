# trackeamento/

Tudo que é padrão de tracking da agência vive aqui. **Só entra template final.**
Versão intermediária, export de container de cliente e arquivo de inspeção não
ficam nesta pasta: viram lixo em uma semana e ninguém sabe mais qual é o bom.

Material de tracking de um cliente específico vai em `clientes/<cliente>/gtm/`.

## gtm/

| arquivo | quando usar |
|---|---|
| `template-track-padrao-funil-shark.json` | **o padrão do funil.** Container web completo: eventos do formulário e do agendamento, Meta Pixel via Stape, GA4, Google Ads e o envio server-side |
| `container-web-landing-page-padrao.json` | container web enxuto, para landing page simples |
| `container-server-padrao.json` | container server-side (GTM SS / Stape), o par do template do funil |

### Por que as tags `API |` mandam `_fbp` e `_fbc`

As sete tags `API |` são as que vão para o container server (têm `transport_url`).
O template do server, Facebook Conversion API by Stape, procura os cookies nesta ordem:

```js
let fbc = getCookieValues('_fbc')[0] || commonCookie._fbc;
if (!fbc) fbc = eventData._fbc;
```

Quando o server não enxerga o cookie, o único caminho que sobra é `eventData`, e é
por isso que o parâmetro tem que se chamar `_fbp` / `_fbc`, **com underscore**.
Sem eles a Meta perde o Browser ID e o Click ID no evento server-side, o que derruba
a qualidade da correspondência e a atribuição de clique.

As tags `FB |` não recebem esses parâmetros de propósito: rodam no browser, onde o
próprio `fbevents.js` lê os cookies. Passar na mão ali só duplicaria informação.
As tags `GA4 |` também não, porque vão direto pro Google e não passam pelo server.

## n8n/

| arquivo | quando usar |
|---|---|
| `template-ctwa-meta-capi.json` | fluxo padrão de tracking CTWA com envio para a CAPI da Meta |
| `backfill-execucoes-para-webhook.json` | utilitário de recuperação: reprocessa execuções antigas pelo webhook |

## scripts/

| arquivo | o que faz |
|---|---|
| `padronizar-container.py` | aplica a nomenclatura padrão num container exportado |
| `padronizar-template-funil.py` | gera o container do funil a partir do template |
