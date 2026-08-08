# Mental Math

> **Manutenção:** sempre atualize este README quando mudar o funcionamento do app, especialmente a geração, a seleção ou a progressão das contas.

## Como o app funciona hoje

O Mental Math é um PWA local: funciona diretamente no navegador, pode usar o cache para abrir offline e guarda configurações, perfis de habilidade e histórico no localStorage do próprio dispositivo. Não há conta de usuário nem sincronização em servidor.

## Única exceção ao modo offline

Tudo funciona offline, com **uma única exceção**: as fontes do Google Fonts carregadas no `index.html`. Elas dependem da rede. Depois da primeira visita online elas ficam em cache (como resposta opaca do service worker), então as aberturas seguintes já usam as fontes reais mesmo sem conexão. Apenas a primeira abertura offline logo após instalar o app cai para as fontes de fallback locais. O restante — HTML, CSS, JS, dados — nunca depende da rede.

O treino é organizado por **famílias de cálculo** (habilidades), e não por uma conta específica. Há 25 famílias, cobrindo somas, subtrações, multiplicações, divisões, porcentagens, expressões, frações, potências, radicais, logaritmos e equações. Na configuração, a pessoa pode escolher uma ou mais delas, ou marcar **Treinar todas as contas**. Todas as famílias ficam selecionáveis desde o início; os pré-requisitos são usados apenas como um sinal de prioridade, não como bloqueio.

O botão **Iniciar treino** começa imediatamente com a configuração salva. Para alterá-la, acesse **Ajustes** e toque em **Configurar treino** para abrir a tela de configuração; as alterações são salvas na hora. Durante a sessão, o cabeçalho mostra apenas o tempo restante.

### Escolha da próxima conta

Para cada pergunta, o motor considera somente as famílias selecionadas e segue esta ordem:

1. **Revisão de retenção:** se alguma habilidade já dominada chegou à data de revisão, ela tem prioridade. Entre elas, vem primeiro a que está mais atrasada; em empate, a que tem menos respostas na revisão atual.
2. **Calibração:** habilidades novas recebem oito respostas corretas de calibração. Enquanto houver famílias nessa fase, o motor distribui as perguntas de forma equilibrada, escolhendo aleatoriamente entre as que têm menos calibrações (ou no máximo uma a mais), em um grupo de até quatro habilidades.
3. **Treino adaptativo:** terminada a calibração, cada família recebe uma pontuação de prioridade. Ela aumenta quando a pessoa está lenta em relação à meta, erra mais ou fica menos vezes dentro da meta. Diminui se a família acabou de aparecer e também recebe uma pequena penalidade se seus pré-requisitos ainda não foram dominados.

No estilo **Foco**, é escolhida a habilidade com maior pontuação (o gargalo atual). No estilo **Misto**, o motor sorteia uma entre as três maiores pontuações, alternando o treino sem perder o foco nos gargalos. Se só houver uma habilidade selecionada, ela é sempre usada.

Depois de escolher a família, o gerador cria uma conta compatível com ela. A dificuldade individual parte do perfil da habilidade e recebe uma pequena variação aleatória; o motor tenta evitar repetir os últimos 24 enunciados daquela família. Os geradores produzem respostas inteiras e, quando aplicável, divisões exatas, resultados de frações inteiros e expressões válidas.

### Adaptação, metas e domínio

A meta inicial de tempo de uma habilidade é 85% da mediana das oito respostas corretas de calibração (limitada entre 450 ms e 10 s). A partir de pelo menos oito respostas pontuadas recentes:

- com pelo menos 88% de acerto e 65% dentro da meta, a dificuldade sobe e a meta fica 2% mais curta;
- com menos de 70% de acerto, a dificuldade cai e a meta fica 4% mais longa, sem ultrapassar o tempo-base;
- com menos de 45% dentro da meta, a dificuldade cai levemente e a meta fica 2,5% mais longa.

O domínio exige, nas últimas 12 respostas pontuadas, pelo menos 90% de acerto, 75% dentro da meta e regularidade de tempo. Ao dominar uma habilidade, o app agenda revisões após 1, 3, 7, 14 e 30 dias. Cada revisão pede três respostas corretas; um erro remove o status de domínio, reduz a dificuldade e afrouxa a meta.

O tempo usado pelo motor é o tempo cognitivo: por padrão, vai da apresentação da conta até a primeira tecla digitada. Essa opção pode ser desligada para usar o tempo total até a confirmação. O prazo de resposta padrão é cancelado assim que a pessoa começa a digitar, evitando que uma resposta de vários dígitos expire no meio.

### Sessões e dados

As sessões podem ser Sprint (duração configurável), Resistência (sem limite), Intervalado (trabalho, descanso e ciclos configuráveis) ou HIIT (10 blocos de 40 s de trabalho e 20 s de descanso). Ao final — ou ao sair depois de responder ao menos uma conta — o app salva o resumo, incluindo acerto, tempos, taxa dentro da meta, desempenho por habilidade e melhor sequência.

Aplicativo local de treino de cálculo mental. Abra `index.html` no navegador para usá-lo; os dados ficam salvos apenas no dispositivo.

## Tempo limite para responder

Em **Ajustes > Treino**, escolha em segundos o prazo para começar uma resposta. Se nenhuma tecla for digitada até o prazo, a conta é registrada como incorreta. Depois que a pessoa começa a digitar, esse prazo é cancelado para que uma resposta com vários dígitos não seja interrompida.

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
