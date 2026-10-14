import test from 'node:test';
import assert from 'node:assert/strict';
import {printJob,printSchedule,printOrder,jobPhase,rowTiming,chatterTimes,keyTicks,drawReceipt,printTitle,receiptRows,rowsText,storeIdentity,
  WARM_MS,TEAR_MS,PACE,KEY_CHASE_MS,KEY_CYCLE_MS,KEY_FLASH_MS,BARCODE_ITEMS} from '../web/kit/receipt.js';

// Mirrors the Receipt tab: every render reads the phase and keeps at most one timer for the next change.
function machine(){
  const seen=[];let timer=null,job=null;
  const render=()=>{
    clearTimeout(timer);timer=null;
    const ph=jobPhase(job,Date.now());
    seen.push(ph.phase==='ready'?`ready ${ph.countdown}`:ph.phase);
    if(ph.next!=null)timer=setTimeout(render,ph.next);
  };
  return {seen,render,start(rows){job=printJob({rows,now:Date.now()});render();return job;},leave(){clearTimeout(timer);timer=null;}};
}
const compact=list=>list.filter((x,i)=>x!==list[i-1]);
const walk=(t,ms)=>{for(let x=0;x<ms;x+=100)t.mock.timers.tick(100);};

test('warm up 3 s, print, count down 3 s, then tear off',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1_000_000});
  const m=machine(),job=m.start(40);
  assert.equal(WARM_MS,3000);assert.equal(TEAR_MS,3000);
  t.mock.timers.tick(2999);assert.deepEqual(compact(m.seen),['warming']);
  t.mock.timers.tick(1);assert.equal(m.seen.at(-1),'printing','the paper feeds when the warm-up ends');
  walk(t,job.total+TEAR_MS+100);
  assert.deepEqual(compact(m.seen),['warming','printing','ready 3','ready 2','ready 1','torn']);
  const n=m.seen.length;t.mock.timers.tick(60000);assert.equal(m.seen.length,n,'nothing fires after the tear');
});

test('a new print cancels the pending timers and starts a fresh warm-up',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1_000_000});
  const m=machine();m.start(40);
  t.mock.timers.tick(WARM_MS+500);assert.equal(m.seen.at(-1),'printing');
  m.leave();const job=m.start(40);m.seen.length=0;m.render();
  assert.equal(m.seen.at(-1),'warming');
  walk(t,WARM_MS+job.total+TEAR_MS+100);
  assert.deepEqual(compact(m.seen),['warming','printing','ready 3','ready 2','ready 1','torn'],'one timeline, never doubled');
  m.start(40);m.leave();const quiet=m.seen.length;t.mock.timers.tick(30000);assert.equal(m.seen.length,quiet,'leaving the tab stops the timer');
});

test('a manual tear during the countdown tears at once, never before printing ends',()=>{
  const job=printJob({rows:10,now:0});
  job.tearAt=1000;assert.equal(jobPhase(job,1000).phase,'warming');
  const done=job.warm+job.total;job.tearAt=done+500;
  assert.equal(jobPhase(job,done+400).phase,'ready');assert.equal(jobPhase(job,done+500).phase,'torn');
});

const model=items=>({store:storeIdentity({name:'NemoClaw',repo:'NVIDIA/NemoClaw'}),contributor:'ME',date:'09/29/2026',time:'21:00',shift:'TODAY',grouped:false,empty:['x'],notes:[],items});
const item=n=>({repo:'NVIDIA/NemoClaw',repoLabel:'NemoClaw',number:n,title:'fix: x',url:'u',mergedAt:'2026-09-29T18:00:00Z',time:'TUE 11:00 AM',additions:10,deletions:2,
  changedFiles:1,commits:1,checks:{total:5,passed:5,waiting:0,failed:0},reviewers:['a'],approvals:1,fixes:[],changesRequested:0,testLines:4,docLines:0,mergeSha:'abcdef1',headSha:'1234567'});

test('printing runs bottom first at a thermal printer pace with section pauses and a slow barcode',()=>{
  const rows=receiptRows(model([item(1),item(2),item(3)])),s=printSchedule(rows);
  const lines=s.durs.filter((d,i)=>s.kinds[i]==='line'),breaks=s.durs.filter((d,i)=>s.kinds[i]==='break');
  assert.ok(lines.every(d=>d>=120&&d<=250*1.5),'first 40 lines take 120 to 250 ms (taller rows a little more)');
  assert.ok(new Set(lines).size>lines.length/2,'with natural variation');
  assert.ok(breaks.length>=3&&breaks.every(d=>d>=PACE.pause[0]),'blank rows pause between sections');
  assert.equal(s.durs[s.kinds.indexOf('barcode')],PACE.barcode,'the barcode feeds for a second');
  const last=s.times.length-1;
  assert.equal(s.times[last],0,'the paper feeds bottom first: the last row prints first');
  assert.ok(s.times.every((t,i)=>i===last||t>s.times[i+1]),'every line starts after the one below it, so the header prints last');
  assert.equal(Math.max(...s.times),s.times[0]);
  const text=i=>rows[i].segs.map(x=>x.t).join('');
  assert.equal(text(last),'*** CUSTOMER COPY ***');assert.match(text(0),/NEMOCLAW MERGE MART/);
  const contributor=rows.findIndex((r,i)=>/^CONTRIBUTOR/.test(text(i)));
  assert.ok(s.times[s.kinds.indexOf('barcode')]<s.times[contributor],'the barcode is out before the contributor line');
  assert.ok(s.total>5000&&s.total<PACE.cap,`a short receipt takes a few seconds (${s.total} ms)`);
  assert.deepEqual(printSchedule(rows),s,'the same receipt always prints the same way');
});

