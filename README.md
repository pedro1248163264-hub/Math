# Mental Math

> **Manutenção:** sempre atualize este README quando mudar o funcionamento do app, especialmente a geração, a seleção ou a progressão das contas.

## Como o app funciona hoje

O Mental Math é um PWA local: funciona diretamente no navegador, pode usar o cache para abrir offline e guarda configurações, perfis de habilidade e histórico no localStorage do próprio dispositivo. Não há conta de usuário nem sincronização em servidor.

## Única exceção ao modo offline

Tudo funciona offline, com **uma única exceção**: as fontes do Google Fonts carregadas no `index.html`. Elas dependem da rede. Depois da primeira visita online elas ficam em cache (como resposta opaca do service worker), então as aberturas seguintes já usam as fontes reais mesmo sem conexão. Apenas a primeira abertura offline logo após instalar o app cai para as fontes de fallback locais. O restante — HTML, CSS, JS, dados — nunca depende da rede.

O treino é organizado por **famílias de cálculo** (habilidades), e não por uma conta específica. Há 29 famílias, cobrindo somas, subtrações, multiplicações, divisões, porcentagens, expressões, frações, potências, radicais, logaritmos, equações e contas com vírgula. Na configuração, a pessoa pode escolher uma ou mais delas, ou marcar **Treinar todas as contas**. Todas as famílias ficam selecionáveis desde o início; os pré-requisitos são usados apenas como um sinal de prioridade, não como bloqueio.

O botão **Iniciar treino** começa imediatamente com a configuração salva. Para alterá-la, acesse **Ajustes** e toque em **Configurar treino** para abrir a tela de configuração; as alterações são salvas na hora. Durante a sessão, o cabeçalho mostra apenas o tempo restante.

### Escolha da próxima conta

Para cada pergunta, o motor considera somente as famílias selecionadas e segue esta ordem:

1. **Revisão de retenção:** se alguma habilidade já dominada chegou à data de revisão, ela tem prioridade. Entre elas, vem primeiro a que está mais atrasada; em empate, a que tem menos respostas na revisão atual.
2. **Calibração:** habilidades novas recebem oito respostas corretas de calibração. Enquanto houver famílias nessa fase, o motor distribui as perguntas de forma equilibrada, escolhendo aleatoriamente entre as que têm menos calibrações (ou no máximo uma a mais), em um grupo de até quatro habilidades.
3. **Treino adaptativo:** terminada a calibração, cada família recebe uma pontuação de prioridade. Ela aumenta quando a pessoa está lenta em relação à meta, erra mais ou fica menos vezes dentro da meta, e recebe uma pequena penalidade se seus pré-requisitos ainda não foram dominados.

Não existe mais um estilo "Foco" ou "Misto" configurável — há um único motor de sequência, usado em todos os modos:

- **Interleaving ponderado:** em vez de sempre repetir a família de maior pontuação, o motor sorteia entre as até cinco maiores, com peso proporcional à pontuação de cada uma. A mesma família nunca é escolhida duas vezes seguidas, e nenhuma família passa de 40% das últimas 10 escolhas — mistura de verdade, não só evita repetição imediata.
- **Retry pós-erro:** ao errar uma conta de uma família, ela reaparece dentro de 3 a 6 itens depois (nunca no item seguinte, por causa da regra acima) — fecha o ciclo de correção sem virar repetição espaçada de item específico.
- **Peso por padrão dentro da família:** para famílias com um atributo categórico conhecido (vai-um em somas, empréstimo em subtrações, grupo de porcentagem), o motor guarda internamente um peso por atributo — sobe quando a pessoa é mais lenta/erra mais nele, desce quando está rápida. A próxima geração fica enviesada para esse atributo, mas **nunca** repete um enunciado específico, e nunca fica 100% previsível (sempre há piso de aleatoriedade). Isso não é exposto em nenhuma tela — é só um ajuste interno de geração.

Se só houver uma habilidade selecionada, ela é sempre usada.

Depois de escolher a família, o gerador cria uma conta compatível com ela. A dificuldade individual parte do perfil da habilidade e recebe uma pequena variação aleatória; o motor tenta evitar repetir os últimos 24 enunciados daquela família. Os geradores produzem respostas inteiras e, quando aplicável, divisões exatas, resultados de frações inteiros e expressões válidas — exceto as quatro famílias com vírgula (seção abaixo), cuja resposta é sempre um decimal exato de 1 ou 2 casas, nunca dízima.

### Contas com vírgula

