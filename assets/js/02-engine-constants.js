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