test('long receipts speed up after 40 lines, never below 40 ms until the 20 s cap needs it',()=>{
  const printed=s=>printOrder(s.durs.length).map(i=>s.durs[i]);
  const mid=printSchedule(200),midRun=printed(mid);
  assert.ok(midRun.slice(PACE.slowLines).every(d=>d>=PACE.fast*0.9),'fast lines stay near 40 ms');
  assert.ok(midRun[PACE.slowLines+60]<midRun[5],'later lines are faster');
  assert.ok(mid.durs[0]<mid.durs[199],'in print order: the footer leads slowly and the header comes out fast');
  assert.ok(mid.total<=PACE.cap,'200 lines finish within 20 s');
  const huge=printSchedule(3000);assert.ok(huge.total<=PACE.cap+5,`3000 lines still finish in about 20 s (${huge.total} ms)`);
  assert.ok(printed(huge).slice(0,PACE.slowLines).every(d=>d>=120),'the first lines out keep the realistic pace');
});

test('rows carry their own start and length so a re-render resumes mid-print',()=>{
  const job=printJob({rows:receiptRows(model([item(1)])),now:0}),last=job.times.length-1;
  assert.match(rowTiming(job,last),/^--t:0ms;--d:\d+ms;--i:\d+ms$/,'the last row feeds first');
  assert.equal(rowTiming(job,3),`--t:${job.times[3]}ms;--d:${job.durs[3]}ms;--i:${Math.min(140,job.durs[3])}ms`);
  assert.doesNotMatch(rowTiming(job,999),/undefined|NaN/,'extra rows from refreshed data still get valid timing');
  const calm=printJob({rows:30,now:50000,reduced:true});
  assert.equal(calm.warm,0);assert.equal(calm.reduced,true);assert.equal(jobPhase(calm,50000).phase,'ready','reduced motion prints at once');
});

test('chatter follows the lines, runs across the barcode, skips blank feed, and is never under 30 ms apart',()=>{
  const job=printJob({rows:receiptRows(model([item(1),item(2)])),now:0}),ticks=chatterTimes(job);
  assert.ok(ticks.every((t,i)=>i===0||t-ticks[i-1]>=30));
  const b=job.kinds.indexOf('barcode');assert.ok(ticks.filter(t=>t>=job.times[b]&&t<job.times[b]+job.durs[b]).length>=10,'the barcode buzzes');
  job.kinds.forEach((k,i)=>{if(k==='break')assert.ok(!ticks.includes(job.times[i])||job.kinds[i+1]==='barcode');});
  assert.equal(ticks[0],0,'the first burst is the footer, the first line out');
});

test('the keypad self-test ticks follow the chase and stop before the final flash',()=>{
  const ticks=keyTicks();
  assert.equal(KEY_CHASE_MS.length,8);assert.ok(ticks.every(ms=>ms<WARM_MS-KEY_FLASH_MS));
  assert.deepEqual(ticks.slice(0,8),KEY_CHASE_MS);assert.equal(ticks[8],KEY_CYCLE_MS);
});

