---
name: Tarefas | The New Ads
description: Workspace interno compacto para organizar demandas de três pessoas.
colors:
  primary: "#6941c6"
  primary-hover: "#5934ae"
  selected: "#eee8fb"
  surface: "#ffffff"
  surface-muted: "#f5f6f8"
  sidebar: "#f8f9fb"
  text: "#252936"
  text-muted: "#616675"
  border: "#e3e5eb"
  success: "#187549"
  danger: "#b42332"
  information: "#245eaf"
  warning: "#895a09"
typography:
  headline:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.6px"
  body:
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  task:
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontSize: "12px"
    letterSpacing: "0"
  metadata:
    fontSize: "11px"
rounded:
  control: "6px"
  container: "7px"
  field: "9px"
spacing:
  small: "6px"
  compact: "8px"
  medium: "12px"
  section: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.container}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "11px 13px"
  navigation-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.primary-hover}"
    rounded: "{rounded.control}"
    padding: "9px 10px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  task-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.container}"
    padding: "13px"
---

# Design System: Tarefas | The New Ads

## Overview

**Creative North Star: "Workspace compacto"**

Interface operacional minimalista, com a familiaridade de um gestor como ClickUp: navegação hierárquica, tarefas compactas e ações próximas dos dados. O espaço visual serve à leitura de títulos, responsáveis, prazos e estados.

Sistema extraído de `site/public/estilo.css` com as substituições de `site/public/workspace.css`, carregado depois da base. A direção clara do workspace prevalece sobre os valores escuros herdados do CRM.

**Key Characteristics:**
- Superfícies brancas e cinzas frios, com destaque violeta.
- Tipografia nativa de interface e hierarquia discreta.
- Lista e quadro compactos, com estados identificáveis por texto.

## Colors

### Primary
Violeta identifica ações principais, seleção e foco; violeta profundo marca hover e texto selecionado. O fundo lavanda distingue navegação ativa.

### Neutral
Branco sustenta o conteúdo; cinza frio separa navegação, controles e agrupamentos. Texto escuro e texto secundário distinguem informação principal de metadados. Bordas claras delimitam linhas e campos.

Vermelho identifica atraso, erro e prioridade urgente; âmbar identifica prioridade alta, azul prioridade normal e verde confirmação. Status de trabalho também podem receber cores configuradas nos dados: conservar seus nomes visíveis.

**The Estado Legível Rule.** Cor acompanha um nome, uma data ou um ícone identificável; não substitui o significado textual.

## Typography

Fonte nativa de interface em todas as funções, incluindo números; não há fonte de marca ou escala de display. Títulos de página usam o papel headline, tarefas usam task, rótulos usam label e datas/metadados usam metadata. A interface mantém caixa normal nos rótulos.

Em celular, o título de página reduz para (21px). Títulos de tarefas podem quebrar linha. A escolha de fontes nativas corresponde à direção operacional explicitamente escolhida; não estabelece uma identidade editorial para outros produtos.

## Layout

Desktop: lateral fixa na largura (238px), conteúdo flexível e margem interna principal (24px 28px 70px). Linhas de tarefas têm altura mínima (48px), colunas alinhadas e divisores leves. Filtros se reorganizam em mais de uma linha.

Entre (861px) e (1200px), a lista reduz colunas e omite a coluna de prioridade. Até (860px), a lateral torna-se um menu sobreposto; o conteúdo usa margens (18px 14px 70px), a busca ocupa uma linha inteira e as tarefas distribuem metadados em duas linhas. O quadro mantém rolagem horizontal própria, com colunas quase da largura disponível no celular.

**The Densidade Operacional Rule.** Manter títulos, responsáveis e prazos próximos, preservando quebra de linha em telas estreitas.

## Elevation & Depth

Listas e cartões permanecem planos, separados por bordas e variações de fundo. Menus flutuantes e avisos usam sombras suaves; gavetas e modais usam sobreposição e véu para estabelecer profundidade. Os valores de sombra, foco e movimento estão no sidecar.

## Shapes

