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
        retentionPasses:0, reviewResults:[], masteredAt:0, nextReviewAt:0, lastReviewAt:0};
    }
    return profiles[key];
  },
  isCalibrating(profile){ return (profile.calibration||[]).length < CALIBRATION_ITEMS; },
  scoredWindow(profile, size=12){ return (profile.window||[]).filter(x=>!x.calibration).slice(-size); },
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
    const scored=keys.map(key=>{
      const p=this.profile(key), median=U.median((p.window||[]).filter(x=>x.correct).map(x=>x.ms)) || p.baselineMs;
      const slow=median/(p.targetMs||p.baselineMs), misses=1-this.targetRate(p), errors=1-this.recentAccuracy(p);
      const recent=this.recentKeys.lastIndexOf(key)>=0 ? 0.18 : 0;
      const prereqPenalty=this.prereqsReady(key)?0:0.28;
      return {key, score:slow*0.55+misses*0.3+errors*0.35-recent-prereqPenalty};
    }).sort((a,b)=>b.score-a.score);
    if(Store.data.settings.drillMode==='foco') return {key:scored[0].key,isReview:false};
    const pool=scored.slice(0,Math.min(3,scored.length));
    return {key:pool[Math.floor(Math.random()*pool.length)].key,isReview:false};
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
    do { gen=def.gen(t); pairKey=gen.exprText || (gen.a+'_'+gen.b); tries++; }
    while(profile.recentPairs.includes(pairKey) && tries<6);
    profile.recentPairs.push(pairKey); if(profile.recentPairs.length>24) profile.recentPairs.shift();
    this.recentKeys.push(key); if(this.recentKeys.length>3) this.recentKeys.shift();
    const opDef=OPS[def.op], targetMs=profile.targetMs||this.defaultBaseline(def.op);
    return {op:def.op, a:gen.a, b:gen.b, answer:gen.answer, features:gen.features, key,
      kcLabel:def.label, timeoutMs:Store.data.settings.answerTimeoutSeconds*1000, targetMs,
      symbol:opDef.symbol, label:opDef.label, isCalibration:!!meta.isCalibration, isReview:!!meta.isReview,
      exprText:gen.exprText, c:gen.c, d:gen.d, innerOp:gen.innerOp, outerOp:gen.outerOp,
      leftOp:gen.leftOp, rightOp:gen.rightOp, midOp:gen.midOp, terms:gen.terms, ops:gen.ops,
      isEquation:!!gen.isEquation };
  },
  registerResult(item, cognitiveMs, correct, timedOut){
    const p=this.profile(item.key), now=Date.now();
    const targetHit=!!(correct && cognitiveMs<=item.targetMs && !item.isCalibration);
    const result={ms:cognitiveMs, correct:!!correct, targetHit, calibration:!!item.isCalibration, at:now};
    p.window.push(result); if(p.window.length>30) p.window.shift();
    if(item.isCalibration && correct) p.calibration.push(cognitiveMs);
    if(this.isCalibrating(p)===false && p.calibration.length===CALIBRATION_ITEMS && !p.calibratedAt){
      const initial=U.median(p.calibration);
      p.baselineMs=Math.round(initial);
      p.targetMs=Math.round(U.clamp(initial*0.85, 450, 10000));
      p.calibratedAt=now;
    }
    const recent=this.scoredWindow(p), accuracy=this.recentAccuracy(p), hitRate=this.targetRate(p);
    if(!item.isCalibration && recent.length>=8){
      if(accuracy>=0.88 && hitRate>=0.65){ p.difficulty=U.clamp(p.difficulty+0.045,0,1); p.targetMs=Math.round(Math.max(350,p.targetMs*0.98)); p.level=(p.level||0)+1; }
      else if(accuracy<0.70){ p.difficulty=U.clamp(p.difficulty-0.06,0,1); p.targetMs=Math.round(Math.min(p.baselineMs,p.targetMs*1.04)); }
      else if(hitRate<0.45){ p.difficulty=U.clamp(p.difficulty-0.025,0,1); p.targetMs=Math.round(Math.min(p.baselineMs,p.targetMs*1.025)); }
    }
    if(!item.isCalibration && !p.masteredAt && this.hasMasteryEvidence(p)){
      p.masteredAt=now; p.retentionPasses=0; p.reviewResults=[]; p.nextReviewAt=now+RETENTION_INTERVALS[0];
    }
    if(item.isReview){
      p.reviewResults.push({correct:!!correct, ms:cognitiveMs, at:now});
      p.reviewResults=p.reviewResults.slice(-RETENTION_REVIEW_ITEMS);
      if(!correct){
        p.masteredAt=0; p.retentionPasses=0; p.reviewResults=[]; p.nextReviewAt=0;
        p.difficulty=U.clamp(p.difficulty-0.08,0,1);
        p.targetMs=Math.round(Math.min(p.baselineMs,p.targetMs*1.05));
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
