---
name: publicar-site
description: >
  Publica um arquivo HTML no ar via Cloudflare Pages e retorna um link compartilhável.
  Use quando o usuário disser "publica", "coloca no ar", "quero um link", "deploy",
  "publica esse HTML", "publicar-site" ou após criar uma proposta/landing page.
---

# /publicar-site — Deploy no Cloudflare Pages

## O que faz

Envia um arquivo HTML pro Cloudflare Pages (projeto `the-new-ads`) via Wrangler CLI e retorna uma URL pública com HTTPS.

## Pré-requisitos (`.env` na raiz)

```
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_PROJECT_NAME=the-new-ads
```

Se alguma variável não existir, guiar o usuário: token e account ID em dash.cloudflare.com → Workers & Pages → o card do projeto mostra o nome; o token é criado em "My Profile → API Tokens" com permissão "Cloudflare Pages: Edit".

## ⚠️ Regra crítica — nunca publicar um arquivo isolado

Cada deploy do Cloudflare Pages **substitui todo o conteúdo do deployment anterior**, não adiciona arquivos. Publicar uma pasta temporária com só o arquivo novo apaga o site inteiro que já está no ar (já aconteceu: um deploy assim derrubou `thenewads.com.br` inteiro, deixando só a proposta no ar).

**Sempre publicar o site completo:**

1. Copiar todo o conteúdo de `the-new-ads-site/` (exceto `.wrangler/`) pra uma pasta temporária.
2. Copiar/adicionar o arquivo novo dentro dessa mesma pasta temporária (não em outro lugar).
3. Se o usuário pedir uma URL limpa específica (ex: `/proposta`), nomear o arquivo exatamente como a rota desejada + `.html` (ex: `proposta.html` → `/proposta`). O Cloudflare Pages já faz o redirect automático de `/arquivo.html` pra `/arquivo`.
4. Deploy sempre a partir dessa pasta com o site inteiro + o arquivo novo.

## Workflow

1. Confirmar que o arquivo existe e é `.html`.
2. Ler as três variáveis do `.env`.
3. Montar a pasta temporária conforme a regra crítica acima (site completo + arquivo novo).
4. Rodar o deploy:
   ```
   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account_id> npx wrangler pages deploy <pasta_temporaria> --project-name=<project_name> --branch=main --commit-dirty=true
   ```
5. O Wrangler retorna a URL do deployment (formato `https://<hash>.<project_name>.pages.dev`). Extrair essa URL da saída.
6. Montar a URL final: se o domínio customizado (`thenewads.com.br`) estiver conectado, usar ele; senão usar `<project_name>.pages.dev`. Caminho é `/<nome-do-arquivo-sem-extensão>`.
7. Retornar o link pro usuário.

## Saída esperada

> "Publicado. Link: https://[hash].the-new-ads.pages.dev/proposta-cliente-x.html"

## Observações

- Cada deploy do Wrangler sobe todos os arquivos da pasta indicada — por isso usar uma pasta temporária isolada evita publicar acidentalmente outros arquivos do repositório.
- Deployments antigos continuam acessíveis pelo hash, mas o ideal é sempre compartilhar o link do deployment mais recente.
- Não expor o valor de `CLOUDFLARE_API_TOKEN` na saída pro usuário.