Controles e cartões têm cantos discretamente arredondados. Campos são um pouco mais suaves; avatares permanecem circulares. Evitar transformar todos os elementos em pílulas: chips, navegação e status têm contornos compactos.

## Components

- **Botões:** preenchimento violeta para ação principal; secundários transparentes com borda; ações destrutivas em vermelho. Desabilitados reduzem opacidade. Foco visível usa contorno violeta.
- **Campos:** fundo branco, borda clara e foco violeta. Filtros são mais compactos que campos de formulário.
- **Navegação:** árvore de espaços, pastas e listas, com recuo hierárquico; item ativo em lavanda e texto violeta. Ícones são SVG.
- **Chips:** filtros compactos com texto e contagem; selecionados recebem fundo violeta muito claro e borda correspondente.
- **Lista:** títulos clicáveis, checkbox, responsáveis, datas, status e prioridade. Conclusão risca o título; atraso recebe indicação localizada junto ao prazo.
- **Quadro:** colunas cinzas, cartões brancos com borda, título e lista de origem; responsáveis, prazo, prioridade e seletor de status permanecem próximos da tarefa.
- **Gaveta:** detalhes em painel lateral de até (640px), limitado à largura da tela; formulário e comentários seguem os mesmos campos e divisores.

Transições breves comunicam hover, foco e abertura. A preferência por movimento reduzido desativa animações e transições.

## Do's and Don'ts

### Do:
- **Do** preservar nomes de status e prioridades junto das cores.
- **Do** reutilizar a densidade, os divisores e os estados de foco existentes.
- **Do** permitir títulos longos e busca em linha própria no celular.

### Don't:
- **Don't** restaurar a paleta escura e laranja da base do CRM neste workspace.
- **Don't** adicionar elementos de IA à experiência interna solicitada.
- **Don't** ampliar metadados em cartões decorativos que afastem os dados das tarefas.

## Tema escuro

Seletor Claro / Escuro / Sistema disponível no login e no rodapé da navegação. Preferência persistida em `tf_tema`; `tema.js` aplica antes dos estilos, sincroniza abas e acompanha o sistema quando selecionado. Tema claro continua padrão.

Escuro: fundo #181a20, superfície #20232b, lateral #1c1f26, borda #383e4b, texto #edf0f7, texto secundário #adb4c5, foco #b69aff. Botões principais #7952d3 com texto branco. Listas, quadro, login, detalhes, menus, calendário e alertas compartilham o tema.

## Barra de tarefas e filtros

Topo compacto com título, abas Lista/Quadro e barra de ferramentas. Agrupamento à esquerda; filtros com contagem, Modo eu, concluídas, busca, ordenação e nova tarefa à direita. Acento verde na barra, adaptado aos temas claro e escuro.

Modo eu está disponível para todos os usuários e mantém uma preferência por usuário neste navegador. Mostra tarefas atribuídas ao usuário atual dentro do local aberto e pré-seleciona esse responsável ao criar uma tarefa. Não concede acesso a dados. Em Minhas tarefas fica sempre ativo.

Filtros em linhas, adicionáveis e removíveis, com combinação E/OU. Escopo, busca e Modo eu sempre restringem o resultado, inclusive com OU. O painel se ajusta ao celular e preserva o foco ao editar condições.

Publicação independente preparada por `scripts/preparar-toolbar-release.mjs`, usando a base atualmente publicada para preservar a gestão de membros enquanto as migrações em ACESSOS.md estão pendentes. Testar `.toolbar-release/public` com `LEGACY_RELEASE=1` antes de publicar `.toolbar-release/wrangler.jsonc`.

## Administração de membros

Ajustes > Membros usa tabela no desktop e linhas empilhadas com rótulos no celular. Cadastro e edição ficam em formulário na própria página. A árvore de permissões usa caixas marcadas para locais permitidos; filhos de uma pasta bloqueada ficam desmarcados e desabilitados, com a origem do bloqueio em texto. Administrador mostra acesso completo explicitamente. Formulário preserva dados após erro de gravação. Implementação pendente de ativação no servidor, ver ACESSOS.md.
