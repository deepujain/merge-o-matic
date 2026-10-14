// Draws the MERGE-O-MATIC 40 and its paper onto a fixed 1080x1920 canvas for Record & Print, from the same print
// job the page animates, so the video matches the page and its sound. The paper comes out of the slot bottom first,
// the footer leading and the header printing last. The machine and every line printed so far are always fully in
// frame: the whole stage scales down smoothly as the paper grows.
import {jobPhase,receiptLayout,paintRows,feedState,PAPER,KEY_CHASE_MS,KEY_CYCLE_MS,KEY_FLASH_MS} from './receipt.js';

export const VIDEO={width:1080,height:1920,marginX:54,marginY:96};
// Stage units match the page's CSS pixels: the machine is 460 wide and 154 tall, the paper 380 wide.
export const STAGE={width:460,machine:154,teeth:13,paperTop:156,paperWidth:380,shadow:12};
const UI_MONO='ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const baseScale=(v=VIDEO)=>(v.width-2*v.marginX)/STAGE.width;
export const availableHeight=(v=VIDEO)=>(v.height-2*v.marginY)/baseScale(v);
export const fitScale=(avail,content)=>content>0?Math.min(1,avail/content):1;
// Eases toward the fit a moment ahead (so the stage starts shrinking before the paper needs it) but never above
// the fit for what is printed now, so nothing is ever cut off.
export function easeScale(prev,{now,ahead},dt,tau=220){
  if(prev==null||!Number.isFinite(prev))return now;
  const k=1-Math.exp(-Math.max(0,dt)/tau),target=Math.min(now,ahead);
  return Math.min(now,prev+(target-prev)*k);
}
// The torn slip drops and twists like the page's rc-tear animation (1 s): x, y in stage units, r in degrees.
const TEAR=[[0,0,0,0],[.12,0,5,.7],[.28,2,-3,-.5],[1,12,34,-2.8]];
export function tearPose(ms,tilt=1){
  const p=Math.max(0,Math.min(1,ms/1000));
  for(let i=1;i<TEAR.length;i++){
    const [t0,x0,y0,r0]=TEAR[i-1],[t1,x1,y1,r1]=TEAR[i];
    if(p<=t1){const k=(p-t0)/(t1-t0),e=1-(1-k)**2;return {x:x0+(x1-x0)*e,y:y0+(y1-y0)*e,r:(r0+(r1-r0)*e)*tilt};}
  }
  return {x:12,y:34,r:-2.8*tilt};
}
// Stage height of the machine plus the paper shown at `ph`: fed rows, and after the tear the slip's drop.
export function stageHeight(ph,job,layout){
  if(!ph||ph.phase==='warming'||!job||!layout)return STAGE.machine+STAGE.teeth;
  const k=STAGE.paperWidth/layout.W,h=feedState(job,ph.paper,layout).height*k;
  const drop=ph.phase==='torn'?14+Math.max(0,tearPose(ph.tornFor||0).y)+10:0;
  return STAGE.paperTop+h+drop+STAGE.shadow;
}

function rrect(g,x,y,w,h,r){
  const [tl,tr,br,bl]=Array.isArray(r)?r:[r,r,r,r];
  g.beginPath();g.moveTo(x+tl,y);g.lineTo(x+w-tr,y);g.arcTo(x+w,y,x+w,y+tr,tr);g.lineTo(x+w,y+h-br);g.arcTo(x+w,y+h,x+w-br,y+h,br);
  g.lineTo(x+bl,y+h);g.arcTo(x,y+h,x,y+h-bl,bl);g.lineTo(x,y+tl);g.arcTo(x,y,x+tl,y,tl);g.closePath();
}
function spaced(g,text,x,y,spacing){
  if('letterSpacing' in g){g.letterSpacing=`${spacing}px`;g.fillText(text,x,y);const w=g.measureText(text).width;g.letterSpacing='0px';return w;}
  let at=x;for(const ch of text){g.fillText(ch,at,y);at+=g.measureText(ch).width+spacing;}return at-x;
}
function spacedWidth(g,text,spacing){
  if('letterSpacing' in g){g.letterSpacing=`${spacing}px`;const w=g.measureText(text).width;g.letterSpacing='0px';return w;}
  let w=0;for(const ch of text)w+=g.measureText(ch).width+spacing;return w;
}
const blink=(t,period)=>(t%period)<period/2;
const KEYS=[['k1','#34d399'],['k2','#60a5fa'],['k3','#fbbf24'],['k4','#f87171'],['k6','#ede9fe'],['k7','#ede9fe'],['k8','#ede9fe'],['k5','#c4b5fd']];

