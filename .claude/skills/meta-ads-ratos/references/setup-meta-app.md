# Setup do App Meta — Guia passo a passo

Referencia completa para o Claude orientar o aluno durante o setup.
O aluno pode mandar prints de cada tela e o Claude deve comparar com os passos abaixo.

---

## Visao geral

Para a skill funcionar, o aluno precisa de:
1. **Um app Meta** (gratuito, criado em developers.facebook.com)
2. **Um token de acesso** (gerado no Graph API Explorer)
3. **O app em modo Live** (nao Development)

O processo todo leva ~10 minutos.

---

## Passo 1 — Criar conta de desenvolvedor

1. Acessar https://developers.facebook.com
2. Se nunca usou, clicar em "Comece agora" e aceitar os termos
3. Confirmar email se solicitado

**Problema comum:** "Sua conta do Facebook precisa de verificacao"
→ O aluno precisa verificar a identidade na conta pessoal do Facebook primeiro.

---

## Passo 2 — Criar o app

1. No painel, clicar em **"Meus Apps"** (menu superior) > **"Criar App"**
2. Selecionar tipo: **"Outro"** ou **"Negocio"** (qualquer um funciona)
3. Preencher:
   - **Nome:** qualquer nome (ex: "Meta Ads Ratos", "Minha Skill Ads")
   - **Email de contato:** email do aluno
   - **Conta comercial:** selecionar a que aparece (ou "Nenhuma conta" se nao tiver)
4. Clicar em **"Criar app"**

**O que o aluno vai ver:** um painel com o app criado, mostrando o App ID no topo.

**Anotar:** O **App ID** (numero tipo `905545132380980`) — vai pro campo `META_APP_ID` no `.env`.

---

## Passo 3 — Adicionar produto "Marketing API"

1. No menu lateral do app, clicar em **"Adicionar produto"** (ou "Add product")
2. Procurar **"Marketing API"**
3. Clicar em **"Configurar"** (ou "Set up")

**Se nao encontrar Marketing API:** pode pular este passo. O token gerado no Graph API Explorer ja tem acesso se as permissoes estiverem corretas.

---

## Passo 4 — Gerar o token de acesso

1. Acessar https://developers.facebook.com/tools/explorer/
2. No campo **"Meta App"** (canto superior direito), selecionar o app criado no passo 2
3. Em **"User or Page"**, manter **"User Token"**
4. Clicar em **"Adicionar permissao"** (ou "Add a Permission") e adicionar TODAS estas:
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `pages_read_engagement`
   - `pages_show_list`
   - `read_insights`
5. Clicar em **"Gerar Token de Acesso"** (botao azul)
6. Autorizar quando o Facebook pedir (popup de login)
7. **Copiar o token** que aparece no campo "Access Token"

**IMPORTANTE:** Este token expira em ~1 hora. Ver passo 6 para estender.

**Anotar:** O token (comeca com `EAAM...`) — vai pro campo `META_ADS_TOKEN` no `.env`.

**Problemas comuns:**
- "Erro ao gerar token" → verificar se o app esta vinculado a uma conta comercial
- "Permissao nao disponivel" → algumas permissoes so aparecem depois que o app esta em modo Live
- Token muito curto (nao comeca com EAAM) → selecionar o app correto no dropdown

---

## Passo 5 — Mudar o app para modo Live

**Por que:** Em modo Development, o app so funciona para leitura. Para criar campanhas, criativos e dark posts, precisa estar em modo Live.

1. No painel do app, ir em **"Configuracoes do app"** > **"Basico"** (menu lateral)
2. Preencher os campos obrigatorios:
   - **URL da Politica de Privacidade:** pode ser qualquer URL (ex: `https://www.facebook.com/privacy/policy/`)
   - **Icone do app:** nao e obrigatorio
   - **Categoria:** selecionar qualquer uma (ex: "Negocios e paginas")
3. Salvar alteracoes
4. No topo do painel, localizar o toggle **"Em desenvolvimento"** / **"Live"**
5. Mudar para **"Live"**

**Problema comum:** "Voce precisa de uma URL de Politica de Privacidade"
→ Preencher o campo em Configuracoes > Basico com qualquer URL valida.

**Problema comum:** "App Review necessario"
→ Para as permissoes basicas de ads (ads_management, ads_read), NAO precisa de App Review. Se o Facebook pedir, verificar se nao adicionou permissoes avancadas desnecessarias.

---

## Passo 6 — Estender o token (opcional, recomendado)

O token do Graph API Explorer expira em ~1 hora. Para estender para 60 dias:

1. Acessar https://developers.facebook.com/tools/debug/accesstoken/
2. Colar o token e clicar em **"Depurar"** (ou "Debug")
3. Na parte inferior, clicar em **"Estender Token de Acesso"** (ou "Extend Access Token")
4. Copiar o novo token estendido

**Alternativa:** Usar o endpoint direto:
```
GET https://graph.facebook.com/v22.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=APP_ID
  &client_secret=APP_SECRET
  &fb_exchange_token=TOKEN_CURTO
```

**Onde encontrar o App Secret:** Configuracoes do app > Basico > Chave secreta do app (clicar em "Mostrar")

**IMPORTANTE:** Mesmo o token estendido expira em 60 dias. O aluno vai precisar regerar eventualmente. Se os comandos comecarem a dar erro de autenticacao, provavelmente o token expirou.

---

## Passo 7 — Vincular paginas ao app (para criar anuncios)

Para criar criativos e dark posts, as paginas do Facebook usadas nos anuncios precisam estar vinculadas ao app.

**Na maioria dos casos isso ja funciona automaticamente** se o usuario que gerou o token e admin da pagina. Se der erro de permissao ao criar criativos:

1. Ir em **Configuracoes do app** > **Avancado**
2. Em "Paginas autorizadas", adicionar as paginas necessarias

Ou, mais comum:
1. Ir na **Pagina do Facebook** > **Configuracoes** > **Avancado**
2. Em "Apps da Pagina", verificar se o app esta autorizado

---

## Checklist final

Antes de continuar com o setup da skill, verificar:

- [ ] App criado em developers.facebook.com
- [ ] App ID anotado (numero tipo `905545132380980`)
- [ ] Token gerado no Graph API Explorer (comeca com `EAAM...`)
- [ ] Permissoes: `ads_management`, `ads_read`, `business_management`
- [ ] App em modo **Live** (nao Development)
- [ ] Token estendido para 60 dias (opcional mas recomendado)

Se todos os itens estiverem OK, o Claude pode prosseguir preenchendo o `.env` e rodando o `setup.py`.

---

## Erros comuns durante uso

| Erro | Causa | Solucao |
|------|-------|---------|
| "Invalid OAuth access token" | Token expirado ou invalido | Regerar token no Graph API Explorer |
| "app em modo de desenvolvimento" | App nao esta em Live | Mudar toggle para Live nas configuracoes |
| "Invalid appsecret_proof" | Endpoint requer app_secret | Nao precisa resolver — os scripts da skill nao usam endpoints que exigem isso |
| "Insufficient permissions" | Faltou permissao no token | Regerar token adicionando as permissoes listadas no passo 4 |
| "Pages not authorized" | Pagina nao vinculada ao app | Ver passo 7 |
| "(#2663) Terms of service" | Termos de Custom Audiences | Acessar o link do erro e aceitar os termos |
| "rate limit" (codigos 17, 32, 80004) | Muitas chamadas seguidas | Aguardar 60 segundos e tentar novamente |
