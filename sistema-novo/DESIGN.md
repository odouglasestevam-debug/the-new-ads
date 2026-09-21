---
name: CRM The New Ads
description: Atendimento operacional com identidade grafite e âmbar e conversas em verde.
colors:
  preto: "#0A0A0A"
  grafite: "#141414"
  grafite-2: "#1c1c1c"
  nevoa: "#a3a3a3"
  texto-suave: "#b5b5b5"
  branco: "#FAFAFA"
  ambar: "#FF6A00"
  linha: "rgba(255,255,255,.09)"
  verde: "#4ADE80"
  vermelho: "#F87171"
  whatsapp: "#25D366"
  chat-fundo: "#111713"
  chat-barra: "#1c211e"
typography:
  headline:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.015em"
  body:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "Switzer, system-ui, sans-serif"
    fontSize: "13px"
    letterSpacing: "0"
  technical:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "10.5px"
rounded:
  compact: "6px"
  conversation: "8px"
  control: "9px"
  card: "10px"
  container: "12px"
  pill: "99px"
spacing:
  compact: "8px"
  control: "10px"
  regular: "12px"
  row: "14px"
  panel: "16px"
  spacious: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ambar}"
    textColor: "{colors.preto}"
    rounded: "{rounded.conversation}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "#202020"
    textColor: "#eee"
    rounded: "{rounded.conversation}"
    padding: "10px 16px"
  button-send:
    backgroundColor: "{colors.verde}"
    textColor: "#072311"
    rounded: "{rounded.conversation}"
    padding: "10px 16px"
  input:
    backgroundColor: "#202020"
    textColor: "{colors.branco}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  navigation:
    textColor: "{colors.nevoa}"
    rounded: "{rounded.conversation}"
    padding: "12px"
  chip:
    backgroundColor: "#222"
    textColor: "#bcbcbc"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  card:
    backgroundColor: "#222"
    textColor: "{colors.branco}"
    rounded: "{rounded.card}"
    padding: "14px"
  message-outgoing:
    backgroundColor: "#164437"
    textColor: "#f2faf6"
    rounded: "{rounded.conversation}"
    padding: "8px 11px"
---

# Design System: CRM The New Ads

## Overview

**Creative North Star: "Atendimento familiar ao WhatsApp Web"**

O CRM em crm.thenewads.com.br é uma interface de trabalho escura e compacta. A identidade grafite, Switzer e âmbar orienta navegação e ações gerais; a conversa recebe o verde do canal. O refinamento estende a identidade existente: encontrar o lead, entender etapa e responsável, abrir a conversa e responder. Lista e quadro compartilham controles; gráficos não foram introduzidos.

Este registro descreve o código construído em `sistema-novo`, com identidade herdada e sem novo mundo visual; seed e composição foram dispensados nesta rodada. A fonte é a cascata de `site/public/app.css` seguida de `site/public/workspace.css`, incluindo o bloco Refinamento operacional. O contrato está no primeiro comentário de `index.html`; comportamentos vêm dos módulos de leads, kanban, navegação, eventos, inicialização, conversas e integrações. Screenshots em `tests/artifacts/` de leads, kanban e conversas no desktop e celular, além de `lead-detalhe-desktop.png` e `diagnostico-mobile.png`, usam fixture fictícia: não comprovam conexão, entrega ou funcionamento de um provedor real.

A validação informada desta rodada registra teste de navegador e sintaxe JavaScript passando. A revisão de UX por `crm_ux_finish` retornou `ship` em cinco seções. A checagem final de Mais filtros foi resolvida com alinhamento à direita; a captura `tests/artifacts/leads-filtros-desktop.png`, o teste geométrico e a aplicação/limpeza do filtro passaram. O verdict final registra `remaining: Clear` e `disposition: ship`, sem regressão nas recapturas. O detector foi executado uma vez, com saída longa truncada e avisos sobre paleta, escala tipográfica e raios; não há declaração de detector limpo. Os 17/17 testes registrados anteriormente pertencem à etapa funcional anterior, sem reexecução alegada nesta rodada. Testes reais das APIs continuam pendentes. Este documento não declara o plano inteiro concluído nem substitui auditoria completa de acessibilidade.

**Key Characteristics:**

- Grafite como superfície, âmbar para orientação e verde no atendimento.
- Tipografia operacional compacta e números tabulares no histórico.
- Busca, responsabilidade e etapa consistentes entre lista e quadro.
- Lista, conversa e detalhes recolhíveis no desktop; uma região por vez no celular.
- Estados de carregamento, restrição e falha descritos em texto.

## Colors

### Primary

O **âmbar** identifica a marca, ação principal fora do composer, seleção de navegação e foco de teclado. A navegação selecionada usa âmbar claro sobre marrom escuro. Segmentos de responsabilidade ficam em cinza; filtros ativos da conversa usam verde.

### Secondary

O **verde** destaca o envio; o **verde WhatsApp** identifica contadores e estados do canal. Balões enviados usam verde profundo, com texto claro. O **vermelho** identifica erros, acompanhado de mensagem explicativa. Azul já existe nos selos de canal oficial e Meta; não representa entrega bem-sucedida.

