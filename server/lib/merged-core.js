// Merged PRs for MergeOMatic, framework-free and transport-agnostic: graphql(query) resolves GitHub's JSON body
// ({data, errors}) or throws an Error carrying status, retryAt (epoch ms) or transient. One request searches one or
// more repositories through aliases, pages with cursors, and reports the remaining quota. GitHub search returns at
// most SEARCH_CAP results per query; beyond that a receipt is marked truncated.
// All-time receipts: GitHub answers a search with every nested field slowly or with HTTP 504, so only the first
// DETAIL_PAGE merges carry check runs and file lists. Older pages are light, LIGHT_PAGE at a time, and print without
// those numbers. The payload matches the one the receipt kit prints.
export const REPO_BATCH=10,PER_PAGE=100,SEARCH_CAP=1000,DETAIL_PAGE=30,LIGHT_PAGE=50,ALL_DETAIL_BATCH=2,ALL_LIGHT_BATCH=3,RETRIES=2;
// GitHub's own rules: up to 39 letters, digits and single hyphens, not starting or ending with a hyphen.
export const LOGIN_RE=/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
export const REPO_RE=/^[A-Za-z0-9-]{1,39}\/(?!\.\.?$)[A-Za-z0-9_.-]{1,100}$/;
export const validLogin=login=>typeof login==='string'&&LOGIN_RE.test(login);
export const validRepo=repo=>typeof repo==='string'&&REPO_RE.test(repo);
const stamp=ms=>new Date(ms).toISOString().slice(0,19)+'+00:00';
const badInput=message=>Object.assign(new Error(message),{input:true});

// Dated receipts reach back to EARLIEST (a day early for time zones ahead of UTC). A window longer than
// LONG_DAYS (quarters and years) is long: it pages like All, with check runs and file lists on the newest only.
export const EARLIEST=Date.parse('2007-12-31T00:00:00Z'),LONG_DAYS=35;
export function mergedWindow(since,until,now=Date.now()){
  if(since==='all')return {since:null,until:null,all:true};
  const s=Date.parse(since),u=until?Date.parse(until):null;
  if(!Number.isFinite(s))throw badInput('Choose a valid start time.');
  if(s<EARLIEST||s>now+86400000)throw badInput('Receipts start in 2008.');
  if(u!=null&&(!Number.isFinite(u)||u<=s||u>now+366*86400000))throw badInput('Choose a valid end time.');
  const long=(u??now)-s>LONG_DAYS*86400000;
  return {since:new Date(s).toISOString(),until:u==null?null:new Date(u).toISOString(),...long?{long:true}:{}};
}

