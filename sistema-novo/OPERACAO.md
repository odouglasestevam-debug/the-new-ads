# Operação e reversão do CRM

Destino exclusivo: crm.thenewads.com.br, Worker tna-crm, Supabase xrvjlhseyqfgyvwwlwwb.

Revisão de segurança publicada em 22/09/2026: migration 0021 `20260922133817`, nove Edge Functions atualizadas e Worker `99004a30-e6dd-4d8c-a500-ce7c44b9362f`. Smoke remoto aprovou 20 assets, headers, login e bloqueio anônimo; formulário recusou JSON inválido (400) e corpo excessivo (413), sem capturar leads ou enviar mensagens. Escopo, cotas, 33 testes locais aprovados e pendências externas em `SEGURANCA-CRM.md`.

Distribuição de leads (migration 0020): Publicado em 21/09/2026: Worker `6519bab1-5e53-45d3-ad58-2a8f51ebae9d`, migration `20260921174437`; smoke remoto aprovou 19 assets, headers, login e bloqueio anônimo, sem mensagens reais. Validação local: 28/28 testes e navegador aprovados. A automação permanece desligada até o administrador escolher modo e participantes. Registro em `DISTRIBUICAO-LEADS.md`. Reverter o frontend não desliga regras já ativadas; salvar Manual em cada empresa.

## Validação

`npm test` roda PostgreSQL descartável com migrations e testes de funções sem rede real. `npm run test:browser` usa fixtures e captura desktop/mobile. Não executar `supabase/tests/isolamento.sql` em produção: a suíte só o utiliza no banco descartável.

Baseline anterior à publicação em `baseline/2026-09-19`: HTML publicado, hashes, funções remotas e estrutura/policies relevantes. HTML local e publicado tinham SHA-256 idêntico. Nenhum conteúdo de conversa ou segredo foi incluído.

## Publicação

1. Aplicar migrations 0012–0019, na ordem, somente no projeto indicado. Elas já foram aplicadas em 20/09/2026; não repetir a execução.
2. Publicar Edge Functions alteradas, incluindo `_shared/security.ts`, `_shared/whatsapp.ts` e `_shared/incoming-media.ts` quando importados. Manter verificação JWT nas funções autenticadas; webhooks conferem suas próprias assinaturas.
3. Publicar `site/public` pelo Worker tna-crm. `scripts/deploy.mjs` carrega apenas as variáveis Cloudflare necessárias do .env da raiz, sem imprimi-las.
4. Conferir login público, scripts/fontes locais, CSP e bloqueio de acesso anônimo. Envios reais só com destinatário explicitamente autorizado.

## Reversão

Frontend: reverter para a versão anterior do Worker no histórico de deploys Cloudflare; como alternativa, copiar o index.html da baseline para um diretório separado e publicar junto com f.js e icone.svg preservados. Não sobrescrever a árvore de trabalho atual.

Edge Functions: versões anteriores preservadas na baseline. Republicar esses arquivos mantendo o verify_jwt original. Novas funções podem permanecer sem uso até correção. Migrations são aditivas e compatíveis com o frontend anterior; preferir correção para frente. Não excluir mensagens, mídias ou bucket para reverter interface. Para reverter definições de funções, usar as definições preservadas com revisão do impacto; o schema.json contém as funções privadas anteriores.

Exceção de segurança: não restaurar o antigo `equipe/link_acesso`, que devolvia recovery links ao administrador da empresa. A conta do titular pode pertencer a outras empresas; a recuperação deve continuar sendo entregue exclusivamente ao e-mail dele.

## Configuração e limites conhecidos

