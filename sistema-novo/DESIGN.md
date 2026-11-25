---
name: CRM The New Ads
description: Atendimento no estilo do WhatsApp Web, tema claro, verde do WhatsApp nas ações.
colors:
  fundo: "#f0f2f5"
  painel: "#ffffff"
  barra: "#f0f2f5"
  linha: "#e9edef"
  linha-forte: "#d1d7db"
  texto-forte: "#111b21"
  texto-medio: "#54656f"
  texto-fraco: "#667781"
  verde: "#00a884"
  verde-escuro: "#008069"
  verde-claro: "#d9fdd3"
  verde-aviso: "#25d366"
  azul-lido: "#53bdeb"
  vermelho: "#d42a3c"
  chat-fundo: "#efeae2"
  trilho: "#1f2c34"
  ambar: "#FF6A00"
typography:
  body:
    fontFamily: "Segoe UI, Helvetica Neue, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.45
  titulo-tela:
    fontSize: "22px"
    fontWeight: 600
  nome-conversa:
    fontSize: "16px"
  balao:
    fontSize: "14.2px"
rounded:
  balao: "8px"
  campo: "8px"
  chip: "16px"
  botao: "24px"
  cartao: "10px"
---

# Design System: CRM The New Ads

## Overview

**Norte: "Parece o WhatsApp Web que a equipe já usa"** (pedido do Douglas em 24/11/2026, com print do WhatsApp Business da Confiança como referência).

Tema claro único. A fonte das regras é `site/public/crm.css`, que substituiu `app.css` e `workspace.css`; toda cor sai de uma variável em `:root`. O âmbar da The New Ads fica só no símbolo do trilho e no login; ações, seleção e foco usam o verde do WhatsApp. Respostas rápidas acima do campo de mensagem foram pedidas para uma próxima rodada.

**Key Characteristics:**

- Trilho escuro de ícones com rótulo embaixo (Conversas, Kanban, Leads, Ajustes); avatar e Sair no pé. No celular vira barra de baixo branca, com o item ativo numa pílula verde-clara.
- Barra branca no topo: empresa e papel à esquerda, abas de etapa no meio (só em Conversas), Online/Ocupado à direita.
- Conversas é a tela inicial: lista, chat e dados do contato como no WhatsApp Web.
- Números de não lidas em verde; no trilho só aparece contador de não lidas.

## Colors

**Superfícies.** `fundo` cinza-claro nas telas de trabalho, `painel` branco em lista, cartões, tabelas, gavetas e modais, `barra` no cabeçalho do chat e no composer. `linha` separa regiões; `linha-forte` contorna campos e botões secundários.

**Verde.** `verde` para botão principal, enviar e seleção; `verde-escuro` para texto de link, aba ativa e foco de teclado; `verde-claro` para chip ativo, aba de etapa ativa e balão enviado; `verde-aviso` para contadores de não lidas.

**Conversa.** `chat-fundo` bege com textura própria em SVG (desenho original, não a do WhatsApp). Balão recebido branco, enviado `verde-claro`, ambos com sombra fina.

**Etapas.** Cada etapa tem uma cor em `ETAPAS` (`js/core.js`), escolhida para fundo claro. Vira ponto no quadro e nas abas e etiqueta tingida (`color-mix`) na lista de conversas.

**Estados.** `vermelho` só para erro e "Não enviada", sempre com texto. `azul-lido` só nos ✓✓ de mensagem lida.

**The Cor por Função Rule.** Verde é ação e atendimento; âmbar é só marca. Pendência, falha e entrega são comunicadas por texto além da cor.

## Typography

Fonte do sistema operacional (Segoe UI no Windows, San Francisco no iPhone, Roboto no Android), como o WhatsApp Web; a Switzer saiu. Título de tela 22px peso 600; nome na lista de conversas 16px; prévia 14px; balão 14.2px; horário e metadados 11 a 12.5px com números tabulares. Monoespaçado só em UTM, código e chave.

**The Leitura Contínua Rule.** Ênfase para nomes e ações; mensagem em caixa normal, preservando quebras de linha.

## Layout

Trilho de 76px. Barra do topo com 60px de altura mínima, presa no alto ao rolar. Telas comuns com margem de 26px por 28px. Conversas ocupa a altura da janela: lista com `minmax(330px, 30%)`, chat com o resto; com dados do contato aberto, `minmax(300px, 27%)`, chat e 340px. Entre 861 e 1200px os dados do contato se sobrepõem à direita com 320px.

Até 860px: uma região por vez (lista ou chat), trilho vira barra de baixo de 64px mais área segura, barra do topo some quando o chat está aberto e, na lista, mostra só as abas de etapa (empresa e disponibilidade ficam no seletor do conteúdo e em Ajustes). A área de Conversas desconta a barra de baixo e não cresce com o histórico (`flex:none` na coluna).

