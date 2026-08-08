/* =====================================================================
   assets/js/10-session.js — controlador de sessão (Session): fluxo de uma
   sessão de treino do início ao fim (sprint, resistência, intervalado,
   HIIT), incluindo temporização de cada resposta e registro de
   resultados no Engine.
   Depende de: 01, 02(indireto via Engine), 03(i18n), 07(Store),
   08(Engine), 09(TTS/Sound/Haptics).
   Usado por: 13-ui.js.
   ===================================================================== */

/* ---------- 8. CONTROLADOR DE SESSÃO ----------
   Nota de arquitetura (3.15 da auditoria): o estado do app vive em 4 lugares com ciclos
   de vida diferentes — importante ter isso em mente ao ler/alterar o código:
     1. Store.data       — persistido em localStorage (settings, kc, history). Sobrevive
                            a recarregamentos e sessões.
     2. Session          — runtime de UMA sessão de treino (records, timers, estado
                            aquecimento/fluxo/fadiga/frustração). Descartado ao final.
     3. Engine.reintroQueue / recentKcHistory
                          — runtime do algoritmo de seleção, resetado a cada Session.start().
     4. UI.pulseHistory  — puramente de apresentação (histórico visual da barra de pulso),
                            não afeta nem é afetado pela lógica do motor.
   Nenhum desses é serializado além do primeiro (Store.data). ---------- */