// snap: what the page shows right now. phase: the machine class (idle, loading, warming, printing, ready, empty,
// error), lcd and sub: the LCD lines, progress: 0 to 1 for the LCD bar or null, key: {disabled, pressed},
// sound: on, off or locked, t: a clock in ms for blinking.
export function drawMachine(g,snap,{recording=true}={}){
  const t=snap.t||0,W=STAGE.width,H=STAGE.machine,phase=snap.phase||'idle';
  g.save();
  if(phase==='printing'){const s=Math.floor(t/37)%4,d=[[.7,-.4],[-.6,.3],[.4,.5],[0,0]][s];g.translate(d[0],d[1]);}
  g.save();g.shadowColor='#2e1065aa';g.shadowBlur=30;g.shadowOffsetY=18;
  rrect(g,0,0,W,H,[30,30,18,18]);
  const body=g.createLinearGradient(0,0,W*.45,H*1.6);
  body.addColorStop(0,'#a78bfa');body.addColorStop(.35,'#8b5cf6');body.addColorStop(.75,'#6d28d9');body.addColorStop(1,'#4c1d95');
  g.fillStyle=body;g.fill();g.restore();
  g.save();rrect(g,0,0,W,H,[30,30,18,18]);g.clip();
  const shine=g.createRadialGradient(W*.2,0,0,W*.2,0,W*.62);shine.addColorStop(0,'#c4b5fdcc');shine.addColorStop(1,'#c4b5fd00');g.fillStyle=shine;g.fillRect(0,0,W,H);
  const gloss=g.createLinearGradient(0,6,0,16);gloss.addColorStop(0,'#ffffff55');gloss.addColorStop(1,'#ffffff00');rrect(g,24,6,W-48,10,5);g.fillStyle=gloss;g.fill();
  const mouth=g.createLinearGradient(0,H-28,0,H);mouth.addColorStop(0,'#4c1d95');mouth.addColorStop(1,'#2e1065');g.fillStyle=mouth;g.fillRect(0,H-28,W,28);
  g.restore();
  // Nameplate, with the REC dot while recording.
  g.textBaseline='middle';g.font=`800 11px ${UI_MONO}`;
  const plateText='MERGE-O-MATIC ',plateNum='40',sp=11*.24;
  const pw=spacedWidth(g,plateText,sp)+spacedWidth(g,plateNum,sp)+(recording?48:0);
  rrect(g,20,16,pw+22,25,8);g.fillStyle='#2e106540';g.fill();
  g.fillStyle='#f5f3ff';let x=31+spaced(g,plateText,31,29,sp);g.fillStyle='#6ee7b7';x+=spaced(g,plateNum,x,29,sp);
  if(recording){
    const on=blink(t,1100);g.globalAlpha=on?1:.3;g.fillStyle='#ef4444';g.shadowColor='#ef4444';g.shadowBlur=6;
    g.beginPath();g.arc(x+8,29,3.5,0,Math.PI*2);g.fill();g.shadowBlur=0;g.globalAlpha=1;
    g.font=`800 9px ${UI_MONO}`;g.fillStyle='#fecaca';spaced(g,'REC',x+15,29.5,9*.14);
  }
  // Right cluster, laid out from the right edge: LED, PWR, speaker, PRINT.
  const led={idle:'#34d399',ready:'#34d399',empty:'#fbbf24',warming:'#fde68a',printing:'#f5f3ff',loading:'#f5f3ff',error:'#f87171'}[phase]||'#1e1036';
  const ledOn=phase==='printing'||phase==='loading'?blink(t,500):phase==='warming'?blink(t,600):phase==='error'?blink(t,1100):true;
  g.beginPath();g.arc(W-26,28.5,6,0,Math.PI*2);g.fillStyle='#2e1065';g.fill();
  g.beginPath();g.arc(W-26,28.5,5,0,Math.PI*2);g.fillStyle=led;g.globalAlpha=ledOn?1:.25;g.shadowColor=led;g.shadowBlur=ledOn&&led!=='#1e1036'?12:0;g.fill();g.globalAlpha=1;g.shadowBlur=0;
  g.font=`800 9.5px ${UI_MONO}`;const pwrW=spacedWidth(g,'PWR',9.5*.16);g.fillStyle='#ede9fe';spaced(g,'PWR',W-40-pwrW,29,9.5*.16);
  const mx=W-40-pwrW-8-4-26;rrect(g,mx,17.5,26,22,6);g.fillStyle='#2e106540';g.fill();
  const off=snap.sound==='off';g.strokeStyle=off?'#c4b5fd':snap.sound==='locked'?'#fde68a':'#f5f3ff';g.fillStyle=g.strokeStyle;g.lineWidth=1.4;g.globalAlpha=off?.75:1;
  g.beginPath();g.moveTo(mx+8,26);g.lineTo(mx+10.5,26);g.lineTo(mx+14,23);g.lineTo(mx+14,34);g.lineTo(mx+10.5,31);g.lineTo(mx+8,31);g.closePath();g.fill();
  if(off){g.beginPath();g.moveTo(mx+16.5,25.5);g.lineTo(mx+21,31.5);g.moveTo(mx+21,25.5);g.lineTo(mx+16.5,31.5);g.stroke();}
  else{g.beginPath();g.arc(mx+14.5,28.5,3.5,-.9,.9);g.stroke();g.beginPath();g.arc(mx+14.5,28.5,6.5,-.9,.9);g.stroke();}
  g.globalAlpha=1;
  g.font=`800 9.5px ${UI_MONO}`;const kw=spacedWidth(g,'PRINT',9.5*.16),px=mx-8-(8+13+6+kw+10),dis=snap.key?.disabled,pressed=snap.key?.pressed;
  g.save();if(pressed)g.translate(0,1);
  rrect(g,px,17.5,8+13+6+kw+10,22,6);g.fillStyle='#2e106540';g.fill();
  if(!dis&&(phase==='idle'||phase==='ready'||phase==='empty')){const glow=phase==='idle'?.5+.5*Math.sin(t/1600*Math.PI*2):1;g.strokeStyle='#6ee7b7';g.lineWidth=1.5;g.shadowColor='#34d399';g.shadowBlur=8+6*glow;g.stroke();g.shadowBlur=0;}
  g.globalAlpha=dis?.55:1;const ink=dis?'#c4b5fd':'#f5f3ff';g.strokeStyle=ink;g.fillStyle=ink;g.lineWidth=1.3;
  const ix=px+8,iy=22;g.strokeRect(ix+3,iy+.5,7,3.5);rrect(g,ix+.5,iy+4,12,5.5,1.5);g.stroke();g.strokeRect(ix+3,iy+8,7,4);
  spaced(g,'PRINT',ix+19,29,9.5*.16);g.restore();g.globalAlpha=1;
  // LCD.
  const lx=20,ly=53,lw=W-20-93-16-20,lh=57,tone=phase==='empty'?['#fcd34d','#fbbf24']:phase==='error'?['#fca5a5','#f87171']:['#86efac','#4ade80'];
  rrect(g,lx,ly,lw,lh,10);const lcd=g.createLinearGradient(0,ly,0,ly+lh);lcd.addColorStop(0,'#0a2618');lcd.addColorStop(1,'#0f3a26');g.fillStyle=lcd;g.fill();g.lineWidth=2;g.strokeStyle='#2e1065';g.stroke();
  g.save();rrect(g,lx+2,ly+2,lw-4,lh-4,8);g.clip();
  g.font=`700 15px ${UI_MONO}`;g.fillStyle=tone[0];g.shadowColor=tone[1];g.shadowBlur=7;spaced(g,snap.lcd||'',lx+15,ly+21,1.5);
  g.shadowBlur=0;
  if(snap.progress!=null){
    const bx=lx+15,by=ly+36,bw=lw-30;g.fillStyle='#052e1c';rrect(g,bx,by,bw,6,2);g.fill();
    g.fillStyle='#4ade80';const fill=bw*Math.max(0,Math.min(1,snap.progress));for(let d=0;d<fill;d+=8)g.fillRect(bx+d,by,Math.min(6,fill-d),6);
  }else if(snap.sub){g.font=`700 10.5px ${UI_MONO}`;g.fillStyle=tone[0]+'d0';spaced(g,snap.sub,lx+15,ly+40,1.26);}
  g.fillStyle='#00000038';for(let y=ly+2;y<ly+lh;y+=3)g.fillRect(lx,y,lw,1);
  g.restore();
  // Keypad.
  const kx=W-20-93,ky=ly+(lh-33)/2,we=snap.warm||0;
  KEYS.forEach(([name,color],i)=>{
    const col=i%4,row=Math.floor(i/4),x0=kx+col*25,y0=ky+row*20;let fill=color,lit=false,dim=false,dy=0;
    if(phase==='warming'){
      const at=((we-KEY_CHASE_MS[i])%KEY_CYCLE_MS+KEY_CYCLE_MS)%KEY_CYCLE_MS;
      if(row===1){lit=at<KEY_CYCLE_MS*.18;fill=lit?'#ffffff':'#a78bfa';}else{lit=at<KEY_CYCLE_MS*.26;dim=!lit;}
      if(we>(snap.warmTotal||3000)-KEY_FLASH_MS)lit=true,dim=false;
      if(lit)dy=1;
    }else if(phase==='printing'){if(name==='k1')dy=blink(t,1000)?2:0;else dim=blink(t+i*200,3200);}
    else if(phase==='ready'&&row===0)lit=true;
    g.save();g.translate(0,dy);rrect(g,x0,y0+2,18,13,4);g.fillStyle='#2e1065';g.fill();
    rrect(g,x0,y0,18,13,4);g.fillStyle=fill;if(lit){g.shadowColor='#ffffff';g.shadowBlur=9;}g.globalAlpha=dim?.72:1;g.fill();g.shadowBlur=0;g.globalAlpha=1;
    g.fillStyle='#00000022';g.fillRect(x0+2,y0+10,14,3);g.restore();
  });
  // Slot and print head.
  const sx=15,sy=H-18,sw=W-30;rrect(g,sx,sy,sw,8,5);g.fillStyle='#05020d';g.fill();
  if(phase==='printing'||phase==='warming'){
    const k=phase==='warming'?.5:(Math.sin(t/340*Math.PI)+1)/2;g.globalAlpha=phase==='warming'?.2+.6*(Math.sin(t/750*Math.PI)+1)/2:1;
    g.fillStyle='#6ee7b7';g.shadowColor='#34d399';g.shadowBlur=8;rrect(g,sx+4+k*(sw-28),sy+2,20,4,2);g.fill();g.shadowBlur=0;g.globalAlpha=1;
  }
  g.restore();
}
// Optional page heading above the machine, from the host's videoTitle(). Two kinds, both in em units of the heading:
//   {kind:'tiles',font,weight,edge,width,height,items:[{ch,x,w,h,color,ring,ink,border,r,shape,o}]}: letter tiles,
//     x from the left of the word; shape is rect, round, circle, oct, arch or dash; o marks the O, and pumpkin draws
//     it as a ribbed jack-o'-lantern with a stem, a leaf and a carved, candle-lit face.
//   {kind:'text',text,o,font,weight,color,rec,colors,tilts}: a heading in one line; o is the index of the O letter.
//     With colors (one per character) each letter is drawn in its own colour, turned by tilts degrees.
// The O pulses red, since the video only runs while recording. Without a title the stage is unchanged.
export const TITLE_GAP=24;
const TITLE_W=STAGE.width-12;
/** @returns {{F:number,h:number}|null} F: the heading's font size in stage units; h: its band height. */
export function titleBand(spec){
  if(spec?.kind==='tiles'&&spec.width>0&&spec.height>0){const F=Math.min(spec.maxSize||30,TITLE_W/spec.width);return {F,h:spec.height*F*1.14};}
  if(spec?.kind==='text'&&spec.text)return {F:spec.size||40,h:(spec.size||40)*1.3};
  return null;
}
export const titleSpace=spec=>{const band=titleBand(spec);return band?band.h+TITLE_GAP:0;};
const clamp01=v=>Math.max(0,Math.min(1,v));
const backOut=p=>{const c1=1.70158,c3=c1+1;return 1+c3*(p-1)**3+c1*(p-1)**2;};
const pulse=t=>(Math.sin(t/1500*Math.PI*2-Math.PI/2)+1)/2;
function tilePath(g,shape,w,h,inset,F){
  const x=-w/2+inset,y=-h/2+inset,iw=Math.max(0,w-2*inset),ih=Math.max(0,h-2*inset);
  if(shape==='circle'||shape==='round'){g.beginPath();g.ellipse(0,0,iw/2,ih/2,0,0,Math.PI*2);return;}
  if(shape==='oct'){
    const cx=iw*.18,cy=ih*.18;g.beginPath();g.moveTo(x+cx,y);g.lineTo(x+iw-cx,y);g.lineTo(x+iw,y+cy);g.lineTo(x+iw,y+ih-cy);
    g.lineTo(x+iw-cx,y+ih);g.lineTo(x+cx,y+ih);g.lineTo(x,y+ih-cy);g.lineTo(x,y+cy);g.closePath();return;
  }
  const r=Math.max(0,(shape==='dash'?Math.min(h/2,.25*F):.38*F)-inset);
  if(shape==='arch'){const b=Math.max(0,Math.min(iw/2,ih*.45));rrect(g,x,y,iw,ih,[Math.max(0,.3*F-inset),Math.max(0,.3*F-inset),b,b]);return;}
  rrect(g,x,y,iw,ih,Math.min(r,iw/2,ih/2));
}
// The Halloween O, drawn from the same geometry as the page's inline pumpkin (index.html): five ribbed lobes on a 120 by
// 110 grid centred on (60,62), a ribbed edge, a stem with a curl and a leaf, and a carved face lit from inside. While
// recording the candle burns ember red.
const JACK_LOBES=[[32,63,26,33],[88,63,26,33],[46,62,22,36],[74,62,22,36],[60,62,17,37]];
const JACK_FACE='M34 53 L50 53 L43 38 Z M70 53 L86 53 L77 38 Z M56 63 L64 63 L60 56 Z M29 67 L40 71 L44 71 L44 77 L50 77 L50 72.5 L70 72.5 L70 77 L76 77 L76 71 L80 71 L91 67 C87 84 73 91 64 91 L64 85 L56 85 L56 91 C47 91 33 84 29 67 Z';
const JACK_STEM='M55 31 C54 23 57 16 63 11 L68 14 C63 18 62 24 63 31 Z',JACK_LEAF='M55 26 C47 16 37 18 34 25 C42 31 50 31 55 26 Z',JACK_CURL='M64 17 C70 10 79 12 78 18 C77 23 70 22 71 18';
const path2d=d=>typeof Path2D==='function'?new Path2D(d):null;
function drawJack(g,w,edge,t,rec){
  const u=w/108,k=pulse(t),lobes=()=>{g.beginPath();for(const [x,y,rx,ry] of JACK_LOBES){g.moveTo(x+rx,y);g.ellipse(x,y,rx,ry,0,0,Math.PI*2);}};
  g.save();g.scale(u,u);g.translate(-60,-62);g.lineJoin='round';g.lineCap='round';
  if(rec){g.save();g.shadowColor='#ef4444';g.shadowBlur=(14+16*k)*u*2;lobes();g.fillStyle='#ef444466';g.fill();g.restore();}
  lobes();g.lineWidth=8;g.strokeStyle=edge;g.stroke();
  lobes();g.lineWidth=3.6;g.strokeStyle='#fed7aa';g.stroke();
  const skin=g.createRadialGradient(48,44,0,48,44,66);
  skin.addColorStop(0,rec?'#fb923c':'#fdba74');skin.addColorStop(.5,rec?'#ea580c':'#f97316');skin.addColorStop(1,rec?'#7f1d1d':'#c2410c');
  for(const [x,y,rx,ry] of JACK_LOBES){g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=skin;g.fill();g.lineWidth=1.6;g.strokeStyle='#9a3412';g.stroke();}
  g.beginPath();g.moveTo(46,30);g.bezierCurveTo(38,46,38,80,46,94);g.moveTo(74,30);g.bezierCurveTo(82,46,82,80,74,94);g.lineWidth=1.6;g.strokeStyle='#9a341280';g.stroke();
  const leaf=path2d(JACK_LEAF),stem=path2d(JACK_STEM),curl=path2d(JACK_CURL),face=path2d(JACK_FACE);
  if(leaf&&stem&&curl){g.fillStyle='#65a30d';g.fill(leaf);g.lineWidth=1.8;g.strokeStyle=edge;g.stroke(leaf);
    g.fillStyle='#4d7c0f';g.fill(stem);g.lineWidth=2;g.stroke(stem);g.lineWidth=2.2;g.strokeStyle='#65a30d';g.stroke(curl);}
  if(face){
    const candle=g.createRadialGradient(60,64,0,60,64,34);
    candle.addColorStop(0,rec?'#fff1f0':'#fffbe0');candle.addColorStop(.55,rec?'#f87171':'#fde047');candle.addColorStop(1,rec?'#dc2626':'#f59e0b');
    g.save();g.shadowColor=rec?'#ef4444':'#fde047';g.shadowBlur=(8+6*k)*u*2;g.fillStyle=candle;g.fill(face);g.restore();
    g.lineWidth=1.6;g.strokeStyle='#7c2d12';g.stroke(face);
  }
  g.restore();
}
function drawTile(g,it,F,spec,t,rec){
  if(it.pumpkin)return drawJack(g,it.w*F,spec.edge||'#1f1147',t,rec);
  const w=it.w*F,h=it.h*F,dash=it.shape==='dash',edge=it.border||spec.edge||'#1f1147';
  const color=rec?(it.pumpkin?'#dc2626':'#ef4444'):it.color,ring=rec?'#fee2e2':it.ring;
  tilePath(g,it.shape,w,h,0,F);g.save();g.translate(0,.1*F);g.fillStyle='#1f114755';g.fill();g.restore();
  if(rec){const k=pulse(t);g.save();g.shadowColor='#ef4444';g.shadowBlur=(10+14*k)*F/30;tilePath(g,it.shape,w+(.2+.08*k)*F,h+(.2+.08*k)*F,0,F);g.fillStyle=k>.5?'#f87171':'#fca5a5';g.fill();g.restore();}
  tilePath(g,it.shape,w,h,0,F);g.fillStyle=edge;g.fill();
  const b=Math.max(1.5,(dash?.07:.09)*F);
  if(!dash){tilePath(g,it.shape,w,h,b,F);g.fillStyle=ring;g.fill();}
  tilePath(g,it.shape,w,h,dash?b:b+Math.max(1.5,.11*F),F);g.fillStyle=color;g.fill();
  if(it.ch){
    g.font=`${spec.weight||700} ${F}px ${spec.font||'Rockwell, serif'}`;g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';
    g.lineWidth=.16*F;g.strokeStyle=edge;g.strokeText(it.ch,0,.04*F);g.fillStyle=it.ink||'#fff';g.fillText(it.ch,0,.04*F);g.textAlign='left';
  }
}
// t: ms since the stage started, for the load-in pop, an idle wiggle now and then, and the O's recording pulse.
export function drawTitle(g,spec,band,t){
  if(!spec||!band)return;
  const {F,h}=band;
  g.save();
  if(spec.kind==='tiles'){
    const x0=(STAGE.width-spec.width*F)/2,n=spec.items.length,beat=Math.floor(t/3200),wig=(beat*5+3)%n,wp=(t%3200)/650;
    spec.items.forEach((it,i)=>{
      const p=clamp01((t-i*66)/420);if(p<=0)return;
      let r=it.r||0;
      if(it.o)r+=pulse(t)*-3;
      else if(i===wig&&wp<1&&it.shape!=='dash'&&t>1400)r+=Math.sin(wp*Math.PI*3)*(1-wp)*9;
      const s=(.3+.7*backOut(p))*(it.o?1+.06*pulse(t):1);
      g.save();g.globalAlpha=clamp01(p/.6);
      g.translate(x0+(it.x+it.w/2)*F,h/2+(1-clamp01(p/.6))*-.7*F);g.rotate(r*Math.PI/180);g.scale(s,s);
      drawTile(g,it,F,spec,t,Boolean(it.o));g.restore();
    });
  }else{
    const text=String(spec.text),o=Number.isInteger(spec.o)?spec.o:-1;
    let size=F;g.font=`${spec.weight||800} ${size}px ${spec.font||'system-ui, sans-serif'}`;
    const sp=-.02*size,full=spacedWidth(g,text,sp);
    if(full>TITLE_W){size*=TITLE_W/full;g.font=`${spec.weight||800} ${size}px ${spec.font||'system-ui, sans-serif'}`;}
    const parts=o>=0?[text.slice(0,o),text[o],text.slice(o+1)]:[text,'',''],sp2=-.02*size;
    const widths=parts.map(s=>spacedWidth(g,s,sp2)),p=clamp01(t/450),k=pulse(t);
    g.globalAlpha=clamp01(p/.6);g.textBaseline='middle';
    g.translate(STAGE.width/2,h/2+(1-backOut(p))*-.3*size);g.scale(.85+.15*backOut(p),.85+.15*backOut(p));
    let x=-(widths[0]+widths[1]+widths[2])/2;
    const colors=Array.isArray(spec.colors)&&spec.colors.length===text.length?spec.colors:null;
    if(colors){
      [...text].forEach((ch,i)=>{
        const w=g.measureText(ch).width,isO=i===o,s=isO?1+.08*k:1,tilt=(Number(spec.tilts?.[i])||0)*Math.PI/180;
        g.save();g.translate(x+w/2,0);g.rotate(tilt);g.scale(s,s);g.fillStyle=isO?spec.rec||'#dc2626':colors[i]||spec.color||'#1f1b2e';
        if(isO){g.shadowColor='#ef4444';g.shadowBlur=(6+12*k)*size/40;}
        g.fillText(ch,-w/2,0);g.restore();x+=w+sp2;
      });
      g.restore();return;
    }
    g.fillStyle=spec.color||'#1f1b2e';spaced(g,parts[0],x,0,sp2);x+=widths[0];
    if(parts[1]){
      g.save();g.translate(x+widths[1]/2,0);g.scale(1+.08*k,1+.08*k);g.fillStyle=spec.rec||'#dc2626';g.shadowColor='#ef4444';g.shadowBlur=(6+12*k)*size/40;
      spaced(g,parts[1],-widths[1]/2,0,sp2);g.restore();x+=widths[1];
    }
    g.fillStyle=spec.color||'#1f1b2e';spaced(g,parts[2],x,0,sp2);
  }
  g.restore();
}
function drawTeeth(g,cx,y,w){
  const grad=g.createLinearGradient(0,y,0,y+13);grad.addColorStop(0,'#f3f4f6');grad.addColorStop(.7,'#9ca3af');grad.addColorStop(1,'#6b7280');
  g.beginPath();g.moveTo(cx-w/2+3,y);g.lineTo(cx+w/2-3,y);g.lineTo(cx+w/2,y+6);
  for(let x=cx+w/2;x>cx-w/2;x-=8){g.lineTo(x-4,y+13);g.lineTo(x-8,y+6);}
  g.closePath();g.fillStyle=grad;g.fill();
}
function zigzag(g,x,y,w,size,down){
  g.beginPath();g.moveTo(x,y);for(let at=x;at<x+w;at+=size){g.lineTo(at+size/2,y+(down?size/2:-size/2));g.lineTo(at+size,y);}g.lineTo(x+w,y);g.closePath();
}