Além das famílias inteiras, há quatro famílias com números decimais (1 a 2 casas) — `soma_decimal`, `sub_decimal`, `mult_decimal`, `div_decimal` — uma para cada operação básica. Cada uma tem como pré-requisito a família inteira equivalente (soma/subtração de 2 dígitos com reagrupamento, tabuada) e é tratada pelo motor como uma habilidade própria, com seu próprio perfil de Elo/meta de tempo — não é uma variação de exibição das famílias inteiras.

A dificuldade extra da vírgula em si (raciocinar com casas decimais, não o tamanho do número) é tratada como um atributo próprio: assim como o motor já pesa vai-um/empréstimo/grupo de porcentagem dentro de uma família (seção "Escolha da próxima conta" acima), ele também pesa 1 vs. 2 casas decimais, enviesando a próxima geração para a quantidade onde a pessoa está mais lenta ou errando mais — sem nunca eliminar a outra.

**Comparação interna (ainda não exposta em tela):** o motor consegue calcular, a qualquer momento, o quanto a vírgula pesa de fato — comparando tempo e acerto de cada família decimal com os da família inteira "irmã" (`soma_decimal` ↔ `soma_2d_cc`, `sub_decimal` ↔ `sub_2d_ce`, `mult_decimal` ↔ `mult_tabuada`, `div_decimal` ↔ `div_tabuada`) e checando se a diferença está dentro do que já era esperado (até ~25% mais lento, até 5 p.p. a menos de acerto) ou desproporcional. Isso vive em `Engine.decimalComparison(key)` / `Engine.allDecimalComparisons()` (`assets/js/08-speed-engine.js`) e não altera dificuldade, sequenciamento nem é mostrado em nenhuma tela hoje — a tela de estatísticas precisa de uma revisão à parte antes de exibir esse tipo de dado.

No teclado numérico da sessão, uma tecla extra (vírgula ou ponto, conforme o idioma do app) fica sempre disponível; nas famílias sem vírgula ela simplesmente não se aplica. Respostas decimais sempre exigem toque em ✓ (nunca são enviadas sozinhas por contagem de dígitos), pelo mesmo motivo que respostas negativas já exigiam.

### Adaptação, metas e domínio

A meta inicial de tempo de uma habilidade é 85% da mediana das oito respostas corretas de calibração (limitada entre 450 ms e 10 s). A partir daí, a dificuldade e a meta de tempo se ajustam **continuamente, resposta a resposta** (não mais em lotes de 8): cada resultado pontuado move `difficulty`/`targetMs` num passo pequeno, na direção certa/errada/lenta. O tamanho do passo (K) é maior logo depois de uma mudança de fase (a calibração acabou de terminar, ou a pessoa acabou de perder o domínio numa revisão) — encontra o nível certo rápido — e diminui conforme mais respostas se acumulam na fase atual, ficando resistente a uma sequência ruim isolada. É o mesmo princípio do K-factor em sistemas de rating tipo Elo.

O domínio e a passagem por revisão continuam exigindo evidência acumulada (não mudou): nas últimas 12 respostas pontuadas, pelo menos 90% de acerto, 75% dentro da meta e regularidade de tempo. Ao dominar uma habilidade, o app agenda revisões após 1, 3, 7, 14 e 30 dias. Cada revisão pede três respostas corretas; um erro remove o status de domínio, reduz a dificuldade e afrouxa a meta.

Um erro digitado em menos de 350 ms (`IMPULSE_FLOOR`) é tratado como lapso motor (typo), não como falha de cálculo genuína — continua salvo no histórico, mas não entra nas contas de acerto/meta/domínio, no ajuste contínuo de dificuldade nem no peso por padrão.

O tempo usado pelo motor é o tempo cognitivo: por padrão, vai da apresentação da conta até a primeira tecla digitada. Essa opção pode ser desligada para usar o tempo total até a confirmação. O prazo de resposta padrão é cancelado assim que a pessoa começa a digitar, evitando que uma resposta de vários dígitos expire no meio.

### Sessões e dados

As sessões podem ser **Ultimate** (aberta, sem configurações — ver seção abaixo), **Intervalado** (trabalho, descanso e ciclos configuráveis) ou **HIIT** (10 blocos de 40 s de trabalho e 20 s de descanso). Ao final — ou ao sair depois de responder ao menos uma conta — o app salva o resumo, incluindo acerto, tempos, taxa dentro da meta, desempenho por habilidade e melhor sequência.

Aplicativo local de treino de cálculo mental. Abra `index.html` no navegador para usá-lo; os dados ficam salvos apenas no dispositivo.

