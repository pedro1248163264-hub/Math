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
       produz sempre um `answer` inteiro, finito e dentro de uma faixa
       plausível — nunca NaN, Infinity, ou fração quebrada.
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
global.document = {
  addEventListener(){}, removeEventListener(){},
  querySelectorAll(){ return []; }, querySelector(){ return null; },
  getElementById(){ return null; }, createElement(){ return { classList:{add(){},remove(){},toggle(){}}, appendChild(){}, style:{}, setAttribute(){} }; },
  createElementNS(){ return { setAttribute(){} }; }
};
global.performance = global.performance || { now:()=>Date.now() };

// ---------- carrega o motor a partir de assets/app.js ----------
const appPath = path.join(__dirname, '..', 'assets', 'app.js');
let engineSrc = fs.readFileSync(appPath, 'utf8');
// Remove o bloco de inicialização real (que mexeria em document/DOMContentLoaded/serviceWorker
// de verdade) — os testes chamam Store.load() e o motor manualmente, sob controle.
engineSrc = engineSrc.split('/* ---------- 12. INICIALIZAÇÃO ---------- */')[0];

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

globalThis.__TEST_RESULTS__ = { perFamily: {}, engineSmokeError: null, speedEngineError: null, adaptiveFlowError: null, timingFlowError: null, confirmFlowError: null };

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
    const answerOk = Number.isFinite(g.answer) && Number.isInteger(g.answer) && Math.abs(g.answer) < 1e6;
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
  Store.data.settings.drillMode = 'misto';
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

try{
  Store.data = Store.defaults();
  Store.data.settings.selectedSkills = ['soma_2d_cc'];
  const p = Engine.profile('soma_2d_cc');
  for(let i=0;i<CALIBRATION_ITEMS;i++){
    const item = Engine.next();
    if(!item.isCalibration) throw new Error('calibração terminou cedo');
    Engine.registerResult(item, 1000+i*10, true, false);
  }
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
  UI.pushPulse=()=>{}; UI.updateHud=()=>{}; UI.showCorrectAnswer=()=>{};
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
ok(RESULTS.confirmFlowError===null, 'fluxo de confirmação da resposta: '+RESULTS.confirmFlowError);

console.log(`\n${passed} verificações passaram, ${failures} falharam.`);
if(failures>0){
  console.error('\n💥 Suíte de testes FALHOU.');
  process.exit(1);
} else {
  console.log('\n✅ Suíte de testes passou.');
  process.exit(0);
}