// Transport and GraphQL failures become messages a person can act on. transient: worth another try.
export function githubFailure(error){
  const text=String(error?.message||'')+' '+String(error?.body?.message||'');
  const status=Number(error?.status)||0;
  if(error?.transient||[502,503,504].includes(status)||/couldn't respond to your request in time|timed? ?out|ETIMEDOUT|ECONNRESET|socket hang up|AbortError/i.test(text))
    return {transient:true,message:'GitHub took too long to answer. Press PRINT again in a moment.'};
  if(status===429||/rate limit|rate_limit|RATE_LIMITED|quota/i.test(text))return {transient:false,rateLimited:true,message:'GitHub rate limit reached. Try again after the reset.'};
  if(status===401||/Bad credentials/i.test(text))return {transient:false,message:'GitHub rejected this site\'s access token. Try again later.'};
  if(status===403||/Resource not accessible|SAML/i.test(text))return {transient:false,message:'GitHub refused access to this repository.'};
  const line=String(error?.message||'').split('\n').map(s=>s.trim()).find(Boolean);
  return {transient:false,message:line?`GitHub could not complete the search: ${line.slice(0,160)}`:'GitHub could not complete the search.'};
}

// extra: more search qualifiers, such as is:public.
// scope 'author' leaves out repo:, for keys whose repo:, org: and user: searches come back empty for some owners
// (GitHub answers those with zero results, not an error). parseMerged then keeps only the repository's PRs.
/** @param {string} repo @param {string} login @param {{since:string|null,until:string|null,all?:boolean}} window @param {string} [extra] @param {'repo'|'author'} [scope] */
export function mergedSearch(repo,login,{since,until,all,long},extra='',scope='repo'){
  const where=scope==='author'?'':` repo:${repo}`,tail=extra?` ${extra}`:'';
  if(all)return `is:pr is:merged author:${login}${where}${tail} sort:created-desc`;
  const range=until?`${stamp(Date.parse(since))}..${stamp(Date.parse(until)-1000)}`:`>=${stamp(Date.parse(since))}`;
  return `is:pr is:merged author:${login}${where}${tail} merged:${range}${long?' sort:created-desc':''}`;
}

// One cheap all-time search scoped to the repository: zero here, when the repo lookup counted merges, means this key
// cannot search the owner by repo:.
export function scopeProbeQuery(repo,login,extra=''){
  if(!validLogin(login)||!validRepo(repo))throw new Error('Unexpected GitHub login or repository.');
  return `query{rateLimit{remaining resetAt cost} r0:search(type:ISSUE,first:1,query:${JSON.stringify(mergedSearch(repo,login,{since:null,until:null,all:true},extra))}){issueCount}}`;
}

// PRs closed without merging in the same window print as returns. One light page per repository; more are
// reported as incomplete rather than fetched.
export const RETURNS_PAGE=50;
/** @param {string} repo @param {string} login @param {{since:string|null,until:string|null,all?:boolean}} window @param {string} [extra] @param {'repo'|'author'} [scope] */
export function closedSearch(repo,login,{since,all},extra='',scope='repo'){
  const where=scope==='author'?'':` repo:${repo}`,tail=extra?` ${extra}`:'';
  if(all)return `is:pr is:closed is:unmerged author:${login}${where}${tail} sort:updated-desc`;
  // GitHub's closed: index can miss a PR closed minutes ago; closing always updates it, so search updated: and
  // parseClosed keeps only PRs whose closedAt falls inside the window.
  return `is:pr is:closed is:unmerged author:${login}${where}${tail} updated:>=${stamp(Date.parse(since))}`;
}
export function closedQuery(repos,login,window,{extra='',scope='repo'}={}){
  if(!validLogin(login))throw new Error('Unexpected GitHub login.');
  const parts=repos.map((repo,i)=>{
    if(!validRepo(repo))throw new Error('Unexpected repository name.');
    return `c${i}:search(type:ISSUE,first:${RETURNS_PAGE},query:${JSON.stringify(closedSearch(repo,login,window,extra,scope))}){issueCount nodes{... on PullRequest{number title url closedAt merged repository{nameWithOwner} additions deletions changedFiles commits{totalCount}}}}`;
  });
  return `query{rateLimit{remaining resetAt cost} ${parts.join(' ')}}`;
}
export function parseClosed(repos,data,window){
  const items=[];let incomplete=false;
  const from=window.since?Date.parse(window.since):-Infinity,to=window.until?Date.parse(window.until):Infinity;
  repos.forEach((repo,i)=>{
    const result=data?.[`c${i}`];if(!result)return;
    if(result.issueCount>(result.nodes||[]).length)incomplete=true;
    for(const n of result.nodes||[]){
      const at=Date.parse(n?.closedAt);if(!n?.number||n.merged||!(at>=from&&at<to))continue;
      const home=n.repository?.nameWithOwner;if(home&&home.toLowerCase()!==repo.toLowerCase())continue;
      items.push({repo,number:n.number,title:n.title,url:n.url,closedAt:n.closedAt,additions:n.additions||0,deletions:n.deletions||0,changedFiles:n.changedFiles||0,commits:n.commits?.totalCount||0});
    }
  });
  items.sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt)||a.repo.localeCompare(b.repo)||a.number-b.number);
  return {items,incomplete};
}

