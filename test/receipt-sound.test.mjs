import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptSound,SOUND_KEY,printJob} from '../web/kit/receipt.js';

// Resume settles asynchronously like a real AudioContext; refuse makes resume fail (autoplay policy).
function fakeAudio({refuse=0}={}){
  const log={contexts:[],starts:[],resumed:0};
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  const make=()=>{
    const c={id:log.contexts.length+1,state:'suspended',currentTime:10,sampleRate:8000,destination:{},onstatechange:null,
      set(state){this.state=state;this.onstatechange?.();},
      resume(){log.resumed++;if(this.state==='closed')return Promise.reject(new Error('closed'));if(refuse>0){refuse--;return Promise.reject(new Error('not allowed'));}return Promise.resolve().then(()=>this.set('running'));},
      suspend(){this.set('suspended');return Promise.resolve();},close(){this.set('closed');return Promise.resolve();},
      createBuffer:(n,len)=>({getChannelData:()=>new Float32Array(len)})};
    const node=kind=>({kind,gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){},start(t){log.starts.push({kind,t,ctx:c.id,state:c.state});},stop(){}});
    Object.assign(c,{createGain:()=>node('gain'),createOscillator:()=>node('osc'),createBiquadFilter:()=>node('filter'),createBufferSource:()=>node('noise')});
    log.contexts.push(c);return c;
  };
  return {log,make};
}
const memory=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};};
const settle=()=>new Promise(r=>setTimeout(r,0));
const noise=log=>log.starts.filter(s=>s.kind==='noise');

test('receipt sound waits for a gesture, then schedules once the context runs',async()=>{
  const {log,make}=fakeAudio(),s=createReceiptSound({makeContext:make,storage:memory(),random:()=>0.5,now:()=>1000});
  assert.equal(s.print({lines:10,step:40,outcome:'sale'}),0,'silent before any gesture');
  assert.equal(s.tear(),false);assert.equal(log.contexts.length,0,'no context before a gesture');
  assert.equal(s.status,'locked');
  s.unlock();assert.equal(log.contexts.length,1);assert.equal(log.resumed,1);
  assert.equal(s.print({lines:10,step:40,outcome:'sale'}),10,'one print-head burst per line');
  assert.equal(log.starts.length,0,'nothing is scheduled on a suspended context');
  await settle();
  assert.equal(s.status,'on');
  assert.ok(noise(log).length>=10&&log.starts.every(x=>x.state==='running'),'scheduled after resume, on a running context');
  assert.ok(noise(log).some(x=>Math.abs(x.t-(10.02+9*0.04))<1e-9),'the last line is timed to the paper feed');
  assert.ok(log.starts.filter(x=>x.kind==='osc').length>=5,'motor hum and the cha-ching bell');
  assert.equal(s.print({lines:20,step:40,offset:400}),10,'a re-render mid-print only plays the lines still to come');
  assert.equal(log.contexts.length,1,'the context is reused');
  assert.equal(s.tear(),true);assert.equal(s.error(),true);
});

test('suspended contexts resume on the next gesture and closed ones are replaced',async()=>{
  const {log,make}=fakeAudio(),s=createReceiptSound({makeContext:make,random:()=>0.5});
  s.unlock();await settle();s.print({lines:4,step:40});const first=log.starts.length;assert.ok(first>0);
  log.contexts[0].suspend();assert.equal(s.status,'locked','a suspended context asks for a click');
  s.unlock();s.print({lines:4,step:40});await settle();
  assert.ok(log.starts.length>first,'plays again after resume');assert.equal(log.contexts.length,1);
  log.contexts[0].close();
  const before=log.starts.length;s.unlock();s.print({lines:4,step:40});await settle();
  assert.equal(log.contexts.length,2,'a closed context is recreated');
  assert.ok(log.starts.slice(before).length>0&&log.starts.slice(before).every(x=>x.ctx===2),'and the new one plays');
});

test('a context that refuses to resume is replaced, and interrupted prints never block later ones',async()=>{
  const {log,make}=fakeAudio({refuse:1}),s=createReceiptSound({makeContext:make,random:()=>0.5});
  s.unlock();s.print({lines:6,step:40,outcome:'sale'});await settle();await settle();
  assert.equal(log.contexts.length,2,'the refusing context is swapped for a fresh one');
  assert.ok(log.starts.some(x=>x.ctx===2),'the print still plays');
  log.contexts[1].suspend();
  s.print({lines:6,step:40});s.stop();await settle();
  const quiet=log.starts.length;
  s.unlock();await settle();assert.equal(log.starts.length,quiet,'a print stopped before resume stays silent');
  for(let n=0;n<3;n++){const was=log.starts.length;assert.equal(s.print({lines:6,step:40}),6);s.stop();assert.ok(log.starts.length>was,`reprint ${n+1} plays after an interrupted print`);}
});

