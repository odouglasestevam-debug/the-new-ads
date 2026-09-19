# Membros e acesso a espaços, pastas e listas

Status: **ativo em produção desde 18/09/2026.** Migrações `tarefas_0004_integridade_e_seguranca` e `tarefas_0005_acessos_por_membro` aplicadas no projeto `xrvjlhseyqfgyvwwlwwb`, Edge Functions `tarefas-usuarios` e `tarefas-lembrete` na versão 2, frontend completo publicado em https://tarefas.thenewads.com.br. Rollback de emergência em `supabase/rollback/antes_0004_0005.sql`.

## Comportamento

- Administrador: vê todos os locais, cadastra membros e altera a estrutura de espaços/pastas/listas.
- Membro: cria, edita e conclui tarefas; gerencia responsáveis e comentários apenas nas listas permitidas. Não pode mover ou excluir a estrutura, pois essas operações poderiam atingir conteúdo bloqueado por cascata.
- Novos membros começam sem espaços selecionados. O administrador pode selecionar espaços ou liberar todos, inclusive futuros.
- Em um espaço liberado, pastas e listas herdam o acesso. Desmarcar uma pasta bloqueia também todas as subpastas e listas dentro dela. Não é possível liberar um filho enquanto o pai está bloqueado.
- Bloqueios individuais de listas preservam o acesso à pasta e às outras listas.
- A opção Todos os espaços mantém os bloqueios de pastas/listas. Sem essa opção, espaços novos exigem liberação explícita.
- A migração preserva o acesso amplo dos membros existentes. Depois, usar Ajustes > Membros > Editar acesso para restringir cada pessoa.
- Excluir (migração `tarefas_0006_excluir_membro`, função `tarefas_excluir_membro`): só admin, nunca a si mesmo, respeita o último admin. Remove cadastro, permissões, push e atribuições; comentários, tarefas criadas e a conta de login (que pode ser a do CRM) continuam.
- Desativar preserva histórico e impede acesso. Administradores podem ver a lista de membros para editar seus acessos; membros só veem o cadastro básico da equipe.

As regras valem no PostgreSQL, incluindo acesso por URL/API, subtarefas, comentários, responsáveis e contagem dos lembretes push. Uma atribuição de tarefa não concede permissão para ler sua lista. A sessão aberta atualiza os dados periodicamente e ao voltar para a aba; a revogação no banco passa a valer imediatamente, mas não remove informações já visualizadas ou copiadas.

## Implementação

Migração `supabase/migrations/0005_acessos_por_membro.sql` depende das anteriores, inclusive 0004. A mudança é transacional, com tabelas separadas para espaços concedidos, pastas bloqueadas e listas bloqueadas. Tabelas de permissões não têm acesso direto para usuários autenticados. Consultas e alterações são feitas por funções que verificam a identidade e a função do administrador.

Cadastro e definição de permissões são uma única transação de banco: referência inválida reverte toda a associação. Se a criação inicial no Auth já ocorreu e a associação falhar, a conta Auth não recebe acesso ao gestor; nova tentativa pode reutilizar essa conta sem substituir sua senha. Recadastrar um membro existente não sobrescreve suas permissões: usar Editar acesso.

O frontend fica em `site/public/membros.js`. Enquanto o servidor não expõe a nova configuração, os controles de cadastro e edição ficam desabilitados com explicação, evitando exibir uma restrição que ainda não existe.

## Ativação (concluída)

1. Conferido o projeto e as migrações aplicadas: só `tarefas_0001` a `0003` existiam.
2. Antes de aplicar: ninguém tinha 2FA cadastrado (a regra de MFA da 0004 não trava ninguém) e nenhum dado violava as validações novas. Definições antigas salvas no arquivo de rollback.
3. 0004 aplicada como está. 0005 aplicada sem as linhas `begin;`/`commit;`, porque `apply_migration` já é transacional.
4. Funções publicadas com os arquivos desta pasta (`tarefas-lembrete` com `push-seguro.ts`, sem JWT obrigatório por causa do cron). Segredos do Vault e o job `tarefas-lembrete-diario` não foram alterados.
5. Frontend de `site/` publicado com `site/wrangler.jsonc`, mesma CSP de antes. Não foi usado `.toolbar-release`.
6. Membros que já existiam (Pedro, fabioli, teste) ficaram com `acesso_total = true`. As restrições deles devem ser escolhidas em Ajustes > Membros.

## Validação em produção (18/09/2026)

Com contas de teste reais (admin e membro restrito), logando pela API pública, sem service_role. Dados de teste apagados ao final.
- Membro restrito: vê só o espaço liberado; pasta bloqueada some com subpasta e listas; lista bloqueada individualmente some; GET direto por id, pela view pública e pelo schema `tarefas` volta vazio; comentários, responsáveis e subtarefas bloqueados não aparecem; ser responsável não dá acesso.
- Escrita bloqueada: alterar, excluir, criar, mover para lista bloqueada, comentar, se atribuir e pendurar subtarefa foram recusados.
- Autopromoção: virar admin, ligar `acesso_total`, chamar `tarefas_configurar_membro`, ler regras, inserir direto na tabela de permissões, chamar `tarefas_cadastrar_membro`, cadastro antigo e função de cadastro: tudo recusado.
- Admin: cadastro pela função (membro novo entra sem ver nada), recadastro não sobrescreve, revogação vale na hora, referência inválida não salva nada pela metade, desativação corta tudo e preserva histórico.
- Lembrete: membro responsável por 6 tarefas atrasadas recebe contagem 2 (só as liberadas).
- Último admin: tentar remover todos os admins é recusado e desfeito.
- Tela no domínio publicado: editor de membros salva e grava no banco, membro restrito não vê itens bloqueados nem controles de admin, celular sem rolagem lateral, sem erro de JavaScript.

## Validação local

- `npm test`: 45 verificações específicas desta funcionalidade, mais os testes existentes. Inclui API por views com RLS, bloqueios herdados, cadastro atômico, recadastro, rollback por referência inválida, proteção do último administrador, revogação e lembretes.
- `npm run test:ui`: cadastro com espaços/exceções, edição, falha de gravação preservando formulário, alternância de função, bloqueios herdados e ausência de controles administrativos para membros; demais fluxos existentes permanecem cobertos. Backend simulado, sem alterar dados reais.
- Capturas com dados fictícios em `tests/artifacts/membros-desktop.png` e `membros-mobile.png`.
