/* =====================================================================
   tests/run-tests.js — suíte automatizada do motor (sem DOM, só Node.js).

   O QUE COBRE
     1. Geradores: toda trilha × level × posição m produz conta EXATA, de resposta
        inteira (ou decimal com ≤ 2 casas), nunca negativa (exceto equação/comparação)
        e com a FORMA de dígitos fixa do level (acaba com "4 dígitos e depois 2").
     2. spokenPhrase() não quebra para nenhum item, em pt-BR e en-US.
     3. Engine: nivelamento, passo de m pequeno e na direção certa, XP, barra, prova de
        nível (aprova/reprova), reforço suave, patente Mestre, filtro de lapso, blocos.
     4. Progress: curva de nível, meta diária, sequência de dias, estrelas da rodada.
     5. Storage: saneamento de dados corrompidos e migração do formato v2.
     6. Session: rodada completa com a UI "muda" (stubs) — XP, histórico, meta, saída parcial.
     7. Modo livre: contas de todo level/tamanho corretas e, acima de tudo, NADA é salvo nem pontuado.

   NÃO COBRE: layout/teclado/TTS reais (ver teste de navegador descrito no README).

   COMO RODAR:  node tests/run-tests.js   (ou: node run-tests.js)
   ===================================================================== */

const fs = require('fs');
const path = require('path');

