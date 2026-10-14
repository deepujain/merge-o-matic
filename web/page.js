// MergeOMatic page: a username, one public repository, and the receipt kit. State lives in the URL
// (?login=&repo=&day=) so a receipt link can be shared.
import {createReceiptUI,validRange,DEFAULT_RANGE,lib} from './kit/receipt-ui.js';
import {createMusic} from './music.js';
import {recordPrint,fetchStats} from './stats.js';

const LOGIN_RE=/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const $=id=>document.getElementById(id);
const els={form:$('mom-form'),login:$('mom-login'),repo:$('mom-repo'),status:$('mom-status'),demo:$('mom-demo'),root:$('mom-receipt')};
const params=new URLSearchParams(location.search);
const state={
  login:'',repo:'',range:validRange(params.get('day'))?params.get('day'):DEFAULT_RANGE,
  repos:null,lookup:null,lookupFor:'',demo:false
};
const repoCache=new Map();

function syncUrl(){
  const q=new URLSearchParams();
  if(state.login)q.set('login',state.login);
  if(state.login&&state.repo)q.set('repo',state.repo);
  if(state.range!==DEFAULT_RANGE)q.set('day',state.range);
  const next=`${location.pathname}${q.toString()?`?${q}`:''}`;
  if(next!==location.pathname+location.search)history.replaceState(null,'',next);
}
function status(text,tone=''){els.status.textContent=text;els.status.dataset.tone=tone;}
function setDemo(on){state.demo=Boolean(on);els.demo.hidden=!state.demo;}

async function api(path,signal){
  const res=await fetch(path,{signal,headers:{accept:'application/json'},credentials:'same-origin'});
  let json=null;try{json=await res.json();}catch{}
  if(!res.ok){
    const error=new Error(json?.error||(res.status===429?'Too many requests. Try again in a few minutes.':'GitHub could not be reached.'));
    error.input=res.status===422;error.status=res.status;throw error;
  }
  return json;
}

// While a receipt prints, the T and i buttons, the subtitle, the username card, its hint and the kit's toolbar fold up
// into the O of the heading, which stands in for the island, and the machine rises into the freed space; afterwards the
// machine settles back and they bubble out of the O. With the O off screen they fade in place instead.
// Halloween and Crayon show the letter heading and its O letter is the island; Normal shows the plain heading and its
// O is.
// While recording, the O glows red and is itself the stop control.
const title=document.querySelector('.mom-title'),topBar=document.querySelector('.mom-top'),sub=$('mom-sub');
const oFor={letters:$('mom-o'),normal:$('mom-o-plain')};
const pageStyle=()=>window.momStyle?.get()||document.documentElement.dataset.style||'normal';
const lettered=()=>pageStyle()!=='normal';
const theO=()=>lettered()?oFor.letters:oFor.normal;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let gathered=false,recording=false,releaseTimer=0,overTimer=0,tipTimer=0;
const folding=()=>[topBar,sub,els.form,els.status];
// The receipt root's top margin that puts the machine just under the heading; page.css springs it.
function liftFor(on){
  const root=els.root,cur=parseFloat(getComputedStyle(root).marginTop)||0,frame=root.querySelector('.rm-frame');
  if(!on||!frame)return {cur,next:0};
  const natural=frame.getBoundingClientRect().top-cur,under=title.getBoundingClientRect().bottom+14;
  return {cur,next:Math.min(0,Math.round(under-natural))};
}
function lift(on,next){els.root.classList.toggle('is-lifted',on);els.root.style.setProperty('--mom-lift',`${next}px`);}
// Layout box without transforms, so a gathered element still measures from its own place.
function layoutBox(el){
  let x=0,y=0;for(let n=el;n;n=n.offsetParent){x+=n.offsetLeft;y+=n.offsetTop;}
  return {cx:x-scrollX+el.offsetWidth/2,cy:y-scrollY+el.offsetHeight/2,w:el.offsetWidth,h:el.offsetHeight};
}
// The O's own place, ignoring its idle moves and pulse.
function oTarget(){
  const b=layoutBox(theO()),o={left:b.cx-b.w/2,top:b.cy-b.h/2,width:b.w,height:b.h};
  return o.width&&o.top+o.height>0&&o.top<innerHeight?o:null;
}
// shift: how far el's layout moves while it flies (the toolbar rides the rising receipt).
function aim(el,o,prefix,style=el.style,shift=0){
  const b=layoutBox(el),set=(k,v)=>style.setProperty(prefix+k,v);
  if(!o||!b.w){set('x','0px');set('y','0px');set('sx','1');set('sy','1');return;}
  set('x',`${Math.round(o.left+o.width/2-b.cx)}px`);set('y',`${Math.round(o.top+o.height/2-b.cy-shift)}px`);
  set('sx',Math.max(.02,o.width*.5/b.w).toFixed(3));set('sy',Math.max(.02,o.height*.5/(b.h||1)).toFixed(3));
}
// Only the O of the style on screen is a button, and only while recording.
function armO(el,on){
  if(on){el.setAttribute('role','button');el.tabIndex=0;el.setAttribute('aria-label','Stop recording');el.dataset.tip='Tap to stop';el.removeAttribute('aria-hidden');}
  else{const had=document.activeElement===el;el.removeAttribute('role');el.removeAttribute('tabindex');el.removeAttribute('aria-label');delete el.dataset.tip;el.setAttribute('aria-hidden','true');
    el.classList.remove('is-tip');if(had)setTimeout(()=>els.root.querySelector('[data-rc="record"]')?.focus(),60);}
}
function markO(){
  const o=theO();
  for(const el of Object.values(oFor))if(el!==o){el.classList.remove('is-island','is-rec','is-release');if(el.hasAttribute('role'))armO(el,false);}
  o.classList.toggle('is-island',gathered);o.classList.toggle('is-rec',recording);
  if(recording!==o.hasAttribute('role'))armO(o,recording);
}
function stopFromO(e){
  if(!recording||e.currentTarget!==theO())return;
  if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;
  e.preventDefault();ui.stopRecording();
}
for(const el of Object.values(oFor)){el.addEventListener('click',stopFromO);el.addEventListener('keydown',stopFromO);}
function gatherForm(on,rec=false){
  const rec2=on&&rec;
  if(on)grounded();
  if(recording!==rec2){
    recording=rec2;markO();clearTimeout(tipTimer);
    // Touch has no hover, so the tip shows on its own for a moment when recording starts.
    if(recording){const o=theO();o.classList.add('is-tip');tipTimer=setTimeout(()=>o.classList.remove('is-tip'),2800);}
  }
  if(on===gathered)return;gathered=on;
  if(on){pick.close(false);info.close(false);styleMenu.close(false);}
  const o=oTarget(),controls=els.root.querySelector('.rc-island'),{cur,next}=liftFor(on);
  if(controls)aim(controls,o,'--rc-isl-',els.root.style,next-cur);
  for(const el of folding()){
    aim(el,o,'--mom-');
    el.inert=on;el.classList.toggle('is-gathered',on);el.classList.toggle('is-bubbled',!on);
    el.classList.toggle('is-faded',!o);el.classList.toggle('is-over',!on&&el!==topBar);
  }
  lift(on,next);
  clearTimeout(overTimer);
  if(!on)overTimer=setTimeout(()=>{for(const el of folding())el.classList.remove('is-over');},1800);
  clearTimeout(releaseTimer);
  title.classList.add('is-played');
  markO();
  const O=theO();O.classList.remove('is-release');
  if(!on){void O.offsetWidth;O.classList.add('is-release');releaseTimer=setTimeout(()=>O.classList.remove('is-release'),900);}
}
addEventListener('resize',()=>{if(gathered)lift(true,liftFor(true).next);});

