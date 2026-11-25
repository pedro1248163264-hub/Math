/* =====================================================================
   assets/js/06-tracks.js — TRILHAS e LEVELS: cada trilha é uma operação (soma,
   multiplicação, potência...) com uma escada de levels. Cada level tem:
     n     nome (PT/EN)
     goal  meta de tempo cognitivo, em ms (o "nível de calculadora humana" do level)
     tip   tática de cálculo mental do level (PT/EN)
     shape quantidade de dígitos dos operandos (só p/ testes: a forma é SEMPRE a
           mesma dentro do level — é isto que garante consistência)
     gen(m, tr) gerador: m ∈ [0,1] é a posição contínua dentro do level (0 ≈ fim do
           level anterior, 1 ≈ começo do próximo) e tr é o estado da trilha (ou null).
   Dentro de um level, m só varia coisas SUAVES (tamanho dos números dentro da mesma
   quantidade de dígitos, presença de vai-um, quais porcentagens...), nunca o nº de dígitos.
   Todos os geradores produzem respostas EXATAS (inteiras, ou decimais finitos de 1–2 casas).
   Depende de: 01-utils.js, 02-engine-constants.js, 04-operations.js,
   05-expression-terms.js; usa Engine/Store só em tempo de execução.
   Usado por: 07-storage.js, 08-speed-engine.js, 09-feedback.js, 10-progress.js, 14-ui.js.
   ===================================================================== */

/* ---------- helpers de geração ---------- */
const rr = (lo, hi)=>U.rint(lo, Math.max(lo, hi));
const mix = (lo, hi, m)=>Math.round(lo + (hi-lo)*U.clamp(m,0,1));
const digitCount = n=>String(Math.abs(Math.trunc(n))).length;
const pickLang = pair=>{
  const en = (typeof Store!=='undefined' && Store.data && Store.data.settings.appLang==='en');
  return Array.isArray(pair) ? (en && pair[1]!=null ? pair[1] : pair[0]) : pair;
};
const bucketOf = c=>c<=0 ? 'sem' : c===1 ? 'um' : 'varios';

// Soma de dois operandos, com o nº de vai-uns inclinado (peso por padrão) para o bucket
// onde a pessoa está mais lenta — sempre dentro dos buckets permitidos do level.
function addPair(pickA, pickB, tr, allowed){
  const target = tr ? Engine.weightedBucket(tr, 'carries', allowed) : null;
  let a, b, c, tries=0, fb=null, hit=false;
  do{
    a=pickA(); b=pickB(); c=countCarries(a,b); tries++;
    if(fb===null && allowed.includes(bucketOf(c))) fb=[a,b,c];
    hit = target ? bucketOf(c)===target : allowed.includes(bucketOf(c));
  } while(!hit && tries<24);
  if(!hit && fb){ [a,b,c]=fb; }
  if(Math.random()<0.5) [a,b]=[b,a];
  return {a, b, answer:a+b, features:{carries:c}};
}
function subPair(pickA, pickB, tr, allowed){
  const target = tr ? Engine.weightedBucket(tr, 'borrows', allowed) : null;
  let a, b, c, tries=0, fb=null, hit=false;
  do{
    a=pickA(); b=pickB(a); c=countBorrows(a,b); tries++;
    if(fb===null && allowed.includes(bucketOf(c))) fb=[a,b,c];
    hit = target ? bucketOf(c)===target : allowed.includes(bucketOf(c));
  } while(!hit && tries<24);
  if(!hit && fb){ [a,b,c]=fb; }
  return {a, b, answer:a-b, features:{borrows:c}};
}
// 2 dígitos ± 1 dígito: com/sem vai-um (ou empréstimo) conforme m — nunca muda o nº de dígitos.
function smallAddSub(isSub, m){
  const want = Math.random() < 0.15+0.7*m;
  let a, b, tries=0, has;
  do{
    a = isSub ? rr(12, mix(60,99,m)) : rr(11, 95); b = rr(2,9);
    has = (isSub ? countBorrows(a,b) : countCarries(a,b)) > 0; tries++;
  } while(has!==want && tries<30);
  if(!isSub && Math.random()<0.5) [a,b]=[b,a];
  const c = isSub ? countBorrows(a,b) : countCarries(a,b);
  return {a, b, answer: isSub ? a-b : a+b, features: isSub ? {borrows:c} : {carries:c}};
}

// ---- tabuada (multiplicação e divisão) com peso por dígito/linha e pares quentes ----
function multTable(tr, lo, hi, digitKey){
  const a = tr ? Engine.pickRow(tr, digitKey, lo, hi) : rr(lo,hi);
  const hot = tr ? Engine.pickHotPartner(tr, 'mult', a, lo, hi) : null;
  const b = (hot!=null && Math.random()<HOTPAIR_INJECT_CHANCE) ? hot : rr(lo,hi);
  const answer = a*b;
  const item = {a, b, answer, features:{}, pairKind:'mult', pair:[a,b], digitKey, digits:[a,b]};
  if(tr && Math.random()<REVERSE_PATH_RATE){
    const hideLeft = Math.random()<0.5, sym = OPS.multiplicacao.symbol;
    item.exprText = hideLeft ? `? ${sym} ${b} = ${answer}` : `${a} ${sym} ? = ${answer}`;
    item.answer = hideLeft ? a : b; item.isReversePath = true;
  }
  return item;
}
function divTable(tr, lo, hi){
  const divisor = tr ? Engine.pickRow(tr, 'div', lo, hi) : rr(lo,hi);
  const hot = tr ? Engine.pickHotPartner(tr, 'div', divisor, lo, hi) : null;
  const quotient = (hot!=null && Math.random()<HOTPAIR_INJECT_CHANCE) ? hot : rr(lo,hi);
  const dividend = divisor*quotient;
  const item = {a:dividend, b:divisor, answer:quotient, features:{exact:true}, pairKind:'div', pair:[divisor,quotient], digitKey:'div', digits:[divisor]};
  if(tr && Math.random()<REVERSE_PATH_RATE){
    item.exprText = `? ${OPS.divisao.symbol} ${divisor} = ${quotient}`;
    item.answer = dividend; item.isReversePath = true;
  }
  return item;
}
// divisão exata: divisor d e quociente dentro de [qLo,qHi]
function divExact(d, qLo, qHi){
  const lo = Math.max(2, qLo), q = rr(lo, Math.max(lo, qHi));
  return {a:d*q, b:d, answer:q, features:{exact:true}};
}

// ---- porcentagem ----
const pctPick = (tr, opts)=>tr ? Engine.weightedBucket(tr,'pct',opts) : U.choice(opts);
// ajusta a base (em passos de `step`) até p% dela ser inteiro — garante resposta exata
function pctExact(p, base, step=10){
  let tries=0; while((p*base)%100!==0 && tries<12){ base+=step; tries++; }
  return base;
}
function pctOriginal(m, tr){
  const opts = m<0.5 ? [10,20,50,25] : [10,20,50,25,15,5,30];
  const p = pctPick(tr, opts), aumento = m>0.5 && Math.random()<0.35;
  const k = aumento ? 100+p : 100-p;
  let orig = 10*rr(2, mix(12,40,m)), tries=0;
  while((orig*k)%100!==0 && tries<12){ orig+=10; tries++; }
  return {op:'porcentagem_original', a:orig*k/100, b:p, answer:orig, features:{pct:p, aumento}};
}
function pctVariation(m, tr){
  const opts = m<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
  const p = pctPick(tr, opts), down = Math.random()<0.5;
  const old = pctExact(p, 10*rr(2, mix(10,20,m)), 10), delta = old*p/100;
  return {op: down?'porcentagem_reducao':'porcentagem_aumento', a:old, b: down?old-delta:old+delta, answer:p, features:{pct:p}};
}
function pctSuccessive(m, tr){
  const opts = m<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
  let base, meio, final, p1, p2, ok=false, tries=0;
  while(!ok && tries<20){
    base = 10*rr(2, mix(10,40,m)); p1 = pctPick(tr,opts); p2 = pctPick(tr,opts);
    ok = (base*p1)%100===0;
    if(ok){ meio = base - base*p1/100; ok = (meio*p2)%100===0; if(ok) final = meio - meio*p2/100; }
    ok = ok && final>0; tries++;
  }
  if(!ok){ base=100; p1=10; p2=10; final=81; }
  return {op:'porcentagem_sucessiva', a:base, b:p1, c:p2, answer:final, exprText:`${base} − ${p1}% − ${p2}%`, features:{pct:p1}};
}

// ---- decimais (tudo em domínio inteiro de centésimos: a resposta é sempre exata) ----
function decVal(scale, maxInt, allowTrailing){
  let c, tries=0;
  do{ c = rr(scale, maxInt*scale + scale-1); tries++; }
  while(tries<10 && (c%scale===0 || (!allowTrailing && scale===100 && c%10===0)));
  return c;
}
function decAddSub(m, aScale, bScale, maxIntA, maxIntB){
  const aC = decVal(aScale, maxIntA, false), bC = decVal(bScale, maxIntB, false);
  const S = Math.max(aScale, bScale);
  let A = aC*(S/aScale), B = bC*(S/bScale);
  const sub = Math.random()<0.5;
  if(sub && A===B) A += S/10;          // iguais dariam 0: afasta um pouco
  let x = A, y = B;
  if(sub && A<B){ x = B; y = A; }      // minuendo sempre maior: resposta positiva
  const answer = (sub ? x-y : x+y)/S;
  return {op: sub?'subtracao':'soma', a:x/S, b:y/S, answer, features:{decimalPlaces: S===100?2:1}};
}

// ---- frações ----
function fracCmp(caseKey, m, denMax, scaleMax){
  let n1, d1, n2, d2;
  if(caseKey==='same_den'){
    d1 = d2 = rr(3, mix(6,12,m));
    n1 = rr(1, d1-1); do{ n2 = rr(1, d1-1); } while(n2===n1);
  } else if(caseKey==='same_num'){
    n1 = n2 = rr(1, mix(3,6,m));
    d1 = rr(n1+1, n1+mix(5,10,m)); do{ d2 = rr(n1+1, n1+mix(5,10,m)); } while(d2===d1);
  } else if(caseKey==='equal'){
    const q = rr(2, 6), p = rr(1, q-1), kHi = Math.max(2, Math.min(scaleMax, Math.floor(20/q)));
    const ka = rr(1, kHi); let kb = rr(1, kHi); if(kb===ka) kb = ka<kHi ? ka+1 : ka-1;
    n1=p*ka; d1=q*ka; n2=p*kb; d2=q*kb;
  } else { // cross
    const samples = m>0.55 ? 8 : 1; let best=null;
    for(let i=0;i<samples;i++){
      const dd1=rr(2,denMax), nn1=rr(1,dd1-1), dd2=rr(2,denMax), nn2=rr(1,dd2-1);
      const diff=Math.abs(nn1*dd2-nn2*dd1);
      if(diff===0) continue;
      if(!best || diff<best.diff) best={nn1,dd1,nn2,dd2,diff};
    }
    if(!best){ const dd=Math.max(3,denMax), nn=rr(1,dd-2); best={nn1:nn,dd1:dd,nn2:nn+1,dd2:dd,diff:dd}; }
    n1=best.nn1; d1=best.dd1; n2=best.nn2; d2=best.dd2;
  }
  if(Math.random()<0.5){ [n1,d1,n2,d2]=[n2,d2,n1,d1]; }
  return {op:'fracao_comparacao', a:n1, b:d1, c:n2, d:d2, answer:Math.sign(n1*d2-n2*d1),
    exprText:`${n1}/${d1}|${n2}/${d2}`, features:{case:caseKey}};
}
const fracTerm = (num, den, paren)=>({kind:'fraction', value:num/den, text: paren?`(${num}/${den})`:`${num}/${den}`, num, den});
function fracAddSub(m){
  const q = rr(2, mix(4,10,m)), opKey = U.choice(['soma','subtracao']);
  let p1, p2, answer;
  if(opKey==='soma'){ answer = rr(1, mix(2,6,m)); const total = q*answer; p1 = rr(1,total-1); p2 = total-p1; }
  else { answer = rr(1, mix(2,6,m)); p2 = rr(1, q*3); p1 = p2 + q*answer; }
  const terms = [fracTerm(p1,q), fracTerm(p2,q)];
  return {op:'fracao', terms, ops:[opKey], answer, exprText:chainText(terms,[opKey]), features:{}};
}
function fracMulDiv(m){
  const opKey = U.choice(['multiplicacao','divisao']);
  const C = rr(2, mix(4,10,m)), r = rr(2, mix(4,10,m)), A = C*r, B = rr(2, mix(5,10,m));
  let terms;
  if(opKey==='multiplicacao') terms = [fracTerm(A,B), fracTerm(B,C)];
  else terms = [fracTerm(A,B,true), fracTerm(C,B,true)];
  return {op:'fracao', terms, ops:[opKey], answer:r, exprText:chainText(terms,[opKey]), features:{}};
}