const Session = {
  active:false, paused:false,
  mode:null, current:null,
  qShownAt:0, firstKeyAt:0, typed:'',
  records:[],           // {op,key,ms,cognitiveMs,motorMs,correct,etype,kcLabel,isReview,isAcquisition}
  timerHandle:null, endsAt:0, phase:'work', cyclesLeft:0,
  restHandle:null, itemTimeoutHandle:null, itemDeadline:null, nextQuestionHandle:null,
  answering:false, inputLocked:false, phaseEndPending:false,
  state:'aquecimento',  // aquecimento | fluxo | fadiga | frustracao (seç. 13)
  touchedKcs:new Set(),

  start(){
    const s = Store.data.settings;
    this.mode = s.mode;
    clearInterval(this.timerHandle); clearInterval(this.restHandle);
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
    this.records = [];
    this.answering = false;
    this.phaseEndPending = false;
    this.active = true; this.paused = false;
    this.state = 'aquecimento';
    this.touchedKcs = new Set();
    Engine.recentKeys = [];
    UI.showScreen('training');
    if(this.mode==='sprint'){
      this.endsAt = U.now() + s.sprintSeconds*1000;
      this.startTimerLoop();
    } else if(this.mode==='resistencia'){
      this.endsAt = null;
      this.startTimerLoop();
    } else if(this.mode==='intervalado'){
      this.phase='work'; this.cyclesLeft = s.intCycles;
      this.endsAt = U.now() + s.intWork*1000;
      this.startTimerLoop();
    } else if(this.mode==='hiit'){
      this.phase='work'; this.cyclesLeft = 10;
      this.endsAt = U.now() + 40*1000;
      this.startTimerLoop();
    }
    this.nextQuestion();
  },
  startTimerLoop(){
    clearInterval(this.timerHandle);
    this.timerHandle = setInterval(()=>this.tick(), 200);
  },
  tick(){
    if(!this.active || this.paused) return;
    UI.updateRing(this);
    if(this.endsAt==null) return;
    const remaining = this.endsAt - U.now();
    if(remaining <= 0) this.onPhaseEnd();
  },
  onPhaseEnd(){
    const s = Store.data.settings;
    if(this.mode==='sprint'){ this.finish(); return; }
    if(this.mode==='resistencia'){ return; }
    if(this.mode==='intervalado' || this.mode==='hiit'){
      if(this.phase==='work'){
        // Já estamos esperando a última conta do bloco terminar — não faz nada de novo.
        if(this.phaseEndPending) return;
        // BUGFIX: se o bloco acabou no meio de uma conta, não a cancela: espera a conta
        // ser respondida (ou expirar pelo prazo dela, answerTimeoutSeconds) antes de ir
        // para o descanso. O relógio é estendido até o prazo da conta para acompanhar.
        if(this.current && !this.answering){
          this.phaseEndPending = true;
          if(this.itemDeadline && this.itemDeadline > this.endsAt) this.endsAt = this.itemDeadline;
          return;
        }
        this.endWorkPhase();
      } else {
        this.phase='work';
        const workSec = this.mode==='hiit' ? 40 : s.intWork;
        this.endsAt = U.now() + workSec*1000;
        UI.showScreen('training');
        this.nextQuestion();
      }
    }
  },
  // Encerra o bloco de trabalho (descendo um ciclo ou terminando a sessão) e entra no
  // descanso. Também é o destino quando o fim de bloco foi adiado até a conta terminar.
  endWorkPhase(){
    const s = Store.data.settings;
    this.phaseEndPending = false;
    this.cyclesLeft--;
    if(this.cyclesLeft<=0){ this.finish(); return; }
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
    this.itemDeadline=null; this.current=null; this.answering=true; this.typed='';
    try{ speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel(); }catch(e){}
    this.phase='rest';
    const restSec = this.mode==='hiit' ? 20 : s.intRest;
    this.endsAt = U.now() + restSec*1000;
    UI.showScreen('rest');
    this.restCountdown(restSec);
  },
  restCountdown(sec){
    let n = sec;
    document.getElementById('restCount').textContent = n;
    clearInterval(this.restHandle);
    this.restHandle = setInterval(()=>{
      n--;
      document.getElementById('restCount').textContent = Math.max(n,0);
      if(n<=0) clearInterval(this.restHandle);
    }, 1000);
  },
  togglePause(){
    this.paused = !this.paused;
    document.getElementById('btnPause').textContent = this.paused ? '▶' : '⏸';
    if(this.paused){
      this._pauseRemaining = this.endsAt!=null ? this.endsAt - U.now() : null;
      // Só existe um deadline de item para pausar se ele já foi agendado (a voz já
      // terminou de ler, ou TTS estava desativado). Se ainda estava lendo, não há nada
      // a preservar aqui — TTS.pause() cuida da fala em si.
      this._itemPauseRemaining = this.itemDeadline!=null ? Math.max(0, this.itemDeadline - U.now()) : null;
      clearTimeout(this.itemTimeoutHandle);
      try{ speechSynthesis && speechSynthesis.pause && speechSynthesis.pause(); }catch(e){}
    } else {
      if(this._pauseRemaining!=null) this.endsAt = U.now() + this._pauseRemaining;
      // BUGFIX: retomar precisa reagendar o timeout do item — antes ele ficava
      // cancelado para sempre após uma pausa, e a pergunta nunca mais expirava sozinha.
      if(this._itemPauseRemaining!=null && this.current){
        this.itemDeadline = U.now() + this._itemPauseRemaining;
        this.itemTimeoutHandle = setTimeout(()=>this.handleTimeout(), this._itemPauseRemaining);
      }
      try{ speechSynthesis && speechSynthesis.resume && speechSynthesis.resume(); }catch(e){}
    }
  },

  isWarmup(){ return this.records.length < 3; },

  // Detecção leve de estado de sessão (seç. 13): aquecimento / fluxo / fadiga / frustração
  updateState(){
    const n = this.records.length;
    if(n < 3){ this.state = 'aquecimento'; return; }
    const last8 = this.records.slice(-8);
    const last4 = this.records.slice(-4);
    if(last4.length===4){
      const wrongIn4 = last4.filter(r=>!r.correct).length;
      const t1 = U.mean(last4.slice(0,2).map(r=>r.ms)), t2 = U.mean(last4.slice(2).map(r=>r.ms));
      if(wrongIn4>=3 && t2 > t1*1.1){ this.state = 'frustracao'; return; }
    }
    if(this.records.length>=16){
      const last16 = this.records.slice(-16);
      const first8 = last16.slice(0,8), second8 = last16.slice(8);
      const accFirst = U.mean(first8.map(r=>r.correct?1:0)), accSecond = U.mean(second8.map(r=>r.correct?1:0));
      const rtFirst = U.mean(first8.map(r=>r.ms)), rtSecond = U.mean(second8.map(r=>r.ms));
      if(rtSecond > rtFirst*1.2 && accSecond < accFirst-0.15){ this.state = 'fadiga'; return; }
    }
    this.state = 'fluxo';
  },

  nextQuestion(){
    if(!this.active || this.paused) return;
    this.answering = false;
    // Fim de bloco adiado: a conta que estava aberta acabou de ser respondida (ou
    // expirou) — em vez de começar outra pergunta, encerra o bloco e vai pro descanso.
    if(this.phaseEndPending){
      this.endWorkPhase();
      return;
    }
    this.current = Engine.next();
    if(!this.current){ UI.toast(t('no_op_selected')); return; }
    const item = this.current;
    this.typed = '';
    this.firstKeyAt = 0;
    this.qShownAt = U.now();
    clearTimeout(this.itemTimeoutHandle);
    // BUGFIX: o prazo automático de abandono (itemTimeoutHandle) só começa a contar
    // quando a pergunta está de fato disponível para o usuário — ou seja, depois que a
    // leitura por voz (TTS) tiver terminado, se estiver ativa. Antes, esse prazo corria
    // em paralelo com a fala; em perguntas mais longas ele vencia no meio da leitura,
    // disparando a pergunta seguinte, cujo TTS.speak() cancela (speechSynthesis.cancel())
    // a fala anterior ainda em andamento — por isso a voz parecia cortar/quebrar no meio.
    this.itemDeadline = null;
    // Enquanto a voz (TTS) está lendo a conta, o usuário não pode digitar — o input só é
    // liberado no callback que roda quando a leitura termina (ou imediatamente, se o TTS
    // estiver desativado). Isso também garante que o tempo cognitivo nunca fique negativo
    // (a primeira tecla não pode mais ser anterior ao fim da leitura).
    this.inputLocked = true;
    UI.renderQuestion(item, ()=>{
      if(!this.active || this.paused || this.current!==item) return; // sessão mudou enquanto a voz lia
      this.inputLocked = false;
      this.qShownAt = U.now();
      this.itemDeadline = this.qShownAt + item.timeoutMs;
      this.itemTimeoutHandle = setTimeout(()=>this.handleTimeout(), item.timeoutMs);
      // Se o bloco terminou enquanto a voz ainda lia a conta, estende o relógio até o
      // prazo da conta para o anel acompanhar a espera antes do descanso.
      if(this.phaseEndPending && this.itemDeadline > this.endsAt) this.endsAt = this.itemDeadline;
    });
  },
  handleTimeout(){
    if(!this.active || this.paused || !this.current) return;
    this.typed = '';
    this.evaluate(true);
  },
  submitDigit(d){
    if(!this.active || this.paused || !this.current || this.answering || this.inputLocked) return;
    if(d==='back'){
      this.typed = this.typed.slice(0,-1);
      UI.updateAnswerDisplay(this.typed);
      return;
    }
    if(this.firstKeyAt===0){
      this.firstKeyAt = U.now();
      // A pessoa já está digitando, então o timeout automático de abandono não deve
      // continuar correndo — senão a pergunta pode expirar no meio da digitação de uma
      // resposta de vários dígitos. Isso vale independente de "stopClockOnFirstKey":
      // aquela opção decide apenas se o tempo *registrado* como cognitivo para de contar
      // aqui ou só na confirmação da resposta (ver evaluate()).
      clearTimeout(this.itemTimeoutHandle);
    }
    if(d==='sign'){
      this.typed = this.typed.startsWith('-') ? this.typed.slice(1) : ('-'+this.typed);
      UI.updateAnswerDisplay(this.typed);
      return;
    }
    this.typed += d;
    UI.updateAnswerDisplay(this.typed);
    const digitsOnly = this.typed.replace('-','');
    const expectedLen = String(Math.abs(this.current.answer)).length;
    // "Confirmar resposta" ligado: nunca envia sozinho, sempre espera toque em ✓/Enter.
    // Desligado (padrão): envia assim que a quantidade de dígitos bate — exceto quando a
    // resposta pode ser negativa, caso em que ainda é preciso confirmar manualmente (o
    // usuário pode não ter terminado de tocar em "±" ainda).
    if(Store.data.settings.confirmBeforeAccept) return;
    if(this.current.answer >= 0 && digitsOnly.length >= expectedLen){ this.evaluate(false); }
  },
  evaluate(timedOut){
    // O botão ✓/Enter só confirma uma resposta de fato. Sem esta guarda, um toque
    // acidental registrava erro com campo vazio; toques repetidos também avaliavam a
    // mesma conta mais de uma vez antes da próxima pergunta aparecer.
    if(!this.active || this.paused || !this.current || this.answering) return;
    // Enquanto a voz ainda está lendo, o ✓/Enter não pode avaliar (a digitação também
    // está bloqueada); o abandono por prazo nunca acontece nesse intervalo, pois o
    // timeout só é agendado depois que a leitura termina.
    if(this.inputLocked && !timedOut) return;
    if(!timedOut && !this.typed.length){
      UI.toast(t('answer_required'));
      return;
    }
    this.answering = true;
    clearTimeout(this.itemTimeoutHandle);
    this.itemDeadline = null;
    const item = this.current;
    const now = U.now();
    const totalMs = timedOut ? item.timeoutMs : (now - this.qShownAt);
    // A opção "stopClockOnFirstKey" existia nas configurações mas nunca era lida — o
    // relógio sempre parava na primeira tecla, mesmo para quem desligava a opção.
    // Ligada (padrão): tempo cognitivo = só o raciocínio, até a primeira tecla; o resto
    // vira tempo motor. Desligada: não há separação — o tempo cognitivo é o tempo total
    // até a confirmação da resposta, e não há tempo motor a descontar.
    const stopOnFirstKey = Store.data.settings.stopClockOnFirstKey;
    const splitAtFirstKey = stopOnFirstKey && !!this.firstKeyAt;
    const cognitiveMs = timedOut ? item.timeoutMs : (splitAtFirstKey ? (this.firstKeyAt - this.qShownAt) : totalMs);
    const motorMs = timedOut ? 0 : (splitAtFirstKey ? (now - this.firstKeyAt) : 0);
    // Velocidade mental é medida até a primeira tecla quando a opção está ligada; caso
    // contrário, usa o tempo total da questão. O tempo total permanece salvo à parte
    // como métrica motora secundária, quando aplicável.
    const effectiveMs = cognitiveMs;
    const correct = !timedOut && this.typed.length>0 && (+this.typed === item.answer);
    const result = Engine.registerResult(item, effectiveMs, correct, !!timedOut);
    this.touchedKcs.add(item.key);
    this.records.push({op:item.op, key:item.key, kcLabel:item.kcLabel, ms:effectiveMs, totalMs, cognitiveMs, motorMs,
      correct, etype:result.etype, targetHit:result.targetHit, isCalibration:item.isCalibration, targetMs:item.targetMs});
    this.updateState();
    UI.flashAnswer(correct);
    UI.pushPulse(classify(result));
    UI.updateHud(this.records);
    if(correct){ Sound.correct(); Haptics.correct(); }
    else { Sound.wrong(); Haptics.wrong(); UI.showCorrectAnswer(item.answer); }
    const gap = Store.data.settings.gapMs;
    const holdError = correct ? 0 : Store.data.settings.correctAnswerShowMs;
    this.nextQuestionHandle = setTimeout(()=>{
      if(!this.active) return;
      UI.clearAnswerFeedback();
      this.nextQuestionHandle = setTimeout(()=>{ this.nextQuestion(); }, gap);
    }, holdError);
  },
  finish(){
    this.active = false;
    this.answering = false;
    this.phaseEndPending = false;
    clearInterval(this.timerHandle); clearInterval(this.restHandle);
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
    this._saveSession();
  },
  // Salva o resumo da sessão, atualiza o recorde de sequência e mostra a tela de
  // resultado — usado tanto pelo fim natural quanto pela saída antecipada.
  _saveSession(){
    const summary = Analytics.buildSessionSummary(this.records);
    Store.data.history.push(summary);
    let streak=0, maxStreak=0;
    this.records.forEach(r=>{ if(r.correct){streak++; maxStreak=Math.max(maxStreak,streak);} else streak=0; });
    Store.data.bestStreak = Math.max(Store.data.bestStreak||0, maxStreak);
    Store.save();
    UI.renderSummary(summary);
    UI.showScreen('summary');
  },
  // Sai do treino atual sem esperar o fim do sprint/série. Pede confirmação para evitar
  // toque acidental, e some com o estado da sessão em vez de deixá-la "pendurada" —
  // antes disso a única forma de sair era fechar e reabrir o app inteiro.
  exit(){
    if(!confirm(t('confirm_exit_training'))) return;
    this.active = false;
    this.paused = false;
    this.answering = false;
    this.phaseEndPending = false;
    clearInterval(this.timerHandle); clearInterval(this.restHandle);
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
    try{ speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel(); }catch(e){}
    document.getElementById('btnPause').textContent = '⏸';
    if(this.records.length){
      // Já respondeu pelo menos uma conta: fecha como uma sessão parcial, com resumo,
      // em vez de descartar o progresso silenciosamente.
      this._saveSession();
    } else {
      UI.showScreen('home');
      UI.setTab('home');
      UI.renderHome();
    }
  }
};