// The heading for Record & Print, read from the live heading so the video matches the page. Halloween: each letter tile
// in em units, groups laid out in one row, with a pumpkin O. Crayon: the heading text with each letter in its own colour
// and tilt. Normal: the plain heading in the page's font.
const SHAPES=[['ml-dash','dash'],['ml-6','circle'],['ml-1','round'],['ml-11','round'],['ml-3','oct'],['ml-12','oct'],['ml-8','arch']];
function videoTitle(){
  if(!lettered()){
    const cs=getComputedStyle(title);
    return {kind:'text',text:'Merge-O-Matic',o:6,font:cs.fontFamily,weight:cs.fontWeight,color:cs.color,rec:'#dc2626',size:40,fonts:[]};
  }
  const tcs=getComputedStyle(title),F=parseFloat(tcs.fontSize)||34,halloween=pageStyle()==='halloween',items=[];let x=0,height=0;
  if(!halloween){
    const letters=[...title.querySelectorAll('.mom-word .ml')],ink=el=>getComputedStyle(el);
    const colors=[],tilts=[];
    for(const el of letters){
      const cs=ink(el),dash=el.classList.contains('ml-dash');
      colors.push(dash?cs.backgroundColor:cs.color);tilts.push(parseFloat(cs.getPropertyValue('--r'))||0);
    }
    return {kind:'text',text:'Merge-O-Matic',o:6,font:tcs.fontFamily,weight:tcs.fontWeight,color:getComputedStyle(document.body).color,rec:'#dc2626',size:40,colors,tilts,fonts:[]};
  }
  for(const group of title.querySelectorAll('.mom-word .mom-group')){
    const base=group.firstElementChild?.offsetLeft||0;let end=0;
    for(const el of group.children){
      const cs=getComputedStyle(el),w=el.offsetWidth/F,h=el.offsetHeight/F,left=(el.offsetLeft-base)/F;
      items.push({ch:el.textContent,x:x+left,w,h,color:cs.getPropertyValue('--c').trim(),ring:cs.getPropertyValue('--ring').trim(),ink:cs.color,
        border:cs.borderTopColor,r:parseFloat(cs.getPropertyValue('--r'))||0,
        shape:SHAPES.find(([c])=>el.classList.contains(c))?.[1]||'rect',o:el===oFor.letters,pumpkin:halloween&&el===oFor.letters});
      end=Math.max(end,left+w);height=Math.max(height,h);
    }
    x+=end+.35;
  }
  return {kind:'tiles',items,width:Math.max(0,x-.35),height,edge:tcs.getPropertyValue('--edge').trim()||'#1f1147',font:tcs.fontFamily,weight:tcs.fontWeight,fonts:[]};
}

