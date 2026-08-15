/* =====================================================================
   tests/run-tests.js — suíte de testes automatizados do motor de geração
   de contas (KC_DEFS) e do disparo de fala (spokenPhrase).

   Por que este arquivo existe (item 3.3 da auditoria de 2026):
   antes desta suíte, a única forma de validar se um gerador de exercício
   sempre produz uma conta matematicamente correta era revisão manual do
   código. Isso já deixou passar um bug real (fracao_simples podia, em
   ~0.025% dos casos, esgotar suas tentativas e devolver uma soma de
   frações não-exata) — só foi encontrado porque testes ad-hoc foram
   escritos na hora. Este arquivo versiona esse tipo de verificação.

   O QUE ESTE TESTE COBRE:
     - Todo gen(t) de KC_DEFS, para vários níveis de dificuldade (t),
       produz sempre um `answer` finito e dentro de uma faixa plausível —
       nunca NaN, Infinity, ou fração quebrada. Para a maioria das
       famílias isso significa inteiro; para as famílias marcadas
       `decimal:true` (seç. "Decimais"), significa um valor com
       exatamente 1 ou 2 casas decimais (features.decimalPlaces) e
       matematicamente exato a partir de a/b — nunca dízima.
     - spokenPhrase() nunca lança exceção para nenhuma família, em
       pt-BR/en-US.
     - Um "smoke test" do motor completo (Engine.next / registerResult)
       rodando centenas de iterações simuladas sem lançar exceção e sem
       o rating de nenhuma KC virar NaN/Infinity.

   O QUE ESTE TESTE **NÃO** COBRE (dependem do DOM do navegador real):
     - Session/UI (teclado, temporizadores, TTS de verdade). Esses
       precisam de teste manual no navegador (ou, futuramente, de uma
       suíte com um DOM headless tipo jsdom/Playwright).

   COMO RODAR:
     node tests/run-tests.js
   (não precisa de npm install nem de nenhuma dependência — só Node.js)
   ===================================================================== */

const fs = require('fs');
const path = require('path');

// ---------- stubs mínimos de ambiente de navegador ----------
global.window = global;
global.localStorage = {
  _data:{},
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._data,k) ? this._data[k] : null; },
  setItem(k,v){ this._data[k]=String(v); },
  removeItem(k){ delete this._data[k]; }
};
global.navigator = { vibrate(){ return true; } }; // sem serviceWorker/speechSynthesis de propósito
global.prompt = ()=>null; // stub — só usado por Session.promptUltimateGoal(), não exercitado diretamente aqui
global.document = {
  addEventListener(){}, removeEventListener(){},
  querySelectorAll(){ return []; }, querySelector(){ return null; },
  getElementById(){ return null; }, createElement(){ return { classList:{add(){},remove(){},toggle(){}}, appendChild(){}, style:{}, setAttribute(){} }; },
  createElementNS(){ return { setAttribute(){} }; }
};
global.performance = global.performance || { now:()=>Date.now() };

// ---------- carrega o motor a partir de assets/js/ ----------
// O app é dividido em módulos carregados em ordem de dependência (ver
// index.html). Aqui concatenamos os mesmos módulos, na mesma ordem, para
// reproduzir exatamente o escopo léxico que o navegador monta — exceto
// 14-init.js, que mexeria em document/DOMContentLoaded/serviceWorker de
// verdade; os testes chamam Store.load() e o motor manualmente, sob controle.
const jsDir = path.join(__dirname, '..', 'assets', 'js');
const MODULES = [
  '01-utils.js', '02-engine-constants.js', '03-i18n.js', '04-operations.js',
  '05-expression-terms.js', '06-skills-graph.js', '07-storage.js',
  '08-speed-engine.js', '09-feedback.js', '10-session.js', '11-analytics.js',
  '12-export.js', '13-ui.js', // 14-init.js propositalmente de fora
];
const engineSrc = MODULES.map(name => fs.readFileSync(path.join(jsDir, name), 'utf8')).join('\n');

let failures = 0, passed = 0;
function ok(cond, msg){
  if(cond){ passed++; }
  else { failures++; console.error('❌ FALHOU:', msg); }
}

