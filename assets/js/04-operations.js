/* =====================================================================
   assets/js/04-operations.js — operações matemáticas suportadas (soma,
   subtração, multiplicação etc.): símbolos, rótulos, tempo-base e se
   iniciam ativas. Fonte única de verdade (ver nota histórica no arquivo).
   Depende de: nada.
   Usado por: 05, 06, 07, 08, 09, 10 e 13.
   ===================================================================== */

/* ---------- 3. OPERAÇÕES (símbolos/labels) ---------- */
const OPS = {
  soma: {key:'soma', label:'Soma', label_en:'Addition', symbol:'+', baseline:1300, active:true},
  subtracao: {key:'subtracao', label:'Subtração', label_en:'Subtraction', symbol:'−', baseline:1500, active:true},
  multiplicacao: {key:'multiplicacao', label:'Multiplicação', label_en:'Multiplication', symbol:'×', baseline:1900, active:true},
  divisao: {key:'divisao', label:'Divisão', label_en:'Division', symbol:'÷', baseline:2300, active:false},
  porcentagem: {key:'porcentagem', label:'Porcentagem', label_en:'Percentage', symbol:'%', baseline:2700, active:false},
  porcentagem_inversa: {key:'porcentagem_inversa', label:'Porcentagem inversa', label_en:'Reverse percentage', symbol:'?%', baseline:3200, active:false},
  porcentagem_acrescimo: {key:'porcentagem_acrescimo', label:'Acréscimo de %', label_en:'Percentage markup', symbol:'+%', baseline:3000, active:false},
  porcentagem_desconto: {key:'porcentagem_desconto', label:'Desconto de %', label_en:'Percentage discount', symbol:'−%', baseline:3000, active:false},
  porcentagem_dupla: {key:'porcentagem_dupla', label:'% de %', label_en:'Percent of percent', symbol:'%%', baseline:3400, active:false},
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
// Aplica uma operação básica (pelas chaves de OPS) a dois operandos — usado pelos
// geradores de expressões com parênteses (seç. "Expressões").
function applyOp2(opKey, x, y){
  if(opKey==='soma') return x+y;
  if(opKey==='subtracao') return x-y;
  if(opKey==='multiplicacao') return x*y;
  if(opKey==='divisao') return y!==0 ? x/y : NaN;
  return NaN;
}