// ---- frações com resposta em fração SIMPLIFICADA ----
// `answerFrac` = {n,d} já irredutível (d=1 → resposta inteira); `answer` guarda o valor n/d só para
// os verificadores. A pessoa digita "n/d" (tecla /); fração não simplificada conta como erro.
function fracReduce(n, d){ const g = gcd2(Math.abs(n), d); return {n:n/g, d:d/g}; }
function fracItem(terms, ops, n, d, features){
  const r = fracReduce(n, d);
  return {op:'fracao', terms, ops, answer:r.n/r.d, answerFrac:r, exprText:chainText(terms, ops), features:features||{}};
}
// Fração própria irredutível n/d com d em [dLo, dHi].
function fracProper(dLo, dHi){
  for(let t=0; t<40; t++){ const d = rr(dLo, dHi), n = rr(1, d-1); if(gcd2(n,d)===1) return {n, d}; }
  return {n:1, d:Math.max(2, dLo)};
}
// Simplificar uma fração: 18/24 → 3/4 (às vezes imprópria: 18/12 → 3/2).
function fracSimplify(m){
  const dMax = mix(5,12,m), kMax = mix(3,6,m), k = rr(2, kMax);
  let n, d;
  if(m>0.3 && Math.random()<0.2){
    for(let t=0; t<40; t++){ d = rr(3, dMax); n = rr(d+1, 2*d-1); if(gcd2(n,d)===1) break; }
    if(gcd2(n,d)!==1){ n = 3; d = 2; }
  } else { const p = fracProper(3, dMax); n = p.n; d = p.d; }
  return fracItem([fracTerm(n*k, d*k)], [], n, d, {simplify:true});
}
// Mesmo denominador, mas o resultado ainda se simplifica: 7/10 + 1/10 = 8/10 = 4/5.
function fracAddSubSimplify(m){
  const opKey = U.choice(['soma','subtracao']), qHi = mix(8,16,m);
  for(let t=0; t<80; t++){
    const q = rr(4, qHi), p1 = rr(1, q-1), p2 = rr(1, q-1);
    if(opKey==='subtracao' && p1<=p2) continue;
    const s = opKey==='soma' ? p1+p2 : p1-p2;
    if(gcd2(s,q)>1) return fracItem([fracTerm(p1,q), fracTerm(p2,q)], [opKey], s, q, {simplify:true});
  }
  return fracItem([fracTerm(7,8), fracTerm(1,8)], ['subtracao'], 6, 8, {simplify:true});   // reserva: 7/8 − 1/8 = 3/4
}
// n/d de uma quantidade: 3/4 de 48 → 36.
function fracOfQty(m){
  const d = rr(2, mix(5,10,m)), n = rr(1, d-1), k = rr(2, mix(6,12,m)), total = d*k;
  return {op:'fracao', a:n, b:d, c:total, answer:n*k, exprText:`${n}/${d} de ${total}`, features:{fracOf:true}};
}
// Soma/subtração com denominadores diferentes; resultado sempre simplificado.
// kind 'multiple': um denominador é múltiplo do outro (1/2 + 1/4). kind 'other': nenhum dos dois (1/2 + 1/3).
function fracAddSubDiff(m, kind){
  const opKey = U.choice(['soma','subtracao']);
  for(let t=0; t<80; t++){
    let a, b;
    if(kind==='multiple'){
      const d1 = rr(2, mix(4,6,m)), k = rr(2, mix(2,3,m)), d2 = d1*k;
      a = fracProper(d1, d1); b = fracProper(d2, d2);
    } else {
      const d1 = rr(2, mix(4,8,m)), d2 = rr(2, mix(5,9,m));
      if(d1===d2 || d1%d2===0 || d2%d1===0) continue;
      a = fracProper(d1, d1); b = fracProper(d2, d2);
    }
    if(a.d===1 || b.d===1 || a.n/a.d===b.n/b.d) continue;
    if(Math.random()<0.5){ const x=a; a=b; b=x; }
    if(opKey==='subtracao' && a.n/a.d<=b.n/b.d){ const x=a; a=b; b=x; }
    const den = a.d*b.d/gcd2(a.d, b.d);
    const num = opKey==='soma' ? a.n*(den/a.d)+b.n*(den/b.d) : a.n*(den/a.d)-b.n*(den/b.d);
    if(num<=0) continue;
    return fracItem([fracTerm(a.n,a.d), fracTerm(b.n,b.d)], [opKey], num, den, {simplify:true});
  }
  return fracItem([fracTerm(1,2), fracTerm(1,4)], ['soma'], 3, 4, {simplify:true});
}
// Multiplicar/dividir frações com resultado simplificado: 3/4 × 2/9 = 1/6 · 5/6 ÷ 5/12 = 2.
function fracMulDivSimplify(m){
  const opKey = U.choice(['multiplicacao','divisao']), dHi = mix(5,9,m);
  for(let t=0; t<80; t++){
    const a = fracProper(3, dHi), b = fracProper(3, dHi);
    const num = opKey==='multiplicacao' ? a.n*b.n : a.n*b.d, den = opKey==='multiplicacao' ? a.d*b.d : a.d*b.n;
    const r = fracReduce(num, den);
    if(r.n===num && r.d===den && t<60) continue;   // quer algum cancelamento
    if(r.n===a.n && r.d===a.d) continue;
    const terms = opKey==='divisao' ? [fracTerm(a.n,a.d,true), fracTerm(b.n,b.d,true)] : [fracTerm(a.n,a.d), fracTerm(b.n,b.d)];
    return fracItem(terms, [opKey], num, den, {simplify:true});
  }
  return fracItem([fracTerm(3,4), fracTerm(2,9)], ['multiplicacao'], 6, 36, {simplify:true});
}

// ---- expressões ----
function opSym(k){ return OPS[k].symbol; }
function exprSimple(m, outerPool, cMax){
  const innerOp = U.choice(['soma','subtracao']), outerOp = U.choice(outerPool);
  let a = rr(2, mix(15,40,m)), b = rr(2, mix(15,40,m));
  if(innerOp==='subtracao' && a<=b){ [a,b]=[b,a]; if(a===b) a+=rr(1,5); }
  const inner = applyOp2(innerOp,a,b);
  let c = rr(2, cMax);
  if(outerOp==='subtracao' && inner<=c) c = rr(1, Math.max(1, inner-1));
  const answer = applyOp2(outerOp, inner, c);
  return {op:'expressao', a, b, c, innerOp, outerOp, answer,
    exprText:`(${a} ${opSym(innerOp)} ${b}) ${opSym(outerOp)} ${c}`, features:{}};
}
function exprChainAddSub(m){
  const n = m>0.6 ? 4 : 3;
  const hi = mix(40,99,m);
  let v = rr(20, mix(50,99,m));
  const terms = [termInt(v)], ops = [];
  for(let i=1;i<n;i++){
    let op = Math.random()<0.5 ? 'soma' : 'subtracao';
    if(op==='subtracao' && v<=12) op = 'soma';
    const x = op==='soma' ? rr(10,hi) : rr(10, Math.min(hi, v-1));
    v = applyOp2(op, v, x); terms.push(termInt(x)); ops.push(op);
  }
  return {op:'expressao_encadeada', terms, ops, answer:v, exprText:chainText(terms,ops), features:{}};
}
function exprDouble(m){
  const midOp = U.choice(['soma','subtracao','multiplicacao']);
  const hi = midOp==='multiplicacao' ? mix(8,12,m) : mix(20,60,m);
  const lo = midOp==='multiplicacao' ? 2 : 5;
  const pair = ()=>{
    const op = U.choice(['soma','subtracao']);
    let x = rr(lo,hi), y = rr(lo,hi);
    if(op==='subtracao'){ if(x===y) x = Math.min(hi+1, x+1); if(x<y) [x,y]=[y,x]; }
    return {x, y, op, val:applyOp2(op,x,y)};
  };
  let L = pair(), R = pair();
  if(midOp==='subtracao' && L.val<R.val) [L,R]=[R,L];
  const answer = applyOp2(midOp, L.val, R.val);
  return {op:'expressao', a:L.x, b:L.y, c:R.x, d:R.y, leftOp:L.op, rightOp:R.op, midOp, answer,
    exprText:`(${L.x} ${opSym(L.op)} ${L.y}) ${opSym(midOp)} (${R.x} ${opSym(R.op)} ${R.y})`, features:{}};
}
// Potências e raízes só aparecem DENTRO de expressões, de forma tranquila: quadrados de bases
// até 13, cubos de bases até 5 (e raízes quadradas exatas até √169) — o foco é a ordem das operações, não o cálculo pesado.
const POW_MAX_BASE = 13;
// Inclui cubos controlados (base 2–5) e bases negativas, para treinar a regra do sinal:
// (−3)² = 9, mas (−3)³ = −27. O enunciado sempre mostra a base negativa entre parênteses.
function gentleTerm(m, maxBase){
  const k = Math.min(POW_MAX_BASE, maxBase), r = Math.random();
  if(r<0.35) return termPower(rr(2,k),2);
  if(r<0.60) return termRoot(rr(2,k));
  if(r<0.80) return termPower((Math.random()<0.5?-1:1)*rr(2,5),3);
  return termPower(-rr(2,Math.min(k,9)),2);
}
function exprPowerChain(m){
  const k = Math.round(mix(6,POW_MAX_BASE,m));
  const pool = [
    ()=>termInt(rr(2,30)),
    ()=>gentleTerm(m,k),
    ()=>gentleTerm(m,k)
  ];
  let terms;
  do{ terms = [pool[rr(0,2)](), pool[rr(0,2)](), pool[rr(0,2)]()]; }
  while(!terms.some(t=>t.kind!=='int'));
  // O resultado PODE ser negativo (na prova haverá): a resposta é digitada com a tecla ±.
  const ops = []; let v = terms[0].value;
  for(let i=1;i<3;i++){
    const op = Math.random()<0.5 ? 'soma' : 'subtracao';
    v = applyOp2(op, v, terms[i].value); ops.push(op);
  }
  return {op:'expressao_encadeada', terms, ops, answer:v, exprText:chainText(terms,ops), features:{}};
}
// Ordem das operações: a multiplicação vem antes da soma/subtração (A ± B × C ou B × C ± A),
// com potência/raiz pequena em algum termo. O resultado pode ser negativo.
function exprOrder(m){
  const small = ()=>{ // fator de multiplicação: inteiro 2–9, quadrado de 2–5 ou √ de 4–81
    const r = Math.random();
    return r<0.5 ? termInt(rr(2,9)) : r<0.75 ? termPower(rr(2,5),2) : termRoot(rr(2,9));
  };
  const big = ()=> Math.random()<0.55 ? termInt(rr(5, Math.round(mix(25,60,m)))) : gentleTerm(m, Math.round(mix(8,POW_MAX_BASE,m)));
  let A, B, C, prodFirst, op, tries = 0;
  do{
    A = big(); B = small(); C = small(); prodFirst = Math.random()<0.5; op = Math.random()<0.5 ? 'soma' : 'subtracao';
    tries++;
  } while([A,B,C].every(t=>t.kind==='int') && tries<20);
  const prod = B.value*C.value;
  const answer = prodFirst ? applyOp2(op, prod, A.value) : applyOp2(op, A.value, prod);
  const terms = prodFirst ? [B,C,A] : [A,B,C];
  const ops = prodFirst ? ['multiplicacao', op] : [op, 'multiplicacao'];
  return {op:'expressao_encadeada', terms, ops, answer, exprText:chainText(terms,ops), features:{}};
}

