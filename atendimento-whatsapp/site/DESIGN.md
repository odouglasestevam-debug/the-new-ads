# Monitor de atendimento: sistema visual

Vale só para esta tela (`atendimento.thenewads.com.br`). O resto do workspace segue `marca/design-guide.md` (The New Ads).

## Identidade

- É painel do cliente: usa a marca da **Sapataria do Futuro**. A The New Ads só assina no rodapé.
- Faixa do topo e bloco da nota em azul-marinho `#132a56`, com o logo branco (`public/logos/sapataria-do-futuro.png`).
- Superfície clara: fundo `#f2f4f8` e cartões brancos. A escolha vem do uso: equipe no celular, no balcão do shopping, com luz forte.
- Fonte única: Archivo, servida pelo próprio site (`public/fontes/`), já que a CSP só aceita fonte do mesmo domínio. Números grandes em peso 750.
- Tela de entrar: formas geométricas da peça impressa da marca (quartos de círculo e listras), com as cores originais.

## Cor tem papel fixo

| Papel | Cores | Regra |
|---|---|---|
| Pilar da nota | Agilidade `#2c5092` · Condução `#d06d3d` · Compromisso `#a23a4c` · Retorno `#228e70` · Formato `#e1a52f` | A mesma cor marca o pilar em toda a tela: barras, marcadores, grupos de tabela e seções de detalhe. Cor de marca ajustada só no claro/escuro pra passar no validador de daltonismo (pares vizinhos, superfície branca). |
| Situação | Na meta (verde), Perto da meta (âmbar), Longe da meta (vermelho), Sem dado (cinza) | Sempre ícone e texto juntos. Na meta = 100 pontos; perto = 70 a 99; longe = abaixo de 70. Nota: 85+ bom, 70 a 84 atenção, abaixo de 70 precisa melhorar. |
| Tempo de espera | rampa azul `--az1` a `--az6` | Mais escuro, mais demorado (histograma e mapa de calor). |
| Rapidez do retorno | rampa verde `--vd1` a `--vd4` | Mais escuro, mais rápido. |
| Fora dos pilares | azul-marinho `#132a56` e `#b9c3d6` | Volume, tipos de conversa, serviços. |

- Texto nunca usa a cor do dado. A cor do pilar fica na barra ou no marcador ao lado.
- Dourado tem pouco contraste no branco, por isso toda barra dourada leva o número escrito do lado.
- Tokens em `public/estilo.css` (`:root`). As classes `.p-agi`, `.p-con`, `.p-com`, `.p-ret`, `.p-for` e `.p-neu` definem `--p` (marca), `--pt` (trilho), `--pi` (texto) e `--pf` (fundo).

## Estrutura da aba Unidade

A ordem é a mesma da nota:

1. **Nota:** o número no bloco azul-marinho, com a faixa 0 a 70 a 85 a 100. Ao lado, "De onde vem a nota", com uma barra por pilar.
2. **Metas do período:** os 10 KPIs com meta, agrupados por pilar. Cada linha tem resultado, meta, barra de pontos (cheia = meta batida) e a situação.
3. **Detalhe por pilar:**
   - Agilidade: números, histograma da espera e mapa de calor.
   - Condução e compromisso: caminho da oportunidade e modo balcão.
   - Retorno: números e barra de quando a loja voltou.
   - Formato: mensagens por tipo.
4. **Contexto:** volume, atendimentos por dia, tipos de conversa e serviços. Não entra na nota.

Todo número ou barra que tem conversa por trás é clicável e abre a lista na gaveta lateral, e da lista se abre a conversa.

## Gráficos

- Feitos à mão (HTML e SVG), sem biblioteca.
- Barra até 24px de grossura, ponta arredondada de 4px e base reta.
- Linha de 2px, ponto com anel branco e grade em linha fina contínua.
- Dica ao passar o mouse ou ao focar com o teclado, preenchida com `textContent`. A dica nunca é o único jeito de ler o valor.
- Gráfico de linha desenhado na largura real do cartão, redesenhado quando a largura muda (ResizeObserver).
- Unidades sem cor própria: a evolução semanal da rede usa um gráfico pequeno por unidade, pra não competir com as cores dos pilares.

## Ícones

SVG de traço único (24x24, traço 2) definidos em `ICONES` no `app.js`. Nada de emoji nem glifo no lugar de ícone.
