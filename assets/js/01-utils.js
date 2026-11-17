/* =====================================================================
   assets/js/01-utils.js — utilitários genéricos (RNG, clamp, mediana,
   percentil, formatação de tempo/porcentagem, uid).
   Depende de: nada.
   Usado por: praticamente todos os outros módulos.
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
  // Relógio: m:ss (ou h:mm:ss a partir de 1 hora). Arredonda para baixo, como um cronômetro.
  fmtClock(ms){
    const total = Math.max(0, Math.floor((+ms||0)/1000)), h = Math.floor(total/3600), m = Math.floor(total%3600/60), s = total%60;
    const p = n=>n<10 ? '0'+n : ''+n;
    return h>0 ? h+':'+p(m)+':'+p(s) : m+':'+p(s);
  },
  fmtPct(v){ if(v==null||isNaN(v)) return '-'; return Math.round(v*100)+'%'; },
  uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); },
  // Formata um número para exibição/fala respeitando o separador decimal do idioma do
  // app (vírgula em pt, ponto em en) — usado pelas famílias com vírgula (seç. "Decimais").
  // Números inteiros nunca ganham separador.
  fmtNum(n){
    if(!Number.isFinite(n)) return String(n);
    const lang = (typeof Store!=='undefined' && Store.data && Store.data.settings.appLang) || 'pt';
    const s = String(n);
    return lang==='en' ? s : s.replace('.', ',');
  },
  decimalSep(){
    const lang = (typeof Store!=='undefined' && Store.data && Store.data.settings.appLang) || 'pt';
    return lang==='en' ? '.' : ',';
  },
};