// ---- expressões com grupos: sinal na frente do parêntese, × ÷ em ordem, ( ) [ ] { } e potência de grupo ----
// Contas PEQUENAS de propósito: o foco é a ESTRUTURA (sinal, ordem, aninhamento), não o cálculo
// pesado. Operandos baixos e o resultado é limitado por `cap` (rejeição por tentativas).
// Resultado sempre inteiro; divisões sempre exatas (construídas a partir do quociente).
function gcd2(a,b){ return b===0 ? a : gcd2(b, a%b); }
function treeItem(tree){
  return {op:'expressao_composta', tree, answer:exprEval(tree), exprText:exprToText(tree), features:{}};
}
// Aceita só contas em que o RESULTADO e todo OPERANDO ficam ≤ cap (nada de números gigantes mesmo
// quando a resposta é pequena, como d − [(a + b) × c] com d enorme). Sem sorte em 80 tentativas,
// devolve a menos "explosiva" que viu.
function treeGen(make, cap){
  let best = null, bestScore = Infinity;
  for(let i=0;i<80;i++){
    const it = treeItem(make());
    if(!Number.isInteger(it.answer)) continue;
    const biggest = Math.max(Math.abs(it.answer), ...(it.exprText.match(/[0-9]+/g)||['0']).map(Number));
    if(biggest<=cap) return it;
    if(biggest<bestScore){ best = it; bestScore = biggest; }
  }
  return best;
}
const pmOp = ()=>Math.random()<0.5 ? 'soma' : 'subtracao';
// Grupo ( x ± y ) com valor v ≥ 2 e operandos ≤ ~2·hi: devolve {node, v}.
function smallGroup(hi){
  const N=X.num, B=X.bin;
  if(Math.random()<0.5){ const x=rr(2,hi), y=rr(2,hi); return {node:X.group(B('soma',N(x),N(y))), v:x+y}; }
  const y=rr(2,hi), d=rr(2,hi); return {node:X.group(B('subtracao',N(y+d),N(y))), v:d};
}
// Nível 7 — sinal na frente do parêntese: a − (b + c), a − (b − c), −(3 − 8), −(b + c) + a ...
function exprSignGroup(m){
  const G=X.group, N=X.num, B=X.bin;
  const hi = mix(10,22,m), op = mix(8,14,m);
  return treeGen(()=>{
    const r = Math.random();
    if(r<0.25){ const b=rr(2,op), c=rr(2,op); return B('subtracao', N(b+c+rr(2,hi)), G(B('soma',N(b),N(c)))); }          // a − (b + c)
    if(r<0.50){ const x=rr(3,op+4), y=rr(1,x-1); return B('subtracao', N(x+rr(0,hi)), G(B('subtracao',N(x),N(y)))); }   // a − (b − c)
    if(r<0.70){ const x=rr(1,10), y=x+rr(2,10), t=G(B('subtracao',N(x),N(y)));                                          // −(3 − 8) [+ d]
      return Math.random()<0.5 ? X.neg(t) : B('soma', X.neg(t), N(rr(2,hi))); }
    if(r<0.85){ const b=rr(2,op), c=rr(2,op); return B('soma', B('subtracao', N(b+c+rr(1,hi)), G(B('soma',N(b),N(c)))), N(rr(2,hi))); } // a − (b + c) + d
    const b=rr(2,op), c=rr(2,op); return B('soma', X.neg(G(B('soma',N(b),N(c)))), N(b+c+rr(1,hi)));                     // −(b + c) + a
  }, 100);
}
// Nível 8 — × e ÷ têm a mesma prioridade (esquerda → direita) e vêm antes de + e −.
function exprDivOrder(m){
  const G=X.group, N=X.num, B=X.bin;
  const dMax = mix(6,9,m), qMax = mix(6,12,m);
  return treeGen(()=>{
    const d = rr(2,dMax), q = rr(2,qMax), r = Math.random(), quot = ()=>B('divisao', N(d*q), N(d));
    if(r<0.22) return B('multiplicacao', quot(), N(rr(2,9)));                                    // a ÷ b × c
    if(r<0.40){                                                                                  // a × b ÷ c
      const a = rr(2,12), step = d/gcd2(a,d), k = rr(Math.max(1,Math.ceil(2/step)), Math.floor(12/step));
      return B('divisao', B('multiplicacao', N(a), N(step*k)), N(d));
    }
    if(r<0.55) return B('soma', N(rr(5,mix(20,50,m))), quot());                                  // a + b ÷ c
    if(r<0.70) return B('subtracao', N(q+rr(1,mix(15,40,m))), quot());                           // a − b ÷ c
    if(r<0.85){ const a=rr(1,d*q-1); return B('divisao', G(B('soma',N(a),N(d*q-a))), N(d)); }    // (a + b) ÷ c
    return B('soma', quot(), B('multiplicacao', N(rr(2,9)), N(rr(2,9))));                        // a ÷ b + c × d
  }, 100);
}
// Nível 9 — colchetes + parênteses: [ ( ) ].
function exprBrackets(m){
  const G=X.group, N=X.num, B=X.bin;
  const iHi = mix(6,12,m), cHi = mix(3,6,m), dHi = mix(8,25,m);
  return treeGen(()=>{
    const r = Math.random(), g = smallGroup(iHi), op = pmOp();
    if(r<0.30){ const c=rr(2,cHi), prod=g.v*c, d = op==='subtracao' ? rr(2,Math.min(dHi,prod-1)) : rr(2,dHi);   // [(a ± b) × c] ± d
      return B(op, G(B('multiplicacao', g.node, N(c))), N(d)); }
    if(r<0.50){ const c=rr(2,cHi), prod=g.v*c, d = op==='subtracao' ? prod+rr(1,15) : rr(2,dHi);               // d ± [(a ± b) × c]
      return B(op, N(d), G(B('multiplicacao', g.node, N(c)))); }
    if(r<0.80){ const a = op==='subtracao' ? g.v+rr(1,dHi) : rr(2,dHi);                                        // [a ± (b ± c)] × d
      return B('multiplicacao', G(B(op, N(a), g.node)), N(rr(2,cHi))); }
    const c=rr(2,cHi), g2=smallGroup(Math.max(3,iHi-2)), left=g.v*c;                                           // [(a ± b) × c] ± (d ± e)
    return B(left>g2.v ? op : 'soma', G(B('multiplicacao', g.node, N(c))), g2.node);
  }, 100);
}
// Nível 10 — chaves + colchetes + parênteses: { [ ( ) ] }.
function exprBraces(m){
  const G=X.group, N=X.num, B=X.bin;
  const iHi = mix(5,9,m), cHi = mix(3,5,m), dHi = mix(8,20,m);
  return treeGen(()=>{
    const r = Math.random(), g = smallGroup(iHi), op = pmOp(), op2 = pmOp();
    if(r<0.35){ const c=rr(2,cHi), prod=g.v*c, d = op==='subtracao' ? rr(2,Math.min(dHi,prod-1)) : rr(2,dHi);   // {[(a ± b) × c] ± d} × e
      return B('multiplicacao', G(B(op, G(B('multiplicacao', g.node, N(c))), N(d))), N(rr(2,3))); }
    if(r<0.65){ const d=rr(2,cHi), prod=g.v*d, a = op==='subtracao' ? prod+rr(2,15) : rr(3,dHi), mid = op==='subtracao' ? a-prod : a+prod;   // {a ± [(b ± c) × d]} ± e
      return B(mid>3 ? op2 : 'soma', G(B(op, N(a), G(B('multiplicacao', g.node, N(d))))), N(mid>3 ? rr(2,Math.min(dHi,mid-1)) : rr(2,dHi))); }
    const b = op==='subtracao' ? g.v+rr(1,12) : rr(2,15), mid = op==='subtracao' ? b-g.v : b+g.v;              // {a ± [b ± (c ± d)]} × e  ou  ± e
    const a = op2==='subtracao' ? mid+rr(2,15) : rr(3,20), top = op2==='subtracao' ? a-mid : a+mid;
    const brace = G(B(op2, N(a), G(B(op, N(b), g.node))));
    return Math.random()<0.5 ? B('multiplicacao', brace, N(rr(2,3))) : B(top>3 && Math.random()<0.5 ? 'subtracao' : 'soma', brace, N(top>3 ? rr(2,Math.min(10,top-1)) : rr(2,10)));
  }, 150);
}
// Nível 11 — potência de um grupo e o sinal da base: (2 + 3)², −3² ≠ (−3)².
function exprGroupPower(m){
  const G=X.group, N=X.num, B=X.bin;
  const vMax = mix(6,10,m);
  const sq = max=>{ const v=rr(2,max);
    if(Math.random()<0.5){ const x=rr(1,v-1); return {node:G(B('soma',N(x),N(v-x))), v}; }
    const y=rr(1,9); return {node:G(B('subtracao',N(v+y),N(y))), v}; };
  return treeGen(()=>{
    const r = Math.random();
    if(r<0.22){ const g=sq(vMax), p=X.pow(g.node,2);                                             // (a ± b)² [± d]
      return Math.random()<0.5 ? p : B(pmOp(), p, N(rr(2,Math.min(20,g.v*g.v-1)))); }
    if(r<0.40){ const g=sq(Math.min(vMax,8)), op=pmOp();                                         // d ± (a ± b)²
      return B(op, N(op==='subtracao' ? g.v*g.v+rr(1,15) : rr(2,20)), X.pow(g.node,2)); }
    if(r<0.56){ const a=rr(2,mix(5,9,m)); return B('soma', X.neg(X.pow(N(a),2)), N(a*a+rr(2,25))); }   // −a² + d
    if(r<0.72){ const a=rr(2,mix(5,9,m)), p=X.pow(G(X.neg(N(a))),2);                                  // (−a)² − d  /  (−a)² + d
      return Math.random()<0.7 ? B('subtracao', p, N(rr(2,a*a-1))) : B('soma', p, N(rr(2,20))); }
    if(r<0.82){ const g=sq(3), p=X.pow(g.node,3);                                                // (a ± b)³, grupo vale 2 ou 3
      return Math.random()<0.5 ? p : B('soma', p, N(rr(2,20))); }
    const v = U.choice([4,6,8,10]), cs=[2,3,4,5,6,8,9].filter(c=>(v*v)%c===0), c=U.choice(cs);     // (a ± b)² ÷ c
    const g = (()=>{ if(Math.random()<0.5){ const x=rr(1,v-1); return G(B('soma',N(x),N(v-x))); } const y=rr(1,9); return G(B('subtracao',N(v+y),N(y))); })();
    return B('divisao', X.pow(g,2), N(c));
  }, 120);
}

// ---- contas com VÁRIAS parcelas do mesmo tipo (3 ou 4 números, mais baixos que nas contas de dois números) ----
// Mesma operação repetida (a + b + c, a − b − c, a × b × c, a ÷ b ÷ c): treina manter o parcial na cabeça
// sem misturar estilos (isso é papel das Expressões). Tudo exato e positivo; só o nº de parcelas e o tamanho variam.
function chainItem(vals, opKey, answer){
  const terms = vals.map(termInt), ops = vals.slice(1).map(()=>opKey);
  return {terms, ops, answer, exprText:chainText(terms,ops), features:{chain:true}};
}
function shuffled(arr){ const a = arr.slice(); for(let i=a.length-1;i>0;i--){ const j = rr(0,i); [a[i],a[j]] = [a[j],a[i]]; } return a; }
// número de lo..hi; com chance p vira múltiplo de 10 (ex.: 210), como numa conta de cabeça de verdade
const roundish = (lo,hi,p)=>{ const v = rr(lo,hi); return Math.random()<p ? U.clamp(Math.round(v/10)*10, lo, hi) : v; };
function addChain(n, lo, hi, p10=0){
  const vals = Array.from({length:n}, ()=>roundish(lo,hi,p10));
  return chainItem(vals, 'soma', vals.reduce((s,v)=>s+v,0));
}
// a − b − c [− d]: escolhe os que saem e o resultado e monta o primeiro número (sempre ≥ resultado mínimo, ≤ capA)
function subChain(k, subLo, subHi, resLo, resHi, capA, p10=0){
  let vals = null;
  for(let t=0;t<60 && !vals;t++){
    const subs = Array.from({length:k}, ()=>roundish(subLo,subHi,p10)), r = rr(resLo,resHi), a = r + subs.reduce((s,v)=>s+v,0);
    if(a<=capA) vals = [a, ...subs];
  }
  if(!vals){ const subs = Array.from({length:k}, ()=>subLo); vals = [resLo + subs.reduce((s,v)=>s+v,0), ...subs]; }
  return chainItem(vals, 'subtracao', vals[0] - vals.slice(1).reduce((s,v)=>s+v,0));
}
// fatores sorteados por `pick`, ordem embaralhada, produto ≤ cap
function mulChain(pick, cap, tries=80){
  let f = null;
  for(let t=0;t<tries && !f;t++){ const c = pick(); if(c.reduce((p,v)=>p*v,1)<=cap) f = c; }
  if(!f) f = pick().map(()=>2);
  f = shuffled(f);
  return chainItem(f, 'multiplicacao', f.reduce((p,v)=>p*v,1));
}
// a ÷ b ÷ c [÷ d]: parte do quociente (sempre exata em cada passo); dividendo dentro de [aLo, aHi]
function divChain(k, dLo, dHi, qLo, qHi, aLo, aHi){
  let last = null;
  for(let t=0;t<80;t++){
    const ds = Array.from({length:k}, ()=>rr(dLo,dHi)), p = ds.reduce((x,v)=>x*v,1);
    const qa = Math.max(qLo, Math.ceil(aLo/p)), qb = Math.min(qHi, Math.floor(aHi/p));
    if(qa>qb){ last = last || [qLo*p, ...ds]; continue; }
    last = [rr(qa,qb)*p, ...ds]; break;
  }
  const answer = last.slice(1).reduce((a,d)=>a/d, last[0]);
  return chainItem(last, 'divisao', answer);
}