- `NEOGO_ALLOWED_HOSTS`: lista de hosts exatos HTTPS, separada por vírgula, no ambiente das Edge Functions. Precisa do domínio real do provedor. Endereços fora da lista e redirects são recusados antes de enviar credenciais.
- NeoGo exige assinatura quando o secret existe; slot não é alterado se a leitura falhar ou se estiver ocupado. Resposta HTTP sem prova de conexão não ativa a integração. Contrato e pareamento precisam de piloto com instância real.
- `WHATSAPP_GRAPH_VERSION` permite mudar a versão dos novos recursos de atendimento. Padrão v21.0 preserva a conexão existente; migrar somente após validar compatibilidade. O enriquecimento Meta Ads existente não foi ampliado.
- Modelos: texto aprovado com BODY, FOOTER e HEADER de texto; variáveis posicionais e nomeadas. Formatos de botões e cabeçalhos de mídia ainda não estão disponíveis. Listagem inicial limitada a 100 registros da Meta.
- Mídias: JPG/PNG até 5 MB; WebP até 500 KB; MP4/MP3/OGG/M4A até 16 MB; PDF até 20 MB. Bucket privado, sem policy de acesso direto pelo navegador. URL assinada dura 5 minutos. Webhook grava primeiro a mensagem e copia a mídia imediatamente; falhas transitórias retornam 503 para reentrega. Arquivos históricos ainda não copiados são buscados ao abrir; arquivos expirados na Meta podem exigir reenvio.
- Recibos usam ordenação e uma fila privada quando chegam antes do ID do envio. A fila conserva eventos por até 30 dias; cada recebimento remove expirados. Texto, erro estruturado e data do provedor permanecem sob RLS.
- Um timeout de envio mantém estado pendente, pois o provedor pode ter aceitado a mensagem. Não reenviar automaticamente. Consultar webhook/histórico; o ID da tentativa evita duplicação enquanto mantido pelo cliente.
- Texto, modelo e mídia oficiais incluem o ID da tentativa em `biz_opaque_callback_data`. O webhook associa esse recibo ao envio pendente somente na mesma empresa e no canal oficial.
- Resposta citada: disponível para texto na janela aberta da API oficial. A mensagem referenciada precisa pertencer à mesma conversa e ter ID do provedor. NeoGo ainda depende de validação desse contrato.
- Limites atômicos por usuário e minuto: 30 tentativas novas de envio (texto/modelo/mídia), 20 novas conversas e 10 ações de convite/recuperação. São janelas fixas; o limite pode permitir duas cotas perto da virada do minuto. Repetição de um envio já registrado não cria outro. Webhooks não são descartados por esses limites.
- Equipe > Enviar recuperação envia e-mail pelo Supabase Auth e não devolve link ao administrador. Depende do serviço SMTP já configurado e dos limites de Auth. Não foram enviados e-mails reais durante a validação; nenhum provedor pago foi contratado.
- Uploads têm limite também durante a leitura do corpo, mesmo sem Content-Length, antes de decodificar o formulário.
- Logs do MCP continuam indisponíveis por falta de analytics:read. Consultar Dashboard Supabase > Edge Functions > função > Logs. Nunca registrar token, corpo integral da mensagem ou URL de webhook com segredo.
- A proteção global de senhas vazadas depende de configuração/plano do Supabase e não foi alterada, pois Auth é compartilhado com o gestor de tarefas.

Referências de contrato: [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes), [mídia na coleção oficial Meta](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3), [modelos no SDK oficial WhatsApp](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).

## Conectar e conferir os canais

API oficial: em Ajustes > Integrações, abra “Como conectar este número”. Salve os IDs da WABA e do número, token do usuário do sistema e App Secret. Use Testar conexão, confira “Diagnóstico da conexão” e configure o webhook. O diagnóstico mostra token, validade, permissões de envio/modelos, inscrição, qualidade, última entrada e último teste. Consulta bem-sucedida não comprova entrega; conclua com ida e volta usando número autorizado. Referência: [coleção oficial da Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

NeoGo: é necessário conhecer a URL base real, autorizar seu host em NEOGO_ALLOWED_HOSTS, salvar ID/token da instância e confirmar pareamento no provedor. Registrar somente slot comprovadamente livre. As rotas atuais permanecem condicionadas ao contrato real; texto, eco, mídia, resposta e reconexão ainda precisam do piloto. Não usar o n8n ou alterar seus slots para contornar essa dependência.

Token expirado: salvar novo token e testar. Permissão ausente: rever os ativos do usuário do sistema e gerar token com whatsapp_business_messaging/whatsapp_business_management. Webhook não inscrito: configurar no app dedicado e conferir messages. Número acessível sem entrada: comparar URL de retorno e logs. Janela fechada: enviar modelo aprovado. Status pendente: aguardar recibo e conferir histórico antes de iniciar nova tentativa.

## Dados, retenção e incidente

Mensagens e mídias ficam preservadas; não foi ativada exclusão automática de conteúdo dos clientes. Recibos ainda sem correspondência são limpos após 30 dias, e contadores após um dia, durante o próximo uso de cada mecanismo. A exportação de leads existente permanece disponível em Ajustes > Dados; não equivale a backup completo de conversas e arquivos.

Antes de excluir dados de uma empresa: obter autorização com escopo, produzir exportação restrita por empresa, verificar objetos no prefixo do bucket e executar a exclusão de forma auditável. Exclusão de linha do banco não garante remoção do arquivo no Storage. Não há agendamento novo de expurgo nem exportação integral de conversas nesta entrega.

Incidente de acesso: suspender o acesso afetado, revogar sessões e rotacionar credenciais expostas no provedor/Vault; preservar apenas logs necessários, sem copiar tokens nem mensagens para tickets. Verificar empresa, canal, ID interno da mensagem e horários. Recuperações seguem o [fluxo de e-mail do Supabase](https://supabase.com/docs/guides/auth/passwords), nunca fornecendo recovery links a outros membros.