// The T button opens the page style menu: Normal (the plain heading), Halloween (letter tiles in autumn or dusk colours,
// with a pumpkin O) or Crayon (crayon letters on paper or a chalkboard). Under a divider, Appearance picks Light, Dark
// or Auto (follows the system). style.js applies both saved choices before first paint.
const STYLE_NAMES={normal:'Normal',halloween:'Halloween',crayon:'Crayon'},APPEARANCE_NAMES={light:'Light',dark:'Dark',auto:'Auto'};
const appearance=()=>window.momAppearance?.get()||'auto';
function applyAppearance(value){
  const go=()=>{window.momAppearance?.set(value);styleMenu.paint();};
  if(document.startViewTransition&&!reduced.matches)document.startViewTransition(go);else go();
}
function applyStyle(style){
  const go=()=>{window.momStyle?.set(style);styleMenu.paint();music.setTheme(pageStyle());markO();if(gathered)lift(true,liftFor(true).next);};
  if(document.startViewTransition&&!reduced.matches)document.startViewTransition(go);else go();
}
const styleMenu=(()=>{
  const btn=$('mom-style'),menu=$('mom-style-menu'),items=[...menu.querySelectorAll('[role="menuitemradio"]')];
  const isOpen=()=>!menu.hidden;
  function paint(){
    const cur=pageStyle(),look=appearance();
    for(const it of items)it.setAttribute('aria-checked',String(it.dataset.style?it.dataset.style===cur:it.dataset.appearance===look));
    btn.setAttribute('aria-label',`Page style: ${STYLE_NAMES[cur]}, ${APPEARANCE_NAMES[look]} appearance. Choose a style or appearance`);
  }
  const focusAt=i=>items[(i+items.length)%items.length].focus();
  function open(at='current'){
    if(isOpen())return;
    info.close(false);
    menu.hidden=false;btn.setAttribute('aria-expanded','true');
    menu.classList.remove('is-in');void menu.offsetWidth;menu.classList.add('is-in');
    focusAt(at==='last'?items.length-1:Math.max(0,items.findIndex(it=>it.dataset.style&&it.getAttribute('aria-checked')==='true')));
  }
  function close(focus=true){
    if(!isOpen())return;
    menu.hidden=true;btn.setAttribute('aria-expanded','false');menu.classList.remove('is-in');
    if(focus)btn.focus();
  }
  btn.addEventListener('click',()=>isOpen()?close():open());
  btn.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open(e.key==='ArrowUp'?'last':'current');}
    else if(e.key==='Escape'&&isOpen()){e.preventDefault();close();}
  });
  menu.addEventListener('keydown',e=>{
    const i=items.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();focusAt(i+1);}
    else if(e.key==='ArrowUp'){e.preventDefault();focusAt(i-1);}
    else if(e.key==='Home'){e.preventDefault();focusAt(0);}
    else if(e.key==='End'){e.preventDefault();focusAt(items.length-1);}
    else if(e.key==='Escape'){e.preventDefault();close();}
    else if(e.key==='Tab')close(false);
  });
  // Enter and Space activate the focused item as a click.
  menu.addEventListener('click',e=>{const it=e.target.closest('[role="menuitemradio"]');if(!it)return;close();if(it.dataset.style)applyStyle(it.dataset.style);else applyAppearance(it.dataset.appearance);});
  window.momAppearance?.onChange(()=>paint());
  items.forEach((it,i)=>it.style.setProperty('--sm-i',String(i)));
  document.addEventListener('pointerdown',e=>{if(isOpen()&&!menu.contains(e.target)&&!btn.contains(e.target))close(false);},true);
  paint();
  return {close,isOpen,paint};
})();

