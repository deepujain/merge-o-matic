import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const page=new URL('../web/',import.meta.url);
const source=await readFile(new URL('style.js',page),'utf8');

// Runs style.js the way the page's head does, against a stand-in document and localStorage.
function boot(storage,{dark=false}={}){
  const media={matches:dark,listeners:[],addEventListener(type,fn){if(type==='change')this.listeners.push(fn);},
    flip(on){this.matches=on;for(const fn of this.listeners)fn({matches:on});}};
  const window={localStorage:storage,matchMedia:q=>q==='(prefers-color-scheme: dark)'?media:{matches:false}};
  const meta={content:'#f6f3ee',setAttribute(k,v){this[k]=v;}};
  const document={documentElement:{dataset:{},style:{}},querySelector:q=>q==='meta[name="theme-color"]'?meta:null};
  vm.runInNewContext(source,{window,document});
  return {root:document.documentElement,api:window.momStyle,look:window.momAppearance,media,meta};
}
function memory(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};}

test('Normal is the default before anything is saved',()=>{
  const {root,api,meta}=boot(memory());
  assert.equal(root.dataset.style,'normal');assert.equal(api.get(),'normal');
  assert.equal('patches' in root.dataset,false,'no patch marker in any style');
  assert.equal(meta.content,'#f6f3ee');
});

test('the font style choice is saved and applied on the next load',()=>{
  const store=memory();
  const first=boot(store);
  assert.deepEqual([...first.api.styles],['normal','halloween','crayon']);
  assert.equal(first.api.set('halloween'),'halloween');
  assert.equal(first.root.dataset.style,'halloween');assert.equal(store.map.get(first.api.key),'halloween');
  assert.equal(first.root.dataset.patches,undefined,'Halloween stands on its own');
  assert.equal(boot(store).root.dataset.style,'halloween','a reload starts in Halloween');
  assert.equal(boot(store).api.set('crayon'),'crayon');
  const crayon=boot(store);assert.equal(crayon.root.dataset.style,'crayon','a reload starts in Crayon');assert.equal(crayon.root.dataset.patches,undefined);
  boot(store).api.set('normal');
  assert.equal(boot(store).root.dataset.style,'normal','and back to Normal');
  first.api.set('bogus');assert.equal(store.map.get(first.api.key),'normal','unknown styles fall back to Normal');
  assert.equal(first.api.set('varsity'),'normal','the retired Varsity means Normal');
});

test('blocked or broken storage still paints Normal and never throws',()=>{
  const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  const {root,api}=boot(broken);
  assert.equal(root.dataset.style,'normal');
  assert.equal(api.set('crayon'),'crayon');assert.equal(root.dataset.style,'crayon','the page still switches for this visit');
  assert.equal(boot(null).root.dataset.style,'normal');
});

test('a stored Varsity or Classic migrates to Normal and is saved back that way',()=>{
  for(const old of ['varsity','classic']){
    const store=memory();store.setItem('merge-o-matic-style',old);
    const {root,api}=boot(store);
    assert.equal(root.dataset.style,'normal',`${old} reads as Normal`);assert.equal(api.get(),'normal');assert.equal(root.dataset.patches,undefined);
    assert.equal(store.map.get('merge-o-matic-style'),'normal',`the old ${old} is rewritten`);
    assert.equal(api.set(old),'normal','the old name still means Normal');
  }
});

test('Crayon persists with cream paper by day and the chalkboard green by night',()=>{
  const store=memory();boot(store).api.set('crayon');
  const day=boot(store);
  assert.equal(day.root.dataset.style,'crayon');assert.equal(day.meta.content,'#fbf6e9','cream in light');
  const night=boot(store,{dark:true});
  assert.equal(night.root.dataset.theme,'dark');assert.equal(night.meta.content,'#1c3a2f','chalkboard green in dark');
  night.look.set('light');assert.equal(night.meta.content,'#fbf6e9','and the chrome follows a switch');
});

