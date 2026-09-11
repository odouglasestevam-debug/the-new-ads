# Alternativa de landing page: tráfego pago

Criada em 2026-09-09 a pedido de Douglas: analisar `thenewads.com.br/trafego-pago` e criar uma versão própria, preservando a copy do hero. Esta alternativa não substitui a versão original e não foi publicada no Cloudflare.

## Arquivos e prévia

- Página: `the-new-ads-site/trafego-pago-codex.html`.
- Estilos e comportamento: `the-new-ads-site/assets/trafego-codex/page.css` e `page.js`.
- Logo: `the-new-ads-site/assets/trafego-codex/logo.svg`, cópia exata do SVG oficial.
- Retrato e logos de clientes reaproveitados dos arquivos existentes.
- Prévia local: `http://127.0.0.1:4179/trafego-pago-codex`.
- Reiniciar a prévia a partir da raiz: `node trabalho/landing-codex/serve.cjs`.
- Sistema visual desta variante: `DESIGN.md` e respectivo sidecar nesta pasta. Não é uma alteração do guia global da marca.

O servidor local serve apenas arquivos e não grava leads. O formulário da prévia local exibe erro recuperável se alguém tentar enviá-lo fora dos testes simulados. APIs e agendamento reais só podem ser validados em um ambiente com as Functions configuradas.

## Diagnóstico da versão anterior

A análise incluiu código local e a página pública em Chromium. A página repetia explicações em várias grades semelhantes, exibia três depoimentos com nomes genéricos e mantinha um placeholder no lugar da foto. Bullets do hero reduziam a fonte para caber em uma linha no celular. O formulário não aguardava o envio inicial antes de completar o lead e não apresentava falhas de rede.

## O que mudou

- Hero preservado em título, quatro benefícios, texto do botão e filtro de faturamento. Apenas composição, estilo e ícones decorativos mudaram.
- Retrato real de Douglas em destaque no desktop; identificação com foto compacta na seção do responsável também no mobile.
- Logos reais em grade estática, sem repetição animada.
- Explicação interativa em quatro etapas: anúncio, conversa, qualificação e venda. Conteúdo qualitativo, sem métricas inventadas.
- Entregáveis em linhas editoriais, contato com o responsável, critérios de encaixe e FAQ.
- Retirada dos depoimentos genéricos e das métricas sem comprovação fora do hero. As alegações do hero ficaram intactas por determinação expressa do usuário.
- Layout responsivo, títulos equilibrados, alvos de interação maiores, foco visível, link de salto, tabs com teclado, FAQ nativo e diálogo nativo com restauração de foco.
- Formulário reorganizado em três etapas, mantendo os seis campos e os valores esperados pela integração existente.
- POST de contato aguardado antes da atualização final; uso do mesmo `lead_id`; falhas explícitas com nova tentativa; campos bloqueados durante envio e estado pendente preservado ao fechar/reabrir.
- Primeiro envio respeita a janela antirrobô de 3 segundos da API atual, inclusive no preenchimento automático.

## Contrato de integração preservado

- Endpoint: `/api/lead`.
- Origem: `landing-the-new-ads`.
- Campos: `nome`, `email`, `telefone`, `empresa`, `faturamento`, `verba`.
- Eventos: `IniciouFormulario`, `Lead`, `CompletouFormulario`; `event_id` compartilhado entre contato do navegador e API.
- UTMs, parâmetros extras, click IDs, cookies `_fbp`/`_fbc`, referrer, URL, honeypot `empresa_site` e `tempo_ms`.
- Contatos qualificados seguem para `/agendar` com nome, e-mail, telefone e `lead_id`.
- Fora do perfil: WhatsApp oficial `5548996936361`, com mensagem codificada por `encodeURIComponent`.
- GTM `GTM-WPWMMR3S` carrega apenas nos domínios de produção; prévias locais ou branches não contam como visitas de produção.
- Página alternativa com `noindex, nofollow` e canonical da página original. Rever esses metadados se a variante virar a rota principal.

## Verificação

Capturas e scripts de verificação estão em `trabalho/landing-codex/`, pasta de trabalho ignorada pelo Git.

- Copy do hero comparada por código com a página original, ignorando somente ícones `aria-hidden`: idêntica.
- Larguras 320, 390, 768, 1024 e 1440 px: sem overflow horizontal e sem imagens quebradas.
- Sem erros de JavaScript nos cenários executados.
- Tabs por clique e teclado, FAQ, Escape, retorno de foco, campos inválidos e movimento reduzido.
- Contato seguido de atualização final com o mesmo ID, UTMs e pareamento do `event_id`.
- Fluxo qualificado, fluxo de menor faturamento/verba, falha de rede seguida de nova tentativa, conteúdo de nome tratado como texto no DOM desta página.
- Reabertura com POST pendente, bloqueio de edição durante envio, uma única requisição de contato e janela antirrobô.
- Todas as gravações interceptadas com mock. Nenhum lead real criado e nenhum agendamento efetuado.
- Detector Impeccable: `[]` em passagem única.
- Revisão visual independente: `ship`; dois achados resolvidos, ícone do CTA e composição do retorno da jornada no mobile.

## Pontos existentes para continuidade

1. **Regra de qualificação:** a implementação existente só desqualifica faturamento abaixo de R$ 70 mil **e** verba até R$ 1 mil ao mesmo tempo. A copy diz exclusivo a partir de R$ 70 mil. A regra foi preservada; harmonizar exige uma decisão de negócio.
2. **Correção de contato:** a API existente atualiza apenas empresa e qualificação quando recebe `lead_id`. Após salvar o contato, a variante mantém esses três campos como somente leitura para evitar divergência entre banco e agenda. Uma edição real exige ampliar o contrato da API.
3. **Idempotência:** aguardar o envio resolve a corrida normal entre contato e conclusão. Timeout depois de uma gravação efetiva ainda pode duplicar contato numa nova tentativa, porque a API não oferece idempotência pelo `event_id`.
4. **Segurança da agenda existente:** `agendar.html`, em `renderPassoConfirmacao`, interpola parâmetros da URL diretamente em atributos de inputs via `innerHTML`. O DOM desta variante usa `textContent` e omite parâmetros de preenchimento automático que contenham delimitadores HTML/aspas duplas ou controles. Nesses casos o visitante preenche o campo diretamente na agenda. Isso protege a transição da variante, mas a agenda ainda precisa escapar os valores ou atribuí-los via `.value` para proteger acessos diretos por outras URLs. Não foi alterada por ser arquivo compartilhado em andamento. Corrigir antes de promover o fluxo completo a produção.
5. **Fontes no contexto:** `PRODUCT.md` ainda cita Space Grotesk/Inter; o guia de marca mais recente usa Clash Display/Switzer. A variante segue `marca/design-guide.md`. Não alterei contexto global.

## Publicação futura

Nenhum deploy, commit ou push foi executado nesta tarefa. Para publicar, revisar o conjunto de alterações com Claude e seguir `.claude/skills/publicar-site/SKILL.md`: deploy de site completo, executado dentro da pasta correta para incluir `functions/`. Não publicar uma pasta contendo apenas esta landing na branch de produção. Preferir primeiro um deployment de preview do conjunto revisado.