// Reviews the login gave on other people's PRs in the same window. GitHub search finds PRs they reviewed but not
// when, so each PR carries the login's own reviews and parseReviewed keeps the PR only if one was submitted inside the
// window. One light page per repository; more are reported as incomplete rather than fetched.
export const REVIEWS_PAGE=50;
/** @param {string} repo @param {string} login @param {{since:string|null,until:string|null,all?:boolean}} window @param {string} [extra] @param {'repo'|'author'} [scope] */
export function reviewedSearch(repo,login,{since,all},extra='',scope='repo'){
  const where=scope==='author'?'':` repo:${repo}`,tail=extra?` ${extra}`:'';
  if(all)return `is:pr reviewed-by:${login} -author:${login}${where}${tail} sort:updated-desc`;
  return `is:pr reviewed-by:${login} -author:${login}${where}${tail} updated:>=${stamp(Date.parse(since))}`;
}
export function reviewedQuery(repos,login,window,{extra='',scope='repo'}={}){
  if(!validLogin(login))throw new Error('Unexpected GitHub login.');
  const parts=repos.map((repo,i)=>{
    if(!validRepo(repo))throw new Error('Unexpected repository name.');
    return `v${i}:search(type:ISSUE,first:${REVIEWS_PAGE},query:${JSON.stringify(reviewedSearch(repo,login,window,extra,scope))}){issueCount nodes{... on PullRequest{number title url merged repository{nameWithOwner} author{login} reviews(first:30,author:${JSON.stringify(login)}){nodes{state submittedAt}}}}}`;
  });
  return `query{rateLimit{remaining resetAt cost} ${parts.join(' ')}}`;
}
export function parseReviewed(repos,data,window){
  const items=[];let incomplete=false;
  const from=window.since?Date.parse(window.since):-Infinity,to=window.until?Date.parse(window.until):Infinity;
  repos.forEach((repo,i)=>{
    const result=data?.[`v${i}`];if(!result)return;
    if(result.issueCount>(result.nodes||[]).length)incomplete=true;
    for(const n of result.nodes||[]){
      if(!n?.number)continue;
      const home=n.repository?.nameWithOwner;if(home&&home.toLowerCase()!==repo.toLowerCase())continue;
      const mine=(n.reviews?.nodes||[]).filter(r=>r.state!=='PENDING'&&Date.parse(r.submittedAt)>=from&&Date.parse(r.submittedAt)<to).sort((a,b)=>Date.parse(a.submittedAt)-Date.parse(b.submittedAt));
      if(!mine.length)continue;
      const last=mine.at(-1),verdict=mine.some(r=>r.state==='APPROVED')?'APPROVED':last.state;
      items.push({repo,number:n.number,title:n.title,url:n.url,author:n.author?.login||'',merged:Boolean(n.merged),reviewedAt:last.submittedAt,verdict,rounds:mine.length});
    }
  });
  items.sort((a,b)=>Date.parse(a.reviewedAt)-Date.parse(b.reviewedAt)||a.repo.localeCompare(b.repo)||a.number-b.number);
  return {items,incomplete};
}

const DETAIL_FIELDS='files(first:100){nodes{path additions deletions}} lastCommit:commits(last:1){nodes{commit{statusCheckRollup{state contexts(first:1){checkRunCount checkRunCountsByState{state count}}}}}}';
// cursors[i] continues repos[i] after an earlier page; sizes[i] is its page size. detail:false leaves out check
// runs and file lists, which the receipt then omits for those PRs.
export function mergedQuery(repos,login,window,cursors=[],{sizes=[],detail=true,extra='',scope='repo'}={}){
  if(!validLogin(login))throw new Error('Unexpected GitHub login.');
  const parts=repos.map((repo,i)=>{
    if(!validRepo(repo))throw new Error('Unexpected repository name.');
    const after=cursors[i]?`,after:${JSON.stringify(String(cursors[i]))}`:'';
    return `r${i}:search(type:ISSUE,first:${sizes[i]||PER_PAGE}${after},query:${JSON.stringify(mergedSearch(repo,login,window,extra,scope))}){issueCount pageInfo{hasNextPage endCursor} nodes{... on PullRequest{number title url mergedAt repository{nameWithOwner} additions deletions changedFiles baseRefName headRefOid mergeCommit{oid} author{login} commits{totalCount} ${detail?DETAIL_FIELDS+' ':''}reviews(first:${detail?30:15}){totalCount nodes{state author{login}}} closingIssuesReferences(first:5){nodes{number url}}}}}`;
  });
  return `query{rateLimit{remaining resetAt cost} ${parts.join(' ')}}`;
}

