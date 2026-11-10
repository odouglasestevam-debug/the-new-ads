# Financeiro interno

Central de recebimentos da The New Ads para o Douglas (único usuário). Responde em segundos quem pagou, quem não pagou e quanto entra no mês, sem abrir o Asaas. Também cobra pelo WhatsApp de um número próprio, no lugar do WhatsApp pago do Asaas.

Fonte da verdade do dinheiro: Asaas (só leitura). Do app: nome de contato, pausa e observação por cliente, regras e textos da cobrança, histórico de mensagens e avisos. Sem funções de IA.

Frontend estático HTML/CSS/JavaScript publicado na Cloudflare em financeiro.thenewads.com.br. Banco e autenticação no Supabase xrvjlhseyqfgyvwwlwwb, schema financeiro, isolado do CRM e do gestor de tarefas. Pode ser unificado ao gestor no futuro: mesma conta, mesmo banco, mesma linguagem visual. Dados de teste ficam fora de site/public.
