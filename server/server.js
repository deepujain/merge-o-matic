// Merge-O-Matic server: the static page in web/ plus the five JSON routes it calls. Node built-ins only.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,normalize,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {clientIp,createLimiter,errorResponse,getService,guardHeaders,limits,parseLogin,parseRepo,sameOrigin} from './lib/service.js';
import {mergedWindow} from './lib/merged-core.js';
import {resolveKey} from './lib/github-key.js';
import {createMemoryStore,createUsage,optedOut,parsePrint,skipLogin} from './lib/usage.js';

const WEB=fileURLToPath(new URL('../web/',import.meta.url));
// index.html loads its files from /games/merge-o-matic/, the path it is served at on 1xaispark.com.
const PREFIX='/games/merge-o-matic';
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const MAX_BODY=512;
const FORBIDDEN={error:'MergeOMatic only answers its own page.'};

const usage=createUsage({store:createMemoryStore()});
const printGate=createLimiter({limit:30,windowMs:10*60000});
const limitGate=createLimiter({limit:60,windowMs:10*60000});
let capacityCache=null;

function send(res,status,body,headers={}){
  const json=body===null?null:JSON.stringify(body);
  res.writeHead(status,{...guardHeaders,...(json===null?{}:{'content-type':'application/json; charset=utf-8'}),...headers});
  res.end(json??undefined);
}

function sendError(res,error){
  const {status,body,retryAfter}=errorResponse(error);
  send(res,status,body,retryAfter?{'retry-after':String(retryAfter)}:{});
}

const tooMany=(res,message,gate)=>send(res,429,{error:message},{'retry-after':String(gate.retryAfter)});

// Merged pull requests for one login in one public repository, in the payload the receipt kit prints.
async function merged(req,res,url){
  try{
    const login=parseLogin(url.searchParams.get('login')),repo=parseRepo(url.searchParams.get('repo'));
    const since=url.searchParams.get('since'),until=url.searchParams.get('until')||null;
    mergedWindow(since,until);
    const gate=limits().merged(clientIp(req.h));
    if(!gate.ok)return tooMany(res,'The printer needs a rest. Try again in a few minutes.',gate);
    send(res,200,await getService(process.env).merged({login,repo,since,until}));
  }catch(error){sendError(res,error);}
}

// Public repositories a GitHub user has merged pull requests into, newest merge first, with counts.
async function repos(req,res,url){
  try{
    const login=parseLogin(url.searchParams.get('login'));
    const gate=limits().repos(clientIp(req.h));
    if(!gate.ok)return tooMany(res,'Too many lookups. Take a breath and try again in a few minutes.',gate);
    const service=getService(process.env),result=await service.repos(login);
    send(res,200,{login:result.login,repos:result.repos,total:result.total,truncated:Boolean(result.truncated),
      incomplete:Boolean(result.incomplete),observedAt:result.observedAt,demo:service.mode==='demo'});
  }catch(error){sendError(res,error);}
}

// The lookups are GraphQL searches, so capacity is the lower of the graphql and search buckets. The browser only gets
// a share and a level, never the counts, the limit or the key. GitHub's /rate_limit does not count against the quota.
async function limit(req,res){
  const gate=limitGate(clientIp(req.h));
  if(!gate.ok)return tooMany(res,'Too many checks. Try again in a few minutes.',gate);
  const {token,source}=resolveKey({env:process.env});
  if(source==='demo')return send(res,200,{available:1,level:'plenty',resetsAt:null,demo:true});
  if(!token)return send(res,503,{error:'Lookups are not available on this server yet.'});
  try{
    const now=Date.now();
    if(!capacityCache||now-capacityCache.at>=15000){
      const r=await fetch('https://api.github.com/rate_limit',{signal:AbortSignal.timeout(8000),
        headers:{authorization:`bearer ${token}`,accept:'application/vnd.github+json','user-agent':'merge-o-matic'}});
      if(!r.ok)throw new Error(`GitHub answered HTTP ${r.status}.`);
      const resources=(await r.json())?.resources||{};
      const buckets=[resources.graphql,resources.search].filter(b=>b&&b.limit>0&&[b.remaining,b.reset].every(Number.isFinite));
      if(!buckets.length)throw new Error('GitHub sent no limits.');
      const share=b=>Math.max(0,Math.min(1,b.remaining/b.limit)),low=buckets.reduce((a,b)=>share(b)<share(a)?b:a);
      capacityCache={at:now,data:{available:Math.round(share(low)*100)/100,
        level:low.remaining<=0?'paused':share(low)<0.15?'low':'plenty',resetsAt:new Date(low.reset*1000).toISOString()}};
    }
    send(res,200,capacityCache.data);
  }catch{send(res,502,{error:'Capacity is not available right now.'});}
}

