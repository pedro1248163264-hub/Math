# Mental Math

> **Manutenção:** sempre atualize este README quando mudar o funcionamento do app, especialmente a geração, a seleção, a progressão ou a recompensa.

Treino de cálculo mental para virar uma "calculadora humana": poupar tempo em prova e no dia a dia. PWA local — roda direto no navegador (abra `index.html`), funciona offline e guarda tudo no `localStorage` do aparelho. Sem conta, sem servidor.

> **Única exceção ao offline:** as fontes do Google Fonts (`index.html`). Depois da primeira visita online ficam em cache; só a primeira abertura offline usa fontes locais de reserva.

## Ideia central (v2)

A v1 sorteava a próxima conta entre ~40 famílias, uma a uma, e ajustava a dificuldade com limiares duros — daí o "conta de 4 dígitos e depois uma de 2" e as pausas/"vou pegar mais leve". A v2 troca isso por três princípios:

1. **Trilhas com levels.** Cada operação é uma escada de levels. Um level fixa a *forma* das contas (ex.: "3 dígitos × 1 dígito") e uma **meta de tempo** própria. Só o que varia suavemente dentro do level (tamanho dos números, vai-um…) é adaptativo.
2. **Adaptação contínua e suave.** Dentro do level existe uma posição `m ∈ [0,1]` que anda um passinho a cada conta rumo à **taxa de acerto desejada** (ρ\*). Nunca há salto de dígitos entre contas seguidas.
3. **Recompensa e motivo para voltar.** XP, level por trilha, level geral, estrelas, prova de nível, rodadas curtas com fim, meta diária, sequência de dias.

## Trilhas e levels

9 trilhas; 4 ativas por padrão (as demais são ligadas na aba **Trilhas**):

| Trilha | Levels | Ativa por padrão |
|---|---|---|
| Soma | 11 (unidades → 4 dígitos + 4 dígitos, com **3 levels de várias parcelas** no meio e no fim) | sim |
| Subtração | 11 (idem: a − b − c e a − b − c − d) | sim |
| Multiplicação | 11 (tabuada 2–5 → 3 dígitos × 2 dígitos, com **3 levels de 3 fatores**) | sim |
| Divisão | 9 (tabuada → 4 dígitos ÷ 1 dígito, com **3 levels de divisões em sequência**) | sim |
| Porcentagem | 6 (10% e 50% → acréscimo/desconto → "é quantos %?" → valor original, variação e descontos sucessivos) | não |
| Contas com vírgula | 6 | não |
| Frações | 5 (soma/subtração, multiplicação/divisão, comparação) | não |
| Expressões | 15 (parênteses, cadeias, dois parênteses, **potências, cubos e raízes simples**, **ordem das operações**, **sinal na frente do parêntese**, **× e ÷ em ordem**, **colchetes**, **chaves** **potência de grupo** e, depois deles, **4 levels de misturas com números maiores**) | não |
| Equações | 5 | não |

Potenciação e radiciação **não são trilhas**: aparecem só dentro das Expressões, de forma leve (quadrados de bases até 13, cubos de bases até 5 — inclusive negativas, p.ex. (−3)³ — e raízes quadradas exatas até √169), para treinar a ordem das operações.

Cada level tem nome, **meta de tempo** (ex.: Soma Nv 1 = 1,0 s … Nv 10 = 5,8 s) e uma **dica de tática** (mostrada na primeira vez que o level aparece, na prova e na aba Trilhas). **Números negativos:** nos levels finais de dois números de Subtração (3 dígitos − 3 dígitos em diante), Multiplicação (2 dígitos × 2 dígitos em diante) e Divisão (3 dígitos ÷ 2 dígitos e 4 dígitos ÷ 1 dígito) — os levels de várias parcelas não têm sinais —, de ~22% a ~38% das contas (sobe com `m`) vêm com sinal — `menor − maior`, `a − (−b)`, `(−a) × b`, `(−a) ÷ (−b)` — mantendo o número de dígitos do level. A resposta pode ser negativa (tecla ±, ✓ para confirmar) e a dica do level explica a regra de sinais. Essas contas não entram nos pesos de vai-um/empréstimo.

### Expressões: grupos, colchetes e chaves

