// Receipt layout as a fixed-width character grid, laid out like a supermarket thermal receipt.
// Every row is a list of segments; the paper view styles them and rowsText joins them.
export const WIDTH=42,BARCODE_ITEMS=5;
// Saved file name: "NemoClaw" + week -> "NemoclawMergeOMatic-Week", "Megatron-LM" + year:2025 -> "MegatronLmMergeOMatic-2025".
const RANGE_SUFFIX={week:'-Week',month:'-Month',quarter:'-Quarter',all:'-All'};
export function printTitle(name,range='week',now=new Date()){
  const words=String(name||'All projects').split(/[^A-Za-z0-9]+/).filter(Boolean);
  const year=range==='year'?now.getFullYear():/^year:\d{4}$/.test(range||'')?range.slice(5):'';
  return (words.map(w=>w[0].toUpperCase()+w.slice(1).toLowerCase()).join('')||'AllProjects')+'MergeOMatic'+(year?`-${year}`:RANGE_SUFFIX[range]||'');
}
const seg=(t,cls='',href='')=>({t:String(t),cls,href});
const len=segs=>segs.reduce((n,s)=>n+[...s.t].length,0);
const row=(segs,opts={})=>({segs:typeof segs==='string'?[seg(segs)]:segs,align:'l',size:1,kind:'text',cls:'',...opts});
const center=(text,opts={})=>row([seg(text,opts.segCls||'')],{align:'c',...opts});
const blank=()=>row('');
const num=n=>Number(n||0).toLocaleString('en-US');
const fit=(t,w)=>{const c=[...String(t)];return c.length>w?c.slice(0,w).join(''):c.join('');};
const lpad=(t,w)=>{t=fit(t,w);return ' '.repeat(w-[...t].length)+t;};
const rpad=(t,w)=>{t=fit(t,w);return t+' '.repeat(w-[...t].length);};

export function wrap(text,width=WIDTH,first='',rest=first){
  const out=[];let line=first,fresh=true;
  for(let word of String(text).split(/\s+/).filter(Boolean)){
    const room=()=>width-[...line].length;
    if(!fresh&&[...word].length+1>room()){out.push(line);line=rest;fresh=true;}
    while([...word].length>room()){const cut=Math.max(1,room());out.push(line+[...word].slice(0,cut).join(''));word=[...word].slice(cut).join('');line=rest;}
    line+=(fresh?'':' ')+word;fresh=false;
  }
  if(!fresh||!out.length)out.push(line);
  return out;
}

// Left and right columns separated by spaces. Falls back to two rows when they do not fit.
export function pair(left,right,{width=WIDTH,cls='',size=1}={}){
  const l=typeof left==='string'?[seg(left)]:left,r=typeof right==='string'?[seg(right)]:right;
  const gap=width-len(l)-len(r);
  if(gap>=1)return [row([...l,seg(' '.repeat(gap)),...r],{cls,size})];
  return [row(l,{cls,size}),row([seg(' '.repeat(Math.max(0,width-len(r)))),...r],{cls,size})];
}

// Totals block: a short tag, a right-aligned label and a right-aligned amount, like SUBTOTAL / TAX 1 / TOTAL.
function total(tag,label,amount){
  const a=typeof amount==='string'||typeof amount==='number'?[seg(String(amount))]:amount;
  return row([seg(' '.repeat(4)+rpad(tag,8)+lpad(label,18)),seg(' '.repeat(Math.max(1,WIDTH-30-len(a)))),...a]);
}

// Conventional commit type from a PR title: "fix(tunnel): ..." prints FIX, a revert prints RETURN,
// anything else prints PR.
export function itemType(title){
  if(isRevert(title))return 'RETURN';
  const m=/^\s*([A-Za-z]{2,10})(\([^)]*\))?!?:/.exec(String(title||''));
  return m?m[1].toUpperCase():'PR';
}
export const isRevert=title=>/^\s*(revert\b|revert(\([^)]*\))?!?:)/i.test(String(title||''));

// Share of changed lines, rounded like a tax rate.
export const share=(part,whole)=>(part/whole*100).toFixed(2)+'%';

export function storeIdentity(project,storeCount=0){
  if(!project)return {name:'MAIN STREET MERGES',address:[`${storeCount} ${storeCount===1?'STORE':'STORES'} ON GITHUB.COM`],scope:'all'};
  return {name:`${String(project.name||project.repo.split('/').pop()).toUpperCase()} MERGE MART`,address:[`github.com/${project.repo}`],scope:project.repo};
}

export function barcode(seed){
  const digits=String(seed).replace(/\D/g,'').slice(0,32)||'0',bars=[];let x=0;
  const put=(w,ink)=>{if(ink)bars.push([x,w]);x+=w;};
  put(2,1);put(1,0);put(1,1);put(1,0);put(2,1);put(2,0);
  for(const d of digits){const n=Number(d);put(n%3+1,1);put((n*7)%3+1,0);put(n>5?3:1,1);put(1+n%2,0);put(n%4===0?2:1,1);put(1,0);}
  put(2,1);put(1,0);put(1,1);put(1,0);put(2,1);
  return {bars,width:x};
}

