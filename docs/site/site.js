document.addEventListener('alpine:init',function(){
  Alpine.data('installer',function(){return{
    mode:'agent',status:'复制',
    command:'codex plugin marketplace add MogooStudio/mogoo-codex-git --json\ncodex plugin add mogoo-codex-git@mogoo-codex-git --json',
    agent:'请帮我安装这个 Codex 插件：https://github.com/MogooStudio/mogoo-codex-git',
    switchMode:function(mode){this.mode=mode;this.status='复制';},
    copy:async function(){
      var value=this.mode==='agent'?this.agent:this.command;
      this.status='正在复制';
      try{await navigator.clipboard.writeText(value);this.status='已复制 ✓';}
      catch(e){
        var field=document.createElement('textarea');field.value=value;field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();
        var ok=false;try{ok=document.execCommand('copy');}catch(ignore){}field.remove();
        this.status=ok?'已复制 ✓':'请选中文字复制';
      }
    }
  };});
});
window.addEventListener('load',function(){
  if(new URLSearchParams(location.search).get('capture')==='1')return;
  if(!window.gsap||!window.ScrollTrigger)return;
  gsap.registerPlugin(ScrollTrigger);
  var mm=gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)',function(){
    var entrance=gsap.timeline({defaults:{ease:'power3.out'}});
    entrance.from('.hero h1',{y:24,opacity:0,duration:.65})
      .from('.hero .lead, .hero .actions, .cover-aside, .tool-title p, .hero-lower',{y:14,opacity:0,duration:.5,stagger:.055},.16)
      .from('.hero-product',{y:32,opacity:0,duration:.7},.24);
    gsap.utils.toArray('.feature,.sequence-step').forEach(function(el,i){
      gsap.from(el,{x:i%2?16:-16,opacity:0,duration:.6,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 92%',once:true}});
    });
    gsap.utils.toArray('.capability .cap-image,.article-image').forEach(function(el){
      gsap.from(el,{clipPath:'inset(0 0 100% 0)',duration:.8,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 95%',once:true}});
    });
    gsap.from('.install-panel',{y:24,opacity:0,duration:.7,ease:'power3.out',scrollTrigger:{trigger:'.install',start:'top 85%',once:true}});
    gsap.from('.trace-copy h2',{x:-28,opacity:0,duration:.7,ease:'power3.out',scrollTrigger:{trigger:'.trace-section',start:'top 85%',once:true}});
    gsap.to('.trace-image img',{scale:1.23,xPercent:-4,ease:'none',scrollTrigger:{trigger:'.trace-section',start:'top 85%',end:'bottom 15%',scrub:true}});
    document.querySelectorAll('.install-tab').forEach(function(el){el.addEventListener('click',function(){gsap.fromTo('.install-panel .code-box',{y:8,opacity:.65},{y:0,opacity:1,duration:.24,ease:'power2.out'});});});
    ScrollTrigger.refresh();
  });
});