Os 5 últimos levels da trilha (7–11) usam uma **árvore de expressão** (`X` em `05-expression-terms.js`) em vez de lista de termos, para poder aninhar grupos. Contas **pequenas de propósito**: o foco é a estrutura (sinal, ordem, aninhamento), não o cálculo pesado — o gerador rejeita qualquer conta cujo resultado **ou operando** passe do limite do level (100 nos levels 7–9, 150 no 10, 120 no 11).

| Lv | Nome | O que treina | Exemplo |
|---|---|---|---|
| 7 | Sinal na frente do parêntese | `−` na frente do grupo troca o sinal de tudo dentro | `20 − (5 − 2)`, `−(3 − 8) + 4` |
| 8 | Multiplicação e divisão em ordem | `×` e `÷` têm a mesma prioridade (esq → dir), antes de `+`/`−` | `24 ÷ 6 × 2`, `(14 + 10) ÷ 6` |
| 9 | Colchetes e parênteses | `[ ]` é só um parêntese de outro formato; de dentro para fora | `[(8 + 4) × 2] − 5` |
| 10 | Chaves, colchetes e parênteses | idem, três níveis: `( )` → `[ ]` → `{ }` | `{30 − [4 + (9 − 6)]} × 2` |
| 11 | Potência de grupo e sinais | potência aplicada ao grupo; `−3²` ≠ `(−3)²` | `(2 + 3)²`, `−3² + 20`, `(−4)² − 5` |

- **O formato do símbolo vem do aninhamento**, não é sorteado: o grupo mais interno é `( )`, o que contém um `( )` é `[ ]` e o que contém um `[ ]` é `{ }` (máx. 3 níveis). Os três são o mesmo símbolo matemático (agrupar); a tela os desenha igual, só muda o formato.
- Divisões são sempre **exatas** em todos os passos (o gerador parte do quociente) e a resposta é inteira; pode ser negativa (tecla ±).
- **Voz:** cada símbolo é dito pelo nome ("abre colchetes", "fecha chaves") e o `−` na frente de grupo/base é lido como "menos".
- **Tela:** a fonte encolhe com o tamanho da conta (`.fit-chars`) para não passar da largura do celular.
- **Migração:** quem já tinha concluído a trilha (6/6) antes dos levels novos volta ao level 7 (as estrelas ficam); trilhas realmente concluídas não mudam.

### Contas de várias parcelas (Soma, Subtração, Multiplicação e Divisão)

Além das contas grandes entre **dois** números, cada operação básica tem 3 levels em que a **mesma operação se repete** em 3–4 números **menores** (ex.: `384 + 278 + 398 + 210`, `20 × 3 × 15`, `1250 − 384 − 278 − 210`, `2520 ÷ 3 ÷ 4 ÷ 5`). Nada de misturar tipos de conta aqui — isso é papel das Expressões. Eles ficam **intercalados** com os levels de dois números, para equilibrar "uma conta grande" e "várias contas pequenas":

| Trilha | Levels de várias parcelas (posição na escada) |
|---|---|
| Soma | 5 — 3 números de 2 dígitos · 8 — 3 números de 3 dígitos · 11 — 4 números de 3 dígitos |
| Subtração | 5 — a − b − c (2 dígitos) · 8 — a − b − c (3 dígitos) · 11 — a − b − c − d |
| Multiplicação | 3 — 3 fatores de 1 dígito (às vezes 4) · 6 — 3 fatores com uma dezena redonda (`20 × 3 × 15`) · 11 — 3 fatores de até 2 dígitos |
| Divisão | 3 — duas divisões na tabuada · 6 — 3 dígitos ÷ 1 dígito ÷ 1 dígito · 9 — 4 dígitos em 3 divisões |

