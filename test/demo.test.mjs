import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {STEPS} from '../web/demo-script.js';

const page=new URL('../web/',import.meta.url);
const demo=await readFile(new URL('demo.js',page),'utf8');
const words=text=>text.split(/\s+/).filter(Boolean).length;

test('the demo script is 300 to 400 words, about two to three minutes, and every step has an action',()=>{
  const total=STEPS.reduce((n,s)=>n+words(s.text),0);
  assert.ok(total>=300&&total<=400,`${total} words`);
  const ids=STEPS.map(s=>s.id);
  assert.equal(new Set(ids).size,ids.length,'unique step ids');
  for(const id of ids)assert.match(demo,new RegExp(`\\n    async ${id}\\(at`),`${id} has an action`);
  for(const s of STEPS)if(s.say)assert.ok(Math.abs(words(s.say)-words(s.text))<=4,`${s.id}: the voice reads the caption`);
  const all=STEPS.map(s=>s.text).join(' ');
  for(const feature of ['Try deepujain','NemoClaw','Week','PRINT','LCD','BAGGED BY','tax','CI TEND','Share','Download','Record','Crayon','Light and Dark','music','privacy','meter','link','Halloween'])
    assert.ok(all.includes(feature),`covers ${feature}`);
});

test('each step has a voice clip and its length, and they add up to two to three minutes',async()=>{
  const lengths=JSON.parse(await readFile(new URL('demo/voice/voice.json',page),'utf8'));
  assert.deepEqual(Object.keys(lengths),STEPS.map(s=>s.id));
  for(const s of STEPS){
    assert.ok(lengths[s.id]>1,`${s.id} lasts ${lengths[s.id]} s`);
    assert.ok((await stat(new URL(`demo/voice/${s.id}.m4a`,page))).size>4096,`${s.id}.m4a has audio`);
  }
  const total=Object.values(lengths).reduce((a,b)=>a+b,0);
  assert.ok(total>=100&&total<=180,`${total} s`);
});

test('the page loads the demo only for a demo flag, keeps the flags in the URL, and Hackathon Record films the page',async()=>{
  const js=await readFile(new URL('page.js',page),'utf8');
  assert.match(js,/const KEPT=\['style','appearance','hackathon','autoplay','voice','captions'\];/);
  assert.match(js,/for\(const k of KEPT\)if\(params\.has\(k\)\)q\.set\(k,params\.get\(k\)\);/);
  assert.match(js,/const flag=key=>\/\^\(1\|true\|on\|yes\)\$\/i\.test\(params\.get\(key\)\|\|''\);/,'off unless the link turns it on');
  assert.match(js,/if\(Object\.values\(demoFlags\)\.some\(Boolean\)\)import\('\.\/demo\.js'\)/,'no demo code otherwise');
  assert.match(js,/demoFlags\.hackathon\?\{recordLabel:'Hackathon Record',quickRecord:true\}:\{\}/);
  assert.match(demo,/if\(st==='armed'&&!running\)setTimeout\(run,600\);/,'autoplay starts once the recording rolls');
  assert.match(demo,/if\(flags\.autoplay&&!flags\.hackathon\)\{/,'a Play demo button without Hackathon Record');
  assert.match(demo,/if\(finished\)try\{onDone\(\);\}catch\{\}/,'the recording stops when the demo ends');
  const css=await readFile(new URL('page.css',page),'utf8');
  assert.match(css,/\.mom-captions\{/);assert.match(css,/\.has-captions body\{padding-bottom:110px\}/);
});