// ---- Expressões GRANDES: mistura todos os estilos (+ − × ÷, grupos, às vezes potência) com números maiores ----
// Continuam bem menores que as contas de dois números das trilhas básicas, mas já exigem ordem das operações
// E cálculo de verdade. Construção por árvore: toda divisão é exata, nada fica negativo e nenhum passo passa de `cap`.
const MIX_PREC = {soma:1, subtracao:1, multiplicacao:2, divisao:2};
function mixWrap(child, parentOp, side){
  if(child.t!=='bin') return child;
  const cp = MIX_PREC[child.op], pp = MIX_PREC[parentOp];
  const need = cp<pp || (side==='r' && (parentOp==='divisao' || (parentOp==='subtracao' && cp<=pp) || (parentOp==='multiplicacao' && child.op==='divisao')));
  return need ? X.group(child) : child;
}
function mixLeaf(cfg, small){
  const N = X.num, B = X.bin;
  if(!small && cfg.groupPow && Math.random()<cfg.groupPow){            // (a + b)² / (a − b)²
    const v = rr(3,9), x = rr(1,v-1);
    if(v*v<=cfg.cap) return {n:X.pow(X.group(Math.random()<0.5 ? B('soma',N(x),N(v-x)) : B('subtracao',N(v+x),N(x))),2), v:v*v};
  }
  if(!small && cfg.pow && Math.random()<cfg.pow){ const a = rr(3,cfg.powMax); return {n:X.pow(N(a),2), v:a*a}; }
  const v = small ? rr(2,cfg.mulHi) : rr(cfg.lo,cfg.hi);
  return {n:N(v), v};
}
function mixBuild(k, cfg, small=false){
  if(k===0) return mixLeaf(cfg, small);
  const kl = rr(0,k-1), kr = k-1-kl, op = U.choice(cfg.ops), B = X.bin;
  let L, R;
  if(op==='divisao'){
    let d;
    if(kl===0){   // dividendo sorteado já como múltiplo do divisor, dentro da faixa de números do level
      d = rr(2,cfg.dMax);
      const q = rr(Math.max(2,Math.ceil(cfg.lo/d)), Math.max(2,Math.floor(cfg.hi/d)));
      L = {n:X.num(d*q), v:d*q};
    } else {
      L = mixBuild(kl, cfg);
      if(!L) return null;
      const ds = []; for(let x=2; x<=cfg.dMax && x<=L.v; x++) if(L.v%x===0) ds.push(x);
      if(!ds.length) return null;
      d = U.choice(ds);
    }
    R = {n:X.num(d), v:d};
    return mixPack(op, L, R, L.v/d, cfg);
  }
  const small2 = op==='multiplicacao';
  L = mixBuild(kl, cfg, small2); R = mixBuild(kr, cfg, small2);
  if(!L || !R) return null;
  if(op==='subtracao'){ if(L.v<R.v) [L,R] = [R,L]; if(L.v===R.v) return null; return mixPack(op, L, R, L.v-R.v, cfg); }
  if(op==='multiplicacao') return mixPack(op, L, R, L.v*R.v, cfg);
  return mixPack(op, L, R, L.v+R.v, cfg);
}
function mixPack(op, L, R, v, cfg){
  if(v>cfg.cap) return null;
  return {n:X.bin(op, mixWrap(L.n,op,'l'), mixWrap(R.n,op,'r')), v};
}
function mixOpsCount(n){ return n.t==='bin' ? 1+mixOpsCount(n.l)+mixOpsCount(n.r) : n.t==='group' ? mixOpsCount(n.e) : n.t==='pow' ? mixOpsCount(n.base) : 0; }
function mixKinds(n, set=new Set()){ if(n.t==='bin'){ set.add(n.op); mixKinds(n.l,set); mixKinds(n.r,set); } else if(n.t==='group') mixKinds(n.e,set); else if(n.t==='pow') mixKinds(n.base,set); return set; }
function exprMix(cfg, relax=0){
  for(let t=0;t<800;t++){
    const k = rr(cfg.kMin, cfg.kMax), r = mixBuild(k, cfg);
    if(!r) continue;
    const it = treeItem(r.n), n = mixOpsCount(r.n), d = exprDepth(r.n);
    if(!(it.answer>=2) || !Number.isInteger(it.answer)) continue;
    if(n<cfg.kMin || n>cfg.kMax || d<cfg.depMin || d>cfg.depMax) continue;
    if(mixKinds(r.n).size<cfg.minKinds || it.exprText.length>cfg.maxChars) continue;
    return it;
  }
  // raríssimo: afrouxa o teto de valor e o tamanho do texto (a estrutura exigida do level continua) antes de desistir
  if(relax<3) return exprMix(Object.assign({}, cfg, {cap:Math.round(cfg.cap*1.4), maxChars:cfg.maxChars+3}), relax+1);
  return treeItem(X.bin('soma', X.bin('multiplicacao', X.num(12), X.num(7)), X.bin('divisao', X.num(96), X.num(8))));
}
const MIX_OPS = ['soma','soma','subtracao','subtracao','multiplicacao','multiplicacao','divisao','divisao'];
// Nível 12 — sem grupos: × e ÷ antes de + e −, com números de 2 dígitos (48 + 7 × 13 − 96 ÷ 8).
function exprMixPlain(m){
  return exprMix({kMin:3, kMax:4, depMin:0, depMax:0, lo:mix(12,16,m), hi:mix(40,70,m), mulHi:mix(9,13,m), dMax:9, cap:mix(250,500,m), ops:MIX_OPS, minKinds:3, maxChars:26});
}
// Nível 13 — um nível de parênteses ((47 + 38) × 6 − 120 ÷ 8).
function exprMixParens(m){
  return exprMix({kMin:3, kMax:4, depMin:1, depMax:1, lo:12, hi:mix(50,99,m), mulHi:mix(9,15,m), dMax:12, cap:mix(500,900,m), ops:MIX_OPS, minKinds:3, maxChars:30});
}
// Nível 14 — colchetes com parênteses dentro ([(48 + 27) × 4 − 150] ÷ 6).
function exprMixBrackets(m){
  return exprMix({kMin:4, kMax:5, depMin:2, depMax:2, lo:12, hi:mix(50,99,m), mulHi:mix(9,14,m), dMax:12, cap:mix(700,1200,m), ops:MIX_OPS, minKinds:3, maxChars:34});
}
// Nível 15 — chaves, colchetes e parênteses, com quadrados e potência de grupo no meio.
function exprMixBraces(m){
  return exprMix({kMin:4, kMax:6, depMin:3, depMax:3, lo:10, hi:mix(40,90,m), mulHi:mix(8,12,m), dMax:12, cap:mix(900,1800,m), ops:MIX_OPS, minKinds:3, maxChars:38, pow:0.15, powMax:12, groupPow:0.1});
}

// ---- equações ----
function eqText(a,b,c,d){
  const left = fmtCoefTerm(a) + (b!==0 ? ` ${b>0?'+':'−'} ${Math.abs(b)}` : '');
  const right = c!==0 ? (fmtCoefTerm(c) + (d!==0 ? ` ${d>0?'+':'−'} ${Math.abs(d)}` : '')) : `${d}`;
  return `${left} = ${right}`;
}
function eqItem(a,b,c,d,x){
  return {op:'equacao', a,b,c,d, answer:x, exprText:eqText(a,b,c,d), features:{}, isEquation:true};
}

// Equações com formas além de ax + b = cx + d: cada lado é uma lista de segmentos —
// texto puro ("2(x + 4)", " + 8") ou fração {n,d} (n e d são textos: "x", "x + 4", "3").
// A tela, a voz e o teste usam a mesma lista; `exprText` é o texto linear (só para repetição/teste).
const segText = sg=>typeof sg==='string' ? sg : ((/[ +−]/.test(sg.n) ? `(${sg.n})` : sg.n) + '/' + sg.d);
const sideText = side=>side.map(segText).join('');
function eqItemX(L, R, x){
  return {op:'equacao', eqL:L, eqR:R, answer:x, exprText:`${sideText(L)} = ${sideText(R)}`, features:{}, isEquation:true};
}
const sgn = v=>v<0 ? '−' : '+';
// x/a ± b = c  (ex.: x/3 + 8 = 15 · x/4 = 6)
function eqDivConst(m){
  const a = rr(2, mix(5,10,m)), k = rr(2, mix(6,12,m)), x = a*k;
  let b = Math.random()<0.3 ? 0 : rr(1, mix(9,30,m));
  let plus = Math.random()<0.5;
  if(!plus && k-b<1) plus = true;
  const c = plus ? k+b : k-b;
  return eqItemX([{n:'x', d:String(a)}].concat(b ? [` ${plus?'+':'−'} ${b}`] : []), [String(c)], x);
}
// a(x + b) = c  (ex.: 2(x + 4) = 26)
function eqParenConst(m){
  const a = rr(2, mix(4,9,m)), x = rr(2, mix(9,20,m));
  let b = rr(1, mix(6,15,m))*(Math.random()<0.5 ? 1 : -1);
  if(x+b<=0) b = -b;
  return eqItemX([`${a}(x ${sgn(b)} ${Math.abs(b)})`], [String(a*(x+b))], x);
}
// (x + b)/a = c  (ex.: (x + 4)/3 = 7)
function eqFracParen(m){
  const a = rr(2, mix(5,9,m)), c = rr(2, mix(6,12,m)), x = rr(2, mix(9,25,m));
  let b = a*c - x;
  if(b===0) return eqFracParen(m);
  if(Math.abs(b)>mix(30,60,m)) return eqFracParen(m);
  return eqItemX([{n:`x ${sgn(b)} ${Math.abs(b)}`, d:String(a)}], [String(c)], x);
}
// proporção x/a = b/c, com x inteiro  (ex.: x/4 = 9/6 → x = 6)
function eqProportion(m){
  for(let t=0; t<60; t++){
    const q = rr(2, mix(4,6,m)), p = rr(2, mix(5,9,m)), u = rr(2, mix(3,5,m)), v = rr(1, mix(3,6,m));
    if(p===q || gcd2(p,q)!==1) continue;
    const a = q*v, b = p*u, c = q*u;
    if(a<2) continue;
    return eqItemX([{n:'x', d:String(a)}], [{n:String(b), d:String(c)}], p*v);
  }
  return eqItemX([{n:'x', d:'4'}], [{n:'9', d:'6'}], 6);
}
// a(x + b) = cx + d  (ex.: 2(x + 1) = x + 9)
function eqParenBoth(m){
  for(let t=0; t<60; t++){
    const a = rr(3, mix(5,9,m)), c = rr(1, a-1), x = rr(2, mix(8,15,m));
    const b = rr(1, mix(6,12,m))*(Math.random()<0.35 ? -1 : 1);
    const d = (a-c)*x + a*b;
    if(d===0 || x+b<=0 || Math.abs(d)>150) continue;
    return eqItemX([`${a}(x ${sgn(b)} ${Math.abs(b)})`], [`${c===1?'':c}x ${sgn(d)} ${Math.abs(d)}`], x);
  }
  return eqItemX(['3(x + 2)'], ['x + 12'], 3);
}

