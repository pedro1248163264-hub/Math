/* =====================================================================
   CÁLCULO RÁPIDO — motor completo (100% local, sem dependências externas)
   Motor de progressão v2 — baseado em "Algoritmo de Progressão e
   Adaptação — Modo Rapidez" (KCs/famílias, Elo contínuo, esquecimento
   por meia-vida, histerese, interleaving, critérios de domínio).
   ===================================================================== */

/* ---------- 1. UTILITÁRIOS ---------- */
const U = {
  rint(min, max){ return Math.floor(Math.random()*(max-min+1))+min; },
  choice(arr){ return arr[Math.floor(Math.random()*arr.length)]; },
  now(){ return performance.now(); },
  clamp(v,a,b){ return Math.max(a, Math.min(b, v)); },
  percentile(arr, p){
    if(!arr.length) return null;
    const s = [...arr].sort((a,b)=>a-b);
    const idx = U.clamp(Math.floor((p/100)*s.length), 0, s.length-1);
    return s[idx];
  },
  median(arr){ return U.percentile(arr, 50); },
  mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; },
  fmtSec(ms){ if(ms==null||isNaN(ms)) return '-'; return (ms/1000).toFixed(2)+'s'; },
  fmtPct(v){ if(v==null||isNaN(v)) return '-'; return Math.round(v*100)+'%'; },
  uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); },
};

/* ---------- 2. CONSTANTES DO MOTOR ---------- */
const ONE_HOUR = 3600*1000;
const ONE_DAY = 24*ONE_HOUR;
const REVIEW_TARGET = 0.87;        // p(recall) alvo para reintroduzir KC dominado (seç. 7)
const SWEET_OFFSET = 300;          // desloca elo do item p/ mirar ~85% de acerto esperado (seç. 0/4)
const IMPULSE_FLOOR = 350;         // ms — abaixo disso, erro é tratado como lapso, não erro genuíno (seç. 9)
const POOL_TARGET = 4;             // tamanho alvo do pool ativo de KCs (seç. 1: "3 a 6")
const MIN_RETENTION_GAP = 5*ONE_HOUR; // intervalo mínimo p/ uma prática contar como reteste de retenção (seç. 6.4)
const ACQ_MIN_ITEMS = 10, ACQ_MAX_ITEMS = 15, ACQ_TARGET_ACC = 0.70; // bloco de aquisição (seç. 3)
const MASTERY_MIN_ITEMS = 12;
const MASTERY_MIN_ACC = 0.90;
const MASTERY_MIN_TARGET_RATE = 0.75;
const RETENTION_REVIEW_ITEMS = 3;
const RETENTION_INTERVALS = [ONE_DAY, 3*ONE_DAY, 7*ONE_DAY, 14*ONE_DAY, 30*ONE_DAY];

