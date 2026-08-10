/* =====================================================================
   assets/js/07-storage.js — persistência local (localStorage): defaults,
   migração de versões antigas de settings e o objeto Store usado por todo
   o app para ler/gravar estado.
   Depende de: 02-engine-constants.js, 04-operations.js.
   Usado por: todos os módulos que leem configurações, perfis de
   habilidade ou histórico (Engine, Session, Analytics, Export, UI).
   ===================================================================== */

/* ---------- 5. STORAGE LOCAL (localStorage, tudo offline) ---------- */
const DB_KEY = 'calcrapido_db_v2';
const SETTINGS_VERSION = 5;
const CALIBRATION_ITEMS = 8;
const DEFAULT_SELECTED_SKILLS = ['soma_2d_cc','sub_2d_ce','mult_11_19','mult_2d','pct_intermediario','potencia_basica','radical_quad'];
const Store = {
  data: null,
  defaults(){
    return {
      settings:{
        ops:defaultOpsMap(),
        mode:'ultimate',
        intWork:30, intRest:10, intCycles:4,
        ultimateGoalMinutes:20,
        tts:false, hideDuringTts:false,
        vibration:true, sounds:true,
        gapMs:400, correctAnswerShowMs:900,
        answerTimeoutSeconds:10,
        voiceRate:1.0, voiceLang:'pt-BR',
        theme:'dark', fontScale:1,
        appLang:'pt',         stopClockOnFirstKey:true,
        confirmBeforeAccept:true,
        focusMode:false,
        selectedSkills:[...DEFAULT_SELECTED_SKILLS],
        selectAllSkills:true
      },
      settingsVersion:SETTINGS_VERSION,
      kc:{},
      speedProfiles:{},
      history:[],
      bestStreak:0
    };
  },
  load(){
    try{
      const raw = localStorage.getItem(DB_KEY);
      this.data = raw ? JSON.parse(raw) : this.defaults();
      const d = this.defaults();
      this.data.settings = Object.assign({}, d.settings, this.data.settings||{});
      // Migra instalações antigas, que tinham aceitação automática como padrão.
      // A pessoa ainda pode desligar a opção nas configurações, mas uma atualização
      // não deve manter silenciosamente o comportamento que causava o problema.
      const oldSettingsVersion = this.data.settingsVersion||0;
      const mustEnableManualConfirmation = oldSettingsVersion < 2;
      if(mustEnableManualConfirmation){
        this.data.settings.confirmBeforeAccept = true;
      }
      // BUGFIX: "ops" é um objeto aninhado, então o Object.assign acima troca o objeto
      // inteiro pelo salvo — qualquer operação nova adicionada em uma atualização do app
      // (como "expressao") ficaria invisível para quem já tinha dados salvos. Mesclamos
      // o nível de "ops" também, preservando as escolhas do usuário para as já existentes.
      this.data.settings.ops = Object.assign({}, d.settings.ops, this.data.settings.ops||{});
      // BUGFIX/revisão v2: os modos "Rapidez" (sprint) e "Resistência" (resistencia) foram
      // removidos (substituídos pelo modo único "ultimate"). Uma instalação antiga com um
      // desses salvo em settings.mode cairia num modo que não existe mais no seletor —
      // migra silenciosamente para "ultimate" em vez de deixar a sessão sem iniciar.
      if(!['ultimate','intervalado','hiit'].includes(this.data.settings.mode)){
        this.data.settings.mode = 'ultimate';
      }
      const savedGoal = Number(this.data.settings.ultimateGoalMinutes);
      this.data.settings.ultimateGoalMinutes = Number.isFinite(savedGoal)
        ? U.clamp(Math.round(savedGoal), 0, 180) : d.settings.ultimateGoalMinutes;
      const savedAnswerTimeout = Number(this.data.settings.answerTimeoutSeconds);
      this.data.settings.answerTimeoutSeconds = Number.isFinite(savedAnswerTimeout)
        ? U.clamp(Math.round(savedAnswerTimeout), 3, 60)
        : d.settings.answerTimeoutSeconds;
      // BUGFIX: espanhol (es-ES) foi removido das vozes suportadas — quem tinha essa opção
      // salva de uma versão anterior cairia numa opção que não existe mais no seletor.
      if(!['pt-BR','en-US'].includes(this.data.settings.voiceLang)) this.data.settings.voiceLang = 'pt-BR';
      this.data.kc = this.data.kc || {};
      this.data.speedProfiles = this.data.speedProfiles || {};
      // Migra o histórico adaptativo anterior para perfis de velocidade, sem apagar
      // medições já coletadas. Famílias ainda não usadas são calibradas ao serem escolhidas.
      Object.keys(this.data.kc).forEach(key=>{
        if(!KC_DEFS[key] || this.data.speedProfiles[key]) return;
        const old = this.data.kc[key];
        const samples = (old.window||[]).filter(w=>w && Number.isFinite(w.ms)).slice(-20)
          .map(w=>({ms:w.ms, correct:!!w.correct, targetHit:false, at:w.t||Date.now()}));
        const correct = samples.filter(s=>s.correct).map(s=>s.ms);
        const baseline = correct.length ? U.median(correct) : (old.rtBaseline||Engine.defaultBaseline(KC_DEFS[key].op));
        this.data.speedProfiles[key] = {
          key, calibration:correct.slice(0,CALIBRATION_ITEMS), baselineMs:Math.round(baseline),
          targetMs:Math.round(baseline*0.85), difficulty:0.3, level:0,
          window:samples, bestMs:null, lastPracticeAt:old.lastPracticeAt||0
        };
      });
      Object.keys(this.data.speedProfiles).forEach(key=>{
        if(!KC_DEFS[key]){ delete this.data.speedProfiles[key]; return; }
        const p=this.data.speedProfiles[key];
        p.calibration=Array.isArray(p.calibration)?p.calibration.filter(Number.isFinite):[];
        p.window=Array.isArray(p.window)?p.window.filter(w=>w&&Number.isFinite(w.ms)).map(w=>Object.assign({calibration:false},w)):[];
        p.difficulty=Number.isFinite(p.difficulty)?U.clamp(p.difficulty,0,1):0.3;
        p.retentionPasses=Number.isFinite(p.retentionPasses)?p.retentionPasses:0;
        p.reviewResults=Array.isArray(p.reviewResults)?p.reviewResults.filter(r=>r&&typeof r.correct==='boolean').slice(-RETENTION_REVIEW_ITEMS):[];
        p.masteredAt=Number.isFinite(p.masteredAt)?p.masteredAt:0;
        p.nextReviewAt=Number.isFinite(p.nextReviewAt)?p.nextReviewAt:0;
        p.lastReviewAt=Number.isFinite(p.lastReviewAt)?p.lastReviewAt:0;
        // Revisão v2: novos campos por perfil — Elo contínuo (samplesInStage, ver K-factor
        // em 08-speed-engine.js) e peso por padrão interno (patternWeights, seç. 3, nunca
        // exposto em tela). Perfis salvos antes desta versão simplesmente começam neutros.
        p.samplesInStage=Number.isFinite(p.samplesInStage)?p.samplesInStage:0;
        p.patternWeights=(p.patternWeights&&typeof p.patternWeights==='object')?p.patternWeights:{};
        // Peso por dígito/linha (substitui os "fatos fracos" da tabuada): pesos por dígito
        // (2–9 / 11–19) das famílias de multiplicação/divisão de dígitos únicos — mede a
        // dificuldade com o dígito, não com o produto exato. Perfis salvos antes desta versão
        // começam neutros (factWeights antigos ficam inertes no objeto, sem serem lidos).
        p.digitWeights=(p.digitWeights&&typeof p.digitWeights==='object')?p.digitWeights:{};
      });
      if(!Array.isArray(this.data.settings.selectedSkills) || !this.data.settings.selectedSkills.length){
        this.data.settings.selectedSkills = [...DEFAULT_SELECTED_SKILLS];
      }
      this.data.settings.selectedSkills = this.data.settings.selectedSkills.filter(k=>KC_DEFS[k]);
      // Se "todas as contas" estava ativo, garante que famílias novas (adicionadas em
      // atualizações do app) também entrem na seleção, e não fiquem de fora silenciosamente.
      if(this.data.settings.selectAllSkills) this.data.settings.selectedSkills = [...KC_ORDER];
      // BUGFIX/revisão v2: "drillMode" (Foco/Misto) foi removido — o motor de sequência
      // único (interleaving ponderado + retry pós-erro) substitui os dois. Instalações
      // antigas podem ter o campo salvo; ele simplesmente não é mais lido em lugar nenhum.
      delete this.data.settings.drillMode;
      this.data.history = this.data.history || [];
      this.data.bestStreak = this.data.bestStreak || 0;
      this.data.settingsVersion = SETTINGS_VERSION;
      if(oldSettingsVersion < SETTINGS_VERSION) this.save();
    }catch(e){ this.data = this.defaults(); }
    return this.data;
  },
  // Persistência não-bloqueante: gravar no localStorage é síncrono e acontece no caminho
  // de cada resposta (o Engine salva a cada conta fechada). No celular esse write no meio
  // do handler do teclado congela a thread principal por alguns ms — é o "teclado lento".
  // save() agora adia e consolida: chamadas seguidas geram UMA escrita, numa tarefa
  // separada, fora do caminho do toque. Para não perder dados ao fechar/enviar a aba a
  // background logo depois, um flush final acontece em visibilitychange/pagehide.
  save(){
    if(this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(()=>{ this._saveTimer=null; this._persist(); }, 200);
    this._bindFlush();
  },
  _persist(){
    try{ localStorage.setItem(DB_KEY, JSON.stringify(this.data)); }
    catch(e){ console.warn('Falha ao salvar localmente', e); }
  },
  _bindFlush(){
    if(this._flushBound) return;
    this._flushBound = true;
    const flush = ()=>{
      if(this._saveTimer){ clearTimeout(this._saveTimer); this._saveTimer=null; this._persist(); }
    };
    if(typeof document!=='undefined' && document.addEventListener){
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flush(); });
    }
    if(typeof window!=='undefined' && typeof window.addEventListener==='function'){
      window.addEventListener('pagehide', flush);
    }
  },
  reset(){ this.data = this.defaults(); this._persist(); }
};

