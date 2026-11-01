/* =====================================================================
   assets/js/05-expression-terms.js — 'termos' usados dentro das contas:
   inteiro, potência, radical (quadrada e cúbica), sobrescrito/subscrito, além
   dos contadores de vai-um/empréstimo, e a ÁRVORE DE EXPRESSÃO (grupos aninhados com
   parênteses, colchetes e chaves).
   Depende de: 01-utils.js (U), 04-operations.js (OPS).
   Usado por: 06-tracks.js (geradores), 09-feedback.js e 13-ui.js.
   ===================================================================== */

/* "Termo" = unidade de operando dentro de uma conta maior. Cada gerador de termo devolve
   {kind, value, text, ...campos extras p/ renderização e TTS}. */
const SUP_MAP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻'};
function toSup(n){ return String(n).split('').map(c=>SUP_MAP[c]||c).join(''); }
function fmtCoefTerm(coef){
  if(coef===0) return '0';
  const sign = coef<0 ? '−' : '';
  const abs = Math.abs(coef);
  return `${sign}${abs===1?'':abs}x`;
}
function termInt(v){ return {kind:'int', value:v, text:String(v)}; }
function termPower(base, exp){
  return {kind:'power', value:Math.pow(base,exp), text:`${base<0?'(−'+(-base)+')':base}${toSup(exp)}`, base, exp};
}
// Raiz quadrada exata de k² (índice 2) ou raiz cúbica exata de k³ (índice 3).
function termRoot(k, index=2){
  const radicand = Math.pow(k, index);
  return {kind:'radical', index, value:k, text:`${index===3?'∛':'√'}${radicand}`, radicand};
}
function chainText(terms, ops){
  let s = terms[0].text;
  for(let i=0;i<ops.length;i++) s += ` ${OPS[ops[i]].symbol} ${terms[i+1].text}`;
  return s;
}

/* ---------- ÁRVORE DE EXPRESSÃO (grupos aninhados) ----------
   Parênteses, colchetes e chaves são o MESMO símbolo matemático (agrupar: "resolva isto antes").
   O formato só indica o NÍVEL de aninhamento: o grupo mais interno usa ( ), o que contém um
   ( ) usa [ ], e o que contém um [ ] usa { } — convenção escolar de resolver de dentro p/ fora.
   Nós:  num {v}  ·  bin {op,l,r}  ·  group {e}  ·  neg {e} (sinal − unário)  ·  pow {base,exp}
   `bin` filho de `bin` é impresso SEM parênteses (precedência normal), então só se monta
   assim quando a leitura é a mesma: ex.: a ÷ b × c (esq→dir) e a + b × c. O resto é `group`. */
const X = {
  num:v=>({t:'num', v}),
  bin:(op,l,r)=>({t:'bin', op, l, r}),
  group:e=>({t:'group', e}),
  neg:e=>({t:'neg', e}),
  pow:(base,exp)=>({t:'pow', base, exp})
};
const BRACKET_PAIRS = [['(',')'], ['[',']'], ['{','}']];
// Profundidade de aninhamento: nº de grupos empilhados (num = 0; ( ) sozinho = 1; [ ( ) ] = 2...).
function exprDepth(n){
  if(n.t==='num') return 0;
  if(n.t==='group') return 1 + exprDepth(n.e);
  if(n.t==='neg') return exprDepth(n.e);
  if(n.t==='pow') return exprDepth(n.base);
  return Math.max(exprDepth(n.l), exprDepth(n.r));
}
// 0 = ( ), 1 = [ ], 2 = { } para um nó `group`.
function groupKind(g){ return Math.min(3, exprDepth(g)) - 1; }
function exprEval(n){
  if(n.t==='num') return n.v;
  if(n.t==='group') return exprEval(n.e);
  if(n.t==='neg') return -exprEval(n.e);
  if(n.t==='pow') return Math.pow(exprEval(n.base), n.exp);
  return applyOp2(n.op, exprEval(n.l), exprEval(n.r));
}
function exprToText(n){
  if(n.t==='num') return String(n.v);
  if(n.t==='group'){ const [o,c] = BRACKET_PAIRS[groupKind(n)]; return o + exprToText(n.e) + c; }
  if(n.t==='neg') return '−' + exprToText(n.e);
  if(n.t==='pow') return exprToText(n.base) + toSup(n.exp);
  return `${exprToText(n.l)} ${OPS[n.op].symbol} ${exprToText(n.r)}`;
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
