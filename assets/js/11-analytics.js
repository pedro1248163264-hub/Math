/* =====================================================================
   assets/js/11-analytics.js — estatísticas agregadas do histórico
   (mediana geral, percentil 90 etc.) usadas nas telas de estatísticas.
   Depende de: 01-utils.js, 07-storage.js.
   Usado por: 13-ui.js.
   ===================================================================== */

/* ---------- 9. ANALYTICS DE VELOCIDADE ---------- */
const Analytics = {
  skillStats(records, key){
    const recs=records.filter(r=>r.key===key), correct=recs.filter(r=>r.correct), times=correct.map(r=>r.cognitiveMs);
    return {key, label:kcLabel(key), n:recs.length, correct:correct.length, accuracy:recs.length?correct.length/recs.length:0,
      targetRate:recs.length?recs.filter(r=>r.targetHit).length/recs.length:0, median:U.median(times), p90:U.percentile(times,90),
      avg:U.mean(times), calibration:recs.filter(r=>r.isCalibration).length};
  },
  historicalSkillMedian(key){
    const medians=Store.data.history.filter(h=>h.bySkill&&h.bySkill[key]&&h.bySkill[key].median).map(h=>h.bySkill[key].median);
    return medians.length?U.mean(medians):null;
  },
  buildSessionSummary(records){
    const correct=records.filter(r=>r.correct), times=correct.map(r=>r.cognitiveMs), total=records.length;
    const keys=[...new Set(records.map(r=>r.key))], bySkill={}; keys.forEach(k=>bySkill[k]=this.skillStats(records,k));
    const byOp={};
    records.forEach(r=>{ const b=byOp[r.op]||(byOp[r.op]={n:0,correct:0,sumMs:0}); b.n++; b.correct+=r.correct?1:0; b.sumMs+=r.cognitiveMs; });
    Object.values(byOp).forEach(b=>{ b.avg=b.sumMs/b.n; b.acc=b.correct/b.n; });
    const skillList=Object.values(bySkill);
    let evolution=null;
    skillList.forEach(s=>{ const previous=this.historicalSkillMedian(s.key); if(previous&&s.median){ const delta=previous-s.median; if(!evolution||delta>evolution.delta) evolution={key:s.key,delta,prevAvg:previous,newAvg:s.median}; } });
    const bottleneck=[...skillList].filter(s=>s.n).sort((a,b)=>(a.targetRate-b.targetRate)||(b.median-a.median))[0]||null;
    return {id:U.uid(),date:Date.now(),mode:Session.mode,selectedSkills:Engine.selectedKeys(),
      ops:Object.keys(byOp),total,accuracy:total?correct.length/total:0,avgTime:U.mean(times),cogAvg:U.mean(records.map(r=>r.cognitiveMs)),
      motorAvg:U.mean(records.map(r=>r.motorMs)),median:U.median(times),p90:U.percentile(times,90),targetRate:total?records.filter(r=>r.targetHit).length/total:0,
      byOp,bySkill,evolution,bottleneck,kcFocus:skillList.sort((a,b)=>a.targetRate-b.targetRate).slice(0,6)};
  },
  overallMedianP90(){
    const all=[]; Object.values(Store.data.speedProfiles||{}).forEach(p=>(p.window||[]).forEach(w=>{if(w.correct) all.push(w.ms);}));
    return {median:U.median(all),p90:U.percentile(all,90)};
  }
};