const isBot=login=>/\[bot\]$|^(coderabbitai|copilot|github-actions|dependabot)$/i.test(login||'');
export const isTestPath=p=>/(^|\/)(tests?|__tests__|spec|specs|e2e)\/|\.(test|spec)\.[^/]+$|_test\.[^/]+$|(^|\/)test_[^/]+$/i.test(p);
export const isDocPath=p=>!isTestPath(p)&&/(^|\/)docs?\/|\.(md|mdx|rst|adoc)$/i.test(p);
// Line counts by file kind. Only complete file lists count, so a large PR never reports a partial share.
function fileShares(n){
  const files=n.files?.nodes;
  if(!Array.isArray(files)||files.length!==(n.changedFiles||0))return {testLines:null,docLines:null};
  const lines=pick=>files.filter(f=>pick(f.path||'')).reduce((s,f)=>s+(f.additions||0)+(f.deletions||0),0);
  return {testLines:lines(isTestPath),docLines:lines(isDocPath)};
}
// Check runs on the head commit, counted like the PR's Checks tab. Skipped and neutral runs pass there too.
// Null when GitHub omits the rollup.
const PASSING=new Set(['SUCCESS','SKIPPED','NEUTRAL']),WAITING=new Set(['QUEUED','IN_PROGRESS','PENDING','WAITING','REQUESTED']);
function checkCounts(rollup){
  const c=rollup?.contexts;
  if(!c||!Number.isInteger(c.checkRunCount)||!Array.isArray(c.checkRunCountsByState))return null;
  const sum=pick=>c.checkRunCountsByState.filter(s=>pick(s.state)).reduce((n,s)=>n+(s.count||0),0);
  const passed=sum(s=>PASSING.has(s)),waiting=sum(s=>WAITING.has(s));
  return {total:c.checkRunCount,passed,waiting,failed:Math.max(0,c.checkRunCount-passed-waiting)};
}
export function parseMerged(repos,data,window){
  const items=[];let incomplete=false;
  const from=window.since?Date.parse(window.since):-Infinity,to=window.until?Date.parse(window.until):Infinity;
  repos.forEach((repo,i)=>{
    const result=data?.[`r${i}`];if(!result)return;
    if(result.issueCount>(result.nodes||[]).length)incomplete=true;
    for(const n of result.nodes||[]){
      const at=Date.parse(n?.mergedAt);if(!n?.number||!(at>=from&&at<to))continue;
      const home=n.repository?.nameWithOwner;if(home&&home.toLowerCase()!==repo.toLowerCase())continue;
      const reviews=n.reviews?.nodes||[],author=n.author?.login;
      const people=reviews.filter(r=>r.author?.login&&r.author.login!==author&&!isBot(r.author.login));
      const approvers=[...new Set(people.filter(r=>r.state==='APPROVED').map(r=>r.author.login))];
      const reviewers=[...new Set([...approvers,...people.map(r=>r.author.login)])];
      items.push({repo,number:n.number,title:n.title,url:n.url,mergedAt:n.mergedAt,baseRefName:n.baseRefName,
        headSha:n.headRefOid||null,mergeSha:n.mergeCommit?.oid||null,...fileShares(n),
        additions:n.additions||0,deletions:n.deletions||0,changedFiles:n.changedFiles||0,commits:n.commits?.totalCount||0,
        reviews:n.reviews?.totalCount||0,approvals:approvers.length,changesRequested:reviews.filter(r=>r.state==='CHANGES_REQUESTED').length,reviewers,
        fixes:(n.closingIssuesReferences?.nodes||[]).map(x=>({number:x.number,url:x.url})),
        ci:n.lastCommit?.nodes?.[0]?.commit?.statusCheckRollup?.state||null,
        checks:checkCounts(n.lastCommit?.nodes?.[0]?.commit?.statusCheckRollup)});
    }
  });
  items.sort((a,b)=>Date.parse(a.mergedAt)-Date.parse(b.mergedAt)||a.repo.localeCompare(b.repo)||a.number-b.number);
  return {items,incomplete};
}