/* ---------- as trilhas ---------- */
const TRACKS = {
  soma:{ sym:'+', color:'#22C55E', op:'soma', label:['Soma','Addition'], levels:[
    {n:['Unidades','Single digits'], goal:1000, shape:[1,1],
     tip:['Complete a dezena: 8 + 5 → 8 + 2 = 10, mais 3 = 13.','Make ten: 8 + 5 → 8 + 2 = 10, plus 3 = 13.'],
     gen(m,tr){ const hi=mix(6,9,m), a=rr(2,hi), b=rr(2,hi); return {a,b,answer:a+b,features:{carries:countCarries(a,b)}}; }},
    {n:['2 dígitos + 1 dígito','2 digits + 1 digit'], goal:1400, shape:[2,1],
     tip:['Complete a dezena primeiro: 47 + 5 → 47 + 3 = 50, depois + 2 = 52.','Reach the next ten first: 47 + 5 → 47 + 3 = 50, then + 2 = 52.'],
     gen(m,tr){ return smallAddSub(false,m); }},
    {n:['2 dígitos + 2 dígitos','2 digits + 2 digits'], goal:1800, shape:[2,2],
     tip:['Some as dezenas e depois as unidades: 32 + 45 → 70 + 7 = 77.','Add tens, then units: 32 + 45 → 70 + 7 = 77.'],
     gen(m,tr){ const maxT=mix(3,8,m), aT=rr(1,maxT), bT=rr(1,Math.max(1,9-aT)), aU=rr(0,9), bU=rr(0,9-aU);
       let a=aT*10+aU, b=bT*10+bU; if(Math.random()<0.5)[a,b]=[b,a]; return {a,b,answer:a+b,features:{carries:0}}; }},
    {n:['2 dígitos + 2 dígitos (vai-um)','2 digits + 2 digits (carrying)'], goal:2400, shape:[2,2],
     tip:['Compense: 47 + 38 → 47 + 40 − 2 = 85.','Round and compensate: 47 + 38 → 47 + 40 − 2 = 85.'],
     gen(m,tr){ const hi=mix(40,99,m); return addPair(()=>rr(10,hi), ()=>rr(10,hi), tr, ['um','varios']); }},
    {n:['3 números de 2 dígitos','3 numbers, 2 digits'], goal:2800, shape:null,
     tip:['Junte dois e some o terceiro, sem recomeçar: 47 + 38 + 26 → 85, depois 85 + 26 = 111. Procure pares que fecham dezena.','Combine two, then add the third without restarting: 47 + 38 + 26 → 85, then 85 + 26 = 111. Look for pairs that make a ten.'],
     gen(m,tr){ return addChain(3, 11, mix(45,99,m)); }},
    {n:['3 dígitos + 2 dígitos','3 digits + 2 digits'], goal:3000, shape:[3,2],
     tip:['Da esquerda para a direita: 482 + 67 → 482 + 60 = 542, + 7 = 549.','Left to right: 482 + 67 → 482 + 60 = 542, + 7 = 549.'],
     gen(m,tr){ const hi=mix(300,999,m); return addPair(()=>rr(100,hi), ()=>rr(11,99), tr, ['sem','um','varios']); }},
    {n:['3 dígitos + 3 dígitos','3 digits + 3 digits'], goal:3800, shape:[3,3],
     tip:['Quebre o segundo número: 482 + 359 → 482 + 300 = 782, + 50 = 832, + 9 = 841.','Split the second number: 482 + 359 → 482 + 300 = 782, + 50 = 832, + 9 = 841.'],
     gen(m,tr){ const hi=mix(400,999,m); return addPair(()=>rr(100,hi), ()=>rr(100,hi), tr, ['sem','um','varios']); }},
    {n:['3 números de 3 dígitos','3 numbers, 3 digits'], goal:4600, shape:null,
     tip:['Centenas, dezenas e unidades de todos juntos: 384 + 278 + 210 → 300 + 200 + 200 = 700; 80 + 70 + 10 = 160; 4 + 8 = 12 → 872.','Hundreds, tens and units of all of them together: 384 + 278 + 210 → 300 + 200 + 200 = 700; 80 + 70 + 10 = 160; 4 + 8 = 12 → 872.'],
     gen(m,tr){ return addChain(3, 100, mix(400,999,m), 0.2); }},
    {n:['4 dígitos + 3 dígitos','4 digits + 3 digits'], goal:4800, shape:[4,3],
     tip:['Some por casas sem recomeçar: 4821 + 356 → 4821 + 300 = 5121, + 56 = 5177.','Add place by place: 4821 + 356 → 4821 + 300 = 5121, + 56 = 5177.'],
     gen(m,tr){ const hi=mix(3000,9999,m); return addPair(()=>rr(1000,hi), ()=>rr(100,999), tr, ['sem','um','varios']); }},
    {n:['4 dígitos + 4 dígitos','4 digits + 4 digits'], goal:5800, shape:[4,4],
     tip:['Milhar, centena, dezena e unidade em sequência, mantendo o total parcial na cabeça.','Thousands, hundreds, tens, units in sequence, holding the running total.'],
     gen(m,tr){ const hi=mix(4000,9999,m); return addPair(()=>rr(1000,hi), ()=>rr(1000,hi), tr, ['sem','um','varios']); }},
    {n:['4 números de 3 dígitos','4 numbers, 3 digits'], goal:6800, shape:null,
     tip:['Acumule e arredonde: 384 + 278 + 398 + 210 → 384 + 278 = 662; 662 + 398 → 662 + 400 − 2 = 1060; + 210 = 1270.','Accumulate and round: 384 + 278 + 398 + 210 → 384 + 278 = 662; 662 + 398 → 662 + 400 − 2 = 1060; + 210 = 1270.'],
     gen(m,tr){ return addChain(4, 100, mix(400,999,m), 0.25); }},
  ]},

  subtracao:{ sym:'−', color:'#F59E0B', op:'subtracao', label:['Subtração','Subtraction'], levels:[
    {n:['Unidades','Single digits'], goal:1100, shape:[1,1],
     tip:['Pense no que falta: 9 − 4 → 4 + ? = 9.','Think what is missing: 9 − 4 → 4 + ? = 9.'],
     gen(m,tr){ const a=rr(3,mix(7,9,m)), b=rr(1,a-1); return {a,b,answer:a-b,features:{borrows:0}}; }},
    {n:['2 dígitos − 1 dígito','2 digits − 1 digit'], goal:1500, shape:[2,1],
     tip:['Passe pela dezena: 52 − 7 → 52 − 2 = 50, − 5 = 45.','Go through the ten: 52 − 7 → 52 − 2 = 50, − 5 = 45.'],
     gen(m,tr){ return smallAddSub(true,m); }},
    {n:['2 dígitos − 2 dígitos','2 digits − 2 digits'], goal:2000, shape:[2,2],
     tip:['Subtraia dezenas e unidades em separado: 68 − 25 → 68 − 20 = 48, − 5 = 43.','Subtract tens and units separately: 68 − 25 → 68 − 20 = 48, − 5 = 43.'],
     gen(m,tr){ const aT=rr(2,mix(4,9,m)), bT=rr(1,aT-1), aU=rr(0,9), bU=rr(0,aU);
       return {a:aT*10+aU, b:bT*10+bU, answer:(aT-bT)*10+(aU-bU), features:{borrows:0}}; }},
    {n:['2 dígitos − 2 dígitos (empréstimo)','2 digits − 2 digits (borrowing)'], goal:2600, shape:[2,2],
     tip:['Compense: 82 − 38 → 82 − 40 + 2 = 44.','Round and compensate: 82 − 38 → 82 − 40 + 2 = 44.'],
     gen(m,tr){ const hi=mix(50,99,m); return subPair(()=>rr(21,hi), a=>rr(11,a-1), tr, ['um']); }},
    {n:['3 números de 2 dígitos (a − b − c)','3 numbers, 2 digits (a − b − c)'], goal:3000, shape:null,
     tip:['Some o que sai e tire de uma vez: 95 − 28 − 17 → 28 + 17 = 45, 95 − 45 = 50. Ou tire um de cada vez, sem recomeçar.','Add what is taken away and subtract once: 95 − 28 − 17 → 28 + 17 = 45, 95 − 45 = 50. Or subtract one at a time without restarting.'],
     gen(m,tr){ return subChain(2, 11, mix(22,35,m), 5, mix(25,45,m), 99); }},
    {n:['3 dígitos − 2 dígitos','3 digits − 2 digits'], goal:3300, shape:[3,2],
     tip:['Tire o segundo em partes: 543 − 67 → 543 − 60 = 483, − 7 = 476.','Take the second number in parts: 543 − 67 → 543 − 60 = 483, − 7 = 476.'],
     gen(m,tr){ const hi=mix(300,999,m); return subPair(()=>rr(100,hi), a=>rr(11,99), tr, ['sem','um','varios']); }},
    {n:['3 dígitos − 3 dígitos','3 digits − 3 digits'], goal:4200, shape:[3,3],
     tip:['Compense na centena: 742 − 398 → 742 − 400 + 2 = 344.','Compensate at the hundred: 742 − 398 → 742 − 400 + 2 = 344.'],
     gen(m,tr){ const hi=mix(500,999,m); return subPair(()=>rr(200,hi), a=>rr(100,a-1), tr, ['sem','um','varios']); }},
    {n:['3 números de 3 dígitos (a − b − c)','3 numbers, 3 digits (a − b − c)'], goal:4600, shape:null,
     tip:['Some o que sai e subtraia uma vez só: 842 − 265 − 198 → 265 + 198 = 463, 842 − 463 = 379.','Add what is taken away and subtract once: 842 − 265 − 198 → 265 + 198 = 463, 842 − 463 = 379.'],
     gen(m,tr){ return subChain(2, 40, mix(150,380,m), 20, mix(150,300,m), 999, 0.2); }},
    {n:['4 dígitos − 3 dígitos','4 digits − 3 digits'], goal:5200, shape:[4,3],
     tip:['Arredonde e ajuste: 5210 − 387 → 5210 − 400 + 13 = 4823.','Round and adjust: 5210 − 387 → 5210 − 400 + 13 = 4823.'],
     gen(m,tr){ const hi=mix(3000,9999,m); return subPair(()=>rr(1000,hi), a=>rr(100,999), tr, ['sem','um','varios']); }},
    {n:['4 dígitos − 4 dígitos','4 digits − 4 digits'], goal:6300, shape:[4,4],
     tip:['Vá ao múltiplo de 1000 ou 100 mais próximo e ajuste no fim.','Go to the nearest multiple of 1000 or 100, then adjust at the end.'],
     gen(m,tr){ const hi=mix(5000,9999,m); return subPair(()=>rr(2000,hi), a=>rr(1000,a-1), tr, ['sem','um','varios']); }},
    {n:['4 números (a − b − c − d)','4 numbers (a − b − c − d)'], goal:7200, shape:null,
     tip:['Some tudo o que sai e tire de uma vez: 1250 − 384 − 278 − 210 → 384 + 278 + 210 = 872; 1250 − 872 = 378.','Add everything that is taken away and subtract once: 1250 − 384 − 278 − 210 → 384 + 278 + 210 = 872; 1250 − 872 = 378.'],
     gen(m,tr){ return subChain(3, 30, mix(120,260,m), 20, mix(100,250,m), 1999, 0.25); }},
  ]},

  multiplicacao:{ sym:'×', color:'#6366F1', op:'multiplicacao', label:['Multiplicação','Multiplication'], levels:[
    {n:['Tabuada do 2 ao 5','Times table 2–5'], goal:1000, shape:[1,1],
     tip:['Âncoras: 5 × n é metade de 10 × n; 2 × n é o dobro de n.','Anchors: 5 × n is half of 10 × n; 2 × n is double n.'],
     gen(m,tr){ return multTable(tr,2,5,'mult'); }},
    {n:['Tabuada do 2 ao 9','Times table 2–9'], goal:1500, shape:[1,1],
     tip:['9 × n = 10 × n − n. Para 7 × 8 lembre da sequência 5-6-7-8 → 56 = 7 × 8.','9 × n = 10 × n − n. For 7 × 8 remember the run 5-6-7-8 → 56 = 7 × 8.'],
     gen(m,tr){ return multTable(tr,2,mix(7,9,m),'mult'); }},
    {n:['3 fatores de 1 dígito','3 single-digit factors'], goal:2000, shape:null,
     tip:['Agrupe o que fecha número redondo: 4 × 7 × 5 → 4 × 5 = 20, depois 20 × 7 = 140. Com 4 fatores, resolva dois a dois.','Group what makes a round number: 4 × 7 × 5 → 4 × 5 = 20, then 20 × 7 = 140. With 4 factors, go two by two.'],
     gen(m,tr){ const hi=mix(5,9,m), n=(m>0.6 && Math.random()<0.35)?4:3; return mulChain(()=>Array.from({length:n},()=>rr(2,hi)), 720); }},
    {n:['11 a 19 × 1 dígito','11–19 × 1 digit'], goal:2200, shape:[2,1],
     tip:['Decomponha: 14 × 6 → 10 × 6 + 4 × 6 = 60 + 24 = 84.','Split: 14 × 6 → 10 × 6 + 4 × 6 = 60 + 24 = 84.'],
     gen(m,tr){ const hi=mix(13,19,m), a=tr?Engine.pickRow(tr,'mult11',11,hi):rr(11,hi), b=rr(2,9);
       return {a,b,answer:a*b,features:{},digitKey:'mult11',digits:[a]}; }},
    {n:['2 dígitos × 1 dígito','2 digits × 1 digit'], goal:2800, shape:[2,1],
     tip:['Decomponha o maior: 47 × 6 → 40 × 6 + 7 × 6 = 240 + 42 = 282.','Split the larger: 47 × 6 → 40 × 6 + 7 × 6 = 240 + 42 = 282.'],
     gen(m,tr){ const a=rr(21,mix(49,99,m)), b=rr(2,9); return {a,b,answer:a*b,features:{}}; }},
    {n:['3 fatores com dezena redonda','3 factors with a round ten'], goal:3400, shape:null,
     tip:['20 × 3 × 15 → 20 × 3 = 60 e 60 × 15 = 900; ou 20 × 15 = 300 e 300 × 3 = 900. Una primeiro os fatores que dão número redondo (25 × 4, 20 × 5).','20 × 3 × 15 → 20 × 3 = 60 and 60 × 15 = 900; or 20 × 15 = 300 and 300 × 3 = 900. Pair first the factors that make a round number (25 × 4, 20 × 5).'],
     gen(m,tr){ return mulChain(()=>[U.choice([10,20,25,30,40,50]), rr(2,9), rr(11,mix(15,19,m))], mix(1500,3200,m)); }},
    {n:['11 a 19 × 11 a 19','11–19 × 11–19'], goal:3800, shape:[2,2],
     tip:['13 × 17 → 13 × 10 + 13 × 7 = 130 + 91 = 221.','13 × 17 → 13 × 10 + 13 × 7 = 130 + 91 = 221.'],
     gen(m,tr){ const hi=mix(14,19,m), a=rr(11,hi), b=rr(11,hi); return {a,b,answer:a*b,features:{}}; }},
    {n:['2 dígitos × 2 dígitos','2 digits × 2 digits'], goal:5000, shape:[2,2],
     tip:['Decomponha o segundo fator: 36 × 24 → 36 × 20 + 36 × 4 = 720 + 144 = 864.','Split the second factor: 36 × 24 → 36 × 20 + 36 × 4 = 720 + 144 = 864.'],
     gen(m,tr){ const a=rr(21,mix(49,99,m)), b=rr(11,mix(29,99,m)); return {a,b,answer:a*b,features:{}}; }},
    {n:['3 dígitos × 1 dígito','3 digits × 1 digit'], goal:5500, shape:[3,1],
     tip:['Centenas, dezenas, unidades: 327 × 4 → 1200 + 80 + 28 = 1308.','Hundreds, tens, units: 327 × 4 → 1200 + 80 + 28 = 1308.'],
     gen(m,tr){ const a=rr(101,mix(300,999,m)), b=rr(2,9); return {a,b,answer:a*b,features:{}}; }},
    {n:['3 dígitos × 2 dígitos','3 digits × 2 digits'], goal:9000, shape:[3,2],
     tip:['Quebre o de 2 dígitos: 327 × 24 → 327 × 20 + 327 × 4 = 6540 + 1308 = 7848.','Split the 2-digit factor: 327 × 24 → 327 × 20 + 327 × 4 = 6540 + 1308 = 7848.'],
     gen(m,tr){ const a=rr(101,mix(300,999,m)), b=rr(11,mix(30,99,m)); return {a,b,answer:a*b,features:{}}; }},
    {n:['3 fatores de até 2 dígitos','3 factors up to 2 digits'], goal:9500, shape:null,
     tip:['14 × 15 × 6 → 14 × 15 = 210, depois 210 × 6 = 1260. Comece pelo par mais fácil e deixe o fator pequeno para o fim.','14 × 15 × 6 → 14 × 15 = 210, then 210 × 6 = 1260. Start with the easiest pair and leave the small factor for last.'],
     gen(m,tr){ return mulChain(()=>[rr(11,mix(19,35,m)), rr(11,mix(15,25,m)), rr(3,9)], mix(3000,9000,m)); }},
  ]},

  divisao:{ sym:'÷', color:'#EC4899', op:'divisao', label:['Divisão','Division'], levels:[
    {n:['Tabuada do 2 ao 5','Times table 2–5'], goal:1200, shape:null,
     tip:['Pense na tabuada ao contrário: 20 ÷ 4 → 4 × ? = 20.','Think of the times table backwards: 20 ÷ 4 → 4 × ? = 20.'],
     gen(m,tr){ return divTable(tr,2,5); }},
    {n:['Tabuada do 2 ao 9','Times table 2–9'], goal:1800, shape:null,
     tip:['Procure o número que multiplicado pelo divisor dá o dividendo: 56 ÷ 7 → 7 × 8.','Find the number that times the divisor gives the dividend: 56 ÷ 7 → 7 × 8.'],
     gen(m,tr){ return divTable(tr,2,mix(7,9,m)); }},
    {n:['Duas divisões na tabuada','Two divisions, times table'], goal:2400, shape:null,
     tip:['72 ÷ 3 ÷ 4 → 72 ÷ 3 = 24, depois 24 ÷ 4 = 6. Dividir por 3 e depois por 4 é o mesmo que dividir por 12 de uma vez.','72 ÷ 3 ÷ 4 → 72 ÷ 3 = 24, then 24 ÷ 4 = 6. Dividing by 3 and then by 4 is the same as dividing by 12.'],
     gen(m,tr){ return divChain(2, 2, mix(4,9,m), 2, mix(5,9,m), 24, mix(200,500,m)); }},
    {n:['2 dígitos ÷ 1 dígito','2 digits ÷ 1 digit'], goal:2800, shape:[2,1],
     tip:['Divida em partes: 84 ÷ 4 → 80 ÷ 4 + 4 ÷ 4 = 20 + 1 = 21.','Divide in parts: 84 ÷ 4 → 80 ÷ 4 + 4 ÷ 4 = 20 + 1 = 21.'],
     gen(m,tr){ const d=tr?Engine.pickRow(tr,'div',2,9):rr(2,9);
       const it=divExact(d, Math.ceil(12/d), Math.floor(mix(60,99,m)/d)); it.digitKey='div'; it.digits=[d]; return it; }},
    {n:['3 dígitos ÷ 1 dígito','3 digits ÷ 1 digit'], goal:3800, shape:[3,1],
     tip:['Divida por casas: 672 ÷ 4 → 600 ÷ 4 + 72 ÷ 4 = 150 + 18 = 168.','Divide by place: 672 ÷ 4 → 600 ÷ 4 + 72 ÷ 4 = 150 + 18 = 168.'],
     gen(m,tr){ const d=tr?Engine.pickRow(tr,'div',2,9):rr(2,9);
       const it=divExact(d, Math.ceil(100/d), Math.floor(mix(300,999,m)/d)); it.digitKey='div'; it.digits=[d]; return it; }},
    {n:['3 dígitos ÷ 1 dígito ÷ 1 dígito','3 digits ÷ 1 digit ÷ 1 digit'], goal:4400, shape:null,
     tip:['840 ÷ 4 ÷ 3 → 840 ÷ 4 = 210, depois 210 ÷ 3 = 70. Comece pelo divisor que deixa a conta mais redonda.','840 ÷ 4 ÷ 3 → 840 ÷ 4 = 210, then 210 ÷ 3 = 70. Start with the divisor that leaves the roundest number.'],
     gen(m,tr){ return divChain(2, 2, 9, 3, 99, 100, mix(400,999,m)); }},
    {n:['3 dígitos ÷ 2 dígitos','3 digits ÷ 2 digits'], goal:5000, shape:[3,2],
     tip:['Estime e ajuste: 345 ÷ 15 → 15 × 20 = 300; sobram 45 = 15 × 3 → 23.','Estimate and adjust: 345 ÷ 15 → 15 × 20 = 300; 45 left = 15 × 3 → 23.'],
     gen(m,tr){ const d=rr(11,mix(15,25,m)); return divExact(d, Math.max(4,Math.ceil(100/d)), Math.floor(mix(400,999,m)/d)); }},
    {n:['4 dígitos ÷ 1 dígito','4 digits ÷ 1 digit'], goal:6000, shape:[4,1],
     tip:['Divida em blocos redondos: 3528 ÷ 7 → 3500 ÷ 7 + 28 ÷ 7 = 500 + 4 = 504.','Divide in round chunks: 3528 ÷ 7 → 3500 ÷ 7 + 28 ÷ 7 = 500 + 4 = 504.'],
     gen(m,tr){ const d=tr?Engine.pickRow(tr,'div',2,9):rr(2,9);
       const it=divExact(d, Math.ceil(1000/d), Math.floor(mix(3000,9999,m)/d)); it.digitKey='div'; it.digits=[d]; return it; }},
    {n:['4 dígitos em 3 divisões','4 digits, 3 divisions'], goal:7000, shape:null,
     tip:['2520 ÷ 3 ÷ 4 ÷ 5 → 2520 ÷ 3 = 840; 840 ÷ 4 = 210; 210 ÷ 5 = 42. Um passo de cada vez, sempre com o número menor.','2520 ÷ 3 ÷ 4 ÷ 5 → 2520 ÷ 3 = 840; 840 ÷ 4 = 210; 210 ÷ 5 = 42. One step at a time, always with the smaller number.'],
     gen(m,tr){ return divChain(3, 2, 9, 2, 99, 1000, mix(3000,9999,m)); }},
  ]},

  porcentagem:{ sym:'%', color:'#F97316', op:'porcentagem', label:['Porcentagem','Percentages'], levels:[
    {n:['10% e 50%','10% and 50%'], goal:1800, shape:null,
     tip:['10% = mover a vírgula uma casa. 50% = metade.','10% = move the decimal point one place. 50% = half.'],
     gen(m,tr){ const p=pctPick(tr,[10,50]), base=pctExact(p,10*rr(2,mix(10,20,m)),10);
       return {op:'porcentagem',a:p,b:base,answer:p*base/100,features:{pct:p}}; }},
    {n:['10%, 20%, 25%, 50% e 75%','10%, 20%, 25%, 50% and 75%'], goal:2400, shape:null,
     tip:['25% = metade da metade. 20% = 10% × 2. 75% = 100% − 25%.','25% = half of half. 20% = 10% × 2. 75% = 100% − 25%.'],
     gen(m,tr){ const p=pctPick(tr,[10,20,25,50,75]), base=pctExact(p,10*rr(2,mix(15,30,m)),10);
       return {op:'porcentagem',a:p,b:base,answer:p*base/100,features:{pct:p}}; }},
    {n:['5%, 15%, 30%, 35%, 40%, 60%','5%, 15%, 30%, 35%, 40%, 60%'], goal:3000, shape:null,
     tip:['Monte por partes: 15% = 10% + 5% (5% é a metade de 10%).','Build it in parts: 15% = 10% + 5% (5% is half of 10%).'],
     gen(m,tr){ const p=pctPick(tr,[5,15,30,40,60,35]), base=pctExact(p,10*rr(4,mix(20,40,m)),10);
       return {op:'porcentagem',a:p,b:base,answer:p*base/100,features:{pct:p}}; }},
    {n:['Desconto e acréscimo','Discounts and markups'], goal:3600, shape:null,
     tip:['Desconto de p% = ficar com (100 − p)%. 80 − 15% → 80 − 12 = 68.','A p% discount = keeping (100 − p)%. 80 − 15% → 80 − 12 = 68.'],
     gen(m,tr){ const opts=m<0.4?[10,20,25,50]:[10,20,25,50,15,5,30], p=pctPick(tr,opts), down=Math.random()<0.5;
       const base=pctExact(p,10*rr(2,mix(15,50,m)),10), amt=base*p/100;
       return {op:down?'porcentagem_desconto':'porcentagem_acrescimo',a:base,b:p,answer:down?base-amt:base+amt,features:{pct:p}}; }},
    {n:['"É quantos %?"','"What % is it?"'], goal:4000, shape:null,
     tip:['Parte ÷ base × 100: 20 é quantos % de 80 → 20/80 = 1/4 = 25%.','Part ÷ base × 100: 20 is what % of 80 → 20/80 = 1/4 = 25%.'],
     gen(m,tr){ const opts=m<0.4?[10,20,25,50]:[10,20,25,50,5,15,75,30], p=pctPick(tr,opts), base=pctExact(p,10*rr(2,mix(10,30,m)),10);
       return {op:'porcentagem_inversa',a:p*base/100,b:base,answer:p,features:{pct:p}}; }},
    {n:['Valor original, variação e descontos sucessivos','Original value, change and successive discounts'], goal:5500, shape:null,
     tip:['Para desfazer um desconto, divida: x − 20% = 80 → x = 80 ÷ 0,8 = 100. Variação % sempre usa o valor INICIAL.','To undo a discount, divide: x − 20% = 80 → x = 80 ÷ 0.8 = 100. Percentage change always uses the INITIAL value.'],
     gen(m,tr){ const r=Math.random(); return r<0.34 ? pctOriginal(m,tr) : r<0.67 ? pctVariation(m,tr) : pctSuccessive(m,tr); }}
  ]},

  decimais:{ sym:',', color:'#14B8A6', op:'soma', label:['Contas com vírgula','Decimals'], levels:[
    {n:['Soma e subtração, 1 casa','Add/subtract, 1 decimal'], goal:2000, shape:null,
     tip:['Ignore a vírgula, calcule como inteiros e reposicione a vírgula.','Ignore the decimal point, calculate as whole numbers, then reposition it.'],
     gen(m,tr){ return decAddSub(m,10,10,mix(3,9,m),mix(3,9,m)); }},
    {n:['Soma e subtração, 2 casas','Add/subtract, 2 decimals'], goal:2800, shape:null,
     tip:['Alinhe as casas: 2,35 + 4,6 → 2,35 + 4,60.','Line up the places: 2.35 + 4.6 → 2.35 + 4.60.'],
     gen(m,tr){ return decAddSub(m,100,100,mix(3,9,m),mix(3,9,m)); }},
    {n:['Casas diferentes (1 e 2)','Mixed places (1 and 2)'], goal:3600, shape:null,
     tip:['Alinhe as casas: 12,5 + 3,75 → 12,50 + 3,75 = 16,25.','Line up the places: 12.5 + 3.75 → 12.50 + 3.75 = 16.25.'],
     gen(m,tr){ return Math.random()<0.5 ? decAddSub(m,10,100,mix(9,49,m),mix(3,9,m)) : decAddSub(m,100,10,mix(3,9,m),mix(9,49,m)); }},
    {n:['Decimal × inteiro','Decimal × integer'], goal:3000, shape:null,
     tip:['Multiplique como inteiros e reponha a vírgula: 3,4 × 6 → 34 × 6 = 204 → 20,4.','Multiply as integers and put the point back: 3.4 × 6 → 34 × 6 = 204 → 20.4.'],
     gen(m,tr){ const aC=decVal(10,mix(5,9,m),false), b=rr(2,9);
       return {op:'multiplicacao',a:aC/10,b,answer:(aC*b)/10,features:{decimalPlaces:1}}; }},
    {n:['Multiplicação e divisão por inteiro','Multiply and divide by an integer'], goal:4200, shape:null,
     tip:['Divida como inteiros e posicione a vírgula: 7,2 ÷ 4 → 72 ÷ 4 = 18 → 1,8.','Divide as integers and place the point: 7.2 ÷ 4 → 72 ÷ 4 = 18 → 1.8.'],
     gen(m,tr){ const dp=tr?Engine.weightedBucket(tr,'decimalPlaces',[1,2]):(Math.random()<0.5?1:2), sc=dp===2?100:10;
       if(Math.random()<0.5){ const aC=decVal(sc,mix(3,9,m),false), b=rr(2,9);
         return {op:'multiplicacao',a:aC/sc,b,answer:(aC*b)/sc,features:{decimalPlaces:dp}}; }
       const d=rr(2,9), qC=decVal(sc,mix(3,9,m),false);
       return {op:'divisao',a:(qC*d)/sc,b:d,answer:qC/sc,features:{decimalPlaces:dp,exact:true}}; }},
    {n:['Decimal × decimal','Decimal × decimal'], goal:5500, shape:null,
     tip:['Conte as casas: 0,6 × 0,7 → 6 × 7 = 42, com 2 casas → 0,42.','Count the places: 0.6 × 0.7 → 6 × 7 = 42, with 2 places → 0.42.'],
     gen(m,tr){ let aC, bC, t=0; do{ aC=rr(2,mix(29,99,m)); bC=rr(2,mix(9,59,m)); t++; }while(t<10 && (aC%10===0 || bC%10===0));
       return {op:'multiplicacao',a:aC/10,b:bC/10,answer:(aC*bC)/100,features:{decimalPlaces:2}}; }}
  ]},

  fracoes:{ sym:'⅔', color:'#EAB308', op:'fracao', label:['Frações','Fractions'], levels:[
    {n:['Comparar: mesmo denominador ou numerador','Compare: same denominator or numerator'], goal:1800, shape:null,
     tip:['Mesmo denominador: maior numerador vence. Mesmo numerador: menor denominador vence.','Same denominator: larger numerator wins. Same numerator: smaller denominator wins.'],
     gen(m,tr){ return fracCmp(tr?Engine.weightedBucket(tr,'case',['same_den','same_num']):U.choice(['same_den','same_num']), m, 9, 3); }},
    {n:['Simplificar fração','Simplify a fraction'], goal:3200, shape:null,
     tip:['Divida em cima e embaixo pelo mesmo número (teste 2, 3, 5) até não dar mais: 18/24 → 9/12 → 3/4. Digite com a tecla /.','Divide top and bottom by the same number (try 2, 3, 5) until you can\'t: 18/24 → 9/12 → 3/4. Type it with the / key.'],
     gen(m,tr){ return fracSimplify(m); }},
    {n:['Comparar: multiplicação cruzada','Compare: cross-multiplication'], goal:3000, shape:null,
     tip:['Multiplicação cruzada: a/b ? c/d → compare a × d com c × b.','Cross-multiply: a/b ? c/d → compare a × d with c × b.'],
     gen(m,tr){ const o=['cross','cross','cross','equal']; return fracCmp(tr?Engine.weightedBucket(tr,'case',o):U.choice(o), m, mix(6,9,m), 3); }},
    {n:['Soma e subtração (mesmo denominador)','Add/subtract (same denominator)'], goal:3500, shape:null,
     tip:['Mesmo denominador: some/subtraia os numeradores e simplifique.','Same denominator: add/subtract the numerators and simplify.'],
     gen(m,tr){ return fracAddSub(m); }},
    {n:['Mesmo denominador, simplificando','Same denominator, simplified'], goal:4800, shape:null,
     tip:['Some/subtraia os numeradores e simplifique o resultado: 7/10 + 1/10 = 8/10 = 4/5.','Add/subtract the numerators, then simplify: 7/10 + 1/10 = 8/10 = 4/5.'],
     gen(m,tr){ return fracAddSubSimplify(m); }},
    {n:['Fração de uma quantidade','Fraction of a quantity'], goal:3500, shape:null,
     tip:['Divida a quantidade pelo denominador e multiplique pelo numerador: 3/4 de 48 → 48 ÷ 4 = 12 → 12 × 3 = 36.','Divide the quantity by the denominator, then multiply by the numerator: 3/4 of 48 → 48 ÷ 4 = 12 → 12 × 3 = 36.'],
     gen(m,tr){ return fracOfQty(m); }},
    {n:['Multiplicar e dividir frações','Multiply and divide fractions'], goal:4200, shape:null,
     tip:['Cancele antes de multiplicar. Dividir por fração = multiplicar pelo inverso.','Cancel before multiplying. Dividing by a fraction = multiplying by its inverse.'],
     gen(m,tr){ return fracMulDiv(m); }},
    {n:['Soma e subtração (um denominador é múltiplo do outro)','Add/subtract (one denominator is a multiple)'], goal:6000, shape:null,
     tip:['Leve a fração de menor denominador ao maior: 1/2 + 1/4 → 2/4 + 1/4 = 3/4. Simplifique no fim.','Convert the fraction with the smaller denominator: 1/2 + 1/4 → 2/4 + 1/4 = 3/4. Simplify at the end.'],
     gen(m,tr){ return fracAddSubDiff(m, 'multiple'); }},
    {n:['Comparar quase-empates','Compare near-ties'], goal:5500, shape:null,
     tip:['Quase-empate: use a multiplicação cruzada e compare os dois produtos.','Near-tie: cross-multiply and compare the two products.'],
     gen(m,tr){ const o=['cross','cross','cross','cross','equal']; return fracCmp(tr?Engine.weightedBucket(tr,'case',o):U.choice(o), Math.max(m,0.6), mix(10,18,m), 4); }},
    {n:['Multiplicar e dividir, simplificando','Multiply and divide, simplified'], goal:7000, shape:null,
     tip:['Cancele cruzado antes de multiplicar: 3/4 × 2/9 → 1/2 × 1/3 = 1/6. Dividir = multiplicar pelo inverso.','Cross-cancel before multiplying: 3/4 × 2/9 → 1/2 × 1/3 = 1/6. Dividing = multiplying by the inverse.'],
     gen(m,tr){ return fracMulDivSimplify(m); }},
    {n:['Soma e subtração (denominadores diferentes)','Add/subtract (different denominators)'], goal:8500, shape:null,
     tip:['Ache um denominador comum e simplifique: 1/2 + 1/3 = 3/6 + 2/6 = 5/6.','Find a common denominator and simplify: 1/2 + 1/3 = 3/6 + 2/6 = 5/6.'],
     gen(m,tr){ return fracAddSubDiff(m, 'other'); }}
  ]},

  expressoes:{ sym:'( )', color:'#3B82F6', op:'expressao', label:['Expressões','Expressions'], levels:[
    {n:['Parênteses simples (+ e −)','Simple parentheses (+ and −)'], goal:3000, shape:null,
     tip:['Resolva o parêntese primeiro.','Solve the parentheses first.'],
     gen(m,tr){ return exprSimple(m,['soma','subtracao'],mix(9,25,m)); }},
    {n:['Parênteses com multiplicação','Parentheses with multiplication'], goal:3800, shape:null,
     tip:['Parêntese primeiro, depois multiplique.','Parentheses first, then multiply.'],
     gen(m,tr){ const it=exprSimple(m,['multiplicacao'],mix(5,9,m)); return it; }},
    {n:['Cadeias de soma e subtração','Add/subtract chains'], goal:4200, shape:null,
     tip:['Da esquerda para a direita, sem recomeçar: agrupe dezenas redondas quando der.','Left to right without restarting: group round tens when possible.'],
     gen(m,tr){ return exprChainAddSub(m); }},
    {n:['Dois parênteses','Two parentheses'], goal:6000, shape:null,
     tip:['Resolva cada parêntese e só então combine os dois resultados.','Solve each parenthesis, then combine the two results.'],
     gen(m,tr){ return exprDouble(m); }},
    {n:['Potências, cubos e raízes simples','Simple powers, cubes and roots'], goal:5500, shape:null,
     tip:['Potências e raízes primeiro; depois some/subtraia da esquerda para a direita. Cuidado com o sinal: (−3)² = 9, mas (−3)³ = −27.','Powers and roots first; then add/subtract left to right. Mind the sign: (−3)² = 9, but (−3)³ = −27.'],
     gen(m,tr){ return exprPowerChain(m); }},
    {n:['Ordem das operações','Order of operations'], goal:7000, shape:null,
     tip:['Primeiro potências e raízes, depois a multiplicação, por último soma e subtração: 9 + 3 × 4 = 9 + 12.','First powers and roots, then multiplication, last add/subtract: 9 + 3 × 4 = 9 + 12.'],
     gen(m,tr){ return exprOrder(m); }},
    {n:['Sinal na frente do parêntese','Sign in front of parentheses'], goal:5000, shape:null,
     tip:['Um − na frente do parêntese troca o sinal de TUDO lá dentro: 20 − (5 − 2) = 20 − 5 + 2 = 17. E −(3 − 8) = −3 + 8 = 5.','A − in front of parentheses flips the sign of EVERYTHING inside: 20 − (5 − 2) = 20 − 5 + 2 = 17. And −(3 − 8) = −3 + 8 = 5.'],
     gen(m,tr){ return exprSignGroup(m); }},
    {n:['Multiplicação e divisão em ordem','Multiplication and division in order'], goal:6000, shape:null,
     tip:['× e ÷ têm a mesma prioridade: da esquerda para a direita (24 ÷ 6 × 2 = 4 × 2 = 8, e não 2). Só depois soma e subtração.','× and ÷ have the same priority: left to right (24 ÷ 6 × 2 = 4 × 2 = 8, not 2). Add/subtract come after.'],
     gen(m,tr){ return exprDivOrder(m); }},
    {n:['Colchetes e parênteses','Brackets and parentheses'], goal:7500, shape:null,
     tip:['Colchetes e chaves são só parênteses de outro formato: servem para separar os grupos. Resolva de dentro para fora: ( ) → [ ] → { }.','Square brackets and braces are just parentheses in another shape, used to tell groups apart. Work from the inside out: ( ) → [ ] → { }.'],
     gen(m,tr){ return exprBrackets(m); }},
    {n:['Chaves, colchetes e parênteses','Braces, brackets and parentheses'], goal:9000, shape:null,
     tip:['Sempre de dentro para fora, um grupo por vez, reescrevendo a conta menor: {30 − [4 + (9 − 6)]} × 2 → {30 − [4 + 3]} × 2 → {30 − 7} × 2 → 23 × 2.','Always inside out, one group at a time, rewriting the shorter expression: {30 − [4 + (9 − 6)]} × 2 → {30 − [4 + 3]} × 2 → {30 − 7} × 2 → 23 × 2.'],
     gen(m,tr){ return exprBraces(m); }},
    {n:['Potência de grupo e sinais','Powers of groups and signs'], goal:7000, shape:null,
     tip:['Resolva o parêntese e depois a potência: (2 + 3)² = 5² = 25. Atenção à base: −3² = −9 (só o 3 é elevado), mas (−3)² = 9.','Solve the parentheses, then the power: (2 + 3)² = 5² = 25. Watch the base: −3² = −9 (only the 3 is squared), but (−3)² = 9.'],
     gen(m,tr){ return exprGroupPower(m); }},
    {n:['Misturas maiores (sem parênteses)','Bigger mixes (no parentheses)'], goal:7500, shape:null,
     tip:['× e ÷ primeiro (esquerda → direita), guardando cada resultado; só depois some e subtraia: 48 + 7 × 13 − 96 ÷ 8 → 48 + 91 − 12 = 127.','× and ÷ first (left to right), keeping each result; only then add and subtract: 48 + 7 × 13 − 96 ÷ 8 → 48 + 91 − 12 = 127.'],
     gen(m,tr){ return exprMixPlain(m); }},
    {n:['Parênteses e números maiores','Parentheses and bigger numbers'], goal:8500, shape:null,
     tip:['Resolva cada parêntese, anote o resultado e siga a ordem das operações: (47 + 38) × 6 − 120 ÷ 8 → 85 × 6 − 15 = 510 − 15 = 495.','Solve each parenthesis, note the result and follow the order of operations: (47 + 38) × 6 − 120 ÷ 8 → 85 × 6 − 15 = 510 − 15 = 495.'],
     gen(m,tr){ return exprMixParens(m); }},
    {n:['Colchetes e números maiores','Brackets and bigger numbers'], goal:9500, shape:null,
     tip:['De dentro para fora, reescrevendo a conta a cada passo: [(48 + 27) × 4 − 150] ÷ 6 → [75 × 4 − 150] ÷ 6 → [300 − 150] ÷ 6 → 150 ÷ 6 = 25.','Inside out, rewriting the expression at each step: [(48 + 27) × 4 − 150] ÷ 6 → [75 × 4 − 150] ÷ 6 → [300 − 150] ÷ 6 → 150 ÷ 6 = 25.'],
     gen(m,tr){ return exprMixBrackets(m); }},
    {n:['Chaves, potências e números maiores','Braces, powers and bigger numbers'], goal:10000, shape:null,
     tip:['Três níveis, sempre de dentro para fora, e potências antes de × e ÷: {[(8 + 4) × 5 − 36] ÷ 6 + 3²} × 2 → {[60 − 36] ÷ 6 + 9} × 2 → {4 + 9} × 2 = 26.','Three levels, always inside out, with powers before × and ÷: {[(8 + 4) × 5 − 36] ÷ 6 + 3²} × 2 → {[60 − 36] ÷ 6 + 9} × 2 → {4 + 9} × 2 = 26.'],
     gen(m,tr){ return exprMixBraces(m); }},
  ]},

  equacoes:{ sym:'x', color:'#84CC16', op:'equacao', label:['Equações','Equations'], levels:[
    {n:['x + b = c','x + b = c'], goal:2500, shape:null,
     tip:['Isole x: faça a operação inversa dos dois lados.','Isolate x: do the inverse operation on both sides.'],
     gen(m,tr){ const x=rr(2,mix(15,60,m)), B=rr(2,mix(9,40,m)), plus=Math.random()<0.5;
       if(plus) return eqItem(1,B,0,x+B,x);
       const xx=x+B; return eqItem(1,-B,0,xx-B,xx); }},
    {n:['ax = c','ax = c'], goal:3000, shape:null,
     tip:['Divida os dois lados por quem multiplica x.','Divide both sides by the coefficient of x.'],
     gen(m,tr){ const a=rr(2,mix(6,12,m)), x=rr(2,mix(9,15,m)); return eqItem(a,0,0,a*x,x); }},
    {n:['x/a ± b = c','x/a ± b = c'], goal:3200, shape:null,
     tip:['Desfaça de fora para dentro: primeiro tire o + b (ou − b) dos dois lados, depois multiplique por a. x/3 + 8 = 15 → x/3 = 7 → x = 21.','Undo from the outside in: first remove the + b (or − b) on both sides, then multiply by a. x/3 + 8 = 15 → x/3 = 7 → x = 21.'],
     gen(m,tr){ return eqDivConst(m); }},
    {n:['ax + b = c','ax + b = c'], goal:4000, shape:null,
     tip:['Primeiro afaste a constante (some/subtraia dos dois lados), depois divida.','First move the constant away (add/subtract on both sides), then divide.'],
     gen(m,tr){ const a=rr(2,mix(6,12,m)), x=rr(2,mix(9,20,m)); let B=rr(1,mix(10,40,m))*(Math.random()<0.5?1:-1);
       if(a*x+B<=0) B=-B;
       return eqItem(a,B,0,a*x+B,x); }},
    {n:['a(x + b) = c','a(x + b) = c'], goal:4500, shape:null,
     tip:['Divida os dois lados por a primeiro; sobra x + b. 2(x + 4) = 26 → x + 4 = 13 → x = 9.','Divide both sides by a first, leaving x + b. 2(x + 4) = 26 → x + 4 = 13 → x = 9.'],
     gen(m,tr){ return eqParenConst(m); }},
    {n:['ax + b = cx + d','ax + b = cx + d'], goal:5500, shape:null,
     tip:['Junte os x de um lado e os números do outro.','Gather the x terms on one side and the numbers on the other.'],
     gen(m,tr){ const a=rr(3,mix(6,12,m)), c=rr(1,a-1), x=rr(2,mix(9,15,m)); let B=rr(1,mix(10,40,m))*(m>0.5&&Math.random()<0.4?-1:1);
       if((a-c)*x+B<=0) B=Math.abs(B);
       return eqItem(a,B,c,(a-c)*x+B,x); }},
    {n:['(x + b)/a = c','(x + b)/a = c'], goal:5000, shape:null,
     tip:['Multiplique os dois lados por a: x + b = a × c. Depois tire o b. (x + 4)/3 = 7 → x + 4 = 21 → x = 17.','Multiply both sides by a: x + b = a × c. Then remove b. (x + 4)/3 = 7 → x + 4 = 21 → x = 17.'],
     gen(m,tr){ return eqFracParen(m); }},
    {n:['Proporção: x/a = b/c','Proportion: x/a = b/c'], goal:6000, shape:null,
     tip:['Simplifique b/c e multiplique por a (ou cruze: x × c = a × b). x/4 = 9/6 = 3/2 → x = 4 × 3/2 = 6.','Simplify b/c and multiply by a (or cross-multiply: x × c = a × b). x/4 = 9/6 = 3/2 → x = 4 × 3/2 = 6.'],
     gen(m,tr){ return eqProportion(m); }},
    {n:['Com números negativos','With negative numbers'], goal:7500, shape:null,
     tip:['Cuidado com o sinal ao mudar um termo de lado.','Watch the sign when moving a term across the equals sign.'],
     gen(m,tr){ let x,a,c,B,d,t=0;
       do{ x=rr(-mix(6,20,m), mix(6,20,m)); a=rr(2,mix(3,12,m))*(Math.random()<0.5?-1:1);
           c=Math.random()<0.7 ? rr(0,mix(3,12,m))*(Math.random()<0.5?-1:1) : 0;
           B=rr(-mix(15,85,m), mix(15,85,m)); d=(a-c)*x+B; t++; }
       while((a===c || x===0 || Math.abs(d)>1999) && t<40);
       if(a===c || x===0){ a=3; c=1; x=4; B=5; d=(a-c)*x+B; }
       return eqItem(a,B,c,d,x); }},
    {n:['a(x + b) = cx + d','a(x + b) = cx + d'], goal:7000, shape:null,
     tip:['Distribua o a, junte os x de um lado e os números do outro. 2(x + 1) = x + 9 → 2x + 2 = x + 9 → x = 7.','Distribute a, gather the x terms on one side and the numbers on the other. 2(x + 1) = x + 9 → 2x + 2 = x + 9 → x = 7.'],
     gen(m,tr){ return eqParenBoth(m); }}
  ]}
};
/* ---------- números negativos nos levels finais ----------
   Na prova aparecem contas com sinal. Nos últimos levels de subtração, multiplicação e divisão,
   parte das contas (NEG_RATE, sobe um pouco com m) vira uma variante com sinal, mantendo o nº de
   dígitos do level: b − a < 0, a − (−b), (−a) × b, (−a) ÷ (−b)... A resposta pode ser negativa
   (digita-se com ±). Essas contas ficam fora dos pesos de vai-um/empréstimo (features = {neg}). */
