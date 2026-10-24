/* =====================================================================
   assets/js/13-export.js — exportação dos dados salvos (trilhas e rodadas) em
   CSV e JSON.
   Depende de: 06-tracks.js, 07-storage.js, 08-speed-engine.js.
   Usado por: 14-ui.js.
   ===================================================================== */

const Export = {
  download(filename, content, mime){
    const blob = new Blob([content], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  },
  csvText(){
    const rows = [['trilha','level','de','nivelada','concluida','patente','xp_barra','estrelas','meta_ms','mediana_recente_ms','acerto_recente','contas_total']];
    Object.keys(TRACKS).forEach(key=>{
      const tr = Store.data.tracks[key]; if(!tr) return;
      const acc = Engine.recentAccuracy(tr), med = Engine.recentMedian(tr);
      rows.push([trackLabel(key), tr.level, Engine.levelCount(key), tr.placed?'sim':'nao', tr.done?'sim':'nao', tr.rank,
        Math.round(tr.xp), Engine.starsTotal(tr), Math.round(Engine.goalMs(tr)), med==null?'':Math.round(med),
        acc==null?'':(acc*100).toFixed(1)+'%', tr.items]);
    });
    rows.push([]);
    rows.push(['rodada_data','concluida','contas','precisao','mediana_ms','dentro_da_meta','xp','estrelas','melhor_combo','trilhas']);
    Store.data.history.forEach(h=>{
      rows.push([new Date(h.date).toISOString(), h.completed===false?'nao':'sim', h.total, (h.accuracy*100).toFixed(1)+'%',
        Math.round(h.median||h.avgTime||0), h.targetRate==null?'':(h.targetRate*100).toFixed(1)+'%', h.xp==null?'':h.xp,
        h.stars==null?'':h.stars, h.bestCombo==null?'':h.bestCombo, (h.tracks||h.selectedSkills||[]).join('|')]);
    });
    return rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  },
  csv(){ this.download('mental_math_dados.csv', this.csvText(), 'text/csv'); },
  json(){ this.download('mental_math_dados.json', JSON.stringify(Store.data, null, 2), 'application/json'); }
};