// The music button: a loop that matches the page style, off until asked. A saved "on" starts on the first tap or key
// press anywhere, pauses while the tab is hidden, and crossfades when the style changes. It keeps playing while a
// receipt prints, and Record & Print mixes it into the video's sound.
const musicBtn=$('mom-music');
const music=createMusic({
  makeContext:()=>{const A=window.AudioContext||window.webkitAudioContext;return A?new A():null;},
  storage:(()=>{try{return window.localStorage;}catch{return null;}})(),hidden:()=>document.hidden,theme:pageStyle(),onChange:paintMusic
});
function paintMusic(){
  if(!musicBtn||!music)return;
  musicBtn.setAttribute('aria-pressed',String(music.on));
  musicBtn.setAttribute('aria-label',music.on?'Music on':'Music off');
  musicBtn.toggleAttribute('data-playing',music.playing);
}
musicBtn.addEventListener('click',()=>{music.toggle();paintMusic();});
for(const type of ['pointerdown','keydown'])document.addEventListener(type,e=>{if(!musicBtn.contains(e.target))music.gesture();},{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>music.visibility());
window.momMusic={debug:()=>music.debug()};
paintMusic();

// Counting prints: one anonymous report per completed receipt, after the tear (see stats.js). A quick reprint of the
// same receipt is not counted again.
let lastPrint={key:'',at:0};
function countPrint({range}){
  if(!state.login||!state.repo||state.demo)return;
  const key=`${state.login.toLowerCase()}|${state.repo.toLowerCase()}|${range}`,at=Date.now();
  if(key===lastPrint.key&&at-lastPrint.at<10000)return;
  lastPrint={key,at};
  recordPrint({theme:pageStyle(),range,login:state.login});
}

// The i button: what is stored (nothing) and how much lookup capacity is left, as a share and a level only. A
// non-modal popover: Escape, a click outside or tabbing away closes it. The meter refreshes every 30 s while open.
const info=(()=>{
  const btn=$('mom-info'),pop=$('mom-info-pop'),count=$('mom-info-count'),meter=$('mom-meter'),line=$('mom-meter-line'),bar=$('mom-meter-bar'),fill=$('mom-meter-fill'),sub=$('mom-meter-sub');
  const LEVELS={plenty:'Plenty left',low:'Running low',paused:'Paused'};
  const clock=iso=>{const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';};
  let timer=0,ctrl=null;
  const isOpen=()=>!pop.hidden;
  function paint(state,data){
    meter.dataset.state=state;bar.hidden=state!=='ok';
    if(state==='ok'){
      const pct=Math.round(Math.max(0,Math.min(1,data.available))*100),at=clock(data.resetsAt),paused=data.level==='paused';
      meter.dataset.level=data.level;
      line.replaceChildren(Object.assign(document.createElement('b'),{textContent:paused&&at?`Paused until ${at}`:LEVELS[data.level]}),paused?'':` · ${pct}% available`);
      bar.setAttribute('aria-valuenow',String(pct));bar.setAttribute('aria-valuetext',`${LEVELS[data.level]}, ${pct}% available`);
      fill.style.width=`${pct}%`;
      sub.textContent=at&&!paused?`Refreshes at ${at}`:paused?'Lookups resume on their own. Try again then.':'';
    }else if(state==='demo'){
      line.textContent='Demo data: this server shows made-up sample data, so nothing counts against the limit.';
      sub.textContent='';
    }else if(state==='off'){
      line.textContent='Capacity is not available right now.';
      sub.textContent='Lookups still work. Try again in a moment.';
    }else{line.textContent='Checking capacity...';sub.textContent='';}
  }
  // A fun stat. Hidden until there is something to show, or when the count cannot be read.
  async function loadCount(){
    const n=(await fetchStats())?.printedTotal;
    count.hidden=!(Number.isFinite(n)&&n>0);
    if(!count.hidden)count.textContent=`${n.toLocaleString()} ${n===1?'receipt':'receipts'} printed`;
  }
  async function load(){
    ctrl?.abort();ctrl=new AbortController();
    loadCount();
    try{
      const data=await api('/api/fun/merged/limit',ctrl.signal);
      if(data?.demo)paint('demo');
      else if(Number.isFinite(data?.available)&&LEVELS[data?.level])paint('ok',data);
      else paint('off');
    }catch(error){if(error?.name!=='AbortError')paint('off');}
  }
  function open(){
    if(isOpen())return;
    styleMenu.close(false);
    pop.hidden=false;btn.setAttribute('aria-expanded','true');
    if(meter.dataset.state!=='ok')paint('loading');
    load();timer=setInterval(()=>{if(!document.hidden)load();},30000);
    pop.focus();
  }
  function close(focus=true){
    if(!isOpen())return;
    pop.hidden=true;btn.setAttribute('aria-expanded','false');
    clearInterval(timer);ctrl?.abort();
    if(focus)btn.focus();
  }
  btn.addEventListener('click',()=>isOpen()?close():open());
  pop.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
  btn.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()){e.preventDefault();close();}});
  pop.addEventListener('focusout',e=>{if(isOpen()&&e.relatedTarget&&!pop.contains(e.relatedTarget)&&e.relatedTarget!==btn)close(false);});
  document.addEventListener('pointerdown',e=>{if(isOpen()&&!pop.contains(e.target)&&!btn.contains(e.target))close(false);},true);
  return {open,close,isOpen};
})();