global.window = global;
global.localStorage = {
  _data:{},
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._data,k) ? this._data[k] : null; },
  setItem(k,v){ this._data[k]=String(v); },
  removeItem(k){ delete this._data[k]; }
};
global.navigator = { vibrate(){ return true; } };
const fakeEl = ()=>({ classList:{add(){},remove(){},toggle(){},contains(){return false;}}, appendChild(){}, style:{setProperty(){}}, setAttribute(){}, replaceChildren(){}, append(){} });
global.document = {
  addEventListener(){}, removeEventListener(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
  getElementById(){ return null; }, createElement(){ return fakeEl(); }, createElementNS(){ return fakeEl(); }
};
global.performance = global.performance || { now:()=>Date.now() };

// Mesmos módulos, mesma ordem do index.html — exceto 15-init.js (efeitos colaterais de inicialização).
const jsDir = path.join(__dirname, '..', 'assets', 'js');
const MODULES = ['01-utils.js','02-engine-constants.js','03-i18n.js','04-operations.js','05-expression-terms.js','06-tracks.js',
  '07-storage.js','08-speed-engine.js','09-feedback.js','10-progress.js','11-session.js','12-analytics.js','13-export.js','14-ui.js','14b-free-mode.js'];
const engineSrc = MODULES.map(name => fs.readFileSync(path.join(jsDir, name), 'utf8')).join('\n');

let failures = 0, passed = 0;
function ok(cond, msg){ if(cond) passed++; else { failures++; console.error('❌ FALHOU:', msg); } }
const sleep = ms => new Promise(r=>setTimeout(r,ms));

const harness = `
${engineSrc}
return (async function(ok, sleep){

function freshStore(patch){
  Store.data = Store.normalize(patch||{});
  Store.save = ()=>{};
  return Store.data;
}
function placeAll(level, m){
  Engine.activeKeys().forEach(k=>{ const tr = Engine.track(k); tr.placed = true; tr.level = Math.min(level, TRACKS[k].levels.length); tr.m = m==null?0.3:m; });
}
// executa um bloco inteiro com um "usuário" (função item → {correct, ms})
function runBlock(spec, user){
  Engine.beginBlock(spec);
  const outs = []; let item, guard=0;
  while((item = Engine.nextItem()) && guard++<200){
    const r = user(item);
    const out = Engine.registerResult(item, r.ms, r.correct, !!r.timedOut, r.typed);
    outs.push({item, out});
  }
  return outs;
}

/* ---------- 1. GERADORES ---------- */
// Verificador INDEPENDENTE para contas com grupos: lê só o TEXTO exibido (não usa a árvore) e calcula
// pela precedência real — ( ) [ ] { } agrupam; ² ³ são potência; − unário; × ÷ antes de + −, esq→dir.
// Devolve NaN se qualquer divisão não for exata (o gerador promete ÷ exato em todos os passos).
function parseExprText(text){
  const src = text.split(' ').join(''); let i = 0;
  const SUP = {'²':2,'³':3};
  const OPEN = {'(':')','[':']','{':'}'};
  function atom(){
    let v;
    if(src[i]==='−'){ i++; v = -power(); return v; }                       // −3² = −(3²)
    return power();
  }
  function power(){
    let v;
    if(OPEN[src[i]]){ const close = OPEN[src[i]]; i++; v = sum(); if(src[i]!==close) return NaN; i++; }
    else { let j = i; while(src[j]>='0' && src[j]<='9') j++; if(j===i) return NaN; v = +src.slice(i,j); i = j; }
    while(SUP[src[i]]){ v = Math.pow(v, SUP[src[i]]); i++; }
    return v;
  }
  function prod(){
    let v = atom();
    while(src[i]==='×' || src[i]==='÷'){
      const op = src[i++], r = atom();
      if(op==='×') v *= r; else { if(!Number.isInteger(v/r)) return NaN; v /= r; }
    }
    return v;
  }
  function sum(){
    let v = prod();
    while(src[i]==='+' || src[i]==='−'){ const op = src[i++], r = prod(); v = op==='+' ? v+r : v-r; }
    return v;
  }
  const out = sum();
  return i===src.length ? out : NaN;
}
// Cada par de símbolos tem de bater com o NÍVEL de aninhamento: ( ) = 1, [ ] = 2, { } = 3 (nunca mais que 3).
function bracketsMatchDepth(text){
  const pairs = {'(':')','[':']','{':'}'}, kind = {'(':1,'[':2,'{':3};
  const stack = [];
  for(const ch of text){
    if(pairs[ch]) stack.push({ch, depth:1});
    else if(ch===')' || ch===']' || ch==='}'){
      const top = stack.pop();
      if(!top || pairs[top.ch]!==ch || top.depth>3 || kind[top.ch]!==top.depth) return false;
      if(stack.length) stack[stack.length-1].depth = Math.max(stack[stack.length-1].depth, top.depth+1);
    }
  }
  return stack.length===0;
}
function evalItem(it){
  const f = it.features||{};
  if(it.tree) return parseExprText(it.exprText);
  if(f.neg || f.chain){ let v=it.terms[0].value; for(let i=0;i<it.ops.length;i++) v=applyOp2(it.ops[i],v,it.terms[i+1].value); return v; }
  switch(it.op){
    case 'soma': return it.a+it.b;
    case 'subtracao': return it.a-it.b;
    case 'multiplicacao': return it.a*it.b;
    case 'divisao': return it.a/it.b;
    case 'porcentagem': return it.a*it.b/100;
    case 'porcentagem_inversa': return it.a/it.b*100;
    case 'porcentagem_acrescimo': return it.a + it.a*it.b/100;
    case 'porcentagem_desconto': return it.a - it.a*it.b/100;
    case 'porcentagem_original': return f.aumento ? it.a/(1+it.b/100) : it.a/(1-it.b/100);
    case 'porcentagem_aumento': return (it.b-it.a)/it.a*100;
    case 'porcentagem_reducao': return (it.a-it.b)/it.a*100;
    case 'porcentagem_sucessiva': return it.a*(1-it.b/100)*(1-it.c/100);
    case 'fracao_comparacao': return Math.sign(it.a*it.d-it.c*it.b);
    case 'equacao': return null;
    default:
      if(it.terms){ // precedência: × e ÷ antes de + e −
        const vals=[it.terms[0].value], ops=[];
        for(let i=0;i<it.ops.length;i++){
          if(it.ops[i]==='multiplicacao'||it.ops[i]==='divisao') vals[vals.length-1]=applyOp2(it.ops[i],vals[vals.length-1],it.terms[i+1].value);
          else { ops.push(it.ops[i]); vals.push(it.terms[i+1].value); }
        }
        let v=vals[0]; for(let i=0;i<ops.length;i++) v=applyOp2(ops[i],v,vals[i+1]); return v;
      }
      if(it.op==='expressao'){
        if(it.midOp){ const l=applyOp2(it.leftOp,it.a,it.b), r=applyOp2(it.rightOp,it.c,it.d); return applyOp2(it.midOp,l,r); }
        return applyOp2(it.outerOp, applyOp2(it.innerOp,it.a,it.b), it.c);
      }
  }
  return undefined;
}
freshStore();
let genProblems = 0, genTotal = 0, negAnswers = 0; const negItems = {}, negAns = {}; const genSamples = [];
for(const key of TRACK_ORDER){
  const n = TRACKS[key].levels.length;
  for(let L=1; L<=n; L++){
    const def = levelDef(key, L);
    for(const m of [0, 0.5, 1]){
      for(let i=0;i<120;i++){
        const it = Engine.generateItem(key, L, m, {kind:'practice'});
        genTotal++;
        const tag = key+'/L'+L+'/m'+m;
        const bad = msg=>{ genProblems++; if(genSamples.length<8) genSamples.push(tag+': '+msg+' '+JSON.stringify(it).slice(0,160)); };
        if(!Number.isFinite(it.answer)){ bad('resposta não finita'); continue; }
        if((String(it.answer).split('.')[1]||'').length>2) bad('mais de 2 casas');
        if(it.isReversePath) continue;
        const ev = evalItem(it);
        if(ev===undefined) bad('op sem verificador '+it.op);
        else if(ev!==null && Math.abs(ev-it.answer)>1e-9) bad('resposta diverge '+ev+' vs '+it.answer);
        if(it.op==='equacao'){
          if(it.a*it.answer+it.b !== it.c*it.answer+it.d) bad('equação não fecha');
          if(!Number.isInteger(it.answer)) bad('x não inteiro');
        }
        if(it.op!=='fracao_comparacao' && it.op!=='equacao' && !Number.isInteger(it.answer) && !(it.features&&it.features.decimalPlaces)) bad('resposta não inteira');
        if(it.answer<0 && it.op!=='equacao' && it.op!=='fracao_comparacao' && key!=='expressoes' && !(it.features&&it.features.neg)) bad('resposta negativa');
        if(it.features&&it.features.neg){ negItems[key]=(negItems[key]||0)+1; if(it.answer<0) negAns[key]=(negAns[key]||0)+1; if(!def.neg) bad('sinais fora dos levels com sinais'); }
        if(it.answer<0 && key==='expressoes') negAnswers++;
        if(['soma','subtracao','multiplicacao','divisao'].includes(it.op) && def.shape){
          const sh = [digitCount(it.a),digitCount(it.b)].sort((x,y)=>y-x);
          if(sh[0]!==def.shape[0] || sh[1]!==def.shape[1]) bad('forma '+sh+' != '+def.shape);
        }
      }
    }
  }
}
ok(genProblems===0, 'geradores: '+genProblems+' problemas em '+genTotal+' itens → '+genSamples.join(' | '));
ok(['subtracao','multiplicacao','divisao'].every(k=>negItems[k]>0 && negAns[k]>0), 'subtração/multiplicação/divisão têm contas com sinal e respostas negativas nos levels finais '+JSON.stringify(negItems));
ok(negAnswers>0, 'expressões podem ter resposta negativa ('+negAnswers+' vistas)');
// metas de tempo crescem ao longo de cada trilha (exceto o salto proposital de multiplicação/raiz) e existe dica nos dois idiomas
for(const key of TRACK_ORDER){
  TRACKS[key].levels.forEach((l,i)=>{
    ok(l.goal>=500 && l.goal<=10000, key+' L'+(i+1)+' meta plausível');
    ok(Array.isArray(l.tip) && l.tip[0] && l.tip[1], key+' L'+(i+1)+' tem dica PT/EN');
    ok(Array.isArray(l.n) && l.n[0] && l.n[1], key+' L'+(i+1)+' tem nome PT/EN');
  });
}

// potência/raiz existem só dentro de expressões e são tranquilas (base ≤ 13)
ok(!TRACKS.potencia && !TRACKS.raiz, 'não há trilhas próprias de potência/raiz');
{
  let seen = 0, tooBig = 0, noPrec = 0, cubes = 0, negs = 0;
  for(const key of Object.keys(TRACKS)) for(let L=1; L<=TRACKS[key].levels.length; L++) for(let i=0;i<150;i++){
    const it = Engine.generateItem(key, L, Math.random(), {});
    (it.terms||[]).forEach(t=>{
      if(t.kind==='power'){ seen++; if(Math.abs(t.base)>13 || (t.exp!==2 && !(t.exp===3 && Math.abs(t.base)<=5))) tooBig++; if(t.exp===3) cubes++; if(t.base<0) negs++; }
      if(t.kind==='radical'){ seen++; if(t.value>13 || t.index!==2) tooBig++; }
    });
    if(it.ops && it.ops.includes('multiplicacao') && it.ops.length===2 && key==='expressoes'){ noPrec += 0; }
  }
  ok(seen>0 && tooBig===0, 'potências/raízes em expressões: quadrados ≤ 13, cubos ≤ 5 ('+seen+' vistas, '+tooBig+' fora do limite)');
  ok(cubes>0 && negs>0, 'há cubos e bases negativas nas expressões');
  ok(!Object.keys(TRACKS).some(k=>k!=='expressoes' && Array.from({length:TRACKS[k].levels.length},(_,i)=>i).some(i=>{ for(let j=0;j<60;j++){ const it=Engine.generateItem(k,i+1,Math.random(),{}); if((it.terms||[]).some(t=>t.kind==='power'||t.kind==='radical')) return true; } return false; })), 'potência/raiz não aparecem fora das expressões');
}
/* ---------- 1b. EXPRESSÕES COM GRUPOS (sinal, ÷, ( ) [ ] { }, potência de grupo) ---------- */
{
  const E = 'expressoes', N = TRACKS[E].levels.length;
  ok(N===15, 'trilha Expressões tem 15 levels ('+N+')');
  const caps = {7:100, 8:100, 9:100, 10:150, 11:120};
  const seen = {}; let bad = 0; const badSamples = [];
  for(let L=7; L<=11; L++){
    seen[L] = new Set();
    for(const m of [0, 0.5, 1]) for(let i=0;i<300;i++){
      const it = Engine.generateItem(E, L, m, {});
      const tag = 'L'+L+'/m'+m+' '+it.exprText;
      const flag = msg=>{ bad++; if(badSamples.length<8) badSamples.push(tag+': '+msg); };
      seen[L].add(it.exprText);
      if(it.op!=='expressao_composta' || !it.tree) { flag('não é item com árvore'); continue; }
      const parsed = parseExprText(it.exprText);
      if(!Number.isInteger(parsed)) flag('texto não calcula inteiro/÷ inexato ('+parsed+')');
      if(parsed!==it.answer) flag('resposta '+it.answer+' ≠ texto '+parsed);
      if(exprEval(it.tree)!==it.answer) flag('árvore diverge da resposta');
      if(exprToText(it.tree)!==it.exprText) flag('texto ≠ árvore');
      if(!bracketsMatchDepth(it.exprText)) flag('símbolo ( ) [ ] { } não bate com o aninhamento');
      if(Math.abs(it.answer)>caps[L]) flag('resultado explodiu ('+it.answer+' > '+caps[L]+')');
      const lits = (it.exprText.match(/[0-9]+/g)||[]).map(Number);
      if(Math.max(...lits)>caps[L]) flag('operando grande demais');
      if(L===7 && !(it.exprText.includes('−(') || it.exprText.includes('− ('))) flag('L7 sem sinal − na frente do parêntese');
      if(L===8 && !it.exprText.includes('÷')) flag('L8 sem divisão');
      if(L===9 && !(it.exprText.includes('[') && !it.exprText.includes('{'))) flag('L9 deve ter [ ] e nunca { }');
      if(L===10 && !(it.exprText.includes('{') && it.exprText.includes('[') && it.exprText.includes('('))) flag('L10 deve ter { [ ( ) ] }');
      if(L===11 && !/[²³]/.test(it.exprText)) flag('L11 sem potência');
    }
  }
  ok(bad===0, 'expressões com grupos: '+bad+' problemas → '+badSamples.join(' | '));
  ok([7,8,9,10,11].every(L=>seen[L].size>=40), 'níveis novos têm variedade (≥40 contas distintas em 900 sorteios): '+[7,8,9,10,11].map(L=>L+':'+seen[L].size).join(' '));
  // colchetes/chaves só existem a partir dos levels novos; potência de grupo e a armadilha do sinal aparecem
  let early = 0, trapNegPow = 0, trapGroupNeg = 0, groupPow = 0, leftToRight = 0;
  for(const key of TRACK_ORDER) for(let L=1; L<=TRACKS[key].levels.length; L++) for(let i=0;i<60;i++){
    const it = Engine.generateItem(key, L, Math.random(), {});
    if(['[',']','{','}'].some(c=>(it.exprText||'').includes(c)) && !(key===E && L>=9)) early++;
  }
  for(let i=0;i<600;i++){
    const t = Engine.generateItem(E, 11, Math.random(), {}).exprText;
    if(/−[0-9]²/.test(t)) trapNegPow++;
    if(/[(]−[0-9]+[)]²/.test(t)) trapGroupNeg++;
    if(t.includes(')²') || t.includes(')³')) groupPow++;
    const t8 = Engine.generateItem(E, 8, Math.random(), {}).exprText;
    if(/^[0-9]+ ÷ [0-9]+ × [0-9]+$/.test(t8)) leftToRight++;
  }
  ok(early===0, 'colchetes/chaves não vazam para outras trilhas/levels ('+early+')');
  ok(trapNegPow>0 && trapGroupNeg>0, 'L11 treina −3² e (−3)² ('+trapNegPow+' / '+trapGroupNeg+')');
  ok(groupPow>0, 'L11 tem potência aplicada a um grupo ('+groupPow+')');
  ok(leftToRight>0, 'L8 tem a armadilha a ÷ b × c (esq→dir) ('+leftToRight+')');
  // a ordem esq→dir realmente importa nessas contas (a resposta correta ≠ o erro clássico a ÷ (b × c))
  const p = parseExprText('24 ÷ 6 × 2'), q = parseExprText('−3² + 20'), r = parseExprText('(−3)² + 20'), t = parseExprText('20 − (5 − 2)'), u = parseExprText('{30 − [4 + (9 − 6)]} × 2');
  ok(p===8 && q===11 && r===29 && t===17 && u===46, 'verificador independente: 24÷6×2=8, −3²+20=11, (−3)²+20=29, 20−(5−2)=17, {30−[4+(9−6)]}×2=46 ('+[p,q,r,t,u]+')');
  ok(Number.isNaN(parseExprText('7 ÷ 2')), 'verificador acusa divisão inexata');
}
{ // renderização: o que aparece na tela (concatenando os nós) é exatamente a conta, e o formato do símbolo segue o aninhamento
  const real = document.createElement;
  const mk = ()=>{ const el = {children:[], className:'', textContent:'', classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    append(...k){ k.forEach(x=>el.children.push(x)); }, appendChild(x){ el.children.push(x); }, style:{setProperty(){}}, setAttribute(){}, replaceChildren(){ el.children.length=0; } }; return el; };
  document.createElement = ()=>mk();
  const flat = n=> n.children.length ? n.children.map(flat).join('') : n.textContent;
  let bad = 0; const samples = [];
  try{
    for(let L=7; L<=11; L++) for(let i=0;i<150;i++){
      const it = Engine.generateItem('expressoes', L, Math.random(), {});
      const shown = flat(UI.mathExpr(it.tree)), expected = it.exprText.split(' ').join('').split('²').join('2').split('³').join('3'); // expoente vira <sup>2</sup> na tela
      if(shown!==expected){ bad++; if(samples.length<4) samples.push(shown+' ≠ '+expected); }
    }
  } finally { document.createElement = real; }
  ok(bad===0, 'tela desenha exatamente a conta (símbolos e sinais): '+bad+' diferenças → '+samples.join(' | '));
}
/* ---------- 2. FALA ---------- */
{
  let threw = 0;
  for(const key of TRACK_ORDER){
    for(let L=1; L<=TRACKS[key].levels.length; L++){
      for(let i=0;i<20;i++){
        const it = Engine.generateItem(key, L, Math.random(), {});
        for(const lang of ['pt-BR','en-US']){
          try{ const s = spokenPhrase(it, lang); if(typeof s!=='string' || !s.length) threw++; }catch(e){ threw++; }
        }
      }
    }
  }
  ok(threw===0, 'spokenPhrase falhou em '+threw+' casos');
}
{ // fala de grupos: cada símbolo é dito pelo NOME (abre colchetes / abre chaves) e nada vem "undefined"
  let bad = 0; const samples = [];
  const check = (L, lang, must)=>{
    for(let i=0;i<80;i++){
      const it = Engine.generateItem('expressoes', L, Math.random(), {});
      const sp = spokenPhrase(it, lang);
      if(/undefined|NaN|object/.test(sp) || !must.every(w=>sp.includes(w))){ bad++; if(samples.length<5) samples.push(L+'/'+lang+': '+it.exprText+' → '+sp); }
    }
  };
  check(9, 'pt-BR', ['abre colchetes','fecha colchetes','abre parênteses','fecha parênteses']);
  check(10, 'pt-BR', ['abre chaves','fecha chaves','abre colchetes','abre parênteses']);
  check(9, 'en-US', ['open bracket','close bracket','open parenthesis']);
  check(10, 'en-US', ['open brace','close brace','open bracket']);
  check(7, 'pt-BR', ['menos','abre parênteses']);
  check(8, 'pt-BR', ['dividido por']);
  check(11, 'pt-BR', ['elevado a']);
  ok(bad===0, 'fala das expressões com grupos: '+bad+' problemas → '+samples.join(' | '));
  const sp = spokenPhrase({op:'expressao_composta', tree:X.bin('soma', X.neg(X.pow(X.num(3),2)), X.num(20))}, 'pt-BR');
  ok(sp==='menos 3 elevado a 2 mais 20', 'fala de −3² + 20: "'+sp+'"');
}
{ // migração: trilha ganhou levels depois de concluída → reabre no primeiro level sem estrela; outras ficam como estão
  const full = {}; for(let l=1;l<=6;l++) full[l] = 3;
  const d = Store.normalize({tracks:{expressoes:{placed:true, level:6, done:true, rank:2, stars:full}}});
  const tr = d.tracks.expressoes;
  ok(tr.done===false && tr.level===7 && tr.rank===0, 'trilha concluída antes dos levels novos reabre no level 7 (done='+tr.done+', level='+tr.level+')');
  ok(tr.stars[6]===3, 'estrelas já conquistadas são mantidas');
  const starsAll = {}; for(let l=1;l<=TRACKS.soma.levels.length;l++) starsAll[l] = 2;
  const d2 = Store.normalize({tracks:{soma:{ladder:2, placed:true, level:TRACKS.soma.levels.length, done:true, rank:1, stars:starsAll}}});
  ok(d2.tracks.soma.done===true && d2.tracks.soma.rank===1, 'trilha realmente concluída continua concluída');
}


/* ---------- 1c. LEVELS DE VÁRIAS PARCELAS (mesma operação repetida) e EXPRESSÕES GRANDES ---------- */
{
  // [level, nº mínimo e máximo de números, dígitos máximos do maior número]
  const specs = {
    soma:{5:[3,3,2], 8:[3,3,3], 11:[4,4,3]},
    subtracao:{5:[3,3,2], 8:[3,3,3], 11:[4,4,4]},
    multiplicacao:{3:[3,4,1], 6:[3,3,2], 11:[3,3,2]},
    divisao:{3:[3,3,3], 6:[3,3,3], 9:[4,4,4]}
  };
  const OPK = {soma:'soma', subtracao:'subtracao', multiplicacao:'multiplicacao', divisao:'divisao'};
  let bad = 0; const samples = [];
  Object.keys(specs).forEach(key=>{
    const n = TRACKS[key].levels.length;
    ok(Object.keys(specs[key]).length===3, key+': 3 levels de várias parcelas');
    for(let L=1; L<=n; L++){
      const isChain = !!specs[key][L], seenMulti = {n:0, plain:0};
      for(const m of [0,0.5,1]) for(let i=0;i<150;i++){
        const it = Engine.generateItem(key, L, m, {kind:'practice'});
        const flag = msg=>{ bad++; if(samples.length<8) samples.push(key+'/L'+L+'/m'+m+' '+it.exprText+': '+msg); };
        const multi = !!(it.features && it.features.chain);
        if(multi!==isChain){ if(!(it.features&&it.features.neg)) flag(isChain ? 'level de várias parcelas gerou conta de 2 números' : 'level normal gerou várias parcelas'); }
        if(!isChain) continue;
        const [lo, hi, dig] = specs[key][L];
        if(!it.terms || it.terms.length<lo || it.terms.length>hi) flag('nº de parcelas '+(it.terms&&it.terms.length));
        if(!it.ops.every(o=>o===OPK[key])) flag('mistura de operações '+it.ops);
        if(it.op!==OPK[key]) flag('op da trilha trocada');
        const vals = it.terms.map(t=>t.value);
        if(Math.max(...vals.map(digitCount))>dig) flag('número com mais de '+dig+' dígitos');
        let v = vals[0];
        for(let j=1;j<vals.length;j++){
          if(key==='divisao' && v%vals[j]!==0) flag('divisão inexata no passo '+j);
          v = applyOp2(it.ops[j-1], v, vals[j]);
          if(key==='subtracao' && v<=0) flag('resultado do passo ≤ 0');
        }
        if(v!==it.answer) flag('resposta '+it.answer+' ≠ '+v);
        if(!(it.answer>0)) flag('resposta não positiva');
        if(it.isReversePath || it.digitKey) flag('conta de parcelas com marca de tabuada');
      }
    }
  });
  ok(bad===0, 'levels de várias parcelas: '+bad+' problemas → '+samples.join(' | '));
  // equilíbrio: cada trilha básica mistura levels de 2 números (os grandes ficam) e de várias parcelas
  for(const key of Object.keys(specs)){
    const n = TRACKS[key].levels.length, nc = Object.keys(specs[key]).length;
    ok(n-nc>=6 && nc===3, key+': '+(n-nc)+' levels de 2 números mantidos + '+nc+' de várias parcelas');
    ok(!!specs[key][n], key+': a escada termina em um level de várias parcelas');
    const goals = TRACKS[key].levels.map(l=>l.goal);
    Object.keys(specs[key]).forEach(L=>{ ok(goals[L-1]>goals[L-2], key+' L'+L+': meta de tempo maior que a do level anterior'); });
  }
  // texto/voz de conta com 4 parcelas
  const it4 = Engine.generateItem('soma', 11, 0.5, {kind:'practice'});
  ok(/^[0-9]+ [+] [0-9]+ [+] [0-9]+ [+] [0-9]+$/.test(it4.exprText) && spokenPhrase(it4,'pt-BR').split(' mais ').length===4, 'texto e fala de 4 parcelas: '+it4.exprText+' → '+spokenPhrase(it4,'pt-BR'));

  // Expressões grandes (12–15): números maiores que nos levels 7–11, todos os estilos misturados
  const caps = {12:500, 13:900, 14:1200, 15:1800}, maxChars = {12:26, 13:30, 14:34, 15:38};
  let eb = 0, relaxed = 0, total = 0; const es = []; const seen = {};
  for(let L=12; L<=15; L++){
    seen[L] = new Set();
    for(const m of [0,0.5,1]) for(let i=0;i<300;i++){
      const it = Engine.generateItem('expressoes', L, m, {});
      const flag = msg=>{ eb++; if(es.length<8) es.push('L'+L+'/m'+m+' '+it.exprText+': '+msg); };
      seen[L].add(it.exprText); total++;
      if(it.op!=='expressao_composta' || !it.tree){ flag('sem árvore'); continue; }
      const parsed = parseExprText(it.exprText);
      if(parsed!==it.answer || exprEval(it.tree)!==it.answer) flag('resposta diverge do texto ('+parsed+')');
      if(exprToText(it.tree)!==it.exprText) flag('texto ≠ árvore');
      if(!Number.isInteger(it.answer) || it.answer<2) flag('resposta fora do esperado');
      if(it.answer>caps[L]) relaxed++;
      if(it.exprText.length>maxChars[L]) relaxed++;
      if(!bracketsMatchDepth(it.exprText)) flag('símbolo ( ) [ ] { } não bate com o aninhamento');
      if(new Set(it.exprText.match(/[+−×÷]/g)).size<3) flag('menos de 3 tipos de operação');
      const hasP = it.exprText.includes('('), hasB = it.exprText.includes('['), hasC = it.exprText.includes('{');
      if(L===12 && (hasP||hasB||hasC)) flag('L12 não pode ter grupos');
      if(L===13 && !(hasP && !hasB && !hasC)) flag('L13 só com parênteses');
      if(L===14 && !(hasP && hasB && !hasC)) flag('L14 com [ ( ) ] e sem chaves');
      if(L===15 && !(hasP && hasB && hasC)) flag('L15 com { [ ( ) ] }');
      // divisões exatas em todos os passos: nada de resultado intermediário fracionado
      (function chk(nd){ if(nd.t==='bin'){ if(nd.op==='divisao' && exprEval(nd.l)%exprEval(nd.r)!==0) flag('divisão inexata'); if(exprEval(nd)<0) flag('passo negativo'); chk(nd.l); chk(nd.r); } else if(nd.t==='group') chk(nd.e); else if(nd.t==='pow') chk(nd.base); })(it.tree);
    }
  }
  ok(eb===0, 'expressões grandes (12–15): '+eb+' problemas → '+es.join(' | '));
  ok(relaxed/total<0.005, 'teto de valor/tamanho do texto respeitado (afrouxado em '+relaxed+' de '+total+' contas)');
  ok([12,13,14,15].every(L=>seen[L].size>=150), 'expressões grandes têm variedade: '+[12,13,14,15].map(L=>L+':'+seen[L].size).join(' '));
  // os números das expressões novas são maiores que os dos levels de grupos (7–11)
  const medLit = L=>{ const a=[]; for(let i=0;i<300;i++) a.push(...(Engine.generateItem('expressoes',L,0.5,{}).exprText.match(/[0-9]+/g)||[]).map(Number)); a.sort((x,y)=>x-y); return a[a.length>>1]; };
  ok(medLit(13)>medLit(9) && medLit(14)>medLit(10), 'números típicos das expressões 13/14 maiores que os dos levels 9/10 ('+medLit(13)+'>'+medLit(9)+', '+medLit(14)+'>'+medLit(10)+')');
}

/* ---------- 1d. MIGRAÇÃO DA ESCADA DE LEVELS (progresso salvo antes dos levels de parcelas) ---------- */
{
  // as formas dos levels antigos continuam as mesmas depois do remapeamento
  const oldShapes = {
    soma:[[1,1],[2,1],[2,2],[2,2],[3,2],[3,3],[4,3],[4,4]],
    subtracao:[[1,1],[2,1],[2,2],[2,2],[3,2],[3,3],[4,3],[4,4]],
    multiplicacao:[[1,1],[1,1],[2,1],[2,1],[2,2],[2,2],[3,1],[3,2]],
    divisao:[null,null,[2,1],[3,1],[3,2],[4,1]]
  };
  Object.keys(oldShapes).forEach(key=>{
    ok(LADDERS[key].map.length===oldShapes[key].length, key+': mapa cobre todos os levels antigos');
    oldShapes[key].forEach((sh,i)=>{
      const nw = levelDef(key, LADDERS[key].map[i]);
      ok(JSON.stringify(nw.shape)===JSON.stringify(sh), key+': level antigo '+(i+1)+' → novo '+LADDERS[key].map[i]+' mantém a forma ('+JSON.stringify(sh)+')');
    });
    ok(LADDERS[key].map.every((v,i,a)=>i===0 || v>a[i-1]), key+': mapa crescente');
  });
  const t0 = Date.now();
  const old = {
    tracks:{
      soma:{placed:true, level:5, xp:30, stars:{1:3, 5:2, 8:1}, climb:{level:6, need:12, results:[]}, bestMedian:{5:3000}, window:[{ms:3000, correct:true, level:5, kind:'practice'}]},
      multiplicacao:{placed:true, level:3, xp:10, stars:{1:3,2:3}},
      expressoes:{placed:true, level:4, stars:{1:3}}
    },
    seenTips:{'soma:5':true, 'multiplicacao:3':true, 'divisao:2':true},
    log:[[t0, TRACK_ORDER.indexOf('soma'), 5, 0.5, 3000, 2500, 1, 'ok','x',0, 0], [t0, TRACK_ORDER.indexOf('divisao'), 5, 0.5, 3000, 2500, 1, 'ok','x',0, 0]],
    events:[{type:'levelUp', key:'soma', level:5, newLevel:6, stars:1}, {type:'levelUp', key:'divisao', level:2, newLevel:3, stars:1}]
  };
  const snapshot = JSON.stringify(old);
  const d = Store.normalize(old);
  const so = d.tracks.soma;
  ok(JSON.stringify(old)===snapshot, 'normalize não altera o objeto de entrada');
  ok(so.ladder===2 && so.level===6 && so.xp===30, 'soma: level antigo 5 (3 dígitos + 2 dígitos) → novo 6, XP mantido ('+so.level+')');
  ok(so.stars[1]===3 && so.stars[6]===2 && so.stars[10]===1 && !so.stars[5] && !so.stars[8], 'soma: estrelas acompanham os levels antigos: '+JSON.stringify(so.stars));
  ok(so.climb && so.climb.level===7, 'soma: subida em andamento aponta para o novo level (7)');
  ok(so.bestMedian[6]===3000 && so.bestMedian[5]===undefined, 'soma: recorde de tempo acompanha o level');
  ok(so.window[0].level===6, 'soma: janela de contas recentes acompanha o level');
  ok(d.tracks.multiplicacao.level===4 && d.tracks.multiplicacao.stars[4]===undefined && d.tracks.multiplicacao.stars[1]===3 && d.tracks.multiplicacao.stars[2]===3, 'multiplicação: level antigo 3 (11–19 × 1 dígito) → novo 4');
  ok(d.tracks.expressoes.level===4 && d.tracks.expressoes.ladder===1 && d.tracks.expressoes.stars[1]===3, 'expressões não são remapeadas (só ganharam levels no fim)');
  ok(d.seenTips['soma:6'] && !d.seenTips['soma:5'] && d.seenTips['multiplicacao:4'] && d.seenTips['divisao:2'], 'dicas já vistas acompanham os levels (o level novo ainda mostra a dica): '+JSON.stringify(d.seenTips));
  ok(d.log[0][2]===6 && d.log[1][2]===5, 'histórico de contas acompanha só a trilha migrada');
  ok(d.events[0].level===6 && d.events[0].newLevel===7 && d.events[1].level===2, 'marcos acompanham o level');
  // idempotente: normalizar de novo (ou recarregar) não remapeia outra vez
  const again = Store.normalize(JSON.parse(JSON.stringify(d)));
  ok(again.tracks.soma.level===6 && again.tracks.soma.stars[6]===2 && again.log[0][2]===6 && again.seenTips['soma:6'], 'migração roda uma vez só');
  // quem tinha concluído a trilha reabre no primeiro level novo (sem estrela), com as estrelas mantidas
  const allOld = {}; for(let l=1;l<=8;l++) allOld[l] = 3;
  const done = Store.normalize({tracks:{soma:{placed:true, level:8, done:true, rank:2, stars:allOld}}}).tracks.soma;
  ok(done.done===false && done.level===5 && done.rank===0 && done.stars[10]===3 && done.stars[4]===3, 'soma concluída antes reabre no 1º level novo (L5): done='+done.done+' level='+done.level);
  // dado novo e dado sem trilhas
  ok(Store.normalize({}).tracks.soma===undefined && Engine.newTrack('soma').ladder===2 && Engine.newTrack('expressoes').ladder===1, 'trilha nova já nasce na escada nova');
}

/* ---------- 3. MOTOR ---------- */
// 3a. nivelamento: usuário forte termina alto, usuário fraco termina baixo
{
  freshStore();
  const key = 'multiplicacao', n = TRACKS[key].levels.length;
  const strong = runBlock({kind:'placement', track:key, level:Engine.startLevel(key), count:PLACEMENT_ITEMS}, it=>({correct:true, ms:it.goalMs*0.6}));
  const lvStrong = Engine.track(key).level;
  ok(Engine.track(key).placed, 'nivelamento marca a trilha como nivelada');
  ok(strong.some(o=>o.out.events.some(e=>e.type==='placed')), 'nivelamento emite evento placed');
  freshStore();
  runBlock({kind:'placement', track:key, level:Engine.startLevel(key), count:PLACEMENT_ITEMS}, it=>({correct:false, ms:it.goalMs*3, typed:'7777777'}));
  const lvWeak = Engine.track(key).level;
  ok(lvStrong>lvWeak, 'nivelamento: forte ('+lvStrong+') > fraco ('+lvWeak+')');
  ok(lvStrong<=n && lvWeak>=1, 'nivelamento dentro dos limites');
  ok(lvStrong>=Engine.startLevel(key), 'usuário que acerta tudo rápido não começa abaixo do ponto médio');
  ok(lvWeak<=Math.max(2, Engine.startLevel(key)-1), 'usuário que erra tudo começa baixo (level '+lvWeak+')');
}
// 3b. passo de m: pequeno, sobe no sucesso, desce no fracasso, nunca sai de [0,1]
{
  freshStore(); placeAll(3, 0.5);
  const tr = Engine.track('soma'); let maxStep = 0;
  const run = (correct, ms)=>runBlock({kind:'practice', track:'soma', level:3, count:BLOCK_MAX}, it=>{ return {correct, ms:it.goalMs*ms}; });
  let before = tr.m;
  run(true, 0.5); ok(tr.m>before, 'm sobe quando acerta rápido');
  before = tr.m;
  run(false, 2.5); ok(tr.m<before, 'm desce quando erra');
  for(let r=0;r<40;r++){
    runBlock({kind:'practice', track:'soma', level:3, count:BLOCK_MAX}, it=>{ const m0 = tr.m; const c = Math.random()<0.6; setImmediate; return {correct:c, ms:it.goalMs*(c?0.8:2)}; });
  }
  // passo máximo teórico = M_ETA * max(1-rho, rho) < 0.06
  ok(M_ETA*Math.max(1-Engine.rho(), Engine.rho()) < 0.06, 'passo máximo de m por conta é pequeno');
  ok(tr.m>=0 && tr.m<=1, 'm permanece em [0,1]');
}
// 3c. convergência: m se estabiliza onde a taxa de sucesso ≈ ρ*
{
  freshStore(); placeAll(4, 0.1);
  const tr = Engine.track('multiplicacao'); tr.placed = true; tr.level = 4; tr.m = 0.1;
  let succ = 0, tot = 0;
  for(let r=0;r<120;r++){
    runBlock({kind:'practice', track:'multiplicacao', level:4, count:BLOCK_MAX}, it=>{
      const p = 1/(1+Math.exp(6*(it.m-0.7)));   // usuário cujo ponto de equilíbrio está perto de m≈0.55+
      const c = Math.random()<p; if(r>=60){ tot++; if(c) succ++; }
      tr.testReady = false; tr.xp = 0;           // isola o teste de qualquer prova
      return {correct:c, ms:it.goalMs*(c?0.8:2)};
    });
  }
  ok(Math.abs(succ/tot-Engine.rho())<0.08, 'taxa de sucesso estável ('+(succ/tot).toFixed(2)+') perto de ρ*='+Engine.rho());
}
// 3d. nunca desce de level por erros; XP nunca negativo
{
  freshStore(); placeAll(4, 0.3);
  const tr = Engine.track('soma');
  let minXp = Infinity;
  for(let r=0;r<30;r++){
    runBlock({kind:'practice', track:'soma', level:tr.level, count:BLOCK_MAX}, it=>({correct:false, ms:it.goalMs*3, typed:'999999'}));
    minXp = Math.min(minXp, tr.xp);
  }
  ok(tr.level>=3, 'errar muito nunca derruba o level (level='+tr.level+')');
  ok(minXp>=0, 'XP da barra nunca fica negativo');
}
// 3e. XP por zona e multiplicadores
{
  freshStore(); placeAll(3, 0.5);
  const it = Engine.generateItem('soma', 3, 0.5, {kind:'practice'});
  ok(Engine.zone(it.goalMs*0.9, it.goalMs)==='fast' && Engine.zone(it.goalMs*1.5, it.goalMs)==='ok' && Engine.zone(it.goalMs*2, it.goalMs)==='slow', 'zonas fast/ok/slow');
  ok(Engine.xpFor(it,'fast')>Engine.xpFor(it,'ok') && Engine.xpFor(it,'ok')>Engine.xpFor(it,'slow'), 'XP decresce com a zona');
  const warm = Object.assign({}, it, {isWarmup:true});
  ok(Engine.xpFor(warm,'fast')<Engine.xpFor(it,'fast'), 'aquecimento rende menos XP');
}
// 3f. barra cheia + m alto libera a prova; barra cheia com m baixo espera
{
  freshStore(); placeAll(3, 0.2);
  const tr = Engine.track('soma'); tr.xp = Engine.xpNeed(tr)-1; tr.m = 0.1;
  runBlock({kind:'practice', track:'soma', level:3, count:BLOCK_MAX}, it=>({correct:true, ms:it.goalMs*0.5}));
  // m sobe aos poucos; a prova só libera quando m>=TEST_READY_M
  let guard = 0;
  while(!tr.testReady && guard++<80){ runBlock({kind:'practice', track:'soma', level:3, count:BLOCK_MAX}, it=>({correct:true, ms:it.goalMs*0.5})); }
  ok(tr.testReady, 'prova liberada com barra cheia e m alto');
  ok(tr.m>=TEST_READY_M, 'prova só libera com m>=TEST_READY_M (m='+tr.m.toFixed(2)+')');
  const plan = Engine.planRound();
  ok(!plan.some(b=>b.kind==='test' || b.kind==='climb'), 'barra cheia só RECOMENDA: nenhuma prova/subida é imposta na rodada');
}
// 3f2. subida pedida pela pessoa: só a trilha pedida recebe contas do level seguinte
{
  freshStore(); placeAll(3, 0.5);
  const tr = Engine.track('multiplicacao'), soma = Engine.track('soma');
  ok(Engine.canClimb(tr) && Engine.startClimb('multiplicacao') && tr.climb && tr.climb.level===4, 'pedido registra subida para o level seguinte');
  ok(!Engine.startClimb('multiplicacao'), 'não duplica pedido');
  const plan = Engine.planRound();
  const cb = plan.filter(b=>b.kind==='climb');
  ok(cb.length===1 && cb[0].track==='multiplicacao' && cb[0].level===4, 'rodada geral tem bloco de subida só da trilha pedida');
  ok(cb[0].count<=CLIMB_BLOCK_MAX, 'rodada geral limita as contas de subida por bloco');
  ok(plan.filter(b=>b.track!=='multiplicacao').every(b=>b.level<=3), 'demais trilhas seguem no level normal');
  const only = Engine.planRound({onlyTrack:'multiplicacao'});
  ok(only.some(b=>b.kind==='climb' && b.count===CLIMB_ITEMS), 'treinar só a trilha traz todas as contas de subida');
  // aprovação (em duas rodadas)
  const mBefore = tr.m, sBefore = soma.level;
  let outs = runBlock({kind:'climb', track:'multiplicacao', level:4, count:5}, it=>({correct:true, ms:it.goalMs*0.7}));
  ok(outs.every(o=>o.item.level===4 && o.item.kind==='climb'), 'contas da subida vêm do level seguinte');
  ok(!outs[outs.length-1].out.blockResult.test && tr.climb && tr.climb.results.length===5, 'sem decisão antes de completar as contas');
  outs = runBlock({kind:'climb', track:'multiplicacao', level:4, count:CLIMB_ITEMS-5}, it=>({correct:true, ms:it.goalMs*0.7}));
  const r = outs[outs.length-1].out.blockResult.test;
  ok(r && r.pass && r.leveledUp && tr.level===4 && !tr.climb && tr.stars[3]>=1, 'acertos suficientes sobem de level e limpam o pedido');
  ok(tr.m<=0.2 && tr.xp===0 && !tr.testReady, 'm e barra recomeçam no level novo');
  ok(soma.level===sBefore, 'outras trilhas não mudam');
  // reprovação: nada se perde
  Engine.startClimb('multiplicacao'); const lv = tr.level, st = tr.stars[lv], xp0 = tr.xp;
  outs = runBlock({kind:'climb', track:'multiplicacao', level:lv+1, count:CLIMB_ITEMS}, it=>({correct:false, ms:it.goalMs*2, typed:'99999'}));
  const o = outs[outs.length-1].out;
  ok(o.blockResult.test && !o.blockResult.test.pass && tr.level===lv && !tr.climb, 'erros não sobem e o pedido some');
  ok(o.events.some(e=>e.type==='climbFailed') && tr.xp===xp0 && tr.stars[lv]===st, 'reprovar não tira XP, estrelas nem level');
  ok(Engine.canClimb(tr), 'dá para pedir de novo');
  // lapsos de digitação não contam; limiar de acertos
  Engine.startClimb('multiplicacao'); let i = 0;
  outs = runBlock({kind:'climb', track:'multiplicacao', level:lv+1, count:CLIMB_ITEMS}, it=>({correct:(i++%4!==0), ms:it.goalMs*0.9, typed:'99999'}));
  const r2 = outs[outs.length-1].out.blockResult.test;
  ok(r2 && r2.pass===(r2.correct>=Engine.climbPassNeed(CLIMB_ITEMS)), 'decisão segue o limiar de acertos ('+r2.correct+'/'+CLIMB_ITEMS+')');
  // acerta mas lento → não sobe
  const lv2 = tr.level; Engine.startClimb('multiplicacao');
  outs = runBlock({kind:'climb', track:'multiplicacao', level:lv2+1, count:CLIMB_ITEMS}, it=>({correct:true, ms:it.goalMs*4}));
  ok(!outs[outs.length-1].out.blockResult.test.pass && tr.level===lv2, 'acertar tudo muito devagar não sobe');
  // persistência e cancelamento
  Engine.startClimb('multiplicacao'); runBlock({kind:'climb', track:'multiplicacao', level:tr.level+1, count:3}, it=>({correct:true, ms:it.goalMs}));
  const copy = Store.normalize(JSON.parse(JSON.stringify(Store.data)));
  ok(copy.tracks.multiplicacao.climb && copy.tracks.multiplicacao.climb.results.length===3, 'subida em andamento sobrevive ao salvar/carregar');
  Engine.cancelClimb('multiplicacao'); ok(!tr.climb, 'cancelar remove o pedido');
  // último level: subir = concluir a trilha
  const dv = Engine.track('divisao'), n = TRACKS.divisao.levels.length; dv.level = n;
  Engine.startClimb('divisao'); ok(dv.climb.level===n, 'no último level a subida mira o próprio level');
  runBlock({kind:'climb', track:'divisao', level:n, count:CLIMB_ITEMS}, it=>({correct:true, ms:it.goalMs*0.5}));
  ok(dv.done, 'passar na subida do último level conclui a trilha');
}
// 3f3. subida automática: só com evidência forte
{
  freshStore(); placeAll(3, 0.95);
  const tr = Engine.track('soma'); tr.xp = Engine.xpNeed(tr)-1;
  for(let i=0;i<8 && tr.level===3;i++) runBlock({kind:'practice', track:'soma', level:3, count:BLOCK_MAX}, it=>({correct:true, ms:it.goalMs*0.5}));
  ok(tr.level===4 && !tr.testReady && tr.stars[3]>=1, 'app sobe sozinho com m alto, 20 contas ≥95% e rápidas');
  freshStore(); placeAll(3, 0.95);
  const t2 = Engine.track('soma'); t2.xp = Engine.xpNeed(t2)-1; let i = 0;
  for(let r=0;r<8;r++) runBlock({kind:'practice', track:'soma', level:3, count:BLOCK_MAX}, it=>({correct:true, ms:it.goalMs*1.4}));
  ok(t2.level===3 && t2.testReady, 'correto porém sem rapidez: só recomenda, não sobe sozinho');
  freshStore(); placeAll(3, 0.7);
  const t3 = Engine.track('soma'); t3.testReady = true;
  t3.window = Array.from({length:AUTO_UP_ITEMS}, ()=>({ms:500, correct:true, zone:'fast', lapse:false, level:3, kind:'practice'}));
  Engine._maybeAutoLevelUp(t3, {events:[]});
  ok(t3.level===3, 'm abaixo de '+AUTO_UP_M+': não sobe sozinho');
  t3.m = 0.95; Engine._maybeAutoLevelUp(t3, {events:[]});
  ok(t3.level===4, 'm no topo + janela perfeita: sobe');
}
// 3f4. contas grandes × pequenas: limite decide, meta só bonifica
{
  freshStore(); placeAll(6, 0.5);
  const tr = Engine.track('soma');
  let big=0, small=0, mS=[], mB=[];
  for(let r=0;r<10;r++) runBlock({kind:'practice', track:'soma', level:6, count:BLOCK_MAX}, it=>{
    if(!it.isWarmup){ if(it.size==='big'){ big++; mB.push(it.m); } else { small++; mS.push(it.m); } }
    return {correct:true, ms:it.goalMs*0.9};
  });
  ok(Math.abs(big-small)<=big*0.4+3 && big>0 && small>0, 'metade grande / metade pequena ('+big+'/'+small+')');
  ok(U.mean(mB)>U.mean(mS)+0.3, 'contas grandes vêm da parte alta do level');
  let gapsOk = true, orderOk = true;
  TRACK_ORDER.forEach(k=>TRACKS[k].levels.forEach((lv,i)=>{
    const a = levelTimes(k,i+1,'small'), b = levelTimes(k,i+1,'big');
    if(!(a.meta<a.limit && b.meta<b.limit && a.limit<b.limit)) orderOk = false;
    if(a.limit-a.meta>2000 || b.limit-b.meta>2000) gapsOk = false;
  }));
  ok(orderOk && gapsOk, 'meta < limite, pequena < grande, folga da meta ≤ 2 s em todos os levels');
  const g = levelTimes('soma',10,'big');
  ok(g.limit>=10000 && g.limit<=13000, 'Soma Nv10 (4 dígitos + 4 dígitos): limite grande ≈ '+(g.limit/1000)+'s');
  // entre a meta e o limite: vale como "no tempo" (não bloqueia), só rende menos XP
  const it = Engine.generateItem('soma', 6, 0.5, {kind:'practice', size:'big'});
  const mid = (it.goalMs+it.limitMs)/2;
  ok(Engine.zone(it.goalMs*0.95, it.goalMs, it.limitMs)==='fast' && Engine.zone(mid, it.goalMs, it.limitMs)==='ok' && Engine.zone(it.limitMs*1.1, it.goalMs, it.limitMs)==='slow', 'zonas: meta → fast, até o limite → ok, depois slow');
  ok(Engine.xpFor(it,'fast')>Engine.xpFor(it,'ok'), 'bater a meta rende XP extra');
  // subida: acertar tudo entre a meta e o limite passa (meta não bloqueia)
  Engine.startClimb('soma');
  const outs = runBlock({kind:'climb', track:'soma', level:7, count:CLIMB_ITEMS}, it2=>({correct:true, ms:(it2.goalMs+it2.limitMs)/2}));
  ok(outs[outs.length-1].out.blockResult.test.pass, 'tempo entre meta e limite sobe de level (meta não bloqueia)');
  // grandes contas lentas porém dentro do limite grande não reprovam
  freshStore(); placeAll(6, 0.5); Engine.startClimb('soma');
  const o2 = runBlock({kind:'climb', track:'soma', level:7, count:CLIMB_ITEMS}, it2=>({correct:true, ms:it2.limitMs*0.95}));
  ok(o2[o2.length-1].out.blockResult.test.pass, 'tudo logo abaixo do limite ainda passa');
  freshStore(); placeAll(6, 0.5); Engine.startClimb('soma');
  const o3 = runBlock({kind:'climb', track:'soma', level:7, count:CLIMB_ITEMS}, it2=>({correct:true, ms:it2.limitMs*1.5}));
  ok(!o3[o3.length-1].out.blockResult.test.pass, 'tudo acima do limite não passa');
}
// 3g. prova: aprovação sobe o level e dá estrelas; reprovação mantém o level
{
  freshStore(); placeAll(3, 0.7);
  const tr = Engine.track('soma'); tr.xp = Engine.xpNeed(tr); tr.testReady = true;
  const outs = runBlock({kind:'test', track:'soma', level:3, count:TEST_ITEMS}, it=>({correct:true, ms:it.goalMs*0.7}));
  const last = outs[outs.length-1].out;
  ok(last.blockDone && last.blockResult.test.pass, 'prova perfeita é aprovada');
  ok(last.blockResult.test.stars===3, 'prova perfeita e rápida vale 3 estrelas');
  ok(tr.level===4 && !tr.testReady && tr.xp===0, 'aprovação sobe de level e zera a barra');
  ok(tr.stars[3]===3, 'estrelas gravadas no level');
  ok(tr.m<=0.2, 'm recomeça confortável no level novo');
  ok(last.events.some(e=>e.type==='levelUp'), 'evento levelUp');
  // reprova (acertos suficientes mas lento)
  tr.xp = Engine.xpNeed(tr); tr.testReady = true; const lvBefore = tr.level;
  const o2 = runBlock({kind:'test', track:'soma', level:tr.level, count:TEST_ITEMS}, it=>({correct:true, ms:it.goalMs*3}));
  ok(!o2[o2.length-1].out.blockResult.test.pass, 'prova correta porém lenta reprova');
  ok(tr.level===lvBefore, 'reprovar nunca derruba o level');
  ok(!tr.testReady && tr.xp===Math.round(Engine.xpNeed(tr)*TEST_FAIL_XP_KEEP), 'reprovar devolve a barra a '+TEST_FAIL_XP_KEEP*100+'%');
  // reprova por erros
  tr.testReady = true; tr.xp = Engine.xpNeed(tr); let i = 0;
  const o3 = runBlock({kind:'test', track:'soma', level:tr.level, count:TEST_ITEMS}, it=>({correct:(i++%2===0), ms:it.goalMs, typed:'99999'}));
  ok(!o3[o3.length-1].out.blockResult.test.pass, 'metade de erros reprova');
}
// 3g2. refazer prova de level conquistado: melhora estrelas sem mexer no level atual
{
  freshStore(); placeAll(4, 0.5);
  const tr = Engine.track('soma'); tr.stars[2] = 1;
  const plan = Engine.planRound({retake:{key:'soma', level:2}});
  ok(plan.length===1 && plan[0].kind==='test' && plan[0].level===2, 'retake gera um bloco de prova do level escolhido');
  ok(Engine.planRound({retake:{key:'soma', level:4}}).length!==1 || Engine.planRound({retake:{key:'soma', level:4}})[0].kind!=='test' || false, 'retake do level atual não é aceito');
  const outs = runBlock(plan[0], it=>({correct:true, ms:it.goalMs*0.6}));
  const r = outs[outs.length-1].out.blockResult.test;
  ok(r.pass && r.retake && tr.stars[2]===r.stars && tr.stars[2]>1 && tr.level===4, 'retake aprovado melhora as estrelas e mantém o level');
}
// 3h. lapso (digitação trocada / impulso) não pune m nem XP, e a conta da prova é reposta
{
  ok(Engine.isTypoLapse('45','54') && Engine.isTypoLapse('57','56') && !Engine.isTypoLapse('12','56') && !Engine.isTypoLapse('5','7'), 'isTypoLapse');
  freshStore(); placeAll(3, 0.5);
  const tr = Engine.track('soma'); const m0 = tr.m;
  Engine.beginBlock({kind:'practice', track:'soma', level:3, count:6});
  const it = Engine.nextItem();
  const out = Engine.registerResult(it, 100, false, false, '1');
  ok(out.lapse && tr.m===m0, 'erro rápido demais é lapso e não mexe em m');
  freshStore(); placeAll(3,0.5);
  Engine.beginBlock({kind:'test', track:'soma', level:3, count:TEST_ITEMS});
  const t1 = Engine.nextItem(); Engine.registerResult(t1, 100, false, false, '1');
  ok(Engine.block.count===TEST_ITEMS+1, 'lapso na prova repõe a conta');
}
// 3i. blocos: um level, uma trilha; aquecimento só no 1º bloco da trilha na rodada
{
  freshStore(); placeAll(4, 0.5);
  for(let r=0;r<30;r++){
    const plan = Engine.planRound();
    const seen = {};
    plan.forEach(b=>{
      if(b.kind==='practice'){
        if(seen[b.track]) ok(b.warmup===0, 'aquecimento só no primeiro bloco da trilha na rodada');
        seen[b.track] = true;
      }
    });
    const tot = plan.reduce((a,b)=>a+(b.kind==='practice'?b.count-b.warmup:b.count),0);
    ok(tot>=Engine.roundSize()-1, 'rodada tem o tamanho pedido ('+tot+')');
    // nenhum bloco repete a trilha do anterior (há mais de uma ativa)
    for(let i=1;i<plan.length;i++) if(plan[i].kind==='practice' && plan[i-1].kind==='practice') ok(plan[i].track!==plan[i-1].track, 'trilhas consecutivas diferem');
  }
  // contas de um bloco de treino têm sempre a mesma forma de dígitos
  const tr = Engine.track('multiplicacao'); tr.level = 5; tr.m = 0.5;
  let shapes = new Set();
  runBlock({kind:'practice', track:'multiplicacao', level:5, count:40}, it=>{ if(!it.isWarmup) shapes.add(Math.max(digitCount(it.a),digitCount(it.b))+'x'+Math.min(digitCount(it.a),digitCount(it.b))); return {correct:true, ms:it.goalMs}; });
  ok(shapes.size===1, 'bloco de multiplicação mantém uma forma só: '+[...shapes]);
}
// 3i2. aquecimento relâmpago: só nas 4 operações básicas
{
  freshStore(); placeAll(4, 0.5);
  const w = k=>Engine.generateItem(k, 3, 0.5, {kind:'practice', isWarmup:true}).isMasteredFlash;
  ok(w('soma') && w('subtracao') && w('multiplicacao') && w('divisao'), 'aquecimento relâmpago vale nas 4 operações');
  ok(!w('porcentagem') && !w('decimais') && !w('fracoes') && !w('expressoes') && !w('equacoes'), 'aquecimento relâmpago não vale nas demais trilhas');
  Store.data.settings.masteryFlash = false; ok(!w('soma'), 'desligado nos ajustes não borra');
}
// 3i3. escolha das contas que podem sumir
{
  freshStore(); placeAll(4, 0.5);
  Store.data.settings.flashTracks = ['soma'];
  const w = k=>Engine.generateItem(k, 3, 0.5, {kind:'practice', isWarmup:true}).isMasteredFlash;
  ok(w('soma') && !w('subtracao') && !w('multiplicacao') && !w('divisao'), 'só a trilha escolhida borra no aquecimento');
  Store.data.settings.flashTracks = [];
  ok(!w('soma'), 'nenhuma trilha escolhida = nada borra');
  const n = Store.normalize({settings:{flashTracks:['soma','porcentagem','x']}}); ok(n.settings.flashTracks.length===1 && n.settings.flashTracks[0]==='soma', 'flashTracks inválidas são saneadas');
  ok(Store.normalize({}).settings.flashTracks.length===4, 'padrão: as 4 operações');
}
// 3j. reforço suave: patinar com m no mínimo faz o próximo bloco rodar um level abaixo (sem perder level)
{
  freshStore(); placeAll(4, 0.1);
  const tr = Engine.track('soma'); tr.m = 0.05; let triggered = false;
  for(let r=0;r<20 && !triggered;r++){
    const outs = runBlock({kind:'practice', track:'soma', level:4, count:BLOCK_MAX}, it=>({correct:false, ms:it.goalMs*3, typed:'9999999'}));
    triggered = outs.some(o=>o.out.events.some(e=>e.type==='reinforce'));
    if(triggered) break;
    tr.m = Math.min(tr.m, 0.05);
  }
  ok(triggered && tr.reinforce===1, 'reforço é acionado após muitos erros com m no piso');
  ok(tr.level===4, 'reforço não tira level');
  ok(tr.m>=REINFORCE_M, 'm volta a um ponto confortável');
  const plan = Engine.planRound({onlyTrack:'soma'});
  ok(plan.some(b=>b.reinforce && b.level===3), 'próximo bloco é de reforço um level abaixo');
  runBlock(plan.find(b=>b.reinforce), it=>({correct:true, ms:it.goalMs*0.8}));
  ok(tr.reinforce===0, 'reforço termina depois de um bloco');
}
// 3k. última trilha concluída entra em "Mestre": patentes e meta que encolhe
{
  freshStore(); placeAll(1); const key='divisao'; const n = TRACKS[key].levels.length;
  const tr = Engine.track(key); tr.level = n; tr.m = 0.8; tr.xp = Engine.xpNeed(tr); tr.testReady = true;
  const outs = runBlock({kind:'test', track:key, level:n, count:TEST_ITEMS}, it=>({correct:true, ms:it.goalMs*0.5}));
  ok(tr.done && outs[outs.length-1].out.blockResult.test.finished, 'passar no último level conclui a trilha');
  const g0 = Engine.goalMs(tr);
  let rankUps = 0, guard = 0;
  while(tr.rank<RANK_MAX && guard++<400){
    const o = runBlock({kind:'practice', track:key, level:n, count:BLOCK_MAX}, it=>({correct:true, ms:it.goalMs*0.5}));
    rankUps += o.filter(x=>x.out.events.some(e=>e.type==='rankUp')).length;
  }
  ok(tr.rank===RANK_MAX && rankUps===RANK_MAX, 'sobe todas as patentes Mestre');
  ok(Engine.goalMs(tr)<g0, 'meta de tempo encolhe a cada patente');
}
// 3l. simulação: usuários virtuais — nenhum NaN, acerto perto de ρ*, level cresce com a habilidade
{
  const gauss=()=>{ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  const sim = ab=>{
    freshStore(); let items=0, correct=0, bad=false;
    for(let r=0;r<40;r++){
      Engine.activeKeys().forEach(k=>{ const t=Engine.track(k); if(t.placed && t.testReady && Engine.canClimb(t)) Engine.startClimb(k); });   // a pessoa aceita o "Recomendado"
      for(const spec of Engine.planRound()){
        Engine.beginBlock(spec); let item;
        while((item=Engine.nextItem())){
          const g = (item.level+item.m)-ab, pc = 1/(1+Math.exp(2.5*(g-1)));
          const c = Math.random()<pc, ms = Math.max(400, Math.round(0.9*Math.exp(0.55*g)*Math.exp(0.25*gauss())*item.goalMs));
          const tr = Engine.track(item.key);
          Engine.registerResult(item, ms, c, false, c?String(item.answer):String(item.answer+7));
          items++; if(c) correct++;
          if(!Number.isFinite(tr.m)||!Number.isFinite(tr.xp)||!Number.isFinite(tr.strength)) bad = true;
        }
      }
    }
    const avgLevel = Engine.activeKeys().reduce((a,k)=>a+Engine.track(k).level/TRACKS[k].levels.length,0)/Engine.activeKeys().length;
    return {acc:correct/items, avgLevel, bad};
  };
  const lo = sim(1.5), hi = sim(6.5);
  ok(!lo.bad && !hi.bad, 'simulação sem NaN');
  ok(hi.avgLevel>lo.avgLevel+0.2, 'usuário mais hábil chega a levels mais altos ('+lo.avgLevel.toFixed(2)+' → '+hi.avgLevel.toFixed(2)+')');
  ok(lo.acc>0.6 && lo.acc<0.95 && hi.acc>0.6 && hi.acc<0.95, 'acerto médio fica numa faixa saudável (iniciante '+lo.acc.toFixed(2)+', avançado '+hi.acc.toFixed(2)+')');
}

/* ---------- 4. PROGRESS ---------- */
{
  freshStore();
  for(let n=1;n<60;n++) ok(Progress.levelFloorXp(n+1)>Progress.levelFloorXp(n), 'piso de XP cresce (nível '+n+')');
  ok(Progress.levelInfo(0).level===1 && Progress.levelInfo(Progress.levelFloorXp(5)).level===5 && Progress.levelInfo(Progress.levelFloorXp(5)-1).level===4, 'levelInfo respeita os pisos');
  const li = Progress.levelInfo(250); ok(li.frac>=0 && li.frac<1 && li.into+Progress.levelFloorXp(li.level)===250, 'levelInfo.frac/into coerentes');
  const r = Progress.addXp(100000); ok(r.leveledUp && r.to>r.from, 'addXp reporta subida de nível');
  ok(Progress.addDays('2026-03-01',-1)==='2026-02-28' && Progress.addDays('2026-12-31',1)==='2027-01-01', 'addDays (mês/ano)');
  // meta diária e sequência
  freshStore(); Store.data.settings.dailyGoal = 20;
  const today = Progress.dayKey(); let justHit = 0;
  for(let i=0;i<25;i++){ if(Progress.recordItem(true).goalJustHit) justHit++; }
  ok(justHit===1, 'meta diária dispara uma única vez');
  ok(Store.data.streak.current===1 && Store.data.streak.lastGoalDay===today, 'primeiro dia vira sequência 1');
  freshStore(); Store.data.settings.dailyGoal = 20;
  Store.data.streak = {current:3, best:3, lastGoalDay:Progress.addDays(today,-1)};
  for(let i=0;i<20;i++) Progress.recordItem(true);
  ok(Store.data.streak.current===4 && Store.data.streak.best===4, 'dia seguinte estende a sequência');
  freshStore(); Store.data.settings.dailyGoal = 20;
  Store.data.streak = {current:5, best:5, lastGoalDay:Progress.addDays(today,-3)};
  ok(Progress.currentStreak()===0, 'sequência antiga não é exibida');
  for(let i=0;i<20;i++) Progress.recordItem(true);
  ok(Store.data.streak.current===1 && Store.data.streak.best===5, 'buraco de dias reinicia a sequência mas preserva o recorde');
  freshStore(); Store.data.streak = {current:2, best:2, lastGoalDay:Progress.addDays(today,-1)};
  ok(Progress.streakAtRisk() && Progress.currentStreak()===2, 'sequência em risco quando ontem bateu e hoje ainda não');
  ok(Progress.weekStrip().length===7 && Progress.weekStrip()[6].today, 'faixa da semana tem 7 dias terminando hoje');
  ok(Progress.roundStars(0.95,0.7)===3 && Progress.roundStars(0.85,0.1)===2 && Progress.roundStars(0.4,0)===1, 'estrelas da rodada (mínimo 1)');
  // meta por tempo: o relógio do dia
  freshStore(); Store.data.settings.goalMode = 'time'; Store.data.settings.dailyGoalMinutes = 1;
  ok(Progress.todayMs()===0 && Progress.addTime(30000).goalJustHit===false && Math.abs(Progress.goalFrac()-0.5)<1e-9, 'meta por tempo: relógio soma e a fração anda');
  for(let i=0;i<5;i++) Progress.recordItem(true);
  ok(!Progress.day().goalHit, 'meta por tempo: contas não batem a meta');
  ok(Progress.addTime(30000).goalJustHit===true && Progress.day().goalHit && Store.data.streak.current===1, 'meta por tempo: bate ao completar o tempo e abre a sequência');
  ok(Progress.addTime(5000).goalJustHit===false, 'meta por tempo: dispara uma única vez');
  Store.data.dayTimer = {day:Progress.addDays(today,-1), ms:99999};
  ok(Progress.todayMs()===0 && Store.data.dayTimer.day===today, 'relógio zera quando o dia muda');
  freshStore(); Store.data.settings.dailyGoal = 20; Progress.addTime(3600000);
  ok(!Progress.day().goalHit && Progress.todayMs()===3600000, 'meta por contas: tempo acumula mas não bate a meta');
  ok(U.fmtClock(65000)==='1:05' && U.fmtClock(3725000)==='1:02:05' && U.fmtClock(-5)==='0:00', 'fmtClock');
  // poda do histórico diário
  freshStore(); for(let i=0;i<DAILY_KEEP_DAYS+30;i++){ Store.data.daily[Progress.addDays(today,-i-5)] = {items:1,correct:1,xp:1,goalHit:false}; }
  Progress.prune(); ok(Object.keys(Store.data.daily).length<=DAILY_KEEP_DAYS, 'poda dias antigos');
}

/* ---------- 5. STORAGE ---------- */
{
  const junk = Store.normalize({settings:{appLang:'xx', theme:5, dailyGoal:'abc', goalMode:'xx', goalAlert:3, dailyGoalMinutes:-5, roundSize:'gigante', challenge:null, activeTracks:['nada'], gapMs:'abc', fontScale:3},
    tracks:{soma:{ladder:2, level:99, xp:-5, m:7, rank:42, stars:{'1':9,'x':1}, window:'oops'}, inexistente:{level:1}}, player:{xp:'a'}, daily:{'ontem':{}, '2026-01-01':{items:'5'}}, streak:{current:-4}});
  ok(junk.settings.appLang==='pt' && junk.settings.theme==='dark' && junk.settings.dailyGoal===DEFAULT_DAILY_GOAL && junk.settings.goalMode==='count' && junk.settings.goalAlert==='discreet' && junk.settings.dailyGoalMinutes===DEFAULT_DAILY_GOAL_MINUTES && junk.settings.roundSize==='normal' && junk.settings.challenge==='balanced', 'ajustes inválidos viram padrão');
  ok(junk.settings.activeTracks.length>0 && junk.settings.gapMs>=100 && junk.settings.fontScale===1, 'listas/limites saneados');
  const s = junk.tracks.soma;
  ok(s && s.level===TRACKS.soma.levels.length && s.xp===0 && s.m===1 && s.rank===RANK_MAX && Array.isArray(s.window) && s.stars['1']===3 && !junk.tracks.inexistente, 'trilha corrompida é saneada');
  ok(junk.player.xp===0 && !junk.daily.ontem && junk.daily['2026-01-01'].items===5 && junk.streak.current===0, 'jogador/dias/sequência saneados');
  // meta livre: qualquer inteiro ≥ 1, limitado aos máximos
  ok(Store.normalize({settings:{dailyGoal:7}}).settings.dailyGoal===7 && Store.normalize({settings:{dailyGoal:123456}}).settings.dailyGoal===DAILY_GOAL_MAX && Store.normalize({settings:{dailyGoalMinutes:45}}).settings.dailyGoalMinutes===45 && Store.normalize({settings:{dailyGoalMinutes:99999}}).settings.dailyGoalMinutes===DAILY_GOAL_MINUTES_MAX, 'meta diária aceita qualquer número (com teto)');
  ok(Store.normalize({dayTimer:{day:'lixo', ms:-3}}).dayTimer.ms===0 && Store.normalize({dayTimer:{day:'2026-01-02', ms:5000}}).dayTimer.ms===5000, 'relógio do dia saneado');
  // migração v2 → v3
  localStorage._data = {};
  localStorage.setItem('calcrapido_db_v2', JSON.stringify({settings:{appLang:'en', theme:'light', tts:true, voiceRate:1.4, mode:'hiit', selectedSkills:['x']}, history:[{date:1,total:10,accuracy:0.9,avgTime:1000}], bestStreak:12, speedProfiles:{a:1}}));
  Store.load();
  ok(Store.data.settings.appLang==='en' && Store.data.settings.theme==='light' && Store.data.settings.tts===true && Store.data.settings.voiceRate===1.4, 'migração preserva ajustes');
  ok(Store.data.history.length===1 && Store.data.bestStreak===12 && !Store.data.onboarded && Object.keys(Store.data.tracks).length===0, 'migração preserva histórico e recomeça o nivelamento');
  ok(!('mode' in Store.data.settings) && localStorage.getItem('calcrapido_db_v3')!==null, 'migração grava no formato v3');
  Store.data.settings.appLang = 'pt';
  // ida e volta
  freshStore(); Engine.track('soma').level = 4; Engine.track('soma').placed = true;
  Store._persist(); Store.load();
  ok(Store.data.tracks.soma.level===4 && Store.data.tracks.soma.placed, 'salvar e recarregar mantém a trilha');
  // textos: PT e EN têm as mesmas chaves
  const pk = Object.keys(I18N.pt), ek = Object.keys(I18N.en);
  ok(pk.every(k=>ek.includes(k)) && ek.every(k=>pk.includes(k)), 'i18n: PT e EN têm as mesmas chaves');
}

/* ---------- 6. SESSION (UI muda) ---------- */
{
  freshStore(); Store.data.settings.gapMs = 0; Store.data.settings.correctAnswerShowMs = 0; Store.data.settings.confirmBeforeAccept = false;
  placeAll(3, 0.5);
  const noop = ()=>{}; let summary = null, intros = 0, results = 0; const goalScreens = []; let goalAction = (go)=>go();
  Object.assign(UI, {resetTraining:noop, showScreen:noop, setBlockChip:noop, setItemChip:noop, updateHud:noop, popXp:noop, setPaused:noop, celebrate:noop,
    toast:noop, flashAnswer:noop, pushPulse:noop, clearAnswerFeedback:noop, showCorrectAnswer:noop, showHint:noop, setMasteryBlur:noop,
    updateAnswerDisplay:noop, setKeypadMode:noop, setTab:noop, renderHome:noop, hideOverlays:noop,
    updateHudTime:noop, showGoalReached:(info,go,exit)=>{ goalScreens.push(info); setTimeout(()=>goalAction(go,exit),0); }, renderQuestion:(item,ready)=>ready(), renderSummary:s=>{ summary = s; },
    showBlockIntro:(info,go)=>{ intros++; setTimeout(go,0); }, showTestResult:(res,go)=>{ results++; setTimeout(go,0); }});
  const xp0 = Store.data.player.xp;
  ok(Session.start({size:16}), 'Session.start inicia');
  let guard = 0;
  while(Session.active && guard++<4000){
    if(Session.current && !Session.answering && !Session.inputLocked && !Session.waiting){
      const ans = String(Session.current.answer).replace('.',',');
      for(const ch of ans) Session.submitDigit(ch==='-'?'sign':ch===','?'dec':ch);
      Session.evaluate(false);
    }
    await sleep(1);
  }
  ok(!Session.active && summary && summary.completed, 'rodada termina sozinha com resumo completo');
  ok(summary && summary.total>=16 && summary.accuracy>0.95 && summary.stars>=1, 'resumo coerente (total '+(summary&&summary.total)+')');
  ok(Store.data.player.xp>xp0 && summary.xp>0, 'XP do jogador aumentou');
  ok(Store.data.history.length===1 && Store.data.history[0].completed===true, 'rodada entrou no histórico');
  ok(Store.data.player.rounds===1 && Store.data.player.items>=16 && Progress.day().items>=16, 'contadores do jogador e do dia');
  ok(intros>=1, 'primeira visita a um level mostra a dica (intro)');
  ok(Store.data.seenTips['soma:3']===true || Object.keys(Store.data.seenTips).length>0, 'dicas vistas são lembradas');
  // saída parcial salva
  summary = null; Store.data.history.length = 0;
  Session.start({size:24}); guard = 0;
  while(Session.active && Session.records.length<5 && guard++<2000){
    if(Session.current && !Session.answering && !Session.inputLocked && !Session.waiting){
      for(const ch of String(Session.current.answer).replace('.',',')) Session.submitDigit(ch==='-'?'sign':ch===','?'dec':ch);
      Session.evaluate(false);
    }
    await sleep(1);
  }
  Session.exit(true);
  ok(!Session.active && summary && !summary.completed && summary.stars===0 && Store.data.history.length===1, 'sair no meio fecha como rodada parcial (sem estrelas)');
  ok(Engine.block===null, 'sair descarta o bloco em andamento');
  // meta batida: aviso discreto não para nada; aviso em tela para e espera continuar/sair
  const play = async (until)=>{ let g = 0; while(Session.active && !until() && g++<4000){
    if(Session.current && !Session.answering && !Session.inputLocked && !Session.waiting){
      for(const ch of String(Session.current.answer).replace('.',',')) Session.submitDigit(ch==='-'?'sign':ch===','?'dec':ch);
      Session.evaluate(false);
    }
    await sleep(1);
  } };
  Store.data.history.length = 0; summary = null; goalScreens.length = 0;
  Store.data.settings.goalMode = 'count'; Store.data.settings.dailyGoal = Progress.day().items + 3; Store.data.settings.goalAlert = 'discreet';
  Progress.day().goalHit = false;
  Session.start({size:16}); await play(()=>false);
  ok(summary && summary.completed && goalScreens.length===0 && summary.goal.hit && summary.goal.mode==='count', 'aviso discreto: rodada segue sem tela de meta');
  Store.data.settings.goalAlert = 'screen'; Store.data.settings.dailyGoal = Progress.day().items + 3; Progress.day().goalHit = false; summary = null;
  Session.start({size:16}); await play(()=>false);
  ok(goalScreens.length===1 && summary && summary.completed && goalScreens[0].mode==='count', 'aviso em tela: tela aparece uma vez e "continuar" termina a rodada');
  // sair pela tela de meta
  Store.data.settings.dailyGoal = Progress.day().items + 3; Progress.day().goalHit = false; summary = null; goalScreens.length = 0;
  goalAction = (go,exit)=>exit();
  Session.start({size:24}); await play(()=>false);
  ok(goalScreens.length===1 && !Session.active && summary && !summary.completed, 'tela de meta: "sair" fecha como rodada parcial');
  // meta por tempo: o relógio dispara a tela no meio da rodada; pausa e tela de aviso não contam tempo
  goalAction = (go)=>go(); goalScreens.length = 0; summary = null; Progress.day().goalHit = false;
  Store.data.settings.goalMode = 'time'; Store.data.settings.dailyGoalMinutes = 1; Store.data.dayTimer = {day:Progress.dayKey(), ms:58000};
  Session.start({size:24}); await play(()=>Session.records.length>=2);
  while(Session.answering || Session.inputLocked) await sleep(1);
  const t0 = Progress.todayMs(); Session.togglePause(); Session._clockTick(Session._clockLast+1500); ok(Progress.todayMs()===t0, 'pausado: o relógio não conta');
  Session.togglePause(); Session._clockTick(Session._clockLast+500); ok(Progress.todayMs()===t0+500, 'rodando: o relógio conta');
  Session._clockTick(Session._clockLast+60000); ok(Progress.todayMs()-t0<=500+CLOCK_MAX_GAP_MS, 'passo longo (aparelho suspenso) é limitado');
  ok(goalScreens.length===0 && Session.goalPending===true && Progress.day().goalHit && Session.current && !Session.answering, 'meta por tempo bate no meio de uma conta: a tela espera, a conta segue');
  Session._clockTick(Session._clockLast+500); ok(goalScreens.length===0, 'tela não interrompe a conta em andamento');
  const cur = Session.current; while(Session.inputLocked) await sleep(1);
  for(const ch of String(cur.answer).replace('.',',')) Session.submitDigit(ch==='-'?'sign':ch===','?'dec':ch);
  Session.evaluate(false);
  ok(goalScreens.length===0, 'tela só entra depois do feedback da conta'); await sleep(10);
  ok(goalScreens.length===1 && Session.goalPending===false, 'terminada a conta, a tela de meta aparece uma vez');
  await play(()=>false);
  ok(summary && summary.completed && summary.goal.mode==='time' && summary.goal.hit && goalScreens.length===1, 'rodada por tempo termina com resumo da meta');
  Store.data.settings.goalMode = 'count'; Store.data.settings.goalAlert = 'discreet';
  // errar não é punido: rodada toda errada ainda conclui e rende ≥ 0 XP
  Store.data.history.length = 0; summary = null;
  Session.start({size:16}); guard = 0;
  while(Session.active && guard++<4000){
    if(Session.current && !Session.answering && !Session.inputLocked && !Session.waiting){ Session.submitDigit('9'); Session.submitDigit('9'); Session.submitDigit('9'); Session.submitDigit('9'); Session.submitDigit('9'); Session.evaluate(false); }
    await sleep(1);
  }
  ok(summary && summary.completed && summary.stars===1 && summary.xp>=ROUND_COMPLETE_XP, 'rodada toda errada ainda dá 1 estrela e o bônus de conclusão '+JSON.stringify(summary&&{c:summary.completed,s:summary.stars,x:summary.xp,t:summary.total,a:Session.active,g:guard}));
  ok(Engine.activeKeys().every(k=>Engine.track(k).level>=3), 'nenhum level caiu');
  // registro por conta e relatório para IA
  ok(Store.data.log.length>=16 && Store.data.log.every(e=>e.length===12), 'cada conta respondida entra no registro compacto');
  Session._logEvent({type:'placed', key:'soma', level:2}); ok(Store.data.events.length>0 && Store.data.events[Store.data.events.length-1].t>0, 'marcos são registrados');
  const rep = Export.aiReport();
  ok(rep.includes('Instruções para a IA') && rep.includes('Registro bruto') && rep.includes('quando,trilha,level') && rep.includes('Evolução por semana') && rep.includes('Estado atual por trilha'), 'relatório para IA tem todas as seções');
  ok(!rep.includes('NaN') && !rep.includes('undefined') && !rep.includes('Infinity'), 'relatório sem NaN/undefined');
  Store.data.log.length = 0; Store.data.events.length = 0; ok(Export.aiReport().includes('sem dados'), 'relatório funciona sem dados');
  // aviso "hora de exportar para a IA"
  freshStore(); const S0 = Store.data;
  ok(S0.settings.exportReminder===true && S0.settings.exportEvery===EXPORT_EVERY_DEFAULT && S0.exportMark.items===0, 'aviso de exportação: padrões');
  S0.player.items = EXPORT_EVERY_DEFAULT-1; ok(!Export.reminderDue() && Export.pendingItems()===EXPORT_EVERY_DEFAULT-1, 'aviso não dispara antes de X contas');
  S0.player.items = EXPORT_EVERY_DEFAULT; ok(Export.reminderDue(), 'aviso dispara ao atingir X contas');
  S0.settings.exportReminder = false; ok(!Export.reminderDue(), 'aviso desligado não dispara'); S0.settings.exportReminder = true;
  ok(Export.aiReport().includes('desde a última exportação para IA: '+EXPORT_EVERY_DEFAULT), 'relatório informa as contas desde a última exportação');
  Export.csvText(); ok(Export.pendingItems()===EXPORT_EVERY_DEFAULT, 'CSV/JSON não zeram o contador');
  Object.defineProperty(globalThis, 'navigator', {value:{clipboard:{writeText: async ()=>{}}}, configurable:true});
  Export.aiReportCopy().then(()=>{}); await sleep(5);
  ok(Export.pendingItems()===0 && !Export.reminderDue() && Store.data.exportMark.at>0, 'copiar para IA zera o contador');
  Store.data.player.items += 7; ok(Export.pendingItems()===7, 'contador volta a contar depois do reset');
  const nz = Store.normalize({settings:{exportEvery:'abc'}, player:{items:50}, exportMark:{items:999}});
  ok(nz.settings.exportEvery===EXPORT_EVERY_DEFAULT && nz.exportMark.items===50, 'exportEvery e exportMark saneados');
  ok(Store.normalize({settings:{exportEvery:1}}).settings.exportEvery===EXPORT_EVERY_MIN && Store.normalize({settings:{exportEvery:99999}}).settings.exportEvery===EXPORT_EVERY_MAX, 'exportEvery limitado');
  // exportação CSV não quebra
  ok(typeof Export.csvText()==='string' && Export.csvText().includes('trilha'), 'CSV gerado');
}

/* ---------- 7. MODO LIVRE: sem tempo, sem pontuação, nada salvo ---------- */
{
  freshStore({settings:{activeTracks:['soma']}}); Store.data.settings.gapMs = 0; Store.data.settings.confirmBeforeAccept = true; Store.data.settings.tts = false;
  placeAll(3, 0.5);
  Store.data.player.xp = 123; Store.data.player.items = 77;
  // 7a. contas: toda trilha × level × tamanho tem resposta conferível e formato de conta normal
  let badItem = 0;
  for(const key of TRACK_ORDER){
    for(let l=1; l<=trackLevels(key); l++){
      FreeMode.setTrack(key); FreeMode.setLevel(l);
      for(const size of ['small','mix','big']){
        FreeMode.setSize(size); FreeMode.recent = [];
        for(let i=0;i<6;i++){
          const it = FreeMode.makeItem();
          const typed = it.op==='fracao_comparacao' ? ({'-1':'<','0':'=','1':'>'})[it.answer] : String(it.answer).replace('.',',');
          if(it.kind!=='free' || it.key!==key || it.level!==l || !Number.isFinite(it.m) || it.timeoutMs!==undefined || it.limitMs!==undefined || !answerMatches(typed, it)) badItem++;
        }
      }
    }
  }
  ok(badItem===0, 'modo livre: toda trilha × level × tamanho gera conta correta, sem campos de tempo ('+badItem+' ruins)');
  FreeMode.setTrack('soma'); FreeMode.setLevel(99); ok(FreeMode.cfg.level===trackLevels('soma'), 'modo livre: level fora da escada é limitado');
  FreeMode.setLevel(-4); ok(FreeMode.cfg.level===1, 'modo livre: level abaixo de 1 vira 1');
  FreeMode.setTrack('equacoes'); ok(FreeMode.cfg.level<=trackLevels('equacoes'), 'modo livre: trocar de trilha mantém o level válido');
  // o tamanho escolhido muda mesmo a faixa de m
  FreeMode.setTrack('soma'); FreeMode.setSize('small'); let mMax = 0; for(let i=0;i<200;i++) mMax = Math.max(mMax, FreeMode._pickM());
  FreeMode.setSize('big'); let mMin = 1; for(let i=0;i<200;i++) mMin = Math.min(mMin, FreeMode._pickM());
  ok(mMax<=0.35 && mMin>=0.65, 'modo livre: "menores" e "maiores" usam faixas diferentes do level');

  // 7b. uma sessão inteira não toca em nada persistido
  const noop = ()=>{}; const shown = []; let chosen = null;
  const fake = {classList:{add(){},remove(){},toggle(){},contains(){return false;}}, style:{setProperty(){}}, dataset:{}, textContent:'', innerHTML:'', onclick:null, disabled:false, appendChild(){}, replaceChildren(){}};
  const realGet = document.getElementById, realAll = document.querySelectorAll;
  document.getElementById = ()=>Object.assign({}, fake, {classList:fake.classList, style:fake.style, dataset:{}});
  document.querySelectorAll = ()=>[];
  const uiBackup = Object.assign({}, UI);
  Object.assign(UI, {resetTraining:noop, showScreen:n=>shown.push(n), setBlockChip:noop, pushPulse:noop, flashAnswer:noop, clearAnswerFeedback:noop,
    showCorrectAnswer:noop, showHint:noop, updateAnswerDisplay:noop, setKeypadMode:noop, hideOverlays:noop, toast:noop, renderQuestion:(item,ready)=>{ chosen = item; ready(); }});
  let saves = 0; const realSave = Store.save; Store.save = ()=>{ saves++; };
  const snapshot = JSON.stringify(Store.data), ls0 = JSON.stringify(localStorage._data);
  const player0 = JSON.stringify(Store.data.player), hist0 = Store.data.history.length, log0 = Store.data.log.length, ev0 = Store.data.events.length, tracks0 = Object.keys(Store.data.tracks).sort().join();

  FreeMode.setTrack('multiplicacao'); FreeMode.setLevel(4); FreeMode.setSize('mix');
  FreeMode.open(); ok(shown.includes('free'), 'modo livre: abre a tela de escolha');
  FreeMode.start(); ok(FreeMode.active && UI.ctl()===FreeMode && !Session.active, 'modo livre: ativo e o teclado vai para ele, não para a rodada');
  // sem cronômetro: parado numa conta por mais tempo que qualquer limite, nada acontece
  const first = FreeMode.current; await sleep(60);
  ok(FreeMode.current===first && !FreeMode.answering && Session.itemTimeoutHandle===null && Session.clockHandle===null, 'modo livre: sem tempo limite e sem relógio do dia');
  // errar: mostra a resposta e espera ✓ (sem pressa)
  FreeMode.submitDigit('9'); FreeMode.submitDigit('9'); FreeMode.submitDigit('9'); FreeMode.submitDigit('9'); FreeMode.submitDigit('9');
  FreeMode.evaluate();
  ok(FreeMode.awaitingNext && FreeMode.current===first, 'modo livre: erro espera a pessoa continuar');
  FreeMode.submitDigit('1'); ok(FreeMode.typed==='99999', 'modo livre: dígitos são ignorados enquanto espera');
  FreeMode.evaluate(); ok(!FreeMode.awaitingNext && FreeMode.current!==first, '✓ depois do erro leva à próxima conta');
  // 30 contas: metade certas, metade erradas, trocando level e tamanho no caminho
  let right = 0;
  for(let i=0;i<30;i++){
    if(i===10) FreeMode.changeLevel(+1);
    if(i===15) FreeMode.setSize('big');
    if(i===20) FreeMode.changeLevel(-2);
    const it = FreeMode.current, win = i%2===0, key = it.op==='fracao_comparacao' ? (win ? ({'-1':'<','0':'=','1':'>'})[it.answer] : '<>'.includes(({'-1':'<','0':'=','1':'>'})[it.answer]) ? '=' : '<') : null;
    if(key!==null) FreeMode.submitComparison(key); else (win ? String(it.answer).replace('.',',') : '99999').split('').forEach(ch=>FreeMode.submitDigit(ch===','?'dec':ch));
    if(FreeMode.typed.length) FreeMode.evaluate();
    if(win) right++;
    if(FreeMode.awaitingNext) FreeMode.evaluate(); else { await sleep(2); }
  }
  ok(FreeMode.done>=30 && FreeMode.hits>0 && FreeMode.cfg.level===3 && chosen.level===3, 'modo livre: troca de level no meio do treino vale para as contas seguintes');
  // sem "confirmar": envia sozinho ao completar os dígitos, como na rodada normal
  Store.data.settings.confirmBeforeAccept = false; FreeMode.setSize('small');
  FreeMode.nextQuestion(); const auto = FreeMode.current; String(auto.answer).split('').forEach(ch=>FreeMode.submitDigit(ch));
  ok(auto.op==='fracao_comparacao' || auto.answer<0 || FreeMode.hits>0 && FreeMode.answering, 'modo livre: auto-envio ao completar os dígitos (sem "confirmar")');
  Store.data.settings.confirmBeforeAccept = true;   // o teste mexeu neste ajuste; volta ao valor da foto
  FreeMode.exit();
  ok(!FreeMode.active && UI.ctl()===Session && shown[shown.length-1]==='free', 'modo livre: sair volta para a escolha e devolve o teclado à rodada');

  ok(saves===0, 'modo livre: Store.save nunca foi chamado ('+saves+')');
  ok(JSON.stringify(Store.data)===snapshot, 'modo livre: Store.data idêntico antes e depois (nada de XP, meta, histórico, pesos, trilhas)');
  ok(JSON.stringify(localStorage._data)===ls0, 'modo livre: localStorage intocado');
  ok(JSON.stringify(Store.data.player)===player0 && Store.data.history.length===hist0 && Store.data.log.length===log0 && Store.data.events.length===ev0, 'modo livre: sem XP, rodada, histórico, log nem marcos');
  ok(Object.keys(Store.data.tracks).sort().join()===tracks0, 'modo livre: nenhuma trilha criada ou alterada');
  ok(Progress.day().items===0 && Progress.todayMs()===0, 'modo livre: não conta para a meta diária nem para o relógio do dia');
  Store.save = realSave;
  Object.assign(UI, uiBackup); document.getElementById = realGet; document.querySelectorAll = realAll;
}

})(ok, sleep);
`;

(async()=>{
  try{
    await new Function('ok','sleep','require','Buffer','setImmediate', harness)(ok, sleep, require, Buffer, setImmediate);
  }catch(e){ failures++; console.error('❌ EXCEÇÃO NA SUÍTE:', e && e.stack || e); }
  console.log(failures===0 ? `✅ ${passed} verificações passaram.` : `\n${failures} falha(s), ${passed} verificações passaram.`);
  process.exit(failures===0 ? 0 : 1);
})();