- **Gerador** (`addChain`, `subChain`, `mulChain`, `divChain` em `06-tracks.js`): devolve `terms`/`ops` (mesmo formato das cadeias de Expressões, então tela, voz e correção já funcionavam) e `features.chain`. Somas têm parcelas "redondas" ocasionais (ex.: 210); subtrações partem do resultado (nunca ≤ 0); divisões partem do quociente (exatas em **todos** os passos); produtos têm teto (ex.: 3 fatores de 2 dígitos ≤ 3 000–9 000).
- **Meta e limite próprios:** cada level tem sua `goal` (ex.: Soma 4 números de 3 dígitos = 6,8 s), pequena/grande e meta × limite funcionam como nos demais.
- **Tela:** contas com 3+ parcelas encolhem a fonte pelo nº de caracteres (`.fit-chars`), como as expressões longas.
- **Migração de quem já treinava:** a escada antiga foi remapeada (`LADDERS` em `06-tracks.js`, `remapLadder` em `07-storage.js`): level, estrelas, subida em andamento, recordes, janela de contas, dicas vistas, histórico e marcos acompanham o level antigo para a nova posição (a forma de cada level é preservada). Os levels novos começam sem estrela e mostram a dica na primeira vez; quem tinha **concluído** a trilha volta ao primeiro level novo sem estrela (estrelas ficam). Cada trilha guarda `ladder` (versão da escada) e a migração roda uma única vez. Ao mexer nas escadas de novo, some uma versão em `LADDERS` com o mapa antigo → novo.

### Expressões grandes (levels 12–15)

Depois de dominar os levels 1–11 (estrutura, sinais, grupos), os 4 últimos levels de Expressões **mantêm o estilo misto** (`+ − × ÷`, grupos, às vezes potência) mas **aumentam os números** — ainda bem menores que nas contas de dois números das trilhas básicas. É a ponte entre "entendo a ordem" e "faço de cabeça com números de verdade".

| Lv | Nome | Estrutura | Exemplo |
|---|---|---|---|
| 12 | Misturas maiores | sem grupos; 3–4 operações; × e ÷ antes de + e −; números de 2 dígitos | `48 + 7 × 13 − 96 ÷ 8` |
| 13 | Parênteses e números maiores | 1 nível de `( )`; 3–4 operações | `(47 + 38) × 6 − 120 ÷ 8` |
| 14 | Colchetes e números maiores | `[ ( ) ]`; 4–5 operações | `[(48 + 27) × 4 − 150] ÷ 6` |
| 15 | Chaves, potências e números maiores | `{ [ ( ) ] }`; 4–6 operações; quadrados e `(a ± b)²` | `{[(8 + 4) × 5 − 36] ÷ 6 + 3²} × 2` |

- **Gerador** (`exprMix` em `06-tracks.js`): monta a árvore com divisões exatas, nenhum passo negativo, teto de valor por level (500 / 900 / 1 200 / 1 800), mínimo de 3 tipos de operação por conta e limite de caracteres (26–38) para caber no celular. Parênteses só aparecem onde a precedência exige, e a profundidade (`( )`, `[ ]`, `{ }`) é exigida por level.
- **Migração:** quem tinha concluído as Expressões (11/11) volta ao level 12 (as estrelas ficam).

Os geradores ficam em `06-tracks.js` e garantem resposta exata, resposta inteira (ou decimal de ≤ 2 casas), sem resposta negativa (exceto equação, comparação e Expressões, onde a resposta pode ser negativa — digite com a tecla ±) e forma de dígitos fixa por level.

## Como a dificuldade se ajusta

- **Zonas por conta correta:** `fast` = dentro da meta (XP extra), `ok` = acima da meta mas dentro do limite, `slow` = acima do limite (ver "Contas grandes × pequenas"). Erro nunca tem zona.
- **Passo de m:** `m ← m + 0,06 × (y − ρ*)`, com `y = 1` se acertou em zona `fast/ok`. É uma aproximação estocástica (Robbins-Monro): converge ao ponto em que a pessoa acerta ρ\* das contas. O passo por conta é minúsculo (média ≈ 0,01–0,02), sem degraus.
- **Desafio** (Ajustes): ρ\* = 0,90 *Tranquilo*, 0,82 *Equilibrado* (padrão), 0,72 *Intenso*.
- **Level nunca cai.** Errar não desconta XP nem derruba level. Se a pessoa patinar (< 55% de acerto em 12 contas com `m` no piso), o **próximo bloco** da trilha roda no level anterior (**reforço**, rende 70% do XP), `m` volta a um ponto confortável e o reforço dura um bloco só — sem aviso humilhante.
- **Lapso de digitação:** erro em < 350 ms, número invertido (45 vs 54) ou um dígito trocado (57 vs 56) é lapso motor: fica no histórico, mas não mexe em `m`, XP nem pesos (e na prova/nivelamento a conta é reposta).
- **Pesos internos por padrão** (herdado da v1): vai-um, empréstimo, grupo de %, casas decimais e caso da fração enviesam a geração para onde a pessoa erra/demora mais (sempre com piso de aleatoriedade); pesos por dígito da tabuada + "pontos cegos" (pares específicos lentos voltam até limpar); inversão rara ("? × 8 = 56"); **andaime** — dica de método após 3 erros seguidos no mesmo padrão.

