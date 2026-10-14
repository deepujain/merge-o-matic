import test from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO,STAGE,baseScale,availableHeight,fitScale,easeScale,tearPose,stageHeight,createVideoStage,titleBand,titleSpace,TITLE_GAP} from '../web/kit/receipt-video.js';
import {printJob,jobPhase,receiptLayout,paintRows,feedState,drawReceipt,inkDuration} from '../web/kit/receipt.js';

// A 2D context that records what was drawn; text is 8 units per character.
function fakeContext(log=[]){
  const g={log,font:'',fillStyle:'',strokeStyle:'',letterSpacing:'0px',textBaseline:'',lineWidth:1,globalAlpha:1,shadowBlur:0,shadowColor:'',shadowOffsetY:0,
    measureText:t=>({width:[...String(t)].length*8}),fillText:(t,x,y)=>log.push(['text',String(t),x,y,g.fillStyle,g.font]),
    fillRect:(...a)=>log.push(['rect',...a]),strokeRect(){},save:()=>log.push(['save']),restore:()=>log.push(['restore']),
    rect:(...a)=>log.push(['cliprect',...a]),clip:()=>log.push(['clip']),beginPath(){},closePath(){},moveTo(){},lineTo(){},arcTo(){},arc(){},fill(){},stroke(){},
    setTransform:(...a)=>log.push(['transform',...a]),translate:(x,y)=>log.push(['translate',x,y]),rotate:r=>log.push(['rotate',r]),scale(){},drawImage:(...a)=>log.push(['image',...a.slice(1)]),
    ellipse(){},setLineDash(){},strokeText:(t)=>log.push(['stroke',String(t)]),textAlign:'',lineJoin:'',
    createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})};
  return g;
}
const text=(t,cls='')=>({kind:'text',segs:[{t,cls}],align:'l',size:1,cls});
const ROWS=[text('NEMOCLAW MERGE MART','title'),text('FIX ISSUE#1 PR#2'),{kind:'text',segs:[{t:'15 FILES'},{t:'+701/-34',cls:'add'}],align:'l',size:1,cls:''},text(''),{kind:'barcode',seed:'1 2',size:4,segs:[]}];

test('the stage always fits: the scale is never above what fits now and eases toward what fits next',()=>{
  const avail=availableHeight();
  assert.equal(VIDEO.width,1080);assert.equal(VIDEO.height,1920);assert.equal(VIDEO.marginX,54,'5% side margins');assert.equal(VIDEO.marginY,96,'5% top and bottom margins');
  assert.ok(Math.abs(baseScale()-972/460)<1e-9);assert.ok(Math.abs(avail-1728/baseScale())<1e-9);
  assert.equal(fitScale(avail,400),1,'a short receipt prints at full size');assert.equal(fitScale(avail,avail*4),0.25);assert.equal(fitScale(avail,0),1);
  assert.equal(easeScale(null,{now:0.8,ahead:0.7},0),0.8,'the first frame starts at the fit');
  let s=1;const seen=[];
  for(let i=0;i<120;i++){const now=1/(1+i*0.02),ahead=1/(1+(i+18)*0.02);s=easeScale(s,{now,ahead},16.7);assert.ok(s<=now+1e-12,'never larger than what fits now');seen.push(s);}
  for(let i=1;i<seen.length;i++)assert.ok(seen[i-1]-seen[i]<0.02,'no jumps between frames');
  assert.ok(easeScale(0.5,{now:0.5,ahead:0.4},16.7)<0.5,'starts shrinking before the paper needs it');
  const back=easeScale(0.4,{now:1,ahead:1},16.7);assert.ok(back>0.4&&back<0.5,'grows back gently, never in one jump');
});