test('share and PDF names, and the barcode label shows the first five PRs',()=>{
  assert.equal(printTitle('NemoClaw'),'NemoclawMergeOMatic-Week');
  assert.equal(printTitle('Megatron-LM','month'),'MegatronLmMergeOMatic-Month');
  assert.equal(printTitle('NemoClaw','quarter'),'NemoclawMergeOMatic-Quarter');
  assert.equal(printTitle('NemoClaw','year',new Date(2026,9,3)),'NemoclawMergeOMatic-2026');
  assert.equal(printTitle('NemoClaw','year:2024'),'NemoclawMergeOMatic-2024');
  assert.equal(printTitle(null,'all'),'AllProjectsMergeOMatic-All');
  assert.doesNotMatch(printTitle('x'),/pulsar/i);
  const text=rowsText(receiptRows(model([1,2,3,4,5,6,7].map(item))));
  assert.match(text,/^ +#1 #2 #3 #4 #5 \.\.\.$/m);assert.equal(BARCODE_ITEMS,5);
  assert.match(rowsText(receiptRows(model([1,2].map(item)))),/^ +#1 #2$/m,'no dots when everything fits');
  const partial=rowsText(receiptRows(model([item(1),{...item(2),testLines:null,docLines:null}])));
  assert.match(partial,/TAX 1 +TESTS 33\.33% +4$/m,'tax is the real share of the items whose files are known');
  assert.match(partial,/TAX ON 1 OF 2 ITEMS$/m,'and says so');
});

test('the share image is drawn from the receipt rows',()=>{
  const calls=[];
  const g={font:'',fillStyle:'',strokeStyle:'',textBaseline:'',setTransform(){},fillRect:(...a)=>calls.push(['rect',...a]),measureText:t=>({width:[...String(t)].length*8}),fillText:(t,x,y)=>calls.push(['text',t,x,y]),
    save(){},restore(){},rect(){},clip(){},beginPath(){},moveTo:(x,y)=>calls.push(['move',x,y]),lineTo:(x,y)=>calls.push(['line',x,y]),stroke:()=>calls.push(['stroke',g.strokeStyle])};
  const canvas={width:0,height:0,getContext:()=>g};
  const rows=receiptRows(model([item(12377)])),size=drawReceipt(canvas,rows,{scale:2});
  assert.equal(canvas.width,size.width*2);assert.ok(size.height>rows.length*15);
  const texts=calls.filter(c=>c[0]==='text').map(c=>c[1]).join('\n');
  assert.match(texts,/NEMOCLAW MERGE MART/);assert.match(texts,/#12377/);assert.doesNotMatch(texts,/pulsar/i);
  assert.match(texts,/^BAGGED \n BY @A$/m,'the approval check is drawn, not typed as a font glyph');
  assert.deepEqual(calls.filter(c=>c[0]==='stroke'),[['stroke','#0b6b45']],'one check, in the CHECKS OK green');
  const by=calls.find(c=>c[0]==='text'&&c[1]===' BY @A'),bag=calls.find(c=>c[0]==='text'&&c[1]==='BAGGED ');
  assert.equal(by[2]-bag[2],8*8,'the check fills one character cell');
  assert.ok(calls.filter(c=>c[0]==='rect').length>20,'the barcode bars are drawn');
  const long=receiptRows(model(Array.from({length:1500},(_,i)=>item(20000+i))));
  drawReceipt(canvas,long,{scale:2});
  assert.ok(canvas.height<=32767&&canvas.width*canvas.height<=2.5e8,'a very long receipt still fits a browser canvas');
});
test('each printed line inks top to bottom across its full width, never sideways',async()=>{
  const {readFile}=await import('node:fs/promises');
  const css=await readFile(new URL('../web/kit/receipt.css',import.meta.url),'utf8');
  const ink=css.match(/@keyframes rc-ink\{from\{clip-path:inset\(([^)]*)\)\}/);
  assert.ok(ink,'rc-ink keyframes exist');
  assert.deepEqual(ink[1].trim().split(/\s+/),['0','0','100%','0'],'only the bottom inset animates, so a line is never cut left to right');
  assert.match(css,/\.rm\.is-printing \.rc-t\{animation:rc-ink var\(--i\) linear both;animation-delay:calc\(var\(--t\) \+ var\(--d\) - var\(--i\) - var\(--rc-el\)\)\}/,'ink ends with the feed, inside the paper already out');
  assert.match(css,/\.rm\.is-printing \.rc-r\{animation:rc-feed var\(--d\) linear both;/,'each row grows from nothing at the slot');
  assert.match(css,/\.rm-paper\.is-calm\{animation:rc-fade /,'reduced motion fades the finished receipt in');
});
test('the machine and paper show at 75% with CSS zoom, full size on phones, and print at full size',async()=>{
  const {readFile}=await import('node:fs/promises');
  const css=await readFile(new URL('../web/kit/receipt.css',import.meta.url),'utf8');
  const block=css.slice(css.indexOf('@supports (zoom:1){'));
  assert.match(block,/^@supports \(zoom:1\)\{\n \.rm-frame\{--rm-zoom:\.75;zoom:var\(--rm-zoom\)\}/,'only the machine frame is zoomed, and only where zoom exists');
  assert.match(block,/\.rm-frame \.rm-dock\{top:calc\(var\(--rm-sticky-top,70px\) \/ var\(--rm-zoom\)\)\}/,'the sticky machine still clears the host bar');
  assert.match(block,/@media \(max-width:600px\)\{\.rm-frame\{--rm-zoom:1\}\}/);
  assert.match(css,/@media print\{[\s\S]*\.rm-frame\{zoom:1!important\}/);
  const frame=css.match(/\n\.rm-frame\{([^}]*)\}/)[1];
  assert.doesNotMatch(frame,/background|padding|height|margin/,'the machine sits on the page background, with no box around it');
  assert.doesNotMatch(css,/\.rm-dock::before/);
  assert.doesNotMatch(css,/\.(receipt-controls|receipt-stage|topbar)\{[^}]*zoom:/,'the toolbar and the rest of the app keep their size');
});
