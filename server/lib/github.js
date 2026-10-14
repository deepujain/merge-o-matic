// GitHub GraphQL transport for MergeOMatic. Server only. The token never leaves this module: it is not logged,
// not echoed in errors, and not returned to callers.
const ENDPOINT='https://api.github.com/graphql';

// retry-after (seconds) or x-ratelimit-reset (epoch seconds) as epoch ms, or null.
export function retryAtFrom(headers,now=Date.now()){
  const read=name=>{const v=headers?.get?.(name);return v==null||v===''?NaN:Number(v);};
  const after=read('retry-after');
  if(Number.isFinite(after)&&after>=0)return now+after*1000;
  const reset=read('x-ratelimit-reset');
  if(Number.isFinite(reset)&&reset>0)return reset*1000;
  return null;
}

/** @param {{token:string,fetchImpl?:(url:string,init:RequestInit)=>Promise<Response>,timeoutMs?:number,now?:()=>number}} options */
export function createGithubTransport({token,fetchImpl=globalThis.fetch,timeoutMs=20000,now=()=>Date.now()}){
  if(!token)throw new Error('A GitHub token is required.');
  return async function graphql(query){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    let res;
    try{
      res=await fetchImpl(ENDPOINT,{method:'POST',cache:'no-store',signal:controller.signal,
        headers:{authorization:`bearer ${token}`,'content-type':'application/json','user-agent':'merge-o-matic',accept:'application/json'},
        body:JSON.stringify({query})});
    }catch(error){
      throw Object.assign(new Error(error?.name==='AbortError'?'GitHub timed out.':'GitHub could not be reached.'),{transient:true});
    }finally{clearTimeout(timer);}
    const limited=res.status===429||(res.status===403&&(res.headers.get('x-ratelimit-remaining')==='0'||res.headers.has('retry-after')));
    let json=null;
    try{json=await res.json();}catch{json=null;}
    if(!res.ok||!json){
      const message=limited?'GitHub rate limit reached.':String(json?.message||`GitHub answered HTTP ${res.status}.`).slice(0,200);
      throw Object.assign(new Error(message),{status:limited?429:res.status,retryAt:limited?retryAtFrom(res.headers,now()):null,transient:[502,503,504].includes(res.status)});
    }
    const rateErr=json.errors?.find(e=>e?.type==='RATE_LIMITED');
    if(rateErr)throw Object.assign(new Error('GitHub rate limit reached.'),{status:429,retryAt:retryAtFrom(res.headers,now())});
    return json;
  };
}
