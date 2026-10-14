// MergeOMatic usage stats: receipts printed, daily and monthly visitors, and nothing personal.
//
// The page keeps a random UUID in localStorage (mom-visitor) and sends it only with a print. The server never stores
// it: it keeps HMAC-SHA256(salt, visitorId), truncated, once with a salt for the UTC day and once with a salt for the
// UTC month. Salts are random, server-side only, and deleted after 31 days (daily) or when their month is over
// (monthly), so old hashes cannot be recomputed or linked to a visitor, a person or each other. IP addresses, user
// agents, GitHub logins, repositories and the raw visitor id are never stored and never logged.
//
// Counts live in memory and reset when the server restarts. A store with the same interface as createMemoryStore can
// keep them somewhere durable.
import {createHmac,randomBytes} from 'node:crypto';

export const THEMES=['normal','halloween','crayon'];
// Retired page styles: pages cached before they went still send them, and old rows still hold them. Both count as Normal.
const RETIRED_THEMES=new Set(['varsity','classic']);
export const themeOf=theme=>RETIRED_THEMES.has(theme)?'normal':theme;
// today and yesterday come from pages cached before the ranges changed; a past year arrives as year.
export const RANGES=['week','month','quarter','year','all','today','yesterday'];
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const HASH_LENGTH=16;
const DAY_MS=86400000;

// A print event, or null. Only these three fields are read; anything else in the body is ignored.
/** @returns {{visitorId:string,theme:string,range:string}|null} */
export function parsePrint(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return null;
  const {visitorId,theme,range}=body;
  if(typeof visitorId!=='string'||!UUID_RE.test(visitorId))return null;
  if(typeof theme!=='string'||!THEMES.includes(themeOf(theme)))return null;
  if(typeof range!=='string'||!RANGES.includes(range))return null;
  return {visitorId:visitorId.toLowerCase(),theme:themeOf(theme),range};
}

// Test prints from the owner's own GitHub logins (MOM_SKIP_LOGINS, comma separated) are never counted. The page sends
// the login only for this check; it is dropped here and never stored or logged.
export const skipLogins=(env=process.env)=>new Set(String(env.MOM_SKIP_LOGINS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
export const skipLogin=(login,env=process.env)=>typeof login==='string'&&skipLogins(env).has(login.trim().toLowerCase());

// Browsers that ask not to be tracked are not counted, whatever the page sends.
export const optedOut=headers=>headers.get('dnt')==='1'||headers.get('sec-gpc')==='1';

export const hashVisitor=(salt,visitorId)=>createHmac('sha256',salt).update(visitorId).digest('hex').slice(0,HASH_LENGTH);

export const dayKey=t=>new Date(t).toISOString().slice(0,10);
export const monthKey=t=>`${new Date(t).toISOString().slice(0,7)}-01`;
const addDays=(day,n)=>dayKey(Date.parse(`${day}T00:00:00Z`)+n*DAY_MS);
const addMonths=(month,n)=>{const d=new Date(`${month}T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);return monthKey(d.getTime());};

// Print counts and hashed visitors, in memory.
export function createMemoryStore(){
  const prints=new Map(),daily=new Set(),monthly=new Set(),salts=new Map();
  const drop=(set,before)=>{for(const k of set)if(k.slice(0,10)<before)set.delete(k);};
  return {
    kind:'memory',
    rows:{prints,daily,monthly,salts},
    async salt(kind,period,candidate){
      const k=`${kind}|${period}`;
      if(!salts.has(k))salts.set(k,candidate);
      return salts.get(k);
    },
    async record({day,month,theme,dayHash,monthHash}){
      const k=`${day}|${theme}`;
      prints.set(k,(prints.get(k)||0)+1);
      daily.add(`${day}|${dayHash}`);
      monthly.add(`${month}|${monthHash}`);
    },
    async prune({visitorsBefore,monthsBefore,daySaltsBefore,monthSaltsBefore}){
      drop(daily,visitorsBefore);
      drop(monthly,monthsBefore);
      for(const k of salts.keys()){
        const [kind,period]=k.split('|');
        if(period<(kind==='day'?daySaltsBefore:monthSaltsBefore))salts.delete(k);
      }
    },
    async totals(day){
      let total=0,today=0;
      for(const [k,n] of prints){total+=n;if(k.startsWith(`${day}|`))today+=n;}
      return {total,today};
    },
  };
}

// The usage service on top of a store: hashing, dedupe, pruning and the public counter.
export function createUsage({store,now=()=>Date.now(),salt=()=>randomBytes(32).toString('hex'),dedupeMs=5000,
  statsTtlMs=60000,pruneEveryMs=3600000,maxRecent=10000}){
  const salts=new Map(),recent=new Map();
  let lastPrune=0,cached=null;

  async function saltFor(kind,period){
    const k=`${kind}|${period}`;
    if(!salts.has(k)){
      const value=await store.salt(kind,period,salt());
      if(salts.size>8)salts.clear();
      salts.set(k,value);
    }
    return salts.get(k);
  }

  return {
    mode:store.kind,
    // Counts one print. Returns whether it counted, never anything about the visitor.
    async record({visitorId,theme}){
      const t=now(),day=dayKey(t),month=monthKey(t);
      const dayHash=hashVisitor(await saltFor('day',day),visitorId);
      // Keyed by the day hash, so even the dedupe memory never holds the raw id.
      const last=recent.get(dayHash);
      if(last!==undefined&&t-last<dedupeMs)return {counted:false};
      recent.delete(dayHash);
      recent.set(dayHash,t);
      if(recent.size>maxRecent)recent.delete(recent.keys().next().value);
      const monthHash=hashVisitor(await saltFor('month',month),visitorId);
      await store.record({day,month,theme,dayHash,monthHash});
      if(t-lastPrune>=pruneEveryMs){
        lastPrune=t;
        try{
          await store.prune({visitorsBefore:addDays(day,-35),monthsBefore:addMonths(month,-13),daySaltsBefore:addDays(day,-31),monthSaltsBefore:month});
        }catch{console.warn('MergeOMatic stats: could not prune old rows; will retry later.');}
      }
      return {counted:true};
    },
    // The public counter for the page's popover, cached for a minute.
    async publicStats(){
      const t=now(),day=dayKey(t);
      if(cached&&cached.day===day&&t-cached.at<statsTtlMs)return cached.data;
      const {total,today}=await store.totals(day);
      const data={printedTotal:total,printedToday:today};
      cached={day,at:t,data};
      return data;
    }
  };
}
