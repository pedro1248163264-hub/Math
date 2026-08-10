/* =====================================================================
   assets/js/06-skills-graph.js — grafo de componentes de habilidade (KCs):
   KC_DEFS (pré-requisitos, faixa de elo e gerador de exercício de cada
   família), KC_LABELS_EN, KC_ORDER e helpers relacionados.
   Depende de: 01-utils.js, 04-operations.js, 05-expression-terms.js.
   Usado por: 07-storage.js, 08-speed-engine.js, 09-feedback.js,
   10-session.js, 13-ui.js.
   ===================================================================== */

/* ---------- 4. GRAFO DE COMPONENTES DE HABILIDADE (KCs) ----------
   Cada KC é uma FAMÍLIA de cálculo (nunca um par de operandos específico —
   seç. 0, princípio 4). "eloBounds" define a faixa de dificuldade (em
   pontos Elo) que aquela família cobre; dentro dela, a dificuldade do
   item é 100% controlada pelo rating contínuo do usuário no KC (seç. 11).
   "prereqs" define o DAG de pré-requisitos (seç. 1, camada 1). */
// Decide 1 ou 2 casas decimais para o próximo item de uma família decimal. Sem perfil (ou
// sem pesos ainda), usa só t: começa quase sempre em 1 casa, ganhando chance de 2 casas
// conforme a dificuldade sobe — sempre com uma chance mínima da outra (nunca 100/0).
// Com perfil, usa o mesmo sorteio ponderado por peso das demais famílias com atributo
// categórico (carries/borrows/pct — seç. 3 do motor), então o algoritmo pode enviesar para
// a quantidade de casas onde a pessoa está mais lenta ou errando mais.
function decideDecimalPlaces(t, profile){
  if(profile) return Engine.weightedBucket(profile,'decimalPlaces',[1,2]);
  const p2 = U.clamp(t*0.85, 0, 0.8);
  return Math.random()<p2 ? 2 : 1;
}
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
    // Peso por padrão (seç. 3 da revisão do motor): dentro desta família, sempre há pelo
    // menos 1 vai-um por definição — o que varia é "1 vai-um" vs "2 vai-uns". Busca um par
    // no bucket para onde o perfil pesa mais (mais lento/erra mais), mas nunca deixa de
    // garantir carries>0 (a garantia original da família), mesmo se o bucket-alvo não for
    // encontrado a tempo.
    gen(t, profile){
      const maxVal=20+Math.round(t*79);
      const target = profile ? Engine.weightedBucket(profile,'carries',['um','varios']) : null;
      let a,b,c,tries=0,fbA,fbB,fbC;
      do{
        a=U.rint(10,maxVal); b=U.rint(10,maxVal); c=countCarries(a,b); tries++;
        if(c>0 && fbA===undefined){ fbA=a; fbB=b; fbC=c; }
      } while((c===0 || (target && Engine.bucketFromCount('carries',c)!==target)) && tries<20);
      if(c===0 && fbA!==undefined){ a=fbA; b=fbB; c=fbC; }
      if(Math.random()<0.5)[a,b]=[b,a];
      return {a,b,answer:a+b,features:{carries:c}}; } },
  soma_3_4d:{ label:'Soma — 3 e 4 dígitos', op:'soma', prereqs:['soma_2d_cc'], eloBounds:[1200,1600],
    gen(t, profile){ const four=t>0.45;
      const target = profile ? Engine.weightedBucket(profile,'carries',['sem','um','varios']) : null;
      let a,b,c,tries=0;
      do{
        a = four ? U.rint(1000,1000+Math.round(t*8999)) : U.rint(100,100+Math.round(t*899));
        b = four ? U.rint(1000,1000+Math.round(t*8999)) : U.rint(100,100+Math.round(t*899));
        c = countCarries(a,b); tries++;
      } while(target && Engine.bucketFromCount('carries',c)!==target && tries<20);
      return {a,b,answer:a+b,features:{carries:c}}; } },

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
    // Mesmo espírito de soma_2d_cc acima: a família sempre tem empréstimo (>0); o que
    // varia é "1 empréstimo" vs "2 empréstimos", enviesado pelo peso do perfil.
    gen(t, profile){
      const maxVal=20+Math.round(t*79);
      const target = profile ? Engine.weightedBucket(profile,'borrows',['um','varios']) : null;
      let a,b,bc,tries=0,fbA,fbB,fbBc;
      do{
        a=U.rint(11,maxVal); b=U.rint(10,maxVal-1);
        if(a<=b){ [a,b]=[Math.max(a,b)+1, Math.min(a,b)]; }
        bc=countBorrows(a,b); tries++;
        if(bc>0 && fbA===undefined){ fbA=a; fbB=b; fbBc=bc; }
      } while((bc===0 || (target && Engine.bucketFromCount('borrows',bc)!==target)) && tries<20);
      if(bc===0 && fbA!==undefined){ a=fbA; b=fbB; bc=fbBc; }
      return {a,b,answer:a-b,features:{borrows:bc}}; } },
  sub_3_4d:{ label:'Subtração — 3 e 4 dígitos', op:'subtracao', prereqs:['sub_2d_ce'], eloBounds:[1200,1600],
    gen(t, profile){ const four=t>0.45;
      const target = profile ? Engine.weightedBucket(profile,'borrows',['sem','um','varios']) : null;
      let a,b,bc,tries=0;
      do{
        a = four ? U.rint(1000,1000+Math.round(t*8999)) : U.rint(100,100+Math.round(t*899));
        b = four ? U.rint(1000,a) : U.rint(100,a);
        if(a<=b) a=b+U.rint(1,50);
        bc = countBorrows(a,b); tries++;
      } while(target && Engine.bucketFromCount('borrows',bc)!==target && tries<20);
      return {a,b,answer:a-b,features:{borrows:bc}}; } },

  // ---- Decimais (seç. "Contas com vírgula") ----
  // A dificuldade nova aqui não é o tamanho do número — é raciocinar com a vírgula junto
  // (alinhar casas decimais de cabeça). Por isso os operandos ficam pequenos (mesma ordem
  // de grandeza das famílias inteiras "irmãs" definidas em DECIMAL_PAIR_KC), e tudo é
  // construído em domínio inteiro (centavos) para a resposta ser sempre exata — nunca dízima.
  // "decimalPlaces" (1 ou 2 casas) usa o mesmo mecanismo de peso por padrão que carries/
  // borrows/pct (seç. 3 do motor): a próxima geração fica enviesada para a quantidade de
  // casas onde a pessoa está mais lenta/errando mais, sem nunca eliminar a outra.
  soma_decimal:{ label:'Soma — com vírgula (1 a 2 casas)', op:'soma', prereqs:['soma_2d_cc'], eloBounds:[1000,1350], decimal:true,
    gen(t, profile){
      const dp = decideDecimalPlaces(t, profile);
      const scale = Math.pow(10,dp);
      const maxInt = 1+Math.round(t*8);
      const aCents = U.rint(1*scale, maxInt*scale+scale-1);
      const bCents = U.rint(1*scale, maxInt*scale+scale-1);
      const a=aCents/scale, b=bCents/scale, answer=(aCents+bCents)/scale;
      return {a,b,answer,features:{decimalPlaces:dp}}; } },
  sub_decimal:{ label:'Subtração — com vírgula (1 a 2 casas)', op:'subtracao', prereqs:['sub_2d_ce'], eloBounds:[1000,1350], decimal:true,
    gen(t, profile){
      const dp = decideDecimalPlaces(t, profile);
      const scale = Math.pow(10,dp);
      const maxInt = 1+Math.round(t*8);
      let aCents=U.rint(1*scale, maxInt*scale+scale-1), bCents=U.rint(1*scale, maxInt*scale+scale-1);
      if(aCents<=bCents) [aCents,bCents]=[bCents,aCents];
      if(aCents===bCents) aCents+=U.rint(1,scale);
      const a=aCents/scale, b=bCents/scale, answer=(aCents-bCents)/scale;
      return {a,b,answer,features:{decimalPlaces:dp}}; } },
  mult_decimal:{ label:'Multiplicação — decimal × inteiro', op:'multiplicacao', prereqs:['mult_tabuada'], eloBounds:[950,1300], decimal:true,
    gen(t, profile){
      const dp = decideDecimalPlaces(t, profile);
      const scale = Math.pow(10,dp);
      const maxInt = 1+Math.round(t*3);
      const aCents = U.rint(1*scale, maxInt*scale+scale-1);
      const mult = U.rint(2, 4+Math.round(t*8));
      const a=aCents/scale, b=mult, answer=(aCents*mult)/scale;
      return {a,b,answer,features:{decimalPlaces:dp}}; } },
  div_decimal:{ label:'Divisão — decimal ÷ inteiro', op:'divisao', prereqs:['div_tabuada'], eloBounds:[1000,1350], decimal:true,
    gen(t, profile){
      const dp = decideDecimalPlaces(t, profile);
      const scale = Math.pow(10,dp);
      const divisor = U.rint(2, 4+Math.round(t*8));
      const quotientCents = U.rint(1*scale, (1+Math.round(t*3))*scale+scale-1);
      const dividendCents = quotientCents*divisor;
      const a=dividendCents/scale, b=divisor, answer=quotientCents/scale;
      return {a,b,answer,features:{decimalPlaces:dp,exact:true}}; } },

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
    // Peso por padrão: cada valor de % já era escolhido por U.choice — trocado por sorteio
    // ponderado pelo peso do perfil (grupos de % onde a pessoa é mais lenta/erra mais saem
    // com mais frequência; nunca 100% determinístico, sempre há piso de aleatoriedade).
    gen(t, profile){ const opts=[10,20,50,25];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let base=U.rint(2,2+Math.round(t*18))*10;
      // BUGFIX: "25%" sobre uma base que não é múltiplo de 20 dava resultado decimal (25% de 30 = 7,5),
      // e o Math.round abaixo mascarava isso aceitando o inteiro arredondado. Ajusta a base até a
      // porcentagem ser exata, como os geradores intermediário/avançado já fazem.
      let result=pct*base/100, tries=0; while(!Number.isInteger(result)&&tries<10){ base+=10; result=pct*base/100; tries++; }
      base=Math.round(base); return {a:pct,b:base,answer:Math.round(pct*base/100),features:{pct}}; } },
  pct_intermediario:{ label:'Porcentagem — intermediária', op:'porcentagem', prereqs:['pct_basico'], eloBounds:[1000,1300],
    gen(t, profile){ const opts=[15,25,75,5,30];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let base=U.rint(4,4+Math.round(t*56))*10;
      let result=pct*base/100, tries=0; while(!Number.isInteger(result)&&tries<10){ base+=5; result=pct*base/100; tries++; }
      base=Math.round(base); return {a:pct,b:base,answer:Math.round(pct*base/100),features:{pct}}; } },
  pct_avancado:{ label:'Porcentagem — avançada', op:'porcentagem', prereqs:['pct_intermediario','mult_2d'], eloBounds:[1250,1600],
    gen(t, profile){ const opts=[12,18,35,45,65,8];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let base=U.rint(4,4+Math.round(t*196))*5;
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
  soma_decimal:'Addition — decimals (1–2 places)',
  sub_decimal:'Subtraction — decimals (1–2 places)',
  mult_decimal:'Multiplication — decimal × integer',
  div_decimal:'Division — decimal ÷ integer',
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
  'soma_decimal','sub_decimal','mult_decimal','div_decimal',
  'soma_3_4d','sub_3_4d','expr_par_simples','expr_par_dupla',
  'fracao_simples','potencia_basica','radical_quad','expr_encadeada','equacao_linear','log_basico'];

function kcOpDef(key){ return OPS[KC_DEFS[key].op]; }