Abas de etapa rolam dentro da própria faixa, com a borda direita esmaecida para indicar que há mais. Mensagens ocupam até `min(65%, 560px)` (85% no celular).

**The Uma Região no Celular Rule.** Lista, chat e detalhes são etapas distintas no celular, com o campo de mensagem sempre acima da barra de baixo.

## Elevation & Depth

Profundidade por tom e linha. Sombra fina (`0 1px .5px`) só em balões, separador de data e cartões do quadro; sombra larga só no que se sobrepõe (gaveta, modal, menu de filtros, dados do contato em tela média). Foco de teclado: contorno de 2px `verde-escuro` afastado 2px.

## Shapes

Balões com 8px e rabicho no primeiro balão de cada sequência. Campos com 8px. Chips, abas de etapa, filtros e botões secundários em pílula (16 a 18px). Botões principais em pílula de 24px. Cartões do quadro e blocos de ajustes com 10 a 12px. Avatares circulares com iniciais em cor clara fixa por nome.

## Components

**Buttons.** Ação principal em pílula verde, texto branco, altura mínima de 40px; hover escurece o verde; desabilitado usa .5. O botão fantasma é branco com contorno cinza e texto verde-escuro. Enviar é um círculo verde de 42px com ícone de avião de papel e nome acessível "Enviar". Controles auxiliares usam texto secundário; os mínimos variam por contexto, portanto não há um tamanho de toque universal validado.

**Inputs / Fields.** Campos de formulário usam superfície elevada, borda fina, fonte 14px e espaçamento de 11px por 12px. A busca de leads tem ícone e altura de 42px; busca da lista de conversas mantém raio 7px e fonte 13px. O composer usa superfície mais clara, fonte 14px e altura mínima de 44px, crescendo até 160px. Foco de teclado permanece explícito mesmo nos campos sem borda. Placeholder não substitui nome acessível.

**Navigation.** Trilho vertical escuro no desktop, com ícone e rótulo embaixo; item ativo com fundo levemente claro e ícone verde, `aria-current="page"`. No celular vira barra inferior branca, itens distribuídos igualmente e o ícone ativo numa pílula verde-clara. As regras valem só para `#nav`: o submenu de Ajustes também é um `<nav>` e não pode herdá-las. O link Ir para o conteúdo aparece ao receber foco.

**Chips.** Filtros da conversa são pílulas cinza quando inativas e verde-claras com texto verde-escuro quando selecionadas, com `aria-pressed`. As abas de etapa da barra do topo seguem o mesmo padrão, com contador em verde, e só aparecem quando a busca do banco devolve `por_etapa` (migration 0031). Responsável e canal ficam em `details` recolhível, aberto quando há filtro aplicado. Leads e quadro usam segmentos de responsabilidade com seleção cinza, preservando a distinção entre filtros comerciais e atendimento.

**Agenda.** Mensagem agendada é um balão de saída com borda pontilhada verde e fundo verde bem claro, sem a ponta do balão, no fim do chat, abaixo do separador "Agendadas"; o selo diz quando sai ("Sai amanhã às 09:00"). Não saiu: mesmo balão em vermelho-claro com o motivo. Lembrete usa âmbar (fundo `#fff1c2`, texto `#7f5a00`) para não competir com o verde das mensagens; passou do horário vira laranja. Escolha de horário sempre com atalhos em chip (Daqui a 1 hora, Hoje às 18:00, Amanhã às 09:00, Amanhã às 14:00, Segunda às 09:00) e os campos Dia e Hora embaixo, com a frase "Marcado para ..." confirmando.

**Faixa de aviso.** No topo da lista de Conversas, como a do WhatsApp Web: fundo azul-claro, círculo `azul-lido` com sino, título, uma linha de explicação, ação em texto verde-escuro e um X "Agora não" que esconde por 7 dias no aparelho. Uma faixa por vez, nesta ordem: instalar (iPhone fora da tela de início), notificação bloqueada, ativar notificações, instalar (Chrome). Recado de confirmação em cápsula escura no rodapé, acima da barra de baixo no celular.

**Cards / Containers.** Cards comerciais são brancos sobre a coluna cinza do quadro, com sombra fina que cresce no hover. Nome acionável, contato, origem, responsável e seletor de etapa organizam o conteúdo; selos de cadastro aparecem quando pertinentes. A conversa usa painéis contínuos; não herda a composição de cards do kanban.