const count=(n,one,many)=>`${n} ${n===1?one:many}`;
// Printed after BAGGED only for approving reviews; the paper and canvas draw it as a green check.
export const CHECK='\u2713';
// "18 FILES  84 CHECKS OK  5 COMMITS", shortened until it shares a row with a time of `room` characters.
// Checks stay off when the server did not report them.
export function itemStats(i,room=0){
  const c=i.checks,ok=c&&!c.failed&&!c.waiting;
  const checks=c?.total?[seg(ok?`${count(c.total,'CHECK OK','CHECKS OK')}`:`${c.passed}/${c.total} CHECKS`,ok?'ok':'warn')]:[];
  const build=(sep,cmt)=>{
    const parts=[i.changedFiles?[seg(count(i.changedFiles,'FILE','FILES'))]:[],checks,i.commits?[seg(cmt?count(i.commits,'CMT','CMTS'):count(i.commits,'COMMIT','COMMITS'))]:[]].filter(p=>p.length);
    return parts.flatMap((p,k)=>k?[seg(sep),...p]:p);
  };
  const tries=[build('  ',false),build('  ',true)];
  const inline=tries.find(s=>len(s)+(room?room+2:0)<=WIDTH);
  return {segs:inline||tries[0],inline:!!inline||!room};
}

// PRs closed without merging: listed after the sale with their real size and close time, never added to any total.
function returnRows(list,grouped){
  if(!list?.length)return [];
  const out=[center('** RETURNED UNMERGED **',{cls:'dept'})];
  for(const i of list){
    const name=[seg(itemType(i.title)+' ','item'),seg('PR#'),seg(String(i.number),'link',i.url)];
    if(grouped)name.push(seg(' '+String(i.repoLabel||'').toUpperCase()));
    out.push(...pair(name,[seg(`+${i.additions}`,'add'),seg('/'),seg(`-${i.deletions}`,'del')]).map(r=>({...r,title:i.title})));
    out.push(...pair('CLOSED UNMERGED',i.time||'',{cls:'fine'}));
  }
  return out;
}

// Reviews given on other people's PRs: a side table like returns, never added to any total. A store where nothing
// was reviewed prints no section.
const VERDICT={APPROVED:'APPROVED',CHANGES_REQUESTED:'CHANGES',COMMENTED:'COMMENTED',DISMISSED:'DISMISSED'};
function reviewRows(list,grouped){
  if(!list?.length)return [];
  const out=[center('** REVIEWS GIVEN **',{cls:'dept'})];
  for(const i of list){
    const name=[seg((VERDICT[i.verdict]||'REVIEWED')+' ','item'),seg('PR#'),seg(String(i.number),'link',i.url)];
    if(grouped)name.push(seg(' '+String(i.repoLabel||'').toUpperCase()));
    out.push(...pair(name,i.author?`@${String(i.author).toUpperCase()}`:'').map(r=>({...r,title:i.title})));
    out.push(...pair(`${count(i.rounds||1,'REVIEW','REVIEWS')}${i.merged?'  MERGED':''}`,i.time||'',{cls:'fine'}));
  }
  return out;
}

