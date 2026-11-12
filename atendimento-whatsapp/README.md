# Monitor de atendimento por WhatsApp

Mede como cada loja atende no WhatsApp sem mudar a rotina dela: a NeoGo fica conectada como mais um aparelho, o sistema só escuta e grava. **Não existe nenhuma função de envio de mensagem.**

Primeiro cliente: rede Sapataria do Futuro, com 3 unidades (Nações, Tietê, Anália Franco). Começou em 10/11/2026 na Nações, a partir da análise manual de 01/10 a 10/11. Virou plataforma da rede em 12/11/2026, a pedido do Douglas com a Renita, dona das três: KPIs com metas e uma nota por unidade.

- Tela: https://atendimento.thenewads.com.br (login do Supabase do CRM e do gestor, com 2FA quando cadastrado)
- Banco: Supabase do CRM e do gestor (`xrvjlhseyqfgyvwwlwwb`, conector `supabase-app`), schema próprio `atendimento`. Não mexe em nada do CRM nem do gestor.
- Front: Cloudflare Worker `tna-atendimento` (`site/`). Deploy: `npx wrangler@4 deploy` dentro de `site/` com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` do `.env` da raiz.
- Testes do banco (PGlite, sem dado real): `node --test atendimento-whatsapp/tests/banco.test.mjs` na raiz do repositório. Com `ATD_FIXTURES=arquivo.json` o teste também grava as respostas das funções, útil pra abrir a tela com backend simulado.

## Como funciona

```
NeoGo (Message + Receipt) ─> Edge Function atendimento-webhook ─> atendimento.mensagens
pg_cron a cada 5 min      ─> atendimento-transcrever: baixa a mídia do WhatsApp, decifra (mediaKey),
                             transcreve o áudio (gpt-transcribe) e descreve a foto (GPT-6.1 Terra)