// A bounded map with least recently used eviction.
export function createLru(max=200){
  const map=new Map();
  return {
    get(k){if(!map.has(k))return undefined;const v=map.get(k);map.delete(k);map.set(k,v);return v;},
    // Evicts the oldest entries that are not mid-fetch.
    set(k,v){
      map.delete(k);map.set(k,v);
      for(const [key,e] of map){if(map.size<=max)break;if(key!==k&&!e?.pending)map.delete(key);}
    },
    delete:k=>map.delete(k),
    get size(){return map.size;},
    entries:()=>map.entries()
  };
}

// Shared GitHub quota: remaining and resetAt from rateLimit{}, backoffUntil from a low quota or a 403/429.
export function createQuota(){return {remaining:null,resetAt:null,backoffUntil:0};}
function noteLimit(quota,rl){if(rl){quota.remaining=rl.remaining;quota.resetAt=rl.resetAt;}}
function noteRetry(quota,error){if(Number.isFinite(error?.retryAt))quota.backoffUntil=Math.max(quota.backoffUntil,error.retryAt);}
function afterFetch(quota,now,lowWater,backoffMs){
  if(quota.remaining!=null&&quota.remaining<lowWater){
    const reset=Date.parse(quota.resetAt)||0;
    quota.backoffUntil=Math.max(quota.backoffUntil,quota.remaining<Math.max(50,lowWater/10)&&reset>now()?reset:now()+backoffMs);
  }else if(quota.remaining!=null)quota.backoffUntil=0;
}
const quotaError=quota=>Object.assign(new Error('GitHub quota is low. The receipt prints again after '+new Date(quota.backoffUntil).toISOString().slice(11,16)+' UTC.'),{backoff:true,retryAt:quota.backoffUntil});

// Parses a GraphQL body; a body with errors and no data is a failure.
function body(res){
  if(res?.errors?.length&&!res.data)throw Object.assign(new Error(res.errors[0].message||'GitHub rejected the search.'),{graphql:res.errors[0].type||true});
  return res;
}