**Distribution controls.** Agência e dono configuram a automação em Ajustes → Distribuição. As três opções usam radios nativos com legenda, nome e explicação; participantes usam checkboxes nativos com nome, papel, demanda e estado textual. Contas de leitura não participam. O título do painel usa 20px; opções usam 14px e descrições e linhas da equipe usam 13px. Números de demanda são tabulares; Disponível, Pausado e Offline permanecem legíveis sem depender de cor. Fila rotativa entrega mesmo com o participante pausado ou offline; Menor demanda exige disponibilidade e conexão e exclui Cliente e Perdido da contagem. O bloco da regra acompanha a escolha e explica rodízio, empate e espera sem participante elegível.

**Explicit save and feedback.** Alterar modo ou participantes cria um rascunho com aviso Alterações não salvas; Salvar distribuição e Descartar alterações ficam ativos apenas quando há mudança. Atualizar situação fica bloqueado enquanto o rascunho existe. Durante uma operação, os controles envolvidos ficam indisponíveis e o texto informa o progresso. Falha ao atualizar preserva a consulta anterior e identifica os dados como antigos; erro inicial oferece Tentar novamente. Conflitos de revisão ou equipe orientam descartar e atualizar antes de salvar. Alterações de controles preservam o foco; salvar e descartar devolvem foco ao título, e atualizar devolve ao acionador. O acompanhamento informa pendentes e últimas entregas como a situação da última consulta.

**Personal availability.** O mesmo controle de disponibilidade é compartilhado pela lateral e pela aba de Ajustes. Seu texto combina estado e próxima ação, com `aria-pressed`; a descrição explica participação, modo e conexão. Falha de presença oferece Reconectar disponibilidade e não confirma conexão. Pausar interrompe novas entregas por Menor demanda, preservando os leads atuais; a fila rotativa ignora a pausa. Mensagens de disponibilidade e salvamento usam regiões de status; o aviso de dados antigos usa alerta.

**The Estado Confirmado Rule.** Distinga rascunho, configuração salva, disponibilidade confirmada e dados da última consulta; preserve o foco quando um controle redesenha o painel.

**Shared lead filters.** Lista e quadro compartilham busca, Todos/Meus leads/Sem responsável, etapa, cadastro incompleto e ordenação por mais recentes ou nome. Sem responsável depende da permissão de distribuir leads. Mais filtros agrupa cadastro e ordenação; Limpar filtros oferece retorno ao conjunto completo. A busca comercial percorre os leads carregados, incluindo dados de origem, e é distinta da busca remota do histórico de conversas. Etapa e responsável têm seletores contextuais conforme permissão; arrastar o card é alternativa ao seletor, não a única maneira de mover um lead.

**Lead drawer and dialogs.** A ficha usa gaveta de até 500px, com cabeçalho separado e abas para conversa, anotações, origem e dados. Modais e gavetas recebem nome acessível, `role="dialog"` e `aria-modal`; Tab permanece nos controles do diálogo. Ao fechar o último diálogo, o foco retorna ao acionador conectado ou ao conteúdo principal. Filtros restauram o foco após redesenho quando previsto pelos eventos.

**Conversation.** A lista combina avatar, nome, horário, prévia, quantidade não lida e estado sem resposta. A busca por nome, número ou conteúdo consulta o histórico completo armazenado e acessível ao usuário pela RPC `buscar_conversas_crm`, executada com as permissões do usuário e RLS. Resultados são paginados, com 50 conversas por solicitação no cliente; a pesquisa não se limita à última prévia nem às mensagens já carregadas na tela. O painel de contato é recolhível e apresenta etapa, responsável, e-mail e número de atendimento, com acesso à ficha.

**Message and composer.** Metadados ficam dentro do balão, à direita: horário e, nas mensagens enviadas, relógio (Enviando), ✓ (Enviada), ✓✓ cinza (Entregue), ✓✓ azul (Lida) ou o texto "Não enviada" em vermelho. O ícone sempre leva o nome do estado em texto oculto e no título. O envio inclui imediatamente um balão local Enviando e reconcilia seu identificador com o retorno do servidor; sua presença não comprova entrega. Falha muda o balão, mostra explicação e permite recuperar o texto quando aplicável. Histórico possui carregamento, estado vazio, tentativa novamente e paginação de 50 mensagens. Rascunhos e identificadores de tentativa ficam em `sessionStorage`, separados por conta, empresa e conversa. No código, Enter envia em ponteiro preciso; Shift+Enter preserva quebra, e ponteiro de toque não envia por Enter.

A atualização em tempo real substitui a lista e as mensagens, preservando o composer, o foco e controles em edição no DOM. O rodapé é reconstruído quando muda a permissão de resposta ou a janela de atendimento. A posição de leitura é guardada por conversa em memória durante a sessão da página; novas mensagens não deslocam quem está lendo acima e oferecem a ação Novas mensagens. Esse estado em memória não implica restauração da rolagem após recarregar a página.

