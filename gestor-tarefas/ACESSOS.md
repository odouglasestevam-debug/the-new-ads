# Membros e acesso a espaços, pastas e listas

Status: implementado e validado localmente. **Ainda não ativado no domínio publicado.** O conector Supabase não está disponível nesta sessão. A versão de produção continua com as regras anteriores até aplicar a migração e publicar o pacote completo.

## Comportamento

- Administrador: vê todos os locais, cadastra membros e altera a estrutura de espaços/pastas/listas.
- Membro: cria, edita e conclui tarefas; gerencia responsáveis e comentários apenas nas listas permitidas. Não pode mover ou excluir a estrutura, pois essas operações poderiam atingir conteúdo bloqueado por cascata.
- Novos membros começam sem espaços selecionados. O administrador pode selecionar espaços ou liberar todos, inclusive futuros.
- Em um espaço liberado, pastas e listas herdam o acesso. Desmarcar uma pasta bloqueia também todas as subpastas e listas dentro dela. Não é possível liberar um filho enquanto o pai está bloqueado.
- Bloqueios individuais de listas preservam o acesso à pasta e às outras listas.
- A opção Todos os espaços mantém os bloqueios de pastas/listas. Sem essa opção, espaços novos exigem liberação explícita.
- A migração preserva o acesso amplo dos membros existentes. Depois, usar Ajustes > Membros > Editar acesso para restringir cada pessoa.
- Desativar preserva histórico e impede acesso. Administradores podem ver a lista de membros para editar seus acessos; membros só veem o cadastro básico da equipe.

As regras valem no PostgreSQL, incluindo acesso por URL/API, subtarefas, comentários, responsáveis e contagem dos lembretes push. Uma atribuição de tarefa não concede permissão para ler sua lista. A sessão aberta atualiza os dados periodicamente e ao voltar para a aba; a revogação no banco passa a valer imediatamente, mas não remove informações já visualizadas ou copiadas.

## Implementação

Migração `supabase/migrations/0005_acessos_por_membro.sql` depende das anteriores, inclusive 0004. A mudança é transacional, com tabelas separadas para espaços concedidos, pastas bloqueadas e listas bloqueadas. Tabelas de permissões não têm acesso direto para usuários autenticados. Consultas e alterações são feitas por funções que verificam a identidade e a função do administrador.

Cadastro e definição de permissões são uma única transação de banco: referência inválida reverte toda a associação. Se a criação inicial no Auth já ocorreu e a associação falhar, a conta Auth não recebe acesso ao gestor; nova tentativa pode reutilizar essa conta sem substituir sua senha. Recadastrar um membro existente não sobrescreve suas permissões: usar Editar acesso.

O frontend fica em `site/public/membros.js`. Enquanto o servidor não expõe a nova configuração, os controles de cadastro e edição ficam desabilitados com explicação, evitando exibir uma restrição que ainda não existe.

## Ativação pendente

1. Conectar o projeto Supabase `xrvjlhseyqfgyvwwlwwb` e conferir quais migrações estão aplicadas.
2. Aplicar 0004, se pendente, e 0005. A migração 0005 desabilita o cadastro antigo para impedir liberações ambíguas durante a atualização.
3. Publicar `tarefas-usuarios` e `tarefas-lembrete`, incluindo `push-seguro.ts`. Preservar os segredos e a configuração atual de autenticação da função de cron.
4. Publicar o frontend atualizado no Cloudflare. As permissões não devem ser anunciadas como ativas antes de concluir o banco e as funções.
5. Confirmar no ambiente real o fluxo de administrador e um membro restrito, incluindo consulta direta a dados bloqueados.

## Validação local

- `npm test`: 45 verificações específicas desta funcionalidade, mais os testes existentes. Inclui API por views com RLS, bloqueios herdados, cadastro atômico, recadastro, rollback por referência inválida, proteção do último administrador, revogação e lembretes.
- `npm run test:ui`: cadastro com espaços/exceções, edição, falha de gravação preservando formulário, alternância de função, bloqueios herdados e ausência de controles administrativos para membros; demais fluxos existentes permanecem cobertos. Backend simulado, sem alterar dados reais.
- Capturas com dados fictícios em `tests/artifacts/membros-desktop.png` e `membros-mobile.png`.