### Neutral

**Preto**, **grafite** e **grafite 2** estruturam o aplicativo. **Branco** é o texto principal; **névoa** e **texto suave** organizam informação secundária e rótulos. **Linha** separa regiões com baixa intensidade. O histórico tem um preto esverdeado; cabeçalho e composer compartilham a superfície de barra.

**The Cor por Função Rule.** Use âmbar para orientação do CRM e verde para o atendimento; comunique pendência, falha e entrega por texto, além da cor.

## Typography

A cascata atual usa **Switzer** para corpo, controles e títulos. A definição anterior de Clash Display é substituída por `workspace.css`; não há uma escala de display editorial aplicada ao workspace. Os fallbacks de sistema são contingência de carregamento, não uma direção de display.

Títulos gerais usam o papel headline e passam a 22px no celular; Conversas usa 21px no desktop e 20px no celular. Nomes de leads usam 14px e peso 600; prévias, navegação desktop e botões usam 13px. Balões usam 14px e entrelinha 1.45. Rótulos de formulário usam 13px; filtros e cabeçalhos de tabela usam 12px. Switzer e caixa normal também passam a orientar selos, etapa, responsável, datas, dados da ficha e contadores, com números tabulares onde apropriado. Monoespaçado fica em conteúdo técnico residual, como códigos e UTMs, sem comandar a interface.

**The Leitura Contínua Rule.** Reserve a ênfase para nomes e ações; mantenha mensagem em caixa normal e preserve quebras de linha do conteúdo.

## Layout

A navegação lateral mede 216px. Áreas gerais usam margens internas de 28px no desktop e 16px nas laterais do celular. Conversas ocupa a altura dinâmica do viewport, com cabeçalho de no mínimo 76px e rolagem independente na lista e no histórico. Sem detalhes, a lista mede 320px e o chat recebe o restante. Com detalhes e largura acima de 1200px, as colunas são 300px, espaço flexível e 260px. Entre 861px e 1200px, a lista mede 280px e detalhes aparecem sobrepostos à direita, com 290px.

Até 860px, a interface mostra lista ou chat; os detalhes cobrem a região de conteúdo quando abertos. A navegação inferior reserva 78px mais a área segura. A altura do workspace desconta essa reserva; o composer fica dentro do chat acima da navegação. O botão Conversas retorna à lista. O histórico flexível recebe a rolagem; cabeçalho e rodapé não encolhem. O código expressa esse contrato; o comportamento com teclado virtual em dispositivos reais não é comprovado pelas fixtures.

O ritmo é compacto, com intervalos recorrentes de 8px a 20px e linhas de conversa com altura mínima de 84px. Mensagens ocupam no máximo `min(82%, 560px)`, com entrada à esquerda e saída à direita. Não há um container de marketing centralizado na tela de atendimento.

Em Ajustes, a faixa de abas possui rolagem horizontal própria e itens que não encolhem. Na largura de 360px, as abas excedentes permanecem acessíveis dentro dessa faixa, sem exigir que a página inteira acompanhe sua largura. Guias de conexão e diagnóstico usam `details` recolhíveis para manter os formulários legíveis.

Na lista de leads, a tabela vira cartões de duas colunas até 700px, com contato ocupando a largura total e rótulos visíveis por campo. O quadro usa colunas de 280px no desktop; até 860px, cada coluna ocupa `calc(100vw - 66px)`, limitada a 320px, com rolagem horizontal e aproximação por scroll snap. O seletor Ir para etapa aparece até 1100px e desloca o quadro sem mudar a etapa do lead. Mais filtros é uma sobreposição no desktop e conteúdo no fluxo no celular.

**The Uma Região no Celular Rule.** Mantenha lista, chat e detalhes como etapas visuais distintas no celular, preservando o composer acima da navegação.

## Elevation & Depth

A profundidade vem principalmente de superfícies tonais e divisórias finas. Lista e chat são planos contínuos; a caixa geral de Conversas não tem borda externa nem arredondamento. Cards, campos e modais do restante do CRM mantêm contorno discreto.

A sobreposição de detalhes em larguras intermediárias usa sombra lateral (`-12px 0 30px #0005`). Mais filtros usa sombra difusa (`0 8px 24px #0006`) apenas enquanto sobreposto no desktop. Modais usam fundo escuro translúcido e desfoque (4px). Esses efeitos identificam sobreposição, não acompanham cada bloco de conteúdo. O foco visível usa contorno âmbar de 2px, afastado 3px; o anexo usa foco no conjunto com afastamento 2px.

**The Profundidade Funcional Rule.** Separe regiões por tom e linha; use sombra quando o painel se sobrepõe ao conteúdo.

## Shapes

Controles são levemente arredondados: botões, segmentos, balões e composer usam conversation; campos gerais preservam control. Cards comerciais e a caixa da tabela usam card. Selos e contagens menores usam cantos discretos de 5px ou 6px; filtros do chat continuam cápsulas. Avatares com iniciais são círculos, sem fotografia obrigatória. Essas famílias expressam papéis diferentes; valores avulsos da base não viram novos tokens por causa dos avisos do detector.

