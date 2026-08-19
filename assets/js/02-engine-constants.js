/* =====================================================================
   assets/js/02-engine-constants.js — constantes do motor de progressão
   (janelas de tempo, metas de acerto, tamanho do pool de KCs ativos etc.),
   conforme o documento 'Algoritmo de Progressão e Adaptação — Modo
   Rapidez' citado no topo do projeto.
   Depende de: nada.
   Usado por: 07-storage.js e 08-speed-engine.js.
   ===================================================================== */

/* ---------- 2. CONSTANTES DO MOTOR ---------- */
const ONE_HOUR = 3600*1000;
const ONE_DAY = 24*ONE_HOUR;
const REVIEW_TARGET = 0.87;        // p(recall) alvo para reintroduzir KC dominado (seç. 7)
const SWEET_OFFSET = 300;          // desloca elo do item p/ mirar ~85% de acerto esperado (seç. 0/4)
const IMPULSE_FLOOR = 350;         // ms — abaixo disso, erro é tratado como lapso, não erro genuíno (seç. 9)
const POOL_TARGET = 4;             // tamanho alvo do pool ativo de KCs (seç. 1: "3 a 6")
const MIN_RETENTION_GAP = 5*ONE_HOUR; // intervalo mínimo p/ uma prática contar como reteste de retenção (seç. 6.4)
const ACQ_MIN_ITEMS = 10, ACQ_MAX_ITEMS = 15, ACQ_TARGET_ACC = 0.70; // bloco de aquisição (seç. 3)
const MASTERY_MIN_ITEMS = 12;
const MASTERY_MIN_ACC = 0.90;
const MASTERY_MIN_TARGET_RATE = 0.75;
const RETENTION_REVIEW_ITEMS = 3;
const RETENTION_INTERVALS = [ONE_DAY, 3*ONE_DAY, 7*ONE_DAY, 14*ONE_DAY, 30*ONE_DAY];

/* ---------- 2c. MOTOR DE SEQUÊNCIA v2 (revisão "Ultimate") ----------
   Constantes nomeadas de propósito — são pontos de partida razoáveis, não valores
   testados com dados reais. Ajustar aqui sem precisar caçar magic numbers no meio
   das funções. */
// Prazo de resposta no modo Ultimate = targetMs da habilidade × multiplicador por fase
// (mais folga enquanto o perfil ainda está se firmando, mais justo quando já é hábito).
const ULTIMATE_TIMEOUT_MULT = {calibrating:4, acquisition:4, consolidating:3.3, mastered:3, review_due:3};
const ULTIMATE_TIMEOUT_FLOOR_MS = 1200; // nunca menos que isso, mesmo com targetMs baixo/ruidoso
const ULTIMATE_PAUSE_FRUSTRACAO_MS = 13000; // pausa curta ao detectar frustração (seç. 13)
const ULTIMATE_PAUSE_FADIGA_MS = 35000;     // pausa mais longa ao detectar fadiga acumulada
const ULTIMATE_POST_PAUSE_COOLDOWN_ITEMS = 3; // itens após a pausa que não podem disparar outra

// Elo contínuo (substitui o ajuste em lote de 8 respostas): cada resposta pontuada move
// difficulty/targetMs em um passo pequeno, escalado por um K-factor que decai conforme
// mais amostras se acumulam na fase atual — alto no começo (acha o nível rápido), baixo
// depois de estabilizado (resistente a uma sequência ruim isolada).
const K_BASE = 0.05, K_MIN = 0.008, K_MAX = 0.05;

