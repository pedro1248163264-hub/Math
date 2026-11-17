/* =====================================================================
   assets/js/10-progress.js — progresso do jogador (a camada de "recompensa"):
   XP e level geral, meta diária, sequência de dias, semana e estrelas da rodada.
   Tudo aqui é determinístico e testável sem DOM.
   Depende de: 01-utils.js, 02-engine-constants.js, 03-i18n.js, 07-storage.js.
   Usado por: 11-session.js, 14-ui.js.
   ===================================================================== */

const Progress = {
  pad(n){ return n<10 ? '0'+n : ''+n; },
  // Chave do dia no fuso local: 'AAAA-MM-DD'
  dayKey(ts){
    const d = ts==null ? new Date() : new Date(ts);
    return d.getFullYear()+'-'+this.pad(d.getMonth()+1)+'-'+this.pad(d.getDate());
  },
  addDays(key, delta){
    const [y,m,d] = key.split('-').map(Number);
    const dt = new Date(y, m-1, d+delta, 12);   // meio-dia: imune a horário de verão
    return this.dayKey(dt.getTime());
  },
  day(key){
    const D = Store.data.daily;
    const k = key || this.dayKey();
    if(!D[k]) D[k] = {items:0, correct:0, xp:0, goalHit:false};
    return D[k];
  },

  /* ----- level geral ----- */
  // XP acumulado necessário para ALCANÇAR o nível n.
  levelFloorXp(n){ return n<=1 ? 0 : Math.round(PLAYER_LEVEL_SCALE*Math.pow(n-1, PLAYER_LEVEL_EXP)); },
  titleKeyFor(level){
    const ks = [1,4,7,11,16,23]; let k = 1;
    ks.forEach(x=>{ if(level>=x) k = x; });
    return 'title_'+k;
  },
  levelInfo(xp){
    xp = Math.max(0, xp||0);
    let n = 1; while(this.levelFloorXp(n+1)<=xp) n++;
    const lo = this.levelFloorXp(n), hi = this.levelFloorXp(n+1);
    return {level:n, into:xp-lo, need:hi-lo, frac:(xp-lo)/(hi-lo), titleKey:this.titleKeyFor(n), title:t(this.titleKeyFor(n))};
  },
  // Soma XP ao jogador; devolve {from,to,leveledUp} para a UI comemorar.
  addXp(n){
    const p = Store.data.player;
    const before = this.levelInfo(p.xp).level;
    p.xp += Math.max(0, Math.round(n||0));
    const after = this.levelInfo(p.xp);
    const d = this.day(); d.xp += Math.max(0, Math.round(n||0));
    return {from:before, to:after.level, leveledUp:after.level>before, title:after.title};
  },

  /* ----- meta diária e sequência ----- */
  // A meta do dia é por CONTAS (goalMode 'count') ou por TEMPO treinado (goalMode 'time').
  goalMode(){ return Store.data.settings.goalMode==='time' ? 'time' : 'count'; },
  goal(){ return Store.data.settings.dailyGoal; },                          // meta em contas
  goalMs(){ return Store.data.settings.dailyGoalMinutes*60000; },           // meta em tempo (ms)
  // Relógio do dia: só existe para o dia atual (ao virar o dia o tempo anterior é descartado).
  // Acumula sempre durante o treino, qualquer que seja o tipo de meta — assim trocar de tipo no meio do dia não perde nada.
  timer(){
    const T = Store.data.dayTimer, k = this.dayKey();
    if(T.day!==k){ T.day = k; T.ms = 0; }
    return T;
  },
  todayMs(){ return this.timer().ms; },
  // Quanto da meta do dia já foi feito (0..1), no tipo de meta atual.
  goalFrac(){
    const d = this.day();
    return U.clamp(this.goalMode()==='time' ? this.todayMs()/this.goalMs() : d.items/this.goal(), 0, 1);
  },
  // Marca a meta como batida (uma vez por dia) e atualiza a sequência. Devolve true só na hora em que bate.
  checkGoal(){
    const d = this.day();
    if(d.goalHit) return false;
    const reached = this.goalMode()==='time' ? this.todayMs()>=this.goalMs() : d.items>=this.goal();
    if(!reached) return false;
    d.goalHit = true;
    const st = Store.data.streak, today = this.dayKey();
    if(st.lastGoalDay!==today){
      st.current = st.lastGoalDay===this.addDays(today,-1) ? st.current+1 : 1;
      st.best = Math.max(st.best, st.current);
      st.lastGoalDay = today;
    }
    return true;
  },
  // Registra uma conta respondida (lapsos contam: foi tentativa real). Devolve {goalJustHit}.
  recordItem(correct){
    const d = this.day();
    d.items++; if(correct) d.correct++;
    Store.data.player.items++;
    const goalJustHit = this.checkGoal();
    this.prune();
    return {goalJustHit};
  },
  // Soma tempo treinado ao relógio do dia. Devolve {goalJustHit} (só pode bater por aqui se a meta for de tempo).
  addTime(ms){
    const T = this.timer();
    T.ms += Math.max(0, Math.round(ms||0));
    return {goalJustHit: this.goalMode()==='time' ? this.checkGoal() : false};
  },
  prune(){
    const keys = Object.keys(Store.data.daily).sort();
    while(keys.length>DAILY_KEEP_DAYS) delete Store.data.daily[keys.shift()];
  },
  // Sequência exibida: só vale se o último dia com meta batida foi hoje ou ontem.
  currentStreak(){
    const st = Store.data.streak, today = this.dayKey();
    if(st.lastGoalDay===today || st.lastGoalDay===this.addDays(today,-1)) return st.current;
    return 0;
  },
  // Sequência em risco: tinha sequência até ontem e hoje ainda não bateu a meta.
  streakAtRisk(){
    const st = Store.data.streak, today = this.dayKey();
    return st.current>0 && st.lastGoalDay===this.addDays(today,-1) && !this.day(today).goalHit;
  },
  todayItems(){ return this.day().items; },
  // Últimos 7 dias (do mais antigo para hoje) para a faixa da semana.
  weekStrip(){
    const today = this.dayKey(), out = [], D = Store.data.daily;
    const names = I18N[Store.data.settings.appLang==='en'?'en':'pt'].days_short;
    for(let i=6;i>=0;i--){
      const k = this.addDays(today,-i), e = D[k];
      const [y,m,d] = k.split('-').map(Number);
      out.push({key:k, label:names[new Date(y,m-1,d,12).getDay()], items:e?e.items:0, hit:!!(e&&e.goalHit), today:i===0});
    }
    return out;
  },

  /* ----- estrelas da rodada (sempre ≥ 1 ao concluir: nunca zero, para não humilhar) ----- */
  roundStars(accuracy, hitRate){
    if(accuracy>=0.9 && hitRate>=0.55) return 3;
    if(accuracy>=0.8) return 2;
    return 1;
  }
};