## Rodadas e blocos

Uma **rodada** (Curta 16 / Normal 24 / Longa 40 contas — Ajustes) tem dois jeitos de ordenar as contas (Ajustes › **Ordem das contas**):

- **Alternada (padrão) — prática intercalada.** A rodada sorteia até **3 trilhas** (`MIX_TRACKS`; favorece as mais fracas, há mais tempo sem treino, em reforço ou com subida pedida) e **alterna entre elas conta a conta**, dividindo as contas por igual (mínimo 3 por trilha, `MIX_MIN_PER_TRACK`). A ordem é sorteada: todas as trilhas se revezam em cada "ciclo", mas a sequência muda de ciclo para ciclo e **nunca repete a mesma trilha em seguida**, então não dá para prever a próxima conta. Cada trilha mantém o próprio level, `m`, aquecimento, reforço e XP — é um *bloco misto* (`kind:'mix'`) com um sub-bloco por trilha (`Engine.beginBlock`/`_pickMixSub`). O selo do topo troca de trilha a cada conta, e as introduções (dica do level na 1ª visita, reforço, aviso do aquecimento relâmpago) aparecem juntas, antes da primeira conta. Com menos de 2 trilhas ativas, ou rodada pequena demais para 3 contas por trilha, a rodada usa blocos.
- **Em blocos (clássico).** Uma sequência de **blocos**; cada bloco tem 6–8 contas de **uma trilha e um level**. A mistura entre trilhas acontece entre blocos (favorecendo trilhas mais fracas e há mais tempo sem treino; nunca a mesma trilha duas vezes seguidas).

Nivelamentos e subidas de level continuam como blocos próprios nos dois modos (a subida entra depois do bloco misto). **Folga pelo custo de troca.** Alternar o tipo de conta a cada conta custa uns décimos de segundo que no bloco não existem (reconhecer a operação, trocar de estratégia). Por isso, no modo alternado, cada conta ganha uma folga no **limite e na meta** (a distância entre os dois é mantida): 12% do limite, entre 0,3 s e 1,0 s (`MIX_SLACK_*`, `Engine.mixSlack`) — quase fixa nas contas rápidas, onde o custo mais pesa, e limitada nas lentas. A folga vale para zonas, XP, adaptação de `m`, prazo de abandono e o limite mostrado na introdução. Provas, subidas e nivelamentos (blocos próprios) e a aba Trilhas continuam com os tempos base. Um recorde de mediana (`bestMedian`) feito em blocos fica um pouco mais difícil de bater no alternado.

Ordem: **nivelamentos** (trilhas novas) → **treino**, com blocos de **subida de level** no meio quando a pessoa pediu (veja abaixo). No primeiro bloco de cada trilha na rodada há **aquecimento**: 3 contas um level abaixo (rende metade do XP; com "aquecimento relâmpago" ligado — só nas 4 operações básicas — a conta borra após 1,5 s, e o app avisa uma vez por rodada, antes das primeiras contas que somem). Em Ajustes você escolhe em quais das 4 operações a conta pode sumir.

Não existem mais modos Ultimate/Intervalado/HIIT nem pausas automáticas por "frustração/fadiga": a rodada termina sozinha, e a pessoa pode pausar (também automático ao esconder o app) ou sair a qualquer momento (rodada parcial é salva).

## Nivelamento

Na primeira vez numa trilha, 6 contas em escada (acerto bom sobe 1 level, o resto desce 1), começando em ~40% da trilha. O resultado é a média dos últimos 4 levels, sem passar do melhor level acertado — começa um pouco abaixo da habilidade, para as primeiras contas serem vitórias. Levels abaixo recebem 1★.

