import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/server.js';

delete process.env.GITHUB_PUBLIC_READ_TOKEN;
delete process.env.NODE_ENV;

const app=createApp();
await new Promise(r=>app.listen(0,r));
const base=`http://localhost:${app.address().port}`;
test.after(()=>app.close());

test('serves the page at / and at /games/merge-o-matic, and its files under the prefix',async()=>{
  for(const path of ['/','/games/merge-o-matic']){
    const res=await fetch(base+path);
    assert.equal(res.status,200);
    assert.match(await res.text(),/<title>Merge-O-Matic/);
  }
  const js=await fetch(`${base}/games/merge-o-matic/kit/receipt.js`);
  assert.equal(js.status,200);
  assert.match(js.headers.get('content-type'),/javascript/);
});

test('never serves files outside web/',async()=>{
  for(const path of ['/games/merge-o-matic/../server/server.js','/games/merge-o-matic/%2e%2e/package.json','/package.json']){
    assert.equal((await fetch(base+path)).status,404,path);
  }
});

test('without a key, outside production, the routes answer with labelled demo data',async()=>{
  const repos=await (await fetch(`${base}/api/fun/merged/repos?login=octocat`)).json();
  assert.equal(repos.demo,true);
  assert.ok(repos.repos.length>0);
  const since=new Date(Date.now()-7*86400000).toISOString();
  const res=await fetch(`${base}/api/fun/merged?login=octocat&repo=${encodeURIComponent(repos.repos[0].repo)}&since=${since}`);
  assert.equal(res.status,200);
  const receipt=await res.json();
  assert.equal(receipt.demo,true);
  assert.ok(Array.isArray(receipt.items));
  assert.deepEqual(await (await fetch(`${base}/api/fun/merged/limit`)).json(),{available:1,level:'plenty',resetsAt:null,demo:true});
});

test('bad input is a 422 with a message a person can act on',async()=>{
  const res=await fetch(`${base}/api/fun/merged/repos?login=-bad-`);
  assert.equal(res.status,422);
  assert.match((await res.json()).error,/GitHub username/);
});

test('cross-site browser requests are refused',async()=>{
  const res=await fetch(`${base}/api/fun/merged/repos?login=octocat`,{headers:{'sec-fetch-site':'cross-site'}});
  assert.equal(res.status,403);
});

test('a print counts once, Do Not Track is respected, and the counter shows only totals',async()=>{
  const post=(body,headers={})=>fetch(`${base}/api/fun/merged/print`,{method:'POST',body:JSON.stringify(body),headers});
  const visitorId='3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
  assert.equal((await post({visitorId,theme:'normal',range:'week'},{dnt:'1'})).status,204);
  assert.equal((await post({visitorId,theme:'normal',range:'week'})).status,204);
  assert.equal((await post({visitorId:'nope',theme:'normal',range:'week'})).status,400);
  assert.deepEqual(await (await fetch(`${base}/api/fun/merged/stats`)).json(),{printedTotal:1,printedToday:1});
});
