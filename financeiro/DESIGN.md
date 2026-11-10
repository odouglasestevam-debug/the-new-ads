# Design: Financeiro | The New Ads

Mesma família visual do gestor de tarefas (`../gestor-tarefas/DESIGN.md`): superfícies claras, destaque violeta `#6941c6`, fonte nativa de interface, tema claro/escuro/sistema (`fin_tema`). A ideia é poder juntar os dois apps sem refazer o visual.

Diferenças:
- Celular primeiro: abas embaixo (Mês, Clientes, Métricas, Cobrança) e ajustes na engrenagem do topo. A partir de 760px as abas sobem para o topo e somem de baixo.
- Um único número em destaque por tela (o recebido do mês, 44px no celular e 52px no computador). Valores em colunas usam algarismos tabulares.
- Estado de cobrança sempre com texto e ponto colorido: verde pago, azul a vencer, âmbar vence hoje, vermelho em atraso. A cor nunca carrega o significado sozinha.
- Gráfico de recebido por mês: série única em violeta (`#9b7cf0` no escuro), colunas de até 24px com canto de 4px só na ponta, valor só no maior mês e no atual, dica no toque, e a mesma informação em lista (celular) ou tabela (computador). Paleta validada com o validador do dataviz nos dois temas.
- Sem travessão em nenhum texto da interface nem nas mensagens ao cliente; o app recusa salvar texto de cobrança com travessão ou sem `{link}`.
