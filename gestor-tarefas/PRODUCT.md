# Gestor interno de tarefas

Ferramenta da The New Ads para Douglas, seu irmão e um terceiro colaborador receberem, organizarem e concluírem demandas. Substitui o uso diário do ClickUp, sem funções de IA. Referência solicitada: minimalismo, navegação familiar e densidade de um gestor de tarefas.

Hierarquia existente: espaços, pastas, listas, tarefas e um nível de subtarefas. Permissões por associação ativa no schema tarefas do Supabase; clientes do CRM não devem acessar. Não é um produto SaaS multitenante. Comentários, responsáveis, prioridades, datas, recorrência e notificações já existem.

Frontend estático HTML/CSS/JavaScript publicado no Cloudflare em tarefas.thenewads.com.br. Banco e autenticação no projeto Supabase xrvjlhseyqfgyvwwlwwb. Manter dados existentes e isolamento em relação ao CRM. Dados de teste ficam fora de site/public e nunca são publicados.
