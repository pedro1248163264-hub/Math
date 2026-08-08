/* =====================================================================
   assets/js/14-init.js — inicialização do app: carrega o Store, prepara o
   TTS, chama UI.init() quando o DOM está pronto e registra o service
   worker (PWA).
   Depende de: 07-storage.js, 09-feedback.js, 13-ui.js.
   Este é o único módulo com efeitos colaterais de inicialização — os
   testes automatizados (tests/run-tests.js) carregam todos os módulos
   *exceto* este, para controlar a inicialização manualmente.
   ===================================================================== */

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