// Every printed number comes from GitHub or the local clock. Store names and slogans are decoration.
// model: {store,contributor,shift,date,time,items,returned,reviewed,grouped,empty,void,notes}
// items: {repoLabel,number,title,url,time,additions,deletions,changedFiles,commits,checks,reviewers,approvals,fixes,ci,changesRequested,testLines,docLines}
export function receiptRows(m){
  const rows=[];const add=(...r)=>rows.push(...r.flat());
  const items=m.items||[];
  add(center(m.store.name,{cls:m.store.name.length>22?'title small':'title',size:2}),
    m.contributor?center(fit(`CONTRIBUTOR ${m.contributor}`,WIDTH)):[],
    ...m.store.address.map(a=>center(a.length>WIDTH?a.slice(0,WIDTH-1)+'…':a)),
    center(`SHIFT: ${m.shift}`),
    blank());
  if(m.void){
    add(blank(),center(m.void.title,{size:2,cls:'stamp'}),...m.void.lines.flatMap(t=>wrap(t,WIDTH).map(l=>center(l))),blank());
  }else if(!items.length){
    add(blank(),center('*** NO SALE ***',{size:2,cls:'stamp'}),...m.empty.flatMap(t=>wrap(t,WIDTH).map(l=>center(l))),blank(),
      returnRows(m.returned,m.grouped),m.returned?.length?blank():[],
      reviewRows(m.reviewed,m.grouped),m.reviewed?.length?blank():[],
      total('','SUBTOTAL','0'),total('','TOTAL','0'),blank());
  }else{
    let dept='';
    for(const i of items){
      if(m.grouped&&i.repoLabel!==dept){dept=i.repoLabel;add(center(`** ${dept.toUpperCase()} **`,{cls:'dept'}));}
      const price=[seg(`+${i.additions}`,'add'),seg('/'),seg(`-${i.deletions}`,'del')];
      const name=[seg(itemType(i.title)+' ','item')];
      if(i.fixes?.length){name.push(seg('ISSUE#'),seg(String(i.fixes[0].number),'link',i.fixes[0].url));if(i.fixes.length>1)name.push(seg(` +${i.fixes.length-1}`));name.push(seg(' '));}
      name.push(seg('PR#'),seg(String(i.number),'link',i.url));
      add(pair(name,price).map(r=>({...r,title:i.title})));
      const stats=itemStats(i,[...(i.time||'')].length);
      const approvers=(i.reviewers||[]).slice(0,i.approvals||0);
      let who='';
      if(approvers.length){
        who=`BAGGED ${CHECK} BY @${approvers[0].toUpperCase()}`;
        for(const [k,a] of approvers.slice(1).entries()){const more=approvers.length-2-k,next=`${who} @${a.toUpperCase()}`;if([...next].length+(more?` +${more}`.length:0)>WIDTH){who+=` +${approvers.length-1-k}`;break;}who=next;}
        who=fit(who,WIDTH);
      }
      // The merge time sits right of the numbers; when they fill the row it moves to the BAGGED BY row.
      const late=!stats.inline&&i.time,withWho=late&&who&&[...who].length+2+[...i.time].length<=WIDTH;
      add(stats.inline?pair(stats.segs,i.time||'',{cls:'fine'}):row(stats.segs,{cls:'fine'}));
      if(late&&!withWho)add(pair('',i.time,{cls:'fine'}));
      if(who){
        // The check fills one grid cell, so the row keeps its width and the time stays right-aligned.
        const by=[...who].slice(8).join(''),segs=[seg('BAGGED '),seg(CHECK,'check'),seg(by)];
        const sr=`Bagged, approved,${by.toLowerCase().replace(/ \+(\d+)$/,' and $1 more')}${withWho?`, ${i.time}`:''}`;
        add((withWho?pair(segs,i.time,{cls:'fine'}):[row(segs,{cls:'fine'})]).map(r=>({...r,sr})));
      }
    }
    add(m.returned?.length?[blank(),...returnRows(m.returned,m.grouped)]:[]);
    add(m.reviewed?.length?[blank(),...reviewRows(m.reviewed,m.grouped)]:[]);
    const sum=k=>items.reduce((n,i)=>n+(i[k]||0),0);
    const plus=sum('additions'),minus=sum('deletions'),changed=plus+minus;
    // Tax covers only items whose complete file list is known; a partial base is printed as such.
    const taxed=items.filter(i=>i.testLines!=null&&i.docLines!=null),base=taxed.reduce((n,i)=>n+i.additions+i.deletions,0);
    const shares=base>0,partTax=shares&&taxed.length<items.length;
    const taxSum=k=>taxed.reduce((n,i)=>n+(i[k]||0),0);
    // Walmart-style totals over real counts: SUBTOTAL lines added, TAX shares of changed lines in tests and docs,
    // TOTAL lines changed, CI TEND PRs whose checks passed, CHANGE DUE change requests, RETURNS reverts.
    const known=items.filter(i=>i.checks?.total||i.ci);
    const green=known.filter(i=>i.checks?.total?!i.checks.failed&&!i.checks.waiting:i.ci==='SUCCESS').length;
    const returns=items.filter(i=>isRevert(i.title)).length;
    add(blank(),
      total('','SUBTOTAL',[seg('+'+num(plus),'add')]),
      shares?total('TAX 1',`TESTS ${share(taxSum('testLines'),base)}`,num(taxSum('testLines'))):[],
      shares?total('TAX 2',`DOCS ${share(taxSum('docLines'),base)}`,num(taxSum('docLines'))):[],
      partTax?pair('',`TAX ON ${taxed.length} OF ${items.length} ITEMS`,{cls:'fine'}):[],
      total('','TOTAL',[seg(num(changed),'strong')]),
      known.length?total('','CI TEND',[seg(`${green}/${known.length}`,green===known.length?'ok':'warn')]):[],
      total('','CHANGE DUE',String(sum('changesRequested'))),
      returns?total('','RETURNS',String(returns)):[],
      blank(),
      minus?center(`YOU SAVED ${num(minus)} ${minus===1?'LINE':'LINES'}`,{segCls:'strong'}):[],
      minus?blank():[]);
    const last=items.reduce((a,b)=>Date.parse(b.mergedAt||0)>=Date.parse(a.mergedAt||0)?b:a,items[0]);
    add(last.mergeSha?pair(`APPROVAL # ${last.mergeSha.slice(0,7).toUpperCase()}`,`MERGE OF PR#${last.number}`):[],
      last.headSha?pair(`REF # ${last.headSha.slice(0,7).toUpperCase()}`,`HEAD OF PR#${last.number}`):[],
      last.mergeSha||last.headSha?blank():[]);
  }
  for(const n of m.notes||[])add(wrap(n,WIDTH).map(l=>center(l,{cls:'fine'})));
  add(center(`# ITEMS SOLD ${items.length}`,{size:2,cls:'sold'}),m.returned?.length&&!m.void?center(`# ITEMS RETURNED ${m.returned.length}`):[],m.reviewed?.length&&!m.void?center(`# REVIEWS GIVEN ${m.reviewed.length}`):[],blank());
  if(!m.void&&items.length){
    const numbers=items.slice(0,BARCODE_ITEMS).map(i=>'#'+i.number).join(' ');
    add(row('',{kind:'barcode',size:4,seed:numbers}),center(items.length>BARCODE_ITEMS?numbers+' ...':numbers,{cls:'fine'}),blank());
  }
  add(center(m.void?'Please See a Maintainer.':'Merge Early, Merge Often!'),
    center('Thank You for Shipping With Us!'),
    center(`${m.date}     ${m.time}`),
    center('*** CUSTOMER COPY ***'));
  return rows;
}