## Contas grandes × pequenas, limite × meta
Metade das contas de cada level é **grande** (parte alta do level, mais tempo) e metade é **pequena** (parte baixa, rápida) — o sorteio é balanceado dentro de cada bloco. Cada conta tem:
- **Limite** (decide): pequena = 1,25 × G, grande = 2,0 × G, onde G é o tempo-base do level (ex.: Soma Nv 10: pequena 7,3 s, grande 11,6 s; Multiplicação Nv 6: 6,3 s / 10 s). Só o limite decide se o acerto valeu "no tempo" e se a subida/prova passa (mediana de *tempo ÷ limite* ≤ 1,1).
- **Meta** (bônus): o limite menos uma folga de 20% (entre 0,3 s e 2 s). Bater a meta rende XP extra e conta para as estrelas, mas **nunca bloqueia** o avanço.
Aquecimento, reforço e nivelamento usam uma medida média (1,7 × G, a antiga). Para ajustar: `LIMIT_MULT`, `BIG_SHARE` e `META_GAP_*` em `02-engine-constants.js`, e o `goal` de cada level em `06-tracks.js`. A aba Trilhas mostra, por level, a mediana recente × limite de pequenas e grandes.

## XP, barra e subida de level

- **XP por acerto:** `fast` 10, `ok` 6, `slow` 3, × (0,8 + 0,4·m). Erro = 0 (nunca negativo). **Combo:** +1 XP a cada 5 acertos seguidos (até +4); erro zera o combo.
- O mesmo XP enche a **barra do level da trilha** (120 + 40·(L−1) XP) e soma no **XP geral**.
- Barra cheia **e** `m ≥ 0,55` → a trilha ganha o selo **Recomendado** (a barra continua com o efeito visual de 100%). O app **não impõe** mais nenhuma prova: quem decide quando subir é a pessoa.
- **Subida automática:** se o app estiver *muito* seguro — barra cheia, `m ≥ 0,92` e as últimas 20 contas do level com ≥ 95% de acerto e ≥ 60% dentro da meta — ele sobe o level sozinho (1★, com aviso na conquista). Fora isso, só recomenda (`AUTO_UP_*` nas constantes).
- **Subir de level a qualquer momento:** na aba Trilhas (ou no aviso "Recomendado" da Início) toque em **Subir de level**. A partir daí, só **aquela trilha** passa a receber contas do **level seguinte** (em rodada geral, até 8 por rodada; em "Treinar só esta", todas de uma vez), e as outras trilhas seguem normais. Ao completar **12 contas** (`CLIMB_ITEMS`), o app decide: sobe com **≥ 75% de acertos** (9/12) **e** mediana de tempo ÷ limite ≤ 1,1. **★** = passou; **★★** = ≥ 5 dentro da meta; **★★★** = ≥ 11 acertos e ≥ 8 dentro da meta. Bônus de XP 40/70/100. Lapsos de digitação não contam. A pessoa pode cancelar a subida a qualquer hora.
- Passou → level seguinte (`m` recomeça em 0,15, barra zerada). Não passou → **nada se perde** (nem barra, nem estrelas, nem level): o pedido some e dá para pedir de novo. No último level, "subir" conclui a trilha (patente Mestre).
- Na aba Trilhas, toque num level já conquistado com menos de 3★ na escada para **refazer a prova** (8 contas) e melhorar as estrelas (não muda o level atual).
- Terminou o último level → trilha **concluída** e entra em **Mestre**: até 5 patentes (400 XP cada), e a meta de tempo encolhe 7% por patente — o treino de velocidade nunca acaba.

## Recompensas e retenção

