// The hackathon demo: walks the page through demo-script.js by pressing its real controls. page.js loads this module
// only when a demo flag is in the URL. Flags: autoplay runs the steps (after Hackathon Record starts, or after the Play
// demo button); voice plays the voice-over clips in demo/voice/ (made by merge-o-matic-voice.mjs) and falls
// back to the browser's speech, which a tab recording cannot hear; captions shows the script at the foot of the page.
// Each step lasts as long as its clip, or about 2.6 words a second without one, and at(f) waits until fraction f.
import {STEPS} from './demo-script.js';

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const $=sel=>document.querySelector(sel);

export function wordCount(steps=STEPS){return steps.reduce((n,s)=>n+s.text.split(/\s+/).filter(Boolean).length,0);}

export function createDemo({flags,page,ui,onDone=()=>{}}){
  let running=false,stopped=false,clip=null,timers=[],voices=null,bar=null,playBtn=null;
  const until=async(test,ms=15000)=>{const end=Date.now()+ms;while(!stopped&&!test()&&Date.now()<end)await sleep(120);};
  const later=(fn,ms)=>{timers.push(setTimeout(()=>{if(!stopped)fn();},ms));};
  const press=el=>{if(!stopped&&el&&!el.disabled)el.click();};
  function spot(el,ms=2000){
    if(!el)return;
    el.classList.add('mom-spot');
    setTimeout(()=>el.classList.remove('mom-spot'),ms);
  }
  // Scrolls the page to y over ms, easing in and out.
  function glide(y,ms){
    const from=scrollY,to=Math.max(0,Math.min(y,document.documentElement.scrollHeight-innerHeight)),t0=performance.now();
    return new Promise(ok=>{
      const step=now=>{
        if(stopped)return ok();
        const t=Math.min(1,(now-t0)/Math.max(1,ms)),e=t<.5?2*t*t:1-(-2*t+2)**2/2;
        scrollTo({top:from+(to-from)*e,behavior:'instant'});
        if(t<1)requestAnimationFrame(step);else ok();
      };
      requestAnimationFrame(step);
    });
  }
  async function openMenuAndPick(sel){
    press($('#mom-style'));await sleep(700);
    press($(sel));await sleep(300);
  }
  const target={login:page.login||'deepujain',repo:page.repo||'NVIDIA/NemoClaw'};

  const ACTIONS={
    async intro(at){
      page.els.login.value='';page.els.login.dispatchEvent(new Event('change',{bubbles:true}));
      await glide(0,400);
      await at(.3);page.halloween()?.witch();
      await at(.7);page.halloween()?.bats();
    },
    async login(at){
      await at(.18);
      const input=page.els.login;input.focus();
      for(const ch of target.login){if(stopped)return;input.value+=ch;input.dispatchEvent(new Event('input',{bubbles:true}));await sleep(120);}
      input.dispatchEvent(new Event('change',{bubbles:true}));
      await at(.6);spot($('#mom-try'),2600);
    },
    async repo(at){
      await until(()=>!page.els.repo.disabled&&page.els.repo.options.length>1);
      await at(.55);press($('#mom-repo-btn'));await sleep(1100);
      const want=target.repo.toLowerCase();
      const li=[...document.querySelectorAll('#mom-repo-list .mom-pick-opt')].find(o=>o.textContent.trim().toLowerCase().startsWith(want));
      if(li){li.scrollIntoView({block:'nearest'});await sleep(400);press(li);}
      else{page.els.repo.value=[...page.els.repo.options].find(o=>o.value.toLowerCase()===want)?.value||page.els.repo.value;page.els.repo.dispatchEvent(new Event('change',{bubbles:true}));}
    },
    async ranges(at){
      await until(()=>$('[data-rc="range"][data-value="month"]'));
      await at(.12);press($('[data-rc="range"][data-value="month"]'));
      await at(.22);press($('[data-rc="range"][data-value="quarter"]'));
      await at(.32);press($('[data-rc="years"]'));
      await at(.45);if($('.rc-years'))press($('[data-rc="years"]'));
      await at(.52);press($('[data-rc="range"][data-value="all"]'));
      await at(.66);press($('[data-rc="range"][data-value="week"]'));
      await at(.74);spot($('[data-rc="range"][data-value="week"] .count')||$('[data-rc="range"][data-value="week"]'),2400);
    },
    async print(at){
      await until(()=>$('.rm-printkey')&&!$('.rm-printkey').disabled,20000);
      await at(.1);spot($('.rm-lcd'),2600);
      await at(.3);press($('.rm-printkey'));
      await until(()=>$('.rm.is-torn'),60000);
    },
    async receipt(at,ms){
      const paper=$('.rm-paper');if(!paper)return;
      const end=paper.getBoundingClientRect().bottom+scrollY-innerHeight+80;
      await at(.04);await glide(end,ms*.85);
    },
    async share(at){
      await glide(0,900);
      await at(.15);spot($('[data-rc="share"]'),2200);
      await at(.6);spot($('[data-rc="download"]'),2200);
    },
    async record(at){
      await at(.1);spot($('.rc-rec'),3200);
    },
    async styles(at){
      await at(.06);spot($('#mom-style'),1600);
      await at(.16);await openMenuAndPick('.mom-sm-item[data-style="crayon"]');
      await at(.3);await openMenuAndPick('.mom-sm-item[data-style="normal"]');
      const look=page.appearance(),other=document.documentElement.dataset.theme==='dark'?'light':'dark';
      await at(.44);await openMenuAndPick(`.mom-sm-item[data-appearance="${other}"]`);
      await at(.58);await openMenuAndPick(`.mom-sm-item[data-appearance="${look}"]`);
      await at(.66);spot($('#mom-music'),2400);if(!page.music.on)press($('#mom-music'));
      await at(.84);if(page.music.on)press($('#mom-music'));
      await at(.88);await openMenuAndPick('.mom-sm-item[data-style="halloween"]');
    },
    async about(at){
      await at(.08);press($('#mom-info'));
      await at(.62);spot($('#mom-meter'),2400);
      await at(.96);page.info.close(false);
    },
    async outro(at){
      await at(.2);page.halloween()?.witch();
      await at(.5);page.halloween()?.bats();
    }
  };

  async function loadVoices(){
    if(!flags.voice)return null;
    try{const res=await fetch(new URL('./demo/voice/voice.json',import.meta.url),{cache:'no-cache'});if(res.ok)return await res.json();}catch{}
    return null;
  }
  // Returns the step's length in ms and a promise for the end of its voice-over.
  function speak(step){
    const guess=step.text.split(/\s+/).length/2.6*1000;
    const secs=voices?.[step.id];
    if(flags.voice&&secs){
      const a=new Audio(new URL(`./demo/voice/${step.id}.m4a`,import.meta.url));clip=a;
      const ended=new Promise(ok=>{a.onended=ok;a.onerror=ok;});
      a.play().catch(()=>{});
      return {ms:secs*1000,done:Promise.race([ended,sleep(secs*1000+1500)])};
    }
    if(flags.voice&&window.speechSynthesis){
      const u=new SpeechSynthesisUtterance(step.say||step.text);
      const ended=new Promise(ok=>{u.onend=ok;u.onerror=ok;});
      speechSynthesis.speak(u);
      return {ms:guess,done:Promise.race([ended,sleep(guess*1.6)])};
    }
    return {ms:guess,done:sleep(guess)};
  }
  // Captions show one sentence at a time, timed by its share of the step's characters.
  function caption(step,ms){
    if(!bar)return;
    const parts=step.text.match(/[^.!?]+[.!?]+\s*/g)||[step.text],total=parts.reduce((n,p)=>n+p.length,0);
    let t=0;
    for(const p of parts){later(()=>{bar.textContent=p.trim();bar.classList.add('is-on');},t);t+=ms*p.length/total;}
  }
  async function run(){
    if(running)return;
    running=true;stopped=false;playBtn?.remove();playBtn=null;
    voices=await loadVoices();
    try{
      for(const step of STEPS){
        if(stopped)break;
        const v=speak(step),t0=Date.now();
        caption(step,v.ms);
        const at=f=>sleep(Math.max(0,t0+v.ms*f-Date.now()));
        await Promise.all([v.done,Promise.resolve(ACTIONS[step.id]?.(at,v.ms)).catch(()=>{})]);
        await sleep(400);
      }
      if(!stopped)await sleep(1800);
    }finally{
      const finished=!stopped;
      halt();running=false;
      if(finished)try{onDone();}catch{}
    }
  }
  function halt(){
    stopped=true;
    for(const t of timers)clearTimeout(t);timers=[];
    clip?.pause();clip=null;
    try{window.speechSynthesis?.cancel();}catch{}
    bar?.classList.remove('is-on');
  }
  if(flags.captions){
    bar=document.createElement('div');bar.className='mom-captions';bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
    document.body.append(bar);document.documentElement.classList.add('has-captions');
  }
  if(flags.autoplay&&!flags.hackathon){
    playBtn=document.createElement('button');playBtn.type='button';playBtn.className='mom-demo-play';playBtn.textContent='▶ Play demo';
    playBtn.addEventListener('click',()=>run());
    document.body.append(playBtn);
  }
  return {
    run,stop:halt,get running(){return running;},
    // Hackathon Record: the demo starts once the whole-page recording is rolling, and stops if the recording does.
    recordChanged(st){
      if(!flags.autoplay)return;
      if(st==='armed'&&!running)setTimeout(run,600);
      else if(st==='idle'&&running)halt();
    }
  };
}
