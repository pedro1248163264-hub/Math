/* =====================================================================
   assets/js/12-export.js — exportação dos dados salvos (histórico e
   perfis) para download em JSON.
   Depende de: 07-storage.js.
   Usado por: 13-ui.js.
   ===================================================================== */

/* ---------- 10. EXPORTAÇÃO ---------- */
const Export = {
  download(filename, content, mime){
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  },
  csv(){
    const rows = [['habilidade','operacao','calibracao','meta_ms','mediana_ms','precisao_recente','dentro_da_meta','melhor_marca_ms','ultima_pratica']];
    Object.values(Store.data.speedProfiles||{}).forEach(p=>{
      if(!KC_DEFS[p.key]) return;
      const w=p.window||[], correct=w.filter(x=>x.correct).map(x=>x.ms);
      rows.push([KC_DEFS[p.key].label, KC_DEFS[p.key].op, `${(p.calibration||[]).length}/${CALIBRATION_ITEMS}`,
        Math.round(p.targetMs||0), Math.round(U.median(correct)||0), (Engine.recentAccuracy(p)*100).toFixed(1)+'%',
        (Engine.targetRate(p)*100).toFixed(1)+'%', p.bestMs||'', p.lastPracticeAt?new Date(p.lastPracticeAt).toISOString():'']);
    });
    rows.push([]);
    rows.push(['sessao_data','modo','estilo','habilidades','total_contas','precisao','mediana_cognitiva_ms','dentro_da_meta']);
    Store.data.history.forEach(h=>{
      rows.push([new Date(h.date).toISOString(), h.mode, h.drillMode||'', (h.selectedSkills||[]).join('|'), h.total,
        (h.accuracy*100).toFixed(1)+'%', Math.round(h.median||h.avgTime||0), (h.targetRate==null?'':(h.targetRate*100).toFixed(1)+'%')]);
    });
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    this.download('calculo_rapido_dados.csv', csv, 'text/csv');
  },
  json(){
    this.download('calculo_rapido_dados.json', JSON.stringify(Store.data, null, 2), 'application/json');
  }
};

