# Entrega do CRM — 20/09/2026

Publicado em https://crm.thenewads.com.br/. Escopo exclusivo: `sistema-novo`, Worker `tna-crm`, Supabase `xrvjlhseyqfgyvwwlwwb`. Não representa conclusão integral de todas as etapas do plano.

## Versão publicada

Atualização posterior de design/UX com Impeccable: frontend `c93eacce-ec50-48ce-b206-c6e09b221573`, descrito em [UX-CRM.md](UX-CRM.md). As versões de funções e migrations abaixo permanecem vigentes; a versão de Worker a seguir é a entrega funcional anterior.

- Worker: `4127c0f0-887d-41a9-b77f-0b09d243046b`.
- Versão imediatamente anterior: `64527c83-fb39-4585-9cc3-3357ef904505`.
- Migrations CRM 0012–0019 aplicadas, em três lotes: `crm_conversas_seguranca_midias_20260920`, `crm_busca_recibos_20260920` e `crm_limites_atomicos_20260920`.

| Edge Function | Versão |
|---|---:|
| whatsapp-enviar | 7 |
| whatsapp-webhook | 3 |
| neogo-webhook | 3 |
| whatsapp-modelos | 3 |
| whatsapp-midia | 3 |
| whatsapp-lida | 1 |
| equipe | 3 |
| integracoes | 7 |

## Comportamentos entregues

Conversas: layout compacto com painel do contato recolhível, navegação mobile, filtros, busca no histórico acessível, paginação de conversas e mensagens, atualização parcial por realtime com fallback, rascunhos e rolagem preservados. Envios usam balão otimista e identificador persistido por tentativa. Texto oficial permite citar mensagem da própria conversa.

WhatsApp oficial: modelos de texto aprovados com variáveis e prévia, envio/abertura de mídias permitidas, armazenamento privado, URLs temporárias, leitura na API, recibos ordenados e associação de confirmação tardia. Webhook grava a mensagem antes do enriquecimento existente e retorna erro transitório quando a persistência falha. Ajustes mostra guia de conexão e diagnóstico de token, permissões, qualidade, webhook e última entrada.

Segurança: permissões verificadas no servidor, isolamento e integridade por empresa, MFA exigido quando já configurado, headers no domínio, SDK/fontes locais, limites atômicos, upload com tamanho limitado durante a leitura e restrição de hosts NeoGo. Recuperação de senha da equipe vai ao e-mail do titular; não retorna recovery link ao administrador.

## Evidências

- `npm test`: **17/17**, incluindo suíte SQL legada **37/37**, isolamento, MFA, idempotência, resposta citada, recibos, limites, recuperação de equipe, diagnósticos e mídia. PostgreSQL descartável PGlite e funções com provedores simulados.
- `npm run test:browser`: aprovado em Chromium, com desktop e mobile de 390/360 px, composer/foco, rascunhos, scroll, paginação, filtros, modelo, resposta citada, diagnóstico, recuperação e preview de formulário.
- Volume simulado: histórico de 5.000 mensagens inicia com 50 renderizadas. Essa medição local não representa latência do banco ou provedor em produção.
- `tests/deployed-smoke.mjs`: conferência de hashes de 18 assets, headers, login público e acesso anônimo bloqueado em tabelas e funções. Resultado datado em `tests/artifacts/deploy.json`.
- Leitura do banco após deploy: 19 mensagens e seis conversas, mesmos totais anteriores; bucket privado; RPCs de recibos e de cotas indisponíveis a usuários autenticados comuns.
- Capturas em `tests/artifacts/` usam dados fictícios; login publicado não contém dados de usuários.
- Nenhuma mensagem de WhatsApp ou recuperação de e-mail real foi enviada pelos testes.

## Pendências que impedem a homologação completa

1. Número controlado e autorização explícita para teste de ida/volta oficial: texto, modelo, mídia de cada classe, resposta, recibos e reconexão com sessão real.
2. URL/versão e instância NeoGo para confirmar contrato, pareamento, slots, assinatura, eco do celular, mídias e respostas. Credenciais devem ser salvas pela interface segura, não em documentos ou logs.
3. Atualizar a Graph somente após validar compatibilidade com a integração existente. O padrão v21.0 foi preservado; WhatsApp permite configuração por WHATSAPP_GRAPH_VERSION.
4. Validar entrega SMTP da recuperação com destinatário autorizado. O fluxo foi testado com simulação; depende do serviço de e-mail configurado no Supabase.
5. Logs via Dashboard enquanto o conector não possui analytics:read. Proteção global de senhas vazadas permanece sem alteração no Auth compartilhado.

O backlog adicional, incluindo telas secundárias, templates avançados e exportação integral, está delimitado em [PLANO-MELHORIA-CRM.md](PLANO-MELHORIA-CRM.md). Não foi ativada exclusão automática de conteúdo nem contratado recurso pago.

## Tokens

350.000 tokens é a estimativa total do plano, não consumo medido. Não existe contador verificável por etapa nesta execução. Não são apresentados saldos fictícios ou percentuais de consumo. Etapas e evidências permanecem separadas para permitir revisão antes do próximo lote.

Conexão, limites conhecidos, incidente e reversão: [OPERACAO.md](OPERACAO.md). Sistema visual: [DESIGN.md](DESIGN.md).
