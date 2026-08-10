/* =====================================================================
   assets/js/08-speed-engine.js — motor de velocidade/adaptação (Engine):
   escolha da próxima KC, geração de item, Elo contínuo, metas de tempo,
   critérios de domínio e agendamento de revisão por retenção.
   Depende de: 01-utils.js, 02-engine-constants.js, 06-skills-graph.js,
   07-storage.js.
   Usado por: 10-session.js e 13-ui.js.
   ===================================================================== */

/* ---------- 6. MOTOR DE VELOCIDADE ----------
   A unidade é a família de cálculo. Não há pré-requisito, desbloqueio ou repetição
   corretiva: cada perfil é calibrado e depois recebe dificuldade pela performance. */
const Engine = {
  recentKeys:[],
  errorRetryQueue:{},   // key -> itemCounter a partir do qual o erro deve "resurgir" (seç. 2, modelo C)
  itemCounter:0,        // itens gerados na sessão atual — resetado em Session.start()
  defaultBaseline(op){ return (OPS[op] && OPS[op].baseline) || 1800; },
  cv(arr){ if(arr.length<2) return 0; const m=U.mean(arr); if(!m) return 0; return Math.sqrt(U.mean(arr.map(v=>(v-m)*(v-m)))/Math.abs(m)); },
  selectedKeys(){
    const keys = (Store.data.settings.selectedSkills||[]).filter(k=>KC_DEFS[k]);
    return keys.length ? keys : [DEFAULT_SELECTED_SKILLS[0]];
  },
  profile(key){
    const profiles = Store.data.speedProfiles || (Store.data.speedProfiles={});
    if(!profiles[key]){
      const baseline = this.defaultBaseline(KC_DEFS[key].op);
      profiles[key] = {key, calibration:[], baselineMs:baseline, targetMs:Math.round(baseline*0.85), difficulty:0.3, level:0, window:[], bestMs:null, lastPracticeAt:0,
        retentionPasses:0, reviewResults:[], masteredAt:0, nextReviewAt:0, lastReviewAt:0,
        samplesInStage:0, patternWeights:{}};
    }
    return profiles[key];
  },
  isCalibrating(profile){ return (profile.calibration||[]).length < CALIBRATION_ITEMS; },
  scoredWindow(profile, size=12){ return (profile.window||[]).filter(x=>!x.calibration && !x.lapse).slice(-size); },
  // ---------- Peso por padrão dentro da família (seç. 3 da revisão do motor) ----------
  // Nunca repete um enunciado específico (isso continua garantido só por recentPairs, sem
  // relação com isto) — só torna mais provável, na PRÓXIMA geração, o atributo (vai-um,
  // empréstimo, grupo de %) onde o perfil está mais lento/errando mais. Interno ao
  // algoritmo; não é exposto em nenhuma tela.
  patternAttrs:{
    soma_2d_cc:['carries'], soma_3_4d:['carries'],
    sub_2d_ce:['borrows'], sub_3_4d:['borrows'],
    pct_basico:['pct'], pct_intermediario:['pct'], pct_avancado:['pct'],
    soma_decimal:['decimalPlaces'], sub_decimal:['decimalPlaces'],
    mult_decimal:['decimalPlaces'], div_decimal:['decimalPlaces']
  },
  // Atributos cujo valor bruto (não uma contagem sem/um/vários) já é a própria chave do
  // bucket — pct (10/20/25...) e decimalPlaces (1/2 casas) funcionam assim.
  directBucketAttrs:['pct','decimalPlaces'],
  bucketFromCount(attr, count){
    if(count<=0) return 'sem';
    if(count===1) return 'um';
    return 'varios';
  },
  // Sorteio ponderado por peso: cada opção sempre tem alguma chance (PATTERN_WEIGHT_MIN),
  // nunca fica 100% previsível mesmo com peso máximo — mantém aleatoriedade real.
  weightedBucket(profile, attr, options){
    const weights = (profile && profile.patternWeights) || {};
    const arr = options.map(o=>({o, w: weights[attr+':'+String(o)]!=null ? weights[attr+':'+String(o)] : 1}));
    const total = arr.reduce((s,x)=>s+x.w,0);
    let r = Math.random()*total;
    for(const x of arr){ if(r<x.w) return x.o; r-=x.w; }
    return arr[arr.length-1].o;
  },
  nudgePatternWeight(profile, item, correct, targetHit){
    const attrs = this.patternAttrs[item.key];
    if(!attrs || !item.features) return;
    profile.patternWeights = profile.patternWeights || {};
    attrs.forEach(attr=>{
      const raw = item.features[attr];
      if(raw===undefined) return;
      const bucket = this.directBucketAttrs.includes(attr) ? String(raw) : this.bucketFromCount(attr, raw);
      const wKey = attr+':'+bucket;
      const cur = profile.patternWeights[wKey]!=null ? profile.patternWeights[wKey] : 1;
      const good = correct && targetHit;
      const next = good ? cur - PATTERN_WEIGHT_NUDGE : cur + PATTERN_WEIGHT_NUDGE;
      profile.patternWeights[wKey] = U.clamp(next, PATTERN_WEIGHT_MIN, PATTERN_WEIGHT_MAX);
    });
  },
  // ---------- Comparação decimal vs. inteiro (dado interno, não exposto em tela) ----------
  // Mede o quanto a vírgula em si pesa: compara tempo/acerto da família decimal com os da
  // família inteira "irmã" (DECIMAL_PAIR_KC, seç. 2d das constantes) e confere se a
  // diferença está dentro do que já era esperado (EXPECTED_DECIMAL_*) ou se está
  // desproporcional — sinal de que vale treinar vírgula separadamente. Não decide nada
  // sozinho (não muda dificuldade/sequenciamento); é só um dado que a tela de estatísticas
  // poderá exibir depois de revisada.
  decimalComparison(key){
    const refKey = DECIMAL_PAIR_KC[key];
    if(!refKey || !KC_DEFS[refKey]) return null;
    const dProfile = this.profile(key), rProfile = this.profile(refKey);
    const dWindow = this.scoredWindow(dProfile, 20), rWindow = this.scoredWindow(rProfile, 20);
    if(dWindow.length < DECIMAL_COMPARISON_MIN_SAMPLES || rWindow.length < DECIMAL_COMPARISON_MIN_SAMPLES) return null;
    const dCorrectMs = dWindow.filter(x=>x.correct).map(x=>x.ms), rCorrectMs = rWindow.filter(x=>x.correct).map(x=>x.ms);
    if(!dCorrectMs.length || !rCorrectMs.length) return null;
    const decimalMedianMs = U.median(dCorrectMs), refMedianMs = U.median(rCorrectMs);
    const decimalAcc = U.mean(dWindow.map(x=>x.correct?1:0)), refAcc = U.mean(rWindow.map(x=>x.correct?1:0));
    const timeRatio = refMedianMs>0 ? decimalMedianMs/refMedianMs : null;
    const accDrop = refAcc - decimalAcc; // positivo = decimal pior que a versão inteira
    const timeWithinExpected = timeRatio==null ? true : timeRatio <= EXPECTED_DECIMAL_TIME_MULT;
    const accWithinExpected = accDrop <= EXPECTED_DECIMAL_ACC_DROP;
    return {
      key, refKey,
      decimalMedianMs, refMedianMs, timeRatio, expectedTimeRatio:EXPECTED_DECIMAL_TIME_MULT,
      decimalAcc, refAcc, accDrop, expectedAccDrop:EXPECTED_DECIMAL_ACC_DROP,
      withinExpected: timeWithinExpected && accWithinExpected,
      sampleSize:{decimal:dWindow.length, ref:rWindow.length}
    };
  },
  // Roda decimalComparison() para todas as famílias decimais com par definido; ignora as
  // que ainda não têm dado suficiente (retorna null em decimalComparison).
  allDecimalComparisons(){
    return Object.keys(DECIMAL_PAIR_KC).map(key=>this.decimalComparison(key)).filter(Boolean);
  },
  recentAccuracy(profile){ const w=this.scoredWindow(profile); return w.length ? U.mean(w.map(x=>x.correct?1:0)) : 1; },
  targetRate(profile){ const w=this.scoredWindow(profile); return w.length ? U.mean(w.map(x=>x.targetHit?1:0)) : 0; },
  hasMasteryEvidence(profile){
    const w=this.scoredWindow(profile), correct=w.filter(x=>x.correct).map(x=>x.ms);
    return w.length>=MASTERY_MIN_ITEMS && correct.length>=MASTERY_MIN_ITEMS*MASTERY_MIN_ACC &&
      this.recentAccuracy(profile)>=MASTERY_MIN_ACC && this.targetRate(profile)>=MASTERY_MIN_TARGET_RATE && this.cv(correct)<=0.35;
  },
  isReviewDue(profile, now=Date.now()){
    return !!(profile.masteredAt && profile.nextReviewAt && now>=profile.nextReviewAt);
  },
  stage(profile, now=Date.now()){
    if(this.isCalibrating(profile)) return 'calibrating';
    if(this.isReviewDue(profile, now)) return 'review_due';
    if(profile.masteredAt) return 'mastered';
    const w=this.scoredWindow(profile);
    return w.length>=ACQ_MIN_ITEMS && this.recentAccuracy(profile)>=0.80 ? 'consolidating' : 'acquisition';
  },
  prereqsReady(key){ return (KC_DEFS[key].prereqs||[]).every(prereq=>!!this.profile(prereq).masteredAt); },
  chooseKey(){
    const keys=this.selectedKeys();
    const now=Date.now();
    const reviews=keys.filter(k=>this.isReviewDue(this.profile(k),now));
    if(reviews.length){
      const key=reviews.sort((a,b)=>(this.profile(a).nextReviewAt-this.profile(b).nextReviewAt)||((this.profile(a).reviewResults||[]).length-(this.profile(b).reviewResults||[]).length))[0];
      return {key,isReview:true};
    }
    const calibrating=keys.filter(k=>this.isCalibrating(this.profile(k)));
    if(calibrating.length){
      const least=calibrating.reduce((min,k)=>Math.min(min,this.profile(k).calibration.length), Infinity);
      const pool=calibrating.filter(k=>this.profile(k).calibration.length<=least+1).slice(0,POOL_TARGET);
      return {key:U.choice(pool),isReview:false};
    }
    if(keys.length===1) return {key:keys[0],isReview:false};
    // Motor de sequência único (substitui Foco/Misto — seç. 2 da revisão): modelo B
    // (interleaving ponderado) + C (retry pós-erro). Nunca repete a mesma família 2x
    // seguidas; nenhuma família passa de ANTI_CLUMP_MAX_SHARE das últimas
    // ANTI_CLUMP_WINDOW escolhas; erro recente reaparece dentro de RETRY_MIN_GAP–
    // RETRY_MAX_GAP itens via boost temporário de score.
    const lastKey = this.recentKeys.length ? this.recentKeys[this.recentKeys.length-1] : null;
    const windowRecent = this.recentKeys.slice(-ANTI_CLUMP_WINDOW);
    let scored=keys.map(key=>{
      const p=this.profile(key), median=U.median((p.window||[]).filter(x=>x.correct).map(x=>x.ms)) || p.baselineMs;
      const slow=median/(p.targetMs||p.baselineMs), misses=1-this.targetRate(p), errors=1-this.recentAccuracy(p);
      const prereqPenalty=this.prereqsReady(key)?0:0.28;
      let score=slow*0.55+misses*0.3+errors*0.35-prereqPenalty;
      const shareCount=windowRecent.filter(k=>k===key).length;
      if(windowRecent.length>=ANTI_CLUMP_WINDOW && shareCount/ANTI_CLUMP_WINDOW>=ANTI_CLUMP_MAX_SHARE) score-=0.9;
      const retryDue=this.errorRetryQueue[key];
      if(retryDue!=null && this.itemCounter>=retryDue) score+=0.6;
      return {key, score};
    });
    if(lastKey!=null && scored.length>1) scored=scored.filter(s=>s.key!==lastKey);
    scored.sort((a,b)=>b.score-a.score);
    const pool=scored.slice(0,Math.min(SEQUENCING_POOL,scored.length));
    const totalW=pool.reduce((s,x)=>s+Math.max(0.01,x.score+1),0);
    let r=Math.random()*totalW, chosen=pool[pool.length-1].key;
    for(const x of pool){ const w=Math.max(0.01,x.score+1); if(r<w){ chosen=x.key; break; } r-=w; }
    if(this.errorRetryQueue[chosen]!=null && this.itemCounter>=this.errorRetryQueue[chosen]) delete this.errorRetryQueue[chosen];
    return {key:chosen,isReview:false};
  },
  next(){
    const selection=this.chooseKey();
    return this.generateItem(selection.key, {isCalibration:this.isCalibrating(this.profile(selection.key)), isReview:selection.isReview});
  },
  generateItem(key, meta={}){
    const def=KC_DEFS[key], profile=this.profile(key);
    const t=U.clamp((profile.difficulty||0.3)+U.rint(-8,8)/100, 0, 1);
    let gen, tries=0, pairKey;
    profile.recentPairs=profile.recentPairs||[];
    do { gen=def.gen(t, profile); pairKey=gen.exprText || (gen.a+'_'+gen.b); tries++; }
    while(profile.recentPairs.includes(pairKey) && tries<6);
    profile.recentPairs.push(pairKey); if(profile.recentPairs.length>24) profile.recentPairs.shift();
    this.recentKeys.push(key); if(this.recentKeys.length>ANTI_CLUMP_WINDOW) this.recentKeys.shift();
    this.itemCounter=(this.itemCounter||0)+1;
    const opDef=OPS[def.op], targetMs=profile.targetMs||this.defaultBaseline(def.op);
    return {op:def.op, a:gen.a, b:gen.b, answer:gen.answer, features:gen.features, key,
      kcLabel:def.label, timeoutMs:this.computeTimeoutMs(profile, targetMs), targetMs,
      symbol:opDef.symbol, label:opDef.label, isCalibration:!!meta.isCalibration, isReview:!!meta.isReview,
      exprText:gen.exprText, c:gen.c, d:gen.d, innerOp:gen.innerOp, outerOp:gen.outerOp,
      leftOp:gen.leftOp, rightOp:gen.rightOp, midOp:gen.midOp, terms:gen.terms, ops:gen.ops,
      isEquation:!!gen.isEquation };
  },
  // Prazo de resposta (seç. 2 da revisão): no modo Ultimate, targetMs × multiplicador por
  // fase, com piso de segurança — substitui o segundo fixo global só nesse modo. Nos
  // demais modos (Intervalado/HIIT), continua sendo o ajuste manual em Opções.
  computeTimeoutMs(profile, targetMs){
    if(typeof Session==='undefined' || Session.mode!=='ultimate'){
      return Store.data.settings.answerTimeoutSeconds*1000;
    }
    const stage=this.stage(profile);
    const mult=ULTIMATE_TIMEOUT_MULT[stage] || ULTIMATE_TIMEOUT_MULT.acquisition;
    return Math.max(ULTIMATE_TIMEOUT_FLOOR_MS, Math.round(targetMs*mult));
  },
  registerResult(item, cognitiveMs, correct, timedOut){
    const p=this.profile(item.key), now=Date.now();
    const targetHit=!!(correct && cognitiveMs<=item.targetMs && !item.isCalibration);
    // Lapso motor (seç. 9/IMPULSE_FLOOR): um erro digitado rápido demais para ter sido
    // raciocínio real (ex.: typo) ainda fica salvo no histórico — mas não conta para
    // acerto/meta/domínio, dificuldade contínua ou peso de padrão. Não tem relação com o
    // tipo do erro mostrado na sessão (etype continua 'erro' normalmente).
    const isLapse = !item.isCalibration && !correct && !timedOut && cognitiveMs < IMPULSE_FLOOR;
    const result={ms:cognitiveMs, correct:!!correct, targetHit, calibration:!!item.isCalibration, lapse:isLapse, at:now};
    p.window.push(result); if(p.window.length>30) p.window.shift();
    if(item.isCalibration && correct) p.calibration.push(cognitiveMs);
    if(this.isCalibrating(p)===false && p.calibration.length===CALIBRATION_ITEMS && !p.calibratedAt){
      const initial=U.median(p.calibration);
      p.baselineMs=Math.round(initial);
      p.targetMs=Math.round(U.clamp(initial*0.85, 450, 10000));
      p.calibratedAt=now;
      p.samplesInStage=0;
    }
    const accuracy=this.recentAccuracy(p), hitRate=this.targetRate(p);
    // Elo contínuo (substitui o ajuste em lote de 8 — seç. 4 da revisão do motor): cada
    // resposta pontuada, não-calibração e não-lapso, move difficulty/targetMs um passo
    // pequeno. K decai conforme mais amostras se acumulam nesta fase — alto no início
    // (acha o nível certo rápido), baixo depois de estabilizado (resistente a uma
    // sequência ruim isolada). As decisões grandes (domínio, revisão) continuam em lote,
    // com evidência acumulada, logo abaixo — isso aqui só afeta o dia a dia.
    if(!item.isCalibration && !isLapse){
      p.samplesInStage=(p.samplesInStage||0)+1;
      const K=U.clamp(K_BASE/Math.sqrt(1+p.samplesInStage), K_MIN, K_MAX);
      if(correct && targetHit){
        p.difficulty=U.clamp(p.difficulty+K,0,1);
        p.targetMs=Math.round(Math.max(350,p.targetMs*(1-K*0.4)));
        p.level=(p.level||0)+1;
      } else if(correct){
        p.targetMs=Math.round(Math.min(p.baselineMs,p.targetMs*(1+K*0.2)));
      } else {
        p.difficulty=U.clamp(p.difficulty-K*1.3,0,1);
        p.targetMs=Math.round(Math.min(p.baselineMs,p.targetMs*(1+K*0.6)));
      }
    }
    // Peso por padrão (seç. 3): só famílias com atributo categórico mapeado em
    // patternAttrs; nunca expõe nada em tela, só influencia a próxima geração.
    if(!item.isCalibration && !isLapse) this.nudgePatternWeight(p, item, correct, targetHit);
    // Retry pós-erro (modelo C, seç. 2): um erro real (não lapso, não calibração) agenda
    // a família para reaparecer dentro de RETRY_MIN_GAP–RETRY_MAX_GAP itens.
    if(!item.isCalibration && !correct && !isLapse){
      this.errorRetryQueue[item.key]=(this.itemCounter||0)+RETRY_MIN_GAP+U.rint(0,RETRY_MAX_GAP-RETRY_MIN_GAP);
    }
    if(!item.isCalibration && !p.masteredAt && this.hasMasteryEvidence(p)){
      p.masteredAt=now; p.retentionPasses=0; p.reviewResults=[]; p.nextReviewAt=now+RETENTION_INTERVALS[0];
      p.samplesInStage=0;
    }
    if(item.isReview){
      p.reviewResults.push({correct:!!correct, ms:cognitiveMs, at:now});
      p.reviewResults=p.reviewResults.slice(-RETENTION_REVIEW_ITEMS);
      if(!correct){
        p.masteredAt=0; p.retentionPasses=0; p.reviewResults=[]; p.nextReviewAt=0;
        p.difficulty=U.clamp(p.difficulty-0.08,0,1);
        p.targetMs=Math.round(Math.min(p.baselineMs,p.targetMs*1.05));
        p.samplesInStage=0;
      } else if(p.reviewResults.length>=RETENTION_REVIEW_ITEMS){
        p.retentionPasses++;
        p.lastReviewAt=now;
        p.reviewResults=[];
        p.nextReviewAt=now+RETENTION_INTERVALS[Math.min(p.retentionPasses,RETENTION_INTERVALS.length-1)];
      }
    }
    if(correct && !item.isCalibration && accuracy>=0.85 && (!p.bestMs || cognitiveMs<p.bestMs)) p.bestMs=cognitiveMs;
    p.lastPracticeAt=now;
    Store.save();
    if(timedOut) return {etype:'abandono', targetHit:false};
    if(!correct) return {etype:'erro', targetHit:false};
    return {etype:targetHit?'meta':'lento_correto', targetHit};
  }
};

function classify(result){
  if(result.etype==='erro' || result.etype==='abandono') return 'err';
  return result.targetHit ? 'target' : 'slow';
}