const NEG_RATE = [0.22, 0.38];
// Quais levels recebem sinais (pelo nome PT do level, assim levels novos no meio da escada não deslocam nada).
const NEG_LEVELS = {
  subtracao:['3 dígitos − 3 dígitos','4 dígitos − 3 dígitos','4 dígitos − 4 dígitos'],
  multiplicacao:['2 dígitos × 2 dígitos','3 dígitos × 1 dígito','3 dígitos × 2 dígitos'],
  divisao:['3 dígitos ÷ 2 dígitos','4 dígitos ÷ 1 dígito']
};
const NEG_TIP = {
  subtracao:['Sinais: subtrair um negativo é somar (7 − (−3) = 10); e se o 1º número é menor, o resultado é negativo: calcule o maior − menor e ponha o sinal.',
    'Signs: subtracting a negative means adding (7 − (−3) = 10); if the first number is smaller the result is negative: do bigger − smaller and add the sign.'],
  multiplicacao:['Sinais: iguais dão positivo, diferentes dão negativo. Calcule sem sinal e depois decida o sinal.','Signs: same signs give positive, different signs give negative. Multiply first, then decide the sign.'],
  divisao:['Sinais: iguais dão positivo, diferentes dão negativo. Divida sem sinal e depois decida o sinal.','Signs: same signs give positive, different signs give negative. Divide first, then decide the sign.']
};
function negify(it, key){
  if(!it || it.isReversePath || !Number.isInteger(it.a) || !Number.isInteger(it.b) || it.a<=0 || it.b<=0) return it;
  const a = it.a, b = it.b; let terms, ops, answer;
  const sgn = ()=>Math.random()<0.5 ? -1 : 1;
  const op = it.op || TRACKS[key].op;
  if(op==='subtracao'){
    if(a===b) return it;
    if(Math.random()<0.6){ terms=[termInt(Math.min(a,b)), termInt(Math.max(a,b))]; answer=Math.min(a,b)-Math.max(a,b); }   // menor − maior
    else { terms=[termInt(a), termInt(-b)]; answer=a+b; }                                                                    // a − (−b)
    ops=['subtracao'];
  } else if(op==='multiplicacao' || op==='divisao'){
    let sa = sgn(), sb = sgn(); if(sa>0 && sb>0) sa = -1;
    terms=[termInt(sa*a), termInt(sb*b)]; ops=[op]; answer = sa*sb*it.answer;
  } else return it;
  return Object.assign({}, it, {terms, ops, answer, exprText:chainText(terms,ops), features:{neg:true}});
}
Object.keys(NEG_LEVELS).forEach(key=>{
  TRACKS[key].levels.forEach(lv=>{
    if(!NEG_LEVELS[key].includes(lv.n[0])) return;
    const g = lv.gen;
    lv.neg = true;
    lv.gen = (m,tr)=>{ const it = g(m,tr); return Math.random()<NEG_RATE[0]+(NEG_RATE[1]-NEG_RATE[0])*m ? negify(it, key) : it; };
    lv.tip = [lv.tip[0]+' '+NEG_TIP[key][0], lv.tip[1]+' '+NEG_TIP[key][1]];
  });
});

