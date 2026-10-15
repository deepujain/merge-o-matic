// The MERGE-O-MATIC 40 on a page: range toolbar, machine, paper, sound, Record & Print, Share and Download.
// Framework-free. The host puts html() into its page after every render (or lets mount() own an element), calls
// mounted() once the markup is in the document, and supplies data and page chrome through hooks:
//   fetchMerged({range,since,until,scope,signal}) -> payload {items,...}; throw an Error with input or restart set
//     to print the matching VOID slip.
//   scope() -> cache scope string, or null while there is nothing to print. blocked() -> LCD line when PRINT is off.
//   store(data,lib) -> {name,address}. title() -> name for file names. contributor(data), repoLabel(repo),
//   grouped() -> whether several stores may print in departments. getRange()/setRange(range).
//   active() -> whether the machine is on screen. requestRender(). todayCount() -> badge count or null.
//   island({gathered,since,recording}) -> optional: gather the host's own controls with the toolbar while a print runs.
//   islandPill: false -> the host draws its own island: no visible pill, only the hidden status, and the host offers
//     a stop control through ui.stopRecording(). The toolbar gathers toward --rc-isl-x/--rc-isl-y, scaled to
//     --rc-isl-sx/--rc-isl-sy, when the host sets them on an ancestor.
//   videoTitle() -> optional heading spec that Record & Print draws above the machine (see drawTitle in
//     receipt-video.js); its fonts:[...] are loaded with document.fonts.load first. Without it the video is unchanged.
//   printed({range,items}) -> optional: once per receipt, after it is torn off. Never for a VOID slip.
//   recordAudio({context,destination}) -> optional: connect the host's own audio (music) into Record & Print's
//     audio track, at the level it plays; returns a function that disconnects it when the recording ends.
//   chrome: {open(html,{label,render}),refresh(),close(),isOpen(),onClose(fn),query(sel),toast(msg,tone)} to use
//     the host's dialog and toast; without it the kit brings its own.
import * as lib from './receipt.js';
import * as rec from './receipt-recorder.js';