test('Appearance defaults to Auto, follows the system, and is saved apart from the style',()=>{
  const store=memory();
  const light=boot(store);
  assert.equal(light.root.dataset.appearance,'auto');assert.equal(light.root.dataset.theme,'light');assert.equal(light.look.get(),'auto');
  assert.equal(light.root.style.colorScheme,'light');
  assert.equal(store.map.has('merge-o-matic-appearance'),false,'nothing is saved until chosen');
  const night=boot(store,{dark:true});
  assert.equal(night.root.dataset.theme,'dark','Auto on a dark system is dark on first paint');
  assert.equal(night.meta.content,'#13101c','and the browser chrome matches');
  night.media.flip(false);assert.equal(night.root.dataset.theme,'light','Auto keeps following the system');
  const seen=[];night.look.onChange(t=>seen.push(t));night.media.flip(true);assert.deepEqual(seen,['dark'],'listeners hear the change');
  assert.deepEqual([...light.look.values],['light','dark','auto']);
  assert.equal(light.look.set('dark'),'dark');
  assert.equal(store.map.get('merge-o-matic-appearance'),'dark');assert.equal(store.map.has('merge-o-matic-style'),false,'the style is untouched');
  const again=boot(store);
  assert.equal(again.root.dataset.appearance,'dark');assert.equal(again.root.dataset.theme,'dark','a saved Dark wins over a light system');
  again.media.flip(true);again.media.flip(false);assert.equal(again.root.dataset.theme,'dark','and ignores system changes');
  assert.equal(boot(store,{dark:true}).look.set('light'),'light');
  assert.equal(boot(store,{dark:true}).root.dataset.theme,'light','a saved Light wins over a dark system');
  again.look.set('bogus');assert.equal(store.map.get('merge-o-matic-appearance'),'auto','unknown values fall back to Auto');
});

test('old stored values still work with the appearance added',()=>{
  for(const [style,want] of [['varsity','normal'],['halloween','halloween'],['normal','normal'],['classic','normal'],['crayon','crayon'],['bogus','normal']]){
    const store=memory();store.setItem('merge-o-matic-style',style);
    const {root,api,look}=boot(store);
    assert.equal(root.dataset.style,want,`a stored ${style} still loads`);assert.equal(api.get(),want);
    assert.equal(look.get(),'auto','with Auto when no appearance was saved');
  }
  const halloween=memory();halloween.setItem('merge-o-matic-style','halloween');
  const dusk=boot(halloween,{dark:true});
  assert.equal(dusk.root.dataset.theme,'dark');assert.equal(dusk.meta.content,'#150b21','Halloween Dark keeps its dusk colour');
  const day=boot(halloween);assert.equal(day.meta.content,'#f7ecd8','Halloween Light is parchment');
  for(const value of ['','LIGHT',' dark','null','0'])assert.equal((()=>{const m=memory();m.setItem('merge-o-matic-appearance',value);return boot(m).look.get();})(),'auto',`a stored "${value}" reads as Auto`);
  const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  const b=boot(broken,{dark:true});
  assert.equal(b.root.dataset.theme,'dark');assert.equal(b.look.set('light'),'light');assert.equal(b.root.dataset.theme,'light','blocked storage still switches for this visit');
});

test('the T menu has an Appearance group of Light, Dark and Auto under a divider',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8'),css=await readFile(new URL('page.css',page),'utf8');
  const menu=html.slice(html.indexOf('<div class="mom-style-menu"'),html.indexOf('id="mom-music"'));
  assert.match(menu,/<div class="mom-sm-group" role="group" aria-label="Style">/);
  const sep=menu.indexOf('<div class="mom-sm-sep" role="separator"></div>');
  assert.ok(sep>menu.lastIndexOf('data-style="crayon"'),'the divider comes after the three styles');
  assert.match(menu,/<div class="mom-sm-group" role="group" aria-labelledby="mom-sm-appearance">\s*<p class="mom-sm-label" id="mom-sm-appearance" aria-hidden="true">Appearance<\/p>/);
  const items=[...menu.matchAll(/<button[^>]*role="menuitemradio" aria-checked="(true|false)" data-appearance="(\w+)" tabindex="-1"><span class="mom-sm-icon is-appear is-(\w+)" aria-hidden="true"><svg[\s\S]*?<span class="mom-sm-name">(\w+)<\/span>/g)];
  assert.deepEqual(items.map(m=>[m[2],m[3],m[4],m[1]]),[['light','light','Light','false'],['dark','dark','Dark','false'],['auto','auto','Auto','true']],'sun, moon and half circle, Auto checked');
  assert.ok(sep<menu.indexOf('data-appearance="light"'));
  assert.match(js,/items=\[\.\.\.menu\.querySelectorAll\('\[role="menuitemradio"\]'\)\]/,'one list, so the arrow keys, Home and End cross both groups');
  assert.match(js,/it\.dataset\.style\?it\.dataset\.style===cur:it\.dataset\.appearance===look/,'each group checks its own current choice');
  assert.match(js,/if\(it\.dataset\.style\)applyStyle\(it\.dataset\.style\);else applyAppearance\(it\.dataset\.appearance\);/);
  assert.match(js,/window\.momAppearance\?\.onChange\(\(\)=>paint\(\)\)/,'Auto repaints when the system flips');
  for(const sel of ['[data-theme="dark"]{','[data-style="halloween"][data-theme="dark"]{--bg:#150b21','[data-style="halloween"][data-theme="light"]{--bg:#f7ecd8'])assert.ok(css.includes(sel),`styles for ${sel}`);
});