export function rowText(r){
  const text=r.segs.map(x=>x.t).join('');
  if(r.align!=='c')return text.replace(/\s+$/,'');
  const pad=Math.max(0,Math.floor((WIDTH-[...text].length)/2));
  return ' '.repeat(pad)+text;
}
// The paper as plain text, one line per text row.
export function rowsText(rows){return rows.filter(r=>r.kind==='text').map(rowText).join('\n').replace(/\n{3,}/g,'\n\n');}

// Draws the rows onto a canvas, from the same data the paper shows: the shared PNG and the recorded video both use
// receiptLayout and paintRows, so they print the same lines in the same fonts.
const INK={ink:'#16150f',add:'#0b6b45',ok:'#0b6b45',del:'#a3221b',warn:'#8a5300',fine:'#4b4a43',stamp:'#a3221b'};
export const PAPER='#fffdf8';
export const MONO='"OCR A Std", "OCR A Extended", "OCR-A", Menlo, "SF Mono", "Courier New", monospace',NARROW='"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
// Receipt units: W wide, H tall, pad around the text; tops[i] and heights[i] place row i.
export function receiptLayout(g,rows){
  const size=14,lh=19,pad=26;
  g.font=`600 ${size}px ${MONO}`;
  const cw=g.measureText('M').width,W=Math.ceil(WIDTH*cw+pad*2),tops=[],heights=[];
  let y=pad;
  for(const r of rows){const h=lh*(r.size||1);tops.push(y);heights.push(h);y+=h;}
  return {W,H:Math.ceil(y+pad),pad,size,lh,tops,heights};
}
// The approval check over its character cell and the blank cells beside it, the same stroke as the paper's SVG
// (viewBox 0 0 10 10).
function paintCheck(g,x,mid,w){
  const s=w*1.5,x0=x+(w-s)/2,y0=mid-s/2,p=(a,b)=>[x0+a*s/10,y0+b*s/10];
  g.save();g.strokeStyle=INK.ok;g.lineWidth=Math.max(1.6,s*0.19);g.lineCap='square';g.lineJoin='miter';
  g.beginPath();g.moveTo(...p(1.4,5.4));g.lineTo(...p(4,8));g.lineTo(...p(8.8,2.2));g.stroke();g.restore();
}
// Paints rows from..to-1 in receipt units (the caller sets the transform). The last painted row inks only its top
// `ink` fraction, the way a thermal head prints a whole line one dot row at a time from the top.
export function paintRows(g,rows,layout,{from=0,to=rows.length,ink=1}={}){
  const {W,pad,size,tops,heights}=layout,tokens=c=>String(c||'').split(' ').filter(Boolean);
  g.textBaseline='middle';
  for(let i=Math.max(0,from);i<Math.min(to,rows.length);i++){
    const r=rows[i],y=tops[i],h=heights[i],part=i===to-1?Math.max(0,Math.min(1,ink)):1;
    if(part<=0)continue;
    if(part<1){g.save();g.beginPath();g.rect(0,y,W,h*part);g.clip();}
    if(r.kind==='barcode'){
      const b=barcode(r.seed),w=(W-pad*2)*0.86,x0=(W-w)/2,u=w/b.width;g.fillStyle=INK.ink;
      for(const [x,bw] of b.bars)g.fillRect(x0+x*u,y+8,bw*u,h-16);
    }else{
      const cls=tokens(r.cls),title=cls.includes('title'),big=(r.size||1)>1;
      const fsize=title?(cls.includes('small')?19:24):big?size*1.9:size;
      const fontFor=s=>`${title||big||cls.some(c=>['item','strong','dept','sold','flag'].includes(c))||tokens(s.cls).includes('strong')?800:600} ${fsize}px ${title?NARROW:MONO}`;
      const mark=s=>tokens(s.cls).includes('check');
      const widths=r.segs.map(s=>{g.font=fontFor(s);return g.measureText(mark(s)?'M':s.t).width;});
      let x=r.align==='c'?(W-widths.reduce((a,b)=>a+b,0))/2:pad;
      r.segs.forEach((s,k)=>{
        const tone=[...tokens(s.cls),...cls].find(c=>INK[c]);
        g.font=fontFor(s);g.fillStyle=INK[tone]||INK.ink;
        if(mark(s))paintCheck(g,x,y+h/2,widths[k]);else g.fillText(s.t,x,y+h/2);
        x+=widths[k];
      });
    }
    if(part<1)g.restore();
  }
}
export function drawReceipt(canvas,rows,{scale=2}={}){
  const layout=receiptLayout(canvas.getContext('2d'),rows),{W,H}=layout;
  // Browsers return a blank canvas past 32767px on a side or roughly 268M pixels.
  scale=Math.min(scale,32000/H,Math.sqrt(2e8/(W*H)));
  canvas.width=Math.floor(W*scale);canvas.height=Math.floor(H*scale);
  const g=canvas.getContext('2d');
  g.setTransform(scale,0,0,scale,0,0);g.fillStyle=PAPER;g.fillRect(0,0,W,H);
  paintRows(g,rows,layout);
  return {width:W,height:H,scale,layout};
}
// How far each row has fed and inked at paper time `paper` (ms from the start of the feed), matching the page:
// a row's height grows over its own duration, and its ink wipes top to bottom over the last 140 ms of that feed at
// most (the barcode over its whole feed), so the ink always stays inside the paper already fed.
export const inkDuration=(job,i)=>job.kinds?.[i]==='barcode'?job.durs[i]:Math.min(140,job.durs[i]);
export function feedState(job,paper,layout){
  const n=job.times.length,fed=new Array(n).fill(0),ink=new Array(n).fill(0);
  let height=layout.pad*2;
  for(let i=0;i<n;i++){
    const t=paper-job.times[i];
    if(t<=0)continue;
    const d=job.durs[i],id=inkDuration(job,i);
    fed[i]=Math.min(1,t/d);ink[i]=Math.max(0,Math.min(1,(t-(d-id))/id));
    height+=layout.heights[i]*fed[i];
  }
  return {fed,ink,height};
}