test('the tear drops and twists like the page animation, and the stage grows with the paper',()=>{
  assert.deepEqual(tearPose(0),{x:0,y:0,r:0});
  assert.deepEqual(tearPose(1000),{x:12,y:34,r:-2.8});assert.deepEqual(tearPose(5000),{x:12,y:34,r:-2.8});
  assert.equal(tearPose(1000,0.5).r,-1.4,'long slips twist less');
  const g=fakeContext(),layout=receiptLayout(g,ROWS),job=printJob({rows:ROWS,now:0});
  const at=ms=>stageHeight(jobPhase(job,ms),job,layout);
  assert.equal(at(100),STAGE.machine+STAGE.teeth,'warming shows only the machine');
  const feed=job.warm,end=job.warm+job.total;
  assert.ok(at(feed+job.times[4])<at(feed+job.times[2]),'the stage grows as lines feed, bottom first');
  const printed=at(end),torn=at(end+job.tearAfter+1000);
  assert.ok(Math.abs(printed-(STAGE.paperTop+layout.H*STAGE.paperWidth/layout.W+STAGE.shadow))<1e-6,'the finished paper is the whole receipt');
  assert.equal(torn,printed+14+34+10,'the dropped slip stays in frame');
});

test('one line renderer: the PNG draws every line, the video draws the first lines and inks the current one from the top',()=>{
  const log=[],g=fakeContext(log),layout=receiptLayout(g,ROWS);
  assert.equal(layout.tops[0],layout.pad);assert.equal(layout.heights[4],19*4);assert.equal(layout.H,Math.ceil(layout.pad*2+19*(1+1+1+1+4)));
  paintRows(g,ROWS,layout);
  const texts=log.filter(e=>e[0]==='text').map(e=>e[1]);
  assert.deepEqual(texts,['NEMOCLAW MERGE MART','FIX ISSUE#1 PR#2','15 FILES','+701/-34',''],'both columns of a line print together');
  assert.equal(log.filter(e=>e[0]==='clip').length,0,'fully inked lines are never clipped');
  const part=[];paintRows(fakeContext(part),ROWS,layout,{from:2,to:3,ink:0.4});
  const clip=part.find(e=>e[0]==='cliprect');
  assert.deepEqual(clip.slice(1),[0,layout.tops[2],layout.W,layout.heights[2]*0.4],'the ink clip is a full-width band from the top, never cut sideways');
  assert.deepEqual(part.filter(e=>e[0]==='text').map(e=>e[1]),['15 FILES','+701/-34']);
  const none=[];paintRows(fakeContext(none),ROWS,layout,{from:1,to:2,ink:0});assert.equal(none.filter(e=>e[0]==='text').length,0);
  const canvas={width:0,height:0,getContext:()=>fakeContext()},out=drawReceipt(canvas,ROWS,{scale:2});
  assert.equal(out.width,layout.W);assert.equal(canvas.width,Math.floor(layout.W*2));
  const bagged=[{kind:'text',segs:[{t:'BAGGED '},{t:'\u2713',cls:'check'},{t:' BY @RSLITER'}],align:'l',size:1,cls:'fine'}],inked=[],pen=fakeContext(inked);
  const strokes=[];pen.stroke=()=>strokes.push(inked.length);
  paintRows(pen,bagged,receiptLayout(pen,bagged),{ink:0.5});
  assert.deepEqual(inked.filter(e=>e[0]==='text').map(e=>e[1]),['BAGGED ',' BY @RSLITER'],'the check is drawn, not typed');
  const clipAt=inked.findIndex(e=>e[0]==='clip'),outer=inked.findLastIndex(e=>e[0]==='restore');
  assert.equal(strokes.length,1);assert.ok(strokes[0]>clipAt&&strokes[0]<outer,'the check inks inside the line clip like the text beside it');
});