const harness = `
${engineSrc}

/* ---------- corpo dos testes (mesma escopo léxico do motor) ---------- */
Store.data = Store.defaults();
Object.keys(Store.data.settings.ops).forEach(k=>{ Store.data.settings.ops[k] = true; }); // ativa tudo
ok(Store.data.settings.confirmBeforeAccept===true, 'novas instalações exigem confirmação manual');
ok(Store.data.settings.answerTimeoutSeconds===10, 'new installs use a 10-second answer limit');
const timeoutItem = Engine.generateItem('soma_2d_cc');
ok(timeoutItem.timeoutMs===10000, 'the configured limit is applied to each problem');
Store.data.settings.answerTimeoutSeconds = 7;
ok(Engine.generateItem('soma_2d_cc').timeoutMs===7000, 'changing the limit updates the next problem deadline');
localStorage.setItem(DB_KEY, JSON.stringify({settings:{confirmBeforeAccept:false}, kc:{mult_tabuada:{key:'mult_tabuada',rtBaseline:1900,lastPracticeAt:123,window:[{ms:1600,correct:true,t:123}]}}, history:[], bestStreak:0}));
Store.load();
ok(Store.data.settings.confirmBeforeAccept===true, 'instalações antigas migram para confirmação manual');
ok(!!Store.data.speedProfiles.mult_tabuada, 'dados antigos migram para perfil de velocidade');
Store.data = Store.defaults();
Object.keys(Store.data.settings.ops).forEach(k=>{ Store.data.settings.ops[k] = true; });

const VOICES = ['pt-BR','en-US'];
const T_SAMPLES = [0, 0.25, 0.5, 0.75, 1, ...Array.from({length:200}, ()=>Math.random())];

globalThis.__TEST_RESULTS__ = { perFamily: {}, engineSmokeError: null, speedEngineError: null, adaptiveFlowError: null, timingFlowError: null, confirmFlowError: null,
  sequencingError: null, retryQueueError: null, softmaxError: null, softmaxLargePoolError: null, softmaxTieError: null,
  impulseFloorError: null, ultimateTimeoutError: null, patternWeightError: null, patternGenError: null,
  decimalInputError: null, decimalComparisonError: null, digitWeightError: null, cascadeError: null, adaptiveCalibrationError: null };

Object.keys(KC_DEFS).forEach(key=>{
  const def = KC_DEFS[key];
  const stats = { total:0, badAnswer:0, badSpeech:0, examples:[] };
  T_SAMPLES.forEach(t=>{
    stats.total++;
    let g;
    try{
      g = def.gen(t);
    }catch(e){
      stats.badAnswer++;
      stats.examples.push('gen() lançou exceção: '+e.message);
      return;
    }
    let answerOk;
    if(def.decimal){
      const dp = g.features && g.features.decimalPlaces;
      const scale = Math.pow(10, dp);
      answerOk = Number.isFinite(g.answer) && Math.abs(g.answer) < 1e6 && (dp===1||dp===2) &&
        Math.abs(Math.round(g.answer*scale) - g.answer*scale) < 1e-6;
    } else {
      answerOk = Number.isFinite(g.answer) && Number.isInteger(g.answer) && Math.abs(g.answer) < 1e6;
    }
    if(!answerOk){
      stats.badAnswer++;
      stats.examples.push('answer inválido: '+JSON.stringify(g));
    }
    // BUGFIX (regressão pct_basico): o teste antigo só conferia se answer era inteiro, e o gerador
    // "arredondava" o resultado esperado — 25% de 30 virava 8 em vez de 7,5. Agora verificamos que a
    // resposta matemática dos operandos exibidos é de fato inteira e igual à esperada.
    if(def.op==='porcentagem'){
      const trueValue = g.a * g.b / 100;
      if(!Number.isInteger(trueValue) || trueValue !== g.answer){
        stats.badAnswer++;
        stats.examples.push('porcentagem com resposta arredondada: '+JSON.stringify(g));
      }
    }
    // Famílias decimais: confere que a/b combinados pela operação básica batem exatamente
    // com o answer (mesmo espírito do bugfix de porcentagem acima).
    if(def.decimal){
      let trueValue;
      if(def.op==='soma') trueValue = g.a+g.b;
      else if(def.op==='subtracao') trueValue = g.a-g.b;
      else if(def.op==='multiplicacao') trueValue = g.a*g.b;
      else if(def.op==='divisao') trueValue = g.a/g.b;
      if(Math.abs(trueValue-g.answer) > 1e-6){
        stats.badAnswer++;
        stats.examples.push('decimal com resposta incorreta: '+JSON.stringify(g));
      }
    }
    const fakeItem = Object.assign({op:def.op, key, kcLabel:def.label, symbol:(OPS[def.op]||{}).symbol}, g);
    VOICES.forEach(v=>{
      try{ const phrase = spokenPhrase(fakeItem, v); if(typeof phrase!=='string' || !phrase.length) throw new Error('frase vazia'); }
      catch(e){ stats.badSpeech++; stats.examples.push('spokenPhrase('+v+') falhou: '+e.message); }
    });
  });
  globalThis.__TEST_RESULTS__.perFamily[key] = stats;
});

// Smoke test do motor de velocidade: todas as famílias são selecionáveis desde o
// início; calibração, mistura, metas e dificuldade não podem gerar NaN/Infinity.
try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = Object.keys(KC_DEFS);
  for(let i=0;i<800;i++){
    const item = Engine.next();
    if(!item) continue;
    const correct = Math.random() < 0.75;
    const ms = 400 + Math.random()*3000;
    Engine.registerResult(item, ms, correct, false);
    const p = Store.data.speedProfiles[item.key];
    if(!p || !Number.isFinite(p.targetMs) || !Number.isFinite(p.difficulty)){
      throw new Error('perfil inválido na habilidade '+item.key);
    }
  }
}catch(e){
  globalThis.__TEST_RESULTS__.engineSmokeError = e.message;
}

// Sequenciamento v2 (seç. 2 da revisão do motor): interleaving ponderado nunca repete a
// mesma família 2x seguidas, uma vez fora da fase de calibração (que não usa este pool).
try{
  Store.data = Store.defaults();
  const keys = ['soma_2d_cc','sub_2d_ce','mult_2d','pct_intermediario','potencia_basica'];
  Store.data.settings.selectedSkills = keys;
  Engine.recentKeys = []; Engine.errorRetryQueue = {}; Engine.itemCounter = 0;
  keys.forEach(k=>{
    for(let i=0;i<CALIBRATION_ITEMS;i++){
      Engine.registerResult(Engine.generateItem(k,{isCalibration:true}), 1000, true, false);
    }
  });
  let lastKey=null, repeats=0;
  for(let i=0;i<200;i++){
    const item = Engine.next();
    if(item.key===lastKey) repeats++;
    lastKey = item.key;
    Engine.registerResult(item, item.targetMs*0.9, Math.random()<0.8, false);
  }
  if(repeats>0) throw new Error('sequenciamento repetiu a mesma família 2x seguidas '+repeats+' vez(es) em 200 escolhas');
}catch(e){
  globalThis.__TEST_RESULTS__.sequencingError = e.message;
}

// Sorteio softmax (seç. 2 da revisão): TODAS as famílias selecionadas participam (nenhuma
// fica com probabilidade zero — piso de aleatoriedade) e as mais fracas dominam o peso.
try{
  Store.data = Store.defaults();
  const keys = ['soma_2d_cc','sub_2d_ce','mult_2d','pct_intermediario','potencia_basica','radical_quad'];
  Store.data.settings.selectedSkills = keys;
  Store.data.settings.selectAllSkills = false;
  Engine.recentKeys = []; Engine.errorRetryQueue = {}; Engine.itemCounter = 0;
  // Fabrica perfis: uma família fraca (erros/lenta) e as demais dominadas (rápidas e
  // corretas). Cedo no motor (janelas fabricadas), nada aqui dispara revisão nem calibração.
  keys.forEach(k=>{
    const p = Engine.profile(k);
    p.calibratedAt = Date.now();
    const weak = k==='soma_2d_cc';
    p.baselineMs = weak ? 1500 : 1000;
    p.targetMs  = weak ? 1500 : 850;
    p.window = [];
    for(let j=0;j<20;j++){
      const fast = weak ? (j%3!==0) : true; // fraca erra ~1/3; as demais nunca erram
      p.window.push({ms: fast ? (weak?1400:600) : 3000, correct:fast, targetHit:fast, calibration:false, lapse:false, at:Date.now()});
    }
  });
  const counts = {}; const N = 1500;
  for(let i=0;i<N;i++){
    const item = Engine.next();
    counts[item.key]=(counts[item.key]||0)+1;
    // Não registra resultados: janelas/perfis fabricados não podem ser contaminados.
  }
  keys.forEach(k=>{
    if(!counts[k]) throw new Error('softmax deixou a família '+k+' com probabilidade zero em '+N+' escolhas');
  });
  const weakShare = counts['soma_2d_cc']/N;
  const maxStrong = Math.max(...keys.filter(k=>k!=='soma_2d_cc').map(k=>counts[k]/N));
  // O anti-clump (-0.9) limita QUALQUER família isolada a ~30–40% das escolhas (share>40% da
  // janela dispara o corte), então não esperamos o fraco acima disso — mas ele deve sair bem
  // acima do uniforme (1/6≈16.7%) e dominar claramente as famílias dominadas.
  if(weakShare < 0.22) throw new Error('família fraca ficou perto do sorteio uniforme (fraca='+(weakShare*100).toFixed(1)+'%)');
  if(weakShare < maxStrong*1.5){
    throw new Error('família fraca não dominou o sorteio (fraca='+(weakShare*100).toFixed(1)+'%, mais forte entre as demais='+(maxStrong*100).toFixed(1)+'%)');
  }
}catch(e){
  globalThis.__TEST_RESULTS__.softmaxError = e.message;
}

// Softmax em pool grande ("Treinar todas as contas", 29 famílias ativas): com ~26 das 29
// famílias carregando a mesma penalidade fixa de pré-requisito, o spread real de necessidade
// fica comprimido e um softmax de temperatura ABSOLUTA dilui a concentração (a fraca caía para
// ~7%, perto do uniforme de ~3,4%). Com a normalização por min-max dentro do pool
// (SEQUENCING_SOFTMAX_TEMP_REL), a família fraca precisa dominar bem acima do uniforme e as
// ~5 mais fracas devem concentrar a maioria das escolhas — mesma calibração do pool pequeno.
try{
  Store.data = Store.defaults();
  const keys = Object.keys(KC_DEFS);
  Store.data.settings.selectedSkills = keys;
  Store.data.settings.selectAllSkills = false;
  Engine.recentKeys = []; Engine.errorRetryQueue = {}; Engine.itemCounter = 0;
  keys.forEach(k=>{
    const p = Engine.profile(k);
    p.calibratedAt = Date.now();
    const weak = k==='soma_2d_cc';
    p.baselineMs = weak ? 1500 : 1000;
    p.targetMs  = weak ? 1500 : 850;
    p.window = [];
    for(let j=0;j<20;j++){
      const fast = weak ? (j%3!==0) : true;
      p.window.push({ms: fast ? (weak?1400:600) : 3000, correct:fast, targetHit:fast, calibration:false, lapse:false, at:Date.now()});
    }
  });
  const counts = {}; const N = 3000;
  for(let i=0;i<N;i++){
    const item = Engine.next();
    counts[item.key]=(counts[item.key]||0)+1;
  }
  keys.forEach(k=>{
    if(!counts[k]) throw new Error('pool grande deixou a família '+k+' com probabilidade zero em '+N+' escolhas');
  });
  const share = k=>counts[k]/N;
  const sorted = keys.slice().sort((a,b)=>share(b)-share(a));
  const weakShare = share('soma_2d_cc');
  const top5 = sorted.slice(0,5).reduce((s,k)=>s+share(k),0);
  if(weakShare < 0.15) throw new Error('pool grande: família fraca diluída pelo sorteio (fraca='+(weakShare*100).toFixed(1)+'%, uniforme='+(100/keys.length).toFixed(1)+'%)');
  if(top5 < 0.50) throw new Error('pool grande: as 5 mais fracas não concentraram o sorteio (top5='+(top5*100).toFixed(1)+'%)');
}catch(e){
  globalThis.__TEST_RESULTS__.softmaxLargePoolError = e.message;
}

// Degradação graciosa em empate: com todas as famílias prontas (pré-requisitos dominados) e
// desempenho igual, o sorteio precisa ficar perto do uniforme — é o comportamento do começo do
// app, quando ainda não há família claramente fraca. Sem o piso SEQUENCING_SPREAD_FLOOR, a
// normalização min-max amplificaria o ruído dos scores e concentraria numa família qualquer.
try{
  Store.data = Store.defaults();
  const keys = ['soma_2d_cc','sub_2d_ce','mult_2d','pct_intermediario','potencia_basica','radical_quad'];
  Store.data.settings.selectedSkills = keys;
  Store.data.settings.selectAllSkills = false;
  Engine.recentKeys = []; Engine.errorRetryQueue = {}; Engine.itemCounter = 0;
  // Domina os pré-requisitos para que nenhuma família carregue a penalidade fixa — sem isso,
  // as famílias-raiz ficariam estruturalmente acima das demais e não seria um empate de verdade.
  keys.forEach(k=>{
    (KC_DEFS[k].prereqs||[]).forEach(pk=>{ Engine.profile(pk).masteredAt = Date.now(); });
    const p = Engine.profile(k);
    p.calibratedAt = Date.now();
    p.baselineMs = 1000; p.targetMs = 850; p.window = [];
    for(let j=0;j<20;j++) p.window.push({ms:595, correct:true, targetHit:true, calibration:false, lapse:false, at:Date.now()});
  });
  const counts = {}; const N = 3000;
  for(let i=0;i<N;i++){
    const item = Engine.next();
    counts[item.key]=(counts[item.key]||0)+1;
  }
  const maxShare = Math.max(...keys.map(k=>counts[k]/N));
  const uniform = 1/keys.length;
  if(maxShare > uniform*2.5) throw new Error('empate de scores concentrou demais o sorteio (max='+(maxShare*100).toFixed(1)+'%, uniforme='+(uniform*100).toFixed(1)+'%)');
}catch(e){
  globalThis.__TEST_RESULTS__.softmaxTieError = e.message;
}

// Retry pós-erro (modelo C): um erro real (não lapso) agenda a família para reaparecer
// dentro da janela RETRY_MIN_GAP–RETRY_MAX_GAP itens depois.
try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  Engine.recentKeys = []; Engine.errorRetryQueue = {}; Engine.itemCounter = 0;
  const item = Engine.generateItem('soma_2d_cc');
  Engine.itemCounter = 10;
  Engine.registerResult(item, 900, false, false); // erro genuíno (900ms > IMPULSE_FLOOR)
  const due = Engine.errorRetryQueue['soma_2d_cc'];
  if(due==null || due < 10+RETRY_MIN_GAP || due > 10+RETRY_MAX_GAP){
    throw new Error('retry pós-erro não agendou a família dentro da janela esperada (due='+due+')');
  }
}catch(e){
  globalThis.__TEST_RESULTS__.retryQueueError = e.message;
}

// IMPULSE_FLOOR: um erro digitado rápido demais para ter sido raciocínio real não pode
// contaminar a janela pontuada (acerto/meta/domínio/peso de padrão) nem agendar retry.
try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  Engine.recentKeys = []; Engine.errorRetryQueue = {}; Engine.itemCounter = 0;
  const p = Engine.profile('soma_2d_cc');
  for(let i=0;i<CALIBRATION_ITEMS;i++) Engine.registerResult(Engine.generateItem('soma_2d_cc',{isCalibration:true}), 1000, true, false);
  Engine.registerResult(Engine.generateItem('soma_2d_cc'), 1200, true, false); // 1 acerto real na janela
  const scoredBefore = Engine.scoredWindow(p).length;
  Engine.registerResult(Engine.generateItem('soma_2d_cc'), 200, false, false); // lapso: 200ms < IMPULSE_FLOOR
  const scoredAfter = Engine.scoredWindow(p).length;
  if(scoredAfter!==scoredBefore) throw new Error('lapso (erro < IMPULSE_FLOOR) entrou na janela pontuada');
  if(Engine.errorRetryQueue['soma_2d_cc']!=null) throw new Error('lapso agendou retry pós-erro indevidamente');
}catch(e){
  globalThis.__TEST_RESULTS__.impulseFloorError = e.message;
}

// Prazo do modo Ultimate: targetMs × multiplicador por fase, com piso de segurança; nos
// demais modos (ou fora de sessão), continua usando o ajuste manual em Opções.
try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  const p = Engine.profile('soma_2d_cc');
  p.targetMs = 2000;
  Session.mode = 'ultimate';
  const stage = Engine.stage(p);
  const expectedMult = ULTIMATE_TIMEOUT_MULT[stage] || ULTIMATE_TIMEOUT_MULT.acquisition;
  const expected = Math.max(ULTIMATE_TIMEOUT_FLOOR_MS, Math.round(2000*expectedMult));
  const item = Engine.generateItem('soma_2d_cc');
  if(item.timeoutMs!==expected) throw new Error('prazo do Ultimate não bateu com targetMs×multiplicador ('+item.timeoutMs+' vs '+expected+')');
  Session.mode = null;
  if(Engine.generateItem('soma_2d_cc').timeoutMs !== Store.data.settings.answerTimeoutSeconds*1000){
    throw new Error('fora do Ultimate, o prazo deveria voltar a usar answerTimeoutSeconds');
  }
}catch(e){
  globalThis.__TEST_RESULTS__.ultimateTimeoutError = e.message;
}

// Peso por padrão (seç. 3): um peso bem mais alto num bucket desloca a geração pra ele,
// mas nunca elimina a chance dos outros (piso de aleatoriedade).
try{
  Store.data = Store.defaults();
  const p = Engine.profile('pct_basico');
  p.patternWeights = {'pct:50':PATTERN_WEIGHT_MAX, 'pct:10':PATTERN_WEIGHT_MIN, 'pct:20':PATTERN_WEIGHT_MIN, 'pct:25':PATTERN_WEIGHT_MIN};
  let count50=0; const total=300;
  for(let i=0;i<total;i++){ if(Engine.weightedBucket(p,'pct',[10,20,50,25])===50) count50++; }
  if(count50/total < 0.4) throw new Error('peso por padrão não deslocou a geração como esperado (pct 50 saiu em '+count50+'/'+total+')');
  if(count50===total) throw new Error('peso por padrão eliminou o piso de aleatoriedade');
}catch(e){
  globalThis.__TEST_RESULTS__.patternWeightError = e.message;
}

// Geradores com viés de padrão continuam sempre válidos (resposta inteira e finita),
// agora recebendo profile como segundo argumento.
try{
  const biasedFamilies = ['soma_2d_cc','sub_2d_ce','soma_3_4d','sub_3_4d','pct_basico','pct_intermediario','pct_avancado'];
  Store.data = Store.defaults();
  biasedFamilies.forEach(key=>{
    const profile = Engine.profile(key);
    for(let i=0;i<30;i++){
      const g = KC_DEFS[key].gen(U.clamp(0.2+i*0.02,0,1), profile);
      if(!Number.isFinite(g.answer) || !Number.isInteger(g.answer)) throw new Error(key+': viés de padrão gerou resposta inválida');
    }
  });
  const biasedDecimalFamilies = ['soma_decimal','sub_decimal','mult_decimal','div_decimal'];
  biasedDecimalFamilies.forEach(key=>{
    const profile = Engine.profile(key);
    for(let i=0;i<30;i++){
      const g = KC_DEFS[key].gen(U.clamp(0.2+i*0.02,0,1), profile);
      const dp = g.features && g.features.decimalPlaces, scale = Math.pow(10,dp);
      if(!Number.isFinite(g.answer) || (dp!==1&&dp!==2) || Math.abs(Math.round(g.answer*scale)-g.answer*scale) > 1e-6){
        throw new Error(key+': viés de padrão gerou resposta decimal inválida');
      }
    }
  });
}catch(e){
  globalThis.__TEST_RESULTS__.patternGenError = e.message;
}

try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  const p = Engine.profile('soma_2d_cc');
  let calibrationItems=0;
  for(let i=0;i<CALIBRATION_ITEMS && !p.calibratedAt;i++){
    const item = Engine.next();
    if(!item.isCalibration) throw new Error('calibração concluiu sem calibratedAt');
    Engine.registerResult(item, 1000+i*10, true, false);
    calibrationItems++;
  }
  // Calibração adaptativa: tempos consistentes encerram antes do teto (>= CALIBRATION_MIN_ITEMS).
  if(!p.calibratedAt) throw new Error('calibração não concluiu com amostras consistentes');
  if(calibrationItems < CALIBRATION_MIN_ITEMS || calibrationItems > CALIBRATION_ITEMS) throw new Error('calibração terminou com número inválido de itens ('+calibrationItems+')');
  const postCalibration = Engine.next();
  if(postCalibration.isCalibration) throw new Error('calibração não terminou');
  if(!Number.isFinite(p.targetMs) || p.targetMs>=p.baselineMs) throw new Error('meta não foi criada a partir da calibração');
  const beforeBest = p.bestMs;
  Engine.registerResult(postCalibration, 300, false, false);
  if(p.bestMs!==beforeBest) throw new Error('erro criou ou alterou recorde');
  Store.data.settings.selectedSkills = ['radical_quad'];
  if(Engine.next().key!=='radical_quad') throw new Error('treino de foco não respeitou a habilidade selecionada');
}catch(e){
  globalThis.__TEST_RESULTS__.speedEngineError = e.message;
}

try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  const masteryProfile = Engine.profile('soma_2d_cc');
  for(let i=0;i<CALIBRATION_ITEMS;i++) Engine.registerResult(Engine.next(), 1000, true, false);
  if(Engine.targetRate(masteryProfile)!==0) throw new Error('calibration contaminated target rate');
  for(let i=0;i<MASTERY_MIN_ITEMS;i++){
    const item=Engine.next();
    Engine.registerResult(item, Math.min(700,item.targetMs), true, false);
  }
  if(!masteryProfile.masteredAt || Engine.stage(masteryProfile)!=='mastered') throw new Error('consistent performance did not confirm mastery');
  masteryProfile.nextReviewAt=Date.now()-1;
  for(let i=0;i<RETENTION_REVIEW_ITEMS;i++){
    const review=Engine.next();
    if(!review.isReview) throw new Error('retention review was not prioritized');
    Engine.registerResult(review, Math.min(700,review.targetMs), true, false);
  }
  if(masteryProfile.retentionPasses!==1 || masteryProfile.nextReviewAt<=Date.now()) throw new Error('passed review did not schedule the next review');
  masteryProfile.nextReviewAt=Date.now()-1;
  const failedReview=Engine.next();
  if(!failedReview.isReview) throw new Error('second review was not generated');
  Engine.registerResult(failedReview, failedReview.targetMs, false, false);
  if(masteryProfile.masteredAt || Engine.stage(masteryProfile)==='mastered') throw new Error('failed review kept mastery');
}catch(e){
  globalThis.__TEST_RESULTS__.adaptiveFlowError = e.message;
}

try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  const realNow=U.now;
  let fakeNow=1000;
  U.now=()=>fakeNow;
  UI.renderQuestion=(_item,onReady)=>{ fakeNow=5000; onReady(); };
  Session.active=true; Session.paused=false; Session.answering=false;
  Session.nextQuestion();
  if(Session.qShownAt!==5000 || Session.itemDeadline!==5000+Session.current.timeoutMs){
    throw new Error('response time included time before availability');
  }
  clearTimeout(Session.itemTimeoutHandle);
  UI.showScreen=()=>{}; Session.restCountdown=()=>{};
  Session.mode='intervalado'; Session.phase='work'; Session.cyclesLeft=2;
  Session.endsAt=7000; Session.phaseEndPending=false;
  Session.current={answer:1}; Session.answering=false;
  Session.itemDeadline=12000;
  Session.itemTimeoutHandle=setTimeout(()=>{ throw new Error('rest timeout fired'); }, 1000);
  Session.onPhaseEnd();
  if(!Session.phaseEndPending || Session.current===null || Session.answering){
    throw new Error('work block cancelled the current problem instead of waiting for it');
  }
  if(Session.endsAt!==12000) throw new Error('block end was not extended to the problem deadline');
  // Quando a conta termina (resposta ou prazo dela), o bloco vai pro descanso sem nova pergunta.
  Session.nextQuestion();
  if(Session.phase!=='rest' || Session.cyclesLeft!==1 || Session.current!==null || !Session.answering || Session.phaseEndPending){
    throw new Error('deferred block end did not go to rest after the problem concluded');
  }
  clearTimeout(Session.itemTimeoutHandle); clearTimeout(Session.nextQuestionHandle); clearInterval(Session.restHandle);
  Session.active=false; U.now=realNow;
}catch(e){
  globalThis.__TEST_RESULTS__.timingFlowError = e.message;
}

// Regressão do teclado: confirmar vazio não pode virar erro, e tocar no ✓ duas
// vezes não pode contabilizar a mesma questão duas vezes.
try{
  UI.updateAnswerDisplay=()=>{}; UI.toast=()=>{}; UI.flashAnswer=()=>{};
  UI.pushPulse=()=>{}; UI.showCorrectAnswer=()=>{};
  UI.clearAnswerFeedback=()=>{};
  Sound.correct=()=>{}; Sound.wrong=()=>{}; Haptics.correct=()=>{}; Haptics.wrong=()=>{};
  Store.data = Store.defaults();
  Store.data.settings.confirmBeforeAccept = true;
  const item = Engine.next();
  Session.active=true; Session.paused=false; Session.current=item;
  Session.typed=''; Session.records=[]; Session.answering=false;
  Session.qShownAt=U.now(); Session.firstKeyAt=0;
  Session.evaluate(false);
  if(Session.records.length!==0) throw new Error('confirmação vazia registrou uma resposta');
  const answer = String(item.answer);
  if(answer.startsWith('-')) Session.submitDigit('sign');
  answer.replace('-','').split('').forEach(d=>Session.submitDigit(d));
  if(Session.records.length!==0) throw new Error('modo de confirmação aceitou resposta antes do ✓');
  Session.evaluate(false);
  if(Session.records.length!==1) throw new Error('✓ não registrou exatamente uma resposta');
  if(Session.records[0].ms!==Session.records[0].cognitiveMs || Session.records[0].cognitiveMs>Session.records[0].totalMs){
    throw new Error('tempo cognitivo não foi separado corretamente do tempo total');
  }
  Session.evaluate(false);
  if(Session.records.length!==1) throw new Error('✓ duplicou o registro da mesma resposta');
  clearTimeout(Session.nextQuestionHandle);
  Session.active=false;
}catch(e){
  globalThis.__TEST_RESULTS__.confirmFlowError = e.message;
}

// Entrada decimal: a tecla "dec" insere o separador certo, ignora toques repetidos, exige
// confirmação manual (não envia sozinha por contagem de dígitos) e aceita tanto vírgula
// quanto ponto na comparação final.
try{
  UI.updateAnswerDisplay=()=>{}; UI.toast=()=>{}; UI.flashAnswer=()=>{};
  UI.pushPulse=()=>{}; UI.showCorrectAnswer=()=>{};
  UI.clearAnswerFeedback=()=>{};
  Sound.correct=()=>{}; Sound.wrong=()=>{}; Haptics.correct=()=>{}; Haptics.wrong=()=>{};
  Store.data = Store.defaults();
  Store.data.settings.confirmBeforeAccept = false;
  const item = Engine.generateItem('soma_decimal');
  Session.active=true; Session.paused=false; Session.current=item; Session.inputLocked=false;
  Session.typed=''; Session.records=[]; Session.answering=false;
  Session.qShownAt=U.now(); Session.firstKeyAt=0;
  Session.submitDigit('1'); Session.submitDigit('dec'); Session.submitDigit('dec'); Session.submitDigit('5');
  if((Session.typed.match(/[,.]/g)||[]).length!==1) throw new Error('tecla decimal repetida inseriu mais de um separador');
  if(Session.records.length!==0) throw new Error('resposta decimal foi enviada sozinha sem confirmação manual');
  Session.evaluate(false);
  if(Session.records.length!==1) throw new Error('✓ não confirmou a resposta decimal digitada');
  clearTimeout(Session.nextQuestionHandle);
  // Mesma família, mas digitando a resposta certa de fato (via helper), com ',' e com '.'.
  [',','.'].forEach(sep=>{
    Store.data = Store.defaults();
    const it = Engine.generateItem('sub_decimal');
    Session.current=it; Session.typed=String(it.answer).replace('.', sep);
    Session.records=[]; Session.answering=false; Session.qShownAt=U.now(); Session.firstKeyAt=U.now();
    Session.evaluate(false);
    if(!Session.records[0] || !Session.records[0].correct) throw new Error('separador "'+sep+'" não foi aceito como decimal válido');
    clearTimeout(Session.nextQuestionHandle);
  });
  Session.active=false;
}catch(e){
  globalThis.__TEST_RESULTS__.decimalInputError = e.message;
}

// Comparação decimal vs. inteiro (dado interno, seç. "Decimais"): só responde com amostra
// suficiente nos dois perfis, e classifica corretamente dentro/fora do esperado.
try{
  Store.data = Store.defaults();
  if(Engine.decimalComparison('soma_decimal')!==null){
    throw new Error('comparação decimal respondeu sem amostra suficiente');
  }
  const dProfile = Engine.profile('soma_decimal'), rProfile = Engine.profile('soma_2d_cc');
  for(let i=0;i<DECIMAL_COMPARISON_MIN_SAMPLES+2;i++){
    dProfile.window.push({ms:1000, correct:true, targetHit:true, calibration:false, lapse:false, at:Date.now()});
    rProfile.window.push({ms:1000, correct:true, targetHit:true, calibration:false, lapse:false, at:Date.now()});
  }
  const withinCmp = Engine.decimalComparison('soma_decimal');
  if(!withinCmp || !withinCmp.withinExpected) throw new Error('comparação decimal não reconheceu desempenho equivalente como esperado');
  dProfile.window = dProfile.window.map(w=>({...w, ms:1000*(EXPECTED_DECIMAL_TIME_MULT+0.5)}));
  const slowCmp = Engine.decimalComparison('soma_decimal');
  if(!slowCmp || slowCmp.withinExpected) throw new Error('comparação decimal não sinalizou lentidão desproporcional');
  const all = Engine.allDecimalComparisons();
  if(!Array.isArray(all) || !all.some(c=>c.key==='soma_decimal')) throw new Error('allDecimalComparisons() não incluiu soma_decimal');
}catch(e){
  globalThis.__TEST_RESULTS__.decimalComparisonError = e.message;
}

// Peso por dígito/linha (substitui os "fatos fracos" da tabuada): um peso alto num dígito
// desloca a geração para pares que contêm esse dígito, mas nunca elimina a aleatoriedade
// (piso PATTERN_WEIGHT_MIN); não existe mais "par pronto" rastreado (sem factKey); e o nudge
// em registerResult alimenta o peso a partir dos dígitos do item (a/b), não de um fato exato.
try{
  Store.data = Store.defaults();
  const p = Engine.profile('mult_tabuada');
  p.digitWeights['mult_tabuada:d7'] = PATTERN_WEIGHT_MAX;
  for(let d=2;d<=12;d++) p.digitWeights['mult_tabuada:d'+d] = PATTERN_WEIGHT_MIN;
  p.digitWeights['mult_tabuada:d7'] = PATTERN_WEIGHT_MAX;
  let count7=0; const total=300;
  for(let i=0;i<total;i++){
    const g = KC_DEFS.mult_tabuada.gen(0.5, p);
    if(g.a===7 || g.b===7) count7++;
  }
  if(count7/total < 0.4) throw new Error('peso por dígito não deslocou a geração (7 apareceu em '+count7+'/'+total+')');
  if(count7===total) throw new Error('peso por dígito eliminou o piso de aleatoriedade');
  // A geração nunca expõe um "fato rastreado" — a memorização de par específico acabou.
  const gd = KC_DEFS.div_tabuada.gen(0.5, p);
  if(gd.features && gd.features.factKey) throw new Error('div_tabuada ainda expõe factKey (memorização)');
  if(!Number.isFinite(gd.answer) || gd.a%gd.b!==0) throw new Error('div_tabuada gerou resposta inválida');
  // Nudge em perfil limpo: após erro, o peso dos dígitos presentes sobe; após acerto na meta,
  // desce. mult_11_19 e div_tabuada ponderam só a "linha" (fator 11–19 / divisor).
  Store.data = Store.defaults();
  const nudgeProfile = Engine.profile('mult_tabuada');
  const item = {key:'mult_tabuada', a:6, b:7, isCalibration:false};
  Engine.nudgeDigits(nudgeProfile, 'mult_tabuada', Engine.digitTrack.mult_tabuada(item), false, false);
  if(!(nudgeProfile.digitWeights['mult_tabuada:d6'] > 1)) throw new Error('nudgeDigits não subiu o peso do dígito 6 após erro');
  if(!(nudgeProfile.digitWeights['mult_tabuada:d7'] > 1)) throw new Error('nudgeDigits não subiu o peso do dígito 7 após erro');
  const afterUp = nudgeProfile.digitWeights['mult_tabuada:d6'];
  Engine.nudgeDigits(nudgeProfile, 'mult_tabuada', Engine.digitTrack.mult_tabuada(item), true, true);
  if(nudgeProfile.digitWeights['mult_tabuada:d6'] >= afterUp) throw new Error('nudgeDigits não reduziu o peso após acerto na meta');
  const p19 = Engine.profile('mult_11_19');
  const item19 = {key:'mult_11_19', a:17, b:6, isCalibration:false};
  Engine.nudgeDigits(p19, 'mult_11_19', Engine.digitTrack.mult_11_19(item19), false, false);
  if(!(p19.digitWeights['mult_11_19:d17'] > 1)) throw new Error('mult_11_19: linha 17 não foi ponderada após erro');
  if(p19.digitWeights['mult_11_19:d6']) throw new Error('mult_11_19: multiplicador (2–9) não deveria ser ponderado');
  const pdiv = Engine.profile('div_tabuada');
  const itemDiv = {key:'div_tabuada', b:8, isCalibration:false};
  Engine.nudgeDigits(pdiv, 'div_tabuada', Engine.digitTrack.div_tabuada(itemDiv), false, false);
  if(!(pdiv.digitWeights['div_tabuada:d8'] > 1)) throw new Error('div_tabuada: divisor 8 não foi ponderado após erro');
}catch(e){
  globalThis.__TEST_RESULTS__.digitWeightError = e.message;
}

// Cascata de dificuldade (seç. "Cascata"): família sofrendo (acerto < CASCADE_ACC_FLOOR com
// amostra suficiente) dá boost ao pré-requisito mais fraco ainda não dominado; sem amostra
// suficiente (ruído), não há boost.
try{
  Store.data = Store.defaults();
  const child = Engine.profile('soma_2d_cc');
  for(let i=0;i<CASCADE_MIN_ITEMS;i++) child.window.push({ms:1500, correct:false, targetHit:false, calibration:false, lapse:false, at:Date.now()});
  if(Engine.prereqReadiness('soma_2d_cc').key!=='soma_2d_sc') throw new Error('prereqReadiness não apontou o pré-requisito mais fraco');
  const scored = [{key:'soma_2d_sc', score:0.5},{key:'soma_2d_cc', score:0.8}];
  Engine.applyCascadeBoost(scored);
  const boosted = scored.find(x=>x.key==='soma_2d_sc').score;
  if(boosted < 0.5 + CASCADE_BOOST - 1e-9) throw new Error('pré-requisito não recebeu o boost de cascata');
  if(scored.find(x=>x.key==='soma_2d_cc').score!==0.8) throw new Error('cascata mexeu no score da própria família');
  const scored2 = [{key:'sub_2d_se', score:0.5},{key:'sub_2d_ce', score:0.8}];
  Engine.applyCascadeBoost(scored2);
  if(scored2.find(x=>x.key==='sub_2d_se').score!==0.5) throw new Error('cascata reagiu a ruído sem amostra suficiente');
}catch(e){
  globalThis.__TEST_RESULTS__.cascadeError = e.message;
}

// Calibração adaptativa (seç. "Calibração"): tempos consistentes encerram a calibração antes
// do teto (mín. CALIBRATION_MIN_ITEMS, sem chegar em CALIBRATION_ITEMS); tempos inconsistentes
// seguem até o teto.
try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  const p1 = Engine.profile('soma_2d_cc');
  for(let i=0;i<CALIBRATION_ITEMS;i++){
    Engine.registerResult(Engine.generateItem('soma_2d_cc',{isCalibration:true}), 1000+i*5, true, false);
    if(p1.calibratedAt) break;
  }
  if(!p1.calibratedAt) throw new Error('calibração consistente não encerrou cedo');
  if(p1.calibration.length < CALIBRATION_MIN_ITEMS) throw new Error('calibração consistente encerrou abaixo do mínimo');
  if(p1.calibration.length >= CALIBRATION_ITEMS) throw new Error('calibração consistente não usou a conclusão antecipada');
  if(!Number.isFinite(p1.targetMs) || p1.targetMs>=p1.baselineMs) throw new Error('baseline/meta não criados na conclusão antecipada');

  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['sub_2d_ce'];
  const p2 = Engine.profile('sub_2d_ce');
  for(let i=0;i<CALIBRATION_ITEMS;i++){
    Engine.registerResult(Engine.generateItem('sub_2d_ce',{isCalibration:true}), 500 + (i%2)*2000, true, false);
  }
  if(p2.calibration.length!==CALIBRATION_ITEMS || !p2.calibratedAt) throw new Error('calibração inconsistente não seguiu até o teto');
}catch(e){
  globalThis.__TEST_RESULTS__.adaptiveCalibrationError = e.message;
}
`;