/* ---------- 2b. IDIOMA DO APP (PT/EN) — apresentação apenas, lógica intacta ---------- */
const I18N = {
  pt:{
    home_tagline:'Treine mais rápido. Pense mais afiado. Todos os dias.',
    home_today:'Desempenho de hoje', home_reaction:'Tempo de reação', home_accuracy:'Precisão',
    start_training:'Iniciar treino →', exercises:'Exercícios', sessions:'Sessões', best_streak:'Melhor sequência',
    config_title:'Configurar sessão', configure_training:'Configurar treino', operations:'Operações', training_mode:'Formato da sessão', options:'Opções',
    speed_skills:'Habilidades em foco', speed_skills_sub:'Escolha uma ou mais famílias. Todas já estão disponíveis.', speed_mode:'Estilo do treino',
    select_all_skills:'Treinar todas as contas', select_all_skills_sub:'Inclui automaticamente todas as famílias disponíveis',
    drill_focus_l:'Foco', drill_focus_d:'Repita a habilidade escolhida', drill_mix_l:'Misto', drill_mix_d:'Alterne e ataque o gargalo',
    calibration:'Calibração', target:'meta', target_rate:'Dentro da meta', median_cognitive:'Tempo mediano', by_skill:'Por habilidade',
    status_calibrating:'calibrando', status_acquisition:'aquisição', status_consolidating:'consolidando', status_mastered:'domínio confirmado', status_review_due:'revisão pendente',
    accuracy:'precisão', average:'média', items:'contas',
    rest:'Descanso', rest_msg:'Respire. O próximo bloco começa em instantes.',
    summary_title:'Resumo da sessão', avg_time:'Tempo médio', accuracy_cap:'Precisão', cognitive_time:'Tempo cognitivo',
    motor_time:'Tempo motor', fluency_index:'Índice de fluência', biggest_gain:'Maior evolução',
    main_bottleneck:'Principal gargalo', skills_in_focus:'Habilidades em foco', view_history:'Ver histórico', new_training:'Novo treino',
    stats_title:'Estatísticas', avg_accuracy:'Precisão média', avg_time_item:'Tempo médio / conta', all_operations:'todas as operações',
    evolution_time:'Evolução — tempo médio', evolution_acc:'Evolução — precisão', median:'Mediana', p90:'Percentil 90',
    by_operation:'Por operação', insights_title:'Insights', skill_map:'Mapa de habilidades',
    skill_map_desc:'Cada habilidade (família de cálculo) é rastreada e progride de forma independente — nunca uma conta específica.',
    settings_title:'Ajustes', tab_home:'Início', tab_stats:'Estatísticas', tab_insights:'Insights', tab_settings:'Ajustes',
    no_data_today:'sem dados hoje', today:'hoje', last_session:'última sessão', no_data_yet:'sem dados ainda',
    last_30_days:'últimos 30 dias', overall:'geral', no_data:'sem dados',
    no_op_data:'Ainda sem dados suficientes por habilidade.', avg_short:'médio', acc_short:'precisão',
    no_kc_yet:'Nenhuma habilidade introduzida ainda. Comece um treino!', no_sessions_yet:'Nenhuma sessão registrada ainda.',
    mode_label:'modo', fluency_short:'fluência',
    keep_one_op:'Mantenha ao menos uma operação ativa.', data_erased:'Dados apagados.', no_op_selected:'Nenhuma operação ativa selecionada.', answer_required:'Digite uma resposta antes de confirmar.',
    confirm_reset:'Isso vai apagar todo o histórico e progresso salvos neste dispositivo. Confirmar?',
    confirm_exit_training:'Sair do treino agora? O progresso desta sessão será salvo até aqui.', exit_training:'Sair do treino',
    configure_first:'Configure e inicie um treino primeiro.',
    section_appearance:'Aparência', section_audio:'Áudio e feedback', section_training:'Treino', section_data:'Dados',
    app_language:'Idioma do app', theme:'Tema', theme_dark:'Escuro', theme_light:'Claro', theme_auto:'Automático',
    font_size:'Tamanho da fonte', tts_label:'Modo auditivo (Text-to-Speech)', tts_sub:'Lê a conta em voz alta', tts_unsupported:'Não suportado neste navegador',
    test_voice:'Testar voz', test_voice_sub:'Ouça um exemplo com as configurações atuais', listen:'▶ Ouvir',
    hide_during_tts:'Ocultar conta durante ditado', hide_during_tts_sub:'Esconde os números enquanto a voz lê',
    vibration:'Vibração', vibration_sub:'Feedback tátil a cada resposta', vibration_unsupported:'Não suportado neste dispositivo',
    sounds:'Sons', sounds_sub:'Feedback sonoro a cada resposta',
    stop_clock:'Parar cronômetro ao digitar', stop_clock_sub:'Conta só o tempo de raciocínio — não o tempo gasto digitando a resposta',
    confirm_before_accept:'Confirmar resposta antes de aceitar', confirm_before_accept_sub:'Ligado: você sempre toca em ✓ (ou Enter) para confirmar. Desligado: a resposta é aceita automaticamente assim que os dígitos são digitados.',
    voice_speed:'Velocidade da voz', voice_speed_sub:'Taxa da leitura por Text-to-Speech', voice_lang:'Idioma da voz',
    answer_timeout:'Tempo limite para responder', answer_timeout_sub:'Sem digitar nada até o prazo, a conta é considerada incorreta',
    gap_time:'Tempo entre contas', gap_time_sub:'Pausa após cada resposta',
    correct_show:'Exibição da resposta correta', correct_show_sub:'Quanto tempo mostrar o acerto',
    export_data:'Exportar dados', export_data_sub:'Baixe todas as sessões salvas', erase_all:'Apagar todos os dados',
    op_soma:'Soma', op_subtracao:'Subtração', op_multiplicacao:'Multiplicação', op_divisao:'Divisão', op_porcentagem:'Porcentagem', op_expressao:'Expressão (parênteses)',
    op_expressao_encadeada:'Encadeada (sem parênteses)', op_fracao:'Frações', op_potencia:'Potência', op_radical:'Radical (raiz quadrada)', op_logaritmo:'Logaritmo', op_equacao:'Equação (resolver x)',
    mode_sprint_l:'Rapidez', mode_sprint_d:'Velocidade máxima',
    mode_resistencia_l:'Resistência', mode_resistencia_d:'Sessão contínua',
    mode_intervalado_l:'Intervalado', mode_intervalado_d:'Trabalho + descanso',
    mode_hiit_l:'HIIT Cognitivo', mode_hiit_d:'Alta intensidade · 10min',
    kc_aquisicao:'Aquisição', kc_consolidacao:'Consolidação', kc_dominado:'Dominado',
    duration_sec:'Duração (segundos)', work_s:'Trabalho (s)', rest_s:'Descanso (s)', cycles:'Ciclos',
    sprint_desc:'Modo Rapidez: o motor ajusta continuamente a dificuldade de cada habilidade para manter você perto do seu ponto ótimo de aprendizagem.',
    hiit_desc:'10 minutos fixos: 10 blocos de 40s de treino + 20s de descanso.',
    resistencia_desc:'Sessão contínua — toque em pausa/encerrar quando quiser parar.',
    no_evolution:'Ainda não há histórico suficiente para comparar.',
    summary_evolution_line:'{op}: de {prev} para {cur} em média.',
    summary_bottleneck_line:'{op} — tempo médio {avg}, precisão {acc}.',
    no_skills_session:'Nenhuma habilidade de destaque nesta sessão.',
    rating:'rating', block:'bloco', awaiting_retest:'aguardando reteste de retenção', recent_acc:'precisão recente',
    est_retention:'retenção estimada', answer_label:'Resposta',
    tag_mastery:'Domínio', tag_focus:'Foco', tag_review:'Revisão', tag_pending:'Aguardando', tag_new_skill:'Nova habilidade',
    tag_evolution:'Evolução', tag_insight:'Insight',
    tag_new_item:'Novo', tag_review_item:'Revisão', tag_reinforce_item:'Reforço',
    no_insights_yet:'Continue treinando para desbloquear insights personalizados sobre seu desempenho.',
    insight_mastered:'Você já domina {n} habilidade(s): {list}.',
    insight_consolidating:'Foco atual em consolidação: "{label}" (precisão recente de {acc}).',
    insight_acquiring:'Habilidade nova sendo introduzida agora: "{label}".',
    insight_forgetting_window:'{n} habilidade(s) dominada(s) estão entrando na janela de revisão por esquecimento natural.',
    insight_retention_test:'"{label}" atingiu os critérios de desempenho e aguarda um reteste após um intervalo para confirmar domínio real.',
    insight_weekly_improvement:'{op} apresentou a maior evolução na última semana ({delta} mais rápido em média).',
    date_locale:'pt-BR'
  },
  en:{
    home_tagline:'Train faster. Think sharper. Every day.',
    home_today:"Today's performance", home_reaction:'Reaction time', home_accuracy:'Accuracy',
    start_training:'Start training →', exercises:'Exercises', sessions:'Sessions', best_streak:'Best streak',
    config_title:'Session setup', configure_training:'Configure training', operations:'Operations', training_mode:'Session format', options:'Options',
    speed_skills:'Skills in focus', speed_skills_sub:'Choose one or more families. Every family is already available.', speed_mode:'Training style',
    select_all_skills:'Train all skills', select_all_skills_sub:'Automatically includes every available family',
    drill_focus_l:'Focus', drill_focus_d:'Repeat the selected skill', drill_mix_l:'Mixed', drill_mix_d:'Alternate and attack the bottleneck',
    calibration:'Calibration', target:'target', target_rate:'On target', median_cognitive:'Median time', by_skill:'By skill',
    status_calibrating:'calibrating', status_acquisition:'acquisition', status_consolidating:'consolidating', status_mastered:'mastery confirmed', status_review_due:'review due',
    accuracy:'accuracy', average:'average', items:'items',
    rest:'Break', rest_msg:'Breathe. The next block starts shortly.',
    summary_title:'Session summary', avg_time:'Average time', accuracy_cap:'Accuracy', cognitive_time:'Cognitive time',
    motor_time:'Motor time', fluency_index:'Fluency index', biggest_gain:'Biggest gain',
    main_bottleneck:'Main bottleneck', skills_in_focus:'Skills in focus', view_history:'View history', new_training:'New session',
    stats_title:'Statistics', avg_accuracy:'Avg. accuracy', avg_time_item:'Avg. time / item', all_operations:'all operations',
    evolution_time:'Evolution — average time', evolution_acc:'Evolution — accuracy', median:'Median', p90:'90th percentile',
    by_operation:'By operation', insights_title:'Insights', skill_map:'Skill map',
    skill_map_desc:'Each skill (calculation family) is tracked and progresses independently — never a specific pair of numbers.',
    settings_title:'Settings', tab_home:'Home', tab_stats:'Stats', tab_insights:'Insights', tab_settings:'Settings',
    no_data_today:'no data today', today:'today', last_session:'last session', no_data_yet:'no data yet',
    last_30_days:'last 30 days', overall:'overall', no_data:'no data',
    no_op_data:'Not enough data per skill yet.', avg_short:'avg', acc_short:'accuracy',
    no_kc_yet:'No skills introduced yet. Start a training session!', no_sessions_yet:'No sessions recorded yet.',
    mode_label:'mode', fluency_short:'fluency',
    keep_one_op:'Keep at least one operation active.', data_erased:'Data erased.', no_op_selected:'No active operation selected.', answer_required:'Enter an answer before confirming.',
    confirm_reset:'This will erase all history and progress saved on this device. Confirm?',
    confirm_exit_training:'Exit this training now? Progress up to this point will be saved.', exit_training:'Exit training',
    configure_first:'Set up and start a training session first.',
    section_appearance:'Appearance', section_audio:'Audio & feedback', section_training:'Training', section_data:'Data',
    app_language:'App language', theme:'Theme', theme_dark:'Dark', theme_light:'Light', theme_auto:'Automatic',
    font_size:'Font size', tts_label:'Voice mode (Text-to-Speech)', tts_sub:'Reads the problem out loud', tts_unsupported:'Not supported in this browser',
    test_voice:'Test voice', test_voice_sub:'Hear a sample with the current settings', listen:'▶ Listen',
    hide_during_tts:'Hide problem while speaking', hide_during_tts_sub:'Hides the numbers while the voice reads them',
    vibration:'Vibration', vibration_sub:'Haptic feedback on every answer', vibration_unsupported:'Not supported on this device',
    sounds:'Sounds', sounds_sub:'Sound feedback on every answer',
    stop_clock:'Stop clock when typing starts', stop_clock_sub:"Counts only thinking time — not the time spent typing the answer",
    confirm_before_accept:'Confirm answer before accepting', confirm_before_accept_sub:'On: you always tap ✓ (or Enter) to confirm. Off: the answer is accepted automatically as soon as the digits are typed.',
    voice_speed:'Voice speed', voice_speed_sub:'Text-to-Speech reading rate', voice_lang:'Voice language',
    answer_timeout:'Answer time limit', answer_timeout_sub:'If no answer is started before this limit, the problem is marked incorrect',
    gap_time:'Time between problems', gap_time_sub:'Pause after each answer',
    correct_show:'Correct answer display time', correct_show_sub:'How long to show the correct answer',
    export_data:'Export data', export_data_sub:'Download all saved sessions', erase_all:'Erase all data',
    op_soma:'Addition', op_subtracao:'Subtraction', op_multiplicacao:'Multiplication', op_divisao:'Division', op_porcentagem:'Percentage', op_expressao:'Expression (parentheses)',
    op_expressao_encadeada:'Chained (no parentheses)', op_fracao:'Fractions', op_potencia:'Power', op_radical:'Root (square root)', op_logaritmo:'Logarithm', op_equacao:'Equation (solve for x)',
    mode_sprint_l:'Speed', mode_sprint_d:'Maximum velocity',
    mode_resistencia_l:'Endurance', mode_resistencia_d:'Continuous session',
    mode_intervalado_l:'Intervals', mode_intervalado_d:'Work + rest',
    mode_hiit_l:'Cognitive HIIT', mode_hiit_d:'High intensity · 10min',
    kc_aquisicao:'Acquiring', kc_consolidacao:'Consolidating', kc_dominado:'Mastered',
    duration_sec:'Duration (seconds)', work_s:'Work (s)', rest_s:'Rest (s)', cycles:'Cycles',
    sprint_desc:'Speed mode: the engine continuously adjusts the difficulty of each skill to keep you near your optimal learning point.',
    hiit_desc:'Fixed 10 minutes: 10 blocks of 40s work + 20s rest.',
    resistencia_desc:'Continuous session — tap pause/end whenever you want to stop.',
    no_evolution:'Not enough history yet to compare.',
    summary_evolution_line:'{op}: from {prev} to {cur} on average.',
    summary_bottleneck_line:'{op} — average time {avg}, accuracy {acc}.',
    no_skills_session:'No standout skills this session.',
    rating:'rating', block:'block', awaiting_retest:'awaiting retention retest', recent_acc:'recent accuracy',
    est_retention:'estimated retention', answer_label:'Answer',
    tag_mastery:'Mastery', tag_focus:'Focus', tag_review:'Review', tag_pending:'Pending', tag_new_skill:'New skill',
    tag_evolution:'Evolution', tag_insight:'Insight',
    tag_new_item:'New', tag_review_item:'Review', tag_reinforce_item:'Reinforce',
    no_insights_yet:'Keep training to unlock personalized insights about your performance.',
    insight_mastered:'You already master {n} skill(s): {list}.',
    insight_consolidating:'Current consolidation focus: "{label}" (recent accuracy of {acc}).',
    insight_acquiring:'New skill currently being introduced: "{label}".',
    insight_forgetting_window:'{n} mastered skill(s) are entering the natural-forgetting review window.',
    insight_retention_test:'"{label}" reached the performance criteria and is awaiting a retest after an interval to confirm real mastery.',
    insight_weekly_improvement:'{op} showed the biggest improvement this past week ({delta} faster on average).',
    date_locale:'en-US'
  }
};
function t(key){ const lang = (Store.data && Store.data.settings.appLang) || 'pt'; return (I18N[lang]||I18N.pt)[key] || key; }
function tf(key, vars){
  let s = t(key);
  Object.keys(vars||{}).forEach(k=>{ s = s.split('{'+k+'}').join(vars[k]); });
  return s;
}
function applyI18N(){
  document.documentElement.lang = (Store.data.settings.appLang==='en') ? 'en' : 'pt-BR';
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}