test('feed state matches the page: rows feed bottom first, and ink wipes over the end of each feed, the barcode over its whole feed',()=>{
  const g=fakeContext(),layout=receiptLayout(g,ROWS),job=printJob({rows:ROWS,now:0});
  assert.equal(inkDuration(job,4),job.durs[4],'the barcode inks over its whole feed');
  for(const i of [0,1,2])assert.ok(inkDuration(job,i)<=140&&inkDuration(job,i)<=job.durs[i]);
  const start=feedState(job,0,layout);assert.equal(start.height,layout.pad*2);assert.deepEqual(start.fed,[0,0,0,0,0]);
  const mid=feedState(job,job.times[1]+job.durs[1]/2,layout);
  assert.deepEqual([mid.fed[2],mid.fed[3],mid.fed[4]],[1,1,1],'the rows below are out');
  assert.ok(Math.abs(mid.fed[1]-0.5)<0.01);assert.equal(mid.fed[0],0,'the header is not printed yet');
  assert.ok(mid.ink[1]<=mid.fed[1],'the ink never runs past the paper fed');
  assert.ok(Math.abs(mid.height-(layout.pad*2+layout.heights[2]+layout.heights[3]+layout.heights[4]+layout.heights[1]*mid.fed[1]))<1e-9);
  assert.equal(feedState(job,job.total,layout).height,layout.pad*2+layout.heights.reduce((a,b)=>a+b,0));
});

test('the video stage draws a frame per animation tick from the page snapshot and stops cleanly',()=>{
  const log=[];let queued=null,cancelled=false;
  const main=fakeContext(log),doc={createElement:()=>({width:0,height:0,getContext:()=>main,captureStream:fps=>({fps,getVideoTracks:()=>[{kind:'video',fps}]})})};
  let now=0;const job=printJob({rows:ROWS,now:0});job.rows=ROWS;
  const stage=createVideoStage({doc,raf:f=>{queued=f;return 7;},caf:()=>{cancelled=true;},clock:()=>now,
    snapshot:()=>({phase:'printing',lcd:'PRINTING 1 ITEM',progress:0.5,key:{disabled:true},sound:'on',job,rows:ROWS,now:job.warm+job.times[1]+job.durs[1]-5})});
  assert.equal(stage.width,1080);assert.equal(stage.height,1920);assert.equal(stage.track.fps,60);
  assert.equal(stage.scale,1,'a short receipt fills the width');
  const drawn=log.filter(e=>e[0]==='text').map(e=>e[1]);
  assert.ok(drawn.includes('15 FILES')&&drawn.includes('+701/-34'),'the lines below are already out, both columns at once');
  assert.ok(drawn.includes('FIX ISSUE#1 PR#2'),'the current line prints at the slot');
  assert.ok(!drawn.includes('NEMOCLAW MERGE MART'),'the header prints last');
  assert.ok(drawn.includes('PRINTING 1 ITEM'),'the LCD shows the page text');
  const layout=receiptLayout(fakeContext(),ROWS),block=log.find(e=>e[0]==='image');
  assert.ok(block[6]>layout.pad,'the finished rows hang below the line at the slot');
  now=16;queued();stage.stop();assert.ok(cancelled);
  assert.ok(!log.some(e=>e[0]==='stroke'),'no title without the hook: callers without one are unchanged');
});

const TILES={kind:'tiles',font:'Rockwell, serif',weight:'700',edge:'#1f1147',width:16,height:1.95,fonts:[],
  items:'MERGE-O-MATIC'.split('').map((ch,i)=>({ch:ch==='-'?'':ch,x:i*1.25,w:ch==='-'?.72:1.5,h:1.78,color:'#7c3aed',ring:'#ddd6fe',ink:'#fff',r:i%2?3:-3,shape:ch==='-'?'dash':ch==='O'?'circle':'rect',o:ch==='O'}))};
function titled(title,{rows=ROWS,at=null}={}){
  const log=[],main=fakeContext(log),doc={createElement:()=>({width:0,height:0,getContext:()=>main,captureStream:()=>({getVideoTracks:()=>[{}]})})};
  let now=0,next=null;const job=printJob({rows,now:0});job.rows=rows;
  const stage=createVideoStage({doc,raf:f=>{next=f;return 1;},caf(){},clock:()=>now,title,
    snapshot:()=>({phase:'printing',lcd:'PRINTING',progress:.5,key:{disabled:true},sound:'on',job,rows,now:at??job.warm+job.total+10})});
  // The first frame is the start of the load-in pop; two seconds on, every letter is in.
  now=2000;log.length=0;next();
  return {log,stage,job};
}