// Idle letters: once the heading has popped in, every 2 to 5 s one to three letters make a quick move. Transforms only,
// skipped while the tab is hidden, under reduced motion, in Normal, and never on the O while it is the island.
// Halloween has spookier moves, a candle flicker on the pumpkin, and now and then a bat flutters across the heading.
const IDLE={crayon:['wiggle','hop','tilt','squish','flip','nod'],halloween:['wobble','wobble','hop','squish','nod']};
const takeRandom=list=>list.splice(Math.floor(Math.random()*list.length),1)[0];
const bat=document.querySelector('.mom-bat');
function play(el,cls,ms=1400){
  const done=()=>{clearTimeout(t);el.classList.remove('is-idle',cls);};
  const t=setTimeout(done,ms);
  el.classList.add('is-idle',cls);el.addEventListener('animationend',done,{once:true});
}
function idle(){
  setTimeout(idle,2000+Math.random()*3000);
  if(document.hidden||reduced.matches||!lettered())return;
  const style=pageStyle(),moves=IDLE[style]||IDLE.crayon;
  const letters=[...title.querySelectorAll(`.ml:not(.ml-dash):not(.is-island):not(.is-release):not(.is-idle)${style==='halloween'?':not(.ml-6)':''}`)];
  const n=Math.random()<.6?1:Math.random()<.75?2:3;
  for(let i=0;i<n&&letters.length;i++)play(takeRandom(letters),`idle-${moves[Math.floor(Math.random()*moves.length)]}`);
}
// Halloween's own timers: the pumpkin's candle flickers every 3 to 6 s; a bat flies out of the pumpkin, circles it and
// leaves shortly after the heading pops in, then every 8 to 15 s; and every 25 to 40 s the pumpkin turns into a cauldron
// and a witch on a broom rises out of it and swoops away. Paths are WAAPI transforms and opacity, paused while the tab is
// hidden. Never under reduced motion, never while the O is the island, and never two flights at once.
const spooky=()=>!document.hidden&&!reduced.matches&&pageStyle()==='halloween';
const witch=document.querySelector('.mom-witch'),sparks=[...document.querySelectorAll('.mom-sparks b')];
const flights=new Set();
const oBusy=()=>oFor.letters.matches('.is-island,.is-release,.is-rec');
const flying=()=>flights.size>0;
function flicker(){
  setTimeout(flicker,3000+Math.random()*3000);
  const O=oFor.letters;
  if(spooky()&&!O.matches('.is-island,.is-release,.is-rec,.is-idle,.is-brew'))play(O,'idle-flicker',1500);
}
// Where the pumpkin sits and how big the heading is, relative to the bat's and witch's positioned parent.
function stage(){
  const o=oFor.letters.getBoundingClientRect(),box=title.getBoundingClientRect(),intro=bat?.offsetParent?.getBoundingClientRect();
  if(!intro||!o.width)return null;
  return {cx:o.left+o.width/2-intro.left,cy:o.top+o.height/2-intro.top,w:o.width,h:o.height,
    left:box.left-intro.left,right:box.right-intro.left,top:box.top-intro.top,k:Math.max(.55,Math.min(1.1,o.width/70))};
}
const tf=(x,y,s,r=0,flip=1)=>`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${(s*flip).toFixed(3)},${s.toFixed(3)})`;
function fly(el,frames,duration,delay=0){
  const anim=el.animate(frames,{duration,delay,fill:'both',easing:'linear'});
  flights.add(anim);
  const end=()=>{flights.delete(anim);anim.cancel();};
  anim.finished.then(end,end);
  return anim;
}
// Out of the carved mouth, up over the stem, one and a quarter loops around the pumpkin, then off and away.
function batFrames(g,dir){
  const {cx,cy,w,h,k}=g,rx=w*.78+14*k,ry=h*.62+10*k,f=[];
  f.push({offset:0,opacity:0,transform:tf(cx,cy+h*.18,.1*k)});
  f.push({offset:.07,opacity:1,transform:tf(cx,cy+h*.05,.35*k)});
  f.push({offset:.18,transform:tf(cx+dir*6,cy-ry,.8*k,-dir*8)});
  const n=26,turn=Math.PI*2.5;
  for(let i=1;i<=n;i++){
    const t=i/n,a=-Math.PI/2+dir*turn*t,depth=.9+.14*Math.sin(a);
    f.push({offset:.18+.58*t,transform:tf(cx+rx*Math.cos(a),cy+ry*Math.sin(a),depth*k,dir*Math.cos(a)*14)});
  }
  const edge=dir>0?g.right+60:g.left-60;
  f.push({offset:.9,opacity:.9,transform:tf(cx+(edge-cx)*.55,g.top-18*k,.6*k,-dir*10)});
  f.push({offset:1,opacity:0,transform:tf(edge,g.top-54*k,.22*k,-dir*16)});
  return f;
}
function flyBat(force=false){
  if(!bat||flying()||oBusy()||!(force?pageStyle()==='halloween':spooky()))return null;
  const g=stage();if(!g)return null;
  bat.classList.add('is-flying');
  const anim=fly(bat,batFrames(g,Math.random()<.5?1:-1),4600);
  const done=()=>bat.classList.remove('is-flying');anim.finished.then(done,done);
  return anim;
}
function bats(first){setTimeout(()=>{flyBat();bats(false);},first?900:8000+Math.random()*7000);}
// The cauldron: the pumpkin squashes into the pot and the brew bubbles; the witch rises out, swoops across the heading
// and flies off; then the pumpkin pops back. About 3.6 s in all.
const BREW=3600;
function witchFrames(g,dir){
  const {cx,cy,k}=g,flip=dir>0?1:-1,edge=dir>0?g.right+90:g.left-90,span=edge-cx;
  return [
    {offset:0,opacity:0,transform:tf(cx,cy-2,.08*k,0,flip)},
    {offset:.06,opacity:1,transform:tf(cx,cy-6*k,.3*k,-flip*20,flip)},
    {offset:.22,transform:tf(cx-dir*10*k,cy-g.h*1.05,.85*k,-flip*14,flip)},
    {offset:.4,transform:tf(cx+span*.2,cy+g.h*.25,1*k,flip*14,flip)},
    {offset:.58,transform:tf(cx+span*.45,cy+g.h*.4,1.05*k,flip*4,flip)},
    {offset:.76,opacity:1,transform:tf(cx+span*.72,cy-g.h*.25,.8*k,-flip*16,flip)},
    {offset:1,opacity:0,transform:tf(edge,g.top-70*k,.3*k,-flip*24,flip)},
  ];
}
const jack=oFor.letters.querySelector('.jk-pumpkin'),pot=oFor.letters.querySelector('.jk-pot');
function brew(force=false){
  if(!witch||!jack||!pot||flying()||oBusy()||!(force?pageStyle()==='halloween':spooky()))return null;
  const g=stage();if(!g)return null;
  const O=oFor.letters,dir=Math.random()<.5?1:-1;
  O.classList.remove('is-idle','idle-flicker');O.classList.add('is-brew');witch.classList.add('is-flying');
  fly(jack,[{offset:0,opacity:1,transform:'scale(1)'},{offset:.1,opacity:0,transform:'scale(1.12,.55)'},
    {offset:.82,opacity:0,transform:'scale(.6,1.2)'},{offset:.93,opacity:1,transform:'scale(1.08,.94)'},{offset:1,opacity:1,transform:'scale(1)'}],BREW);
  fly(pot,[{offset:0,opacity:0,transform:'scale(.7,1.25)'},{offset:.12,opacity:1,transform:'scale(1.06,.95)'},{offset:.18,transform:'scale(1)'},
    {offset:.78,opacity:1,transform:'scale(1)'},{offset:.9,opacity:0,transform:'scale(1.15,.5)'},{offset:1,opacity:0,transform:'scale(1)'}],BREW);
  const frames=witchFrames(g,dir),anim=fly(witch,frames,2700,380);
  sparks.forEach((el,i)=>fly(el,frames.map(({offset,opacity,transform})=>({offset,transform:`${transform} scale(${(.8-i*.1).toFixed(2)})`,
    ...(opacity===undefined?{}:{opacity:opacity*(.9-i*.14)})})),2700,380+(i+1)*70));
  const done=()=>{witch.classList.remove('is-flying');O.classList.remove('is-brew');};
  Promise.allSettled([...flights].map(a=>a.finished)).then(done);
  return anim;
}
function witches(wait=25000+Math.random()*15000){setTimeout(()=>{if(spooky()&&(flying()||oBusy()))return witches(2000);brew();witches();},wait);}
// Printing or recording takes the O, so a flight in progress ends at once.
function grounded(){for(const a of [...flights])a.finish();}
document.addEventListener('visibilitychange',()=>{for(const a of flights)document.hidden?a.pause():a.play();});
window.momHalloween={bat:()=>Boolean(flyBat(true)),witch:()=>Boolean(brew(true)),
  seek:ms=>{for(const a of flights){a.pause();a.currentTime=ms;}return flights.size;},
  play:()=>{for(const a of flights)a.play();},flights:()=>flights.size};