/* ---------- migração da ESCADA de levels ----------
   v2: entraram levels de várias parcelas (3–4 números) NO MEIO das trilhas Soma, Subtração, Multiplicação e
   Divisão. `map[i]` = posição nova do level antigo i+1. Quem tem progresso salvo na escada antiga é remapeado
   em 07-storage.js (level, estrelas, subida em andamento, recordes, dicas vistas, histórico). Os levels novos
   começam sem estrela, e quem tinha concluído a trilha volta ao primeiro level ainda sem estrela. */
const LADDERS = {
  soma:{v:2, map:[1,2,3,4,6,7,9,10]},
  subtracao:{v:2, map:[1,2,3,4,6,7,9,10]},
  multiplicacao:{v:2, map:[1,2,4,5,7,8,9,10]},
  divisao:{v:2, map:[1,2,4,5,7,8]},
  // v2 (frações e equações): levels novos de simplificação, fração de quantidade, parênteses, frações e proporção.
  fracoes:{v:2, map:[1,3,4,7,9]},
  equacoes:{v:2, map:[1,2,4,6,9]}
};
const ladderVersion = key=>(LADDERS[key] && LADDERS[key].v) || 1;
// Posição nova de um level da escada antiga (clamp ao tamanho da escada antiga).
function ladderMapLevel(key, lvl){
  const lad = LADDERS[key]; if(!lad) return lvl;
  return lad.map[U.clamp(Math.round(+lvl)||1, 1, lad.map.length)-1];
}

