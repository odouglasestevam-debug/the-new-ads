# Plano de melhoria do CRM

Data da análise: 19/09/2026  
Modelo recomendado: GPT-6 Astra, raciocínio alto  
Orçamento total: 350.000 tokens

## Objetivo

Evoluir o CRM multitenant para uma ferramenta diária de atendimento e gestão comercial, com interface consistente e uma área de Conversas tão familiar e eficiente quanto o WhatsApp Web. Completar e endurecer as integrações com a API oficial do WhatsApp e com a NeoGo, preservando o isolamento entre empresas.

Meta Ads fica fora desta execução. O enriquecimento CTWA existente deve continuar funcionando, mas não será ampliado. Também ficam fora o sistema `/funil`, o projeto Supabase `iklynyncffneuvutvgxa`, o n8n e qualquer funcionalidade de IA.

## Estado encontrado

- O frontend publicado é um único `index.html` com 2.536 linhas, CSS e JavaScript inline. Não existe `DESIGN.md` do CRM nem uma suíte de testes de interface preservada no repositório.
- O banco já é multitenant e usa RLS. Existem quatro empresas, 37 leads, seis conversas e 19 mensagens. As conversas reais atuais usam apenas a API oficial e apenas texto.
- A API oficial está ativa. Há 11 mensagens recebidas, cinco lidas, uma entregue e duas falhas registradas. Assinatura do webhook, status de entrega e segredos no Vault já existem.
- O código usa Graph API `v21.0`, com expiração prevista para 21/01/2027. A versão precisa ser atualizada com teste de compatibilidade.
- Templates para iniciar ou retomar conversa fora da janela de 24 horas ainda não existem.
- Mídias recebidas são reconhecidas e salvas como metadados, mas não são baixadas, armazenadas nem exibidas. O envio aceita somente texto.
- A lista de conversas atualiza a cada dez segundos, carrega todas as conversas e todas as mensagens abertas, e redesenha grande parte da tela. Não há paginação nem atualização em tempo real.
- A NeoGo possui funções, webhook, envio e cadastro de integração, mas não há integração NeoGo ativa nem mensagens NeoGo no banco. O comportamento real do provedor ainda precisa de um piloto.
- O webhook oficial responde `200` mesmo quando uma gravação pontual falha, o que pode impedir uma nova tentativa do provedor. O processamento também busca dados auxiliares antes de concluir a gravação principal.
- A URL base da NeoGo aceita qualquer host HTTPS. É necessário impedir destinos privados e restringir o uso para reduzir risco de requisições indevidas pelo servidor.
- O domínio publicado não envia CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` nem `Permissions-Policy`. O Supabase SDK e as fontes vêm de terceiros em tempo de execução.
- O Supabase recomenda habilitar proteção contra senhas vazadas e aponta um índice ausente em `mensagens.empresa_id`. Os alertas de funções `SECURITY DEFINER` precisam de testes de autorização, embora as quatro funções inspecionadas façam verificações internas de acesso.
- O acesso atual do MCP não possui `analytics:read`, então os logs de produção devem ser habilitados na etapa inicial ou consultados pelo painel.

## Direção do produto e da interface

O CRM continua com a identidade escura da The New Ads: preto, grafite e âmbar, usando o verde somente para estados do WhatsApp e confirmações. A interface será uma ferramenta de operação, densa e familiar, com uma linguagem visual única para leads, kanban, conversas, formulários, equipe e integrações.

A área de Conversas terá três zonas no desktop: lista de conversas, chat e painel contextual do lead recolhível. No celular, cada zona vira uma tela com navegação previsível. O comportamento seguirá hábitos do WhatsApp Web sem copiar sua marca: busca imediata, filtros curtos, mensagens agrupadas por dia, estados de envio legíveis, composer fixo, rascunho por conversa, rolagem preservada e acesso rápido ao responsável e à etapa comercial.

## Orçamento e execução

| Etapa | Tokens | Acumulado |
|---|---:|---:|
| 0. Baseline e contrato de produto | 20.000 | 20.000 |
| 1. Arquitetura e testes de proteção | 35.000 | 55.000 |
| 2. Sistema visual e interface geral | 40.000 | 95.000 |
| 3. Conversas completas | 70.000 | 165.000 |
| 4. WhatsApp oficial | 65.000 | 230.000 |
| 5. NeoGo | 40.000 | 270.000 |
| 6. Segurança, desempenho e operação | 35.000 | 305.000 |
| 7. Validação e publicação | 25.000 | 330.000 |
| Reserva controlada | 20.000 | 350.000 |

### Regra de consumo

- Cada etapa começa com seus critérios de aceite e termina somente quando os testes correspondentes passam.
- Com 75% dos tokens da etapa usados, itens opcionais são movidos para o backlog.
- Com 90% usados, o trabalho fica restrito aos critérios de aceite e correções bloqueadoras.
- Tokens não usados retornam à reserva. Uma etapa não toma tokens da próxima silenciosamente.
- A reserva cobre mudanças de contrato da Meta ou da NeoGo, incompatibilidades de dados reais e correções descobertas nos testes. Ela não financia novas funcionalidades.
- Processo de revisão de aplicativo, verificação empresarial, migração de número e espera por credenciais são dependências externas e não contam como implementação concluída pelo código.

## Etapa 0: baseline e contrato de produto, 20.000 tokens

### Trabalho

- Criar snapshot verificável do frontend publicado, schema, políticas, funções, versões de Edge Functions e configurações públicas.
- Reconciliar a diferença entre o HTML local e o publicado, incluindo injeção do Cloudflare e codificação de caracteres.
- Obter acesso de leitura aos logs ou documentar a consulta equivalente no painel.
- Criar `DESIGN.md`, mapa de telas e estados, dados fictícios representativos e critérios de aceite desktop e celular.
- Registrar um plano de rollback para frontend, migrations e Edge Functions.

### Aceite

- Uma fonte local identificada como baseline de produção.
- Nenhum dado real usado em capturas ou testes.
- Escopo e estados críticos documentados: vazio, carregando, erro, sem permissão, desconectado, janela fechada, envio pendente e falha.

## Etapa 1: arquitetura e testes de proteção, 35.000 tokens

### Trabalho

- Separar HTML, estilos e JavaScript em módulos por domínio sem mudar o comportamento: núcleo, autenticação, dados, leads, conversas, formulários, equipe e integrações.
- Manter o deploy estático simples, sem introduzir framework apenas por conveniência.
- Hospedar localmente o SDK do Supabase e as fontes necessárias.
- Criar `_headers` com CSP restritiva e demais cabeçalhos de segurança.
- Criar fixture multitenant e testes de navegador para login simulado, permissões, lista, kanban, conversas e celular.
- Transformar o teste SQL de isolamento em verificação reproduzível e ampliá-lo para conversas, mensagens e RPCs.

### Aceite

- Paridade funcional com o CRM atual.
- Nenhum script inline necessário para o aplicativo principal.
- Testes conseguem detectar vazamento entre empresas, regressão de papéis e falhas básicas de interface.

## Etapa 2: sistema visual e interface geral, 40.000 tokens

### Trabalho

- Consolidar tokens, tipografia, ícones, botões, campos, menus, tabelas, cards, gavetas, alertas, skeletons e estados vazios.
- Redesenhar navegação, topo, seletor de empresa e telas de Leads, Kanban, Formulários, Equipe e Ajustes.
- Corrigir hierarquia, densidade, textos de ajuda, foco por teclado, contraste e responsividade.
- Manter o âmbar para ação e seleção; usar verde para WhatsApp e sucesso, vermelho para falha e azul somente quando houver significado funcional.

### Aceite

- Componentes consistentes em todas as telas.
- Sem rolagem horizontal em 360 px e sem perda de função no celular.
- Fluxos principais utilizáveis por teclado e com foco visível.

## Etapa 3: Conversas completas, 70.000 tokens

### Trabalho

- Construir lista, chat e painel do lead com navegação responsiva.
- Adicionar filtros Todas, Não lidas, Sem resposta, Minhas, responsável e canal, com busca por nome, número e conteúdo permitido.
- Implementar paginação de conversas e mensagens, carregamento incremental ao subir e preservação da posição de rolagem.
- Substituir polling como mecanismo principal por atualização em tempo real, mantendo fallback controlado.
- Adicionar rascunho por conversa, envio otimista idempotente, repetição de falha, indicador de mensagem nova, agrupamento por dia e estados enviados, entregues e lidos.
- Exibir responsável, etapa, telefone, canal e ações rápidas no contexto do chat.
- Marcar como lida somente quando a conversa estiver visível e a janela ativa.
- Preparar componentes de texto, imagem, vídeo, áudio, documento, localização, figurinha, reação e resposta, mesmo quando o canal não suportar todos no primeiro momento.

### Aceite

- Trocar de conversa não perde rascunho nem posição.
- Mensagem não duplica com clique repetido, resposta de webhook ou reconexão.
- Novas mensagens aparecem sem redesenhar toda a página.
- Desktop e celular passam por cenários com zero, dezenas e milhares de mensagens simuladas.

## Etapa 4: WhatsApp oficial, 65.000 tokens

### Trabalho

- Atualizar a Graph API para uma versão suportada atual, com compatibilidade validada antes da troca.
- Criar assistente de conexão para WABA, número, token permanente de usuário do sistema, App Secret, webhook e teste de permissões.
- Mostrar diagnóstico objetivo: token, número, qualidade, inscrição do app, webhook, última entrada e último erro.
- Implementar listagem e envio de templates aprovados para iniciar ou retomar conversas fora da janela de 24 horas, com preenchimento e prévia de variáveis.
- Implementar upload, download e exibição de mídia. Mídias recebidas serão copiadas imediatamente para bucket privado, com tipo e tamanho validados e acesso por URL assinada.
- Implementar envio de imagem, áudio, vídeo e documento conforme limites do canal.
- Marcar mensagens recebidas como lidas pela API quando forem efetivamente abertas.
- Tornar o webhook idempotente e separar gravação principal de enriquecimentos. Falhas transitórias devem gerar nova tentativa ou fila; falhas permanentes devem ir para registro de diagnóstico.
- Tratar estados fora de ordem usando timestamp do evento e guardar códigos de erro estruturados.
- Adicionar chave de idempotência ao envio e impedir duplo clique ou repetição por timeout.

### Aceite

- Texto, template e pelo menos uma mídia de cada classe suportada passam em teste real de ida e volta.
- Status enviado, entregue, lido e falhou aparecem corretamente.
- Reentregar o mesmo webhook não cria lead, conversa ou mensagem duplicada.
- Falha de enriquecimento não impede a mensagem principal de entrar.

### Referências

- Coleção oficial da Meta: https://www.postman.com/meta/whatsapp-business-platform/documentation/wl
- Mensagens: https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages
- Mídia: https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3
- Versões da Graph API: https://developers.facebook.com/docs/graph-api/changelog/versions

## Etapa 5: NeoGo, 40.000 tokens

### Trabalho

- Validar o contrato real da conta NeoGo: versão, URL, autenticação, endpoints, eventos, slots e formato de recibos.
- Isolar a NeoGo atrás de um adaptador de canal para que diferenças do provedor não contaminem a interface e o domínio de mensagens.
- Restringir a URL configurável, bloquear rede privada e redirecionamentos inseguros, exigir HTTPS e limitar tempo e tamanho de resposta.
- Validar estado da instância e apresentar conectada, reconectando, desconectada, suspensa ou credencial inválida.
- Exigir assinatura HMAC quando o plano do provedor oferecer esse recurso. Manter token de URL rotacionável apenas onde o contrato exigir.
- Implementar texto, mídia, recibos, eco do celular, deduplicação, resposta e reconciliação de IDs.
- Preservar slots já usados e testar o registro do webhook sem derrubar integrações existentes.
- Executar piloto real com a empresa indicada, primeiro em número controlado e depois no número operacional.

### Aceite

- Entrada, saída, eco enviado pelo celular, entrega, leitura, mídia e reconexão passam em teste real.
- Webhook duplicado ou fora de ordem não duplica nem rebaixa status.
- Queda do provedor aparece no CRM com ação de recuperação e sem perda silenciosa.

## Etapa 6: segurança, desempenho e operação, 35.000 tokens

### Trabalho

- Revisar RLS e todos os RPCs `SECURITY DEFINER` com testes por papel e por empresa.
- Adicionar rate limit e idempotência a envio, nova conversa, convites e endpoints públicos relevantes.
- Habilitar proteção contra senhas vazadas e revisar MFA, expiração de sessão e recuperação de conta.
- Corrigir o índice ausente de `mensagens.empresa_id` e validar planos de consulta da caixa de entrada e do histórico.
- Avaliar o alerta de `pg_net` no schema público sem mover extensão gerenciada de forma arriscada.
- Remover dados pessoais e segredos de logs, padronizar correlação de requisições e criar painel de saúde das integrações.
- Definir retenção de mídia, exclusão de dados, exportação e procedimento de incidente.
- Medir carregamento, consultas, memória e renderização com volume alto simulado.

### Aceite

- Testes provam isolamento de empresas e permissões de agência, dono, gestor, vendedor e leitura.
- Headers de segurança presentes no domínio publicado.
- Nenhum segredo volta ao navegador ou aparece em logs.
- Consultas principais continuam rápidas com volume representativo.

## Etapa 7: validação e publicação, 25.000 tokens

### Trabalho

- Rodar testes SQL, Edge Functions, navegador desktop e celular, acessibilidade e smoke tests.
- Validar oficial com o número de teste ou controlado e NeoGo com o piloto.
- Preparar pacote de produção, diff de schema, rollback e checklist de segredos.
- Publicar em ordem segura: migrations, funções, frontend e testes pós-publicação.
- Documentar conexão dos dois canais, erros comuns, renovação de token, troca de número e recuperação.

### Aceite

- Fluxos críticos testados com identidade de agência, dono, vendedor e leitura.
- Publicação conferida por hash e smoke test no domínio.
- Checklist operacional permite conectar uma nova empresa sem editar código.

## Dependências externas

- Credenciais e uma instância de teste NeoGo para validar o que hoje existe apenas por simulação.
- Número controlado, WABA e token permanente para os testes oficiais.
- Acesso `analytics:read` ou acesso equivalente aos logs do Supabase.
- Ativação da proteção contra senhas vazadas no painel do Supabase, se o plano oferecer.
- Aprovação antes da publicação final e antes de qualquer recurso pago. O projeto está no plano gratuito e a criação de branch do Supabase não deve ser presumida.

## Ordem obrigatória

As etapas 0 e 1 protegem o sistema atual e vêm antes do redesenho. A interface de Conversas vem antes das integrações completas para oferecer um contrato visual estável. A API oficial vem antes da NeoGo porque já possui tráfego real e tem prazo de versão. Segurança e publicação fecham o ciclo depois dos dois canais passarem em testes controlados.
