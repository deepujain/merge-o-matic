import test from 'node:test';
import assert from 'node:assert/strict';
import {createReceiptUI,outputState,TEAR_ANIM_MS,receiptWindow,validRange} from '../web/kit/receipt-ui.js';
import {printJob,jobPhase} from '../web/kit/receipt.js';

test('Share and Download wait for the tear-off animation to finish',()=>{
  const job=printJob({rows:6,now:0}),printed=job.warm+job.total,torn=printed+job.tearAfter;
  const at=(t,after)=>outputState(jobPhase(job,t),after);
  assert.equal(outputState(null).shown,false);
  for(const t of [0,job.warm+1,printed,torn-1])assert.equal(at(t).shown,false,`hidden at ${t} ms`);
  assert.deepEqual(at(torn),{shown:false,since:0,wait:TEAR_ANIM_MS});
  assert.deepEqual(at(torn+TEAR_ANIM_MS+250),{shown:true,since:250,wait:null});
  assert.equal(at(torn,0).shown,true,'reduced motion shows them as soon as the paper is torn');
});

// A headless host: enough document and window for html() and the click handler, no DOM.
const oneItem=async()=>({items:[{repo:'o/r',number:1,title:'One',mergedAt:new Date().toISOString(),additions:1,deletions:0}]});
function machine(fetchMerged=oneItem,extra={}){
  let click=null,range='week',out='';
  const doc={hidden:false,head:{append(){}},querySelector:()=>null,addEventListener:(type,fn)=>{if(type==='click')click=fn;}};
  const win={addEventListener(){},requestAnimationFrame:()=>1,scrollBy(){},innerHeight:800};
  const ui=createReceiptUI({doc,win,storage:null,styles:false,chrome:{},reducedMotion:()=>false,
    getRange:()=>range,setRange:r=>{range=r;},requestRender:()=>{out=ui.html();},
    fetchMerged,...extra});
  const press=(rc,value)=>click({target:{closest:sel=>sel==='[data-rc]'?{dataset:{rc,value},disabled:false,closest:s=>s==='.receipt-stage'?{}:null}:null}});
  const button=rc=>ui.html().match(new RegExp(`<button[^>]*data-rc="${rc}"[^>]*>`))?.[0]||'';
  const hidden=rc=>{const b=button(rc);return /is-hidden/.test(b)&&/ disabled/.test(b)&&/ inert/.test(b);};
  return {ui,press,button,hidden,get out(){return out;}};
}

test('the toolbar hides Share and Download until a print is torn off, then again for a new range',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,8,30,17)});
  const m=machine();
  await m.ui.load('week');
  assert.ok(m.hidden('share')&&m.hidden('download'),'hidden before PRINT');
  assert.doesNotMatch(m.button('record'),/rc-out|disabled/,'Record stays available');
  assert.doesNotMatch(m.ui.html(),/rc-pill|is-gathered/,'no pill before PRINT');
  m.press('printKey');
  assert.ok(m.hidden('share'),'hidden while warming');
  const gathered=m.ui.html();
  assert.match(gathered,/rc-island is-gathered/);assert.match(gathered,/class="receipt-controls" inert aria-hidden="true"/,'collapsed controls take no focus or clicks');
  const pill=gathered.match(/<div class="rc-pill"[\s\S]*?<\/div>/)[0];
  assert.match(pill,/role="status"/);assert.match(pill,/<span style="position:absolute;width:1px;[^"]*">Printing the receipt<\/span>/,'status is for screen readers only');
  assert.equal(pill.replace(/<span style="position:absolute[^"]*">[^<]*<\/span>/,'').replace(/<[^>]+>/g,'').trim(),'','the pill shows no words');
  const job=printJob({rows:1,now:0}),walk=ms=>{for(let x=0;x<ms;x+=100)t.mock.timers.tick(100);};
  walk(job.warm+1000);
  assert.match(m.out,/rm-printing|rm-ready/);assert.ok(m.hidden('download'),'hidden while printing');
  walk(20000);
  assert.match(m.out,/is-torn/);
  assert.match(m.out,/rc-island is-bubbled/);assert.doesNotMatch(m.out,/class="receipt-controls" inert/,'bubbled back out after the tear-off');
  assert.doesNotMatch(m.out,/Printing the receipt|role="status">/,'no pill status once expanded');
  const share=m.button('share');
  assert.match(share,/is-shown/);assert.doesNotMatch(share,/ disabled| inert|aria-hidden/);
  assert.match(m.button('download'),/--rc-i:1/,'Download follows Share');
  m.press('range','month');
  assert.ok(m.hidden('share')&&m.hidden('download'),'hidden again for a new range');
  assert.doesNotMatch(m.ui.html(),/rc-pill|is-gathered|is-bubbled/,'a new range starts with plain controls');
});