// The video stage. snapshot() returns the page's state each frame: {phase, lcd, sub, progress, key, sound, warm,
// warmTotal, job, rows, now}. title: an optional heading spec (see drawTitle) drawn above the machine; the stage
// fits title, machine and paper together. Returns the canvas track to record and stop() to end the loop.
export function createVideoStage({doc=document,raf=globalThis.requestAnimationFrame?.bind(globalThis),caf=globalThis.cancelAnimationFrame?.bind(globalThis),
  clock=()=>performance.now(),snapshot,background='#0b0d14',fps=60,video=VIDEO,title=null}={}){
  const canvas=doc.createElement('canvas');canvas.width=video.width;canvas.height=video.height;
  const g=canvas.getContext('2d',{alpha:false});
  const base=baseScale(video),avail=availableHeight(video),band=titleBand(title),top=band?band.h+TITLE_GAP:0,t0=clock();
  // done: the first row of the finished block painted into the cache; rows print bottom first, so it counts down.
  let rows=null,layout=null,cache=null,cg=null,cs=1,done=0,scale=null,last=null,handle=0,live=true;
  function prepare(next){
    rows=next;layout=null;cache=null;done=rows?.length||0;if(!rows)return;
    layout=receiptLayout(g,rows);cs=Math.min(2.2,32000/layout.H);
    cache=doc.createElement('canvas');cache.width=Math.ceil(layout.W*cs);cache.height=Math.ceil(layout.H*cs);
    cg=cache.getContext('2d');cg.setTransform(cs,0,0,cs,0,0);cg.fillStyle=PAPER;cg.fillRect(0,0,layout.W,layout.H);
  }
  function drawPaper(ph,job,t){
    const k=STAGE.paperWidth/layout.W,st=feedState(job,ph.paper,layout),torn=ph.phase==='torn';
    for(;done>0&&st.fed[done-1]>=1&&st.ink[done-1]>=1;done--)paintRows(cg,rows,layout,{from:done-1,to:done});
    const cx=STAGE.width/2,tilt=Math.min(1,60/rows.length),pose=torn?tearPose(ph.tornFor||0,tilt):{x:0,y:0,r:0};
    g.save();
    if(ph.phase==='printing'&&Math.floor(t/100)%2)g.translate(.5,0);else if(ph.phase==='printing')g.translate(-.5,0);
    g.translate(cx+pose.x,STAGE.paperTop+(torn?14:0)+pose.y);g.rotate(pose.r*Math.PI/180);g.scale(k,k);g.translate(-layout.W/2,0);
    const h=st.height,r=16/k;
    g.save();g.shadowColor='#1b124666';g.shadowBlur=14*k*base*(scale||1);g.shadowOffsetY=8*k*base*(scale||1);
    rrect(g,0,0,layout.W,h,[0,0,r,r]);g.fillStyle=PAPER;g.fill();g.restore();
    // The row feeding sits at the top of the paper, right under the slot, and the finished rows hang below it.
    const cur=done-1,feeding=cur>=0&&st.fed[cur]>0?layout.heights[cur]*st.fed[cur]:0,below=layout.pad+feeding;
    if(done<rows.length){
      const from=layout.tops[done],sy=Math.min(cache.height,from*cs);
      g.drawImage(cache,0,sy,cache.width,cache.height-sy,0,below,layout.W,layout.H-from);
    }
    if(feeding>0){
      g.save();g.beginPath();g.rect(0,layout.pad,layout.W,feeding);g.clip();g.translate(0,layout.pad-layout.tops[cur]);
      paintRows(g,rows,layout,{from:cur,to:cur+1,ink:st.ink[cur]});g.restore();
    }
    if(torn){zigzag(g,0,0,layout.W,14/k,true);g.fillStyle=background;g.fill();}
    g.restore();
    if(torn){g.save();g.translate(cx,STAGE.paperTop);g.fillStyle='#ffffff';g.beginPath();const w=STAGE.paperWidth;g.rect(-w/2,0,w,4);g.fill();zigzag(g,-w/2,4,w,10,true);g.fill();g.restore();}
  }
  function frame(){
    if(!live)return;
    const t=clock(),s=snapshot?.()||{};
    if(s.rows!==rows)prepare(s.rows||null);
    const job=s.job||null,now=s.now??Date.now(),ph=job?jobPhase(job,now):null,ahead=job?jobPhase(job,now+300):null;
    const fits={now:fitScale(avail,top+stageHeight(ph,job,layout)),ahead:fitScale(avail,top+stageHeight(ahead,job,layout))};
    scale=easeScale(scale,fits,last==null?0:t-last);last=t;
    g.setTransform(1,0,0,1,0,0);g.fillStyle=background;g.fillRect(0,0,video.width,video.height);
    const sc=base*scale;
    g.setTransform(sc,0,0,sc,(video.width-STAGE.width*sc)/2,video.marginY);
    if(band){drawTitle(g,title,band,t-t0);g.translate(0,top);}
    if(ph&&ph.phase!=='warming'&&layout)drawPaper(ph,job,t);
    drawMachine(g,{...s,t});
    drawTeeth(g,STAGE.width/2,STAGE.machine-2,STAGE.paperWidth+30);
    handle=raf?.(frame);
  }
  frame();
  const track=canvas.captureStream?.(fps).getVideoTracks()[0]||null;
  return {canvas,track,width:video.width,height:video.height,get scale(){return scale;},
    stop(){live=false;try{caf?.(handle);}catch{}}};
}