test('page.js compiles, so one bad declaration cannot blank the whole page',async()=>{
  const js=await readFile(new URL('page.js',page),'utf8');
  assert.doesNotThrow(()=>new vm.Script(`(async()=>{${js.replace(/^import .*$/gm,'')}\n})`),'page.js has a syntax error');
});

test('the repository picker follows the combobox and listbox pattern over the real select',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8');
  const btn=html.match(/<button[^>]*id="mom-repo-btn"[^>]*>/)?.[0]||'';
  for(const attr of ['role="combobox"','aria-haspopup="listbox"','aria-expanded="false"','aria-controls="mom-repo-list"',' disabled'])assert.ok(btn.includes(attr),`button has ${attr}`);
  assert.match(html,/<input id="mom-repo-filter"[^>]*role="combobox"[^>]*aria-controls="mom-repo-list"/,'the filter drives the list');
  assert.match(html,/<ul[^>]*id="mom-repo-list"[^>]*role="listbox"/);
  assert.match(html,/<select id="mom-repo"[^>]*aria-labelledby="mom-repo-label"/,'the select stays for touch and as the source of truth');
  for(const key of ['ArrowDown','ArrowUp','Home','End','Enter','Escape','Tab'])assert.ok(js.includes(`'${key}'`),`handles ${key}`);
  assert.match(js,/dispatchEvent\(new Event\('change'/,'a pick fires the select change handling');
  assert.match(js,/if\(on\)\{pick\.close\(false\);info\.close\(false\);styleMenu\.close\(false\);\}/,'an open picker, info popover or style menu closes before folding into the O');
  assert.match(js,/const FILTER_FROM=10;/,'the filter shows for 10 or more repositories only');
  assert.match(html,/<div class="mom-pick-search" id="mom-repo-search">/);
});

test('the repository count hint is gone but empty and error messages stay',async()=>{
  const js=await readFile(new URL('page.js',page),'utf8');
  assert.doesNotMatch(js,/Pick one to print|with merged pull requests\$\{/);
  assert.match(js,/has no merged pull requests in public repositories/);
  assert.match(js,/No such user/);
  assert.match(js,/Too many requests/);
});

test('the page loads style.js in the head before its stylesheets, and has no back link or footer',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8');
  const head=html.slice(0,html.indexOf('</head>'));
  assert.ok(head.indexOf('style.js')>-1&&head.indexOf('style.js')<head.indexOf('page.css'),'style applies before first paint');
  assert.doesNotMatch(html,/<script[^>]*style\.js[^>]*(defer|async|type="module")/,'a blocking classic script');
  assert.match(html,/id="mom-style"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"[^>]*aria-controls="mom-style-menu"[^>]*aria-label="Page style: Normal, Auto appearance\. Choose a style or appearance"/);
  assert.doesNotMatch(html,/mom-back|mom-foot/);
  const pop=html.match(/<div class="mom-info-pop"[\s\S]*?Created by DJ<\/p>\s*<\/div>/)?.[0]||'';
  const note='Your pull requests and receipts are never stored. We only count prints anonymously, with no names, IP addresses or tracking cookies.';
  assert.equal(html.split(note).length-1,1,'the privacy note appears once');
  assert.ok(pop.includes(note),'and only inside the i popover');
  assert.doesNotMatch(html,/Nothing is stored/,'no longer strictly true, so it is gone');
});

test('while recording the O is the stop control; no separate dot or stop button, and T and i fold too',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8'),css=await readFile(new URL('page.css',page),'utf8');
  assert.doesNotMatch(html+js+css,/mom-o-stop/,'the separate stop button is gone');
  assert.doesNotMatch(css,/\.is-rec::after\{content:""/,'and the red dot');
  assert.match(js,/setAttribute\('role','button'\);el\.tabIndex=0;el\.setAttribute\('aria-label','Stop recording'\);el\.dataset\.tip='Tap to stop'/);
  assert.match(js,/e\.key!=='Enter'&&e\.key!==' '/,'Enter and Space stop it');
  assert.match(js,/ui\.stopRecording\(\)/);
  assert.match(html,/<span class="mom-word"><span class="mom-group"><b class="ml ml-0" aria-hidden="true">M<\/b>/,'letters are hidden one by one, so the O can be a button');
  assert.match(html,/<span class="mom-o" id="mom-o-plain" aria-hidden="true">O<\/span>/);
  assert.match(js,/const folding=\(\)=>\[topBar,sub,els\.form,els\.status\]/,'the T and i column folds into the O');
  assert.ok(html.indexOf('id="mom-style"')<html.indexOf('id="mom-info"'),'T on top, i below it');
  assert.match(js,/videoTitle,/,'the page passes its heading to Record & Print');
});

test('the i button opens an accessible popover with the live GitHub limit meter',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8');
  const btn=html.match(/<button[^>]*id="mom-info"[^>]*>/)?.[0]||'';
  for(const attr of ['aria-haspopup="dialog"','aria-expanded="false"','aria-controls="mom-info-pop"','aria-label='])assert.ok(btn.includes(attr),`i button has ${attr}`);
  assert.match(html,/<div class="mom-info-pop" id="mom-info-pop" role="dialog" aria-labelledby="mom-info-title" tabindex="-1" hidden>/);
  assert.match(html,/<p class="mom-info-count" id="mom-info-count" hidden><\/p>\s*<p class="mom-info-credit">/,'the print count sits above the credit, hidden until loaded');
  assert.match(html,/Lookups are rate limited to keep Merge-O-Matic fast and fair for everyone\./);
  assert.match(html,/<p class="mom-info-credit">Created by DJ<\/p>\s*<\/div>/,'the credit closes the popover');
  assert.match(html,/id="mom-meter-bar" role="meter"/);
  assert.match(js,/api\('\/api\/fun\/merged\/limit'/,'fetches the limit route');
  assert.match(js,/setInterval\(.*,30000\)/,'refreshes every 30 s while open');
  assert.match(js,/clearInterval\(timer\)/,'and stops when closed');
  for(const copy of ['Plenty left','Running low','Paused until','% available','Refreshes at ','Demo data: ','not available right now'])assert.ok(js.includes(copy),`says ${copy}`);
  assert.match(js,/e\.key==='Escape'/);assert.match(js,/'pointerdown'/);
  const pop=html.slice(html.indexOf('id="mom-info-pop"'),html.indexOf('Created by DJ'));
  const infoJs=js.slice(js.indexOf('const info='),js.indexOf('return {open,close,isOpen}'));
  assert.doesNotMatch(pop,/\bkey\b|token|account|5,000|5000|per hour|per minute/i,'no key, account or raw GitHub limits in the popover copy');
  assert.doesNotMatch(infoJs,/GitHub key|token|account|5,000|5000|per hour|per minute|remaining|\.limit\b|source/i,'nor in what the popover script shows');
  assert.doesNotMatch(html+js,/github_pat_|ghp_/,'no key prefix on the page');
});

test('the T opens a style menu of three radio choices with icons, and the keyboard pattern',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8'),css=await readFile(new URL('page.css',page),'utf8');
  const menu=html.slice(html.indexOf('<div class="mom-style-menu" id="mom-style-menu" role="menu"'),html.indexOf('id="mom-music"'));
  const items=[...menu.matchAll(/<button[^>]*role="menuitemradio"[^>]*aria-checked="(true|false)"[^>]*data-style="(\w+)"[^>]*tabindex="-1">[\s\S]*?<\/button>/g)];
  assert.deepEqual(items.map(m=>m[2]),['normal','halloween','crayon']);
  assert.deepEqual(items.map(m=>m[1]),['true','false','false'],'Normal is checked by default');
  assert.deepEqual(items.map(m=>m[0].match(/mom-sm-name">(\w+)</)?.[1]),['Normal','Halloween','Crayon']);
  for(const [i,cls] of ['is-normal','is-halloween','is-crayon'].entries())assert.ok(items[i][0].includes(`mom-sm-icon ${cls}`),`${cls} icon`);
  assert.ok(items[1][0].includes('<svg')&&items[2][0].includes('<svg'),'Halloween shows a pumpkin and Crayon a crayon');
  assert.deepEqual(Object.keys(Function(`${js.match(/const STYLE_NAMES=\{[^}]*\}/)[0]};return STYLE_NAMES`)()),['normal','halloween','crayon'],'page.js names every style');
  assert.doesNotMatch(html+js,/Classic/,'Classic is called Normal everywhere in the UI');
  const order=['id="mom-style"','id="mom-style-menu"','id="mom-music"','id="mom-info"'].map(k=>html.indexOf(k));
  assert.deepEqual([...order].sort((a,b)=>a-b),order,'T, its menu, music, then i');
  for(const key of ['ArrowDown','ArrowUp','Home','End','Escape','Tab'])assert.ok(js.slice(js.indexOf('const styleMenu')).includes(`'${key}'`),`menu handles ${key}`);
  assert.match(js,/btn\.setAttribute\('aria-expanded','true'\)/);
  assert.match(js,/aria-label',`Page style: \$\{STYLE_NAMES\[cur\]\}, \$\{APPEARANCE_NAMES\[look\]\} appearance\. Choose a style or appearance`/);
  assert.match(js,/if\(focus\)btn\.focus\(\)/,'focus returns to the T');
  assert.match(js,/document\.startViewTransition&&!reduced\.matches/,'a quick crossfade, none under reduced motion');
  assert.match(css,/\.mom-style-menu\.is-in\{animation:mom-menu-in/);
  assert.match(css,/\.mom-style-menu\{position:absolute;top:44px;right:0;z-index:45/,'over the column, above the popover');
});

test('Halloween restyles the page and heading and gives the O a pumpkin, and the idle bat stays decorative',async()=>{
  const html=await readFile(new URL('index.html',page),'utf8'),css=await readFile(new URL('page.css',page),'utf8'),js=await readFile(new URL('page.js',page),'utf8');
  assert.match(css,/\[data-style="halloween"\]\[data-theme="dark"\]\{--bg:#150b21;/,'the dusk look is Halloween Dark');
  const o=html.match(/<b class="ml ml-6 mom-o" aria-hidden="true" id="mom-o">O(<svg class="mom-jack"[\s\S]*?<\/svg>)<\/b>/);
  assert.ok(o,'the pumpkin is an inline SVG inside the O, whose text stays "O"');
  assert.equal(o[1].replace(/<[^>]+>/g,''),'','the SVG adds no text, so the heading still reads Merge-O-Matic');
  assert.match(html,/<span class="mom-sr">Merge-O-Matic<\/span>/);
  assert.equal((o[1].match(/<ellipse cx="\d+" cy="\d+" rx="\d+" ry="\d+"\/>/g)||[]).length,15,'five ribbed lobes, drawn as edge, ring and skin');
  for(const part of ['jk-stem','jk-curl','jk-leaf','jk-rib','jk-carve','jk-glow','jk-pot','jk-brew','jk-bubbles','jk-steam'])assert.ok(o[1].includes(`class="${part}"`),part);
  assert.match(css,/\.mom-jack\{display:none\}/,'only Halloween shows the pumpkin');
  assert.match(css,/\[data-style="halloween"\] \.mom-title \.ml-6\.is-rec\{--jk-hi:/,'an ember pumpkin while recording');
  assert.match(css,/\[data-style="halloween"\] \.mom-title \.mom-o\.is-island\{/,'a candle glow while printing');
  assert.match(css,/\[data-style="halloween"\] \.mom-title \.ml-6\[role="button"\]:focus-visible\{outline:2px solid #fff/,'the stop control keeps a visible focus ring');
  assert.match(html,/<i class="mom-bat" aria-hidden="true">/);
  assert.match(html,/<i class="mom-witch" aria-hidden="true">/);
  assert.match(html,/<i class="mom-sparks" aria-hidden="true">/);
  assert.match(js,/function batFrames\(g,dir\)\{/,'the bat leaves the pumpkin, loops round it and flies off');
  assert.match(js,/const n=26,turn=Math\.PI\*2\.5;/,'one and a quarter loops');
  assert.match(js,/function witches\(wait=25000\+Math\.random\(\)\*15000\)/,'the witch every 25 to 40 s');
  assert.match(js,/if\(!witch\|\|!jack\|\|!pot\|\|flying\(\)\|\|oBusy\(\)/,'never with the bat, and never while the O is the island');
  assert.match(js,/if\(!bat\|\|flying\(\)\|\|/,'never two flights at once');
  assert.match(js,/const BREW=3600;/,'about 3.6 s in all');
  assert.match(js,/document\.hidden\?a\.pause\(\):a\.play\(\)/,'flights pause while the tab is hidden');
  assert.match(js,/if\(on\)grounded\(\);/,'printing ends a flight at once');
  assert.match(js,/window\.momHalloween=\{bat:/,'a debug hook to trigger them');
  assert.match(js,/pumpkin:halloween&&el===oFor\.letters/,'the video O is a pumpkin too');
  assert.match(js,/function bats\(first\)\{setTimeout\(\(\)=>\{flyBat\(\);bats\(false\);\},first\?900:8000\+Math\.random\(\)\*7000\);\}/,'a bat soon after the heading pops in, then every 8 to 15 s');
  assert.match(js,/setTimeout\(flicker,3000\+Math\.random\(\)\*3000\)/,'the candle flickers every 3 to 6 s');
  assert.match(js,/const spooky=\(\)=>!document\.hidden&&!reduced\.matches&&pageStyle\(\)==='halloween';/,'never under reduced motion');
  assert.match(css,/\.mom-bat svg\{[^}]*drop-shadow\(0 0 5px #f97316\)/,'the bat is backlit so it shows on the dark sky');
});

test('a completed print is counted once through stats.js, and the popover shows the total',async()=>{
  const js=await readFile(new URL('page.js',page),'utf8'),kit=await readFile(new URL('kit/receipt-ui.js',page),'utf8');
  assert.match(kit,/if\(torn&&!m\.void&&!job\.reported\)\{job\.reported=true;try\{host\.printed\?\.\(/,'after the tear, never for VOID, once per receipt');
  assert.match(js,/import \{recordPrint,fetchStats\} from '\.\/stats\.js';/);
  assert.match(js,/printed:countPrint,/);
  const fn=js.slice(js.indexOf('let lastPrint'),js.indexOf('// The i button:'));
  assert.match(fn,/at-lastPrint\.at<10000\)return;/,'a quick reprint of the same receipt is not counted again');
  assert.match(fn,/recordPrint\(\{theme:pageStyle\(\),range,login:state\.login\}\)/);
  assert.doesNotMatch(js,/deepujain|userAgent|document\.cookie|\/api\/fun\/merged\/printed/i,'no owner login in public code, no user agent, no cookies, no old route');
  assert.match(js,/const n=\(await fetchStats\(\)\)\?\.printedTotal;/);
  assert.match(js,/receipts'\} printed`/);
});

test('the patches look and its font are gone, and Crayon dresses the page with decorative doodles',async()=>{
  const files=['index.html','page.css','page.js','style.js','music.js','stats.js','kit/receipt-video.js'];
  const all=(await Promise.all(files.map(f=>readFile(new URL(f,page),'utf8')))).join('\n');
  assert.doesNotMatch(all,/data-patches|\[data-patches\]|Graduate|graduate\.ttf|--felt|jk-felt|jk-stitch|kind:'patches'/,'no patch layer, felt, stitches or Graduate');
  const html=await readFile(new URL('index.html',page),'utf8'),css=await readFile(new URL('page.css',page),'utf8');
  assert.match(html,/<div class="mom-doodles" aria-hidden="true">/,'the doodles are hidden from assistive tech');
  assert.match(css,/\.mom-doodles>\*\{position:fixed;z-index:-1;pointer-events:none\}/,'behind the content and never in the way');
  assert.match(css,/\.mom-doodles\{display:none\}[\s\S]*\[data-style="crayon"\] \.mom-doodles\{display:block\}/,'Crayon only');
  assert.match(css,/\[data-style="crayon"\]\[data-theme="dark"\]\{--bg:#1c3a2f;/,'a chalkboard green, not near-black');
  assert.match(css,/@media \(forced-colors:active\)\{\[data-style="crayon"\] \.mom-doodles/,'no doodles under forced colours');
  const motion=css.slice(css.indexOf('/* Doodles behind the page'));
  for(const anim of ['mom-sway','mom-drift','mom-bob','mom-twinkle','mom-crawl'])assert.ok(motion.indexOf(`animation:${anim}`)>motion.indexOf('@media (prefers-reduced-motion:no-preference)'),`${anim} only runs with motion allowed`);
  assert.doesNotMatch(css.slice(css.indexOf('/* Crayon:')),/\.rm-paper|\.rm-row/,'the receipt paper keeps its own colours');
});