test('an opt-in title draws the heading above the machine, and the stage fits title, machine and paper together',()=>{
  assert.equal(titleBand(null),null);assert.equal(titleSpace(undefined),0);
  const band=titleBand(TILES);
  assert.ok(band.F*TILES.width<=STAGE.width,'the tiles fit the stage width');
  assert.equal(titleSpace(TILES),band.h+TITLE_GAP);
  const {log,stage}=titled(TILES);
  const letters=log.filter(e=>e[0]==='stroke').map(e=>e[1]);
  assert.deepEqual(letters,['M','E','R','G','E','O','M','A','T','I','C'],'every letter tile is outlined, the dashes are blank tiles');
  const firstTransform=log.findIndex(e=>e[0]==='transform'&&e[1]!==1),drop=log.find((e,i)=>i>firstTransform&&e[0]==='translate'&&e[1]===0&&e[2]===titleSpace(TILES));
  assert.ok(drop,'the machine starts below the title band and the gap, so they never overlap');
  const titleAt=log.findIndex(e=>e[0]==='stroke'),machineAt=log.findIndex(e=>e===drop);
  assert.ok(titleAt<machineAt,'the title is drawn before the machine is moved under it');
  const plain=titled(null).stage.scale;
  assert.ok(stage.scale<=plain,'with a title the stage zooms out a little more, never less');
  const tall=[...Array(120)].map((_,i)=>text(`LINE ${i}`)),big=titled(TILES,{rows:tall});
  const need=titleSpace(TILES)+stageHeight(jobPhase(big.job,big.job.warm+big.job.total+10),big.job,receiptLayout(fakeContext(),tall));
  assert.ok(need*big.stage.scale<=availableHeight()+1e-6,'a long receipt still fits in frame with the title');
});

test('a plain title draws the heading text with its O, and a missing font or bad spec never breaks the video',()=>{
  const {log}=titled({kind:'text',text:'Merge-O-Matic',o:6,font:'Inter',weight:'800',color:'#1f1b2e',size:40});
  const drawn=log.filter(e=>e[0]==='text').map(e=>e[1]);
  for(const part of ['Merge-','O','-Matic'])assert.ok(drawn.includes(part),`draws ${part}`);
  const o=log.find(e=>e[0]==='text'&&e[1]==='O');assert.equal(o[4],'#dc2626','the O is red while recording');
  assert.doesNotThrow(()=>titled({kind:'tiles',items:[],width:0,height:0}));
  assert.doesNotThrow(()=>titled({kind:'patches',items:[],width:16,height:2}),'a retired kind draws no title');
  assert.doesNotThrow(()=>titled({kind:'unknown'}));
});

test('a Crayon title draws each letter in its own colour, with the O still red while recording',()=>{
  const colors=['#e63946','#f77f00','#d99a00','#2a9d4b','#2f6fdf','#8e44ad','#8e44ad','#2a9d4b','#e63946','#f77f00','#d99a00','#2a9d4b','#2f6fdf'];
  const {log}=titled({kind:'text',text:'Merge-O-Matic',o:6,font:'"Chalkboard SE", cursive',weight:'700',color:'#2b2a4c',size:40,colors,tilts:colors.map((_,i)=>i%2?5:-5)});
  const drawn=log.filter(e=>e[0]==='text').slice(0,13);
  assert.deepEqual(drawn.map(e=>e[1]),[...'Merge-O-Matic'],'one letter at a time, before the machine');
  assert.equal(drawn[0][4],'#e63946');assert.equal(drawn[3][4],'#2a9d4b');
  assert.equal(drawn[6][4],'#dc2626','the O is red while recording');
  assert.ok(log.some(e=>e[0]==='rotate'&&e[1]!==0),'each letter is a little crooked');
  assert.doesNotThrow(()=>titled({kind:'text',text:'Merge-O-Matic',o:6,colors:['#000']}),'a short colour list falls back to one colour');
});