/* ---------- 3. OPERAÇÕES (símbolos/labels) ---------- */
const OPS = {
  soma: {key:'soma', label:'Soma', label_en:'Addition', symbol:'+', baseline:1300, active:true},
  subtracao: {key:'subtracao', label:'Subtração', label_en:'Subtraction', symbol:'−', baseline:1500, active:true},
  multiplicacao: {key:'multiplicacao', label:'Multiplicação', label_en:'Multiplication', symbol:'×', baseline:1900, active:true},
  divisao: {key:'divisao', label:'Divisão', label_en:'Division', symbol:'÷', baseline:2300, active:false},
  porcentagem: {key:'porcentagem', label:'Porcentagem', label_en:'Percentage', symbol:'%', baseline:2700, active:false},
  expressao: {key:'expressao', label:'Expressão', label_en:'Expression', symbol:'()', baseline:4200, active:false},
  expressao_encadeada: {key:'expressao_encadeada', label:'Encadeada', label_en:'Chained', symbol:'⋯', baseline:4000, active:false},
  fracao: {key:'fracao', label:'Fração', label_en:'Fraction', symbol:'/', baseline:3000, active:false},
  potencia: {key:'potencia', label:'Potência', label_en:'Power', symbol:'^', baseline:2600, active:false},
  radical: {key:'radical', label:'Radical', label_en:'Root', symbol:'√', baseline:2600, active:false},
  logaritmo: {key:'logaritmo', label:'Logaritmo', label_en:'Logarithm', symbol:'log', baseline:3200, active:false},
  equacao: {key:'equacao', label:'Equação', label_en:'Equation', symbol:'x', baseline:4500, active:false},
};
// BUGFIX/3.13: baseline (tempo de reação padrão) e ativação padrão viviam duplicados em
// Engine.defaultBaseline() e Store.defaults().settings.ops — uma nova operação exigia
// tocar 3+ lugares e era fácil esquecer um. Agora OPS é a única fonte de verdade; os dois
// pontos abaixo só leem daqui.
function defaultOpsMap(){
  const map = {};
  Object.keys(OPS).forEach(k=>{ map[k] = !!OPS[k].active; });
  return map;
}
function opLabel(key){ const o=OPS[key]; if(!o) return key; return t('op_'+key); }
// Aplica uma operação básica (pelas chaves de OPS) a dois operandos — usado pelos
// geradores de expressões com parênteses (seç. "Expressões").
function applyOp2(opKey, x, y){
  if(opKey==='soma') return x+y;
  if(opKey==='subtracao') return x-y;
  if(opKey==='multiplicacao') return x*y;
  if(opKey==='divisao') return y!==0 ? x/y : NaN;
  return NaN;
}

/* ---------- 2c. NOVOS BLOCOS/COMPOSIÇÕES (spec: raiz, potência, log, fração, encadeada, equação) ----------
   "Termo" = unidade de operando dentro de uma expressão maior. Cada gerador de termo devolve
   {kind, value, text, ...campos extras p/ TTS}. Operandos avançados (potência/raiz/log) nunca
   formam sozinhos a expressão inteira — são sempre conectados a outro termo por um operador
   básico (seç. 3), o que é garantido pelos construtores de cadeia abaixo. */
