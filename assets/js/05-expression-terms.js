/* =====================================================================
   assets/js/05-expression-terms.js — geração de 'termos' avançados usados
   dentro de expressões maiores: potência, radical, sobrescrito/
   subscrito, além de contadores de vai-um/empréstimo. (Logaritmo não é
   mais termo de expressão — virou operação standalone; ver log_basico
   em 06-skills-graph.js.)
   Depende de: 01-utils.js (U).
   Usado por: 06-skills-graph.js (geradores de exercício).
   ===================================================================== */

/* ---------- 2c. NOVOS BLOCOS/COMPOSIÇÕES (spec: raiz, potência, fração, encadeada, equação) ----------
   "Termo" = unidade de operando dentro de uma expressão maior. Cada gerador de termo devolve
   {kind, value, text, ...campos extras p/ TTS}. Operandos avançados (potência/raiz) nunca
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