// Sequenciamento (substitui Foco/Misto): nunca repete a mesma família 2x seguidas; nenhuma
// família passa de ANTI_CLUMP_MAX_SHARE das últimas ANTI_CLUMP_WINDOW escolhas; sorteio
// ponderado por softmax com temperatura sobre TODAS as famílias selecionadas (sem corte
// duro: as mais fracas dominam o peso, mas nenhuma fica com probabilidade zero — coerente
// com o piso de aleatoriedade usado nos demais pesos do motor); erro recente reaparece
// dentro de RETRY_MIN_GAP–RETRY_MAX_GAP itens.
const ANTI_CLUMP_WINDOW = 10, ANTI_CLUMP_MAX_SHARE = 0.4;
// Sorteio softmax normalizado por min-max no próprio pool (seç. 2c da auditoria): em vez de
// uma temperatura ABSOLUTA sobre o score bruto (que não escala quando o pool é grande — com
// "todas as contas" ativas, ~26 das 29 famílias carregam a mesma penalidade fixa de
// pré-requisito e o spread real de necessidade fica comprimido, diluindo a concentração no
// sorteio), o score é primeiro normalizado para [0,1] em relação ao menor/maior do momento.
// SEQUENCING_SPREAD_FLOOR é o piso desse spread: quando os scores estão quase-empate (spread
// menor que o piso), a normalização degrada graciosamente para um sorteio quase-uniforme —
// preserva o comportamento do começo do app, quando não há família claramente fraca ainda.
// SEQUENCING_SOFTMAX_TEMP_REL é a temperatura RELATIVA ao spread normalizado. Quanto menor,
// mais concentrado no topo (nas famílias mais fracas). Calibrada por simulação (média de
// runs de 30k escolhas): com o anti-clump padrão intacto, T_rel=0.35 põe as ~5 mais fracas
// em ~64% das escolhas num pool de 29 famílias com uma claramente fraca (meta de 60–70%),
// e ~87% num pool de 6 — a mesma concentração que a calibração original de T=0.4 garantia
// no regime "limpo", agora independente do tamanho do pool. O anti-clump limita qualquer
// família isolada a ~30–40% das escolhas.
const SEQUENCING_SPREAD_FLOOR = 0.2;
const SEQUENCING_SOFTMAX_TEMP_REL = 0.35;
const RETRY_MIN_GAP = 3, RETRY_MAX_GAP = 6;

// Peso por padrão dentro da família (seç. 3 da revisão): nunca repete um enunciado
// específico — só torna mais provável gerar o atributo (vai-um, empréstimo, grupo de %)
// onde a pessoa é mais lenta/erra mais. Piso/teto evitam que um atributo vire 0% ou 100%.
const PATTERN_WEIGHT_NUDGE = 0.06, PATTERN_WEIGHT_MIN = 0.2, PATTERN_WEIGHT_MAX = 3;

// Cascata de dificuldade (seç. "Cascata"): quando uma família está bem abaixo do nível
// (acerto recente < CASCADE_ACC_FLOOR, com pelo menos CASCADE_MIN_ITEMS pontuados), o motor
// dá um boost forte de score ao pré-requisito mais fraco ainda não dominado — em vez de só
// baixar o tamanho dos números no lugar, ele "puxa o alicerce" de volta ao treino.
const CASCADE_ACC_FLOOR = 0.6;
const CASCADE_MIN_ITEMS = 5;
const CASCADE_BOOST = 0.5;

// Calibração adaptativa (seç. "Calibração"): CALIBRATION_ITEMS (8, em 07-storage.js) vira um
// teto — a calibração pode encerrar antes (mín. CALIBRATION_MIN_ITEMS acertos) se os tempos
// estiverem consistentes (CV <= CALIBRATION_CONSISTENT_CV). Sem isso, "Treinar todas as
// contas" (29 famílias × 8 acertos) ficava inviável antes de qualquer adaptação real.
const CALIBRATION_MIN_ITEMS = 4;
const CALIBRATION_CONSISTENT_CV = 0.18;

/* ---------- 2e. "CÂMARA DE HIPERGRAVIDADE" (revisão do motor, Pilares 1/2/3) ----------
   Constantes dos três pilares implementados agora — ver README para a descrição completa.
   O Pilar 1 (heatmap 10×10 por par específico, com Softmax por RT de célula) foi discutido
   e fica de fora por ora; o que entra abaixo é: filtro de typo, ocultação progressiva
   (mastery flash), inversão de baixa frequência e hint por padrão de erro (andaime). */
// Filtro de typos (Levenshtein Lite, seç. Pilar 1): um erro cujo dígito(s) formam o
// INVERSO do resultado (ex.: 45 vs 54) ou diferem em só 1 dígito na mesma posição (ex.:
// 57 vs 56) é tratado como lapso motor — mesma categoria do IMPULSE_FLOOR (erro rápido
// demais para ter sido raciocínio), só que detectado pelo padrão do erro em vez do tempo.
// Continua salvo no histórico, mas não pune dificuldade/meta/domínio/peso de padrão.