pg_cron 04:00 (Brasília)  ─> atendimento-ia enviar: lote da OpenAI (Batch API) com o checklist dos atendimentos que mudaram
pg_cron a cada 30 min     ─> atendimento-ia coletar: grava em atendimento.classificacoes quando o lote termina
pg_cron terça 08:00       ─> atendimento.fechar_semanas(): congela a semana anterior (com a nota) em atendimento.semanas
Tela (admin)              ─> atendimento-usuarios: cria login e libera acesso
```

- Webhook por unidade: `/functions/v1/atendimento-webhook?c=<slug>&t=<url_token>`. O token autentica. A primeira instância que manda evento fica presa à unidade (`instance_id`).
- O navegador não lê tabela nenhuma: só funções `public.atendimento_*`, que conferem o papel do usuário (`privado.atendimento_ve_conta`, `privado.atendimento_gere_rede`, `privado.atendimento_eh_admin`) e, com 2FA cadastrado, sessão aal2.
- As Edge Functions de rotina conferem o header `x-cron-secret` com `public.atendimento_cron_ok()`, que nunca devolve o segredo (Vault `atendimento_cron`).
- Chave da OpenAI: segredo `OPENAI_API_KEY` das Edge Functions. Sem ela, áudio e foto ficam pendentes e a IA não roda; a tela mostra o aviso.
- Modelos trocáveis por segredo: `ATENDIMENTO_MODELO_IA` (padrão `gpt-6.1-terra`), `ATENDIMENTO_MODELO_TRANSCRICAO` (padrão `gpt-transcribe`), `ATENDIMENTO_MODELO_IMAGEM` (padrão: o mesmo da IA).
- `mensagens.bruto` guarda o payload sem miniaturas por 30 dias, pra conferir mapeamento.

## Rede, acessos e nota (0006)

- **Rede e unidades:** `atendimento.redes` guarda metas, pesos da nota, diferenciais e "o que está incluso" (textos que a IA usa). Cada unidade (`contas`) tem rede, horário, mensagens automáticas e o próprio webhook.
- **Papéis** (`atendimento.usuarios.papel`): `admin` (The New Ads) vê tudo, conexão, OpenAI e usuários. `rede` (dono) vê as unidades da rede e ajusta metas, pesos, textos e horário. `unidade` (equipe) vê só a própria unidade e não configura nada; o webhook nunca aparece pra ela.
- **Nota de 0 a 100 por unidade** (`atendimento.nota`, chamada no fim de `calcular`), com cinco partes e pesos ajustáveis:
  - **Agilidade** (25): 1ª resposta mediana e respondidos em 24h.
  - **Condução** (30): entendeu o caso, explicou o que está incluso (de quem recebeu preço), falou de diferencial, chamou pra trazer a peça.
  - **Compromisso** (25): firmou compromisso (dia combinado) e relembrou depois que a data passou.
  - **Retorno** (15): retorno de orçamento sem resposta.
  - **Formato** (5): mensagens em áudio até o limite.
- **Pontos de cada indicador:** 100 na meta, 0 no piso, proporcional no meio (`atendimento.pontos`). Pisos: 1ª resposta 120 min (ou 4× a meta), 24h em 60% (ou meta menos 20), áudio em 70% (ou meta mais 30), o resto em 0%.
- **Regras de amostra:**
  - indicador com menos de 3 casos fica sem nota;
  - parte sem dado sai e os pesos das outras são redistribuídos;
  - semana com menos de 10 atendimentos sai marcada como amostra pequena.
- **Checklist da IA** (versão 2, `classificacoes.versao = 2`): tipo (oportunidade, acompanhamento, recrutamento, outro), serviço, passou preço, entendeu, incluso, diferencial, convite, compromisso com data, relembrou (`sim`, `nao`, `aguardando`, `nao_se_aplica`), cliente cobrou andamento.
  - A IA responde sim ou não com o trecho e não dá opinião.
  - Leitura antiga (versão 1) é relida.
  - Compromisso `aguardando` cuja data passou é relido uma vez.
- **Modo balcão:** oportunidade que a loja respondeu sem chamar pra loja nem firmar compromisso.
- **Fotos:** o webhook guarda `mediaKey` e `directPath` da `imageMessage`; `atendimento-transcrever` decifra com HKDF "WhatsApp Image Keys" e grava a descrição em `transcricao`.
- **Histórico importado:** `atendimento.fechar_semanas_desde(data, refazer)` fecha as semanas passadas. Rodar com `refazer = true` depois que a IA ler o histórico.

## Regras de tempo e contagem (0003)

- **Atendimento:** conversa com um contato; um novo começa depois de 8 dias sem mensagem.
- **1ª resposta:** primeira mensagem do cliente até a primeira da loja, em minutos com a loja aberta (`minutos_uteis`). Reação com emoji e mensagem automática não contam como resposta.
- **Durante a conversa:** demais esperas do cliente, sem contar "ok", "obrigada", emoji e figurinha.
- **Orçamento:** mensagem da loja com valor em reais, em texto ou áudio transcrito.
- **Retorno:** nova mensagem da loja 12h ou mais depois, sem o cliente ter respondido; D+1 até 36h, D+3 até 84h, D+7 até 180h.
- **Recrutamento:** contato com vaga, currículo, emprego ou salário (palavra ou IA) sai de todas as contas.
- **Viu e não respondeu:** recibo `read-self` e mais de 30 min de loja sem resposta.
- **Contato sem número (LID):** guardado como `lid:<id>` e juntado ao telefone quando o WhatsApp revela os dois.
- **Números extras:** tempo até o preço, chegou com a loja fechada (resposta depois de abrir), recorrentes e mensagens por atendimento.

## Histórico pelo WhatsApp Web (antes da NeoGo)

A extensão do Claude no Chrome lê o WhatsApp Web da loja (sem abrir não lida, sem tocar áudio) e devolve lotes JSON Lines, guardados em `clientes/<unidade>/whatsapp-web/lote-NN.jsonl` (fora do Git).

- **Importar:** `node atendimento-whatsapp/ferramentas/importar-whatsapp-web.mjs <pasta> <slug> > saida.sql` e rodar o SQL (só INSERT, passa pelo `execute_sql`). Sempre reimporta todos os lotes: o `wa_id` é fixo por mensagem, então nada duplica.
- **Slugs:** `sapataria-nacoes`, `sapataria-tiete`, `sapataria-analia-franco`.
- **Qual linha vale:** a coleta completa mais recente de cada contato. Linha "parcial" (prévia de conversa não lida) só entra se não houver coleta completa ou se for mais nova. `hora_incerta` é descartada.
- **O que falta nessas mensagens:** são marcadas com `bruto.origem = 'whatsapp_web'` e não têm recibo de leitura, conteúdo de áudio nem conteúdo de foto.
- **Corte:** quando a NeoGo for conectada, importar só até o dia anterior à conexão.

## Mensagem automática (0005)

A saudação do anúncio da Meta ("Oi! Como podemos ajudar?") sai no mesmo minuto em que o cliente escreve.

- Fica guardada (`mensagens.automatica`), marcada por gatilho a partir de `contas.textos_automaticos`, que é editável na tela por unidade.
- Não conta como resposta nem entra nas contas.
- Sem isso, todo lead de anúncio aparecia respondido em 0 min.

## Estado em 12/11/2026

- **O que está no ar:**
  - `0001` a `0004` aplicadas.
  - Edge Functions novas publicadas: webhook v3, transcrever v2, ia v2 e usuarios v1.
  - Tela nova publicada. Enquanto o banco não tiver o 0006, ela mostra o aviso "banco ainda não recebeu a atualização".
- **Pendente do Douglas:**
  - Rodar `supabase/aplicar-0005-e-0006.sql` no SQL Editor (tem UPDATE, o `apply_migration` recusa).
  - Criar a chave da OpenAI.
  - Conectar as 3 unidades na NeoGo.
  - Validar com a Renita os diferenciais e o que está incluso (hoje é rascunho tirado dos briefings).
  - Liberar os acessos (Renita e equipes) na tela.
- **Histórico importado:** 136 mensagens da Nações vindas do WhatsApp Web, de 21/10 a 12/11. A coleta continua em lotes.
- **Conferir na primeira mensagem real:** se a NeoGo manda `Receipt` com `read-self` e se `audioMessage`/`imageMessage` trazem `mediaKey`/`directPath`. O mapeamento foi feito pelo protobuf do whatsmeow, sem amostra real de mídia.
- **Atenção:** reconectar o número da Nações religa o fluxo n8n "Trackeamento de Mensagem Nações Shopping", que ainda grava planilha e Supabase em paralelo.
