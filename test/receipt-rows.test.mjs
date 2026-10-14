import test from 'node:test';
import assert from 'node:assert/strict';
import {mergedWindow,parseMerged} from '../server/lib/merged-core.js';
import {WIDTH,receiptRows,rowsText,rowText,itemType,itemStats,storeIdentity,barcode,share} from '../web/kit/receipt.js';

const since='2026-09-29T07:00:00.000Z',now=Date.parse('2026-09-29T20:00:00Z');
const rollup={state:'SUCCESS',contexts:{checkRunCount:84,checkRunCountsByState:[{state:'SUCCESS',count:63},{state:'SKIPPED',count:21},{state:'FAILURE',count:0}]}};
const node=(n,extra={})=>({number:n,title:`fix(tunnel): validate cloudflared PID identity ${n}`,url:`https://github.com/NVIDIA/NemoClaw/pull/${n}`,mergedAt:'2026-09-29T18:00:00Z',
  additions:120,deletions:34,changedFiles:2,baseRefName:'main',headRefOid:'abcdef1234567890',mergeCommit:{oid:'77e166aa99'},author:{login:'deepujain'},
  files:{nodes:[{path:'src/tunnel.ts',additions:100,deletions:30},{path:'test/tunnel.test.ts',additions:20,deletions:4}]},
  commits:{totalCount:4},lastCommit:{nodes:[{commit:{statusCheckRollup:rollup}}]},
  reviews:{totalCount:3,nodes:[{state:'COMMENTED',author:{login:'coderabbitai'}},{state:'CHANGES_REQUESTED',author:{login:'bob'}},{state:'APPROVED',author:{login:'alice'}}]},
  closingIssuesReferences:{nodes:[{number:12405,url:'https://github.com/NVIDIA/NemoClaw/issues/12405'}]},...extra});

const model=(items,extra={})=>({store:storeIdentity({name:'NemoClaw',repo:'NVIDIA/NemoClaw'}),contributor:'DEEPUJAIN',date:'09/29/2026',time:'19:26',shift:'TODAY',
  grouped:false,empty:['Nothing merged yet today.'],notes:[],items,...extra});
const parsed=()=>parseMerged(['NVIDIA/NemoClaw'],{r0:{issueCount:1,nodes:[node(12491)]}},mergedWindow(since,null,now)).items.map(i=>({...i,repoLabel:'NemoClaw',time:'TUE 11:00 AM'}));
const FABRICATED=/ACCOUNT #|TERMINAL #|TC#|ST# |OP# |TE# |TR# |MAINTAINER|MERGE-IT|\(\d{3}\)|\*{4} \*{4}/;