// A print job is a fixed timeline measured from job.at: warm up, feed the paper, wait, tear off.
// Phases come from the clock alone, so re-renders never restart or double it.
export const WARM_MS=3000,TEAR_MS=3000;
// The paper feeds out of the slot bottom first, like a real receipt printer: the last row prints first and the
// header prints last, while the rows already printed slide down with the paper. Every array stays indexed by row;
// printOrder(n)[k] is the row printed k-th.
export const printOrder=n=>Array.from({length:n},(_,k)=>n-1-k);
// Thermal printer pace, in print order: the first SLOW_LINES lines take 120 to 250 ms each with small variation,
// blank rows (section breaks) pause, the barcode is one slow feed, and later lines speed up toward FAST_MS. When
// the whole slip would still run past CAP_MS, the lines after SLOW_LINES are scaled down to fit.
export const PACE={slow:[130,230],slowLines:40,fast:40,decay:0.94,pause:[280,380],barcode:1000,cap:20000,tail:300};
export function printSchedule(rows){
  const list=typeof rows==='number'?Array.from({length:rows},()=>null):rows;
  const n=list.length,order=printOrder(n),pos=i=>n-1-i;
  let seed=n*2654435761>>>0;
  const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const within=([lo,hi])=>lo+rnd()*(hi-lo);
  const kind=r=>r?.kind==='barcode'?'barcode':r&&r.kind==='text'&&!rowText(r).trim()?'break':'line';
  const durs=new Array(n);
  order.forEach((i,k)=>{
    const r=list[i],kd=kind(r);
    if(kd==='barcode'){durs[i]=PACE.barcode;return;}
    if(kd==='break'){durs[i]=within(PACE.pause);return;}
    const base=k<PACE.slowLines?within(PACE.slow):Math.max(PACE.fast,PACE.slow[1]*PACE.decay**(k-PACE.slowLines))*(0.9+rnd()*0.2);
    durs[i]=base*Math.min(2,r?.size||1)**0.5;
  });
  const sum=durs.reduce((a,b)=>a+b,0);
  if(sum+PACE.tail>PACE.cap){
    const late=i=>pos(i)>=PACE.slowLines&&kind(list[i])!=='barcode';
    const fixed=durs.reduce((m,d,i)=>late(i)?m:m+d,0),flex=sum-fixed,room=Math.max(0,PACE.cap-PACE.tail-fixed);
    const f=flex>0?Math.min(1,room/flex):1;
    list.forEach((r,i)=>{if(late(i))durs[i]*=f;});
  }
  const times=new Array(n);let t=0;
  for(const i of order){times[i]=Math.round(t);t+=durs[i];}
  return {times,durs:durs.map(d=>Math.max(1,Math.round(d))),kinds:list.map(kind),total:Math.round(t+PACE.tail)};
}
// Inline timing for paper row i: when it starts feeding, for how long, and how long its ink takes, in ms from the
// start of the feed.
export function rowTiming(job,i){
  const d=job.durs[i]??1,ink=job.durs[i]==null?1:inkDuration(job,i);
  return `--t:${job.times[i]??job.total}ms;--d:${d}ms;--i:${ink}ms`;
}
// Keypad self-test during warm-up: each of the 8 keys lights at its own offset in a 900 ms cycle, uneven on
// purpose, then every key flashes KEY_FLASH_MS before the feed. CSS and the key-click ticks share these numbers.
export const KEY_CYCLE_MS=900,KEY_CHASE_MS=[0,120,230,290,430,560,610,760],KEY_FLASH_MS=260;
export function keyTicks(warm=WARM_MS){
  const out=[];
  for(let c=0;c*KEY_CYCLE_MS<warm;c++)for(const d of KEY_CHASE_MS){const at=c*KEY_CYCLE_MS+d;if(at<warm-KEY_FLASH_MS)out.push(at);}
  return out;
}
// Print-head bursts in ms from the start of the feed: one per text line, a steady run across the barcode,
// none on blank feed, and never closer than 30 ms so a fast tail stays a buzz.
export function chatterTimes({times,durs,kinds=[]}){
  const out=[];let last=-Infinity;
  const push=t=>{if(t-last>=30){out.push(Math.round(t));last=t;}};
  for(const i of times.map((_,i)=>i).sort((a,b)=>times[a]-times[b])){
    const t=times[i];
    if(kinds[i]==='break')continue;
    if(kinds[i]==='barcode'){for(let x=t;x<t+durs[i];x+=60)push(x);continue;}
    push(t);
  }
  return out;
}
// rows: the receipt rows (or a count of plain lines). Reduced motion starts the job already printed.
export function printJob({rows,now,reduced=false,start=now}){
  const {times,durs,kinds,total}=printSchedule(rows);
  const base={times,durs,kinds,total,tearAfter:TEAR_MS,tearAt:null};
  return reduced?{...base,at:now-total,warm:0,reduced:true}:{...base,at:Math.min(start,now),warm:WARM_MS};
}
// phase: warming | printing | ready | torn. paper: ms of paper fed. next: ms until the display changes, or null.
export function jobPhase(job,now){
  const t=Math.max(0,now-job.at),printed=job.warm+job.total,auto=printed+job.tearAfter;
  const tore=job.tearAt!=null?Math.max(printed,Math.min(auto,job.tearAt-job.at)):auto;
  if(t<job.warm)return {phase:'warming',elapsed:t,paper:0,next:job.warm-t};
  if(t<printed)return {phase:'printing',elapsed:t,paper:t-job.warm,next:printed-t};
  if(t<tore){const left=tore-t;return {phase:'ready',elapsed:t,paper:job.total,countdown:Math.ceil(left/1000),next:left%1000||1000};}
  return {phase:'torn',elapsed:t,paper:job.total,tornFor:t-tore,next:null};
}