// ttl / allTtl: freshness of a dated / all-time receipt. lowWater: remaining-quota level where new receipts wait
// for backoffMs, and where a long fetch stops early and reports itself incomplete.
// retryMs: first wait before retrying a GitHub timeout; each retry waits twice as long and asks for less.
// extra: search qualifiers added to every search. A request for a key that is already being fetched shares that
// fetch, or gets the saved receipt at once when there is one (stale while busy).
export function createMergedReceipts({graphql,now=()=>Date.now(),ttl=300000,allTtl=600000,lowWater=500,backoffMs=5*60000,retryMs=1000,
  sleep=ms=>new Promise(r=>setTimeout(r,ms)),max=200,extra='',quota=createQuota()}){
  const entries=createLru(max);
  async function ask(chunk,login,window,scope){
    const q=mergedQuery(chunk.map(s=>s.repo),login,window,chunk.map(s=>s.cursor),{sizes:chunk.map(s=>s.size),detail:chunk[0].detail,extra,scope});
    return body(await graphql(q));
  }
  async function fetchAll(repos,login,window,scope){
    const items=[],failures=[];let incomplete=false,truncated=false,requests=0,cost=0,answered=0,last=null;
    const heavy=window.all||window.long;
    let pending=repos.map(repo=>({repo,cursor:null,fetched:0,tries:0,detail:true,size:heavy?DETAIL_PAGE:PER_PAGE}));
    while(pending.length){
      const kind=pending[0].detail,batch=pending[0].tries?1:heavy?(kind?ALL_DETAIL_BATCH:ALL_LIGHT_BATCH):REPO_BATCH;
      const chunk=[],rest=[];
      for(const s of pending)(chunk.length<batch&&s.detail===kind?chunk:rest).push(s);
      let res;
      try{requests++;res=await ask(chunk,login,window,scope);}
      catch(error){
        noteRetry(quota,error);
        const f=githubFailure(error),head=chunk[0];last=error;
        if(f.transient&&head.tries<RETRIES){
          chunk.forEach(s=>s.tries++);
          await sleep(retryMs*2**(head.tries-1));
          if(chunk.length>1)pending=[head,...rest,...chunk.slice(1)];
          else{head.size=Math.max(10,Math.floor(head.size/2));pending=[head,...rest];}
          continue;
        }
        failures.push(f.message);incomplete=true;pending=f.rateLimited?[]:rest;continue;
      }
      answered++;
      if(res.errors?.length)incomplete=true;
      items.push(...parseMerged(chunk.map(s=>s.repo),res.data,window).items);
      const again=[];
      chunk.forEach((s,i)=>{
        s.tries=0;
        const r=res.data?.[`r${i}`];if(!r){incomplete=true;return;}
        s.fetched+=(r.nodes||[]).length;
        const next=r.pageInfo?.hasNextPage&&r.pageInfo.endCursor;
        if(next&&s.fetched<SEARCH_CAP){s.cursor=r.pageInfo.endCursor;if(heavy&&s.detail){s.detail=false;s.size=LIGHT_PAGE;}s.size=Math.min(s.size,SEARCH_CAP-s.fetched);again.push(s);return;}
        if((r.issueCount||0)>s.fetched||next){if(s.fetched>=SEARCH_CAP)truncated=true;else incomplete=true;}
      });
      pending=[...rest,...again];
      const rl=res.data?.rateLimit;if(rl){noteLimit(quota,rl);cost+=rl.cost||0;}
      if(pending.length&&quota.remaining!=null&&quota.remaining<lowWater){incomplete=true;break;}
    }
    if(!answered&&failures.length)throw Object.assign(new Error(failures[0]),{github:true,status:last?.status,retryAt:last?.retryAt});
    const seen=new Set(),unique=items.filter(i=>{const k=i.repo+'#'+i.number;if(seen.has(k))return false;seen.add(k);return true;});
    unique.sort((a,b)=>Date.parse(a.mergedAt)-Date.parse(b.mergedAt)||a.repo.localeCompare(b.repo)||a.number-b.number);
    // Returns are a side table: a failed or skipped search leaves them out and marks the receipt incomplete, never voids it.
    const returned=[];
    for(let k=0;k<repos.length;k+=REPO_BATCH){
      if(quota.remaining!=null&&quota.remaining<lowWater){incomplete=true;break;}
      const chunk=repos.slice(k,k+REPO_BATCH);
      try{
        requests++;
        const res=body(await graphql(closedQuery(chunk,login,window,{extra,scope})));
        const got=parseClosed(chunk,res.data,window);returned.push(...got.items);
        if(got.incomplete||res.errors?.length)incomplete=true;
        const rl=res.data?.rateLimit;if(rl){noteLimit(quota,rl);cost+=rl.cost||0;}
      }catch(error){noteRetry(quota,error);failures.push(githubFailure(error).message);incomplete=true;}
    }
    returned.sort((a,b)=>Date.parse(a.closedAt)-Date.parse(b.closedAt)||a.repo.localeCompare(b.repo)||a.number-b.number);
    // Reviews are a side table too: a failed search leaves them out and marks the receipt incomplete.
    const reviewed=[];
    for(let k=0;k<repos.length;k+=REPO_BATCH){
      if(quota.remaining!=null&&quota.remaining<lowWater){incomplete=true;break;}
      const chunk=repos.slice(k,k+REPO_BATCH);
      try{
        requests++;
        const res=body(await graphql(reviewedQuery(chunk,login,window,{extra,scope})));
        const got=parseReviewed(chunk,res.data,window);reviewed.push(...got.items);
        if(got.incomplete||res.errors?.length)incomplete=true;
        const rl=res.data?.rateLimit;if(rl){noteLimit(quota,rl);cost+=rl.cost||0;}
      }catch(error){noteRetry(quota,error);failures.push(githubFailure(error).message);incomplete=true;}
    }
    reviewed.sort((a,b)=>Date.parse(a.reviewedAt)-Date.parse(b.reviewedAt)||a.repo.localeCompare(b.repo)||a.number-b.number);
    return {items:unique,returned,reviewed,incomplete,truncated,detailed:heavy?DETAIL_PAGE:null,requests,cost,failures:failures.slice(0,3)};
  }
  function view(entry,extraFields={}){
    const t=now();
    return {...entry.value,observedAt:new Date(entry.at).toISOString(),remaining:quota.remaining,
      backoff:quota.backoffUntil>t?{until:new Date(quota.backoffUntil).toISOString(),remaining:quota.remaining}:null,...extraFields};
  }
  // login: the name searched; key: a stable id for the cache (the account's databaseId), defaulting to login.
  // scope: 'repo' searches with repo:, 'author' searches the login's merges and keeps the repositories asked for.
  async function get({login,key:who=login,repos,since,until=null,scope='repo'}){
    const window=mergedWindow(since,until,now());
    const list=[...new Set(repos)].sort(),key=[scope,String(who).toLowerCase(),window.all?'all':window.since,window.until,...list.map(r=>r.toLowerCase())].join('|');
    const t=now(),fresh=window.all||window.long?allTtl:ttl;
    let entry=entries.get(key);
    if(entry?.pending){
      if(entry.value)return view(entry,{refreshing:true});
      try{return view(await entry.pending);}catch(error){if(entry.value)return view(entry,{stale:true,error:error.message});throw error;}
    }
    if(entry?.value&&(t-entry.at<fresh||quota.backoffUntil>t))return view(entry);
    if(!list.length)return {items:[],incomplete:false,truncated:false,observedAt:new Date(t).toISOString(),remaining:quota.remaining,backoff:null};
    if(quota.backoffUntil>t)throw quotaError(quota);
    const previous=entry?.value?entry:null;
    entry={at:previous?.at||t,value:previous?.value,pending:null};entries.set(key,entry);
    const current=entry;
    current.pending=fetchAll(list,login,window,scope).then(value=>{
      current.value=value;current.at=now();
      afterFetch(quota,now,lowWater,backoffMs);
      return current;
    }).finally(()=>{current.pending=null;});
    try{return view(await current.pending);}
    catch(error){
      if(previous){current.value=previous.value;current.at=previous.at;return view(current,{stale:true,error:error.message});}
      entries.delete(key);throw error;
    }
  }
  return {get,quota,get size(){return entries.size;}};
}

