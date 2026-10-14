import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecorder,pickMime,recordingBitrate,opaqueColor,REC_MIN_BPS,REC_MAX_BPS,recordingName,recordingClock,recordingSize,clipSummary,REC_CAP_MS,REC_TAIL_MS,REC_PRESS_MS,REC_TYPES} from '../web/kit/receipt-recorder.js';

function clock(){
  let t=0,id=0;const due=new Map();
  return {now:()=>t,timers:{setTimeout:(fn,ms)=>{due.set(++id,{fn,at:t+ms});return id;},clearTimeout:k=>due.delete(k)},
    advance(ms){const end=t+ms;for(;;){const next=[...due.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;due.delete(next[0]);t=next[1].at;next[1].fn();}t=end;},
    pending:()=>due.size};
}
function fakeTrack(kind){const l={};return {kind,stopped:false,stop(){this.stopped=true;},clone(){const c=fakeTrack(kind);this.clones.push(c);return c;},clones:[],
  addEventListener:(t,fn)=>{l[t]=fn;},fire:t=>l[t]?.()};}
function fakeEnv({supported=REC_TYPES}={}){
  const video=fakeTrack('video'),recorders=[];
  class MediaRecorder{
    static isTypeSupported(t){return supported.includes(t);}
    constructor(stream,opts){this.stream=stream;this.opts=opts;this.mimeType=opts.mimeType||'';this.state='inactive';recorders.push(this);}
    start(slice){this.slice=slice;this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable?.({data:{size:3,bytes:'abc'}});this.onstop?.();}
  }
  class MediaStream{constructor(tracks){this.tracks=tracks;}}
  class Blob{constructor(parts,{type}){this.parts=parts;this.type=type;this.size=parts.reduce((n,p)=>n+p.size,0);}}
  return {video,recorders,env:{MediaRecorder,MediaStream,Blob}};
}
const SIZE={width:1080,height:1920};

test('mime selection prefers MP4, then VP9, then VP8, and names the file to match',()=>{
  assert.equal(pickMime(t=>true),'video/mp4;codecs=avc1,mp4a');
  assert.equal(pickMime(t=>t!=='video/mp4;codecs=avc1,mp4a'),'video/mp4;codecs=avc1,mp4a.40.2','Chrome wants the AAC profile spelled out');
  assert.equal(pickMime(t=>t.startsWith('video/webm')),'video/webm;codecs=vp9,opus');
  assert.equal(pickMime(t=>t.includes('vp8')),'video/webm;codecs=vp8,opus');
  assert.equal(pickMime(()=>false),'');
  assert.equal(pickMime(()=>{throw new Error('no');}),'','a throwing isTypeSupported is not fatal');
  assert.equal(recordingName('NemoclawMergeOMatic','video/mp4;codecs=avc1,mp4a'),'NemoclawMergeOMatic.mp4');
  assert.equal(recordingName('NemoclawMergeOMatic-All','video/webm;codecs=vp9,opus'),'NemoclawMergeOMatic-All.webm');
  assert.equal(recordingClock(3400),'0:03');assert.equal(recordingClock(75000),'1:15');
});

test('the preview names the file, its length and its size',()=>{
  assert.equal(recordingSize(11570244),'11.6 MB');assert.equal(recordingSize(420),'1 KB');assert.equal(recordingSize(0),'0 KB');
  assert.equal(clipSummary({name:'NemoclawMergeOMatic.mp4',size:4.4e6,duration:19700}),'NemoclawMergeOMatic.mp4 · 0:19 · 4.4 MB');
});

test('Record & Print: records the canvas with the machine audio, presses PRINT 2 s later, stops 2 s after the cut',()=>{
  const c=clock(),f=fakeEnv(),seen=[],done=[],presses=[];
  const tapTrack=fakeTrack('audio'),audio={getAudioTracks:()=>[tapTrack]};
  const rec=createRecorder({env:f.env,now:c.now,timers:c.timers,onChange:s=>seen.push(s),onDone:d=>done.push(d)});
  assert.equal(rec.start({video:f.video,size:SIZE,title:'NemoclawMergeOMatic',audio,onPress:()=>{presses.push(c.now());rec.printed();}}),true);
  assert.equal(REC_PRESS_MS,2000);assert.equal(REC_TAIL_MS,2000);
  const r=f.recorders[0];
  assert.equal(r.opts.mimeType,'video/mp4;codecs=avc1,mp4a');
  assert.deepEqual(r.stream.tracks.map(t=>t.kind),['video','audio'],'the machine audio rides along');
  assert.notEqual(r.stream.tracks[1],tapTrack,'a clone, so stopping it leaves the sound tap alive');
  assert.equal(f.video.contentHint,'detail','text stays crisp');
  assert.equal(r.opts.videoBitsPerSecond,REC_MAX_BPS,'1080x1920 at 60 fps gets the top bitrate');assert.equal(r.opts.audioBitsPerSecond,128e3);
  c.advance(REC_PRESS_MS-1);assert.deepEqual(presses,[],'PRINT waits 2 s so the video opens on the ready machine');
  c.advance(1);assert.deepEqual(presses,[2000]);assert.equal(rec.state,'rolling');
  c.advance(12000);assert.equal(rec.elapsed(),14000);
  rec.torn(1000);rec.torn(1000);assert.equal(rec.state,'ending','a second tear is ignored');
  c.advance(1000+REC_TAIL_MS-1);assert.equal(done.length,0,'still rolling until 2 s after the cut animation');
  c.advance(1);
  assert.equal(done[0].name,'NemoclawMergeOMatic.mp4');assert.equal(done[0].mime,'video/mp4');assert.equal(done[0].reason,'torn');assert.equal(done[0].blob.size,3);
  assert.deepEqual(seen,['armed','rolling','ending','saving','idle']);
  assert.ok(f.video.stopped,'the canvas track is stopped');assert.ok(r.stream.tracks[1].stopped,'the recorded audio clone is stopped');assert.equal(tapTrack.stopped,false);
  assert.equal(c.pending(),0,'no timers left behind');
});

test('pressing PRINT by hand first cancels the automatic press; Stop cancels it too',()=>{
  const c=clock(),presses=[];
  const f=fakeEnv(),rec=createRecorder({env:f.env,now:c.now,timers:c.timers});
  rec.start({video:f.video,onPress:()=>presses.push('auto')});
  c.advance(500);rec.printed();c.advance(5000);assert.deepEqual(presses,[]);rec.stop();
  const g=fakeEnv(),again=createRecorder({env:g.env,now:c.now,timers:c.timers});
  again.start({video:g.video,onPress:()=>presses.push('auto')});
  again.stop();c.advance(5000);assert.deepEqual(presses,[]);assert.equal(c.pending(),0);
});

test('Stop, the 90 s cap, and an ended track all save what was recorded',()=>{
  for(const [how,expect] of [['stop','stop'],['cap','cap'],['ended','ended']]){
    const c=clock(),f=fakeEnv({supported:['video/webm;codecs=vp8,opus']}),done=[];
    const rec=createRecorder({env:f.env,now:c.now,timers:c.timers,onDone:d=>done.push(d)});
    rec.start({video:f.video,title:'AllProjectsMergeOMatic-Week'});
    if(how==='stop')rec.stop();else if(how==='cap')c.advance(REC_CAP_MS);else f.video.fire('ended');
    assert.equal(done.length,1,how);assert.equal(done[0].reason,expect);assert.equal(done[0].name,'AllProjectsMergeOMatic-Week.webm');
    assert.ok(f.video.stopped);assert.equal(c.pending(),0);assert.equal(rec.state,'idle');
    rec.stop();assert.equal(done.length,1,'stopping again does nothing');
  }
});

test('a browser without MediaRecorder or a canvas track explains itself and leaves nothing running',()=>{
  const errors=[],f=fakeEnv();
  const none=createRecorder({env:{},onError:(k,m)=>errors.push([k,m])});
  assert.equal(none.start({video:f.video}),false);assert.equal(none.state,'idle');assert.ok(f.video.stopped,'the unused canvas track is stopped');
  assert.equal(errors[0][0],'unsupported');assert.match(errors[0][1],/Chrome/);
  const blank=createRecorder({env:fakeEnv().env,onError:(k,m)=>errors.push([k,m])});
  assert.equal(blank.start({}),false);assert.equal(errors[1][0],'unsupported');
  const busy=fakeEnv(),rec=createRecorder({env:busy.env});rec.start({video:busy.video});
  assert.equal(rec.start({video:fakeTrack('video')}),false,'one recording at a time');rec.stop();
});

test('the bitrate stays between 8 and 12 Mbps, and the video background is always opaque',()=>{
  assert.equal(recordingBitrate({width:936,height:1800}),10108800);
  assert.equal(recordingBitrate({width:320,height:240}),REC_MIN_BPS);assert.equal(recordingBitrate({width:3840,height:2160}),REC_MAX_BPS);
  assert.equal(recordingBitrate(),REC_MIN_BPS);
  assert.equal(opaqueColor('rgb(11, 13, 20)'),'rgb(11, 13, 20)');assert.equal(opaqueColor(' #0b0d14'),'#0b0d14');
  assert.equal(opaqueColor('rgba(0, 0, 0, 0)'),'#0b0d12','a transparent background would leak alpha into the video');
  assert.equal(opaqueColor('rgba(11, 13, 20, 0.5)','#123'),'#123');assert.equal(opaqueColor(''),'#0b0d12');assert.equal(opaqueColor('transparent'),'#0b0d12');
  assert.equal(opaqueColor('#0b0d1480'),'#0b0d12');
});