export {lib,rec};
// Week, Month and Quarter are the last 7, 30 and 90 days up to now. Year is one calendar year: "year" is this year
// so far, "year:2025" an earlier one. FIRST_YEAR bounds the Year menu.
export const RANGES={week:'Week',month:'Month',quarter:'Quarter',year:'Year',all:'All'};
export const DEFAULT_RANGE='week',FIRST_YEAR=2008;
const DAYS={week:7,month:30,quarter:90};
export const rangeYear=(r,now=new Date())=>r==='year'?now.getFullYear():/^year:\d{4}$/.test(r||'')?Number(r.slice(5)):null;
export function validRange(r,now=new Date()){
  if(r==='year')return true;
  const y=rangeYear(r,now);
  return y!=null?y>=FIRST_YEAR&&y<=now.getFullYear():Object.hasOwn(RANGES,r);
}
export const rangeKind=r=>rangeYear(r)!=null?'year':r;
export const EMPTY={week:['Nothing merged in the last 7 days.','Fresh week, empty cart.'],month:['Nothing merged in the last 30 days.','A quiet month. The shelves are waiting.'],quarter:['Nothing merged in the last 90 days.','A long quiet stretch. Every store has one.'],year:['Nothing merged that year.','Every store starts with one sale.'],all:['Nothing merged here yet.','Every store starts with one sale.']};
export const SOUND_TITLES={on:'Sound on. Select to mute.',off:'Sound off. Select to unmute.',locked:'Click to enable sound.'};
export const TEAR_ANIM_MS=1000;
const SR_ONLY='position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
// Icons adapted from Lucide (ISC).
const ICONS={
  receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  record:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
  download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  share:'<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  printer:'<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  volume:'<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/>',
  volumeOff:'<path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'
};
export const kitIcon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.receipt}</svg>`;
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plural=(n,word,many=word+'s')=>`${n} ${n===1?word:many}`;
// The approval check on the paper: a space holds exactly one character cell, and the check sits over it and the
// blank cells beside it, square ends like a thermal dot line.
const CHECK_SVG='<span class="rc-check"> <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.4 5.4 4 8 8.8 2.2"/></svg></span>';

// Share and Download appear once the paper is torn off and its tear animation (after ms) has played.
// shown; since: ms they have been showing; wait: ms until they appear, or null.
export function outputState(ph,after=TEAR_ANIM_MS){
  if(ph?.phase!=='torn')return {shown:false,since:0,wait:null};
  const since=(ph.tornFor||0)-after;
  return since<0?{shown:false,since:0,wait:-since}:{shown:true,since,wait:null};
}

// Local-clock windows. Week, Month and Quarter start at midnight 6, 29 and 89 days ago, so today is the last of
// their 7, 30 and 90 days. A past year ends at its last midnight; this year runs to now.
export function receiptWindow(range,now=new Date()){
  if(range==='all')return {since:'all',until:null,start:null};
  const y=rangeYear(range,now);
  if(y!=null){const start=new Date(y,0,1),end=new Date(y+1,0,1);return {since:start.toISOString(),until:end<=now?end.toISOString():null,start,year:y};}
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-((DAYS[range]||7)-1));
  return {since:start.toISOString(),until:null,start};
}

// Loads the stylesheet that sits next to this module, once per document.
export function ensureStyles(doc=document,href=new URL('./receipt.css',import.meta.url).href){
  if(doc.querySelector('link[data-merge-o-matic]'))return;
  const link=doc.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.mergeOMatic='';doc.head.append(link);
}

// A dialog and toast for hosts without their own.
export function kitChrome(doc=document,icon=kitIcon){
  let dialog=null,renderer=null,toastTimer=0;const closers=[];
  function el(){
    if(dialog)return dialog;
    dialog=doc.createElement('dialog');dialog.className='receipt-dialog';doc.body.append(dialog);
    dialog.addEventListener('close',()=>{renderer=null;for(const fn of closers){try{fn();}catch{}}});
    dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('[data-rc-dialog-close]'))dialog.close();});
    return dialog;
  }
  return {
    open(html,{label='',render=null}={}){
      const d=el();renderer=render;
      if(label)d.setAttribute('aria-labelledby',label);else d.removeAttribute('aria-labelledby');
      d.innerHTML=`<button type="button" class="receipt-dialog-x" data-rc-dialog-close aria-label="Close">${icon('x')}</button><div class="receipt-dialog-body">${html}</div>`;
      if(!d.open)d.showModal();
    },
    refresh(){if(!dialog?.open||!renderer)return;const body=dialog.querySelector('.receipt-dialog-body');if(body)body.innerHTML=renderer();},
    close(){if(dialog?.open)dialog.close();},
    isOpen:()=>Boolean(dialog?.open),
    onClose(fn){closers.push(fn);},
    query:sel=>dialog?.querySelector(sel)||null,
    toast(message,tone='default'){
      let t=doc.querySelector('.receipt-toast');
      if(!t){t=doc.createElement('div');t.className='receipt-toast';doc.body.append(t);}
      clearTimeout(toastTimer);t.classList.toggle('is-error',tone==='error');t.setAttribute('role',tone==='error'?'alert':'status');
      t.innerHTML=`${icon(tone==='error'?'alert':'check')}<span>${esc(message)}</span>`;t.classList.add('is-visible');
      toastTimer=setTimeout(()=>t.classList.remove('is-visible'),tone==='error'?10000:5000);
    }
  };
}

function localStore(win){try{return win.localStorage;}catch{return null;}}

export function createReceiptUI(host={}){
  const doc=host.doc||document,win=host.win||window;
  const icon=host.icon||kitIcon,chrome=host.chrome||kitChrome(doc,icon),hostChrome=Boolean(host.chrome);
  const storage=host.storage===undefined?localStore(win):host.storage;
  const reducedMotion=host.reducedMotion||(()=>Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const range=()=>validRange(host.getRange?.())?host.getRange():DEFAULT_RANGE;
  const scope=()=>host.scope?host.scope():'default';
  const active=()=>host.active?host.active():true;
  const render=()=>host.requestRender?.();
  const toast=(m,tone)=>chrome.toast?.(m,tone);
  const receipts=new Map(),jobs=new Map();
  // isl: {key,gathered,at,cancel} for the toolbar's dynamic island; at is when it last gathered or bubbled out.
  let sound=null,want=null,timer=0,isl=null,yearsOpen=false;
  const stopTimer=()=>{clearTimeout(timer);timer=0;};
  const keyFor=(r=range(),sc=scope())=>{if(sc==null)return null;const w=receiptWindow(r);return `${sc}|${w.since}|${w.until||''}`;};
  function count(r=DEFAULT_RANGE,sc=scope()){const hit=receipts.get(keyFor(r,sc));return hit?.data?hit.data.items.length:null;}
  // The badge on Week. host.todayCount keeps its name for hosts written before the ranges changed.
  const todayCount=()=>host.todayCount?host.todayCount():count(DEFAULT_RANGE);
  // Quarter, Year and All can span thousands of merges, so they wait longer for GitHub and stay fresh longer.
  const long=r=>r==='all'||['quarter','year'].includes(rangeKind(r));

  // Sound only follows a click: the cue expires, and background renders never set it.
  function getSound(){
    if(!sound)sound=lib.createReceiptSound({makeContext:()=>{const A=win.AudioContext||win.webkitAudioContext;return A?new A():null;},storage,hidden:()=>doc.hidden,onChange:soundChanged});
    return sound;
  }
  function soundChanged(){
    const b=doc.querySelector('.rm-mute'),s=sound;if(!b||!s)return;
    const st=s.status;b.dataset.state=st;b.setAttribute('aria-pressed',String(st!=='off'));b.title=SOUND_TITLES[st];b.innerHTML=icon(st==='off'?'volumeOff':'volume');
  }
  win.__receiptAudio=()=>sound?.debug()||{status:'not created',lib:'loaded'};
  // Any press while the machine is on screen wakes audio, so a suspended or interrupted context is ready.
  for(const type of ['pointerdown','keydown'])doc.addEventListener(type,()=>{if(active()&&!sound?.muted)getSound()?.unlock();},{capture:true,passive:true});

  // Record has two modes. Whole page: the visitor shares this tab (the browser asks) with its sound, until Stop. Just the machine: the page draws the machine and its
  // paper onto a canvas (receipt-video.js) from the same print job, with the machine's own audio and no share prompt.
  let recorder=null,recStage=null,recTick=0,clip=null,recAsk=null,preview=null,recMix=null,recShare=null,recReady=false;
  const canSharePage=()=>typeof win.navigator?.mediaDevices?.getDisplayMedia==='function';
  const endShare=()=>{const s=recShare;recShare=null;for(const t of s?.getTracks?.()||[])try{t.stop();}catch{}};
  const unmix=()=>{const off=recMix;recMix=null;try{off?.();}catch{}};
  const recEnv={MediaRecorder:win.MediaRecorder,MediaStream:win.MediaStream};
  const PHASES=new Set(['idle','loading','warming','printing','ready','empty','error']);
  function snapshot(){
    const rm=doc.querySelector('.rm'),job=jobs.get(keyFor())||null,now=Date.now();
    const phase=[...(rm?.classList||[])].map(c=>c.slice(3)).find(c=>PHASES.has(c))||'idle';
    const ph=job?lib.jobPhase(job,now):null,bar=rm?.querySelector('.rm-lcd-bar'),key=rm?.querySelector('.rm-printkey');
    const progress=!bar||!ph?null:ph.phase==='warming'?ph.elapsed/(job.warm||1):ph.phase==='printing'?ph.paper/(job.total||1):null;
    return {phase,lcd:rm?.querySelector('.rm-lcd-main')?.textContent||'',sub:bar?null:rm?.querySelector('.rm-lcd-sub')?.textContent||'',progress,
      key:{disabled:Boolean(key?.disabled),pressed:Boolean(key?.classList.contains('is-pressed'))},sound:rm?.querySelector('.rm-mute')?.dataset.state||'off',
      warm:ph?.phase==='warming'?ph.elapsed:0,warmTotal:job?.warm||0,job:job?.rows?job:null,rows:job?.rows||null,now};
  }
  function getRecorder(){
    if(!recorder)recorder=rec.createRecorder({env:recEnv,onChange:recChanged,onDone:recDone,onError:(kind,message)=>{
      if(!message)return;
      if(recAsk&&chrome.isOpen()){recAsk.error=message;recAsk.waiting=false;chrome.refresh();}else toast(message,'error');
    }});
    return recorder;
  }
  chrome.onClose?.(()=>{recAsk=null;});
  // The Record dialog: what to record and the sound choice, then one press starts.
  function switchRow(name,checked,title,detail,disabled=false){
    return `<label class="switch-row ${disabled?'is-disabled':''}"><input type="checkbox" name="${name}" role="switch" ${checked?'checked':''} ${disabled?'disabled':''}><span class="switch" aria-hidden="true"></span><span><strong>${title}</strong><small>${detail}</small></span></label>`;
  }
  function modeRow(value,checked,title,detail,disabled){
    return `<label class="rcd-mode ${disabled?'is-disabled':''}"><input type="radio" name="recMode" value="${value}" ${checked?'checked':''} ${disabled?'disabled':''}><span><strong>${title}</strong><small>${detail}</small></span></label>`;
  }
  function recModes(){
    const page=canSharePage(),machine=recReady&&!isBusy();
    return {page,machine,pick:recAsk?.mode==='machine'&&machine?'machine':page?'page':machine?'machine':null};
  }
  function recDialog(){
    const a=recAsk||{},s=sound,m=recModes();
    const machineWhy=isBusy()?'Wait for this print to finish.':!recReady?'Load a receipt first.':'';
    return `<div class="dialog-form rcd-form"><header class="dialog-head rcd-head"><span class="dialog-icon rcd-icon">${icon('record')}</span><div><h2 id="dialog-title">Record a video</h2><p>Saved to this device. Nothing is uploaded.</p></div></header>
  <section class="dialog-section rcd-section"><fieldset class="rcd-modes" ${a.waiting?'disabled':''}><legend>What to record</legend>
  ${modeRow('page',m.pick==='page','Whole page','Everything you do here: the username, the repo, the periods and the print. Your browser asks to share this tab; choose it and keep tab audio on. Stop when you are done (up to 5 minutes).',!m.page)}
  ${modeRow('machine',m.pick==='machine','Just the machine',`Films the machine printing this receipt. PRINT is pressed 2 seconds in, and the video ends 2 seconds after the cut. No browser prompt.${machineWhy?' '+machineWhy:''}`,!m.machine)}
  </fieldset>
  ${switchRow('recSound',!s?.muted,'Machine sound','Off: the video is silent. This also mutes the machine.',a.waiting)}</section>
  <p class="error-text rcd-error" role="alert">${esc(a.error||(m.pick?'':'This browser cannot record the page. Load a receipt to record just the machine.'))}</p>
  <footer class="dialog-actions rcd-actions"><button type="button" class="button ghost rcd-btn" data-rc="close">Cancel</button><button type="button" class="button primary rcd-btn is-primary" data-rc="recGo" ${a.waiting||!m.pick?'disabled':''}>${icon('record')}${a.waiting?'Starting…':'Start recording'}</button></footer></div>`;
  }
  function isBusy(){
    const key=keyFor(),job=jobs.get(key),ph=job?lib.jobPhase(job,Date.now()).phase:'';
    return ph==='warming'||ph==='printing'||(key!=null&&want?.key===key);
  }
  function pressKey(){
    const key=doc.querySelector('.rm-printkey');
    if(!key||key.disabled)return;
    key.classList.add('is-pressed');setTimeout(()=>doc.querySelector('.rm-printkey')?.classList.remove('is-pressed'),160);
    actions.printKey();
  }
  // Whole page: the dialog closes first so it is not filmed. Cancelling the browser's share prompt does nothing.
  function recordPage(r){
    recAsk=null;if(chrome.isOpen())chrome.close();
    let ask;
    try{ask=win.navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser',frameRate:{ideal:30}},audio:{suppressLocalAudioPlayback:false},
      preferCurrentTab:true,selfBrowserSurface:'include',surfaceSwitching:'exclude',systemAudio:'exclude',monitorTypeSurfaces:'exclude'});}
    catch(e){ask=Promise.reject(e);}
    Promise.resolve(ask).then(stream=>{
      const video=stream?.getVideoTracks?.()[0];
      if(!video||r.state!=='idle'){for(const t of stream?.getTracks?.()||[])t.stop();return;}
      recShare=stream;
      const st=video.getSettings?.()||{};
      if(!r.start({video,size:{width:st.width||1280,height:st.height||720,fps:st.frameRate||30},title:lib.printTitle(host.title?.(),range()),audio:stream,follow:false,capMs:rec.REC_PAGE_CAP_MS}))endShare();
    },e=>{if(e?.name!=='NotAllowedError'&&e?.name!=='AbortError')toast(`Could not share this tab: ${e?.message||e}`,'error');});
  }
  function recChanged(){
    clearInterval(recTick);recTick=0;
    const r=recorder;
    if(r?.active)recTick=setInterval(()=>{const el=doc.querySelector('.rc-rec-time');if(el)el.textContent=rec.recordingClock(r.elapsed());},500);
    if(r?.state==='idle'){recStage?.stop();recStage=null;endShare();unmix();sound?.releaseCapture?.();}
    if(active())render();
  }
  function recDone({blob,name,mime,reason,duration}){
    if(!blob?.size){toast('The recording came out empty.','error');return;}
    clip=new File([blob],name,{type:mime});
    previewOpen(duration,reason);
  }
  const btn='button ghost small receipt-btn';
  function recButtons(){
    const r=recorder,st=r?.state||'idle';
    if(st!=='idle'){
      const label=st==='saving'?'SAVING':rec.recordingClock(r.elapsed());
      return `<button type="button" class="${btn} rc-rec is-on" data-rc="recStop" ${st==='saving'?'disabled':''} aria-label="Stop recording" title="${st==='armed'&&r.follows?'Recording. Press PRINT on the machine.':'Stop and save the recording'}"><i class="rc-rec-dot" aria-hidden="true"></i>REC <span class="rc-rec-time">${label}</span><span class="rc-rec-stop">Stop</span></button>`;
    }
    return `<button type="button" class="${btn} rc-rec" data-rc="record" aria-label="Record a video" title="Record a video of the whole page or just the machine">${icon('record')}<span class="rc-lbl">Record</span></button>`;
  }
  const canShare=file=>Boolean(file&&win.navigator?.canShare?.({files:[file]}));
  async function png(){
    const entry=receipts.get(keyFor());if(!entry?.data)return null;
    const rows=lib.receiptRows(model(entry,range())),name=lib.printTitle(host.title?.(),range());
    const canvas=doc.createElement('canvas');lib.drawReceipt(canvas,rows,{scale:2});
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));if(!blob){toast('Could not draw the receipt.');return null;}
    return new File([blob],name+'.png',{type:'image/png'});
  }
  function saveFile(blob,name){
    const a=doc.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  // After a recording: preview it, then Save downloads it or Cancel drops it. Any other way of closing drops it too.
  function previewOpen(duration,reason){
    previewClose();
    const url=URL.createObjectURL(clip);preview={url};
    const note=reason==='cap'?(recorder?.follows===false?' Page recordings stop after 5 minutes.':' Recordings stop after 90 seconds.'):reason==='ended'&&recorder?.follows===false?' Recording stopped when the tab stopped being shared.':reason==='left'?' Recording stopped when you left the receipt.':'';
    chrome.open(`<div class="dialog-form rcd-form rc-clip-dialog"><header class="dialog-head rcd-head"><span class="dialog-icon rcd-icon">${icon('record')}</span><div><h2 id="dialog-title">Your recording</h2><p>Save downloads the video. Cancel throws it away.${note}</p></div></header>
  <section class="rc-clip-preview"><video src="${url}" controls autoplay playsinline aria-label="Recording preview"></video><p class="rc-clip-meta">${esc(rec.clipSummary({name:clip.name,size:clip.size,duration}))}</p></section>
  <footer class="dialog-actions rcd-actions"><button type="button" class="button ghost rcd-btn" data-rc="close">Cancel</button><button type="button" class="button primary rcd-btn is-primary" data-rc="clipSave">${icon('download')}Save</button></footer></div>`,{label:'dialog-title'});
  }
  function previewClose(){
    if(!preview)return;
    const {url}=preview;preview=null;clip=null;
    const v=chrome.query('.rc-clip-preview video');if(v){v.pause();v.removeAttribute('src');v.load();}
    URL.revokeObjectURL(url);
  }
  chrome.onClose?.(previewClose);
  function reset(){stopTimer();sound?.stop();want=null;isl=null;const k=keyFor();if(k)jobs.delete(k);}

  async function load(r=range(),force=false){
    const sc=scope();if(sc==null)return;
    const key=keyFor(r,sc),w=receiptWindow(r),hit=receipts.get(key);
    if(hit?.loading||(!force&&hit&&Date.now()-hit.at<(long(r)?600000:120000)))return;
    const before=todayCount();
    receipts.set(key,{...hit,at:hit?.at||0,loading:true});
    const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),long(r)?90000:20000);
    try{
      const json=await host.fetchMerged({range:r,since:w.since,until:w.until,scope:sc,signal:ctrl.signal});
      if(!json||!Array.isArray(json.items))throw new Error(json?.error||'GitHub could not be reached.');
      receipts.set(key,{at:Date.now(),data:json,error:json.stale?json.error:''});
    }catch(e){receipts.set(key,{at:Date.now(),data:hit?.data,error:e.name==='AbortError'?'GitHub took too long to answer. Press PRINT again in a moment.':e.message,restart:Boolean(e.restart),input:Boolean(e.input)});}
    finally{clearTimeout(t);}
    if(scope()===sc&&(active()||todayCount()!==before))render();
  }
  function model(entry,r){
    const w=receiptWindow(r),data=entry?.data,now=new Date(),pad=n=>String(n).padStart(2,'0');
    const clock=d=>d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}).toUpperCase(),day=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'}).toUpperCase();
    const kind=rangeKind(r);
    const stamp=d=>kind==='week'?d.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase():d.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'2-digit'});
    const label=host.repoLabel||(repo=>String(repo||'').split('/').pop());
    const raw=(data?.items||[]).map(i=>({...i,repoLabel:label(i.repo),time:stamp(new Date(i.mergedAt))+' '+clock(new Date(i.mergedAt))}));
    const first=raw.reduce((m,i)=>Math.min(m,Date.parse(i.mergedAt)||Infinity),Infinity);
    const grouped=Boolean(host.grouped?.())&&new Set(raw.map(i=>i.repo)).size>1;
    const items=grouped?raw.sort((a,b)=>a.repoLabel.localeCompare(b.repoLabel)||Date.parse(a.mergedAt)-Date.parse(b.mergedAt)):raw;
    const store=host.store?host.store(data,lib):lib.storeIdentity(null,data?.repos?.length||0);
    const login=(host.contributor?host.contributor(data):data?.login)||'';
    return {store,contributor:login.toUpperCase(),
      date:now.toLocaleDateString('en-US',{month:'2-digit',day:'2-digit',year:'numeric'}),time:`${pad(now.getHours())}:${pad(now.getMinutes())}`,
      shift:kind==='all'?(Number.isFinite(first)?`ALL TIME (SINCE ${new Date(first).toLocaleDateString('en-US',{month:'short',year:'numeric'}).toUpperCase()})`:'ALL TIME'):kind==='year'?(w.until?`YEAR ${w.year}`:`${w.year} TO DATE`):`${day(w.start)} TO ${day(now)}`,
      grouped,items,empty:EMPTY[kind],
      returned:(data?.returned||[]).map(i=>({...i,repoLabel:label(i.repo),time:stamp(new Date(i.closedAt))+' '+clock(new Date(i.closedAt))})),
      reviewed:(data?.reviewed||[]).map(i=>({...i,repoLabel:label(i.repo),time:stamp(new Date(i.reviewedAt))+' '+clock(new Date(i.reviewedAt))})),
      notes:[data?.demo&&'DEMO DATA. NOT FROM GITHUB.',data&&entry?.error&&'PRINTED FROM SAVED DATA.',data?.backoff&&'GITHUB QUOTA IS LOW. REPRINTS SLOW DOWN.',data?.truncated&&'SHOWING THE NEWEST 1000 ITEMS PER STORE.',data?.incomplete&&(data.failures?.length?'SOME ITEMS ARE MISSING. GITHUB DID NOT ANSWER EVERY PAGE.':'SOME ITEMS ARE MISSING. GITHUB QUOTA RAN LOW.'),
        data?.detailed&&(data.items||[]).length>data.detailed&&`CHECKS AND FILE SHARES COVER THE NEWEST ${data.detailed} PER STORE.`].filter(Boolean),
      void:!data&&entry?.error?{title:'** VOID **',lines:entry.restart?['THIS REGISTER NEEDS A RESTART.','Restart the local server, then press PRINT.']:entry.input?['THIS REGISTER CANNOT PRINT THAT RANGE.',entry.error]:['COULD NOT REACH GITHUB.',entry.error]}:null};
  }
  function rowHtml(r,i,job){
    const at=lib.rowTiming(job,i);
    if(r.kind==='barcode'){
      const b=lib.barcode(r.seed),pct=v=>(v/b.width*100).toFixed(3)+'%';
      const stops=b.bars.map(([x,w])=>`transparent ${pct(x)},var(--rc-ink) ${pct(x)} ${pct(x+w)},transparent ${pct(x+w)}`).join(',');
      return `<div class="rc-r rc-s4 rc-c" style="${at}"><span class="rc-t"><i class="rc-code" role="img" aria-label="Barcode ${esc(r.seed)}" style="background-image:linear-gradient(90deg,${stops})"></i></span></div>`;
    }
    const cls=c=>c.split(' ').filter(Boolean).map(x=>'rc-'+x).join(' ');
    const inner=r.segs.map(s=>s.href?`<a class="${cls(s.cls)}" href="${esc(s.href)}" target="_blank" rel="noopener noreferrer"${r.title?` title="${esc(r.title)}"`:''}>${esc(s.t)}</a>`:s.cls==='check'?CHECK_SVG:s.cls?`<span class="${cls(s.cls)}">${esc(s.t)}</span>`:esc(s.t)).join('');
    const text=r.sr?`<span aria-hidden="true">${inner}</span><span class="rc-sr">${esc(r.sr)}</span>`:inner;
    return `<div class="rc-r rc-s${r.size} ${r.align==='c'?'rc-c':''} ${cls(r.cls)}" style="${at}"><span class="rc-t">${text}</span></div>`;
  }
  // Years with merges first known from the All receipt; before it loads, the last ten years.
  function yearList(){
    const now=new Date(),cur=now.getFullYear(),all=receipts.get(keyFor('all'))?.data?.items||[];
    const first=all.reduce((m,i)=>Math.min(m,new Date(i.mergedAt).getFullYear()||cur),cur);
    const from=Math.max(FIRST_YEAR,all.length?first:cur-9);
    return Array.from({length:cur-from+1},(_,i)=>cur-i);
  }
  function segmented(options,value){
    const year=rangeYear(value);
    const yearBtn=`<button type="button" class="rc-year-btn" id="rc-year-btn" data-rc="years" aria-pressed="${year!=null}" aria-haspopup="listbox" aria-expanded="${yearsOpen}" aria-controls="rc-years">Year${year!=null?` ${year}`:''}<svg class="rc-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
    const menu=yearsOpen?`<div class="rc-years" id="rc-years" role="listbox" aria-label="Year">${yearList().map(y=>`<button type="button" role="option" id="rc-year-${y}" data-rc="pickYear" data-value="${y}" aria-selected="${y===year}">${y}</button>`).join('')}</div>`:'';
    return `<div class="rc-seg-wrap"><div class="segmented receipt-seg" role="group" aria-label="Receipt range">${options.map(([key,label,n])=>key==='year'?yearBtn:`<button type="button" data-rc="range" data-value="${esc(key)}" aria-pressed="${String(key)===String(value)}">${label}${n!=null&&n!==''?`<span class="count">${n}</span>`:''}</button>`).join('')}</div>${menu}</div>`;
  }

  function html(){
    const r=range(),blocked=host.blocked?.()||null,key=blocked?null:keyFor(),entry=key?receipts.get(key):null,data=entry?.data;
    const m=model(entry,r);
    const rows=key&&(data||entry?.error&&!entry.loading)?lib.receiptRows(m):null;
    const now=Date.now(),s=getSound(),items=m.items,sum=k=>items.reduce((n,i)=>n+(i[k]||0),0),n=items.length;
    // Printing only starts from the machine's PRINT key; a press made while GitHub is still answering waits here.
    let job=key?jobs.get(key):null;
    if(rows&&!job&&want?.key===key){
      job=lib.printJob({rows,now,reduced:reducedMotion(),start:Math.max(want.at,now-lib.WARM_MS)});job.rows=rows;jobs.set(key,job);want=null;
      const ph0=lib.jobPhase(job,now);
      if(ph0.phase==='warming'||ph0.phase==='printing')s?.print({times:job.times,durs:job.durs,kinds:job.kinds,warm:job.warm,offset:ph0.elapsed,outcome:m.void||!n?'error':'sale',tearAfter:job.tearAfter+lib.PACE.tail});
    }
    const ph=rows&&job?lib.jobPhase(job,now):null,warming=ph?.phase==='warming',printing=ph?.phase==='printing',torn=ph?.phase==='torn',fed=Boolean(ph&&!warming);
    const waiting=key!=null&&want?.key===key,busy=warming||printing||waiting;
    const out=rows&&!m.void?outputState(ph,reducedMotion()?0:TEAR_ANIM_MS):outputState(null);
    stopTimer();
    const wake=ph?.next??out.wait;
    if(wake!=null)timer=setTimeout(()=>{timer=0;if(active())render();},wake+30);
    if(recorder?.active){if(warming||printing)recorder.printed();else if(torn)recorder.torn(TEAR_ANIM_MS-(ph.tornFor||0));}
    if(torn&&!m.void&&!job.reported){job.reported=true;try{host.printed?.({range:range(),items:n});}catch{}}
    const recOn=Boolean(recorder&&recorder.state!=='idle');recReady=Boolean(rows);
    const totals=`${plural(n,'ITEM','ITEMS')}  +${sum('additions').toLocaleString('en-US')} −${sum('deletions').toLocaleString('en-US')}`;
    const [phase,lcd,sub]=blocked?['idle','READY',blocked]
      :!rows?[waiting?'warming':'loading',waiting?'WARMING UP':'STAND BY','ASKING GITHUB…']
      :!job?['idle','READY',m.void?'PRESS PRINT':`PRESS PRINT  ${n?totals:'NO SALE'}`]
      :warming?['warming','WARMING UP','']
      :printing?['printing',m.void?'PRINTING':`PRINTING ${plural(n,'ITEM','ITEMS')}`,'']
      :m.void?['error',entry?.restart?'RESTART NEEDED':'NO SIGNAL',entry?.restart?'CHECK THE SERVER':'TRY AGAIN SOON']
      :!n?['empty','PAPER OUT','NO SALE']
      :['ready',torn?'THANK YOU':'READY',totals];
    const lcdSub=warming?`<i class="rm-lcd-bar" style="--rc-total:${job.warm}ms;--rc-el:${ph.elapsed}ms"><b></b></i>`
      :printing?`<i class="rm-lcd-bar" style="--rc-total:${job.total}ms;--rc-el:${ph.paper}ms"><b></b></i>`
      :ph?.phase==='ready'?`TEAR IN ${ph.countdown}`:esc(sub);
    const soundState=s?.status||'off';
    const machine=`<div class="rm-machine">
   <div class="rm-top"><span class="rm-plate">MERGE-O-MATIC <b>40</b>${recOn?'<i class="rm-rec" aria-label="Recording"><b></b>REC</i>':''}</span><span class="rm-led-wrap"><button type="button" class="rm-printkey" data-rc="printKey" aria-label="Print receipt" title="${blocked?esc(host.blockedTitle?.()||'Choose what to print first'):busy?'Printing':'Print receipt'}" ${busy||blocked?'disabled':''}>${icon('printer')}<span>PRINT</span></button>${s?`<button type="button" class="rm-mute" data-rc="mute" data-state="${soundState}" aria-pressed="${soundState!=='off'}" aria-label="Machine sound" title="${SOUND_TITLES[soundState]}">${icon(soundState==='off'?'volumeOff':'volume')}</button>`:''}<small>PWR</small><i class="rm-led" aria-hidden="true"></i></span></div>
   <div class="rm-face">
    <div class="rm-lcd" role="status" aria-live="polite"><span class="rm-lcd-main">${esc(lcd)}</span><span class="rm-lcd-sub">${lcdSub}</span></div>
    <div class="rm-keys" aria-hidden="true" style="--rc-el:${warming?ph.elapsed:0}ms;--rc-warm:${job?.warm||0}ms">${['k1','k2','k3','k4','k6','k7','k8','k5'].map((k,i)=>`<i class="${k}" style="--d:${lib.KEY_CHASE_MS[i]??0}ms"></i>`).join('')}</div>
   </div>
   <div class="rm-mouth" aria-hidden="true"><span class="rm-slot"><i class="rm-head"></i></span></div>
  </div>
  <button type="button" class="rm-tearbar" data-rc="tear" aria-label="Tear off the receipt now" title="${torn?'Torn off':'Tears off by itself. Select to tear now.'}" ${ph?.phase==='ready'?'':'disabled'}><span class="rm-teeth"></span></button>`;
    const paper=fed?`<div class="rm-feed"><span class="rm-stub" aria-hidden="true"></span><div class="rm-paper ${torn?'is-torn':''} ${job.reduced?'is-calm':''}" style="--rc-el:${ph.paper}ms;--rc-tel:${ph.tornFor||0}ms;--rc-calm:${Math.max(0,ph.elapsed-job.warm-job.total)}ms;--rc-total:${job.total}ms;--rc-tilt:${Math.min(1,60/rows.length).toFixed(3)}"><article class="receipt" aria-label="Receipt of merged pull requests">${rows.map((row,i)=>rowHtml(row,i,job)).join('')}</article></div></div>`:'<div class="rm-feed"></div>';
    const allHit=key?receipts.get(keyFor('all'))?.data:null,allCount=allHit?allHit.items.length.toLocaleString('en-US')+(allHit.truncated?'+':''):'';
    const today=blocked?null:todayCount();
    const outCls=out.shown?'rc-out is-shown':'rc-out is-hidden',outAttrs=out.shown?'':'disabled inert aria-hidden="true"';
    // Dynamic island: PRINT gathers the toolbar into a pill; a finished, failed or cancelled print bubbles it back out.
    const done=Boolean(rows&&job)&&(m.void?!(warming||printing):out.shown);
    if(isl?.gathered&&(isl.key!==key||done||isl.cancel)){isl.gathered=false;isl.at=now;}
    const island=isl?.key===key?isl:null,gathered=Boolean(island?.gathered),islFor=island?now-island.at:0;
    host.island?.({gathered,since:islFor,recording:recOn});
    // The pill has no visible words. Its status is for screen readers, hidden inline so it never shows even without the stylesheet.
    const srStatus=`<span style="${SR_ONLY}">${recOn?'Recording the receipt':'Printing the receipt'}</span>`;
    const pill=host.islandPill===false?(gathered?`<div class="rc-island-status" role="status">${srStatus}</div>`:'')
      :island&&(gathered||islFor<1000)?`<div class="rc-pill" ${gathered?'role="status"':'aria-hidden="true"'}>${gathered&&recOn?'<button type="button" class="rc-pill-stop" data-rc="recStop" aria-label="Stop recording" title="Stop recording"><i aria-hidden="true"></i></button>':''}<i class="rc-pill-dot ${recOn?'is-rec':''}" aria-hidden="true"></i>${gathered?srStatus:''}</div>`:'';
    return `<section class="receipt-stage" data-chrome="${hostChrome?'host':'kit'}">
  <div class="rc-island ${island?gathered?'is-gathered':'is-bubbled':''}" style="--rc-isl:${islFor}ms">
  <div class="receipt-controls" ${gathered?'inert aria-hidden="true"':''}>
   ${segmented(Object.entries(RANGES).map(([k,label])=>[k,label,k===DEFAULT_RANGE?today||'':k==='all'?allCount:'']),r)}
   <span class="toolbar-spacer receipt-spacer"></span>
   ${recButtons()}
   <button type="button" class="${btn} ${outCls}" data-rc="share" style="--rc-i:0;--rc-shown:${out.since}ms" ${outAttrs} aria-label="Share the receipt image" title="Share the receipt as an image">${icon('share')}<span class="rc-lbl">Share</span></button>
   <button type="button" class="${btn} ${outCls}" data-rc="download" style="--rc-i:1;--rc-shown:${out.since}ms" ${outAttrs} aria-label="Download the receipt image" title="Download the receipt as a PNG">${icon('download')}<span class="rc-lbl">Download</span></button>
  </div>${pill}</div>
  <div class="rm-frame"><div class="rm rm-${phase} ${printing?'is-printing':''} ${torn?'is-torn':''}"><div class="rm-dock">${machine}</div>${paper}</div></div>
 </section>`;
  }

  const actions={
    range:t=>pick(t.dataset.value),
    // Year picks this year at once and opens the menu for earlier ones; a second press closes it.
    years:()=>{if(rangeYear(range())==null){pick('year',true);return;}yearsOpen=!yearsOpen;render();if(yearsOpen)focusYear();},
    pickYear:t=>{const y=Number(t.dataset.value);pick(y===new Date().getFullYear()?'year':`year:${y}`);doc.querySelector('.rc-year-btn')?.focus();},
    printKey:()=>{
      if(host.blocked?.())return;
      reset();
      const s=getSound();s?.unlock();s?.click();
      want={key:keyFor(),at:Date.now()};isl={key:want.key,gathered:true,at:want.at,cancel:false};
      load(range());render();
    },
    share:async()=>{
      const file=await png();if(!file)return;
      try{
        if(canShare(file)){await win.navigator.share({files:[file],title:file.name.replace(/\.png$/,''),text:'My merged PRs, printed by the MERGE-O-MATIC 40.'});return;}
      }catch(e){if(e?.name==='AbortError')return;}
      saveFile(file,file.name);toast(`Saved ${file.name}.`);
    },
    download:async()=>{const file=await png();if(!file)return;saveFile(file,file.name);toast(`Saved ${file.name}.`);},
    clipSave:()=>{if(!clip)return;const {name}=clip;saveFile(clip,name);chrome.close();toast(`Saved ${name}.`);},
    record:()=>{
      if(!getRecorder()){toast('Recording is not available in this browser.','error');return;}
      getSound();recAsk={error:'',waiting:false,mode:'page'};
      chrome.open(recDialog(),{label:'dialog-title',render:recDialog});
    },
    // The click on Start unlocks the machine's audio, so the sound is set up before anything waits. The tab share
    // must be requested before the first await, while the click still counts as a user gesture.
    recGo:async()=>{
      const r=getRecorder();
      if(!r||r.state!=='idle'||recAsk?.waiting)return;
      const picked=chrome.query('input[name="recMode"]:checked')?.value,modes=recModes();
      const mode=picked==='machine'&&modes.machine?'machine':picked==='page'&&modes.page?'page':modes.pick;
      if(!mode)return;
      const s=getSound(),wantSound=chrome.query('input[name="recSound"]')?.checked!==false;
      if(s&&s.muted===wantSound)s.setMuted(!wantSound);
      s?.unlock();
      if(mode==='page'){recordPage(r);return;}
      recAsk={error:'',waiting:true,mode};chrome.refresh();
      let video=null,title=null;
      try{title=host.videoTitle?.()||null;}catch{title=null;}
      const fonts=(title?.fonts||[]).map(f=>Promise.resolve(doc.fonts?.load?.(f)).catch(()=>null));
      try{[video]=await Promise.all([import('./receipt-video.js'),doc.fonts?.ready,...fonts]);}catch{}
      const fail=message=>{unmix();sound?.releaseCapture?.();if(recAsk&&chrome.isOpen()){recAsk={error:message,waiting:false};chrome.refresh();}else toast(message,'error');};
      if(!video?.createVideoStage){fail('Recording is not available in this browser.');return;}
      const background=rec.opaqueColor(host.background?host.background():win.getComputedStyle(doc.documentElement).getPropertyValue('--bg'));
      const stage=video.createVideoStage({doc,snapshot,background,...(title?{title}:{})});
      if(!stage.track){stage.stop();fail('This browser cannot record video. Use a current Chrome, Edge, Firefox or Safari.');return;}
      recStage=stage;
      const audio=s?.captureStream?.()||null;
      if(audio&&host.recordAudio&&s.captureNode?.()){
        try{const off=host.recordAudio({context:s.context,destination:s.captureNode()});recMix=typeof off==='function'?off:null;}catch{recMix=null;}
        if(recMix)Promise.resolve(s.context?.resume?.()).catch(()=>{});
      }
      const ok=r.start({video:stage.track,size:stage,title:lib.printTitle(host.title?.(),range()),audio,onPress:pressKey});
      if(!ok){unmix();stage.stop();recStage=null;if(recAsk){recAsk.waiting=false;chrome.refresh();}return;}
      recAsk=null;if(chrome.isOpen())chrome.close();
    },
    recStop:()=>{if(isl?.gathered)isl.cancel=true;recorder?.stop('stop');},
    tear:()=>{const job=jobs.get(keyFor());if(!job||lib.jobPhase(job,Date.now()).phase!=='ready')return;job.tearAt=Date.now();const s=getSound();s?.stop();s?.unlock();s?.tear();render();},
    mute:()=>{const s=getSound();if(!s)return;if(s.status==='locked')s.unlock();else s.setMuted(!s.muted);soundChanged();},
    close:()=>chrome.close()
  };
  function pick(r,open=false){
    if(!validRange(r))return;
    yearsOpen=open;reset();host.setRange?.(r);reset();render();if(open)focusYear();
    if(!host.blocked?.())load(r);
  }
  function focusYear(){const m=doc.querySelector('.rc-years');(m?.querySelector('[aria-selected="true"]')||m?.querySelector('button'))?.focus();}
  doc.addEventListener('keydown',e=>{
    if(!yearsOpen||!e.target.closest?.('.rc-seg-wrap'))return;
    const items=[...doc.querySelectorAll('.rc-years button')],i=items.indexOf(doc.activeElement);
    if(e.key==='Escape'||e.key==='Tab'){if(e.key==='Escape')e.preventDefault();yearsOpen=false;render();if(e.key==='Escape')doc.querySelector('.rc-year-btn')?.focus();return;}
    const to={ArrowDown:i+1,ArrowUp:i-1,Home:0,End:items.length-1}[e.key];
    if(to!=null&&items.length){e.preventDefault();items[(to+items.length)%items.length].focus();}
  });
  doc.addEventListener('click',e=>{
    if(yearsOpen&&!e.target.closest?.('.rc-seg-wrap')){yearsOpen=false;render();}
    const t=e.target.closest?.('[data-rc]');
    if(!t||t.disabled||!actions[t.dataset.rc])return;
    if(!t.closest('.receipt-stage')&&!t.closest('.rcd-form'))return;
    actions[t.dataset.rc](t,e);
  });

  let owned=null;
  const ui={
    html,load,count,reset,model:(r=range())=>model(receipts.get(keyFor(r)),r),
    get sound(){return sound;},get recording(){return Boolean(recorder?.active);},
    // For a host-drawn island: stops the recording, even mid-print, and bubbles the toolbar back out.
    stopRecording(){if(recorder&&recorder.state!=='idle'&&recorder.state!=='saving')actions.recStop();},
    // Call after the host puts html() into the document.
    mounted(){if(recorder?.active&&recorder.follows&&!doc.querySelector('.rm-frame'))queueMicrotask(()=>recorder?.stop('left'));},
    // Coming back to the machine: every range starts at READY again.
    enter(){jobs.clear();isl=null;},
    // Leaving the machine: cancel the print and its sound.
    leave(){stopTimer();sound?.stop();want=null;isl=null;},
    // The kit renders itself into root: for hosts that give it an element of its own.
    mount(root){owned=root;host.requestRender??=()=>{if(!owned)return;owned.innerHTML=html();ui.mounted();};render();if(!host.blocked?.()){load(DEFAULT_RANGE);if(range()!==DEFAULT_RANGE)load(range());}return ui;}
  };
  if(host.styles!==false)ensureStyles(doc,host.styles||undefined);
  return ui;
}