// Public repositories a login has merged PRs into, newest merge first, with counts. Light fields only.
export function reposSearch(login){return `is:pr is:merged is:public author:${login} sort:created-desc`;}
export function reposQuery(login,cursor=null,{first=PER_PAGE}={}){
  if(!validLogin(login))throw new Error('Unexpected GitHub login.');
  const after=cursor?`,after:${JSON.stringify(String(cursor))}`:'';
  return `query{rateLimit{remaining resetAt cost} user(login:${JSON.stringify(login)}){databaseId login} search(type:ISSUE,first:${first}${after},query:${JSON.stringify(reposSearch(login))}){issueCount pageInfo{hasNextPage endCursor} nodes{... on PullRequest{mergedAt repository{nameWithOwner isPrivate}}}}}`;
}
export function parseRepos(nodes){
  const by=new Map();
  for(const n of nodes||[]){
    const repo=n?.repository?.nameWithOwner;if(!repo||n.repository.isPrivate!==false||!validRepo(repo))continue;
    const at=Date.parse(n.mergedAt)||0,e=by.get(repo)||{repo,count:0,lastMergedAt:null};
    e.count++;if(!e.lastMergedAt||at>Date.parse(e.lastMergedAt))e.lastMergedAt=new Date(at).toISOString();
    by.set(repo,e);
  }
  return [...by.values()].sort((a,b)=>Date.parse(b.lastMergedAt)-Date.parse(a.lastMergedAt)||b.count-a.count||a.repo.localeCompare(b.repo));
}
export const notFound=login=>Object.assign(new Error(`GitHub has no user named ${login}.`),{notFound:true});

