/* =====================================================================
   assets/js/09-feedback.js — feedback multissensorial: texto falado do
   exercício (spokenPhrase), Text-to-Speech (TTS), som (Sound) e vibração
   (Haptics).
   Depende de: 04-operations.js, 05-expression-terms.js, 07-storage.js.
   Usado por: 10-session.js.
   ===================================================================== */

/* ---------- 7. TTS / SOM / VIBRAÇÃO (feedback multissensorial) ---------- */
/* Monta a frase falada no idioma da VOZ selecionado (independente do idioma do app) */
const EXPR_WORDS = {
  'pt-BR':{soma:'mais', subtracao:'menos', multiplicacao:'vezes', divisao:'dividido por', open:'abre parênteses', close:'fecha parênteses',
    root:'raiz quadrada de', pow:'elevado a', logof:'log na base', of:'de', over:'sobre', equals:'igual a'},
  'en-US':{soma:'plus', subtracao:'minus', multiplicacao:'times', divisao:'divided by', open:'open parenthesis', close:'close parenthesis',
    root:'square root of', pow:'to the power of', logof:'log base', of:'of', over:'over', equals:'equals'}
};
function speakTerm(term, w){
  if(term.kind==='power') return `${term.base<0?w.subtracao+' '+Math.abs(term.base):term.base} ${w.pow} ${term.exp}`;
  if(term.kind==='radical') return `${w.root} ${term.radicand}`;
  if(term.kind==='log') return `${w.logof} ${term.base_log} ${w.of} ${term.arg_log}`;
  if(term.kind==='fraction') return `${term.num} ${w.over} ${term.den}`;
  return term.value<0 ? `${w.subtracao} ${Math.abs(term.value)}` : `${term.value}`;
}
function speakChain(terms, ops, w){
  let s = speakTerm(terms[0], w);
  for(let i=0;i<ops.length;i++) s += ` ${w[ops[i]]} ${speakTerm(terms[i+1], w)}`;
  return s;
}
function speakEquation(item, w){
  const left = fmtCoefTerm(item.a).replace('−', w.subtracao+' ').replace('x', ' x') + (item.b!==0 ? ` ${item.b>0?w.soma:w.subtracao} ${Math.abs(item.b)}` : '');
  const right = item.c!==0
    ? fmtCoefTerm(item.c).replace('−', w.subtracao+' ').replace('x', ' x') + (item.d!==0 ? ` ${item.d>0?w.soma:w.subtracao} ${Math.abs(item.d)}` : '')
    : `${item.d}`;
  return `${left} ${w.equals} ${right}`;
}
// Lê um decimal como "parte inteira <vírgula/point> parte decimal" em vez de deixar o
// motor de fala tentar adivinhar "12.5" sozinho — evita leituras estranhas/inconsistentes
// entre navegadores. Números inteiros não são afetados.
function spokenNum(n, voiceLang){
  if(Number.isInteger(n)) return String(n);
  const sepWord = voiceLang==='en-US' ? 'point' : 'vírgula';
  const [intPart, decPart] = String(n).split('.');
  return `${intPart} ${sepWord} ${decPart}`;
}
function spokenPhrase(item, voiceLang){
  const a = spokenNum(item.a, voiceLang), b = spokenNum(item.b, voiceLang);
  const w = EXPR_WORDS[voiceLang] || EXPR_WORDS['pt-BR'];
  // Inversão de baixa frequência (Reverse Path, Pilar 3): fala o exprText literal em vez de
  // a/b — senão a voz entregaria o número escondido lendo "a vezes b" na ordem normal.
  if(item.isReversePath && item.exprText){
    const unknownWord = voiceLang==='en-US' ? 'what number' : 'quanto';
    let s = item.exprText
      .split(' × ').join(` ${w.multiplicacao} `)
      .split(' ÷ ').join(` ${w.divisao} `)
      .split(' = ').join(` ${w.equals} `)
      .split('?').join(unknownWord);
    return s;
  }
  // Log standalone: a operação é a questão — "log na base 2 de 32" / "log base 2 of 32".
  if(item.op==='logaritmo') return `${w.logof} ${a} ${w.of} ${b}`;
  if(item.op==='equacao') return speakEquation(item, w);
  if(item.terms && item.ops) return speakChain(item.terms, item.ops, w);
  if(item.op==='expressao'){
    if(item.midOp){
      return `${w.open} ${item.a} ${w[item.leftOp]} ${item.b} ${w.close} ${w[item.midOp]} ${w.open} ${item.c} ${w[item.rightOp]} ${item.d} ${w.close}`;
    }
    return `${w.open} ${item.a} ${w[item.innerOp]} ${item.b} ${w.close} ${w[item.outerOp]} ${item.c}`;
  }
  if(voiceLang==='en-US'){
    if(item.op==='porcentagem') return `${a} percent of ${b}`;
    if(item.op==='divisao') return `${a} divided by ${b}`;
    if(item.op==='multiplicacao') return `${a} times ${b}`;
    if(item.op==='soma') return `${a} plus ${b}`;
    return `${a} minus ${b}`;
  }
  // pt-BR (padrão)
  if(item.op==='porcentagem') return `${a} por cento de ${b}`;
  if(item.op==='divisao') return `${a} dividido por ${b}`;
  if(item.op==='multiplicacao') return `${a} vezes ${b}`;
  if(item.op==='soma') return `${a} mais ${b}`;
  return `${a} menos ${b}`;
}
const TTS = {
  voices: [],
  init(){
    if(!('speechSynthesis' in window)) return;
    const load = ()=>{
      const v = speechSynthesis.getVoices();
      if(v && v.length) this.voices = v;
    };
    load();
    if('onvoiceschanged' in speechSynthesis) speechSynthesis.onvoiceschanged = load;
    // Em alguns navegadores a lista de vozes chega com atraso e sem disparar o evento acima.
    let tries = 0;
    const retry = setInterval(()=>{
      load(); tries++;
      if(this.voices.length || tries>15) clearInterval(retry);
    }, 250);
  },
  speak(text, onEnd){
    if(!('speechSynthesis' in window)){ if(onEnd) onEnd(); return; }
    try{ speechSynthesis.cancel(); }catch(e){}
    // Bug conhecido do Chrome: speak() chamado logo após cancel() é ignorado sem erro.
    // Um pequeno atraso resolve de forma confiável.
    setTimeout(()=>{
      try{
        const u = new SpeechSynthesisUtterance(text);
        u.rate = Store.data.settings.voiceRate;
        u.lang = Store.data.settings.voiceLang;
        const voices = this.voices.length ? this.voices : speechSynthesis.getVoices();
        const langBase = Store.data.settings.voiceLang.split('-')[0];
        const match = voices.find(v=>v.lang===Store.data.settings.voiceLang) ||
                      voices.find(v=>v.lang && v.lang.startsWith(langBase));
        if(match) u.voice = match;
        let done = false;
        const finish = ()=>{ if(done) return; done=true; if(onEnd) onEnd(); };
        u.onend = finish;
        u.onerror = finish;
        // Watchdog: em alguns navegadores/dispositivos o evento onend nunca dispara.
        setTimeout(finish, Math.max(2500, text.length*180));
        speechSynthesis.speak(u);
      }catch(e){ if(onEnd) onEnd(); }
    }, 60);
  },
  supported(){ return 'speechSynthesis' in window; }
};

const Sound = {
  ctx: null,
  ensure(){ if(!this.ctx){ try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return this.ctx; },
  beep(freq, dur, gain=0.18){
    if(!Store.data.settings.sounds) return;
    const ctx = this.ensure(); if(!ctx) return;
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.frequency.value = freq; osc.type='sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime+dur);
  },
  correct(){ this.beep(880, 0.12); },
  // Erro mais suave, mas ainda claramente "erro": tom mais baixo, curto e com volume menor
  // — mantém o feedback de falha sem estourar o ritmo/ouvido no meio da sessão.
  wrong(){ this.beep(250, 0.15, 0.12); }
};

const Haptics = {
  supported(){ return 'vibrate' in navigator; },
  correct(){ if(Store.data.settings.vibration && this.supported()) navigator.vibrate(15); },
  wrong(){ if(Store.data.settings.vibration && this.supported()) navigator.vibrate([50,40,50]); }
};