const TRACK_ORDER = ['soma','subtracao','multiplicacao','divisao','porcentagem','decimais','fracoes','expressoes','equacoes'];
const DEFAULT_ACTIVE_TRACKS = ['soma','subtracao','multiplicacao','divisao'];

function trackLabel(key){ return pickLang(TRACKS[key].label); }
function trackLevels(key){ return TRACKS[key].levels.length; }
function levelDef(key, level){ const L=TRACKS[key].levels; return L[U.clamp(level,1,L.length)-1]; }
function levelName(key, level){ return pickLang(levelDef(key,level).n); }
function levelTip(key, level){ return pickLang(levelDef(key,level).tip); }
// Meta de tempo do level (ms). Na patente "Mestre" ela encolhe RANK_GOAL_DECAY por patente.
// Limite e meta de uma conta ('small' | 'mid' | 'big'), em ms. Ver 1b em 02-engine-constants.js.
function levelTimes(key, level, size='small', rank=0){
  const G = levelGoalMs(key, level, rank), limit = Math.round(G*(LIMIT_MULT[size]||LIMIT_MULT.small));
  const gap = U.clamp(limit*META_GAP_FRAC, META_GAP_MIN_MS, META_GAP_MAX_MS);
  return {limit, meta:Math.round(limit-Math.min(gap, limit*0.5))};
}
function levelGoalMs(key, level, rank=0){
  return Math.round(levelDef(key,level).goal * Math.pow(RANK_GOAL_DECAY, rank||0));
}