const SUP_MAP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻'};
const SUB_MAP = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
function toSup(n){ return String(n).split('').map(c=>SUP_MAP[c]||c).join(''); }
function toSub(n){ return String(n).split('').map(c=>SUB_MAP[c]||c).join(''); }
function fmtTermInt(n){ return n<0 ? `(−${Math.abs(n)})` : `${n}`; }
function fmtCoefTerm(coef){
  if(coef===0) return '0';
  const sign = coef<0 ? '−' : '';
  const abs = Math.abs(coef);
  return `${sign}${abs===1?'':abs}x`;
}
function genTermInt(range){
  const v = U.rint(-range, range);
  return {kind:'int', value:v, text:fmtTermInt(v)};
}
function genTermPower(t){
  const exps = t>0.6 ? [0,1,2,3] : [0,1,2];
  const exp = U.choice(exps);
  const base = exp===3 ? U.rint(-6,6) : (exp===2 ? U.rint(-12,12) : U.rint(-9,9));
  const value = Math.pow(base,exp);
  return {kind:'power', value, text:`${fmtTermInt(base)}${toSup(exp)}`, base, exp};
}
function genTermRadical(t){
  const k = U.rint(1, 6+Math.round(t*9));
  const radicand = k*k;
  return {kind:'radical', value:k, text:`√${radicand}`, radicand};
}
function genTermLog(t){
  const base_log = U.choice([2,3,4,5,10]);
  const value = U.rint(1, 2+Math.round(t*3));
  const arg_log = Math.pow(base_log, value);
  return {kind:'log', value, text:`log${toSub(base_log)}(${arg_log})`, base_log, arg_log};
}
function chainText(terms, ops){
  let s = terms[0].text;
  for(let i=0;i<ops.length;i++) s += ` ${OPS[ops[i]].symbol} ${terms[i+1].text}`;
  return s;
}
// Par "termo avançado + outro termo", ligados por operador básico (nunca isolados — seç. 3)
function buildAdvancedPair(t, requiredKindGen){
  let terms, op, val, tries=0;
  do{
    const t1 = requiredKindGen(t);
    const otherPool = [
      ()=>genTermInt(U.rint(2, 6+Math.round(t*20))),
      ()=>genTermPower(t),
      ()=>genTermRadical(t),
      ()=>genTermLog(t),
    ];
    const t2 = U.choice(otherPool)();
    op = U.choice(['soma','subtracao','multiplicacao']);
    terms = Math.random()<0.5 ? [t1,t2] : [t2,t1];
    val = applyOp2(op, terms[0].value, terms[1].value);
    tries++;
  } while((!Number.isInteger(val) || Math.abs(val)>99999) && tries<25);
  return {terms, ops:[op], answer:val, exprText:chainText(terms,[op]), features:{}};
}

function countCarries(a,b){
  let da=String(a).split('').reverse(), db=String(b).split('').reverse();
  let carry=0, count=0;
  for(let i=0;i<Math.max(da.length,db.length);i++){
    let sum = (+da[i]||0)+(+db[i]||0)+carry;
    if(sum>=10){ carry=1; count++; } else carry=0;
  }
  return count;
}
function countBorrows(a,b){
  let da=String(a).split('').reverse(), db=String(b).split('').reverse();
  let borrow=0, count=0;
  for(let i=0;i<da.length;i++){
    let x=(+da[i]||0)-borrow, y=(+db[i]||0);
    if(x<y){ count++; borrow=1; } else borrow=0;
  }
  return count;
}

/* ---------- 4. GRAFO DE COMPONENTES DE HABILIDADE (KCs) ----------
   Cada KC é uma FAMÍLIA de cálculo (nunca um par de operandos específico —
   seç. 0, princípio 4). "eloBounds" define a faixa de dificuldade (em
   pontos Elo) que aquela família cobre; dentro dela, a dificuldade do
   item é 100% controlada pelo rating contínuo do usuário no KC (seç. 11).
   "prereqs" define o DAG de pré-requisitos (seç. 1, camada 1). */
