// スプラッシュ終了後にメインコンテンツを表示
// （CSP を script-src 'self' で運用するため、インライン <script> から外部化したもの）
(function(){
  var sp = document.getElementById('splashScreen');
  var tb = document.querySelector('.topbar');
  var ct = document.querySelector('.container');
  var bn = document.getElementById('bottomNav');
  function revealUI(){ if(tb) tb.style.opacity='1'; if(ct) ct.style.opacity='1'; if(bn) bn.style.opacity='1'; }
  if(!sp) { revealUI(); return; }
  var ob = new MutationObserver(function(){
    if(sp.classList.contains('splash-fade')){ ob.disconnect(); revealUI(); }
  });
  ob.observe(sp, {attributes:true, attributeFilter:['class']});
})();
