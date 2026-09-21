# Distribuição de leads

Destino: CRM em crm.thenewads.com.br, Supabase xrvjlhseyqfgyvwwlwwb. Nenhuma alteração em /funil, no gestor de tarefas ou na outra conta Supabase.

## Situação desta entrega

Implementada e testada localmente, com `npm test` final **28/28** e teste de navegador passando. Publicação **pendente**: a falha de registro OAuth foi contornada com escopos explícitos (`organizations:read,projects:read,database:read,database:write`); o CLI confirmou `Successfully logged in to MCP server 'supabase-tarefas'`. O conector já carregado nesta conversa ainda retorna `Authentication required`, inclusive para consulta simples. Próximo passo: recarregar a janela do VS Code e continuar esta conversa para reinicializar o MCP, então inspecionar o schema remoto, aplicar a migration e publicar o Worker. A migration 0020 e o frontend desta entrega **ainda não foram publicados**. Não habilitar a automação em uma empresa por suposição: o administrador escolhe e salva a regra.

## Como configurar

1. Selecione a empresa no CRM e abra **Ajustes → Distribuição**. Agência e dono podem configurar. Gestores continuam podendo distribuir leads manualmente, mas não alterar a automação.
2. Escolha **Fila rotativa** ou **Menor demanda**. **Manual** desliga a automação e permanece o padrão inicial.
3. Marque os membros que devem receber leads. Dono, gestor e vendedor podem participar; leitura não pode. Administradores de agência precisam também ser membros da empresa para atuar como atendentes.
4. Clique em **Salvar distribuição**. O rodízio atual aparece na tela quando o modo Fila está selecionado. Novos participantes entram no final; salvar sem trocar participantes mantém o rodízio. O bloco Acompanhamento mostra pendentes e as 15 últimas entregas automáticas. Use **Atualizar situação** para atualizar os números.

**Fila rotativa:** entrega um lead ao próximo participante e o coloca no final. Participantes recebem mesmo offline ou pausados. Esse comportamento está explícito na interface.

**Menor demanda:** considera somente participantes disponíveis e com presença válida no CRM. Conta os leads atribuídos cuja etapa não seja `cliente` ou `perdido`. Empates usam quem recebeu há mais tempo pelo rodízio. Não é uma função de IA.

## Disponível ou pausado

Cada atendente usa **Ajustes → Disponibilidade**, inclusive no celular. No computador também há um botão no rodapé da barra lateral. A disponibilidade é separada por empresa. O estado inicial é **Pausado**; o próprio atendente escolhe ficar disponível.

O navegador confirma presença a cada 25 segundos. Após 90 segundos sem confirmação, o banco deixa de considerar o atendente online. Fechar a aba, perder conexão ou o navegador suspender os temporizadores podem causar expiração. A presença vale para a empresa aberta naquela aba. Outra aba ou aparelho conectado mantém presença; Pausar se aplica a todas as sessões do atendente naquela empresa. Um heartbeat comum não desfaz uma pausa. O frontend não confirma conexão quando a chamada falha.

## Regras de proteção

- Vale para novos leads sem responsável de formulários, WhatsApp e cadastro manual no CRM. No formulário Novo lead, **Usar distribuição da empresa** deixa a automação escolher; com modo Manual, fica sem responsável.
- Leads históricos não são importados para a automação. Leads com responsável explícito e reentregas do mesmo contato conservam o responsável.
- Sem participante elegível, o lead novo permanece registrado e aguardando distribuição. A retomada ocorre quando um participante confirma presença/disponibilidade, quando chega outro lead, ao salvar as regras ou pelos ciclos do administrador conectado. Lotes têm até 50 leads por execução. Não há cron: sem navegador conectado e sem novas entradas/configuração, não há processamento periódico independente.
- No modo Fila, novas entradas são distribuídas no banco mesmo sem ninguém com o CRM aberto. Se um lote antigo exceder 50 após reativação/troca de regra, o administrador conectado ou um membro retomará os lotes seguintes a cada ciclo.
- Trocar responsável manualmente ou concluir/perder um lead remove a pendência automática. Desligar a automação libera pendentes para gestão manual; reativar não os importa novamente.
- Configuração, fila, presença e logs ficam em tabelas privadas com RLS e sem acesso direto de usuários. RPCs conferem sessão/MFA, empresa ativa, papel e pertencimento. Usuários só alteram a própria disponibilidade; os dados da equipe ficam restritos ao administrador.
- As decisões usam lock transacional por empresa; atribuição, avanço do rodízio, remoção da pendência e histórico são uma transação. Inserção que sofre rollback ou conflito sem criar lead não consome vez na fila. Edições simultâneas da configuração usam revisão e recusam sobrescrever uma versão desatualizada.
- A interface consulta leads sob RLS a cada 25 segundos em primeiro plano. Ao perder acesso a um lead, limpa o conteúdo correspondente das conversas e gavetas carregadas.

## Validação

`npm test`: banco PostgreSQL descartável via PGlite com todas as migrations, baseline de 37 verificações e testes específicos de rodízio, rollback/conflito, origem formulário/WhatsApp, menor carga, empate, presença expirada, pausa, múltiplas sessões, fila de espera, lotes, responsável manual, desativação, isolamento de empresas, mudança de papel, remoção de membro, revisão e MFA. PGlite usa uma única conexão; não comprova concorrência entre sessões PostgreSQL independentes. O mecanismo de serialização está explícito no SQL; teste de carga concorrente em ambiente isolado continua recomendado antes de volume elevado.

`npm run test:browser`: fixtures com salvamento/validação, conflito de revisão, falha e recuperação de carregamento, pausa/reconexão, permissões e desktop/mobile. Nenhum lead, contato ou mensagem real é criado por essas suítes.

Revisão Impeccable final: **ship**, remaining **Clear**.

| Achado | Veredito |
|---|---|
| Aviso ao falhar atualização de dados já carregados | Resolved |
| Foco ao descartar alterações e atualizar | Resolved |
| Link de salto sobreposto na captura móvel | Resolved |

Capturas e relatório do detector estão em `tests/artifacts/distribuicao-*` e `disponibilidade-mobile.png`. Detector executado uma vez nos alvos alterados: 89 avisos advisory da cascata/paleta/rampas, zero achados não-advisory. Não equivale a afirmar ausência de todo problema de acessibilidade.

`node tests/deployed-smoke.mjs`: após publicar, confere assets, headers, login e bloqueio anônimo das quatro RPCs de distribuição. Não envia mensagens. Não executar antes da publicação esperando êxito: os hashes locais serão diferentes e as RPCs ainda não existirão.

## Publicar e reverter

1. Reconectar o MCP, inspecionar migrations, estrutura de leads/membros e triggers existentes, confirmando o projeto de destino.
2. Aplicar `supabase/migrations/0020_distribuicao_leads.sql` uma única vez.
3. Publicar o frontend pelo `scripts/deploy.mjs` no Worker `tna-crm`. Não há Edge Function nova nesta entrega.
4. Rodar o smoke remoto e registrar a versão do Worker e a migration aplicada neste documento.
5. O administrador configura os participantes e ativa o modo desejado no CRM.

Para interromper a automação, salvar **Manual** por empresa. Reverter apenas o frontend não desliga uma regra ativa no banco. Preservar os logs e os responsáveis já atribuídos; não remover tabelas ou responsáveis para reverter o recurso.