const KC_DEFS = {
  soma_1d:{ label:'Soma — unidades', op:'soma', prereqs:[], eloBounds:[500,850],
    gen(t){ const hi=4+Math.round(t*5); let a=U.rint(1,hi), b=U.rint(1,Math.max(1,9-a));
      if(Math.random()<0.5)[a,b]=[b,a]; return {a,b,answer:a+b,features:{carries:0}}; } },
  soma_2d_sc:{ label:'Soma — 2 dígitos (sem reagrupamento)', op:'soma', prereqs:['soma_1d'], eloBounds:[750,1050],
    gen(t){ const maxTen=1+Math.round(t*7);
      let aT=U.rint(1,maxTen), bT=U.rint(1,Math.max(1,9-aT));
      let aU=U.rint(0,9), bU=U.rint(0,Math.max(0,9-aU));
      let a=aT*10+aU, b=bT*10+bU; if(Math.random()<0.5)[a,b]=[b,a];
      return {a,b,answer:a+b,features:{carries:0}}; } },
  soma_2d_cc:{ label:'Soma — 2 dígitos (com reagrupamento)', op:'soma', prereqs:['soma_2d_sc'], eloBounds:[950,1300],
    gen(t){ const maxVal=20+Math.round(t*79); let a,b,tries=0;
      do{ a=U.rint(10,maxVal); b=U.rint(10,maxVal); tries++; } while(countCarries(a,b)===0 && tries<15);
      if(Math.random()<0.5)[a,b]=[b,a];
      return {a,b,answer:a+b,features:{carries:countCarries(a,b)}}; } },
  soma_3_4d:{ label:'Soma — 3 e 4 dígitos', op:'soma', prereqs:['soma_2d_cc'], eloBounds:[1200,1600],
    gen(t){ const four=t>0.45;
      const a = four ? U.rint(1000,1000+Math.round(t*8999)) : U.rint(100,100+Math.round(t*899));
      const b = four ? U.rint(1000,1000+Math.round(t*8999)) : U.rint(100,100+Math.round(t*899));
      return {a,b,answer:a+b,features:{carries:countCarries(a,b)}}; } },

  sub_1d:{ label:'Subtração — unidades', op:'subtracao', prereqs:[], eloBounds:[500,850],
    gen(t){ const hi=4+Math.round(t*5); let a=U.rint(2,hi+9), b=U.rint(1,Math.min(9,a-1)||1);
      if(a<=b) a=b+U.rint(1,3); return {a,b,answer:a-b,features:{borrows:0}}; } },
  sub_2d_se:{ label:'Subtração — 2 dígitos (sem empréstimo)', op:'subtracao', prereqs:['sub_1d'], eloBounds:[750,1050],
    gen(t){ const maxTen=1+Math.round(t*7); let tries=0,a,b;
      do{ let aT=U.rint(1,maxTen), aU=U.rint(0,9); a=aT*10+aU;
          let bT=U.rint(0,aT), bU=U.rint(0,aU); b=bT*10+bU; tries++;
      } while((a<=b || countBorrows(a,b)>0) && tries<15);
      if(a<=b){ a=b+U.rint(1,9); }
      return {a,b,answer:a-b,features:{borrows:0}}; } },
  sub_2d_ce:{ label:'Subtração — 2 dígitos (com empréstimo)', op:'subtracao', prereqs:['sub_2d_se'], eloBounds:[950,1300],
    gen(t){ const maxVal=20+Math.round(t*79); let a,b,tries=0;
      do{ a=U.rint(11,maxVal); b=U.rint(10,maxVal-1); tries++; }
      while((a<=b || countBorrows(a,b)===0) && tries<15);
      if(a<=b){ [a,b]=[Math.max(a,b)+1, Math.min(a,b)]; }
      return {a,b,answer:a-b,features:{borrows:countBorrows(a,b)}}; } },
  sub_3_4d:{ label:'Subtração — 3 e 4 dígitos', op:'subtracao', prereqs:['sub_2d_ce'], eloBounds:[1200,1600],
    gen(t){ const four=t>0.45;
      let a = four ? U.rint(1000,1000+Math.round(t*8999)) : U.rint(100,100+Math.round(t*899));
      let b = four ? U.rint(1000,a) : U.rint(100,a);
      if(a<=b) a=b+U.rint(1,50);
      return {a,b,answer:a-b,features:{borrows:countBorrows(a,b)}}; } },

  mult_tabuada:{ label:'Multiplicação — tabuada (2 a 9)', op:'multiplicacao', prereqs:[], eloBounds:[700,1000],
    gen(t){ const hi=4+Math.round(t*5); let a=U.rint(2,hi+3), b=U.rint(2,hi+3);
      if(Math.random()<0.5)[a,b]=[b,a]; return {a,b,answer:a*b,features:{}}; } },
  mult_11_19:{ label:'Multiplicação — por 11 a 19', op:'multiplicacao', prereqs:['mult_tabuada'], eloBounds:[950,1250],
    gen(t){ let a=U.rint(11,11+Math.round(t*8)), b=U.rint(2,9);
      if(Math.random()<0.4)[a,b]=[b,a]; return {a,b,answer:a*b,features:{}}; } },
  mult_2d:{ label:'Multiplicação — 2 dígitos × 2 dígitos', op:'multiplicacao', prereqs:['mult_11_19'], eloBounds:[1200,1650],
    gen(t){ const hi=Math.round(29+t*70); let a=U.rint(11,hi), b=U.rint(11,Math.min(hi,29+Math.round(t*40)));
      return {a,b,answer:a*b,features:{}}; } },

  div_tabuada:{ label:'Divisão — tabuada (2 a 9)', op:'divisao', prereqs:['mult_tabuada'], eloBounds:[750,1050],
    gen(t){ const hi=4+Math.round(t*5); const divisor=U.rint(2,hi+3), quotient=U.rint(2,hi+3);
      return {a:divisor*quotient,b:divisor,answer:quotient,features:{exact:true}}; } },
  div_2d:{ label:'Divisão — resultado de 2 dígitos', op:'divisao', prereqs:['div_tabuada','mult_11_19'], eloBounds:[1000,1350],
    gen(t){ const divisor=U.rint(2,2+Math.round(t*10)), quotient=U.rint(6,6+Math.round(t*14));
      return {a:divisor*quotient,b:divisor,answer:quotient,features:{exact:true}}; } },
  div_3d:{ label:'Divisão — dividendos maiores', op:'divisao', prereqs:['div_2d','mult_2d'], eloBounds:[1300,1650],
    gen(t){ const divisor=U.rint(2,2+Math.round(t*23)); let quotient=U.rint(10,10+Math.round(t*30));
      let dividend=divisor*quotient;
      if(dividend>999){ quotient=Math.max(2,Math.floor(999/divisor)); dividend=divisor*quotient; }
      return {a:dividend,b:divisor,answer:quotient,features:{exact:true}}; } },

  pct_basico:{ label:'Porcentagem — básica', op:'porcentagem', prereqs:['mult_tabuada'], eloBounds:[750,1050],
    gen(t){ const opts=[10,20,50,25]; const pct=U.choice(opts); const base=U.rint(2,2+Math.round(t*18))*10;
      return {a:pct,b:base,answer:Math.round(pct*base/100),features:{pct}}; } },
  pct_intermediario:{ label:'Porcentagem — intermediária', op:'porcentagem', prereqs:['pct_basico'], eloBounds:[1000,1300],
    gen(t){ const opts=[15,25,75,5,30]; const pct=U.choice(opts); let base=U.rint(4,4+Math.round(t*56))*10;
      let result=pct*base/100, tries=0; while(!Number.isInteger(result)&&tries<10){ base+=5; result=pct*base/100; tries++; }
      base=Math.round(base); return {a:pct,b:base,answer:Math.round(pct*base/100),features:{pct}}; } },
  pct_avancado:{ label:'Porcentagem — avançada', op:'porcentagem', prereqs:['pct_intermediario','mult_2d'], eloBounds:[1250,1600],
    gen(t){ const opts=[12,18,35,45,65,8]; const pct=U.choice(opts); let base=U.rint(4,4+Math.round(t*196))*5;
      let result=pct*base/100, tries=0; while(!Number.isInteger(result)&&tries<10){ base+=5; result=pct*base/100; tries++; }
      base=Math.round(base); return {a:pct,b:base,answer:Math.round(pct*base/100),features:{pct}}; } },

  // Expressões com parênteses: (a ⊕ b) ⊗ c — ensina precedência/ordem de operações,
  // já que o parêntese força o cálculo interno antes do externo.
  expr_par_simples:{ label:'Expressões — parênteses simples', op:'expressao', prereqs:['soma_2d_cc','mult_tabuada'], eloBounds:[1050,1400],
    gen(t){
      const outerPool = t>0.5 ? ['soma','subtracao','multiplicacao'] : ['soma','subtracao'];
      const outerOp = U.choice(outerPool);
      const innerOp = U.choice(['soma','subtracao']);
      let a,b,c,inner,answer,tries=0;
      do{
        a = U.rint(2, 9+Math.round(t*30)); b = U.rint(2, 9+Math.round(t*30));
        if(innerOp==='subtracao' && a<b){ [a,b]=[b,a]; }
        inner = applyOp2(innerOp,a,b);
        c = U.rint(2, 5+Math.round(t*10));
        if(outerOp==='subtracao' && inner<c){ c = U.rint(1, Math.max(1,inner)); }
        answer = applyOp2(outerOp, inner, c);
        tries++;
      } while((!Number.isInteger(answer) || Math.abs(answer)>9999) && tries<25);
      const exprText = `(${a} ${OPS[innerOp].symbol} ${b}) ${OPS[outerOp].symbol} ${c}`;
      return {a,b,c,innerOp,outerOp,answer,exprText,features:{}};
    } },
  expr_par_dupla:{ label:'Expressões — dois parênteses', op:'expressao', prereqs:['expr_par_simples','mult_2d'], eloBounds:[1350,1700],
    gen(t){
      const midPool = t>0.5 ? ['soma','subtracao','multiplicacao'] : ['soma','subtracao'];
      const midOp = U.choice(midPool);
      let leftOp = U.choice(['soma','subtracao']);
      let rightOp = U.choice(['soma','subtracao']);
      let a,b,c,d,left,right,answer,tries=0;
      do{
        a=U.rint(2,9+Math.round(t*20)); b=U.rint(2,9+Math.round(t*20));
        if(leftOp==='subtracao' && a<b){ [a,b]=[b,a]; }
        left = applyOp2(leftOp,a,b);
        c=U.rint(2,9+Math.round(t*20)); d=U.rint(2,9+Math.round(t*20));
        if(rightOp==='subtracao' && c<d){ [c,d]=[d,c]; }
        right = applyOp2(rightOp,c,d);
        // BUGFIX: quando midOp é subtração, sortear left/right independentemente e
        // torcer para left>=right falha com frequência (uma subtração tende a ser bem
        // menor que uma soma), e o teste de estresse mostrou ~2% de respostas negativas
        // mesmo com 25 tentativas. Em vez de depender de sorte, garantimos a ordem: o
        // maior dos dois parênteses sempre fica à esquerda quando a operação é "−".
        if(midOp==='subtracao' && left<right){
          [a,b,leftOp,left, c,d,rightOp,right] = [c,d,rightOp,right, a,b,leftOp,left];
        }
        answer = applyOp2(midOp, left, right);
        tries++;
      } while((!Number.isInteger(answer) || Math.abs(answer)>9999) && tries<25);
      const exprText = `(${a} ${OPS[leftOp].symbol} ${b}) ${OPS[midOp].symbol} (${c} ${OPS[rightOp].symbol} ${d})`;
      return {a,b,c,d,leftOp,rightOp,midOp,answer,exprText,features:{}};
    } },

  // ---- Frações (seç. 1: A/B, fração de fração) ----
  fracao_simples:{ label:'Frações — operações simples', op:'fracao', prereqs:['soma_2d_cc','div_2d'], eloBounds:[1150,1500],
    gen(t){
      if(Math.random()<0.5){
        // soma/subtração de frações de mesmo denominador, resultado inteiro exato (construção
        // algébrica direta — sem tentativa/erro — para garantir exatidão sempre)
        const q = U.rint(2, 4+Math.round(t*6));
        const opKey = U.choice(['soma','subtracao']);
        let p1,p2,answer;
        if(opKey==='soma'){
          answer = U.rint(1, 2+Math.round(t*4));
          const total = q*answer;
          p1 = U.rint(1, total-1);
          p2 = total-p1;
        } else {
          answer = U.rint(0, 2+Math.round(t*4));
          p2 = U.rint(1, q*3);
          p1 = p2 + q*answer;
        }
        const terms=[{kind:'fraction',value:p1/q,text:`${p1}/${q}`,num:p1,den:q},
                     {kind:'fraction',value:p2/q,text:`${p2}/${q}`,num:p2,den:q}];
        return {answer, exprText:chainText(terms,[opKey]), terms, ops:[opKey], features:{}};
      }
      // fração de fração / multiplicação com cancelamento — resultado inteiro garantido
      const opKey = U.choice(['multiplicacao','divisao']);
      const C = U.rint(2, 3+Math.round(t*7));
      const r = U.rint(2, 3+Math.round(t*7));
      const A = C*r;
      const B = U.rint(2, 4+Math.round(t*6));
      let exprText, terms;
      if(opKey==='multiplicacao'){
        terms=[{kind:'fraction',value:A/B,text:`${A}/${B}`,num:A,den:B},{kind:'fraction',value:B/C,text:`${B}/${C}`,num:B,den:C}];
        exprText = chainText(terms,[opKey]);
      } else {
        terms=[{kind:'fraction',value:A/B,text:`(${A}/${B})`,num:A,den:B},{kind:'fraction',value:C/B,text:`(${C}/${B})`,num:C,den:B}];
        exprText = chainText(terms,[opKey]);
      }
      return {answer:r, exprText, terms, ops:[opKey], features:{}};
    } },

  // ---- Potência / Radical / Log — sempre conectados a outro termo por operador básico (seç. 3) ----
  potencia_basica:{ label:'Potência — expoentes 0 a 3', op:'potencia', prereqs:['mult_2d'], eloBounds:[1200,1600],
    gen(t){ return buildAdvancedPair(t, genTermPower); } },
  radical_quad:{ label:'Radical — raiz quadrada exata', op:'radical', prereqs:['mult_2d'], eloBounds:[1200,1600],
    gen(t){ return buildAdvancedPair(t, genTermRadical); } },
  log_basico:{ label:'Logaritmo — base inteira', op:'logaritmo', prereqs:['potencia_basica'], eloBounds:[1350,1700],
    gen(t){ return buildAdvancedPair(t, genTermLog); } },

  // ---- Encadeada: 2–3 operadores em sequência, sem parênteses obrigatórios (seç. 2, exemplo 2) ----
  expr_encadeada:{ label:'Expressões — encadeadas', op:'expressao_encadeada', prereqs:['soma_2d_cc','sub_2d_ce','mult_2d'], eloBounds:[1250,1600],
    gen(t){
      const numOps = t>0.55 ? U.rint(2,3) : 2;
      const family = Math.random()<0.6 ? 'addsub' : 'muldiv';
      const ops=[];
      for(let i=0;i<numOps;i++) ops.push(family==='addsub' ? U.choice(['soma','subtracao']) : U.choice(['multiplicacao','divisao']));
      let terms, val, valid, tries=0;
      do{
        terms=[];
        for(let i=0;i<=numOps;i++){
          if(Math.random()<0.18*t) terms.push(U.choice([genTermPower,genTermRadical,genTermLog])(t));
          else if(family==='muldiv') terms.push(genTermInt(U.rint(2, 3+Math.round(t*6))));
          else terms.push(genTermInt(U.rint(1, 6+Math.round(t*25))));
        }
        valid = true; val = terms[0].value;
        for(let i=0;i<numOps;i++){
          const nextVal = terms[i+1].value;
          if(ops[i]==='divisao'){ if(nextVal===0 || val%nextVal!==0){ valid=false; break; } }
          val = applyOp2(ops[i], val, nextVal);
        }
        tries++;
      } while((!valid || !Number.isInteger(val) || Math.abs(val)>99999) && tries<30);
      return {terms, ops, answer:val, exprText:chainText(terms,ops), features:{}};
    } },

  // ---- Equação linear: já é por natureza uma sequência de operações até isolar x (seç. 2, exemplo 4) ----
  equacao_linear:{ label:'Equações — lineares (resolver x)', op:'equacao', prereqs:['sub_2d_ce','mult_2d'], eloBounds:[1300,1700],
    gen(t){
      let x0,a,c,b,d,tries=0;
      do{
        x0 = U.rint(-(6+Math.round(t*14)), 6+Math.round(t*14));
        a = U.rint(2, 3+Math.round(t*9)) * (Math.random()<0.5?-1:1);
        c = Math.random()<0.7 ? U.rint(0, 3+Math.round(t*9))*(Math.random()<0.5?-1:1) : 0;
        b = U.rint(-(15+Math.round(t*70)), 15+Math.round(t*70));
        d = (a-c)*x0 + b;
        tries++;
      } while((a===c || Math.abs(d)>1999) && tries<40);
      const left = fmtCoefTerm(a) + (b!==0 ? ` ${b>0?'+':'−'} ${Math.abs(b)}` : '');
      const right = c!==0 ? (fmtCoefTerm(c) + (d!==0 ? ` ${d>0?'+':'−'} ${Math.abs(d)}` : '')) : `${d}`;
      return {a,b,c,d, answer:x0, exprText:`${left} = ${right}`, features:{}, isEquation:true};
    } },
};
// Traduções (apresentação apenas) das famílias de habilidade — a lógica/seleção usa sempre a chave (key).
const KC_LABELS_EN = {
  soma_1d:'Addition — single digits',
  soma_2d_sc:'Addition — 2 digits (no carrying)',
  soma_2d_cc:'Addition — 2 digits (with carrying)',
  soma_3_4d:'Addition — 3 and 4 digits',
  sub_1d:'Subtraction — single digits',
  sub_2d_se:'Subtraction — 2 digits (no borrowing)',
  sub_2d_ce:'Subtraction — 2 digits (with borrowing)',
  sub_3_4d:'Subtraction — 3 and 4 digits',
  mult_tabuada:'Multiplication — times tables (2–9)',
  mult_11_19:'Multiplication — by 11–19',
  mult_2d:'Multiplication — 2 digits × 2 digits',
  div_tabuada:'Division — times tables (2–9)',
  div_2d:'Division — 2-digit result',
  div_3d:'Division — larger dividends',
  pct_basico:'Percentage — basic',
  pct_intermediario:'Percentage — intermediate',
  pct_avancado:'Percentage — advanced',
  expr_par_simples:'Expressions — simple parentheses',
  expr_par_dupla:'Expressions — double parentheses',
  fracao_simples:'Fractions — simple operations',
  potencia_basica:'Power — exponents 0 to 3',
  radical_quad:'Root — exact square root',
  log_basico:'Logarithm — integer base',
  expr_encadeada:'Expressions — chained',
  equacao_linear:'Equations — linear (solve for x)'
};
function kcLabel(key, fallback){
  const ptLabel = (KC_DEFS[key] && KC_DEFS[key].label) || fallback || key;
  if(Store.data.settings.appLang==='en') return KC_LABELS_EN[key] || ptLabel;
  return ptLabel;
}
const KC_ORDER = ['soma_1d','sub_1d','mult_tabuada','div_tabuada','pct_basico',
  'soma_2d_sc','sub_2d_se','mult_11_19','div_2d','pct_intermediario',
  'soma_2d_cc','sub_2d_ce','mult_2d','div_3d','pct_avancado',
  'soma_3_4d','sub_3_4d','expr_par_simples','expr_par_dupla',
  'fracao_simples','potencia_basica','radical_quad','expr_encadeada','equacao_linear','log_basico'];

