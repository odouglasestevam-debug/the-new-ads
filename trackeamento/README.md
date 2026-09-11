# trackeamento/

Tudo que é padrão de tracking da agência vive aqui. **Só entra template final.**
Versão intermediária, export de container de cliente e arquivo de inspeção não
ficam nesta pasta: viram lixo em uma semana e ninguém sabe mais qual é o bom.

Material de tracking de um cliente específico vai em `clientes/<cliente>/gtm/`.

## gtm/

| arquivo | quando usar |
|---|---|
| `container-web-funil-padrao.json` | container web completo do funil, com os eventos do formulário e do agendamento. É o mais novo e o mais completo. |
| `container-web-landing-page-padrao.json` | container web enxuto, para landing page simples |
| `container-server-padrao.json` | container server-side (GTM SS / Stape) |

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
