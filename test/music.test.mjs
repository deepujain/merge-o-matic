import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LOOPS,MUSIC_KEY,MUSIC_STYLES,loopFor,savedMusic,compileLoop,createMusic} from '../web/music.js';

function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};}

// A stand-in AudioContext that records what the music schedules.
function fakeContext(){
  const started=[];let state='suspended';
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){},cancelScheduledValues(){}});
  const node=extra=>({connect(n){return n;},disconnect(){},...extra});
  const source=kind=>node({kind,frequency:param(),detune:param(),start(t){started.push({kind,t});},stop(){},onended:null});
  const ctx={currentTime:0,sampleRate:8000,destination:node(),get state(){return state;},
    resume(){state='running';return Promise.resolve();},suspend(){state='suspended';return Promise.resolve();},
    createGain:()=>node({gain:param()}),createBiquadFilter:()=>node({type:'',frequency:param(),Q:param()}),
    createOscillator:()=>source('osc'),createBufferSource:()=>source('noise'),
    createBuffer:(c,len)=>({getChannelData:()=>new Float32Array(len)}),
    createMediaStreamDestination:()=>node({stream:{}}),createMediaStreamSource:()=>node()};
  return {ctx,started};
}
const noTimers={setTimeout:()=>1,clearTimeout(){}};

test('each page style has its own loop, and unknown or old names fall back sensibly',async()=>{
  const style=await readFile(new URL('../web/style.js',import.meta.url),'utf8');
  assert.deepEqual(MUSIC_STYLES,JSON.parse(style.match(/STYLES = (\[[^\]]*\])/)[1].replace(/'/g,'"')),'one loop per page style, in menu order');
  assert.deepEqual(MUSIC_STYLES,['normal','halloween','crayon']);
  assert.equal(loopFor('crayon'),'crayon');assert.equal(loopFor('halloween'),'halloween');assert.equal(loopFor('normal'),'normal');
  for(const old of ['varsity','classic'])assert.equal(loopFor(old),'normal',`a retired ${old} plays Normal`);
  assert.equal(loopFor('bogus'),'normal');assert.equal(loopFor(undefined),'normal');
  const voices=name=>new Set(LOOPS[name].tracks.map(t=>t.voice));
  assert.ok(voices('crayon').has('toy')&&voices('crayon').has('glock')&&voices('crayon').has('clap'),'a toy piano hop');
  assert.equal(LOOPS.crayon.title,'Toy box hop');
  assert.ok(voices('halloween').has('harpsi')&&voices('halloween').has('theremin')&&voices('halloween').has('pluck'),'a spooky harpsichord');
  assert.ok(voices('normal').has('keys')&&voices('normal').has('brush'),'chill keys');
  for(const name of MUSIC_STYLES){
    const loop=LOOPS[name],events=compileLoop(loop);
    assert.equal(events.length,loop.steps,`${name} indexes every step`);
    for(const t of loop.tracks){
      if(t.hits)assert.equal(loop.steps%t.hits.length,0,`${name} ${t.voice} drums repeat evenly`);
      for(const [step,,len] of t.notes||[])assert.ok(step>=0&&step+len<=loop.steps+.001,`${name} ${t.voice} notes stay inside the loop, so it is seamless`);
    }
    assert.ok(events[0].length>0,`${name} starts on the downbeat`);
  }
  assert.ok(LOOPS.halloween.bpm<LOOPS.crayon.bpm&&LOOPS.normal.bpm<LOOPS.halloween.bpm,'a bouncy hop, then spooky, then chill');
});

test('music is off by default, the choice is saved, and a saved on waits for a gesture',async()=>{
  const store=memory();
  assert.equal(savedMusic(store),false);
  let made=0;const {ctx}=fakeContext();
  const first=createMusic({makeContext:()=>{made++;return ctx;},storage:store,timers:noTimers});
  assert.equal(first.on,false);assert.equal(made,0,'no audio until asked');
  first.gesture();assert.equal(made,0,'a gesture does nothing while off');
  assert.equal(first.setOn(true),true);assert.equal(store.map.get(MUSIC_KEY),'on');
  first.setOn(false);assert.equal(store.map.get(MUSIC_KEY),'off');
  store.setItem(MUSIC_KEY,'on');
  const fresh=fakeContext();let made2=0;
  const again=createMusic({makeContext:()=>{made2++;return fresh.ctx;},storage:store,timers:noTimers});
  assert.equal(again.on,true,'a reload remembers on');assert.equal(made2,0,'but never autoplays');
  again.gesture();await Promise.resolve();await Promise.resolve();
  assert.equal(made2,1,'the first gesture starts it');assert.equal(again.playing,true);
  assert.ok(fresh.started.length>0,'notes are scheduled ahead on the audio clock');
  assert.ok(fresh.started.every(s=>s.t>=0&&s.t<=0.05+0.25+0.2),'only a short lookahead is queued');
  const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  assert.equal(savedMusic(broken),false);assert.doesNotThrow(()=>createMusic({storage:broken,timers:noTimers}).setOn(true));
});

test('switching themes crossfades, a hidden tab pauses, and a recording can take the mix',async()=>{
  const {ctx}=fakeContext();let hidden=false;
  const m=createMusic({makeContext:()=>ctx,storage:memory(),hidden:()=>hidden,theme:'crayon',timers:noTimers});
  m.setOn(true);await Promise.resolve();await Promise.resolve();
  assert.equal(m.debug().style,'crayon');
  m.setTheme('halloween');
  const d=m.debug();
  assert.equal(d.style,'halloween');assert.deepEqual(d.players.map(p=>[p.name,p.fading]),[['crayon',true],['halloween',false]],'the old loop fades as the new one comes in');
  hidden=true;m.visibility();assert.equal(ctx.state,'suspended','paused while hidden');
  hidden=false;m.visibility();await Promise.resolve();await Promise.resolve();assert.equal(ctx.state,'running','and back');
  const other=fakeContext().ctx,off=m.attach({context:other,destination:other.destination});
  assert.equal(m.debug().recording,true);off();assert.equal(m.debug().recording,false,'unlinks when the recording ends');
  m.setOn(false);assert.ok(m.debug().players.every(p=>p.fading),'off fades out');
});

test('the music button sits between T and i and reports its state',async()=>{
  const page=new URL('../web/',import.meta.url);
  const html=await readFile(new URL('index.html',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8'),css=await readFile(new URL('page.css',page),'utf8');
  assert.match(html,/<button type="button" class="mom-style mom-music" id="mom-music" aria-pressed="false" aria-label="Music off"/);
  assert.match(js,/aria-label',music\.on\?'Music on':'Music off'/);
  assert.match(js,/recordAudio:target=>music\.attach\(target\)/,'Record & Print mixes the music in');
  assert.match(js,/visibilitychange',\(\)=>music\.visibility\(\)/);
  assert.match(css,/@media \(prefers-reduced-motion:no-preference\)\{\n  \.mom-music\[data-playing\] \.mom-eq i\{animation:mom-eq/,'the bars only move with motion allowed');
  const src=await readFile(new URL('music.js',page),'utf8');
  assert.doesNotMatch(src,/fetch\(|\.mp3|\.ogg|new Audio\(|requestAnimationFrame|setInterval/,'made on the fly, scheduled on the audio clock');
});