setTimeout(()=>{title.classList.add('is-played');idle();flicker();bats(true);witches();},1400);

const ui=createReceiptUI({
  getRange:()=>state.range,
  setRange:r=>{state.range=r;syncUrl();},
  scope:()=>state.login&&state.repo?`${state.login.toLowerCase()}|${state.repo.toLowerCase()}`:null,
  blocked:()=>!state.login?'ENTER A USERNAME':!state.repo?'CHOOSE A REPO':null,
  blockedTitle:()=>!state.login?'Enter a GitHub username first':'Choose a repository first',
  async fetchMerged({since,until,signal}){
    const q=new URLSearchParams({login:state.login,repo:state.repo,since});
    if(until)q.set('until',until);
    const json=await api(`/api/fun/merged?${q}`,signal);
    if(json.demo)setDemo(true);
    return json;
  },
  store:()=>lib.storeIdentity({repo:state.repo},1),
  title:()=>state.repo.split('/').pop(),
  contributor:data=>data?.login||state.login,
  repoLabel:repo=>String(repo||'').split('/').pop(),
  grouped:()=>false,
  island:({gathered:on,recording:rec})=>gatherForm(on,rec),
  islandPill:false,
  videoTitle,
  recordAudio:target=>music.attach(target),
  printed:countPrint,
  background:()=>getComputedStyle(document.body).backgroundColor,
  styles:false
});
ui.mount(els.root);
const rerender=()=>{els.root.innerHTML=ui.html();ui.mounted();};