- **Level geral** (XP acumulado = 100·(n−1)^1,6) com títulos (Iniciante → Calculadora Humana).
- **Meta diária** com anel de progresso, **bônus de 50 XP** e **sequência de dias** (+ faixa da semana, aviso de sequência em risco). Em Ajustes → *Metas e desafio*:
  - **Tipo de meta:** por **contas** (sugestões 20/40/80/150, ou qualquer número até 9999; padrão 40) ou por **tempo** (sugestões 5/10/20/30 min, ou qualquer valor até 600; padrão 10).
  - **Relógio do dia:** conta o tempo de treino enquanto há rodada — acertando, errando ou deixando a conta passar. **Não** conta com a rodada pausada, com o app escondido nem nas telas de introdução/aviso. Fica guardado só para o dia atual (`Store.data.dayTimer`; zera quando o dia vira) e acumula mesmo na meta por contas, então trocar de tipo no meio do dia não perde nada. Com meta por tempo, o HUD do treino mostra `⏱ tempo / meta`.
  - **Aviso de meta batida:** *Discreto* (toast, som e confete; as contas seguem) ou *Tela* (pausa as contas e mostra uma tela com **Continuar** ou **Sair**). O bônus de XP vale nos dois. A tela nunca interrompe uma conta: se a meta bate no meio de uma conta (meta por tempo), ela espera a conta terminar — respondida ou com o tempo esgotado — e entra depois do feedback, antes da próxima.
- **Fim de rodada:** 1–3 estrelas (sempre ≥ 1 ao concluir), +20 XP de conclusão, XP com contagem animada, barras das trilhas "de → para", lista de conquistas (level, estrelas, patente, recordes de mediana, prova liberada…).
- **Recordes pessoais** por level (mediana do bloco), confete, sons/vibração, balões de XP e combo no treino.

## Modo livre

Botão **Modo livre** na tela Início (abaixo de Treinar). Treino sem pressão e sem rastro:

- **Sem tempo:** não há limite por conta, meta de tempo, pausa nem relógio do dia. Cada conta espera o quanto for preciso.
- **Sem pontuação:** não dá XP, combo, estrela, barra de level, prova/subida, meta diária nem sequência — nem para melhorar, nem para piorar. A adaptação (`m`), os pesos por padrão e o "reforço" não são tocados.
- **Nada fica salvo:** o módulo `14b-free-mode.js` **nunca** escreve em `Store.data` nem chama `Store.save()`; não entra no histórico, no log/relatório para IA nem nos marcos. A escolha (trilha, level, tamanho) e o placar "✓ acertos/contas" ficam só na memória e somem ao sair ou recarregar.
- **Você escolhe as contas:** qualquer uma das 9 trilhas (ativa ou não, com ou sem nivelamento), qualquer level da escada e o **tamanho** dentro do level — *Menores* (`m` 0–0,35), *Variadas* (0–1) ou *Maiores* (0,65–1). Durante o treino, **‹ ›** troca de level na hora e **💡** mostra a tática do level.
- **Erro:** mostra a resposta certa e espera você tocar **✓** (sem pressa). Acerto passa sozinho para a próxima. O auto-envio segue o ajuste "confirmar" dos Ajustes.
- **Como gera:** direto do gerador do level (`levelDef(key, level).gen(m, null)`); com `tr = null` os geradores ignoram os pesos pessoais e não mexem em nada. `Engine.itemFromGen` monta os campos da conta (compartilhado com o treino normal).
- **Teclado:** `UI.ctl()` devolve o `FreeMode` enquanto ele está ativo e a `Session` no resto, então teclado na tela e físico funcionam igual.

## Telas

Início (nível, meta, sequência, semana, botão **Treinar** ou **Começar nivelamento**, botão **Modo livre**, avisos "Recomendado: subir de level") · Trilhas (liga/desliga, level, barra, estrelas, escada de levels, dica, "treinar só esta", subir de level) · Treino (barra da rodada, chip da trilha/level, combo e XP, teclado) · Resumo da rodada · Estatísticas (precisão, % dentro da meta, contas por dia, por trilha) · Ajustes (meta, tamanho da rodada, desafio, tema, idioma PT/EN, voz/TTS, vibração, sons, modo foco, exportação CSV/JSON, aviso de exportar para a IA, apagar dados).

## Relatório para IA

Em **Ajustes > Dados > Relatório para IA** há dois botões: **Copiar** (área de transferência) e **MD ↓** (baixa `mental_math_relatorio_ia.md`). O texto em Markdown começa com instruções para a IA (como o app funciona, o que é evolução esperada, o que responder) e traz: resumo geral, estado atual por trilha, evolução por semana (geral e por trilha, com a razão mediana *tempo ÷ meta*), comparação início × fim em cada level, marcos (nivelamento, provas, levels, patentes), contas por dia, últimas rodadas e o **registro bruto das últimas 1.500 contas** em CSV. O app guarda um registro compacto de cada conta (últimas 5.000) e dos marcos (últimos 400) só para isso; tudo fica no aparelho até você copiar ou baixar.