function kcOpDef(key){ return OPS[KC_DEFS[key].op]; }

/* ---------- 5. STORAGE LOCAL (localStorage, tudo offline) ---------- */
const DB_KEY = 'calcrapido_db_v2';
const SETTINGS_VERSION = 4;
const CALIBRATION_ITEMS = 8;
const DEFAULT_SELECTED_SKILLS = ['soma_2d_cc','sub_2d_ce','mult_11_19','mult_2d','pct_intermediario','potencia_basica','radical_quad'];
const Store = {
  data: null,
  defaults(){
    return {
      settings:{
        ops:defaultOpsMap(),
        mode:'sprint',
        sprintSeconds:60,
        intWork:30, intRest:10, intCycles:4,
        tts:false, hideDuringTts:false,
        vibration:true, sounds:true,
        gapMs:400, correctAnswerShowMs:900,
        answerTimeoutSeconds:10,
        voiceRate:1.0, voiceLang:'pt-BR',
        theme:'dark', fontScale:1,
        appLang:'pt', stopClockOnFirstKey:true,
        confirmBeforeAccept:true,
        drillMode:'foco',
        selectedSkills:[...DEFAULT_SELECTED_SKILLS],
        selectAllSkills:false
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
      });
      if(!Array.isArray(this.data.settings.selectedSkills) || !this.data.settings.selectedSkills.length){
        this.data.settings.selectedSkills = [...DEFAULT_SELECTED_SKILLS];
      }
      this.data.settings.selectedSkills = this.data.settings.selectedSkills.filter(k=>KC_DEFS[k]);
      // Se "todas as contas" estava ativo, garante que famílias novas (adicionadas em
      // atualizações do app) também entrem na seleção, e não fiquem de fora silenciosamente.
      if(this.data.settings.selectAllSkills) this.data.settings.selectedSkills = [...KC_ORDER];
      if(!['foco','misto'].includes(this.data.settings.drillMode)) this.data.settings.drillMode = 'foco';
      this.data.history = this.data.history || [];
      this.data.bestStreak = this.data.bestStreak || 0;
      this.data.settingsVersion = SETTINGS_VERSION;
      if(oldSettingsVersion < SETTINGS_VERSION) this.save();
    }catch(e){ this.data = this.defaults(); }
    return this.data;
  },
  save(){
    try{ localStorage.setItem(DB_KEY, JSON.stringify(this.data)); }
    catch(e){ console.warn('Falha ao salvar localmente', e); }
  },
  reset(){ this.data = this.defaults(); this.save(); }
};

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
function spokenPhrase(item, voiceLang){
  const a = item.a, b = item.b;
  const w = EXPR_WORDS[voiceLang] || EXPR_WORDS['pt-BR'];
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
  beep(freq, dur){
    if(!Store.data.settings.sounds) return;
    const ctx = this.ensure(); if(!ctx) return;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = freq; osc.type='sine';
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime+0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime+dur);
  },
  correct(){ this.beep(880, 0.12); },
  wrong(){ this.beep(180, 0.22); }
};

