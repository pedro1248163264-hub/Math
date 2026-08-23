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
  soma_2d_sc:{ label:'Soma — 2 dígitos', op:'soma', prereqs:['soma_1d'], eloBounds:[750,1050],
    gen(t){ const maxTen=1+Math.round(t*7);
      let aT=U.rint(1,maxTen), bT=U.rint(1,Math.max(1,9-aT));
      let aU=U.rint(0,9), bU=U.rint(0,Math.max(0,9-aU));
      let a=aT*10+aU, b=bT*10+bU; if(Math.random()<0.5)[a,b]=[b,a];
      return {a,b,answer:a+b,features:{carries:0}}; } },
  soma_2d_cc:{ label:'Soma — 2 dígitos (vai-um)', op:'soma', prereqs:['soma_2d_sc'], eloBounds:[950,1300],
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
  sub_2d_se:{ label:'Subtração — 2 dígitos', op:'subtracao', prereqs:['sub_1d'], eloBounds:[750,1050],
    gen(t){ const maxTen=1+Math.round(t*7); let tries=0,a,b;
      do{ let aT=U.rint(1,maxTen), aU=U.rint(0,9); a=aT*10+aU;
          let bT=U.rint(0,aT), bU=U.rint(0,aU); b=bT*10+bU; tries++;
      } while((a<=b || countBorrows(a,b)>0) && tries<15);
      if(a<=b){ a=b+U.rint(1,9); }
      return {a,b,answer:a-b,features:{borrows:0}}; } },
  sub_2d_ce:{ label:'Subtração — 2 dígitos (empréstimo)', op:'subtracao', prereqs:['sub_2d_se'], eloBounds:[950,1300],
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

  mult_tabuada:{ label:'Multiplicação — por 2 a 9', op:'multiplicacao', prereqs:[], eloBounds:[700,1000],
    // Peso por dígito/linha (substitui "fatos fracos"): um dígito é sorteado ponderado pelos
    // digitWeights do perfil (lento/erro com ×7 → mais pares contendo 7), o outro cai na faixa.
    // O enunciado específico continua nunca repetido (recentPairs no Engine) e não existe "par
    // pronto" rastreado — a dificuldade é operar com o dígito, não decorar o produto.
    gen(t, profile){
      const hi=4+Math.round(t*5);
      const lo=2, hiD=hi+3;
      let a,b;
      if(profile){
        a = Engine.pickRow(profile,'mult_tabuada',lo,hiD);
        const hotB = Engine.pickHotPartner(a, lo, hiD);
        b = (hotB!=null && Math.random() < HOTPAIR_INJECT_CHANCE) ? hotB : U.rint(lo,hiD);
      } else { a=U.rint(lo,hiD); b=U.rint(lo,hiD); if(Math.random()<0.5)[a,b]=[b,a]; }
      const answer = a*b;
      // Inversão de baixa frequência (Reverse Path, Pilar 3, stress test): em vez de "a×b=?",
      // esconde um dos fatores — "? × b = produto" ou "a × ? = produto" — pra testar
      // reconhecer o fato dentro de uma equação, não só recitar na ordem treinada. Sem
      // profile (smoke test/geração fria), nunca entra aqui. Frequência sobe quando o
      // perfil já não está mais calibrando/adquirindo (proxy de fluência no caminho direto
      // — ver REVERSE_PATH_* em 02-engine-constants.js).
      if(profile){
        const fluent = Engine.stage(profile)!=='calibrating' && Engine.stage(profile)!=='acquisition';
        const reverseChance = fluent ? REVERSE_PATH_FLUENT_RATE : REVERSE_PATH_BASE_RATE;
        if(Math.random()<reverseChance){
          const hideLeft = Math.random()<0.5;
          const hidden = hideLeft ? a : b, shown = hideLeft ? b : a;
          const sym = OPS.multiplicacao.symbol;
          const exprText = hideLeft ? `? ${sym} ${shown} = ${answer}` : `${shown} ${sym} ? = ${answer}`;
          return {a,b,answer:hidden,features:{},exprText,isReversePath:true};
        }
      }
      return {a,b,answer,features:{}}; } },
  mult_11_19:{ label:'Multiplicação — por 11 a 19', op:'multiplicacao', prereqs:['mult_tabuada'], eloBounds:[950,1250],
    gen(t, profile){
      const aMin=11, aMax=11+Math.round(t*8);
      let a,b;
      if(profile){
        a = Engine.pickRow(profile,'mult_11_19',aMin,aMax);
        b = U.rint(2,9);
      } else { a=U.rint(aMin,aMax); b=U.rint(2,9); if(Math.random()<0.4)[a,b]=[b,a]; }
      return {a,b,answer:a*b,features:{}}; } },
  mult_2d:{ label:'Multiplicação — 2 dígitos × 2 dígitos', op:'multiplicacao', prereqs:['mult_11_19'], eloBounds:[1200,1650],
    gen(t){ const hi=Math.round(29+t*70); let a=U.rint(11,hi), b=U.rint(11,Math.min(hi,29+Math.round(t*40)));
      return {a,b,answer:a*b,features:{}}; } },

  div_tabuada:{ label:'Divisão — por 2 a 9', op:'divisao', prereqs:['mult_tabuada'], eloBounds:[750,1050],
    // O usuário calcula divisor×quociente de cabeça — por isso a "linha" rastreada é o divisor
    // (por quem se divide), sorteado ponderado pelos digitWeights do perfil; o quociente cai na
    // faixa. Nunca há um par específico rastreado (ver mult_tabuada acima).
    gen(t, profile){
      const hi=4+Math.round(t*5);
      const lo=2, hiD=hi+3;
      let x,y;
      if(profile){
        x = Engine.pickRow(profile,'div_tabuada',lo,hiD);
        const hotY = Engine.pickHotPartner(x, lo, hiD);
        y = (hotY!=null && Math.random() < HOTPAIR_INJECT_CHANCE) ? hotY : U.rint(lo,hiD);
      } else { x=U.rint(lo,hiD); y=U.rint(lo,hiD); }
      const divisor=x, quotient=y, dividend=divisor*quotient;
      // Inversão de baixa frequência (Reverse Path, Pilar 3): esconde o dividendo —
      // "? ÷ divisor = quociente" — obrigando a multiplicar (divisor×quociente) pra achar
      // o dividendo, uma recuperação em contexto de divisão em vez do caminho direto
      // "dividendo ÷ divisor". a/b continuam sendo dividendo/divisor reais (dígitos
      // rastreados normalmente); só a/exprText mudam o que é perguntado.
      if(profile){
        const fluent = Engine.stage(profile)!=='calibrating' && Engine.stage(profile)!=='acquisition';
        const reverseChance = fluent ? REVERSE_PATH_FLUENT_RATE : REVERSE_PATH_BASE_RATE;
        if(Math.random()<reverseChance){
          const sym = OPS.divisao.symbol;
          const exprText = `? ${sym} ${divisor} = ${quotient}`;
          return {a:dividend,b:divisor,answer:dividend,features:{exact:true},exprText,isReversePath:true};
        }
      }
      return {a:dividend,b:divisor,answer:quotient,features:{exact:true}}; } },
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

  // ---- Porcentagens derivadas (seç. "Porcentagens derivadas") ----
  // Quatro variações que reutilizam o cálculo "p% de base" das famílias pct_* acima, cada
  // uma virando habilidade própria (Elo/meta/calibração separados). A exibição e o TTS são
  // compostos por 13-ui/09-feedback a partir dos campos a/b + op — sem exprText — para
  // continuar funcionando nos dois idiomas; o dedup do motor usa a+'_'+b.
  // pct_reverso ("20 é quantos % de 80?"): a resposta É a porcentagem — raciocínio inverso
  // (parte÷base), por isso div_tabuada como pré-requisito junto de pct_basico.
  pct_reverso:{ label:'Porcentagem — "é quantos % de"', op:'porcentagem_inversa', prereqs:['pct_basico','div_tabuada'], eloBounds:[950,1250],
    gen(t, profile){
      const opts = t<0.5 ? [10,20,50,25] : [10,20,50,25,5,15,75];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let base=U.rint(2,2+Math.round(t*18))*10;
      let part=pct*base/100, tries=0;
      while(!Number.isInteger(part)&&tries<10){ base+=10; part=pct*base/100; tries++; }
      base=Math.round(base); part=Math.round(base*pct/100);
      return {a:part,b:base,answer:pct,features:{pct}}; } },
  // pct_adicao / pct_subtracao ("80 ± 15% = ?"): calcula p% da base e soma/subtrai —
  // aumentos e descontos. Mesma garantia de exatidão dos pct_* (ajusta a base até o
  // acréscimo ser inteiro); p ≤ 75 mantém o resultado do desconto sempre positivo.
  pct_adicao:{ label:'Porcentagem — acréscimo (+%)', op:'porcentagem_acrescimo', prereqs:['pct_intermediario'], eloBounds:[1050,1350],
    gen(t, profile){
      const opts = t<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let base=U.rint(2,2+Math.round(t*56))*10;
      let inc=pct*base/100, tries=0;
      while(!Number.isInteger(inc)&&tries<10){ base+=10; inc=pct*base/100; tries++; }
      base=Math.round(base); inc=Math.round(base*pct/100);
      return {a:base,b:pct,answer:base+inc,features:{pct}}; } },
  pct_subtracao:{ label:'Porcentagem — desconto (−%)', op:'porcentagem_desconto', prereqs:['pct_intermediario'], eloBounds:[1050,1350],
    gen(t, profile){
      const opts = t<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let base=U.rint(2,2+Math.round(t*56))*10;
      let dec=pct*base/100, tries=0;
      while(!Number.isInteger(dec)&&tries<10){ base+=10; dec=pct*base/100; tries++; }
      base=Math.round(base); dec=Math.round(base*pct/100);
      return {a:base,b:pct,answer:base-dec,features:{pct}}; } },
  // pct_duplo ("2% de 5% = ?%"): percentual de percentual. Única das quatro com resposta
  // decimal — em PONTOS PERCENTUAIS (2% de 5% = 0,1%), não na fração bruta 0,001 — então
  // marca decimal:true e features.decimalPlaces (1 ou 2 casas) para herdar o teclado de
  // vírgula e a confirmação manual das famílias com vírgula. Como p1×p2 é inteiro e se
  // divide por 100, o resultado tem no máximo 2 casas — nunca dízima. O retry só evita
  // produto múltiplo de 100 (que daria resposta inteira, fora do propósito da família).
  pct_duplo:{ label:'Porcentagem — % de %', op:'porcentagem_dupla', prereqs:['pct_intermediario','mult_decimal'], eloBounds:[1150,1450], decimal:true,
    gen(t, profile){
      const p1Opts=[50,25,20,10,30];
      const p2Opts = t<0.5 ? [10,20,50,25] : [10,20,50,25,5,15,30];
      const p1 = profile ? Engine.weightedBucket(profile,'pct',p1Opts) : U.choice(p1Opts);
      let p2 = profile ? Engine.weightedBucket(profile,'pct',p2Opts) : U.choice(p2Opts);
      let prod=p1*p2, tries=0;
      while(prod%100===0 && tries<10){ p2 = profile ? Engine.weightedBucket(profile,'pct',p2Opts) : U.choice(p2Opts); prod=p1*p2; tries++; }
      // Garantia final: nunca sai resposta inteira. Incrementos de 1 em p2 bastam — em
      // qualquer janela de 10 valores consecutivos existe um cujo produto com p1 (≤50)
      // não é múltiplo de 100.
      for(let k=0; prod%100===0 && k<10; k++){ p2+=1; prod=p1*p2; }
      const value=prod/100;
      const dp = prod%10===0 ? 1 : 2;
      return {a:p1,b:p2,answer:value,features:{decimalPlaces:dp,pct:p2}}; } },

  // ---- Porcentagens derivadas II — desfazer e comparar (seç. "Porcentagens derivadas") ----
  // Quatro variações novas no mesmo espírito do grupo acima: cada uma vira habilidade própria
  // e a exibição/TTS são compostos por 13-ui/09-feedback a partir de a/b/c + op (sem depender
  // de exprText traduzido). Todas com resposta inteira garantida pelos mesmos loops de ajuste.
  // pct_original ("? − 30% = 84"): o resultado É o valor original — desfaz um desconto (ou,
  // com dificuldade alta, um acréscimo): original×(1∓p/100)=final. A pessoa NÃO pode calcular
  // p% do final; tem que dividir por (1∓p/100) — o erro clássico é tratar como pct_subtracao.
  pct_original:{ label:'Porcentagem — valor original', op:'porcentagem_original', prereqs:['pct_subtracao'], eloBounds:[1100,1400],
    gen(t, profile){
      const opts = t<0.5 ? [10,20,50,25] : [10,20,50,25,15,5,30];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      const aumento = t>0.5 && Math.random()<0.35;
      let orig=U.rint(2,2+Math.round(t*38))*10;
      const factor = aumento ? (100+pct)/100 : (100-pct)/100;
      let final=orig*factor, tries=0;
      while(!Number.isInteger(final)&&tries<10){ orig+=10; final=orig*factor; tries++; }
      orig=Math.round(orig); final=Math.round(orig*factor);
      return {a:final,b:pct,answer:orig,features:{pct,aumento}}; } },
  // pct_variacao_alta / pct_variacao_baixa ("80 → 100 = +?%" / "100 → 80 = −?%"): a resposta
  // É a variação percentual, sempre relativa ao valor INICIAL — a dupla existe para mostrar
  // que subir depois descer não usa a mesma taxa (+25% vs −20%). O sinal já vem no enunciado;
  // a pessoa digita só a magnitude. Mesma convenção do pct_reverso: answer===pct.
  pct_variacao_alta:{ label:'Porcentagem — variação, aumento (→ +%)', op:'porcentagem_aumento', prereqs:['pct_reverso','pct_adicao'], eloBounds:[1050,1350],
    gen(t, profile){
      const opts = t<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let old=U.rint(2,2+Math.round(t*18))*10;
      let inc=old*pct/100, tries=0;
      while(!Number.isInteger(inc)&&tries<10){ old+=10; inc=old*pct/100; tries++; }
      old=Math.round(old); const incI=Math.round(old*pct/100);
      return {a:old,b:old+incI,answer:pct,features:{pct}}; } },
  pct_variacao_baixa:{ label:'Porcentagem — variação, redução (→ −%)', op:'porcentagem_reducao', prereqs:['pct_subtracao','pct_reverso'], eloBounds:[1050,1350],
    gen(t, profile){
      const opts = t<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
      const pct = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
      let old=U.rint(2,2+Math.round(t*18))*10;
      let dec=old*pct/100, tries=0;
      while(!Number.isInteger(dec)&&tries<10){ old+=10; dec=old*pct/100; tries++; }
      old=Math.round(old); const decI=Math.round(old*pct/100);
      return {a:old,b:old-decI,answer:pct,features:{pct}}; } },
  // pct_sucessivo ("100 − 20% − 10% = ?"): os dois descontos caem em CASCATA — o segundo incide
  // sobre o valor já reduzido, então −20%−10% ≠ −30% (dá −28% sobre o inicial). O gerador valida
  // que AMBOS os passos são inteiros (o meio também), com fallback determinístico exato —
  // p1/p2 combinados podem ser incompatíveis com qualquer base múltipla de 10 próxima.
  // exprText entra só para o dedup do motor (a+'_'+b colidiria: mesmo base/p1 com p2 diferentes).
  pct_sucessivo:{ label:'Porcentagem — descontos sucessivos', op:'porcentagem_sucessiva', prereqs:['pct_subtracao'], eloBounds:[1150,1450],
    gen(t, profile){
      const opts = t<0.4 ? [10,20,50,25] : [10,20,50,25,15,5,30];
      let base,meio,final,p1,p2,ok=false,tries=0;
      while(!ok && tries<20){
        base=U.rint(2,2+Math.round(t*56))*10;
        p1 = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
        p2 = profile ? Engine.weightedBucket(profile,'pct',opts) : U.choice(opts);
        meio=base-base*p1/100; final=meio-meio*p2/100;
        ok=Number.isInteger(meio)&&Number.isInteger(final)&&final>0;
        tries++;
      }
      if(!ok){ base=100; p1=10; p2=10; meio=90; final=81; }
      return {a:base,b:p1,c:p2,answer:final,exprText:`${base} − ${p1}% − ${p2}%`,features:{pct:p1}}; } },

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

  // ---- Frações (seç. 2: comparação A/B ? C/D — resposta <, > ou =) ----
  // A resposta é codificada como inteiro (−1="<", 0="=", +1=">") e sempre bate
  // com o sinal do produto cruzado exato: sign(n1·d2 − n2·d1). Quatro casos de
  // raciocínio (features.case, com peso interno por padrão como nas porcentagens):
  //   same_den: mesmo denominador → basta comparar os numeradores (aquecimento).
  //   same_num: mesmo numerador → denominador maior é a fração menor (relação inversa).
  //   equal: mesma fração escrita em escalas diferentes (ex.: 8/15 ? 16/30); no começo
  //          da curva pode ser até idêntica ("3/4 ? 3/4") — reconhecimento imediato do "=".
  //   cross: caso geral por multiplicação cruzada; em dificuldade alta sorteia vários
  //          candidatos e fica com o mais "quase-empate" (produtos cruzados próximos,
  //          ex.: 5/8 ? 2/3 → 15 vs 16).
  // A igualdade tem cota fixa (~1/4 dos itens) em qualquer nível, para a família não
  // virar só "qual é maior". Só frações próprias, nunca denominador 1.
  fracao_comparacao:{ label:'Frações — comparação', op:'fracao_comparacao', prereqs:['mult_tabuada'], eloBounds:[900,1250],
    gen(t, profile){
      const CASES=['same_den','same_num','equal','cross'];
      // Peso por padrão (seç. 3 do motor): enviesa para o caso onde a pessoa está mais
      // lenta/erra mais — sem perfil (testes/primeira geração), usa a distribuição natural.
      let caseKey = profile ? Engine.weightedBucket(profile,'case',CASES) : null;
      if(!caseKey){
        const r=Math.random();
        const pSameDen=0.30-0.24*t, pEqual=0.24, pSameNum=0.15+0.07*t;
        caseKey = r<pSameDen ? 'same_den'
          : r<pSameDen+pEqual ? 'equal'
          : r<pSameDen+pEqual+pSameNum ? 'same_num' : 'cross';
      }
      const denMax = Math.max(4, 5+Math.round(t*13));
      let n1,d1,n2,d2;
      if(caseKey==='same_den'){
        d1=d2=Math.max(3,Math.min(denMax,3+Math.round(t*9)));
        n1=U.rint(1,d1-1);
        do{ n2=U.rint(1,d1-1); } while(n2===n1);
      } else if(caseKey==='same_num'){
        n1=n2=U.rint(1,Math.min(6,2+Math.round(t*4)));
        d1=U.rint(n1+1,n1+5+Math.round(t*10));
        do{ d2=U.rint(n1+1,n1+5+Math.round(t*10)); } while(d2===d1);
      } else if(caseKey==='equal'){
        // Construção direta por escalas: (p·k1)/(q·k1) vs (p·k2)/(q·k2), com q·k ≤ eqDenMax —
        // a igualdade é exata por construção, sem tentativa/erro. No começo da curva, ~30%
        // são frações idênticas ("=" de reconhecimento imediato); depois, escalas sempre
        // distintas (o segundo multiplicador pode estourar o teto de denominador em 1 escala
        // quando não há folga — ainda um número pequeno).
        const eqDenMax=Math.max(4,6+Math.round(t*16));
        const p=U.rint(1,Math.max(2,Math.round(eqDenMax/2)));
        const q=U.rint(p+1,eqDenMax);
        const kHi=Math.max(1,Math.floor(eqDenMax/q));
        let ka=1,kb=1;
        if(t>=0.35 || Math.random()>=0.3){
          ka=U.rint(1,kHi);
          kb=kHi>1 ? U.rint(1,kHi) : 1;
          if(kb===ka && t>=0.35) kb=ka+1;
        }
        n1=p*ka; d1=q*ka; n2=p*kb; d2=q*kb;
      } else {
        const samples=t>0.55?8:1;
        let best=null;
        for(let i=0;i<samples;i++){
          const dd1=U.rint(2,denMax), nn1=U.rint(1,dd1-1);
          const dd2=U.rint(2,denMax), nn2=U.rint(1,dd2-1);
          const diff=Math.abs(nn1*dd2-nn2*dd1);
          if(diff===0) continue;                 // igualdade acidental é papel do caso "equal"
          if(!best||diff<best.diff) best={nn1,dd1,nn2,dd2,diff};
        }
        if(!best){                               // fallback determinístico: mesma fração com ±1 no numerador
          const dd=Math.max(3,denMax), nn=U.rint(1,dd-2);
          best={nn1:nn,dd1:dd,nn2:nn+1,dd2:dd,diff:dd};
        }
        n1=best.nn1; d1=best.dd1; n2=best.nn2; d2=best.dd2;
      }
      if(Math.random()<0.5){ [n1,d1,n2,d2]=[n2,d2,n1,d1]; }   // lado sorteado: < e > equiprováveis
      return {a:n1,b:d1,c:n2,d:d2,
        answer:Math.sign(n1*d2-n2*d1),
        exprText:`${n1}/${d1}|${n2}/${d2}`,
        features:{case:caseKey}};
    } },

  // ---- Potência / Radical — sempre conectados a outro termo por operador básico (seç. 3) ----
  potencia_basica:{ label:'Potência — expoentes 0 a 3', op:'potencia', prereqs:['mult_2d'], eloBounds:[1200,1600],
    gen(t){ return buildAdvancedPair(t, genTermPower); } },
  radical_quad:{ label:'Radical — raiz quadrada exata', op:'radical', prereqs:['mult_2d'], eloBounds:[1200,1600],
    gen(t){ return buildAdvancedPair(t, genTermRadical); } },
  // Log é operação em si (não termo de expressão): "log₂(32) = ?" — a resposta é o expoente.
  // a=base, b=argumento (dedup do motor via a+'_'+b); exprText dirige a exibição/TTS.
  log_basico:{ label:'Logaritmo — base inteira', op:'logaritmo', prereqs:['potencia_basica'], eloBounds:[1350,1700],
    gen(t){
      const base_log = U.choice([2,3,4,5,10]);
      const value = U.rint(1, 2+Math.round(t*3));
      const arg_log = Math.pow(base_log, value);
      return {a:base_log, b:arg_log, answer:value, exprText:`log${toSub(base_log)}(${arg_log})`, features:{}};
    } },

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
          if(Math.random()<0.18*t) terms.push(U.choice([genTermPower,genTermRadical])(t));
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

  // ---- Proporção (seç. "Proporções") ----
  // Duas famílias irmãs, ambas representadas sem enunciado textual — só o rótulo DIRETA/
  // INVERSA no topo e duas linhas de pares correspondentes ("a → b"), com a incógnita "x"
  // em qualquer uma das quatro posições (xPos: 0=sup.esq, 1=sup.dir, 2=inf.esq, 3=inf.dir).
  // As quatro células viajam nos campos a/b/c/d na ordem de leitura; exprText existe só
  // para o dedup do motor (a+'_'+b colidiria entre posições diferentes de x). A resposta é
  // sempre inteira POR CONSTRUÇÃO — nenhuma posição de x exige divisão que quebra.
  // proporcao_direta: linha 2 = linha 1 × m (mesma razão nas colunas e entre as linhas).
  // Resolver é reconhecer m (coluna) ou a razão interna r = b1/a1 (linha) — cálculo mental.
  proporcao_direta:{ label:'Proporção — direta', op:'proporcao_direta', prereqs:['mult_tabuada'], eloBounds:[850,1150],
    gen(t){
      const maxVal = 4+Math.round(t*36); // base da linha 1 cresce de ~5 até ~40
      // m (razão entre as linhas) começa redondo — mental-friendly — e ganha valores menos
      // óbvios conforme a dificuldade sobe.
      const mPool = t<0.35 ? [2,3,5,10] : t<0.7 ? [2,3,4,5,10,6] : [3,4,6,7,9,12,15,20,25];
      let a1,b1,tries=0;
      do{ a1=U.rint(2,maxVal); b1=U.rint(2,maxVal); tries++; }
      while(a1===b1 && tries<10);
      if(a1===b1) b1 = b1<maxVal ? b1+1 : b1-1; // fallback determinístico: evita razão 1:1 trivial
      const m = U.choice(mPool);
      const cells=[a1, b1, a1*m, b1*m];
      const xPos=U.rint(0,3), answer=cells[xPos];
      return {a:a1,b:b1,c:cells[2],d:cells[3],answer,xPos,
        exprText:`${cells[0]}>${cells[1]}|${cells[2]}>${cells[3]}#x${xPos}`, features:{}};
    } },
  // proporcao_inversa: constante do produto K = a×b = c×d nas duas situações — ao aumentar
  // uma grandeza, a outra diminui na mesma proporção. Construção via K = a·c·k garante as
  // duas linhas exatas: (a → c·k) e (c → a·k). Com k=1 o par só se inverte ("3→4 / 4→3"),
  // caso de reconhecimento imediato reservado ao começo da curva.
  proporcao_inversa:{ label:'Proporção — inversa', op:'proporcao_inversa', prereqs:['mult_tabuada','div_tabuada'], eloBounds:[1000,1300],
    gen(t){
      const hi = 6+Math.round(t*24);            // fatores crescem de ~8 até ~30
      const kHi = t<0.35 ? 3 : t<0.7 ? 5 : 8;   // folga do produto além do par cruzado
      let a,c,tries=0;
      do{ a=U.rint(2,hi); c=U.rint(2,hi); tries++; } while(a===c && tries<10);
      if(a===c) c = c<hi ? c+1 : c-1;           // linhas idênticas tornariam a relação invisível
      const k=U.rint(1,kHi);
      const cells=[a, c*k, c, a*k];             // a·(c·k) = c·(a·k) = K
      const xPos=U.rint(0,3), answer=cells[xPos];
      return {a:cells[0],b:cells[1],c:cells[2],d:cells[3],answer,xPos,
        exprText:`${cells[0]}*${cells[1]}|${cells[2]}*${cells[3]}#i${xPos}`, features:{}};
    } },
};
// Traduções (apresentação apenas) das famílias de habilidade — a lógica/seleção usa sempre a chave (key).
const KC_LABELS_EN = {
  soma_1d:'Addition — single digits',
  soma_2d_sc:'Addition — 2 digits',
  soma_2d_cc:'Addition — 2 digits (carrying)',
  soma_3_4d:'Addition — 3 and 4 digits',
  sub_1d:'Subtraction — single digits',
  sub_2d_se:'Subtraction — 2 digits',
  sub_2d_ce:'Subtraction — 2 digits (borrowing)',
  sub_3_4d:'Subtraction — 3 and 4 digits',
  soma_decimal:'Addition — decimals (1–2 places)',
  sub_decimal:'Subtraction — decimals (1–2 places)',
  mult_decimal:'Multiplication — decimal × integer',
  div_decimal:'Division — decimal ÷ integer',
  mult_tabuada:'Multiplication — by 2 to 9',
  mult_11_19:'Multiplication — by 11 to 19',
  mult_2d:'Multiplication — 2 digits × 2 digits',
  div_tabuada:'Division — by 2 to 9',
  div_2d:'Division — 2-digit result',
  div_3d:'Division — larger dividends',
  pct_basico:'Percentage — basic',
  pct_intermediario:'Percentage — intermediate',
  pct_avancado:'Percentage — advanced',
  pct_reverso:'Percentage — "is what % of"',
  pct_adicao:'Percentage — markup (+%)',
  pct_subtracao:'Percentage — discount (−%)',
  pct_duplo:'Percentage — % of %',
  pct_original:'Percentage — original value',
  pct_variacao_alta:'Percentage change — increase (+%)',
  pct_variacao_baixa:'Percentage change — decrease (−%)',
  pct_sucessivo:'Percentage — successive discounts',
  expr_par_simples:'Expressions — simple parentheses',
  expr_par_dupla:'Expressions — double parentheses',
  fracao_simples:'Fractions — simple operations',
  fracao_comparacao:'Fractions — comparison',
  potencia_basica:'Power — exponents 0 to 3',
  radical_quad:'Root — exact square root',
  log_basico:'Logarithm — integer base',
  expr_encadeada:'Expressions — chained',
  equacao_linear:'Equations — linear (solve for x)',
  proporcao_direta:'Proportion — direct',
  proporcao_inversa:'Proportion — inverse'
};
function kcLabel(key, fallback){
  const ptLabel = (KC_DEFS[key] && KC_DEFS[key].label) || fallback || key;
  if(Store.data.settings.appLang==='en') return KC_LABELS_EN[key] || ptLabel;
  return ptLabel;
}
const KC_ORDER = ['soma_1d','sub_1d','mult_tabuada','div_tabuada','pct_basico',
  'soma_2d_sc','sub_2d_se','mult_11_19','div_2d','pct_intermediario',
  'soma_2d_cc','sub_2d_ce','mult_2d','div_3d','pct_avancado',
  'pct_reverso','pct_adicao','pct_subtracao','pct_duplo',
  'pct_original','pct_variacao_alta','pct_variacao_baixa','pct_sucessivo',
  'soma_decimal','sub_decimal','mult_decimal','div_decimal',
  'soma_3_4d','sub_3_4d','expr_par_simples','expr_par_dupla',
  'fracao_simples','fracao_comparacao','potencia_basica','radical_quad','expr_encadeada','equacao_linear','log_basico',
  'proporcao_direta','proporcao_inversa'];

function kcOpDef(key){ return OPS[KC_DEFS[key].op]; }