// Ocultação progressiva (Mastery Flash, seç. Pilar 2): quando a família já está Mastered
// (ou em revisão de retenção), o enunciado fica visível por MASTERY_FLASH_MS antes de
// borrar — força reter os operandos de cabeça (retentor visual-espacial) em vez de poder
// consultar a tela a qualquer momento.
const MASTERY_FLASH_MS = 1500;

// Inversão de baixa frequência (Reverse Path, seç. Pilar 3): mult_tabuada/div_tabuada às
// vezes viram "? × 8 = 56" / "? ÷ 8 = 7" em vez do caminho direto — testa reconhecer o
// fato num contexto de equação, não só recitar na ordem treinada. Frequência baixa por
// padrão; sobe quando o perfil já está fluente no caminho direto (proxy por estágio —
// quando o heatmap por par entrar, pode virar um sinal mais fino de "viciado no direto").
const REVERSE_PATH_BASE_RATE = 0.06;
const REVERSE_PATH_FLUENT_RATE = 0.10;

// Hint por padrão de erro (Andaime, seç. Pilar 3): não ensina a técnica de graça — só
// depois de PATTERN_HINT_STREAK erros SEGUIDOS no mesmo atributo/bucket (o mesmo rastreado
// pelo peso por padrão, seç. 3 do motor) é que uma dica tática pontual aparece; o contador
// zera nesse momento e em qualquer acerto, para a dica não repetir a cada erro novo.
const PATTERN_HINT_STREAK = 3;

// hotPairs (pontos cegos silenciosos dentro do dígito, complemento ao digitWeights):
// HOTPAIR_MIN_SAMPLES = amostras mínimas do par antes de poder virar "quente" (evita
// decidir com 1-2 pontos ruidosos). HOTPAIR_RT_RATIO = quanto o RT do par precisa estar
// acima do RT médio do dígito pra disparar. HOTPAIR_INJECT_CHANCE = probabilidade de,
// tendo um par quente pendente no dígito sorteado, forçar esse par em vez de sortear o
// segundo fator livre. HOTPAIR_CLEAR_STREAK = acertos seguidos dentro da meta pra apagar
// o par da lista (nunca fica preso pra sempre).
const HOTPAIR_MIN_SAMPLES = 3;
const HOTPAIR_RT_RATIO = 1.45;
const HOTPAIR_INJECT_CHANCE = 0.25;
const HOTPAIR_CLEAR_STREAK = 2;
const HOTPAIR_EWMA_ALPHA = 0.3; // suavização do RT por par, mesmo estilo do resto do motor

/* ---------- 2d. FAMÍLIAS COM VÍRGULA (decimais) ----------
   Cada família decimal tem uma família inteira "irmã" — mesma operação, mesma faixa de
   magnitude — usada como referência para medir o quanto a vírgula em si (e não a conta em
   si) pesa na dificuldade. Isso não é exposto em nenhuma tela (a pessoa pediu para não
   colocar no analytics agora); é só um dado que o motor consegue calcular internamente
   via Engine.decimalComparison()/Engine.allDecimalComparisons(), em 08-speed-engine.js.
   EXPECTED_DECIMAL_* são a "régua" de comparação: o quanto mais lento/impreciso já é
   esperado só por causa da vírgula, antes de considerar que a família está desproporcional. */
const DECIMAL_PAIR_KC = {
  soma_decimal: 'soma_2d_cc',
  sub_decimal: 'sub_2d_ce',
  mult_decimal: 'mult_tabuada',
  div_decimal: 'div_tabuada'
};
const EXPECTED_DECIMAL_TIME_MULT = 1.25; // esperado até ~25% mais lento que a versão inteira equivalente
const EXPECTED_DECIMAL_ACC_DROP = 0.05;  // esperado até 5 p.p. a menos de acerto
const DECIMAL_COMPARISON_MIN_SAMPLES = 6; // amostras pontuadas mínimas em cada perfil para comparar com confiança

