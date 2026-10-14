// Regression: after a print, everything that folded into the O must come back. A later @keyframes with the same name as
// the bubble-out once left the subtitle, the form card and the T, music and i column invisible after every print.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=new URL('../web/',import.meta.url);
const read=name=>readFile(new URL(name,page),'utf8');

// The last @keyframes of a name wins, across every stylesheet the page loads.
function keyframes(css){
  const out=new Map(),re=/@keyframes ([\w-]+)\{/g;let m;
  while((m=re.exec(css))){
    let depth=1,i=re.lastIndex;
    for(;i<css.length&&depth;i++){if(css[i]==='{')depth++;else if(css[i]==='}')depth--;}
    out.set(m[1],[...(out.get(m[1])||[]),css.slice(re.lastIndex,i-1)]);re.lastIndex=i;
  }
  return out;
}
const lastFrame=body=>{const frames=[...body.matchAll(/(?:^|\})\s*([\d.%,\s]+|from|to)\{([^{}]*)\}/g)];return frames.at(-1)?.[2]||'';};

test('no two @keyframes share a name across page.css and the kit stylesheet',async()=>{
  const all=keyframes((await read('page.css'))+'\n'+(await read('kit/receipt.css')));
  const dupes=[...all].filter(([,bodies])=>bodies.length>1).map(([name])=>name);
  assert.deepEqual(dupes,[],`duplicate keyframes: ${dupes.join(', ')}`);
});

test('every element in the fold set is restored and focusable after the print completes',async()=>{
  const css=await read('page.css'),js=await read('page.js'),html=await read('index.html'),frames=keyframes(css+'\n'+(await read('kit/receipt.css')));
  const fold=js.match(/const folding=\(\)=>\[([^\]]+)\];/)?.[1].split(',').map(s=>s.trim());
  assert.deepEqual(fold,['topBar','sub','els.form','els.status'],'the fold set');
  assert.match(js,/topBar=document\.querySelector\('\.mom-top'\)/);
  const top=html.match(/<div class="mom-top"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||html.slice(html.indexOf('class="mom-top"'));
  for(const id of ['mom-style','mom-music','mom-info'])assert.ok(top.includes(`id="${id}"`),`${id} folds with .mom-top`);
  for(const el of ['.mom-top','#mom-sub','.mom-form','.mom-status'])assert.ok(css.includes(`:is(.mom-top,#mom-sub,.mom-form,.mom-status).is-bubbled`),el);

  // Bubbling back out clears the fold and makes the elements interactive again.
  assert.match(js,/el\.inert=on;el\.classList\.toggle\('is-gathered',on\);el\.classList\.toggle\('is-bubbled',!on\);/);
  assert.doesNotMatch(js,/(topBar|sub|els\.form|els\.status)\.setAttribute\('aria-hidden'/,'the fold never hides them from assistive tech');

  // Every bubble-out animation, with motion and without, ends fully visible.
  const rules=[...css.matchAll(/:is\(\.mom-top,#mom-sub,\.mom-form,\.mom-status\)(?:\.is-faded)?\.is-bubbled\{animation:([\w-]+)/g)].map(m=>m[1]);
  assert.ok(rules.length>=3,'motion, faded and reduced-motion bubble-outs');
  for(const name of rules){
    const bodies=frames.get(name);
    assert.ok(bodies,`@keyframes ${name} exists`);
    const body=bodies.at(-1);
    if(/(?:^|\})\s*(?:to|100%)\{/.test(body)){
      const end=lastFrame(body);
      assert.doesNotMatch(end,/opacity:0(?![.\d])/,`${name} must not end hidden`);
      if(/opacity/.test(end))assert.match(end,/opacity:1\b/,`${name} ends at full opacity`);
    }else assert.match(body,/^\s*from\{[^{}]*\}\s*$/,`${name} only animates from hidden, so it ends at the element's own style`);
  }
});

// Regression: a stray unclosed "@media (prefers-reduced-motion:no-preference){" once swallowed the rest of page.css, so
// with reduced motion on, the bat and witch drawings filled the heading and pushed the card a screen down.
test('every stylesheet the page loads has balanced braces and no nested motion query',async()=>{
  for(const name of ['page.css','kit/receipt.css']){
    const css=(await read(name)).replace(/\/\*[\s\S]*?\*\//g,'').replace(/"[^"]*"/g,'""');
    let depth=0,line=1,open=[];
    for(const c of css){if(c==='\n')line++;else if(c==='{'){depth++;open.push(line);}else if(c==='}'){depth--;open.pop();assert.ok(depth>=0,`${name}: extra } near line ${line}`);}}
    assert.equal(depth,0,`${name}: unclosed { opened on line ${open.join(', ')}`);
    assert.doesNotMatch(css,/@media \(prefers-reduced-motion:no-preference\)\{\s*@media/,`${name}: nested motion query`);
  }
});

// Regression: the T, music and i column overlapped the card in Normal, whose plain heading is shorter than the column.
test('the heading area is at least as tall as the button column, and the column becomes a row on narrow screens',async()=>{
  const css=await read('page.css');
  assert.match(css,/:root\{--mom-col-h:124px\}/);
  assert.match(css,/\.mom-intro\{min-height:calc\(var\(--mom-col-h\) - 10px\)\}/);
  const narrow=css.match(/@media \(max-width:720px\)\{([^{}]*\{[^{}]*\}[^{}]*\{[^{}]*\})\s*\}/)?.[1]||'';
  assert.match(narrow,/\.mom-top\{[^}]*flex-direction:row/);
  assert.match(narrow,/\.mom-intro\{min-height:0;padding-top:44px\}/);
});