test('a host-drawn island replaces the pill with a hidden status and hears every gather and bubble',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,8,30,17)});
  const calls=[];
  const m=machine(oneItem,{islandPill:false,island:s=>calls.push(s)});
  await m.ui.load('week');
  assert.ok(calls.length&&calls.every(c=>!c.gathered&&!c.recording),'nothing gathered before PRINT');
  m.press('printKey');
  const gathered=m.ui.html();
  assert.doesNotMatch(gathered,/rc-pill/,'no black pill');
  assert.match(gathered,/rc-island is-gathered/);assert.match(gathered,/class="receipt-controls" inert aria-hidden="true"/);
  const status=gathered.match(/<div class="rc-island-status" role="status">[\s\S]*?<\/div>/)?.[0]||'';
  assert.match(status,/<span style="position:absolute;width:1px;[^"]*">Printing the receipt<\/span>/,'screen readers still hear the print');
  assert.equal(calls.at(-1).gathered,true);assert.equal(calls.at(-1).recording,false);
  assert.equal(typeof m.ui.stopRecording,'function');m.ui.stopRecording();
  for(let x=0;x<25000;x+=100)t.mock.timers.tick(100);
  assert.match(m.out,/is-torn/);assert.match(m.out,/rc-island is-bubbled/);
  assert.doesNotMatch(m.out,/rc-island-status|Printing the receipt/,'the status leaves with the island');
  assert.equal(calls.at(-1).gathered,false,'the host bubbles its controls back out');
  assert.match(m.button('share'),/is-shown/,'Share still waits for a finished print');
});

test('Record works before anything is loaded: it offers the whole page, asks to share this tab, and closes first',async()=>{
  let opened='',closed=0;const asked=[],stream={tracks:[{kind:'video',stop(){this.stopped=true;},addEventListener(){}},{kind:'audio',stop(){this.stopped=true;}}]};
  stream.getTracks=()=>stream.tracks;stream.getVideoTracks=()=>stream.tracks.filter(t=>t.kind==='video');stream.getAudioTracks=()=>stream.tracks.filter(t=>t.kind==='audio');
  const win={addEventListener(){},requestAnimationFrame:()=>1,scrollBy(){},innerHeight:800,
    navigator:{mediaDevices:{getDisplayMedia:async o=>{asked.push(o);return stream;}}}};
  const chrome={open:h=>{opened=h;},refresh(){},close:()=>{closed++;},isOpen:()=>Boolean(opened)&&!closed,onClose(){},query:sel=>sel==='input[name="recMode"]:checked'?{value:'page'}:null,toast(){}};
  const m=machine(oneItem,{win,chrome,scope:()=>null,blocked:()=>'TYPE A USERNAME'});
  assert.doesNotMatch(m.button('record'),/ disabled/,'Record is on with nothing loaded');
  m.press('record');
  assert.match(opened,/name="recMode" value="page" checked/,'the whole page is the default');
  assert.match(opened,/name="recMode" value="machine"  disabled/,'the machine needs a receipt first');
  m.press('recGo');
  assert.equal(closed,1,'the dialog closes before the share prompt, so it is not filmed');
  assert.equal(asked[0].preferCurrentTab,true);assert.equal(asked[0].video.displaySurface,'browser');
  await new Promise(r=>setTimeout(r,0));
  assert.ok(stream.tracks.every(t=>t.stopped),'without MediaRecorder nothing records and the share ends');
});