// Machine sounds, synthesized with Web Audio. Nothing plays until unlock() runs inside a user gesture,
// and nothing plays while muted or while the page is hidden. Browsers suspend or interrupt a context
// after idle, device changes or background tabs, so every gesture resumes it, a closed context is
// replaced, and sounds asked for while it is not running are scheduled once it resumes.
export const SOUND_KEY='receipt-sound';
export function createReceiptSound({makeContext,storage=null,hidden=()=>false,volume=0.16,random=Math.random,now=()=>Date.now(),onChange=()=>{}}={}){
  let ctx=null,unlocked=false,noise=null,current=null,gen=0,waking=null;
  let muted=(()=>{try{return storage?.getItem(SOUND_KEY)==='off';}catch{return false;}})();
  const changed=()=>{try{onChange();}catch{}};
  function context(){
    if(ctx?.state==='closed'){ctx=null;noise=null;current=null;waking=null;}
    if(!ctx&&makeContext){try{ctx=makeContext()||null;}catch{ctx=null;}if(ctx)ctx.onstatechange=changed;}
    return ctx;
  }
  const running=()=>ctx?.state==='running';
  const ready=()=>unlocked&&!muted&&!hidden()&&Boolean(context());
  // Resolves true once the context runs. A context that refuses to resume is replaced once.
  function wake(){
    const c=context();
    if(!c)return Promise.resolve(false);
    if(c.state==='running')return Promise.resolve(true);
    if(waking?.ctx===c)return waking.promise;
    const attempt=target=>{let p;try{p=Promise.resolve(target.resume?.());}catch(e){p=Promise.reject(e);}return p.then(()=>target.state==='running',()=>false);};
    const promise=attempt(c).then(ok=>{
      if(ok||ctx!==c)return ok;
      try{c.close?.();}catch{}
      ctx=null;noise=null;current=null;
      const fresh=context();
      return fresh?attempt(fresh):false;
    }).finally(()=>{if(waking?.promise===promise)waking=null;changed();});
    waking={ctx:c,promise};
    return promise;
  }
  function unlock(){
    unlocked=true;
    if(muted)return Promise.resolve(false);
    return wake();
  }
  // Runs fn(delayMs) now when the context runs, or after it resumes unless a newer sound or stop() came first.
  // A throw while scheduling (a bad AudioParam value) is recorded for debug() instead of vanishing.
  let lastError='',plays=0,lastPlayAt=null;
  const run=(fn,delay)=>{try{fn(delay);plays++;lastPlayAt=ctx?.currentTime??null;lastError='';}catch(e){lastError=String(e?.message||e);}};
  function play(fn){
    if(!ready())return false;
    const g=gen;
    if(running()){run(fn,0);return true;}
    const asked=now();
    wake().then(ok=>{if(ok&&g===gen&&!muted&&!hidden())run(fn,now()-asked);});
    return true;
  }
  function debug(){
    return {status:status(),state:ctx?.state||'none',currentTime:ctx?.currentTime??null,unlocked,muted,hidden:hidden(),
      busGain:current?.gain?.value??null,busLive:Boolean(current),gen,plays,lastPlayAt,lastError};
  }
  // A recording listens to every bus through tap, so it hears the machine and nothing else.
  let tap=null;
  function bus(){const g=ctx.createGain();g.gain.value=volume;g.connect(ctx.destination);if(tap?.ctx===ctx)g.connect(tap.node);return g;}
  // An idle graph sends the tap no samples, so the recorded audio would start late; a constant source far below
  // hearing keeps it flowing for the whole recording until releaseCapture().
  function captureStream(){
    const c=context();if(!c?.createMediaStreamDestination)return null;
    if(tap?.ctx!==c)tap={ctx:c,node:c.createMediaStreamDestination(),hold:null};
    if(!tap.hold&&c.createConstantSource){try{const s=c.createConstantSource();s.offset.value=1e-5;s.connect(tap.node);s.start();tap.hold=s;}catch{}}
    return tap.node.stream;
  }
  function releaseCapture(){if(!tap?.hold)return;try{tap.hold.stop();tap.hold.disconnect();}catch{}tap.hold=null;}
  function noiseBuffer(){
    if(!noise){const len=Math.floor(ctx.sampleRate*0.6);noise=ctx.createBuffer(1,len,ctx.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=random()*2-1;}
    return noise;
  }
  function envelope(g,t,peak,dur,attack=0.004){g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+attack);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);}
  function burst(out,t,dur,freq,{q=1,gain=0.5,type='bandpass',to=0}={}){
    const s=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    s.buffer=noiseBuffer();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(freq,t);
    if(to)f.frequency.exponentialRampToValueAtTime(to,t+dur);
    envelope(g,t,gain,dur);s.connect(f);f.connect(g);g.connect(out);
    s.start(t,random()*0.5);s.stop(t+dur+0.02);
  }
  function tone(out,t,freq,dur,{type='sine',gain=0.3,attack=0.005,to=0}={}){
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);if(to)o.frequency.exponentialRampToValueAtTime(to,t+dur);
    envelope(g,t,gain,dur,attack);o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+0.02);
  }
  function hum(out,t,end){
    const o=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(94,t);f.type='lowpass';f.frequency.value=300;
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.1,t+0.08);g.gain.setValueAtTime(0.1,end);g.gain.exponentialRampToValueAtTime(0.0001,end+0.12);
    o.connect(f);f.connect(g);g.connect(out);o.start(t);o.stop(end+0.15);
  }
  function chaChing(out,t){
    burst(out,t,0.12,380,{type:'lowpass',gain:0.7});
    tone(out,t,170,0.1,{type:'triangle',gain:0.35,to:80});
    for(const [at,f] of [[0.1,1319],[0.1,2637],[0.24,1760],[0.24,3520]])tone(out,t+at,f,0.9,{gain:f>2000?0.1:0.26,attack:0.002});
  }
  function blip(out,t){tone(out,t,660,0.09,{type:'square',gain:0.12});tone(out,t+0.16,440,0.12,{type:'square',gain:0.12});}
  function stop(){
    gen++;
    if(!current)return;
    const g=current,c=ctx;current=null;
    try{g.gain.cancelScheduledValues(c.currentTime);g.gain.setTargetAtTime(0.0001,c.currentTime,0.03);}catch{}
    setTimeout(()=>{try{g.disconnect();}catch{}},400);
  }
  // The paper timeline from printSchedule ({times,durs,kinds}), or `lines` evenly spaced `step` ms apart.
  const timeline=({times,durs,kinds,lines,step})=>times?{times,durs,kinds:kinds||[]}:{times:Array.from({length:lines||0},(_,i)=>i*step),durs:Array.from({length:lines||0},()=>step),kinds:[]};
  // warm: warm-up ms before the feed; offset: ms since the job started; outcome: 'sale', 'error' or '';
  // tearAfter: ms after the feed ends to rip the paper, or null. Returns the number of print-head bursts due.
  function print({warm=0,offset=0,outcome='',tearAfter=null,...paper}){
    const line=timeline(paper);
    const finite=[...line.times,...line.durs,warm,offset].every(Number.isFinite);
    if(!finite){lastError='print timeline has non-numeric times';return 0;}
    if(!line.times.length||!ready())return 0;
    stop();
    const skip=Math.max(0,offset-warm),due=chatterTimes(line).filter(t=>t>=skip).length;
    play(delay=>schedule({line,warm,offset:offset+delay,outcome,tearAfter}));
    return due;
  }
  function warmUp(out,t0,warm,skip){
    const left=warm-skip;if(left<=0)return;
    const o=ctx.createOscillator(),f=ctx.createBiquadFilter(),g=ctx.createGain(),end=t0+left;
    o.type='sawtooth';o.frequency.setValueAtTime(40+54*skip/warm,t0);o.frequency.exponentialRampToValueAtTime(94,end);
    f.type='lowpass';f.frequency.value=260;
    g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.07,end);
    o.connect(f);f.connect(g);g.connect(out);o.start(t0);o.stop(end+0.05);
    [0,1,2].forEach((k,n)=>{const at=k-skip;if(at>=0&&at<left)tone(out,t0+at,784+n*196,0.07,{type:'square',gain:0.06});});
    for(const ms of keyTicks(warm*1000)){const at=ms/1000-skip;if(at>=0)burst(out,t0+at,0.012,5200+random()*800,{q:8,gain:0.08});}
    const flash=warm-KEY_FLASH_MS/1000-skip;if(flash>=0)tone(out,t0+flash,1568,0.05,{type:'square',gain:0.05});
  }
  function rip(out,t){
    burst(out,t,0.42,450,{q:0.9,gain:0.6,to:5200});
    for(let k=0;k<6;k++)burst(out,t+0.04+k*0.055+random()*0.02,0.03,1800+random()*2500,{q:3,gain:0.3});
  }
  function schedule({line,warm,offset,outcome,tearAfter}){
    const out=bus();current=out;
    const now0=ctx.currentTime+0.02,w=warm/1000,o=Math.max(0,offset)/1000;
    warmUp(out,now0,w,Math.min(o,w));
    const feed=line.times.reduce((m,t,i)=>Math.max(m,t+line.durs[i]),0)/1000;
    const t0=now0+Math.max(0,w-o),skip=Math.max(0,o-w),left=Math.max(0,feed-skip);
    if(skip<0.2)burst(out,t0,0.32,700,{q:0.8,gain:0.4,to:2600});
    if(left>0)hum(out,t0,t0+left);
    const ticks=chatterTimes(line);
    ticks.forEach((ms,k)=>{
      const at=ms/1000-skip;if(at<0)return;
      const gap=((ticks[k+1]??ms+60)-ms)/1000;
      burst(out,t0+at,Math.min(0.045,gap*0.8),2400+random()*1600,{q:4,gain:0.45});
      if(gap>0.06)burst(out,t0+at+gap*0.5,0.02,3600+random()*900,{q:6,gain:0.2});
    });
    if(outcome==='sale')chaChing(out,t0+left+0.06);
    else if(outcome==='error')blip(out,t0+left+0.06);
    if(tearAfter!=null)rip(out,t0+left+tearAfter/1000);
  }
  function error(){return play(()=>blip(bus(),ctx.currentTime+0.02));}
  function tear(){return play(()=>rip(bus(),ctx.currentTime+0.02));}
  // A key press: its own bus, so the print that follows does not cut it off.
  function click(){return play(()=>{const out=bus(),t=ctx.currentTime+0.01;burst(out,t,0.018,4200,{q:5,gain:0.5});tone(out,t,1900,0.03,{type:'square',gain:0.05});});}
  function setMuted(value){
    muted=Boolean(value);
    try{storage?.setItem(SOUND_KEY,muted?'off':'on');}catch{}
    if(muted)stop();else unlock();
    changed();
  }
  // 'off' when muted, 'on' when the context runs, 'locked' when a click is still needed to start audio.
  const status=()=>muted?'off':unlocked&&running()?'on':'locked';
  return {unlock,print,error,tear,click,stop,setMuted,debug,captureStream,releaseCapture,captureNode:()=>tap?.node||null,get status(){return status();},get muted(){return muted;},get unlocked(){return unlocked;},get context(){return ctx;}};
}
