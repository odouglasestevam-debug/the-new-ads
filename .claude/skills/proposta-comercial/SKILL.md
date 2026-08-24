---
name: proposta-comercial
description: >
  Gera uma proposta comercial profissional em HTML a partir de um briefing em texto livre.
  Aplica a identidade visual da marca do usuário (cores, fontes do design-guide.md).
  Use quando o usuário mencionar "proposta", "proposta comercial", "orçamento",
  "apresentação de projeto" ou pedir um documento de venda para um cliente.
---

# /proposta-comercial — Geração de Proposta

## Dependências

- **Identidade visual:** `marca/design-guide.md`
- **Contexto do negócio:** `_contexto/empresa.md`
- **Tom de voz:** `_contexto/preferencias.md`

---

## Workflow

### Passo 1 — Coletar o briefing

Se o usuário ainda não forneceu um briefing completo, perguntar:

1. "Nome do cliente e empresa?"
2. "Qual é o problema ou necessidade do cliente?"
3. "O que você propõe fazer? (serviço ou produto)"
4. "Qual é o valor? (pode ser range ou 'a definir')"
5. "Tem prazo ou entregável específico?"

Se o usuário já forneceu as informações de forma livre, extrai o que der e prossegue sem fazer todas as perguntas.

### Passo 2 — Ler os arquivos de contexto

- Ler `marca/design-guide.md` pra aplicar cores e fontes
- Ler `_contexto/empresa.md` pra dados do prestador (nome, serviços, contato)
- Ler `_contexto/preferencias.md` pra tom da proposta

### Passo 3 — Gerar o HTML

Criar um arquivo HTML completo com as seguintes seções:

**Estrutura da proposta:**
1. Header — logo/nome da empresa prestadora + data. Se o design guide tiver logo definido na seção **Logo**, usar a imagem (largura 140-180px). Escolher a versão correta (fundo claro ou escuro) conforme o estilo da proposta. Se não tiver logo, usar o nome da empresa em texto
2. Destinatário — "Proposta para [Cliente]"
3. O problema — o desafio que o cliente enfrenta, direto ao ponto (1 parágrafo curto, no máximo 2-3 frases, sem repetir a mesma ideia com outras palavras)
4. A solução — o que você propõe e por que resolve, também em 1 parágrafo curto
5. Escopo — o que está incluído (lista clara). Se o cliente usa Shopify + checkout Yampi, considerar incluir otimização do fluxo de checkout (upsell/order bump, campos, tempo de carregamento) como item de escopo quando fizer sentido pro objetivo do projeto, não só as páginas de produto
6. O que NÃO está incluído (quando relevante — evita conflito depois). Não listar o óbvio nem itens que não se aplicam ao contexto do cliente (ex: não citar migração de plataforma se o cliente acabou de migrar e não há motivo pra migrar de novo)
7. Prazo e entregáveis
8. Investimento — valor com contexto de ROI quando possível
9. Próximos passos — call to action claro e curto, sem parágrafo de venda extra
10. Sobre a empresa — 1-2 linhas sobre quem entrega, não 3-4

**Estilo visual:**
- Aplicar cores e fontes do `marca/design-guide.md`
- Se design guide estiver vazio, usar: fundo branco, texto escuro, acento em azul escuro (#1E3A5F), tipografia limpa
- Layout de uma coluna, responsivo, leve
- Seções com espaçamento generoso
- Valor em destaque visual (não escondido)

### Passo 4 — Salvar e oferecer publicação

Salvar em `propostas/proposta-[nome-cliente]-[data].html`

Perguntar: "Quer que eu publique essa proposta com um link compartilhável? É só chamar `/publicar-site` passando o arquivo."

---

## Regras

- Tom da proposta segue `_contexto/preferencias.md`
- Nunca inventar valor, prazo ou escopo — se não foi fornecido, deixar placeholder claro pra preencher
- A proposta deve soar como veio de uma pessoa, não de um template corporativo
- Sem jargão desnecessário ("soluções inovadoras", "entregamos valor", etc)
- **Direto ao ponto, sem firula:** parágrafos curtos (1-3 frases), sem repetir a mesma ideia de formas diferentes, sem frase de efeito antes de chegar no ponto. Cortar qualquer trecho que só existe pra "soar bem" e não carrega informação nova
- Toda lista (escopo, o que não está incluído) reflete só o que é real e específico pro cliente daquela proposta, nunca item genérico de template
