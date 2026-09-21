# Refinamento de UX — 20/09/2026

Pedido: melhorar o design e a experiência do CRM usando Impeccable. Escopo: frontend de crm.thenewads.com.br. Identidade grafite/âmbar, Switzer e referência WhatsApp preservadas.

Publicação: Worker `tna-crm`, versão `c93eacce-ec50-48ce-b206-c6e09b221573`. Versão anterior: `4127c0f0-887d-41a9-b77f-0b09d243046b`. Banco e Edge Functions não foram modificados nesta rodada.

## Mudanças

- Leads e Kanban compartilham busca e filtros de responsabilidade, etapa e cadastro. A busca acompanha a alternância entre as duas telas. Ordenação por data ou nome e ação de limpar filtros.
- Lista prioriza contato, etapa e responsável; em telas de até 700 px, cada linha se reorganiza em um bloco legível, mantendo as ações. Nomes são botões acessíveis pelo teclado.
- Quadro apresenta responsável e resumo da origem, deixando os detalhes na ficha. Mover por seletor continua disponível; o atalho de etapa facilita percorrer o quadro no celular.
- Barra de trabalho compacta no desktop; filtros adicionais aparecem sob demanda. Estados sem resultados oferecem recuperação pela limpeza dos filtros.
- Navegação, tipografia, selos, campos e painéis compartilham a mesma hierarquia. Verde reservado ao atendimento; âmbar às ações gerais e orientação.
- Chat com filtros avançados recolhíveis. Responder aparece ao passar o ponteiro ou focar a mensagem no desktop e permanece visível no celular. Rascunhos, posição de leitura e envio existentes preservados.
- Gavetas e modais anunciam título, contêm a navegação por Tab e devolvem o foco ao acionador. Formulário de lead fecha por Escape. Atalho “Ir para o conteúdo” disponível ao teclado.

## Validação

Fixtures fictícias em `tests/browser.mjs`: busca/filtros entre lista e quadro, cadastro incompleto, teclado dos diálogos, retorno de foco, menu de filtros contido no viewport e testes anteriores de Conversas. Capturas desktop/mobile em `tests/artifacts/`.

Impeccable: duas rodadas locais limitadas e revisão externa em contexto separado. O revisor identificou contenção do painel “Mais filtros”; a correção ancora o painel à direita do acionador, mantendo fluxo normal no celular.

Veredito final do revisor: **disposition: ship**.

| Achado material | Veredito | Evidência |
|---|---|---|
| Painel Mais filtros ultrapassava a borda direita | Resolved | Captura leads-filtros-desktop.png, painel inteiro no viewport; Cadastro/Ordenação legíveis. Nenhuma regressão nas recapturas desktop/mobile. |

Remaining: **Clear**. `npm run test:browser` passou após a correção, inclusive teste geométrico do painel aberto e funcionamento do filtro. Todos os scripts passaram verificação de sintaxe; diff sem erros de whitespace.

Conferência pós-publicação concluída em 20/09/2026 às 18:44 UTC: 18 assets coincidem por hash com a versão local, headers presentes, login público funcional e acesso anônimo bloqueado. Evidência: `tests/artifacts/deploy.json`. O documenter gravou DESIGN.md e sidecar antes de atingir seu limite de uso; o agente principal conferiu a atualização e a validade do JSON diretamente.

Detector executado uma vez. Saída extensa com alertas de documentação de cores, tipografia e raios; não constitui certificação de acessibilidade. DESIGN.md e sidecar são atualizados a partir do código final. Verificações reais com teclado virtual ou leitores de tela em dispositivos físicos não foram realizadas.

Nenhuma alteração de banco, credencial, integração externa ou envio real de mensagens faz parte desta rodada.
