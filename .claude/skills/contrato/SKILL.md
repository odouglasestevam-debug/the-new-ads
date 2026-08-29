---
name: contrato
description: >
  Gera um contrato de prestação de serviços em HTML pra um cliente novo, a partir do
  template padrão da The New Ads (templates/contrato-padrao.html). Preenche dados do
  cliente, escopo de serviço e valores mantendo as cláusulas jurídicas fixas (rescisão,
  LGPD, propriedade, responsabilidade). Use quando o usuário mencionar "contrato",
  "contrato de prestação de serviços", "fazer contrato pro cliente X", "gerar contrato"
  ou pedir pra formalizar um novo cliente.
---

# /contrato — Geração de Contrato de Prestação de Serviços

## Dependências

- **Template base:** `templates/contrato-padrao.html`
- **Dados da contratada:** `_contexto/empresa.md`
- **Tom de voz:** `_contexto/preferencias.md`

## Regras fixas do contrato (não alterar sem o usuário pedir explicitamente)

Essas cláusulas já refletem decisões que Douglas tomou sobre como a The New Ads contrata. Não improvisar valores diferentes sem confirmar:

- **Verba de mídia:** sempre à parte do fee. Cliente paga verba direto na plataforma (Meta/Google), a agência não repassa.
- **Cobrança:** fee fixo mensal + componente variável por escala da verba investida.
- **Prazo mínimo:** 4 meses, renovação automática por prazo indeterminado depois disso.
- **Rescisão:** aviso prévio obrigatório de 30 dias (serviço e cobrança seguem normalmente nesse período). Cancelamento imediato sem aviso gera multa de 50% do fee fixo mensal vigente.
- **Foro:** cidade a definir por Douglas em cada contrato (não assumir cidade, mas Tubarão/SC é o padrão mais provável já que é a sede da contratada).
- **Contratada (The New Ads):** CNPJ 49.951.219/0001-65 (MEI), Douglas Estevam Teixeira, Rua Cecília Henrique Fernandes, 581, Congonhas, Tubarão/SC. Esses dados já vêm de `_contexto/empresa.md`, não perguntar de novo.
- **Propriedade intelectual (Cláusula 8.3 e 8.4):** após rescisão, a CONTRATANTE não pode replicar/reaproveitar a estrutura de campanhas, segmentações, estratégias e a estrutura de rastreamento avançado (GTM/tags/eventos e rastreamento de conversas via WhatsApp) desenvolvidas pela CONTRATADA (know-how proprietário). Materiais entregues em overdelivery/cortesia/bônus (sem cobrança específica) não têm uso cedido e não podem ser usados sem autorização.

Essas regras vêm de decisão explícita do usuário. Se ele pedir pra mudar alguma (ex: outro modelo de cobrança, outro prazo), aplicar só naquele contrato específico, sem alterar o template padrão sem confirmação.

## Workflow

### Passo 1 — Coletar dados do cliente

Se o usuário não trouxe as informações, perguntar (pode ser tudo de uma vez em texto livre):

1. Razão social e CNPJ do cliente
2. Endereço do cliente
3. Nome do representante legal (quem assina)
4. Escopo do serviço contratado (quais serviços: Google Ads, Meta Ads, tracking, landing page, etc — usar `_contexto/empresa.md` como referência de catálogo de serviços)
5. O que fica de fora do escopo (exclusões), se houver algo relevante pro caso
6. Valor do fee fixo mensal
7. Regra do componente variável (percentual e a partir de que patamar de verba incide)
8. Dia de vencimento
9. Cidade/comarca do foro
10. Data de assinatura (default: data de hoje)
11. **Pontos adicionais:** sempre perguntar no final — "Tem alguma cláusula específica pra esse cliente (condição especial, exclusividade, exceção de escopo, prazo diferente, etc)?" Se sim, incluir como cláusula extra no fim do contrato, antes da assinatura, sem remover nenhuma das cláusulas fixas.

Se o usuário já passou parte dessas informações antes (proposta comercial aceita, briefing), reaproveitar sem perguntar de novo.

### Passo 2 — Preencher o template

- Ler `templates/contrato-padrao.html`
- Substituir os placeholders `{{...}}` pelos dados coletados. Os dados da CONTRATADA (CNPJ, nome, endereço) já vêm preenchidos fixos no template, não são placeholder
- Se algum dado do cliente não foi fornecido e não é opcional, manter o placeholder visível (ele já vem destacado em laranja no CSS) em vez de inventar valor — sinalizar pro usuário quais campos ficaram pendentes
- Se o usuário trouxer pontos adicionais no Passo 1, adicionar como cláusula extra numerada (ex: Cláusula 13) antes da seção de Foro/assinatura
- Gerar número de contrato sequencial simples (ex: ano + sequencial, tipo `2026-001`) se o usuário não tiver um padrão definido

### Passo 3 — Salvar localmente

Salvar em `contratos/contrato-[nome-cliente]-[data].html` (registro interno, fica no repo).

### Passo 4 — Subir pro Google Docs

Usar `mcp__claude_ai_Google_Drive__create_file` com o HTML do contrato:
- `title`: "Contrato — [Cliente] — [data]"
- `textContent`: o HTML completo do contrato (o mesmo salvo no Passo 3)
- `contentMimeType`: `"text/html"`
- **Não** setar `disableConversionToGoogleType` — precisa converter automaticamente pra Google Doc editável, não ficar como HTML bruto anexado
- Se o usuário indicar uma pasta específica do Drive, usar `parentId`; sem indicação, cria na raiz do Drive

Retornar o link do documento pro usuário (montar `https://docs.google.com/document/d/[id]/edit` a partir do `id` retornado pela chamada, ou usar o link que vier na resposta).

### Passo 5 — Revisão

Antes de considerar pronto, avisar o usuário:

> "Contrato gerado e subido pro Google Docs. Isso é um template de apoio operacional, não substitui revisão jurídica profissional antes do envio pro cliente, principalmente nas cláusulas de rescisão e responsabilidade."

Perguntar o que fazer a seguir: compartilhar o Google Doc direto com o cliente (ajustar permissão de acesso), exportar como PDF pra subir numa plataforma de assinatura (Autentique, Clicksign, D4Sign), ou publicar com link (`/publicar-site`). Não presumir — o Google Doc já resolve revisão e assinatura eletrônica simples (Google permite comentário/edição), mas assinatura com validade jurídica formal ainda passa por uma dessas plataformas.

## Estilo do documento

O contrato usa layout formal, impresso/PDF-friendly (fundo branco, texto preto, sem o visual dark da marca) — documentos jurídicos priorizam legibilidade e formalidade sobre identidade visual. Detalhes da marca aparecem só no cabeçalho (nome + cor de destaque nos títulos de seção).

## Regras

- Nunca inventar CNPJ, endereço, valor ou cláusula que não foi informado — deixar placeholder visível
- Não remover ou suavizar as cláusulas de rescisão, LGPD, propriedade ou limitação de responsabilidade sem o usuário pedir explicitamente
- Cada contrato gerado é um arquivo novo, o template em `templates/contrato-padrao.html` nunca é sobrescrito por um contrato específico
