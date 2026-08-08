/* =====================================================================
   assets/js/13-ui.js — camada de interface (UI): navegação entre telas,
   renderização de todas as seções (home, config, treino, resumo,
   estatísticas, ajustes) e ligação dos elementos do DOM aos módulos
   acima.
   Depende de: praticamente todos os módulos anteriores.
   Usado por: 14-init.js (UI.init).
   ===================================================================== */

/* ---------- 11. UI ---------- */
const UI = {
  init(){
    applyI18N();
    this.buildSkillChips();
    this.buildDrillModeChips();
    this.buildModeChips();
    this.buildSessionOptions();
    this.buildAppSettings();
    this.buildKeypad();
    this.applyTheme();
    this.bindNav();
    this.bindTraining();
    this.renderHome();
    document.getElementById('btnStartFromHome').onclick = ()=>Session.start();
    document.getElementById('btnToggleTrainingConfig').onclick = ()=>this.showScreen('config');
    document.getElementById('btnBackSettings').onclick = ()=>{ this.showScreen('settings'); this.setTab('settings'); this.buildAppSettings(); };
    document.getElementById('btnPause').onclick = ()=>Session.togglePause();
    document.getElementById('btnExitTraining').onclick = ()=>Session.exit();
    document.getElementById('btnGoHistory').onclick = ()=>{ this.showScreen('stats'); this.renderStats(); this.setTab('stats'); };
    document.getElementById('btnNewSession').onclick = ()=>Session.start();
  },
  toast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), 1800);
  },
  tabScreens:['home','stats','settings'],
  showScreen(name){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-'+name).classList.add('active');
    document.querySelector('.tabbar').style.display = this.tabScreens.includes(name) ? 'flex' : 'none';
  },
  setTab(name){
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===name));
  },
  skillStatus(profile){ return t('status_'+Engine.stage(profile)); },
  bindNav(){
    document.querySelectorAll('.tab').forEach(tab=>{
      tab.onclick = ()=>{
        const target = tab.dataset.tab;
        this.showScreen(target);
        if(target==='home') this.renderHome();
        if(target==='stats') this.renderStats();
        if(target==='settings') this.buildAppSettings();
        this.setTab(target);
      };
    });
  },
  buildSkillChips(){
    const s = Store.data.settings;
    const allRow = document.getElementById('skillSelectAllRow');
    allRow.innerHTML='';
    this.makeSwitchRow(allRow, 'selectAllSkills', t('select_all_skills'), t('select_all_skills_sub'), (checked)=>{
      if(checked){ Store.data.settings.selectedSkills = [...KC_ORDER]; Store.save(); }
      this.buildSkillChips();
    });
    const wrap = document.getElementById('skillChips');
    wrap.className = '';
    wrap.style.flexDirection='column'; wrap.style.gap='2px';
    wrap.innerHTML='';
    // Com "todas as contas" ativo, esconde a lista individual — deixá-la visível e toda
    // marcada só polui a tela sem dar nenhuma opção nova para a pessoa.
    if(s.selectAllSkills){ wrap.style.display='none'; return; }
    wrap.style.display='flex';
    KC_ORDER.forEach(key=>{
      const def=KC_DEFS[key], op=OPS[def.op], profile=Engine.profile(key), stage=Engine.stage(profile);
      const chip = document.createElement('div');
      chip.className='chip'+(Store.data.settings.selectedSkills.includes(key)?' active':'');
      chip.innerHTML = `<span class="box"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></span>
        <span class="sym">${op.symbol}</span>
        <span>${kcLabel(key)}</span><span class="skill-chip-meta ${stage==='mastered'?'ready':''}">${stage==='calibrating'?t('calibration')+' '+profile.calibration.length+'/'+CALIBRATION_ITEMS:this.skillStatus(profile)}</span>`;
      chip.onclick = ()=>{
        const selected=Store.data.settings.selectedSkills;
        if(selected.includes(key) && selected.length===1){ this.toast(t('keep_one_op')); return; }
        Store.data.settings.selectedSkills = selected.includes(key) ? selected.filter(k=>k!==key) : [...selected,key];
        chip.classList.toggle('active');
        Store.save();
      };
      wrap.appendChild(chip);
    });
  },
  buildDrillModeChips(){
    const wrap=document.getElementById('drillModeChips'); wrap.innerHTML='';
    [{k:'foco',l:t('drill_focus_l'),d:t('drill_focus_d'),ic:'🎯'},{k:'misto',l:t('drill_mix_l'),d:t('drill_mix_d'),ic:'↔'}].forEach(m=>{
      const card=document.createElement('div'); card.className='mode-card'+(Store.data.settings.drillMode===m.k?' active':'');
      card.innerHTML=`<div class="ic">${m.ic}</div><div class="l">${m.l}</div><div class="d">${m.d}</div>`;
      card.onclick=()=>{ Store.data.settings.drillMode=m.k; Store.save(); this.buildDrillModeChips(); };
      wrap.appendChild(card);
    });
  },
  buildModeChips(){
    const modes = [
      {k:'sprint', l:t('mode_sprint_l'), d:t('mode_sprint_d'), ic:'⚡'},
      {k:'resistencia', l:t('mode_resistencia_l'), d:t('mode_resistencia_d'), ic:'🏃'},
      {k:'intervalado', l:t('mode_intervalado_l'), d:t('mode_intervalado_d'), ic:'◷'},
      {k:'hiit', l:t('mode_hiit_l'), d:t('mode_hiit_d'), ic:'🔥'}
    ];
    const wrap = document.getElementById('modeChips');
    wrap.className = 'mode-grid';
    wrap.innerHTML='';
    modes.forEach(m=>{
      const card = document.createElement('div');
      card.className='mode-card'+(Store.data.settings.mode===m.k?' active':'');
      card.innerHTML = `<div class="ic">${m.ic}</div><div class="l">${m.l}</div><div class="d">${m.d}</div>`;
      card.onclick = ()=>{
        Store.data.settings.mode = m.k;
        wrap.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('active'));
        card.classList.add('active');
        Store.save();
        this.renderModeParams();
      };
      wrap.appendChild(card);
    });
    this.renderModeParams();
  },
  renderModeParams(){
    const box = document.getElementById('modeParams');
    const s = Store.data.settings;
    box.innerHTML='';
    const numField = (label, key, min, max)=>{
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `<div><div class="label">${label}</div></div>`;
      const inp = document.createElement('input');
      inp.type='number'; inp.min=min; inp.max=max; inp.value=s[key];
      inp.style.width='80px';
      inp.oninput = ()=>{ s[key] = U.clamp(+inp.value||min, min, max); Store.save(); };
      row.appendChild(inp);
      box.appendChild(row);
    };
    if(s.mode==='sprint'){
      numField(t('duration_sec'), 'sprintSeconds', 15, 300);
      const p=document.createElement('p'); p.textContent=t('sprint_desc'); box.appendChild(p);
    }
    else if(s.mode==='intervalado'){
      numField(t('work_s'), 'intWork', 10, 120);
      numField(t('rest_s'), 'intRest', 5, 60);
      numField(t('cycles'), 'intCycles', 1, 12);
    } else if(s.mode==='hiit'){
      const p=document.createElement('p'); p.textContent=t('hiit_desc'); box.appendChild(p);
    } else if(s.mode==='resistencia'){
      const p=document.createElement('p'); p.textContent=t('resistencia_desc'); box.appendChild(p);
    }
  },
  // Helper único de linha "toggle" (switch) — reutilizado por buildSessionOptions() e
  // buildAppSettings(), que antes reimplementavam a mesma função localmente (duplicação).
  makeSwitchRow(box, key, label, sub, onChange){
    const s = Store.data.settings;
    const row = document.createElement('div'); row.className='row';
    row.innerHTML = `<div><div class="label">${label}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
    const lab = document.createElement('label'); lab.className='switch';
    const inp = document.createElement('input'); inp.type='checkbox'; inp.checked=!!s[key];
    inp.onchange = ()=>{ s[key]=inp.checked; Store.save(); if(onChange) onChange(inp.checked); };
    // BUGFIX: usar innerHTML += aqui reserializa e reconstrói o <label> inteiro, o que
    // descarta o próprio <input> já inserido (perdendo o "checked" e o listener onchange
    // presos a ele) e cria um input novo, "morto", no lugar. Por isso o toggle nunca
    // disparava a troca real. Construindo track/thumb como nós separados, o <input>
    // original — com seu estado e handler — permanece intacto no DOM.
    const track = document.createElement('span'); track.className='track';
    const thumb = document.createElement('span'); thumb.className='thumb';
    track.appendChild(thumb);
    lab.appendChild(inp);
    lab.appendChild(track);
    row.appendChild(lab);
    box.appendChild(row);
  },
  buildSessionOptions(){
    const box = document.getElementById('sessionOptionsList');
    const s = Store.data.settings;
    box.innerHTML='';
    const addSwitch = (label, sub, key, onChange)=>this.makeSwitchRow(box, key, label, sub, onChange);
    addSwitch(t('tts_label'), TTS.supported()?t('tts_sub'):t('tts_unsupported'), 'tts');
    if(TTS.supported()){
      const testRow = document.createElement('div'); testRow.className='row';
      testRow.innerHTML = `<div><div class="label">${t('test_voice')}</div><div class="sub">${t('test_voice_sub')}</div></div>`;
      const testBtn = document.createElement('button'); testBtn.className='pill-btn'; testBtn.textContent=t('listen');
      testBtn.onclick = ()=>{
        testBtn.textContent = '…'; testBtn.disabled = true;
        TTS.speak(spokenPhrase({op:'multiplicacao', a:7, b:8}, s.voiceLang), ()=>{ testBtn.textContent=t('listen'); testBtn.disabled=false; });
      };
      testRow.appendChild(testBtn);
      box.appendChild(testRow);
    }
    addSwitch(t('hide_during_tts'), t('hide_during_tts_sub'), 'hideDuringTts');
    addSwitch(t('vibration'), Haptics.supported()?t('vibration_sub'):t('vibration_unsupported'), 'vibration');
    addSwitch(t('sounds'), t('sounds_sub'), 'sounds');
    addSwitch(t('confirm_before_accept'), t('confirm_before_accept_sub'), 'confirmBeforeAccept');
    addSwitch(t('stop_clock'), t('stop_clock_sub'), 'stopClockOnFirstKey');
  },
  buildAppSettings(){
    const root = document.getElementById('appSettingsList');
    const s = Store.data.settings;
    root.innerHTML='';
    let box; // corpo (card) da seção atual
    const section = (title)=>{
      const titleEl = document.createElement('div'); titleEl.className='settings-section-title'; titleEl.textContent = title;
      const card = document.createElement('div'); card.className='card'; card.style.padding='0 18px';
      root.appendChild(titleEl); root.appendChild(card);
      box = card;
    };
    const addSwitch = (label, sub, key, onChange)=>this.makeSwitchRow(box, key, label, sub, onChange);
    const addRange = (label, sub, key, min, max, step, fmt)=>{
      const row = document.createElement('div'); row.className='row'; row.style.flexDirection='column'; row.style.alignItems='stretch';
      const top = document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between'; top.style.marginBottom='8px';
      top.innerHTML = `<div><div class="label">${label}</div>${sub?`<div class="sub">${sub}</div>`:''}</div><div class="sub" id="val_${key}" style="color:var(--accent); font-weight:700; font-family:var(--font-num);">${fmt(s[key])}</div>`;
      const inp = document.createElement('input'); inp.type='range'; inp.min=min; inp.max=max; inp.step=step; inp.value=s[key];
      inp.oninput = ()=>{ s[key]=+inp.value; document.getElementById('val_'+key).textContent = fmt(s[key]); Store.save(); };
      row.appendChild(top); row.appendChild(inp);
      box.appendChild(row);
    };
    const addSelect = (label, key, options, onChange)=>{
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `<div class="label">${label}</div>`;
      const sel = document.createElement('select');
      options.forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.l; if(String(s[key])===String(o.v)) opt.selected=true; sel.appendChild(opt); });
      sel.onchange = ()=>{ s[key]=sel.value; Store.save(); if(onChange) onChange(sel.value); };
      row.appendChild(sel);
      box.appendChild(row);
    };
    const addSeg = (label, key, options, onChange)=>{
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `<div class="label">${label}</div>`;
      const seg = document.createElement('div'); seg.className='seg';
      options.forEach(o=>{
        const b = document.createElement('button');
        b.textContent = o.l; b.className = String(s[key])===String(o.v) ? 'active' : '';
        b.onclick = ()=>{ s[key]=o.v; Store.save(); if(onChange) onChange(o.v);
          seg.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); };
        seg.appendChild(b);
      });
      row.appendChild(seg);
      box.appendChild(row);
    };

    section(t('section_appearance'));
    addSeg(t('app_language'), 'appLang', [
      {v:'pt', l:'PT'}, {v:'en', l:'EN'}
    ], ()=>{
      // Idioma do app (textos da interface) — independente do idioma da VOZ (TTS).
      applyI18N();
      this.buildSkillChips(); this.buildDrillModeChips(); this.buildModeChips(); this.buildSessionOptions(); this.buildAppSettings();
      this.renderHome(); this.renderStats();
    });
    addSelect(t('theme'), 'theme', [
      {v:'dark', l:t('theme_dark')}, {v:'light', l:t('theme_light')}, {v:'auto', l:t('theme_auto')}
    ], ()=>this.applyTheme());
    addSeg(t('font_size'), 'fontScale', [
      {v:'0.9', l:'P'}, {v:'1', l:'M'}, {v:'1.15', l:'G'}
    ], v=>{ document.documentElement.style.setProperty('--font-scale', v); });

    section(t('section_audio'));
    addSwitch(t('vibration'), Haptics.supported()?t('vibration_sub'):t('vibration_unsupported'), 'vibration');
    addSwitch(t('sounds'), t('sounds_sub'), 'sounds');
    addRange(t('voice_speed'), t('voice_speed_sub'), 'voiceRate', 0.5, 2.0, 0.1, v=>v.toFixed(1)+'x');
    addSelect(t('voice_lang'), 'voiceLang', [
      {v:'pt-BR', l:'Português (BR)'}, {v:'en-US', l:'English (US)'}
    ]);

    section(t('section_training'));
    addRange(t('answer_timeout'), t('answer_timeout_sub'), 'answerTimeoutSeconds', 3, 60, 1, v=>v+' s');
    addRange(t('gap_time'), t('gap_time_sub'), 'gapMs', 100, 1200, 50, v=>v+' ms');
    addRange(t('correct_show'), t('correct_show_sub'), 'correctAnswerShowMs', 500, 2000, 50, v=>v+' ms');

    section(t('section_data'));
    const rowExp = document.createElement('div'); rowExp.className='row';
    rowExp.innerHTML = `<div><div class="label">${t('export_data')}</div><div class="sub">${t('export_data_sub')}</div></div>`;
    const btnGroup = document.createElement('div'); btnGroup.style.display='flex'; btnGroup.style.gap='6px';
    const bCsv = document.createElement('button'); bCsv.className='pill-btn'; bCsv.textContent='CSV ↓'; bCsv.onclick = ()=>Export.csv();
    const bJson = document.createElement('button'); bJson.className='pill-btn'; bJson.textContent='JSON ↓'; bJson.onclick = ()=>Export.json();
    btnGroup.appendChild(bCsv); btnGroup.appendChild(bJson);
    rowExp.appendChild(btnGroup);
    box.appendChild(rowExp);
    const rowReset = document.createElement('div'); rowReset.style.padding='14px 0';
    const bReset = document.createElement('button'); bReset.className='btn btn-danger'; bReset.textContent=t('erase_all');
    bReset.onclick = ()=>{
      if(confirm(t('confirm_reset'))){
        Store.reset(); this.toast(t('data_erased')); this.renderHome(); this.renderStats();
      }
    };
    rowReset.appendChild(bReset);
    box.appendChild(rowReset);

    s.fontScale = +s.fontScale;
    document.documentElement.style.setProperty('--font-scale', s.fontScale);
  },
  applyTheme(){
    const s = Store.data.settings;
    let theme = s.theme;
    if(theme==='auto'){
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name=theme-color]').setAttribute('content', theme==='dark' ? '#0F172A' : '#F4F6FB');
  },
  buildKeypad(){
    const grid = document.getElementById('keypad');
    grid.innerHTML='';
    const keys = ['1','2','3','4','5','6','7','8','9','±','0','←'];
    keys.forEach(k=>{
      const btn = document.createElement('button');
      btn.className='key'+(k==='←'||k==='±' ? ' func':'');
      btn.textContent = k;
      btn.onclick = ()=>{
        if(k==='←') Session.submitDigit('back');
        else if(k==='±') Session.submitDigit('sign');
        else Session.submitDigit(k);
      };
      grid.appendChild(btn);
    });
    const okBtn = document.createElement('button');
    okBtn.className='key func wide3'; okBtn.dataset.ok='1'; okBtn.textContent='✓';
    okBtn.onclick = ()=>Session.evaluate(false);
    grid.appendChild(okBtn);
  },
  bindTraining(){
    document.addEventListener('keydown', (e)=>{
      if(!Session.active || document.getElementById('screen-training').classList.contains('active')===false) return;
      if(/^[0-9]$/.test(e.key)) Session.submitDigit(e.key);
      else if(e.key==='Backspace') Session.submitDigit('back');
      else if(e.key==='-') Session.submitDigit('sign');
      else if(e.key==='Enter') Session.evaluate(false);
    });
  },
  mathSpan(text, className=''){
    const node = document.createElement('span');
    if(className) node.className = className;
    node.textContent = text;
    return node;
  },
  mathOperator(op){
    const symbols = {soma:'+', subtracao:'−', multiplicacao:'×', divisao:'÷'};
    return this.mathSpan(symbols[op] || OPS[op]?.symbol || op, 'math-operator');
  },
  mathFraction(numerator, denominator){
    const fraction = document.createElement('span');
    fraction.className = 'math-fraction';
    const top = document.createElement('span');
    const bottom = document.createElement('span');
    top.append(numerator);
    bottom.append(denominator);
    fraction.append(top, bottom);
    return fraction;
  },
  mathTerm(term){
    if(term.kind==='fraction') return this.mathFraction(this.mathSpan(String(term.num)), this.mathSpan(String(term.den)));
    if(term.kind==='radical'){
      const root = document.createElement('span');
      root.className = 'math-radical';
      root.append(this.mathSpan('√', 'radical-sign'), this.mathSpan(String(term.radicand), 'radicand'));
      return root;
    }
    if(term.kind==='power'){
      const power = document.createElement('span');
      power.className = 'math-power';
      const base = term.base<0 ? `(−${Math.abs(term.base)})` : String(term.base);
      const exponent = document.createElement('sup');
      exponent.textContent = String(term.exp);
      power.append(this.mathSpan(base), exponent);
      return power;
    }
    if(term.kind==='log'){
      const log = document.createElement('span');
      log.className = 'math-log';
      const base = document.createElement('sub');
      base.textContent = String(term.base_log);
      log.append(this.mathSpan('log'), base, this.mathSpan(`(${term.arg_log})`));
      return log;
    }
    return this.mathSpan(term.value<0 ? `(−${Math.abs(term.value)})` : String(term.value));
  },
  linearEquationPart(coef, constant){
    const fragment = document.createDocumentFragment();
    if(coef!==0){
      if(coef===-1) fragment.append(this.mathSpan('−x'));
      else if(coef===1) fragment.append(this.mathSpan('x'));
      else fragment.append(this.mathSpan(`${coef}x`));
      if(constant!==0){
        fragment.append(this.mathSpan(constant>0 ? ' + ' : ' − '), this.mathSpan(String(Math.abs(constant))));
      }
    } else {
      fragment.append(this.mathSpan(String(constant)));
    }
    return fragment;
  },
  renderMathQuestion(item, eqEl){
    eqEl.replaceChildren();
    if(item.isEquation){
      const prompt = this.mathSpan('x = ?', 'math-equation-prompt');
      const line = document.createElement('div');
      line.className = 'math-equation-line';
      line.append(this.linearEquationPart(item.a, item.b), this.mathSpan(' = ', 'math-operator'), this.linearEquationPart(item.c, item.d));
      eqEl.append(prompt, line);
      return;
    }

    const row = document.createElement('div');
    row.className = 'math-row';
    if(item.terms && item.ops){
      const isFractionDivision = item.ops.length===1 && item.ops[0]==='divisao' && item.terms.every(term=>term.kind==='fraction');
      if(isFractionDivision){
        const complex = document.createElement('span');
        complex.className = 'math-complex-fraction';
        const top = document.createElement('span');
        const bottom = document.createElement('span');
        top.append(this.mathTerm(item.terms[0]));
        bottom.append(this.mathTerm(item.terms[1]));
        complex.append(top, bottom);
        row.append(complex);
      } else {
        row.append(this.mathTerm(item.terms[0]));
        item.ops.forEach((op, index)=>row.append(this.mathOperator(op), this.mathTerm(item.terms[index+1])));
      }
    } else {
      const text = item.exprText ? item.exprText
        : item.op==='porcentagem' ? `${item.a}% de ${item.b}`
        : `${item.a} ${item.symbol} ${item.b}`;
      row.textContent = text;
    }
    eqEl.append(row);
  },
  renderQuestion(item, onReady){
    const eqEl = document.getElementById('equationText');
    this.renderMathQuestion(item, eqEl);
    this.updateAnswerDisplay('');
    document.getElementById('feedbackAnswer').textContent='';
    const s = Store.data.settings;
    if(s.tts && TTS.supported()){
      const spoken = spokenPhrase(item, s.voiceLang);
      if(s.hideDuringTts) eqEl.classList.add('hidden-eq');
      // BUGFIX: o cronômetro de resposta só deve começar depois que a voz terminar
      // de ler a pergunta — por isso repassamos onReady só para o callback de término.
      TTS.speak(spoken, ()=>{ eqEl.classList.remove('hidden-eq'); if(onReady) onReady(); });
    } else {
      eqEl.classList.remove('hidden-eq');
      if(onReady) onReady();
    }
  },
  updateAnswerDisplay(val){
    const el = document.getElementById('answerDisplay');
    el.textContent = val.length ? val : '\u00A0';
    el.classList.remove('correct','wrong');
  },
  flashAnswer(correct){
    const el = document.getElementById('answerDisplay');
    el.classList.add(correct?'correct':'wrong');
  },
  clearAnswerFeedback(){
    document.getElementById('answerDisplay').classList.remove('correct','wrong');
    document.getElementById('feedbackAnswer').textContent='';
  },
  showCorrectAnswer(answer){
    document.getElementById('feedbackAnswer').textContent = t('answer_label')+': '+answer;
  },
  pulseHistory:[],
  pushPulse(cls){
    this.pulseHistory.push(cls); if(this.pulseHistory.length>16) this.pulseHistory.shift();
    const strip = document.getElementById('pulseStrip');
    strip.innerHTML='';
    this.pulseHistory.forEach(c=>{
      const bar = document.createElement('div');
      bar.className = 'pulse-bar '+c;
      const heights = {target:34, slow:15, err:8};
      bar.style.height = heights[c]+'px';
      strip.appendChild(bar);
    });
  },
  updateHud(){},
  updateRing(session){
    const circle = document.getElementById('ringFg');
    const label = document.getElementById('ringLabel');
    const C = 138;
    if(session.endsAt==null){
      circle.style.strokeDashoffset = 0;
      label.textContent = '∞';
      return;
    }
    const remaining = Math.max(0, session.endsAt - U.now());
    label.textContent = Math.ceil(remaining/1000);
    let total;
    if(session.mode==='sprint') total = Store.data.settings.sprintSeconds*1000;
    else if(session.mode==='intervalado') total = (session.phase==='work'?Store.data.settings.intWork:Store.data.settings.intRest)*1000;
    else if(session.mode==='hiit') total = (session.phase==='work'?40:20)*1000;
    else total = 1;
    const frac = U.clamp(remaining/total, 0, 1);
    circle.style.strokeDashoffset = C*(1-frac);
  },

  renderSummary(sum){
    document.getElementById('sumAvg').textContent = U.fmtSec(sum.median);
    document.getElementById('sumAcc').textContent = U.fmtPct(sum.accuracy);
    document.getElementById('sumCog').textContent = U.fmtSec(sum.cogAvg);
    document.getElementById('sumMotor').textContent = U.fmtSec(sum.motorAvg);
    const fluencyEl = document.getElementById('sumFluency');
    if(fluencyEl) fluencyEl.textContent = U.fmtPct(sum.targetRate);
    document.getElementById('sumEvolution').textContent = sum.evolution
      ? tf('summary_evolution_line', {op:kcLabel(sum.evolution.key), prev:U.fmtSec(sum.evolution.prevAvg), cur:U.fmtSec(sum.evolution.newAvg)})
      : t('no_evolution');
    document.getElementById('sumBottleneck').textContent = sum.bottleneck
      ? `${sum.bottleneck.label} — ${U.fmtSec(sum.bottleneck.median)} ${t('median').toLowerCase()} · ${U.fmtPct(sum.bottleneck.targetRate)} ${t('target_rate').toLowerCase()}.`
      : '—';
  },

  renderHome(){
    const hist = Store.data.history;
    const dayMs = 24*3600*1000;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const today = hist.filter(h=>h.date>=todayStart.getTime());
    const source = today.length ? today : (hist.length ? [hist[hist.length-1]] : []);
    const reactionEl = document.getElementById('homeReaction');
    const reactionSub = document.getElementById('homeReactionSub');
    const accEl = document.getElementById('homeAccuracy');
    const accSub = document.getElementById('homeAccuracySub');
    if(source.length){
      const avgTime = U.mean(source.map(h=>h.avgTime));
      const avgAcc = U.mean(source.map(h=>h.accuracy));
      reactionEl.textContent = U.fmtSec(avgTime);
      accEl.textContent = U.fmtPct(avgAcc);
      reactionSub.textContent = today.length ? t('today') : t('last_session');
      accSub.textContent = today.length ? t('today') : t('last_session');
    } else {
      reactionEl.textContent = '—'; accEl.textContent = '—';
      reactionSub.textContent = t('no_data_yet'); accSub.textContent = t('no_data_yet');
    }
    document.getElementById('homeTotal').textContent = hist.reduce((a,h)=>a+h.total,0);
    document.getElementById('homeSessions').textContent = hist.length;
    document.getElementById('homeStreak').textContent = Store.data.bestStreak||0;
  },
  renderStats(){
    const hist = Store.data.history;
    this.drawChart('chartAvg', hist.map(h=>h.avgTime), true);
    this.drawChart('chartAcc', hist.map(h=>h.accuracy*100), false);
    const mp = Analytics.overallMedianP90();
    document.getElementById('histMedian').textContent = U.fmtSec(mp.median);
    document.getElementById('histP90').textContent = U.fmtSec(mp.p90);
    document.getElementById('histStreak').textContent = Store.data.bestStreak||0;
    document.getElementById('histSessions').textContent = hist.length;
    const flEl = document.getElementById('histFluency');
    if(flEl) flEl.textContent = hist.length ? U.fmtPct(U.mean(hist.map(h=>h.targetRate||0))) : '—';

    const last30 = hist.filter(h=>h.date >= Date.now()-30*24*3600*1000);
    const accSource = last30.length ? last30 : hist;
    document.getElementById('statAccAvg').textContent = accSource.length ? U.fmtPct(U.mean(accSource.map(h=>h.accuracy))) : '—';
    document.getElementById('statAccAvgSub').textContent = last30.length ? t('last_30_days') : (hist.length ? t('overall') : t('no_data'));
    document.getElementById('statTimeAvg').textContent = hist.length ? U.fmtSec(U.mean(hist.map(h=>h.avgTime))) : '—';
  },
  drawChart(id, values, isTime){
    const svg = document.getElementById(id);
    const w=300, h=110, pad=8;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML='';
    if(values.length<2){
      svg.innerHTML = `<text x="${w/2}" y="${h/2}" fill="var(--muted)" font-size="12" text-anchor="middle">${Store.data.settings.appLang==='en'?'Not enough data':'Dados insuficientes'}</text>`;
      return;
    }
    const max = Math.max(...values), min = Math.min(...values);
    const range = (max-min)||1;
    const pts = values.map((v,i)=>{
      const x = pad + (i/(values.length-1))*(w-2*pad);
      const y = h-pad - ((v-min)/range)*(h-2*pad);
      return [x,y];
    });
    const path = pts.map((p,i)=>(i===0?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
    const ns = 'http://www.w3.org/2000/svg';
    const pathEl = document.createElementNS(ns,'path');
    pathEl.setAttribute('d', path);
    pathEl.setAttribute('fill','none');
    pathEl.setAttribute('stroke', 'var(--accent)');
    pathEl.setAttribute('stroke-width','2.5');
    pathEl.setAttribute('stroke-linecap','round');
    pathEl.setAttribute('stroke-linejoin','round');
    svg.appendChild(pathEl);
    pts.forEach(p=>{
      const c = document.createElementNS(ns,'circle');
      c.setAttribute('cx',p[0]); c.setAttribute('cy',p[1]); c.setAttribute('r',2.8);
      c.setAttribute('fill','var(--accent)');
      svg.appendChild(c);
    });
  }
};

