/* =====================================================================
   assets/js/14b-free-mode.js — MODO LIVRE (FreeMode): treino sem cronômetro, sem pontuação
   e sem nenhum registro. A pessoa escolhe a trilha, o level e o tamanho das contas e responde
   no seu ritmo; pode trocar de level durante o treino.

   REGRA DE OURO: este módulo NUNCA escreve em Store.data nem chama Store.save().
   Também não usa Engine.track / registerResult / Progress / Session — o que evita, de uma vez,
   XP, barra do level, adaptação (m), pesos, meta diária, sequência, relógio do dia, histórico,
   log para a IA e marcos. A escolha (trilha/level/tamanho) e o placar da sessão vivem só na
   memória: recarregar o app ou sair do modo livre apaga tudo.
   As contas vêm direto do gerador do level (levelDef(...).gen(m, null)); com `tr = null` os
   geradores ignoram os pesos pessoais e não mexem em nada.

   Depende de: 02 (constantes), 03 (t/tf), 04 (COMPARE_SYMBOLS), 06 (TRACKS), 08 (Engine.itemFromGen),
   09 (Sound/Haptics/TTS), 11 (answerMatches), 14-ui.js (UI, $, esc). Usado por: 14-ui.js e 15-init.js.
   ===================================================================== */

// Tamanho das contas dentro do level: faixa de m (0 = parte baixa do level, 1 = parte alta).
const FREE_SIZES = {small:[0, 0.35], mix:[0, 1], big:[0.65, 1]};
const FREE_RECENT_MAX = 12;   // evita repetir as últimas contas

