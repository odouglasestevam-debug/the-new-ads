# Analytics do funil: implementação e método

Implementação de 11/09/2026, baseada em `funil-tna-briefing.md`. Rota preservada: `/funil/analytics`, acessível pelo item Analytics do CRM.

## Organização

- **Visão geral:** investimento, leads, CPQL, valor contratado, aquisição semanal, cadeia de custos e pontos de atenção.
- **Funil e conversão:** sequência por visitante, seis perguntas, telefone, conclusão, agenda, resultados do CRM e hipóteses de referência.
- **Nichos e qualidade:** investimento, CPL, CPQL, reuniões e CAC por nicho; intervalos de qualificação, probabilidade exploratória e matriz faturamento × verba.
- **Mídia e criativos:** CTR, CPC, CPM, atribuição, anúncios com busca e ordenação, posicionamentos e horários de captação.
- **Comercial e receita:** pipeline, presença, coortes semanais, tempo mediano de passagem e cenário de viabilidade com fee, duração e margem editáveis.
- **Qualidade dos dados:** cobertura de associação, lacunas, divergência de qualificação e dicionário de métricas.

Filtros de nicho, 7/28/56/90 dias, todo o histórico e datas personalizadas acompanham as seções. A URL preserva a seleção. Exportações CSV informam base, período, nicho e data de observação; não incluem contatos pessoais.

## Correções metodológicas

1. **ID antes do nome.** `source_id` da mídia associa a `ad_id` do lead, como string. Nome só é fallback se o ID estiver ausente e a correspondência for única. IDs sem correspondência não são silenciosamente substituídos por nomes.
2. **Gasto sem resultado continua visível.** Nicho é identificado pelas evidências do anúncio na base selecionada. Sem evidência, o mapeamento AD01/02, AD03/04, AD05/06 vem do briefing. Conflitos e anúncios desconhecidos permanecem no total, em categoria própria. Não há rateio arbitrário de mídia.
3. **Custo de aquisição usa resultado atribuído.** CPL/CPQL/CAC dividem investimento pelos respectivos leads associados a anúncios com mídia no recorte. Leads sem correspondência aparecem no volume e na qualidade, mas não diluem o custo pago. A ausência de gasto ou denominador aparece como indisponível.
4. **Reuniões têm duas unidades.** Custos usam leads únicos com reunião não cancelada ou realizada. No-show usa agendamentos resolvidos: `no_show / (realizada + no_show)`. Reagendamento não duplica um lead no funil, e uma reunião pendente não vira ausência automaticamente.
5. **Qualificação não equivale a faturamento.** Há dimensões separadas para qualificação pela regra atual, faturamento ≥ R$ 70 mil, desqualificação e perfil ainda não informado.
6. **Coortes consistentes.** O CRM seleciona leads pela criação e acompanha desfechos posteriores até a atualização. A jornada seleciona visitantes pela primeira visita conhecida e acompanha os mesmos visitantes, em sequência. Não calcula uma passagem misturando cliques Meta, navegadores e registros de lead.
7. **Fuso fixo.** Datas de aquisição e horários usam `America/Sao_Paulo`. A comparação anterior ocupa uma janela adjacente do mesmo tamanho; não se aplica a “Tudo”.
8. **Contrato não é caixa.** Valor negociado explícito prevalece sobre fee × duração. Sem informação, o contrato fica sinalizado. Retorno contratado/mídia não é lucro, LTV nem receita recebida; fees de contratos conquistados não equivalem a MRR ativo.
9. **Incerteza explícita.** Taxas exibem base e Wilson de 95%. A comparação exploratória de qualificação usa Beta(1,1), Monte Carlo reproduzível. Não afirma superioridade de rentabilidade a partir de poucos contratos. Referências do briefing são hipóteses, sem causalidade presumida.
10. **Real e simulado não se somam.** Seleção mutuamente exclusiva, com aviso em tela e identificação no CSV. Nenhuma simulação é gerada na aplicação de produção.

## Arquitetura

Site estático, sem etapa de build ou novas dependências. `analytics.html` carrega:

- `analytics.css`: identidade visual, layout e adaptação responsiva.
- `analytics.mjs`: Supabase Auth, carregamento paginado, filtros, navegação, gráficos, tabelas e exportação.
- `analytics-core.mjs`: regras puras de recorte, atribuição, métricas, coortes, estatística e qualidade.
- `analytics-config.mjs`: URL e chave pública já existentes. Nenhuma chave de serviço é exposta.

Chart.js permanece na versão 4.4.1. O painel exige sessão e verificação MFA quando configurada. Não modifica tabelas, políticas, registros ou eventos de marketing. Carrega as cinco fontes com ordenação estável; uma falha de fonte não é convertida em zeros. Na falha de atualização, mantém a consulta anterior com aviso.

## Validação e limites

Execute `node --test tests/funil-analytics.test.mjs`. Os testes cobrem ID/nome, mídia sem conversão, atribuição ausente, reagendamento, no-show, contratos posteriores, valor negociado, fuso, sequência de eventos, simulação, qualificação e reconciliação de totais.

A verificação local em Chromium usa exclusivamente `tests/funil-analytics.fixture.mjs`, interceptando a biblioteca de autenticação no teste. O aplicativo não contém bypass de login. Foram exercitadas as seis seções em desktop e celular, filtros, busca, ordenação, CSV, entradas inválidas, erro de conexão e estados de autenticação.

O MCP não estava exposto às ferramentas desta conversa durante a implementação. Portanto, o esquema foi baseado no briefing e no código existente; a consulta autenticada das cinco fontes no ambiente publicado precisa ser conferida com a sessão do proprietário. Nenhuma alteração foi publicada automaticamente.

A carga paginada no cliente é adequada ao volume descrito. Com crescimento expressivo de eventos, o próximo passo é agregar e paginar no servidor mantendo o mesmo contrato de métricas. O painel não soma alcance nem calcula frequência agregada sem deduplicação. Visitante é identidade por navegador, e o histórico só revela eventos efetivamente registrados.