O raio final dos balões é uniforme na cascata atual: a regra posterior de `workspace.css` substitui os cantos assimétricos da base. Não restaure a aparência antiga ao reutilizar o componente.

## Components

**Buttons.** Ação principal compacta em âmbar, texto escuro, peso 600 e altura mínima de 40px. Hover reduz opacidade para .9; desabilitado usa .5 e cursor indisponível. O botão fantasma tem fundo cinza elevado, contorno discreto e borda âmbar no hover. Enviar usa verde e altura mínima de 44px. Controles auxiliares usam texto secundário; os mínimos variam por contexto, portanto não há um tamanho de toque universal validado.

**Inputs / Fields.** Campos de formulário usam superfície elevada, borda fina, fonte 14px e espaçamento de 11px por 12px. A busca de leads tem ícone e altura de 42px; busca da lista de conversas mantém raio 7px e fonte 13px. O composer usa superfície mais clara, fonte 14px e altura mínima de 44px, crescendo até 160px. Foco de teclado permanece explícito mesmo nos campos sem borda. Placeholder não substitui nome acessível.

**Navigation.** Navegação vertical no desktop e horizontal inferior no celular. Item ativo usa fundo marrom e âmbar claro, com `aria-current="page"`. Ícones da navegação são SVG inline, acompanhados de texto. A variante móvel distribui os itens igualmente, com fonte de 10px e altura mínima de 54px. O link Ir para o conteúdo aparece ao receber foco.

**Chips.** Filtros da conversa são cápsulas neutras quando inativas e verdes quando selecionadas, com `aria-pressed`. Responsável e canal ficam em `details` recolhível, aberto quando há filtro aplicado. Leads e quadro usam segmentos de responsabilidade com seleção cinza, preservando a distinção entre filtros comerciais e atendimento.

**Cards / Containers.** Cards comerciais têm fundo cinza elevado, borda discreta, raio card e espaçamento interno de 14px. Hover clareia fundo e borda. Nome acionável, contato, origem, responsável e seletor de etapa organizam o conteúdo; selos de cadastro aparecem quando pertinentes. A conversa usa painéis contínuos; não herda a composição de cards do kanban.

**Shared lead filters.** Lista e quadro compartilham busca, Todos/Meus leads/Sem responsável, etapa, cadastro incompleto e ordenação por mais recentes ou nome. Sem responsável depende da permissão de distribuir leads. Mais filtros agrupa cadastro e ordenação; Limpar filtros oferece retorno ao conjunto completo. A busca comercial percorre os leads carregados, incluindo dados de origem, e é distinta da busca remota do histórico de conversas. Etapa e responsável têm seletores contextuais conforme permissão; arrastar o card é alternativa ao seletor, não a única maneira de mover um lead.

**Lead drawer and dialogs.** A ficha usa gaveta de até 500px, com cabeçalho separado e abas para conversa, anotações, origem e dados. Modais e gavetas recebem nome acessível, `role="dialog"` e `aria-modal`; Tab permanece nos controles do diálogo. Ao fechar o último diálogo, o foco retorna ao acionador conectado ou ao conteúdo principal. Filtros restauram o foco após redesenho quando previsto pelos eventos.

**Conversation.** A lista combina avatar, nome, horário, prévia, quantidade não lida e estado sem resposta. A busca por nome, número ou conteúdo consulta o histórico completo armazenado e acessível ao usuário pela RPC `buscar_conversas_crm`, executada com as permissões do usuário e RLS. Resultados são paginados, com 50 conversas por solicitação no cliente; a pesquisa não se limita à última prévia nem às mensagens já carregadas na tela. O painel de contato é recolhível e apresenta etapa, responsável, e-mail e número de atendimento, com acesso à ficha.

**Message and composer.** Metadados distinguem Enviando, Enviada, Entregue, Lida e Não enviada conforme os dados recebidos. O envio inclui imediatamente um balão local Enviando e reconcilia seu identificador com o retorno do servidor; sua presença não comprova entrega. Falha muda o balão, mostra explicação e permite recuperar o texto quando aplicável. Histórico possui carregamento, estado vazio, tentativa novamente e paginação de 50 mensagens. Rascunhos e identificadores de tentativa ficam em `sessionStorage`, separados por conta, empresa e conversa. No código, Enter envia em ponteiro preciso; Shift+Enter preserva quebra, e ponteiro de toque não envia por Enter.

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

### Don't:

- **Don't** tratar configuração, conexão e entrega de mensagem como o mesmo estado.
- **Don't** apresentar fixture ou screenshot como prova de conexão real.
- **Don't** usar a seleção de cor como único indicador de falha ou entrega.

Não canonizado: valores avulsos de paleta, tamanho e raio não entram no sistema para silenciar o detector. Alvos compactos e defeitos de sobreposição não definem um piso de acessibilidade. Fontes de fallback e rótulos técnicos residuais não autorizam uma nova linguagem de display nem kickers decorativos. O recorte anterior de Mais filtros foi resolvido; não integra as regras do sistema.