// Repository picker: a themed combobox and listbox over the hidden select, which stays the source of truth, so a pick
// fires the select's own change handling. Touch devices get the styled native select instead (page.css).
const pick=(()=>{
  const $$=id=>document.getElementById(id);
  const root=$$('mom-pick'),btn=$$('mom-repo-btn'),value=$$('mom-repo-value'),pop=$$('mom-repo-pop'),search=$$('mom-repo-search'),filter=$$('mom-repo-filter'),list=$$('mom-repo-list'),empty=$$('mom-repo-empty');
  const CHECK='<svg class="mom-pick-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  // The filter only earns its place in a long list; shorter lists take focus themselves and use type-ahead.
  const FILTER_FROM=10;
  let shown=[],active=-1,typed='',typedAt=0;
  const isOpen=()=>!pop.hidden;
  const filtering=()=>!search.hidden;
  const keyEl=()=>filtering()?filter:list;
  const options=()=>[...els.repo.options].map((o,i)=>({i,value:o.value,text:o.textContent,disabled:o.disabled}));
  function sync(){
    const sel=els.repo,cur=sel.options[sel.selectedIndex];
    btn.disabled=sel.disabled;
    const placeholder=!cur||!cur.value;
    value.textContent=cur?cur.textContent:'';root.classList.toggle('is-placeholder',placeholder);
    if(sel.disabled&&isOpen())close(false);
    if(isOpen())render();
  }
  function render(){
    const q=filter.value.trim().toLowerCase(),sel=els.repo.value;
    shown=options().filter(o=>o.value?o.text.toLowerCase().includes(q):!q);
    list.innerHTML=shown.map((o,n)=>`<li role="option" id="mom-repo-opt-${n}" class="mom-pick-opt${o.value?'':' is-placeholder'}" data-n="${n}" aria-selected="${o.value!==''&&o.value===sel}"${o.disabled?' aria-disabled="true"':''}>${CHECK}<span></span></li>`).join('');
    list.querySelectorAll('.mom-pick-opt span').forEach((s,n)=>{s.textContent=shown[n].text;});
    empty.hidden=shown.some(o=>o.value)||!q;
    const at=shown.findIndex(o=>o.value&&o.value===sel);
    setActive(q?shown.findIndex(o=>!o.disabled):at>=0?at:shown.findIndex(o=>!o.disabled));
  }
  function setActive(n){
    active=n;
    list.querySelectorAll('.is-active').forEach(el=>el.classList.remove('is-active'));
    const el=n>=0?list.children[n]:null;
    for(const k of [filter,list])k.removeAttribute('aria-activedescendant');
    if(el){el.classList.add('is-active');keyEl().setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}
  }
  // Type-ahead without a filter: the typed letters jump to the next repository that starts with them.
  function typeAhead(ch){
    const t=Date.now();typed=(t-typedAt<700?typed:'')+ch.toLowerCase();typedAt=t;
    const from=typed.length===1?active+1:active,n=shown.length;
    for(let i=0;i<n;i++){const k=(from+i+n)%n,o=shown[k];if(o.value&&!o.disabled&&o.text.toLowerCase().startsWith(typed)){setActive(k);return;}}
  }
  function move(step){
    const ok=shown.map((o,n)=>o.disabled?-1:n).filter(n=>n>=0);if(!ok.length)return;
    const pos=ok.indexOf(active);
    setActive(step==='first'?ok[0]:step==='last'?ok.at(-1):ok[Math.max(0,Math.min(ok.length-1,pos<0?0:pos+step))]);
  }
  // Opens below the control, or above it when there is more room there, and never taller than the viewport allows.
  function place(){
    const r=btn.getBoundingClientRect(),below=innerHeight-r.bottom-12,above=r.top-12,up=below<260&&above>below;
    root.classList.toggle('is-above',up);
    pop.style.maxHeight=`${Math.max(140,Math.min(380,up?above:below))}px`;
  }
  function open(seed=''){
    if(btn.disabled||isOpen())return;
    search.hidden=options().filter(o=>o.value).length<FILTER_FROM;
    pop.hidden=false;root.classList.add('is-open');btn.setAttribute('aria-expanded','true');
    filter.value=filtering()?seed:'';place();render();keyEl().focus({preventScroll:true});
    if(seed&&!filtering())typeAhead(seed);
  }
  function close(focus=true){
    if(!isOpen())return;
    pop.hidden=true;root.classList.remove('is-open','is-above');btn.setAttribute('aria-expanded','false');
    for(const k of [filter,list])k.removeAttribute('aria-activedescendant');
    if(focus)btn.focus({preventScroll:true});
  }
  function choose(n){
    const o=shown[n];if(!o||o.disabled||!o.value)return;
    close();
    if(els.repo.value!==o.value){els.repo.value=o.value;sync();els.repo.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  btn.addEventListener('click',()=>isOpen()?close():open());
  btn.addEventListener('keydown',e=>{
    if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)||(e.altKey&&e.key==='ArrowDown')){e.preventDefault();open();}
    else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&/\S/.test(e.key)){e.preventDefault();open(e.key);}
  });
  filter.addEventListener('input',render);
  function onKey(e){
    const k=e.key;
    if(k==='ArrowDown'||k==='ArrowUp'){e.preventDefault();if(e.altKey&&k==='ArrowUp'){choose(active);return;}move(k==='ArrowDown'?1:-1);}
    else if(k==='Home'||k==='End'){e.preventDefault();move(k==='Home'?'first':'last');}
    else if(k==='PageDown'||k==='PageUp'){e.preventDefault();move(k==='PageDown'?8:-8);}
    else if(k==='Enter'||(k===' '&&e.currentTarget===list)){e.preventDefault();choose(active);}
    else if(k==='Escape'){e.preventDefault();close();}
    else if(k==='Tab')close(false);
    else if(e.currentTarget===list&&k.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();typeAhead(k);}
  }
  filter.addEventListener('keydown',onKey);
  list.addEventListener('keydown',onKey);
  list.addEventListener('pointerdown',e=>e.preventDefault());
  list.addEventListener('pointermove',e=>{const li=e.target.closest('.mom-pick-opt');if(li&&!li.hasAttribute('aria-disabled')&&Number(li.dataset.n)!==active)setActive(Number(li.dataset.n));});
  list.addEventListener('click',e=>{const li=e.target.closest('.mom-pick-opt');if(li)choose(Number(li.dataset.n));});
  document.addEventListener('pointerdown',e=>{if(isOpen()&&!root.contains(e.target))close(false);},true);
  root.addEventListener('focusout',e=>{if(isOpen()&&e.relatedTarget&&!root.contains(e.relatedTarget))close(false);});
  addEventListener('resize',()=>{if(isOpen())place();});
  addEventListener('scroll',()=>{if(isOpen())place();},{passive:true});
  return {sync,close,isOpen};
})();

