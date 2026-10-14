import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {receiptWindow,esc,RANGES,EMPTY} from '../web/kit/receipt-ui.js';

const kit=new URL('../web/kit/',import.meta.url);
const page=new URL('../web/',import.meta.url);

test('the manifest lists every kit file, and only kit files',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.json',kit),'utf8'));
  assert.equal(manifest.name,'merge-o-matic');assert.match(manifest.version,/^\d+\.\d+\.\d+$/);
  assert.ok(manifest.files.includes(manifest.entry));
  const onDisk=(await readdir(kit)).filter(f=>f!=='manifest.json').sort();
  assert.deepEqual([...manifest.files].sort(),onDisk);
  for(const f of manifest.files)assert.match(f,/^[a-z0-9-]+\.(js|css)$/,'plain names a loader can whitelist');
});

test('kit files never name a host app, import only siblings, and use no em dashes',async()=>{
  const manifest=JSON.parse(await readFile(new URL('manifest.json',kit),'utf8'));
  for(const f of manifest.files){
    const text=await readFile(new URL(f,kit),'utf8');
    assert.doesNotMatch(text,/pulsar|spark/i,`${f} stays host-neutral`);
    assert.doesNotMatch(text,/\u2014/,`${f} has no em dash`);
    for(const m of text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g))assert.match(m[1],/^\.\/[a-z0-9-]+\.js$/,`${f} imports ${m[1]}`);
    assert.doesNotMatch(text,/\bfetch\(/,`${f} fetches nothing itself; data comes from the host`);
  }
});

test('the page and its copy use no em dashes',async()=>{
  for(const f of ['index.html','page.js','page.css','style.js'])assert.doesNotMatch(await readFile(new URL(f,page),'utf8'),/\u2014/,f);
});

test('receipt windows follow the local clock',()=>{
  const now=new Date(2026,8,30,15,30);
  const day=(y,m,d)=>new Date(y,m,d).toISOString();
  const w=receiptWindow('week',now);assert.equal(w.since,day(2026,8,24),'the last 7 days, today included');assert.equal(w.until,null);
  assert.equal(receiptWindow('month',now).since,day(2026,8,1));
  assert.equal(receiptWindow('quarter',now).since,day(2026,6,3));
  assert.deepEqual([receiptWindow('year',now).since,receiptWindow('year',now).until],[day(2026,0,1),null]);
  assert.deepEqual([receiptWindow('year:2024',now).since,receiptWindow('year:2024',now).until],[day(2024,0,1),day(2025,0,1)]);
  assert.deepEqual(receiptWindow('all',now),{since:'all',until:null,start:null});
  assert.deepEqual(Object.keys(RANGES),Object.keys(EMPTY));
  assert.equal(esc('<a href="x">\'&'),'&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});