// Counts one printed receipt. Body: { visitorId, theme, range, login? }; the login only decides the owner skip.
async function print(req,res){
  const gate=printGate(clientIp(req.h));
  if(!gate.ok)return send(res,429,null,{'retry-after':String(gate.retryAfter)});
  if(optedOut(req.h))return send(res,204,null);
  let text='';
  for await(const chunk of req){text+=chunk;if(text.length>MAX_BODY)break;}
  let body=null;
  try{body=text.length<=MAX_BODY?JSON.parse(text):null;}catch{body=null;}
  const parsed=parsePrint(body);
  if(!parsed)return send(res,400,null);
  if(!skipLogin(body.login))await usage.record(parsed).catch(()=>console.error('MergeOMatic stats: could not record a print.'));
  send(res,204,null);
}

// How many receipts have been printed, in total and today (UTC). Nothing else.
async function stats(req,res){
  send(res,200,await usage.publicStats(),{'cache-control':'public, max-age=60'});
}

const ROUTES={'GET /api/fun/merged':merged,'GET /api/fun/merged/repos':repos,'GET /api/fun/merged/limit':limit,
  'POST /api/fun/merged/print':print,'GET /api/fun/merged/stats':stats};

async function serveFile(res,pathname){
  let rel=pathname==='/'||pathname===PREFIX||pathname===`${PREFIX}/`?'index.html':pathname.startsWith(`${PREFIX}/`)?pathname.slice(PREFIX.length+1):null;
  if(rel===null)return false;
  const file=normalize(join(WEB,decodeURIComponent(rel)));
  if(!file.startsWith(WEB.endsWith(sep)?WEB:WEB+sep))return false;
  try{
    if(!(await stat(file)).isFile())return false;
    res.writeHead(200,{'content-type':TYPES[extname(file)]||'application/octet-stream','x-content-type-options':'nosniff',
      'cache-control':rel==='index.html'?'no-cache':'public, max-age=300'});
    res.end(await readFile(file));
    return true;
  }catch{return false;}
}

export function createApp(){
  return createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    req.h=new Headers(Object.entries(req.headers).flatMap(([k,v])=>Array.isArray(v)?v.map(x=>[k,x]):[[k,v]]));
    // Forwarded addresses are only trusted behind a proxy that sets them; otherwise a client could pick its own limit key.
    if(process.env.TRUST_PROXY!=='1'){
      req.h.delete('x-forwarded-for');
      req.h.delete('x-forwarded-host');
      req.h.set('x-real-ip',req.socket.remoteAddress||'local');
    }
    const route=ROUTES[`${req.method} ${url.pathname}`];
    if(route){
      if(!sameOrigin(req.h))return send(res,403,req.method==='POST'?null:FORBIDDEN);
      return route(req,res,url);
    }
    if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Not found.'});
    if((req.method==='GET'||req.method==='HEAD')&&await serveFile(res,url.pathname))return;
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});
    res.end('Not found');
  });
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT)||8040;
  createApp().listen(port,()=>{
    const {source}=resolveKey({env:process.env});
    console.log(`Merge-O-Matic on http://localhost:${port} (${source==='env'?'live GitHub data':source==='demo'?'demo data: set GITHUB_PUBLIC_READ_TOKEN for live data':'no GitHub key'})`);
  });
}
