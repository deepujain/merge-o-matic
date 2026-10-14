// Background music for Merge-O-Matic, one short seamless loop per page style, made on the fly with WebAudio. Nothing is
// downloaded. Notes are scheduled a quarter second ahead on the audio clock by a light timer, so no oscillator runs
// per frame and a slow main thread never drifts the beat. Off by default; the on/off choice is remembered, and a saved
// "on" waits for the first user gesture because browsers block autoplay.

export const MUSIC_KEY='merge-o-matic-music';
const LOOKAHEAD=0.25,TICK_MS=70,FADE=1.2;

const bars=(pattern,n)=>pattern.repeat(n);
const at=(bar,step)=>bar*16+step;

// Each loop: tempo, length in 16th steps, swing (share of a step the off 16ths lag), a warmth filter, and tracks.
// A track is either drum hits (a pattern string, one character per step, "." is a rest) or notes as
// [step, midi, length in steps].
export const LOOPS={
  normal:{title:'Chill keys',bpm:76,steps:64,swing:.22,filter:2600,tracks:[
    {voice:'kick',gain:.5,hits:bars('x......x..x.....',4)},
    {voice:'brush',gain:.3,hits:bars('....x.......x...',4)},
    {voice:'hat',gain:.1,hits:bars('..x...x...x...x.',4)},
    {voice:'sub',gain:.5,notes:[[0,41,8],[10,41,4],[16,40,8],[26,40,4],[32,38,8],[42,38,4],[48,36,8],[58,43,4]]},
    ...[[53,57,60,64],[52,55,59,62],[50,53,57,60],[48,52,55,59]].flatMap((chord,bar)=>chord.map(m=>(
      {voice:'keys',gain:.16,notes:[[at(bar,0),m,12],[at(bar,10),m,5]]}))),
    {voice:'keys',gain:.14,notes:[[4,76,3],[7,74,3],[20,72,4],[36,74,3],[39,72,3],[42,69,4],[54,71,3],[58,67,5]]}
  ]},
  halloween:{title:'Haunted harpsichord',bpm:108,steps:64,swing:.18,filter:5200,tracks:[
    {voice:'kick',gain:.55,hits:bars('x.......x.......',4)},
    {voice:'bone',gain:.3,hits:bars('....x..x....x...',4)},
    {voice:'pluck',gain:.6,notes:[[0,45,2],[6,57,1],[8,45,2],[12,52,2],[16,41,2],[22,53,1],[24,41,2],[28,48,2],
      [32,38,2],[38,50,1],[40,38,2],[44,45,2],[48,40,2],[54,52,1],[56,40,2],[60,44,2]]},
    {voice:'harpsi',gain:.26,notes:[
      [at(0,0),69,2],[at(0,2),72,2],[at(0,4),76,2],[at(0,6),81,2],[at(0,8),80,2],[at(0,10),76,2],[at(0,12),72,2],[at(0,14),76,2],
      [at(1,0),65,2],[at(1,2),69,2],[at(1,4),72,2],[at(1,6),77,2],[at(1,8),76,2],[at(1,10),72,2],[at(1,12),69,2],[at(1,14),72,2],
      [at(2,0),62,2],[at(2,2),65,2],[at(2,4),69,2],[at(2,6),74,2],[at(2,8),77,2],[at(2,10),74,2],[at(2,12),69,2],[at(2,14),65,2],
      [at(3,0),64,2],[at(3,2),68,2],[at(3,4),71,2],[at(3,6),76,2],[at(3,8),74,2],[at(3,10),71,2],[at(3,12),68,2],[at(3,14),71,2]]},
    {voice:'theremin',gain:.12,notes:[[0,76,14],[16,77,14],[32,74,14],[48,80,12]]}
  ]},
  crayon:{title:'Toy box hop',bpm:116,steps:64,swing:.12,filter:7200,tracks:[
    {voice:'kick',gain:.5,hits:bars('x.......x.......',4)},
    {voice:'clap',gain:.26,hits:bars('....x.......x...',4)},
    {voice:'hat',gain:.08,hits:bars('x.x.x.x.x.x.x.x.',4)},
    {voice:'sub',gain:.42,notes:[36,43,45,41].flatMap((root,bar)=>[[at(bar,0),root,3],[at(bar,6),root+7,2],[at(bar,8),root,3],[at(bar,14),root+12,2]])},
    ...[[60,64,67],[59,62,67],[60,64,69],[60,65,69]].flatMap((chord,bar)=>chord.map(m=>({voice:'toy',gain:.1,notes:[[at(bar,4),m,2],[at(bar,12),m,2]]}))),
    {voice:'toy',gain:.34,notes:[[0,72,2],[2,76,2],[4,79,2],[6,84,2],[8,81,2],[10,79,2],[12,76,4],
      [16,74,2],[18,79,2],[20,83,2],[22,86,2],[24,83,2],[26,79,2],[28,74,4],
      [32,76,2],[34,81,2],[36,84,2],[38,81,2],[40,79,2],[42,76,2],[44,72,2],[46,74,2],
      [48,77,2],[50,76,2],[52,74,2],[54,72,2],[56,74,2],[58,79,2],[60,72,4]]},
    {voice:'glock',gain:.12,notes:[[7,91,1],[15,88,1],[23,91,1],[31,86,1],[39,93,1],[47,88,1],[55,89,1],[62,96,2]]}
  ]}
};