function fillRepos(){
  try{fillOptions();}finally{pick.sync();}
}
function fillOptions(){
  const sel=els.repo,repos=state.repos;
  if(!state.login){sel.innerHTML='<option value="">Enter a username first</option>';sel.disabled=true;return;}
  if(!repos){sel.innerHTML='<option value="">Looking up repositories…</option>';sel.disabled=true;return;}
  if(!repos.length){sel.innerHTML='<option value="">No public merged pull requests</option>';sel.disabled=true;return;}
  const opts=['<option value="" disabled>Choose a repository</option>'];
  for(const r of repos){const o=document.createElement('option');o.value=r.repo;o.textContent=`${r.repo} (${r.count.toLocaleString('en-US')})`;opts.push(o.outerHTML);}
  sel.innerHTML=opts.join('');sel.disabled=false;
  sel.value=repos.some(r=>r.repo===state.repo)?state.repo:'';
}

function chooseRepo(repo){
  if(repo===state.repo)return;
  ui.reset();state.repo=repo;syncUrl();rerender();
  if(repo){ui.load(DEFAULT_RANGE);if(state.range!==DEFAULT_RANGE)ui.load(state.range);}
}

// wanted: a repository to select once the list arrives, such as one from a shared link.
async function lookup(login,wanted=''){
  if(login===state.lookupFor&&(state.repos||state.lookup))return;
  state.lookup?.abort();
  state.lookupFor=login;state.repos=null;
  ui.reset();state.repo='';
  if(!wanted)syncUrl();
  fillRepos();
  if(!login){status('');rerender();return;}
  const cached=repoCache.get(login.toLowerCase());
  const ctrl=new AbortController();state.lookup=ctrl;
  status('');
  try{
    const json=cached||await api(`/api/fun/merged/repos?login=${encodeURIComponent(login)}`,ctrl.signal);
    repoCache.set(login.toLowerCase(),json);
    if(state.lookupFor!==login)return;
    setDemo(json.demo);
    state.repos=json.repos||[];
    fillRepos();
    // The picker shows the repositories, so only an empty result needs words here.
    status(state.repos.length?'':`${json.login||login} has no merged pull requests in public repositories.`,state.repos.length?'':'warn');
    if(wanted&&state.repos.some(r=>r.repo.toLowerCase()===wanted.toLowerCase()))chooseRepo(state.repos.find(r=>r.repo.toLowerCase()===wanted.toLowerCase()).repo);
    else{syncUrl();rerender();}
    els.repo.value=state.repo;pick.sync();
  }catch(error){
    if(error.name==='AbortError')return;
    if(state.lookupFor!==login)return;
    state.repos=[];fillRepos();
    els.repo.innerHTML=`<option value="">${error.status===404?'No such user':'Could not look up repositories'}</option>`;pick.sync();
    status(error.message,'error');rerender();
  }finally{if(state.lookup===ctrl)state.lookup=null;}
}
let typing=0;
function takeLogin(){
  const raw=els.login.value.trim().replace(/^@/,'');
  if(raw&&!LOGIN_RE.test(raw)){clearTimeout(typing);status('GitHub usernames use letters, numbers and single hyphens.','error');return;}
  if(raw.toLowerCase()===state.login.toLowerCase()&&(state.repos||state.lookup))return;
  state.login=raw;syncUrl();lookup(raw);
}
els.login.addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(takeLogin,700);});
els.login.addEventListener('change',()=>{clearTimeout(typing);takeLogin();});
els.form.addEventListener('submit',e=>{e.preventDefault();clearTimeout(typing);takeLogin();});
els.repo.addEventListener('change',()=>{pick.sync();chooseRepo(els.repo.value);});
// The sample login lives on the button in index.html, so this script never names a person.
$('mom-try').addEventListener('click',async e=>{
  const sample=e.currentTarget.dataset.login;
  if(!sample||!LOGIN_RE.test(sample))return;
  clearTimeout(typing);
  els.login.value=sample;state.login=sample;syncUrl();
  await lookup(sample);
  if(state.lookupFor!==sample||state.repo||!state.repos?.length)return;
  chooseRepo(state.repos[0].repo);els.repo.value=state.repo;pick.sync();
});

const startLogin=(params.get('login')||'').trim().replace(/^@/,'');
if(startLogin&&LOGIN_RE.test(startLogin)){
  els.login.value=startLogin;state.login=startLogin;
  lookup(startLogin,(params.get('repo')||'').trim());
}else syncUrl();