test('receipt rows print real values in a fixed-width supermarket layout',()=>{
  const items=parsed(),rows=receiptRows(model(items)),text=rowsText(rows);
  for(const r of rows.filter(r=>r.kind==='text'&&r.size===1))assert.ok([...rowText(r)].length<=WIDTH,`row fits: ${rowText(r)}`);
  assert.match(text,/NEMOCLAW MERGE MART/);assert.match(text,/^ +CONTRIBUTOR DEEPUJAIN$/m);assert.match(text,/github\.com\/NVIDIA\/NemoClaw/);
  assert.match(text,/^FIX ISSUE#12405 PR#12491 {10}\+120\/-34$/m);
  assert.match(text,/^2 FILES  84 CHECKS OK  4 COMMITS\nBAGGED \u2713 BY @ALICE {12}TUE 11:00 AM$/m,'the time moves to the BAGGED BY row when the numbers fill theirs; only approvers are bagged');
  const noApprover=rowsText(receiptRows(model(items.map(i=>({...i,approvals:0})))));
  assert.match(noApprover,/^2 FILES  84 CHECKS OK  4 COMMITS\n {30}TUE 11:00 AM$/m,'without approvers the time gets its own row');
  assert.doesNotMatch(noApprover,/BAGGED|\u2713/,'no approving review, no check');
  assert.match(text,/^ +SUBTOTAL +\+120$/m);assert.match(text,/^ {4}TAX 1 +TESTS 15\.58% +24$/m);assert.match(text,/^ {4}TAX 2 +DOCS 0\.00% +0$/m);
  assert.match(text,/ TOTAL +154$/m);assert.match(text,/CI TEND +1\/1$/m);assert.match(text,/CHANGE DUE +1$/m);
  assert.match(text,/^ +YOU SAVED 34 LINES$/m);assert.doesNotMatch(text,/RETURNS/);
  assert.match(text,/^APPROVAL # 77E166A +MERGE OF PR#12491$/m,'the real merge commit');
  assert.match(text,/^REF # ABCDEF1 +HEAD OF PR#12491$/m,'the real head commit');
  assert.match(text,/# ITEMS SOLD 1/);assert.match(text,/^ +#12491$/m,'the barcode is labelled with the PR numbers it encodes');
  assert.doesNotMatch(text,/https:/,'URLs live in the links, not in printed text');
  assert.doesNotMatch(text,/pulsar/i);assert.doesNotMatch(text,/\u2014/);
  const item=rows.find(r=>rowText(r).startsWith('FIX ISSUE'));
  assert.deepEqual(item.segs.filter(s=>s.href).map(s=>s.href),['https://github.com/NVIDIA/NemoClaw/issues/12405','https://github.com/NVIDIA/NemoClaw/pull/12491']);
  assert.deepEqual(item.segs.filter(s=>/add|del/.test(s.cls)).map(s=>s.t),['+120','-34']);
  const code=rows.find(r=>r.kind==='barcode');assert.equal(code.seed,'#12491');assert.ok(barcode(code.seed).bars.length>10);
  assert.equal(itemType('feat(ui)!: add receipt'),'FEAT');assert.equal(itemType('Revert "x"'),'RETURN');assert.equal(itemType('Bump deps'),'PR');
});

test('an approving review prints a green check between BAGGED and BY that reads as approved',()=>{
  const items=parsed(),bagged=rows=>rows.filter(r=>rowText(r).startsWith('BAGGED'));
  const [one]=bagged(receiptRows(model(items.map(i=>({...i,reviewers:['rsliter'],approvals:1,changedFiles:18,commits:15,time:'MON 2:33 PM'})))));
  assert.equal(rowText(one),'BAGGED \u2713 BY @RSLITER           MON 2:33 PM');
  assert.equal([...rowText(one)].length,WIDTH,'the check takes one cell and the time stays right-aligned');
  assert.deepEqual(one.segs.slice(0,3).map(s=>[s.t,s.cls]),[['BAGGED ',''],['\u2713','check'],[' BY @RSLITER','']]);
  assert.equal(one.cls,'fine');assert.equal(one.sr,'Bagged, approved, by @rsliter, MON 2:33 PM');
  const longRows=receiptRows(model(items.map(i=>({...i,reviewers:['a-really-long-reviewer-login'],approvals:1}))));
  for(const r of longRows.filter(r=>r.kind==='text'&&r.size===1))assert.ok([...rowText(r)].length<=WIDTH,`row fits: ${rowText(r)}`);
  assert.match(rowsText(longRows),/^ {30}TUE 11:00 AM\nBAGGED \u2713 BY @A-REALLY-LONG-REVIEWER-LOGIN$/m,'a long name keeps the time right-aligned on its own row');
  assert.equal(bagged(longRows)[0].sr,'Bagged, approved, by @a-really-long-reviewer-login');
  const many=['reviewer-one','reviewer-two','reviewer-three','reviewer-four'];
  const [crowd]=bagged(receiptRows(model(items.map(i=>({...i,reviewers:many,approvals:4})))));
  assert.equal(rowText(crowd),'BAGGED \u2713 BY @REVIEWER-ONE @REVIEWER-TWO +2');
  assert.equal(crowd.sr,'Bagged, approved, by @reviewer-one @reviewer-two and 2 more');
  const unapproved=receiptRows(model(items.map(i=>({...i,reviewers:['bob'],approvals:0}))));
  assert.equal(bagged(unapproved).length,0,'a change request or comment is never bagged');
  assert.ok(unapproved.every(r=>!r.sr&&!(r.segs||[]).some(s=>s.cls==='check')),'the check is never invented');
});

test('store terms carry real values and fabricated fields never print',()=>{
  const items=parsed();
  const two=[...items,{...items[0],number:12492,title:'Revert "fix(tunnel): x"',additions:300,deletions:700,testLines:0,docLines:250,mergedAt:'2026-09-29T19:00:00Z',mergeSha:'f8dbc3fe17',headSha:'1f19393a96'}];
  const text=rowsText(receiptRows(model(two)));
  const changed=two.reduce((n,i)=>n+i.additions+i.deletions,0),tests=two.reduce((n,i)=>n+i.testLines,0),docs=two.reduce((n,i)=>n+i.docLines,0);
  assert.equal(changed,1154);
  assert.equal(text.match(/TAX 1 +TESTS ([\d.]+%) +([\d,]+)$/m).slice(1).join(' '),`${share(tests,changed)} ${tests}`,'TAX 1 is the real test share');
  assert.equal(text.match(/TAX 2 +DOCS ([\d.]+%) +([\d,]+)$/m).slice(1).join(' '),`${share(docs,changed)} ${docs}`,'TAX 2 is the real docs share');
  assert.match(text,/ TOTAL +1,154$/m);assert.match(text,/SUBTOTAL +\+420$/m);assert.match(text,/YOU SAVED 734 LINES/);
  assert.match(text,/RETURNS +1$/m);assert.match(text,/^RETURN ISSUE#12405 PR#12492 +\+300\/-700$/m);
  assert.match(text,/^APPROVAL # F8DBC3F +MERGE OF PR#12492$/m,'the latest merge');
  for(const m of [model(items),model([]),model([],{void:{title:'** VOID **',lines:['THIS REGISTER NEEDS A RESTART.']}}),{...model(items),grouped:true}]){
    const rows=receiptRows(m),text=rowsText(rows);
    assert.doesNotMatch(text,FABRICATED);
    for(const r of rows.filter(r=>r.kind==='text'))assert.doesNotMatch(r.segs.map(s=>s.t).join(''),FABRICATED,'paper rows too');
  }
  const bare=rowsText(receiptRows(model(items.map(i=>({...i,title:'Bump deps',fixes:[{number:1,url:'u1'},{number:2,url:'u2'}],checks:null,ci:null,approvals:0,changedFiles:0,commits:0,testLines:null})),{contributor:''})));
  assert.match(bare,/^PR ISSUE#1 \+1 PR#12491 +\+120\/-34$/m);assert.match(bare,/^ {30}TUE 11:00 AM$/m);
  assert.doesNotMatch(bare,/CHECKS|BAGGED BY|CONTRIBUTOR|FILES|COMMITS|TEST LINES/,'missing data is omitted, not invented');
  const failing={...items[0],checks:{total:84,passed:82,waiting:0,failed:2}};
  assert.equal(itemStats(failing).segs.map(s=>s.t).join(''),'2 FILES  82/84 CHECKS  4 COMMITS');
  assert.match(rowsText(receiptRows(model([failing]))),/CI TEND +0\/1$/m);
  assert.equal(itemStats({changedFiles:18,commits:5,checks:{total:84,passed:84,waiting:0,failed:0}},8).segs.map(s=>s.t).join(''),'18 FILES  84 CHECKS OK  5 CMTS','shortens to share a row with a short time');
});

test('empty and void receipts',()=>{
  const empty=rowsText(receiptRows(model([])));
  assert.match(empty,/\*\*\* NO SALE \*\*\*/);assert.match(empty,/# ITEMS SOLD 0/);assert.match(empty,/Nothing merged yet today/);assert.match(empty,/ TOTAL +0$/m);
  assert.equal(receiptRows(model([])).some(r=>r.kind==='barcode'),false,'no barcode without PRs');
  const all=storeIdentity(null,3);assert.equal(all.name,'MAIN STREET MERGES');assert.deepEqual(all.address,['3 STORES ON GITHUB.COM']);
  const voided=rowsText(receiptRows(model([],{void:{title:'** VOID **',lines:['THIS REGISTER NEEDS A RESTART.']}})));
  assert.match(voided,/VOID/);assert.doesNotMatch(voided,/NO SALE|pulsar/i);
});

test('a demo receipt says so on the paper',()=>{
  const text=rowsText(receiptRows(model(parsed(),{notes:['DEMO DATA. NOT FROM GITHUB.']})));
  assert.match(text,/DEMO DATA\. NOT FROM GITHUB\./);
});

test('reviews given print in their own section and never change the totals',()=>{
  const base={store:{name:'X MERGE MART',address:['github.com/a/b']},shift:'TODAY',date:'d',time:'t',empty:['none'],
    items:[{number:1,title:'fix: y',url:'u1',additions:10,deletions:2,mergedAt:'2026-09-29T18:00:00Z',time:'MON 1:00 PM'}]};
  const review={number:5,title:'fix: a',url:'u5',author:'alice',merged:true,verdict:'APPROVED',rounds:2,time:'THU 7:12 AM'};
  const plain=rowsText(receiptRows(base)),withReviews=rowsText(receiptRows({...base,reviewed:[review,{...review,number:6,verdict:'CHANGES_REQUESTED',rounds:1,merged:false}]}));
  assert.match(withReviews,/\*\* REVIEWS GIVEN \*\*\nAPPROVED PR#5 +@ALICE\n2 REVIEWS  MERGED +THU 7:12 AM\nCHANGES PR#6 +@ALICE\n1 REVIEW +THU 7:12 AM/);
  assert.match(withReviews,/# ITEMS SOLD 1\n *# REVIEWS GIVEN 2/);
  const totals=t=>t.split('\n').filter(l=>/SUBTOTAL|TOTAL|YOU SAVED|ITEMS SOLD/.test(l));
  assert.deepEqual(totals(withReviews),totals(plain));
  assert.doesNotMatch(plain,/REVIEWS GIVEN/,'no reviews, no section');
  assert.match(rowsText(receiptRows({...base,items:[],reviewed:[review]})),/NO SALE[\s\S]*REVIEWS GIVEN[\s\S]*SUBTOTAL +0/);
});