### Aviso "hora de exportar para a IA"

Para lembrar de revisar a evolução de tempos em tempos, o app avisa quando passam **X contas** desde a última exportação para IA.

- **Onde aparece:** cartão "Hora de revisar sua evolução" na tela **Início** (logo acima do botão Treinar) e no **Resumo da rodada**, com os botões **Copiar para IA**, **MD ↓** e **Depois** (esconde o aviso só até reabrir o app).
- **Configuração:** em **Ajustes > Dados** — interruptor "Aviso para exportar à IA" (ligado por padrão) e o campo "Avisar a cada (contas)" (padrão 300; aceita de 20 a 5.000). Logo abaixo, uma linha mostra o andamento ("N de X contas desde a última exportação").
- **Contador:** `player.items − exportMark.items`. **Copiar** ou **MD ↓** do Relatório para IA (nos Ajustes ou no próprio aviso) zera o contador (`Export.markExported()`); copiar só zera se a cópia funcionou. **CSV/JSON não zeram**, porque não servem para a análise por IA. O relatório também informa quantas contas foram feitas desde a exportação anterior. Quem nunca exportou começa com contador em 0 (então o primeiro aviso vem na primeira vez que o total de contas passar de X).
- **Dados:** `settings.exportReminder`, `settings.exportEvery` e `exportMark {items, at}` (saneados em `07-storage.js`).


## Dados

`localStorage`, chave `calcrapido_db_v3`. Na primeira abertura, ajustes, histórico e melhor sequência do formato antigo (`calcrapido_db_v2`) são aproveitados; o progresso por família não tem equivalente nas trilhas, então o **nivelamento recomeça**.

## Estrutura do código

`assets/js/`, `<script>` comuns carregados em ordem de dependência (funciona também via `file://`):

| Arquivo | Conteúdo |
|---|---|
| `01-utils.js` | Utilitários (RNG, estatística, formatação). |
| `02-engine-constants.js` | **Todas** as constantes de ajuste (zonas, XP, prova, adaptação, rodadas, nível geral). |
| `03-i18n.js` | Textos PT/EN. |
| `04-operations.js` | Operações e comparações. |
| `05-expression-terms.js` | Termos (potência, raiz quadrada/cúbica), árvore de expressão com grupos `( ) [ ] { }` (avaliar, imprimir, nível de aninhamento) e contadores de vai-um/empréstimo. |
| `06-tracks.js` | Trilhas, levels (meta, forma, dica) e geradores de conta. |
| `07-storage.js` | `Store`: persistência, saneamento, migração v2 → v3. |
| `08-speed-engine.js` | `Engine`: planejamento da rodada, geração, `m`, XP, nivelamento, prova, reforço. |
| `09-feedback.js` | Fala (TTS), sons, vibração. |
| `10-progress.js` | `Progress`: XP/level geral, meta diária, sequência, semana, estrelas da rodada. |
| `11-session.js` | `Session`: percorre blocos, mede tempo, aplica XP/combo/meta, fecha a rodada. |
| `12-analytics.js` | Resumo da rodada e agregados do histórico. |
| `13-export.js` | CSV/JSON, relatório para IA e contador do aviso de exportação. |
| `14-ui.js` | Interface. |
| `14b-free-mode.js` | `FreeMode`: Modo livre (sem tempo, sem pontuação, nada salvo). |
| `15-init.js` | Inicialização e service worker (fora dos testes). |

## Testes

```sh
node run-tests.js
```

Sem dependências (só Node.js). Cobre geradores (exatidão, forma por level), fala, nivelamento, passo/convergência de `m`, XP, prova, reforço, patentes, simulação de usuários virtuais, `Progress`, saneamento/migração do `Store` uma rodada completa do `Session` com UI "muda" e o Modo livre (contas corretas em todo level/tamanho; `Store.data` e `localStorage` idênticos antes e depois). Layout, teclado e TTS reais não são cobertos: teste manualmente no navegador (ou com Playwright).
