// MergeOMatic service: one GitHub quota, repo lookup and receipt cache per server process, plus request guards.
// The key is an optional stored key, else GITHUB_PUBLIC_READ_TOKEN. Without either, development serves
// labelled demo data and production answers with a friendly error. Demo data never reaches production.
import {createGithubTransport} from './github.js';
import {resolveKey} from './github-key.js';
import {createMergedReceipts,createQuota,createRepoLookup,githubFailure,mergedWindow,scopeProbeQuery,validLogin,validRepo} from './merged-core.js';

// Bump when cached receipts or the service shape change, so a dev server that keeps globalThis across reloads rebuilds.
const SERVICE_VERSION=2;
export const UNAVAILABLE='MergeOMatic is resting. GitHub access is not configured on this server yet.';

/** @param {Record<string,string|undefined>} [env] @param {string|null} [stored] */
export function serviceMode(env=process.env,stored=null){
  const {source}=resolveKey({stored,env});
  return source==='stored'||source==='env'?'live':source==='demo'?'demo':'off';
}

// Deterministic 32-bit hash for demo data.
function hash(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const DEMO_REPOS=[['NVIDIA/NemoClaw',96,0.2],['NVIDIA/OpenShell',12,30],['octo-org/hello-world',3,120]];
const DEMO_TITLES=['Tidy the onboarding copy','Retry flaky network calls','Add a status badge to the header','Speed up the sandbox boot',
  'Document the release checklist','Handle empty config files','Guard against duplicate webhooks','Cache repository metadata',
  'Fix a typo in the error message','Split the settings page into sections','Add tests for the retry helper','Clean up unused imports'];

export function demoRepos(login,now=Date.now()){
  return {login,databaseId:null,demo:true,truncated:false,incomplete:false,total:DEMO_REPOS.reduce((s,r)=>s+r[1],0),
    repos:DEMO_REPOS.map(([repo,count,daysAgo])=>({repo,count,lastMergedAt:new Date(now-daysAgo*86400000).toISOString()})),
    observedAt:new Date(now).toISOString()};
}

function demoItem(login,repo,n,at){
  const h=hash(`${login}|${repo}|${n}`),add=10+h%400,del=h%120,files=1+h%9,tests=h%3?Math.floor(add*0.3):0,docs=h%4?0:Math.floor(add*0.2);
  const approvals=h%5===0?2:1,total=4+h%8,failed=h%11===0?1:0;
  return {repo,number:n,title:DEMO_TITLES[h%DEMO_TITLES.length],url:null,mergedAt:new Date(at).toISOString(),baseRefName:'main',
    headSha:null,mergeSha:null,testLines:tests,docLines:docs,additions:add,deletions:del,changedFiles:files,commits:1+h%6,
    reviews:approvals+h%3,approvals,changesRequested:h%7===0?1:0,reviewers:approvals>1?['reviewer-one','reviewer-two']:['reviewer-one'],
    fixes:[],ci:failed?'FAILURE':'SUCCESS',checks:{total,passed:total-failed,waiting:0,failed}};
}

// Demo receipt for one repo and window: about two merges a day, none in the future.
export function demoMerged({login,repo,since,until=null,now=Date.now()}){
  const window=mergedWindow(since,until,now),items=[];
  const count=DEMO_REPOS.find(r=>r[0].toLowerCase()===repo.toLowerCase())?.[1]||5;
  const end=Math.min(window.until?Date.parse(window.until):now,now);
  if(window.all){
    for(let k=0;k<count;k++)items.push(demoItem(login,repo,1000+k,now-(count-k)*2.5*3600000*((hash(repo)%3)+1)));
  }else{
    const start=Date.parse(window.since);
    for(let day=Math.floor(start/86400000);day*86400000<end;day++){
      for(let k=0;k<3;k++){
        const at=day*86400000+((hash(`${repo}|${day}|${k}`)%86400000));
        if(at>=start&&at<end&&(k<2||hash(day)%2))items.push(demoItem(login,repo,1000+(day%500)*3+k,at));
      }
    }
  }
  items.sort((a,b)=>Date.parse(a.mergedAt)-Date.parse(b.mergedAt));
  return {items,incomplete:false,truncated:false,detailed:null,requests:0,cost:0,failures:[],observedAt:new Date(now).toISOString(),
    remaining:null,backoff:null,demo:true};
}

// Sliding-window limiter per key. Bounded so a flood of addresses cannot grow memory without limit.
export function createLimiter({limit,windowMs,now=()=>Date.now(),maxKeys=5000}){
  const hits=new Map();
  return function take(key){
    const t=now(),list=(hits.get(key)||[]).filter(x=>t-x<windowMs);
    if(list.length>=limit){hits.set(key,list);return {ok:false,retryAfter:Math.max(1,Math.ceil((list[0]+windowMs-t)/1000))};}
    list.push(t);hits.delete(key);hits.set(key,list);
    if(hits.size>maxKeys)hits.delete(hits.keys().next().value);
    return {ok:true,remaining:limit-list.length};
  };
}

// The load balancer appends the address it saw, so the rightmost X-Forwarded-For entry is the one to trust.
export function clientIp(headers){
  const xff=headers.get('x-forwarded-for');
  if(xff){const last=xff.split(',').map(s=>s.trim()).filter(Boolean).pop();if(last)return last;}
  return headers.get('x-real-ip')||'local';
}

// Only pages on this site may call these routes. Requests without browser origin metadata (curl, a pasted URL)
// pass; cross-site browser requests do not.
export function sameOrigin(headers){
  const site=headers.get('sec-fetch-site');
  if(site&&site!=='same-origin'&&site!=='none')return false;
  const origin=headers.get('origin');
  if(!origin)return true;
  const host=headers.get('x-forwarded-host')||headers.get('host');
  try{return new URL(origin).host===host;}catch{return false;}
}

export const guardHeaders={'cache-control':'no-store','x-content-type-options':'nosniff',vary:'Origin'};

// Some keys get zero results, and no error, from any search scoped to certain owners with repo:, org: or user:,
// while the same PRs appear in an author-only search. The repo lookup is author-only, so it still counts them.
// When a repo-scoped receipt is empty but the lookup counted merges in that repository, one all-time repo-scoped
// probe tells the two cases apart. A hidden owner is remembered for this key, and its receipts search by author and
// keep only that repository's PRs.
/** @param {{graphql:(q:string)=>Promise<any>,lookup:any,receipts:any,hidden:Map<string,boolean>}} deps */
export function mergedWithScope({graphql,lookup,receipts,hidden}){
  return async function merged({login,repo,since,until}){
    const user=lookup.known(login)||await lookup.get(login);
    const owner=repo.split('/')[0].toLowerCase(),ask=scope=>receipts.get({login:user.login,key:user.databaseId??login,repos:[repo],since,until,scope});
    let result=await ask(hidden.get(owner)?'author':'repo');
    const counted=user.repos?.find(r=>r.repo.toLowerCase()===repo.toLowerCase())?.count||0;
    if(!hidden.has(owner)&&counted>0&&!result.items?.length&&!result.incomplete){
      let probe=null;
      try{probe=await graphql(scopeProbeQuery(repo,user.login,'is:public'));}catch{probe=null;}
      const count=probe?.data?.r0?.issueCount;
      if(Number.isInteger(count)){
        hidden.set(owner,count===0);
        if(count===0)result=await ask('author');
      }
    }
    return {...result,login:user.login,repos:[repo]};
  };
}

// stored: an optional key from a key store, or null. A different key builds a fresh service with its own quota.
/** @param {Record<string,string|undefined>} [env] @param {string|null} [stored] */
export function getService(env=process.env,stored=null){
  const {token}=resolveKey({stored,env});
  const g=globalThis;
  if(g.__mergeOMatic?.service&&g.__mergeOMatic.token===token&&g.__mergeOMatic.version===SERVICE_VERSION)return g.__mergeOMatic.service;
  const mode=serviceMode(env,stored);
  let service;
  if(mode==='live'){
    const graphql=createGithubTransport({token}),quota=createQuota();
    const lookup=createRepoLookup({graphql,quota}),receipts=createMergedReceipts({graphql,quota,extra:'is:public'});
    service={mode,quota,
      repos:login=>lookup.get(login),
      merged:mergedWithScope({graphql,lookup,receipts,hidden:new Map()})};
  }else if(mode==='demo'){
    service={mode,quota:null,
      repos:async login=>demoRepos(login),
      merged:async({login,repo,since,until})=>({...demoMerged({login,repo,since,until}),login,repos:[repo]})};
  }else{
    const off=async()=>{throw Object.assign(new Error(UNAVAILABLE),{unavailable:true});};
    service={mode,quota:null,repos:off,merged:off};
  }
  const guards=limits();
  g.__mergeOMatic={token,version:SERVICE_VERSION,service,limits:guards};
  return service;
}
export const limits=()=>{
  const g=globalThis;
  g.__mergeOMatic??={token:null,service:null,limits:null};
  g.__mergeOMatic.limits??={merged:createLimiter({limit:20,windowMs:10*60000}),repos:createLimiter({limit:30,windowMs:10*60000})};
  return g.__mergeOMatic.limits;
};

// Maps a service error to an HTTP status and a message a person can act on. Never includes request headers.
export function errorResponse(error){
  if(error?.input)return {status:422,body:{error:error.message,input:true}};
  if(error?.notFound)return {status:404,body:{error:error.message}};
  if(error?.unavailable)return {status:503,body:{error:error.message}};
  if(error?.backoff||error?.status===429){
    const retryAfter=Number.isFinite(error.retryAt)?Math.max(1,Math.ceil((error.retryAt-Date.now())/1000)):60;
    return {status:429,retryAfter,body:{error:error.message||'GitHub rate limit reached. Try again after the reset.'}};
  }
  const fromGithub=error?.graphql||error?.status||error?.transient;
  const message=error?.github?error.message:fromGithub?githubFailure(error).message:'GitHub could not complete the search. Try again in a moment.';
  return {status:502,body:{error:message}};
}

export function parseLogin(value){
  const login=String(value||'').trim().replace(/^@/,'');
  if(!validLogin(login))throw Object.assign(new Error('Enter a GitHub username, like octocat.'),{input:true});
  return login;
}
export function parseRepo(value){
  const repo=String(value||'').trim();
  if(!validRepo(repo))throw Object.assign(new Error('Choose one repository, like owner/name.'),{input:true});
  return repo;
}