test('warm-up, throttled chatter and the automatic tear share one schedule',async()=>{
  const {log,make}=fakeAudio(),s=createReceiptSound({makeContext:make,random:()=>0.5,now:()=>1000});
  s.unlock();await settle();
  let before=log.starts.length;
  assert.equal(s.print({lines:10,step:40,warm:3000,outcome:'sale',tearAfter:3000}),10);
  const run=log.starts.slice(before),t0=10.02;
  assert.ok(run.some(x=>x.kind==='osc'&&Math.abs(x.t-t0)<1e-9),'the warm-up hum starts at once');
  const clicks=run.filter(x=>x.kind==='noise'&&x.t<t0+3);assert.ok(clicks.length>=20,'key-click ticks during the warm-up');
  assert.ok(run.some(x=>x.kind==='noise'&&Math.abs(x.t-(t0+3))<1e-9),'the first line prints after 3 s');
  assert.ok(run.some(x=>x.kind==='noise'&&Math.abs(x.t-(t0+3+0.4+3))<1e-9),'the rip lands 3 s after the feed');
  before=log.starts.length;
  s.print({lines:10,step:40,warm:3000,offset:3200});
  assert.ok(log.starts.slice(before).every(x=>x.t>=t0-1e-9),'a mid-print render skips the warm-up it already played');
  assert.equal(s.print({lines:3000,step:2}),200,'a 2 ms step chatters every 30 ms, not 3000 times');
  s.stop();
});

test('a job from printJob schedules real numbers, and a bad timeline is refused instead of silently throwing',async()=>{
  const {log,make}=fakeAudio(),s=createReceiptSound({makeContext:make,random:()=>0.5,now:()=>1000});
  s.unlock();await settle();
  const job=printJob({rows:40,now:0});
  assert.ok(s.print({times:job.times,durs:job.durs,kinds:job.kinds,warm:job.warm,offset:0,outcome:'sale',tearAfter:job.tearAfter})>30);
  assert.ok(log.starts.length>0&&log.starts.every(x=>Number.isFinite(x.t)),'every node starts at a real time');
  assert.equal(s.debug().lastError,'');assert.equal(s.debug().state,'running');assert.ok(s.debug().plays>=1);
  const before=log.starts.length;
  assert.equal(s.print({lines:10,step:undefined}),0,'the old step-based call with no step is refused');
  assert.equal(log.starts.length,before);assert.match(s.debug().lastError,/non-numeric/);
  assert.ok(s.print({times:job.times,durs:job.durs,kinds:job.kinds})>0,'and the next good print still plays');
  assert.equal(s.click(),true,'the PRINT key click');
});

test('receipt sound stays quiet while muted or hidden, and remembers mute',async()=>{
  const {log,make}=fakeAudio(),store=memory({[SOUND_KEY]:'off'});let hidden=false;
  const changes=[];const s=createReceiptSound({makeContext:make,storage:store,hidden:()=>hidden,onChange:()=>changes.push(s.status)});
  assert.equal(s.muted,true,'mute is restored from storage');assert.equal(s.status,'off');
  s.unlock();assert.equal(s.print({lines:5,step:40}),0);assert.equal(s.tear(),false);assert.equal(log.contexts.length,0);
  s.setMuted(false);assert.equal(store.m.get(SOUND_KEY),'on');await settle();assert.equal(s.status,'on');assert.ok(changes.includes('on'));
  assert.equal(s.print({lines:5,step:40}),5);
  hidden=true;assert.equal(s.print({lines:5,step:40}),0,'hidden pages stay silent');assert.equal(s.error(),false);
  hidden=false;s.setMuted(true);assert.equal(store.m.get(SOUND_KEY),'off');assert.equal(s.print({lines:5,step:40}),0);
  const none=createReceiptSound({makeContext:()=>{throw new Error('no audio');}});none.unlock();assert.equal(none.print({lines:5,step:40}),0,'no Web Audio is not an error');
});

test('a recording hears every bus through one tap on the same context',async()=>{
  const {make}=fakeAudio(),links=[];
  const s=createReceiptSound({makeContext:()=>{const c=make();const gain=c.createGain;c.createGain=()=>{const g=gain();g.connect=to=>links.push(to);return g;};
    c.createMediaStreamDestination=()=>({stream:{id:'tap-'+c.id}});return c;},storage:memory(),random:()=>0.5});
  assert.equal(createReceiptSound({}).captureStream(),null,'no context, no stream');
  s.unlock();await settle();
  const stream=s.captureStream();assert.equal(stream.id,'tap-1');assert.equal(s.captureStream(),stream,'one tap per context');
  s.click();
  assert.ok(links.some(to=>to&&to.stream===stream),'the click bus feeds the tap as well as the speakers');
});

test('the recording tap stays fed from the start by a silent source until released',async()=>{
  const {make}=fakeAudio(),holds=[];
  const s=createReceiptSound({makeContext:()=>{const c=make();c.createMediaStreamDestination=()=>({stream:{id:'tap'}});
    c.createConstantSource=()=>{const h={offset:{value:0},started:false,stopped:false,connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};holds.push(h);return h;};return c;},storage:memory()});
  s.unlock();await settle();
  s.captureStream();s.captureStream();
  assert.equal(holds.length,1,'one hold per recording');assert.ok(holds[0].started);assert.ok(holds[0].offset.value>0&&holds[0].offset.value<1e-4,'far below hearing');
  s.releaseCapture();assert.ok(holds[0].stopped);
  s.captureStream();assert.equal(holds.length,2,'the next recording starts a fresh one');s.releaseCapture();
});
