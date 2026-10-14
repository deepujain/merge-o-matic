// The GitHub key MergeOMatic uses: an optional stored key, else GITHUB_PUBLIC_READ_TOKEN, else demo data outside
// production. The key stays on the server: it never goes back to the browser and is never logged.
import {createGithubTransport} from './github.js';

// Fine-grained keys start with github_pat_; classic ones with ghp_. Both are accepted, fine-grained is advised.
export const KEY_RE=/^(github_pat_[A-Za-z0-9_]{20,255}|ghp_[A-Za-z0-9]{30,255})$/;
export const validKey=key=>typeof key==='string'&&KEY_RE.test(key);

export function maskKey(key){
  const k=String(key||'');
  if(!k)return null;
  return `${k.startsWith('github_pat_')?'github_pat_':k.startsWith('ghp_')?'ghp_':''}••••${k.slice(-4)}`;
}

// Which key the merged routes use: the saved one first, then the environment, then demo data outside production.
/** @param {{stored?:string|null,env?:Record<string,string|undefined>}} options @returns {{token:string,source:string}} */
export function resolveKey({stored,env=process.env}){
  if(stored)return {token:stored,source:'stored'};
  if(env.GITHUB_PUBLIC_READ_TOKEN)return {token:env.GITHUB_PUBLIC_READ_TOKEN,source:'env'};
  return {token:'',source:env.NODE_ENV==='production'?'none':'demo'};
}

// Asks GitHub who the key belongs to and how much quota is left.
/** @param {string} token @param {{fetchImpl?:(url:string,init:RequestInit)=>Promise<Response>}} [options] */
export async function testKey(token,{fetchImpl=globalThis.fetch}={}){
  const graphql=createGithubTransport({token,fetchImpl,timeoutMs:10000});
  const res=await graphql('query{viewer{login} rateLimit{limit remaining resetAt}}');
  if(res.errors?.length&&!res.data)throw Object.assign(new Error(String(res.errors[0].message||'GitHub rejected the key.').slice(0,200)),{graphql:true});
  const rl=res.data?.rateLimit||{};
  return {login:res.data?.viewer?.login||null,limit:rl.limit??null,remaining:rl.remaining??null,resetAt:rl.resetAt||null};
}