export const MUSIC_STYLES=Object.keys(LOOPS);
// The loop that plays for a page style. Retired and unknown names play Normal.
export const loopFor=style=>Object.hasOwn(LOOPS,style)?style:'normal';
export function savedMusic(storage){try{return storage?.getItem(MUSIC_KEY)==='on';}catch{return false;}}

// Step events, indexed once per loop so the scheduler only looks up what starts on each step.
export function compileLoop(loop){
  const events=Array.from({length:loop.steps},()=>[]);
  for(const track of loop.tracks){
    if(track.hits)for(let i=0;i<loop.steps;i++){if(track.hits[i%track.hits.length]!=='.')events[i].push({voice:track.voice,gain:track.gain,len:1});}
    for(const [step,midi,len] of track.notes||[])events[Math.floor(step)%loop.steps].push({voice:track.voice,gain:track.gain,midi,len});
  }
  return events;
}
const COMPILED=Object.fromEntries(MUSIC_STYLES.map(k=>[k,compileLoop(LOOPS[k])]));
const hz=m=>440*2**((m-69)/12);

export function createMusic({makeContext,storage=null,hidden=()=>false,theme='normal',volume=0.07,onChange=()=>{},timers=globalThis}={}){
  let on=savedMusic(storage),ctx=null,master=null,filter=null,noise=null,timer=0,players=[],style=loopFor(theme),live=0,notes=0,rec=null,link=null;
  const changed=()=>{try{onChange();}catch{}};
  const running=()=>ctx?.state==='running';
  function context(){
    if(ctx?.state==='closed'){ctx=null;master=null;players=[];}
    if(!ctx&&makeContext){try{ctx=makeContext()||null;}catch{ctx=null;}if(ctx)ctx.onstatechange=changed;}
    if(ctx&&!master){
      filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=LOOPS[style].filter;filter.Q.value=.3;
      master=ctx.createGain();master.gain.value=volume;filter.connect(master);master.connect(ctx.destination);
      if(rec)wire();
    }
    return ctx;
  }
  function noiseBuffer(){
    if(!noise){const len=Math.floor(ctx.sampleRate*.5);noise=ctx.createBuffer(1,len,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;}
    return noise;
  }
  // One short graph per note; the last source cleans the graph up when it ends.
  function note(out,nodes,sources,end){
    live++;notes++;
    const last=sources[sources.length-1];
    last.onended=()=>{live--;for(const n of nodes)try{n.disconnect();}catch{}};
    for(const s of sources){s.start(sources.startAt);s.stop(end);}
  }
  function env(g,t,peak,attack,hold,release){
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+attack);
    g.gain.setValueAtTime(peak,t+attack+hold);g.gain.exponentialRampToValueAtTime(0.0001,t+attack+hold+release);
    return t+attack+hold+release+.02;
  }
  const VOICES={
    kick(out,t,e){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(115,t);o.frequency.exponentialRampToValueAtTime(42,t+.13);
      o.connect(g).connect(out);const end=env(g,t,e.gain,.003,.02,.22);const s=[o];s.startAt=t;note(out,[o,g],s,end);},
    brush(out,t,e){const n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=noiseBuffer();f.type='bandpass';f.frequency.value=2600;f.Q.value=.5;
      n.connect(f).connect(g).connect(out);const end=env(g,t,e.gain,.03,.02,.18);const s=[n];s.startAt=t;note(out,[n,f,g],s,end);},
    hat(out,t,e){const n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=noiseBuffer();f.type='highpass';f.frequency.value=7200;
      n.connect(f).connect(g).connect(out);const end=env(g,t,e.gain,.001,.005,.04);const s=[n];s.startAt=t;note(out,[n,f,g],s,end);},
    bone(out,t,e){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(1350,t);o.frequency.exponentialRampToValueAtTime(820,t+.05);
      o.connect(g).connect(out);const end=env(g,t,e.gain,.001,.004,.06);const s=[o];s.startAt=t;note(out,[o,g],s,end);},
    harpsi(out,t,e){const a=ctx.createOscillator(),b=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();
      a.type='sawtooth';b.type='square';a.frequency.value=hz(e.midi);b.frequency.value=hz(e.midi);b.detune.value=7;f.type='bandpass';f.frequency.value=2400;f.Q.value=.6;
      a.connect(f);b.connect(f);f.connect(g).connect(out);const end=env(g,t,e.gain,.002,.01,.42);const s=[a,b];s.startAt=t;note(out,[a,b,f,g],s,end);},
    pluck(out,t,e){const o=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();o.type='triangle';o.frequency.value=hz(e.midi);
      f.type='lowpass';f.frequency.setValueAtTime(1800,t);f.frequency.exponentialRampToValueAtTime(400,t+.2);
      o.connect(f).connect(g).connect(out);const end=env(g,t,e.gain,.003,.01,.24);const s=[o];s.startAt=t;note(out,[o,f,g],s,end);},
    theremin(out,t,e,d,prev){const o=ctx.createOscillator(),lfo=ctx.createOscillator(),depth=ctx.createGain(),g=ctx.createGain();
      o.frequency.setValueAtTime(hz(prev??e.midi),t);o.frequency.exponentialRampToValueAtTime(hz(e.midi),t+.45);
      lfo.frequency.value=5.4;depth.gain.value=hz(e.midi)*.012;lfo.connect(depth).connect(o.frequency);
      o.connect(g).connect(out);const end=env(g,t,e.gain,.3,Math.max(.1,d-.7),.4);const s=[lfo,o];s.startAt=t;note(out,[o,lfo,depth,g],s,end);},
    keys(out,t,e,d){const a=ctx.createOscillator(),b=ctx.createOscillator(),bg=ctx.createGain(),g=ctx.createGain();a.frequency.value=hz(e.midi);
      b.frequency.value=hz(e.midi)*2;b.detune.value=4;bg.gain.value=.18;b.connect(bg).connect(g);a.connect(g);g.connect(out);
      const end=env(g,t,e.gain,.008,Math.min(d*.4,.5),Math.min(1.6,d*.5+.4));const s=[b,a];s.startAt=t;note(out,[a,b,bg,g],s,end);},
    sub(out,t,e,d){const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=hz(e.midi);o.connect(g).connect(out);
      const end=env(g,t,e.gain,.02,d*.5,.3);const s=[o];s.startAt=t;note(out,[o,g],s,end);},
    toy(out,t,e){const a=ctx.createOscillator(),b=ctx.createOscillator(),bg=ctx.createGain(),g=ctx.createGain();a.frequency.value=hz(e.midi);
      b.frequency.value=hz(e.midi)*3.01;bg.gain.setValueAtTime(.35,t);bg.gain.exponentialRampToValueAtTime(.01,t+.12);b.connect(bg).connect(g);a.connect(g);g.connect(out);
      const end=env(g,t,e.gain,.002,.01,.5);const s=[b,a];s.startAt=t;note(out,[a,b,bg,g],s,end);},
    glock(out,t,e){const a=ctx.createOscillator(),b=ctx.createOscillator(),bg=ctx.createGain(),g=ctx.createGain();a.frequency.value=hz(e.midi);
      b.frequency.value=hz(e.midi)*2.76;bg.gain.value=.25;b.connect(bg).connect(g);a.connect(g);g.connect(out);
      const end=env(g,t,e.gain,.001,.005,.8);const s=[b,a];s.startAt=t;note(out,[a,b,bg,g],s,end);},
    clap(out,t,e){const n=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();n.buffer=noiseBuffer();f.type='bandpass';f.frequency.value=1300;f.Q.value=1.1;
      n.connect(f).connect(g).connect(out);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(e.gain,t+.002);g.gain.exponentialRampToValueAtTime(e.gain*.2,t+.012);
      g.gain.exponentialRampToValueAtTime(e.gain,t+.016);g.gain.exponentialRampToValueAtTime(.0001,t+.15);const s=[n];s.startAt=t;note(out,[n,f,g],s,t+.17);}
  };
  function addPlayer(name,start,fade){
    const bus=ctx.createGain();bus.gain.setValueAtTime(fade?0.0001:1,start);if(fade)bus.gain.exponentialRampToValueAtTime(1,start+fade);bus.connect(filter);
    const p={name,loop:LOOPS[name],events:COMPILED[name],bus,step:0,time:start,stopAt:Infinity,prev:{}};players.push(p);
    filter.frequency.setTargetAtTime(p.loop.filter,start,.4);
    return p;
  }
  function fadeOut(p,from,len){
    if(p.stopAt!==Infinity)return;
    p.bus.gain.cancelScheduledValues(from);p.bus.gain.setValueAtTime(Math.max(.0001,p.bus.gain.value),from);p.bus.gain.exponentialRampToValueAtTime(.0001,from+len);p.stopAt=from+len;
  }
  function tick(){
    timer=0;
    if(!ctx||!players.length)return;
    const now=ctx.currentTime,until=now+LOOKAHEAD;
    for(const p of players){
      const step=60/p.loop.bpm/4;
      if(p.time<now-.5)p.time=now+.02;
      while(p.time<until&&p.time<p.stopAt){
        const t=p.time+(p.step%2?p.loop.swing*step:0);
        for(const e of p.events[p.step]){try{VOICES[e.voice](p.bus,t,e,e.len*step,p.prev[e.voice]);}catch{}if(e.midi)p.prev[e.voice]=e.midi;}
        p.step=(p.step+1)%p.loop.steps;p.time+=step;
      }
    }
    for(const p of players.filter(p=>p.stopAt<=now)){try{p.bus.disconnect();}catch{}}
    players=players.filter(p=>p.stopAt>now);
    if(players.length&&!hidden())timer=timers.setTimeout(tick,TICK_MS);
  }
  const kick=()=>{if(!timer&&players.length&&running()&&!hidden())tick();};
  function start(){
    const c=context();if(!c){changed();return false;}
    if(!players.some(p=>p.stopAt===Infinity))addPlayer(style,c.currentTime+.05,.8);
    Promise.resolve(c.state==='running'||hidden()?null:c.resume?.()).catch(()=>{}).then(()=>{kick();changed();});
    kick();changed();return true;
  }
  function stop(){
    if(ctx)for(const p of players)fadeOut(p,ctx.currentTime,.35);
    changed();
  }
  function setOn(value){
    on=Boolean(value);
    try{storage?.setItem(MUSIC_KEY,on?'on':'off');}catch{}
    if(on)start();else stop();
    return on;
  }
  // The first pointer or key press on the page starts a saved "on".
  function gesture(){if(on&&!playing())start();}
  function setTheme(next){
    const name=loopFor(next);if(name===style)return style;
    style=name;
    if(on&&ctx&&players.length){const t=ctx.currentTime+.05;for(const p of players)fadeOut(p,t,FADE);addPlayer(name,t,FADE);kick();}
    changed();return style;
  }
  function visibility(){
    if(!ctx)return;
    if(hidden()){timers.clearTimeout(timer);timer=0;try{ctx.suspend?.();}catch{}}
    else if(on&&players.length)Promise.resolve(ctx.resume?.()).catch(()=>{}).then(()=>{kick();changed();});
    changed();
  }
  // Mixes the music into a recording at the level it plays here. The recorder's context may be another one, so the
  // music reaches it through a stream. Returns a function that unlinks it.
  function wire(){
    if(!rec||!master||link)return;
    try{
      if(rec.context===ctx){master.connect(rec.destination);link={nodes:[],direct:true};}
      else{const out=ctx.createMediaStreamDestination(),src=rec.context.createMediaStreamSource(out.stream);master.connect(out);src.connect(rec.destination);link={nodes:[out,src],out};}
    }catch{link=null;}
  }
  function attach({context:c,destination}={}){
    if(!c||!destination)return ()=>{};
    const mine={context:c,destination};rec=mine;wire();
    return ()=>{
      if(rec!==mine)return;
      try{if(link?.direct)master.disconnect(rec.destination);else if(link){master.disconnect(link.out);for(const n of link.nodes)n.disconnect();}}catch{}
      rec=null;link=null;
    };
  }
  const playing=()=>on&&running()&&players.some(p=>p.stopAt===Infinity);
  function debug(){
    return {on,playing:playing(),state:ctx?.state||'none',style,loop:LOOPS[style].title,currentTime:ctx?.currentTime??null,
      players:players.map(p=>({name:p.name,step:p.step,fading:p.stopAt!==Infinity})),liveNotes:live,notesScheduled:notes,recording:Boolean(link),volume};
  }
  return {setOn,toggle:()=>setOn(!on),gesture,setTheme,visibility,attach,debug,
    get on(){return on;},get playing(){return playing();},get style(){return style;},get waiting(){return on&&!playing();}};
}
