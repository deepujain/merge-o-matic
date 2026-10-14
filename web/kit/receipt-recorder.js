// Records the receipt machine as a video: a canvas the page draws itself (receipt-video.js), plus the machine's
// own synthesized audio (never the microphone or system sound). There is no screen capture and no share prompt.
// Nothing leaves the browser; onDone gets the file. Browser APIs come in through `env` so the state machine runs
// under test with fakes.
export const REC_CAP_MS=90000,REC_TAIL_MS=2000,REC_PRESS_MS=2000;
// Chrome only accepts the MP4 pair with an explicit AAC profile (mp4a.40.2).
export const REC_TYPES=['video/mp4;codecs=avc1,mp4a','video/mp4;codecs=avc1,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];

export function pickMime(isTypeSupported){
  for(const type of REC_TYPES){try{if(isTypeSupported?.(type))return type;}catch{}}
  return '';
}
export const recordingExt=mime=>/^video\/mp4/.test(mime)?'mp4':'webm';
export const recordingName=(title,mime)=>`${title}.${recordingExt(mime)}`;
export function recordingClock(ms){const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
export function recordingSize(bytes){
  if(!(bytes>0))return '0 KB';
  return bytes<1e6?`${Math.max(1,Math.round(bytes/1e3))} KB`:`${(bytes/1e6).toFixed(1)} MB`;
}
// The preview line under the video: file name, length and size.
export const clipSummary=({name,size,duration})=>[name,recordingClock(duration||0),recordingSize(size)].join(' · ');

export const REC_FPS=60,REC_MIN_BPS=8e6,REC_MAX_BPS=12e6,REC_AUDIO_BPS=128e3;
// About 0.1 bits per pixel per frame for crisp text, kept between 8 and 12 Mbps.
export function recordingBitrate({width=0,height=0,fps=REC_FPS}={}){
  return Math.round(Math.min(REC_MAX_BPS,Math.max(REC_MIN_BPS,width*height*fps*0.1)));
}

// state: idle, armed (recording, waiting for PRINT), rolling (printing), ending (torn off; stops REC_TAIL_MS
// later) and saving.
export function createRecorder({env,now=()=>Date.now(),timers=globalThis,onChange=()=>{},onDone=()=>{},onError=()=>{}}){
  let state='idle',mime='',title='',startedAt=0;
  let tracks=[],recorder=null,chunks=[],cap=0,tail=0,press=0,reason='';
  const changed=()=>{try{onChange(state);}catch{}};
  const set=next=>{state=next;changed();};
  const release=()=>{
    timers.clearTimeout(cap);timers.clearTimeout(tail);timers.clearTimeout(press);cap=tail=press=0;
    for(const t of tracks){try{t.stop();}catch{}}
    recorder=null;tracks=[];
  };
  function fail(kind,message){release();set('idle');try{onError(kind,message);}catch{}return false;}
  function finish(){
    const type=(mime||'video/webm').split(';')[0],blob=new (env.Blob||Blob)(chunks,{type}),took=now()-startedAt,why=reason;
    chunks=[];release();set('idle');
    try{onDone({blob,name:recordingName(title,mime||'video/webm'),mime:type,reason:why,duration:took});}catch{}
  }
  // video: the canvas track to record (the recorder stops it at the end). size: its pixel size, for the bitrate.
  // audio: a MediaStream with the machine's sound, or null. onPress: called REC_PRESS_MS after recording starts
  // unless printing already began. Returns true once recording, false when it could not start.
  function start({video=null,size=null,title:name='MergeOMatic',audio=null,onPress=null}={}){
    if(state!=='idle')return false;
    if(!env.MediaRecorder||!env.MediaStream||!video){try{video?.stop();}catch{}return fail('unsupported','This browser cannot record video. Use a current Chrome, Edge, Firefox or Safari.');}
    title=name;reason='';
    try{video.contentHint='detail';}catch{}
    const sound=(audio?.getAudioTracks?.()||[]).map(t=>t.clone?.()||t);
    tracks=[video,...sound];
    mime=pickMime(t=>env.MediaRecorder.isTypeSupported?.(t));
    try{
      recorder=new env.MediaRecorder(new env.MediaStream([video,...sound]),{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:recordingBitrate(size||{}),audioBitsPerSecond:REC_AUDIO_BPS});
      mime=recorder.mimeType||mime;
      chunks=[];
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      recorder.onstop=finish;
      recorder.start(1000);
    }catch(e){return fail('failed',`Could not start recording: ${e?.message||e}`);}
    video.addEventListener?.('ended',()=>stop('ended'),{once:true});
    startedAt=now();cap=timers.setTimeout(()=>stop('cap'),REC_CAP_MS);
    if(onPress)press=timers.setTimeout(()=>{press=0;if(state==='armed')try{onPress();}catch{}},REC_PRESS_MS);
    set('armed');
    return true;
  }
  function printed(){timers.clearTimeout(press);press=0;if(state==='armed')set('rolling');}
  // after: ms until the tear-off animation finishes; the recording ends REC_TAIL_MS after that.
  function torn(after=0){if(state!=='armed'&&state!=='rolling')return;tail=timers.setTimeout(()=>stop('torn'),Math.max(0,after)+REC_TAIL_MS);set('ending');}
  function stop(why='stop'){
    if(state!=='armed'&&state!=='rolling'&&state!=='ending')return;
    reason=why;set('saving');
    timers.clearTimeout(cap);timers.clearTimeout(tail);timers.clearTimeout(press);
    try{if(recorder&&recorder.state!=='inactive')recorder.stop();else finish();}catch{finish();}
  }
  return {start,printed,torn,stop,
    get state(){return state;},get mime(){return mime;},
    get active(){return state==='armed'||state==='rolling'||state==='ending';},
    elapsed:()=>state==='idle'?0:now()-startedAt};
}

// A CSS color, or the fallback when it is missing or not fully opaque. The video background must be opaque:
// encoders drop alpha and turn faint shadows into bright colored bands.
export function opaqueColor(color,fallback='#0b0d12'){
  const c=String(color||'').trim();
  if(!c||c==='transparent')return fallback;
  const m=c.match(/^rgba?\(([^)]+)\)$/i);
  if(m){const parts=m[1].split(/[\s,/]+/).filter(Boolean);if(parts.length>3&&parseFloat(parts[3])<1)return fallback;}
  if(/^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(c)){const hex=c.slice(1),a=hex.length===4?hex[3]+hex[3]:hex.slice(6);if(a.toLowerCase()!=='ff')return fallback;}
  return c;
}