**Quoted reply.** No canal oficial, Responder associa uma mensagem existente à resposta de texto dentro da janela de atendimento e das permissões do lead. No desktop com ponteiro preciso, a ação aparece ao passar sobre o balão ou focar seu conteúdo; no celular fica visível no fluxo. O composer mostra a referência e Cancelar resposta. No histórico, a referência é um bloco de texto de 12px com borda lateral discreta e altura máxima de 80px; o texto da resposta mantém sua hierarquia principal. O backend confere que a mensagem citada pertence à mesma empresa e conversa antes de enviar `context.message_id`. Essa função não está disponível no canal NeoGo e não foi validada com provedor real.

O composer depende da permissão do lead e da janela implementada para o canal oficial. Quando fechada, o texto livre é substituído por orientação sobre modelo aprovado. Modelos e anexos têm interfaces de carregamento, confirmação de ação e erro; a resposta de modelo pendente informa que aguarda o provedor. O webhook oficial agora tenta armazenar a mídia recebida assim que registra a mensagem, antes da abertura do arquivo na interface. A leitura local solicita também o recibo oficial pela função `whatsapp-lida`; falha dessa solicitação não equivale à confirmação do provedor. A presença dessas interfaces e funções não comprova suporte completo a todos os modelos, mídias ou recursos do WhatsApp Web, nem envio real pela NeoGo. Armazenamento de mídia, recibo oficial e demais operações dos provedores ainda dependem dos testes reais pendentes.

**Template preview.** A prévia textual do modelo aprovado se atualiza conforme o operador preenche suas variáveis. Valores ainda vazios mantêm o marcador do modelo. O texto preserva quebras de linha e fica em superfície escura recuada, com raio de 6px; visualizar o conteúdo não confirma envio ou aprovação de um novo modelo.

**Connection diagnostics.** Em Ajustes, o diagnóstico oficial separa token salvo de token validado e apresenta validade/expiração, permissões de envio e modelos, inscrição de webhook, última entrada, qualidade do número e último teste, incluindo o erro quando disponível. Dados não conferidos ou consultas indisponíveis têm rótulos explícitos. O teste consulta a conexão sem enviar mensagem; webhook inscrito e teste positivo não substituem comprovação de recebimento e entrega. Diagnóstico e guia Como conectar este número usam `details`/`summary` nativos; o guia fica disponível sob demanda junto ao formulário. O screenshot móvel documenta esses estados com dados fictícios.

**Team recovery.** Na equipe, a ação se chama Enviar recuperação. O servidor solicita o e-mail de recuperação diretamente ao titular da conta e retorna o resultado da solicitação, sem entregar um link de recuperação ao administrador. A interface deve manter essa distinção entre solicitar o e-mail e comprovar que o titular o recebeu; entrega real do e-mail não foi validada neste registro.

Transições de botões e abas duram .18s para fundo, texto e borda; a base conserva .15s em outros controles. A preferência por movimento reduzido desliga transições, animações e rolagem suave; o seletor Ir para etapa também escolhe rolagem imediata. O histórico usa `aria-live="off"`: não se presume que mensagens novas sejam anunciadas automaticamente por leitor de tela.

## Do's and Don'ts

### Do:

- **Do** aplicar a cascata atual de workspace ao reutilizar componentes da base.
- **Do** manter nomes de ações, filtros e estados em português claro.
- **Do** preservar foco visível e explicar restrições junto ao composer.
- **Do** manter o histórico rolável e o composer acima da navegação móvel.
- **Do** manter busca e filtros consistentes entre lista e quadro e oferecer seletor como alternativa ao arrasto.

- **Do** distinguir rascunho de configuração salva e identificar dados antigos quando uma atualização falhar.
- **Do** restaurar o foco após redesenhar controles e manter o link de salto fora do conteúdo quando não estiver focado.

### Don't:

- **Don't** tratar configuração, conexão e entrega de mensagem como o mesmo estado.
- **Don't** apresentar fixture ou screenshot como prova de conexão real.
- **Don't** usar a seleção de cor como único indicador de falha ou entrega.

- **Don't** tratar pausa e ausência de conexão como impedimento da fila rotativa.

Não canonizado: valores avulsos de paleta, tamanho e raio não entram no sistema para silenciar o detector. Alvos compactos e defeitos de sobreposição não definem um piso de acessibilidade. Fontes de fallback e rótulos técnicos residuais não autorizam uma nova linguagem de display nem kickers decorativos. O recorte anterior de Mais filtros foi resolvido; não integra as regras do sistema.