test('quickRecord with a label skips the dialog and asks to share this tab at once',async()=>{
  let opened='';const asked=[],stream={tracks:[{kind:'video',stop(){this.stopped=true;},addEventListener(){}}]};
  stream.getTracks=()=>stream.tracks;stream.getVideoTracks=()=>stream.tracks;stream.getAudioTracks=()=>[];
  const win={addEventListener(){},requestAnimationFrame:()=>1,scrollBy(){},innerHeight:800,
    navigator:{mediaDevices:{getDisplayMedia:async o=>{asked.push(o);return stream;}}}};
  const chrome={open:h=>{opened=h;},refresh(){},close(){},isOpen:()=>false,onClose(){},query:()=>null,toast(){}};
  const m=machine(oneItem,{win,chrome,recordLabel:'Hackathon <Record>',quickRecord:true});
  const button=m.button('record');
  assert.match(m.ui.html(),/<span class="rc-lbl">Hackathon &lt;Record&gt;<\/span>/,'the label is escaped');
  assert.match(button,/aria-label="Hackathon &lt;Record&gt;"/);assert.match(button,/title="Record a video of the whole page"/);
  m.press('record');
  assert.equal(opened,'','no dialog');
  assert.equal(asked.length,1);assert.equal(asked[0].preferCurrentTab,true);
  await new Promise(r=>setTimeout(r,0));
  assert.ok(stream.tracks.every(t=>t.stopped),'without MediaRecorder nothing records and the share ends');
  const plain=machine(oneItem,{win,chrome});
  assert.match(plain.ui.html(),/<span class="rc-lbl">Record<\/span>/,'Record by default');
});

test('a failed print bubbles the controls back out once the VOID slip is printed',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.UTC(2026,8,30,17)});
  const m=machine(async()=>{throw new Error('GitHub could not be reached.');});
  await m.ui.load('week');
  m.press('printKey');
  assert.match(m.out,/is-gathered/);
  for(let x=0;x<12000;x+=100)t.mock.timers.tick(100);
  assert.match(m.out,/rm-(ready|error)|is-torn/);assert.match(m.out,/rc-island is-bubbled/);
  assert.ok(m.hidden('share'),'nothing to share from a VOID slip');
});

test('Week, Month and Quarter end today; Year is a calendar year picked from its menu',async t=>{
  const now=new Date(2026,9,3,15),day=(y,m,d)=>new Date(y,m,d).toISOString();
  assert.equal(receiptWindow('week',now).since,day(2026,8,27));
  assert.equal(receiptWindow('month',now).since,day(2026,8,4));
  assert.equal(receiptWindow('quarter',now).since,day(2026,6,6));
  assert.deepEqual([receiptWindow('year',now).since,receiptWindow('year',now).until],[day(2026,0,1),null]);
  assert.deepEqual([receiptWindow('year:2024',now).since,receiptWindow('year:2024',now).until],[day(2024,0,1),day(2025,0,1)]);
  for(const r of ['week','month','quarter','year','all','year:2008','year:2025'])assert.ok(validRange(r,now),r);
  for(const r of ['today','yesterday','year:2007','year:2027','year:25',''])assert.ok(!validRange(r,now),r);
  t.mock.timers.enable({apis:['setTimeout','Date'],now:now.getTime()});
  const asked=[];
  const m=machine(async q=>{asked.push(q);return {items:[]};});
  await m.ui.load('week');
  assert.match(m.ui.html(),/aria-pressed="true">Week/);
  m.press('years');
  let html=m.ui.html();
  assert.match(html,/data-rc="years" aria-pressed="true" aria-haspopup="listbox" aria-expanded="true"[^>]*>Year 2026/);
  assert.match(html,/role="listbox"/);assert.match(html,/data-value="2026" aria-selected="true"/);assert.match(html,/data-value="2017"/);
  assert.doesNotMatch(html,/<select/,'no native dropdown');
  m.press('pickYear','2024');
  html=m.ui.html();
  assert.doesNotMatch(html,/role="listbox"/,'picking closes the menu');
  assert.match(html,/Year 2024/);
  const last=asked.at(-1);assert.equal(last.since,day(2024,0,1));assert.equal(last.until,day(2025,0,1));
});