// Repositories per login, cached ttl ms. Pages through up to SEARCH_CAP merged PRs, stopping early on low quota.
export function createRepoLookup({graphql,now=()=>Date.now(),ttl=600000,max=500,lowWater=500,backoffMs=5*60000,quota=createQuota()}){
  const entries=createLru(max);
  async function fetchRepos(login){
    const nodes=[];let cursor=null,user=null,issueCount=0,incomplete=false,requests=0;
    for(;;){
      requests++;
      let res;
      try{res=body(await graphql(reposQuery(login,cursor)));}
      catch(error){noteRetry(quota,error);if(requests>1){incomplete=true;break;}throw error;}
      noteLimit(quota,res.data?.rateLimit);
      if(requests===1){user=res.data?.user;if(!user)throw notFound(login);}
      const s=res.data?.search;if(!s)break;
      issueCount=s.issueCount||0;nodes.push(...(s.nodes||[]));
      if(!s.pageInfo?.hasNextPage||nodes.length>=SEARCH_CAP)break;
      if(quota.remaining!=null&&quota.remaining<lowWater){incomplete=true;break;}
      cursor=s.pageInfo.endCursor;
    }
    return {login:user.login,databaseId:user.databaseId,repos:parseRepos(nodes),total:issueCount,truncated:issueCount>nodes.length&&nodes.length>=SEARCH_CAP,incomplete,requests};
  }
  async function get(login){
    const key=String(login).toLowerCase(),t=now();
    let entry=entries.get(key);
    if(entry?.pending){if(entry.value)return {...entry.value,observedAt:new Date(entry.at).toISOString(),refreshing:true};const e=await entry.pending;return {...e.value,observedAt:new Date(e.at).toISOString()};}
    if(entry?.value&&(t-entry.at<ttl||quota.backoffUntil>t))return {...entry.value,observedAt:new Date(entry.at).toISOString()};
    if(quota.backoffUntil>t)throw quotaError(quota);
    const previous=entry?.value?entry:null;
    entry={at:previous?.at||t,value:previous?.value,pending:null};entries.set(key,entry);
    const current=entry;
    current.pending=fetchRepos(login).then(value=>{current.value=value;current.at=now();afterFetch(quota,now,lowWater,backoffMs);return current;}).finally(()=>{current.pending=null;});
    try{const e=await current.pending;return {...e.value,observedAt:new Date(e.at).toISOString()};}
    catch(error){
      if(previous&&!error.notFound){current.value=previous.value;current.at=previous.at;return {...previous.value,observedAt:new Date(previous.at).toISOString(),stale:true,error:error.message};}
      entries.delete(key);throw error;
    }
  }
  // The account id behind a login, from any earlier lookup.
  function known(login){return entries.get(String(login).toLowerCase())?.value||null;}
  return {get,known,quota};
}
