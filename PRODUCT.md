# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primário agora: donos e gestores de negócio local de serviço (clínicas, advogados, e segmentos similares que atendem via WhatsApp) que investem em Meta Ads e Google Ads sem saber quantos leads reais geram. Situação típica: o gerenciador de anúncio só marca "conversa iniciada" quando alguém abre o WhatsApp; gestor e agência não sabem o que acontece depois (se a pessoa mandou mensagem, foi atendida, comprou). Decisões de manter/pausar anúncio são tomadas no escuro, sem CAC real nem taxa de conversão comercial.

Outros segmentos atendidos, sem prioridade atual: B2B (ticket alto, ciclo longo), Infoprodutores (lançamento/perpétuo), E-commerce (ROAS, escala de catálogo).

## Product Purpose

The New Ads é uma agência de gestão de tráfego pago (Meta Ads e Google Ads) que trata o anúncio como sistema de venda, não aposta: tracking avançado (CAPI, Advanced Matching), criativo testado até vender de verdade, e atribuição real ligada ao WhatsApp/CRM do cliente. Sucesso = o cliente sai do achismo e passa a ver número de negócio (CAC, conversão, lucro), não métrica de vaidade de plataforma (ROAS bonito, alcance, curtida).

## Positioning

Diferente de agências que só sobem campanha e leem "conversa iniciada" no gerenciador, a the new ads constrói um banco de dados próprio: gatilhos e mensagens do próprio vendedor no WhatsApp atualizam qualificação e conversão do lead. Esse dado volta pro Meta via Advanced Matching (eventos de lead, lead qualificado, compra, enviados pela campanha de mensagens), fazendo o gerenciador otimizar com base em resultado real, não estimativa. O serviço é prestado por uma única pessoa (Douglas Estevam), sem terceirização de atendimento ou execução — contato direto com quem decide.

## Operating Context

Cliente típico atende lead via WhatsApp. Fluxo de trabalho da agência: pesquisa (concorrência, termo de busca, portfólio de criativo, mercado do cliente) → diagnóstico (números e operação atuais) → estrutura (tracking, campanha, criativo montados como sistema) → escala (otimização contínua, verba pro que performa). Reunião mensal de diagnóstico com o cliente. Contato direto com Douglas via grupo de WhatsApp, sem escalonamento pra terceiros.

## Capabilities and Constraints

Meta Ads e Google Ads, GTM/GA4/CAPI, Advanced Matching, campanhas de mensagens (CTWA) integradas via n8n gravando dados em planilha/Supabase pra tracking de lead e conversão. Presença web atual: site estático (HTML/CSS, sem framework/build step) publicado no Cloudflare Pages sob `thenewads.com.br`, com páginas em `/` (home/link-in-bio), `/trafego-pago` (landing de tráfego pago), `/trackeamento` (landing de serviço de trackeamento) e `/manual-da-marca` (brand book interno, noindex). Sem produto de software ou app próprio — é serviço de agência prestado por uma pessoa.

## Brand Commitments

Nome "the new ads". Tagline principal: "O novo padrão de mídia paga." Apoio: "Ads que vendem, não que aparecem.", "Do achismo ao previsível.", "Tráfego não é sorte. É sistema." Tom de voz: direto, concreto (número/exemplo/caso), confiante sem arrogância, português brasileiro natural. Nunca usar travessão (—). Nunca linguagem de "guru" ou promessa mágica. Cores: preto absoluto `#0A0A0A`, grafite `#171717`/`#212121`, âmbar sinal `#FF6A00` (regra 70/25/5, âmbar só como destaque pontual). Tipografia: Space Grotesk (display), Inter (corpo), JetBrains Mono (dados/labels). Símbolo da marca: "O Sinal" (triângulo de play + seta ascendente, lido como "N"). Referência completa em `marca/design-guide.md` e `marca/brand-book.html`.

## Evidence on Hand

Os números da seção de resultados do site (`R$18mi+ em mídia gerida`, `6,2x ROAS médio`, `+40 contas escaladas`, `12k leads/mês`) e os depoimentos de clientes exibidos são placeholders ilustrativos, ainda sem dado real pra substituir — não tratar como fato nem inventar novos números ou depoimentos em trabalho futuro. Logos reais de 9 clientes (Entretec, Grupo Confiança, Sapataria do Futuro, Dédalos Móveis, Vet&Pet, Regularize Imóveis, Arcan, Fátima Esportes, Grupo Murana) já estão publicados no marquee da home.

## Product Principles

1. Dado antes de achismo: toda decisão de campanha nasce de tracking real, não de estimativa de plataforma.
2. Lead de verdade é quem clicou, chamou e mandou mensagem no WhatsApp, não quem só abriu a conversa.
3. Atendimento direto, sem terceirização: Douglas executa e responde pessoalmente, sem repasse pra equipe ou script.
4. Honestidade sobre oscilação de resultado: a promessa é o Meta receber o dado certo pra otimizar, não a ausência de oscilação.
5. Segmento prioritário atual pra captação: Local/Serviço (clínicas, advogados e negócios locais que atendem via WhatsApp).