eval(harness);
const RESULTS = global.__TEST_RESULTS__;

// ---------- relatório ----------
console.log('=== Testes do motor de geração de contas (KC_DEFS) ===\n');
Object.keys(RESULTS.perFamily).forEach(key=>{
  const s = RESULTS.perFamily[key];
  ok(s.badAnswer===0, `${key}: ${s.badAnswer}/${s.total} gerações com resposta inválida`);
  ok(s.badSpeech===0, `${key}: ${s.badSpeech} falhas de spokenPhrase()`);
  if(s.examples.length){
    console.error('   exemplos:', s.examples.slice(0,3).join(' | '));
  }
});
ok(RESULTS.engineSmokeError===null, 'smoke test do motor completo: '+RESULTS.engineSmokeError);
ok(RESULTS.speedEngineError===null, 'calibração, foco e recordes do motor de velocidade: '+RESULTS.speedEngineError);
ok(RESULTS.adaptiveFlowError===null, 'fluxo adaptativo (domínio e revisão por retenção): '+RESULTS.adaptiveFlowError);
ok(RESULTS.timingFlowError===null, 'fluxo de temporização (fim de bloco e descanso): '+RESULTS.timingFlowError);
ok(RESULTS.confirmFlowError===null, 'fluxo de confirmação da resposta: '+RESULTS.confirmFlowError);
ok(RESULTS.sequencingError===null, 'sequenciamento (interleaving ponderado, anti-repetição): '+RESULTS.sequencingError);
ok(RESULTS.retryQueueError===null, 'retry pós-erro (modelo C): '+RESULTS.retryQueueError);
ok(RESULTS.softmaxError===null, 'sorteio softmax (cauda não-zero, fraco domina): '+RESULTS.softmaxError);
ok(RESULTS.softmaxLargePoolError===null, 'softmax em pool grande (todas ativas — fraca domina e top5 concentra): '+RESULTS.softmaxLargePoolError);
ok(RESULTS.softmaxTieError===null, 'softmax em empate de scores (quase-uniforme, degradação graciosa): '+RESULTS.softmaxTieError);
ok(RESULTS.impulseFloorError===null, 'IMPULSE_FLOOR (lapso não contamina janela pontuada): '+RESULTS.impulseFloorError);
ok(RESULTS.ultimateTimeoutError===null, 'prazo do modo Ultimate (targetMs×multiplicador): '+RESULTS.ultimateTimeoutError);
ok(RESULTS.patternWeightError===null, 'peso por padrão desloca geração sem eliminar aleatoriedade: '+RESULTS.patternWeightError);
ok(RESULTS.patternGenError===null, 'geradores com viés de padrão continuam válidos: '+RESULTS.patternGenError);
ok(RESULTS.decimalInputError===null, 'entrada decimal (tecla de vírgula, confirmação manual, vírgula/ponto): '+RESULTS.decimalInputError);
ok(RESULTS.decimalComparisonError===null, 'comparação de dificuldade decimal vs. inteiro (dado interno): '+RESULTS.decimalComparisonError);
ok(RESULTS.digitWeightError===null, 'peso por dígito/linha (deslocamento de geração, sem factKey, nudge por operando): '+RESULTS.digitWeightError);
ok(RESULTS.cascadeError===null, 'cascata de dificuldade (boost ao pré-requisito, guarda de ruído): '+RESULTS.cascadeError);
ok(RESULTS.adaptiveCalibrationError===null, 'calibração adaptativa (consistente encerra cedo, inconsistente até o teto): '+RESULTS.adaptiveCalibrationError);

console.log(`\n${passed} verificações passaram, ${failures} falharam.`);
if(failures>0){
  console.error('\n💥 Suíte de testes FALHOU.');
  process.exit(1);
} else {
  console.log('\n✅ Suíte de testes passou.');
  process.exit(0);
}