const FreeMode = {
  active:false,
  cfg:{key:'soma', level:1, size:'mix'},   // só em memória
  current:null, typed:'', answering:false, awaitingNext:false, inputLocked:true,
  nextHandle:null, recent:[], done:0, hits:0, tipOpen:false,

  /* ----- configuração ----- */
  levels(){ return trackLevels(this.cfg.key); },
  setTrack(key){
    if(!TRACKS[key]) return;
    this.cfg.key = key;
    this.cfg.level = U.clamp(this.cfg.level, 1, this.levels());
  },
  setLevel(level){ this.cfg.level = U.clamp(Math.round(+level)||1, 1, this.levels()); },
  setSize(size){ if(FREE_SIZES[size]) this.cfg.size = size; },

  /* ----- tela de escolha ----- */
  open(){
    this.renderSetup();
    UI.showScreen('free');
  },
  renderSetup(){
    const c = this.cfg, def = TRACKS[c.key];
    const tr = $('freeTracks'); tr.innerHTML = '';
    TRACK_ORDER.forEach(key=>{
      const d = TRACKS[key], b = document.createElement('button');
      b.className = 'free-track'+(key===c.key?' active':'');
      b.style.setProperty('--c', d.color);
      b.innerHTML = `<span class="sym">${esc(d.sym)}</span><span>${esc(trackLabel(key))}</span>`;
      b.onclick = ()=>{ this.setTrack(key); this.renderSetup(); };
      tr.appendChild(b);
    });
    const lv = $('freeLevels'); lv.innerHTML = '';
    for(let l=1; l<=this.levels(); l++){
      const b = document.createElement('button');
      b.className = 'lad free-lad'+(l===c.level?' cur':'');
      b.style.setProperty('--c', def.color);
      b.innerHTML = `<b>${l}</b>`;
      b.onclick = ()=>{ this.setLevel(l); this.renderSetup(); };
      lv.appendChild(b);
    }
    $('freeLevelName').textContent = tf('track_level_short',{n:c.level})+' — '+levelName(c.key, c.level);
    $('freeLevelTip').textContent = levelTip(c.key, c.level);
    const sz = $('freeSizes'); sz.innerHTML = '';
    [['small','free_size_small'],['mix','free_size_mix'],['big','free_size_big']].forEach(([v,k])=>{
      const b = document.createElement('button');
      b.textContent = t(k); b.className = c.size===v ? 'active' : '';
      b.onclick = ()=>{ this.setSize(v); this.renderSetup(); };
      sz.appendChild(b);
    });
  },

  /* ----- treino ----- */
  start(){
    this._clearTimers();
    this.active = true; this.current = null; this.typed = ''; this.answering = false; this.awaitingNext = false;
    this.inputLocked = true; this.recent = []; this.done = 0; this.hits = 0; this.tipOpen = false;
    UI.resetTraining(0);
    $('screen-training').classList.add('free');
    UI.showScreen('training');
    this.renderBar();
    this.nextQuestion();
  },
  _clearTimers(){
    clearTimeout(this.nextHandle); this.nextHandle = null;
    try{ if(typeof speechSynthesis!=='undefined' && speechSynthesis.cancel) speechSynthesis.cancel(); }catch(e){}
  },
  // m aleatório na faixa do tamanho escolhido.
  _pickM(){ const [lo,hi] = FREE_SIZES[this.cfg.size] || FREE_SIZES.mix; return lo + (hi-lo)*Math.random(); },
  makeItem(){
    const {key, level} = this.cfg, def = levelDef(key, level);
    let gen, m, tries = 0, pk;
    do{
      m = this._pickM(); gen = def.gen(m, null); pk = gen.exprText || (gen.a+'_'+gen.b); tries++;
    } while(this.recent.includes(pk) && tries<8);
    this.recent.push(pk); if(this.recent.length>FREE_RECENT_MAX) this.recent.shift();
    return Object.assign(Engine.itemFromGen(gen, key, level, m), {kind:'free'});
  },
  nextQuestion(){
    if(!this.active) return;
    clearTimeout(this.nextHandle); this.nextHandle = null;
    this.answering = false; this.awaitingNext = false; this.typed = ''; this.inputLocked = true;
    const item = this.makeItem();
    this.current = item;
    UI.setBlockChip({track:item.key, kind:'free', level:item.level});
    UI.setKeypadMode(UI.keypadModeFor(item));
    UI.clearAnswerFeedback();
    UI.renderQuestion(item, ()=>{
      if(!this.active || this.current!==item) return;
      this.inputLocked = false;
    });
    this.renderBar();
  },
  // Troca de level no meio do treino: descarta a conta atual e já mostra uma nova (o tamanho se escolhe na tela de escolha).
  changeLevel(delta){
    const old = this.cfg.level;
    this.setLevel(old+delta);
    if(this.cfg.level===old) return;
    this.nextQuestion();
  },

  /* ----- entrada de resposta (mesma interface do Session, usada pelo teclado) ----- */
  submitDigit(d){
    if(!this.active || !this.current || this.answering || this.awaitingNext || this.inputLocked) return;
    if(d==='back'){ this.typed = this.typed.slice(0,-1); UI.updateAnswerDisplay(this.typed); return; }
    if(d==='slash'){
      if(!this.current.answerFrac || !this.typed.length || this.typed.includes('/')) return;
      this.typed += '/'; UI.updateAnswerDisplay(this.typed); return;
    }
    if(this.current.answerFrac && (d==='sign' || d==='dec')) return;
    if(d==='sign'){ this.typed = this.typed.startsWith('-') ? this.typed.slice(1) : ('-'+this.typed); UI.updateAnswerDisplay(this.typed); return; }
    if(d==='dec'){
      if(this.typed.includes(',') || this.typed.includes('.')) return;
      this.typed += U.decimalSep(); UI.updateAnswerDisplay(this.typed); return;
    }
    this.typed += d;
    UI.updateAnswerDisplay(this.typed);
    const item = this.current, digitsOnly = this.typed.replace('-','');
    const isDecimalItem = !!(item.features && item.features.decimalPlaces);
    if(Store.data.settings.confirmBeforeAccept) return;
    if(!item.answerFrac && item.answer>=0 && Number.isInteger(item.answer) && !isDecimalItem && digitsOnly.length>=String(Math.abs(item.answer)).length) this.evaluate();
  },
  submitComparison(sym){
    if(!this.active || !this.current || this.answering || this.awaitingNext || this.inputLocked) return;
    if(this.current.op!=='fracao_comparacao') return;
    this.typed = sym; UI.updateAnswerDisplay(this.typed);
    if(Store.data.settings.confirmBeforeAccept) return;
    this.evaluate();
  },
  // ✓ / Enter: confere a resposta; depois de um erro, o mesmo botão segue para a próxima conta.
  evaluate(){
    if(!this.active || !this.current) return;
    if(this.awaitingNext){ this.nextQuestion(); return; }
    if(this.answering || this.inputLocked) return;
    if(!this.typed.length){ UI.toast(t('answer_required')); return; }
    this.answering = true;
    const item = this.current, correct = answerMatches(this.typed, item);
    this.done++; if(correct) this.hits++;
    UI.flashAnswer(correct);
    UI.pushPulse(correct ? 'target' : 'err');
    this.renderBar();
    if(correct){
      Sound.correct(); Haptics.correct();
      this.nextHandle = setTimeout(()=>{ UI.clearAnswerFeedback(); this.nextQuestion(); }, Store.data.settings.gapMs);
    } else {
      Sound.wrong(); Haptics.wrong();
      UI.showCorrectAnswer(item);
      UI.showHint(t('free_continue_hint'));
      this.awaitingNext = true;      // sem pressa: espera a pessoa tocar ✓
    }
  },

  /* ----- barra do modo livre (level atual, tamanho, placar da sessão) ----- */
  renderBar(){
    const c = this.cfg;
    $('freeLevelNow').textContent = tf('track_level_short',{n:c.level})+' · '+levelName(c.key, c.level);
    $('freeDown').disabled = c.level<=1; $('freeUp').disabled = c.level>=this.levels();
    $('hudXp').textContent = '✓ '+this.hits+'/'+this.done;
    $('freeTip').textContent = this.tipOpen ? levelTip(c.key, c.level) : '';
    $('freeTip').classList.toggle('hidden', !this.tipOpen);
  },
  toggleTip(){ this.tipOpen = !this.tipOpen; this.renderBar(); },

  /* ----- saída: volta para a escolha; nada a salvar ----- */
  exit(){
    if(!this.active) return;
    const {done, hits} = this;
    this.active = false; this.current = null; this.answering = false; this.awaitingNext = false;
    this._clearTimers();
    $('screen-training').classList.remove('free');
    UI.hideOverlays();
    this.open();
    if(done>0) UI.toast(tf('free_exit_toast',{h:hits, n:done}));
  },

  /* ----- ligações dos botões (chamado por UI.init) ----- */
  bind(){
    $('btnFree').onclick = ()=>this.open();
    $('freeBack').onclick = ()=>{ UI.showScreen('home'); UI.setTab('home'); UI.renderHome(); };
    $('freeStart').onclick = ()=>this.start();
    $('freeDown').onclick = ()=>this.changeLevel(-1);
    $('freeUp').onclick = ()=>this.changeLevel(1);
    $('freeTipBtn').onclick = ()=>this.toggleTip();
  }
};
