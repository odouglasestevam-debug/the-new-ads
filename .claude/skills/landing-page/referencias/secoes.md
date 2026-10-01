# Catálogo de seções

Blocos pra montar a página. Nem toda página usa todos, e **a ordem muda de cliente pra cliente**
(repetir a mesma sequência em toda LP é o primeiro passo pra todas ficarem iguais).
Entre parênteses, como foi resolvido na página do Silvio.

## Abertura

| Bloco | Papel | Material |
|---|---|---|
| Navegação de vidro | Logo, 3 a 4 âncoras e o CTA sempre à mão | Logo |
| Hero com recorte | Promessa em uma frase + quem entrega. Texto à esquerda, pessoa recortada à direita com luz | Retrato em fundo liso |
| Cards flutuantes | 2 números de autoridade perto do rosto | Números reais (ou placeholder) |
| Letreiro | Palavras do universo do cliente, vazadas e cheias, entre a abertura e o conteúdo | Nada |

Título do hero: benefício concreto, curto, em duas linhas com peso diferente
("Fale em público" / "sem travar."). Subtítulo: quem, como e em que formato. Dois botões:
o CTA metálico e um secundário que leva pra seção "como funciona".

## Problema e identificação

| Bloco | Papel |
|---|---|
| Grade de dores (bento) | 6 situações que o público reconhece, com uma foto grande de gente real numa das células |
| Frase de virada | "Nada disso é falta de X. É falta de Y, e Y se aprende." + CTA |

Cada dor: título curto no presente, na voz de quem vive ("Dá branco no meio da fala") e uma
linha de consequência ("Mesmo depois de ensaiar tudo em casa").

## Produto

| Bloco | Papel | Material |
|---|---|---|
| Como funciona (mockup) | Mostrar o produto acontecendo: notebook com aula ao vivo + celular com vídeo | Foto do cliente trabalhando, vídeo curto |
| Recursos | 4 mini-cards: formato, onde, quando, como | Agenda (placeholder se faltar) |
| Trilha | Conteúdo em etapas numeradas que acendem com a rolagem | Grade do curso / etapas do serviço |
| Formatos | 2 cards lado a lado (grupo x individual, plano A x B), cada um com CTA que já marca a opção no formulário | Diferença real entre os formatos |

## Prova

| Bloco | Papel | Material |
|---|---|---|
| Autoridade | Recorte com nome gigante vazado atrás, credenciais em 4 mini-cards | Retrato, bio, números, formação |
| Galeria em esteira | Fotos de bastidor rodando | 6 a 8 fotos ou quadros de vídeo |
| Depoimentos | A única seção clara da página, cards brancos com aspas metálicas | Depoimentos com nome e autorização |

Sem depoimento real, o card fica com placeholder visível. Nunca inventar nome, profissão ou fala.

## Fechamento

| Bloco | Papel |
|---|---|
| Chamada de palco | Pessoa no centro sob o feixe de luz, frase de ação de um lado, CTA do outro |
| Convite (ingresso) | Reduz o risco: "conversar não custa nada". Substitui garantia quando o cliente não tem |
| Inscrição | Passos numerados do que acontece depois + lista do que a pessoa recebe + formulário com borda viva |
| Dúvidas | Duas colunas: título e botão à esquerda (fixo), perguntas com "+" à direita |
| Rodapé | Logo, âncoras, nome gigante vazado, direitos, CNPJ e aviso de não afiliação à Meta e ao Google |

## Formulário padrão

IDs fixos (o `scripts/qa.js` testa por eles): `#formLead`, `#nome`, `#whatsapp`, `#btnEnviar`,
`#formCard`, `#formFalha`, campos dentro de `.campo` e erro em `.erro`.

- Campos mínimos: nome, WhatsApp com máscara (10 ou 11 dígitos). O resto só se ajudar a venda
  (formato de interesse, objetivo). Cada campo a mais derruba conversão.
- `CONFIG = { webhookUrl, whatsapp }` no topo do script. Sem webhook, só mostra a confirmação.
- Captura `utm_*`, `fbclid` e `gclid` da URL e manda junto. Empurra `generate_lead` no `dataLayer`.
- Botão diz o que acontece ("Enviar e falar com o Silvio"), confirmação repete o verbo ("Dados enviados.").
- Destino do lead segue o padrão de tracking da agência (n8n gravando no Supabase, ver memória
  `n8n-fluxo-tracking-padrao`). Ligar o webhook é etapa separada, com o Douglas.

## Fórmulas de título que funcionaram

- `[Problema] tem explicação.` + "E tem treino/solução."
- `Do [ponto de partida] à [resultado final].` (trilha)
- `Duas formas de [verbo] com [nome].` (formatos)
- `Quem [fez], conta.` (depoimentos)
- `Você já sabe [X]. Agora é a sua vez de [Y].` (chamada final)

Reescrever pra cada cliente. Frase de página de referência nunca entra.