const Haptics = {
  supported(){ return 'vibrate' in navigator; },
  correct(){ if(Store.data.settings.vibration && this.supported()) navigator.vibrate(15); },
  wrong(){ if(Store.data.settings.vibration && this.supported()) navigator.vibrate([50,40,50]); }
};

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
  answering:false,
  state:'aquecimento',  // aquecimento | fluxo | fadiga | frustracao (seç. 13)
  touchedKcs:new Set(),

  start(){
    const s = Store.data.settings;
    this.mode = s.mode;
    clearInterval(this.timerHandle); clearInterval(this.restHandle);
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
    this.records = [];
    this.answering = false;
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
      } else {
        this.phase='work';
        const workSec = this.mode==='hiit' ? 40 : s.intWork;
        this.endsAt = U.now() + workSec*1000;
        UI.showScreen('training');
        this.nextQuestion();
      }
    }
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
    UI.renderQuestion(item, ()=>{
      if(!this.active || this.paused || this.current!==item) return; // sessão mudou enquanto a voz lia
      this.qShownAt = U.now();
      this.itemDeadline = this.qShownAt + item.timeoutMs;
      this.itemTimeoutHandle = setTimeout(()=>this.handleTimeout(), item.timeoutMs);
    });
  },
  handleTimeout(){
    if(!this.active || this.paused || !this.current) return;
    this.typed = '';
    this.evaluate(true);
  },
  submitDigit(d){
    if(!this.active || this.paused || !this.current || this.answering) return;
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
    clearInterval(this.timerHandle); clearInterval(this.restHandle);
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
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
    clearInterval(this.timerHandle); clearInterval(this.restHandle);
    clearTimeout(this.itemTimeoutHandle); clearTimeout(this.nextQuestionHandle);
    try{ speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel(); }catch(e){}
    document.getElementById('btnPause').textContent = '⏸';
    if(this.records.length){
      // Já respondeu pelo menos uma conta: fecha como uma sessão parcial, com resumo,
      // em vez de descartar o progresso silenciosamente.
      const summary = Analytics.buildSessionSummary(this.records);
      Store.data.history.push(summary);
      let streak=0, maxStreak=0;
      this.records.forEach(r=>{ if(r.correct){streak++; maxStreak=Math.max(maxStreak,streak);} else streak=0; });
      Store.data.bestStreak = Math.max(Store.data.bestStreak||0, maxStreak);
      Store.save();
      UI.renderSummary(summary);
      UI.showScreen('summary');
    } else {
      UI.showScreen('home');
      UI.setTab('home');
      UI.renderHome();
    }
  }
};
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
    return {id:U.uid(),date:Date.now(),mode:Session.mode,drillMode:Store.data.settings.drillMode,selectedSkills:Engine.selectedKeys(),
      ops:Object.keys(byOp),total,accuracy:total?correct.length/total:0,avgTime:U.mean(times),cogAvg:U.mean(records.map(r=>r.cognitiveMs)),
      motorAvg:U.mean(records.map(r=>r.motorMs)),median:U.median(times),p90:U.percentile(times,90),targetRate:total?records.filter(r=>r.targetHit).length/total:0,
      byOp,bySkill,evolution,bottleneck,kcFocus:skillList.sort((a,b)=>a.targetRate-b.targetRate).slice(0,6)};
  },
  overallMedianP90(){
    const all=[]; Object.values(Store.data.speedProfiles||{}).forEach(p=>(p.window||[]).forEach(w=>{if(w.correct) all.push(w.ms);}));
    return {median:U.median(all),p90:U.percentile(all,90)};
  },
  kcPanorama(){
    return KC_ORDER.map(key=>{ const p=Engine.profile(key), w=p.window||[], correct=w.filter(x=>x.correct).map(x=>x.ms); return {
      key,label:kcLabel(key),calibrating:Engine.isCalibrating(p),calibration:`${p.calibration.length}/${CALIBRATION_ITEMS}`,
      stage:Engine.stage(p),reviewProgress:(p.reviewResults||[]).length,
      targetMs:p.targetMs,median:U.median(correct),accuracy:Engine.recentAccuracy(p),targetRate:Engine.targetRate(p),bestMs:p.bestMs}; });
  },
  generateInsights(){
    const profiles=this.kcPanorama().filter(p=>!p.calibrating&&p.median);
    if(!profiles.length) return [t('no_insights_yet')];
    const slow=[...profiles].sort((a,b)=>(a.targetRate-b.targetRate)||(b.median-a.median))[0];
    const fastest=[...profiles].filter(p=>p.bestMs).sort((a,b)=>a.bestMs-b.bestMs)[0];
    const list=[`${slow.label}: ${U.fmtPct(slow.targetRate)} ${t('target_rate').toLowerCase()} · ${U.fmtSec(slow.median)} ${t('median').toLowerCase()}.`];
    if(fastest) list.push(`${fastest.label}: melhor marca ${U.fmtSec(fastest.bestMs)}.`);
    return list;
  }
};

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
    document.getElementById('btnGoHistory').onclick = ()=>{ this.showScreen('insights'); this.renderInsights(); this.setTab('insights'); };
    document.getElementById('btnNewSession').onclick = ()=>Session.start();
  },
  toast(msg){
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), 1800);
  },
  tabScreens:['home','stats','insights','settings'],
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
        if(target==='insights') this.renderInsights();
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
      this.renderHome(); this.renderStats(); this.renderInsights();
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
        Store.reset(); this.toast(t('data_erased')); this.renderHome(); this.renderStats(); this.renderInsights();
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
    const factsBox = document.getElementById('sumFacts');
    factsBox.innerHTML='';
    if(!sum.kcFocus || !sum.kcFocus.length){ factsBox.innerHTML = `<p>${t('no_skills_session')}</p>`; }
    (sum.kcFocus||[]).forEach(f=>{
      const line = document.createElement('div'); line.className='fact-line';
      line.innerHTML = `<span>${f.label}</span><span class="t">${U.fmtSec(f.median)} · ${U.fmtPct(f.targetRate)} ${t('target_rate').toLowerCase()}</span>`;
      factsBox.appendChild(line);
    });
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
  skillAggregate(){
    const agg={};
    Store.data.history.forEach(h=>Object.entries(h.bySkill||{}).forEach(([key,s])=>{
      const a=agg[key]||(agg[key]={key,label:s.label,n:0,correct:0,targetHits:0,times:[]});
      a.n+=s.n; a.correct+=s.correct; a.targetHits+=Math.round(s.targetRate*s.n); if(s.median) a.times.push(s.median);
    }));
    Object.values(agg).forEach(a=>{ a.median=U.median(a.times); a.accuracy=a.n?a.correct/a.n:0; a.targetRate=a.n?a.targetHits/a.n:0; });
    return agg;
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

    const agg = this.skillAggregate();
    const opBox = document.getElementById('opStatsList');
    opBox.innerHTML='';
    const skillsWithData = Object.keys(agg);
    if(!skillsWithData.length){ opBox.innerHTML = `<p>${t('no_op_data')}</p>`; }
    skillsWithData.forEach(key=>{
      const a = agg[key];
      const previous=Analytics.historicalSkillMedian(key);
      const trendVal=previous&&a.median ? previous-a.median : null;
      const card = document.createElement('div'); card.className='op-stat-card';
      let trendHtml = '';
      if(trendVal!=null && Math.abs(trendVal) >= 30){
        const up = trendVal > 0;
        trendHtml = `<div class="trend ${up?'up':'down'}">${up?'▲':'▼'} ${U.fmtSec(Math.abs(trendVal))}</div>`;
      } else {
        trendHtml = `<div class="trend flat">—</div>`;
      }
      card.innerHTML = `<div class="sq">${OPS[KC_DEFS[key].op].symbol}</div>
        <div class="mid"><div class="l">${a.label}</div><div class="m">${U.fmtSec(a.median)} ${t('median').toLowerCase()} · ${U.fmtPct(a.targetRate)} ${t('target_rate').toLowerCase()}</div></div>
        ${trendHtml}`;
      opBox.appendChild(card);
    });
  },
  insightVisual(txt){
    // Escolhe ícone/etiqueta de acordo com o conteúdo do insight gerado por Analytics.generateInsights()
    // (apenas apresentação — o texto e o cálculo continuam 100% originais). Os gatilhos abaixo casam
    // tanto com as frases em português quanto com as equivalentes em inglês.
    if(/domina|master/i.test(txt)) return {ic:'🎯', tag:t('tag_mastery'), color:'var(--accent)'};
    if(/consolidaç|consolidat/i.test(txt)) return {ic:'🐢', tag:t('tag_focus'), color:'var(--bad)'};
    if(/revisão|esquecimento|review|forgetting/i.test(txt)) return {ic:'⏳', tag:t('tag_review'), color:'#F97316'};
    if(/reteste|retest/i.test(txt)) return {ic:'⚠️', tag:t('tag_pending'), color:'#F97316'};
    if(/nova|introduzida|new skill/i.test(txt)) return {ic:'✨', tag:t('tag_new_skill'), color:'var(--accent)'};
    if(/evolução|mais rápido|evolution|faster/i.test(txt)) return {ic:'📈', tag:t('tag_evolution'), color:'var(--good)'};
    return {ic:'💡', tag:t('tag_insight'), color:'var(--muted)'};
  },
  renderInsights(){
    const hist = Store.data.history;
    const insightsBox = document.getElementById('insightsList');
    insightsBox.innerHTML='';
    Analytics.generateInsights().forEach(txt=>{
      const v = this.insightVisual(txt);
      const card = document.createElement('div'); card.className='insight-card';
      card.innerHTML = `<div class="ic">${v.ic}</div>
        <div style="flex:1;">
          <span class="tag" style="color:${v.color}; background:${v.color}22;">${v.tag}</span>
          <div class="body">${txt}</div>
        </div>`;
      insightsBox.appendChild(card);
    });

    const kcBox = document.getElementById('kcMapList');
    if(kcBox){
      kcBox.innerHTML='';
      const panorama = Analytics.kcPanorama();
      if(!panorama.length){ kcBox.innerHTML = `<p>${t('no_kc_yet')}</p>`; }
      panorama.forEach(p=>{
        const row = document.createElement('div'); row.className='kc-row';
        const meta=p.calibrating ? `${t('calibration')} ${p.calibration}` : p.stage==='review_due' ? `${p.reviewProgress}/${RETENTION_REVIEW_ITEMS} · ${t('status_review_due')}` : `${t('target')} ${U.fmtSec(p.targetMs)} · ${U.fmtPct(p.targetRate)} ${t('target_rate').toLowerCase()}`;
        const stageClass={calibrating:'kc-em_aquisicao',acquisition:'kc-em_aquisicao',consolidating:'kc-em_consolidacao',mastered:'kc-dominado',review_due:'kc-em_consolidacao'}[p.stage];
        row.innerHTML = `<div class="kc-row-top"><span>${p.label}</span><span class="kc-pill ${stageClass}">${t('status_'+p.stage)}</span></div>
          <div class="kc-row-meta"><span>${p.median?U.fmtSec(p.median):'—'}</span><span>${meta}</span></div>`;
        kcBox.appendChild(row);
      });
    }

    const listBox = document.getElementById('sessionsList');
    listBox.innerHTML='';
    if(!hist.length){ listBox.innerHTML = `<p>${t('no_sessions_yet')}</p>`; }
    const locale = t('date_locale');
    [...hist].reverse().slice(0,30).forEach(h=>{
      const item = document.createElement('div'); item.className='history-item';
      const d = new Date(h.date);
      item.innerHTML = `<div class="top"><span>${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</span><span>${U.fmtSec(h.median||h.avgTime)}</span></div>
      <div class="meta">${(h.selectedSkills||h.ops||[]).map(k=>KC_DEFS[k]?kcLabel(k):opLabel(k)).join(', ')} · ${h.total} ${t('items')} · ${t('acc_short')} ${U.fmtPct(h.accuracy)} · ${U.fmtPct(h.targetRate||0)} ${t('target_rate').toLowerCase()}</div>`;
      listBox.appendChild(item);
    });
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

/* ---------- 12. INICIALIZAÇÃO ---------- */
Store.load();
TTS.init();
document.addEventListener('DOMContentLoaded', ()=>{
  UI.init();
  if(Store.data.settings.theme==='auto' && window.matchMedia){
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>UI.applyTheme());
  }
});
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