## Modo Ultimate

O Ultimate é o modo com menos configuração possível — a ideia é o algoritmo decidir, não a pessoa. Ao tocar em **Iniciar treino** com esse modo selecionado, o app pergunta (uma vez, opcional) quanto tempo a pessoa pretende treinar; é só uma referência mostrada no anel de progresso, nunca corta a sessão.

Duas coisas ficam automáticas, só nesse modo:

- **Prazo de resposta por família:** em vez do prazo fixo em segundos de Ajustes, o prazo é `targetMs da habilidade × multiplicador`, e o multiplicador diminui conforme a fase (4× durante calibração/aquisição, 3,3× consolidando, 3× já dominado/em revisão) — sempre com um piso de segurança (~1,2 s). Como aperta junto com a própria meta de tempo, o prazo já fica mais curto sozinho conforme a pessoa evolui, sem precisar de um mecanismo separado de "aperto ao longo da sessão".
- **Pausas automáticas:** o app usa a detecção de estado da sessão (aquecimento/fluxo/fadiga/frustração) para inserir descansos sozinho — uma pausa curta (~13 s) ao detectar frustração (3+ erros recentes, ficando mais lento), e uma pausa mais longa (~35 s) ao detectar fadiga acumulada (tempo subindo e acerto caindo nas últimas 16 respostas). Depois de cada pausa, alguns itens não contam para disparar outra pausa em seguida.

A sessão em si não tem fim fixo — termina quando a pessoa sai manualmente.

## Tempo limite para responder

Em **Ajustes > Treino**, escolha em segundos o prazo para começar uma resposta. Se nenhuma tecla for digitada até o prazo, a conta é registrada como incorreta. Depois que a pessoa começa a digitar, esse prazo é cancelado para que uma resposta com vários dígitos não seja interrompida. **Esse ajuste não se aplica ao modo Ultimate**, que calcula seu próprio prazo por habilidade (ver seção acima).

Esse mesmo prazo vale como "tempo da conta" no **Intervalado** e no **HIIT**: se um bloco de trabalho terminar no meio de uma conta, o app **não cancela** a conta. Ele espera ela ser respondida — ou o prazo dela acabar — e só então entra no descanso (ou encerra a sessão, se era o último bloco). O relógio do bloco é estendido até o prazo da conta para acompanhar essa espera.

Sugestão para melhorar sem transformar o treino em frustração: comece em **10 segundos**. Quando conseguir manter cerca de **80% a 90% de acerto** por algumas sessões, reduza um segundo por vez (por exemplo, para 9 s e depois 8 s). Se a precisão cair de forma consistente, volte um segundo. O melhor limite é o que exige rapidez, mas ainda permite raciocinar corretamente.

## Estrutura do código

O motor do app fica em `assets/js/`, dividido em módulos por responsabilidade e carregados em `index.html` na ordem de dependência (por isso os nomes começam com números — `01-utils.js`, `02-engine-constants.js`, etc.). São `<script>` comuns, sem bundler nem `type="module"`, então o app continua funcionando abrindo `index.html` direto do disco. Cada arquivo começa com um comentário explicando o que ele contém e de quais outros módulos depende:

| Arquivo | Conteúdo |
|---|---|
| `01-utils.js` | Funções utilitárias genéricas (RNG, formatação, estatística). |
| `02-engine-constants.js` | Constantes do motor de progressão. |
| `03-i18n.js` | Textos PT/EN e helpers de tradução. |
| `04-operations.js` | Operações suportadas (soma, subtração, ...). |
| `05-expression-terms.js` | Geração de termos avançados (potência, raiz, log). |
| `06-skills-graph.js` | Grafo de habilidades (KC_DEFS) e geradores de exercício. |
| `07-storage.js` | Persistência local (`Store`). |
| `08-speed-engine.js` | Motor de velocidade/adaptação (`Engine`). |
| `09-feedback.js` | Fala do exercício, TTS, som e vibração. |
| `10-session.js` | Controlador de uma sessão de treino (`Session`). |
| `11-analytics.js` | Estatísticas agregadas do histórico. |
| `12-export.js` | Exportação dos dados salvos. |
| `13-ui.js` | Camada de interface (navegação e renderização das telas). |
| `14-init.js` | Inicialização do app (bootstrap, service worker). |

`tests/run-tests.js` carrega esses mesmos módulos, na mesma ordem, exceto `14-init.js` (para controlar a inicialização manualmente durante os testes).

## Testes

Com Node.js instalado:

```sh
node run-tests.js
```
