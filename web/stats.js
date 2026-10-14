// Merge-O-Matic usage stats, the browser half. After a receipt prints, recordPrint sends the page style, the range
// and a random visitor id kept in localStorage (mom-visitor). No cookies, no fingerprinting, nothing else. The id is
// made on the first print, never sent with anything but a print, and the server stores only salted hashes of it.
// The looked-up GitHub login goes along only so the server can skip the owner's test prints; it is never stored.
// Browsers with Do Not Track or Global Privacy Control on send nothing at all.

export const VISITOR_KEY='mom-visitor';
export const PRINT_URL='/api/fun/merged/print';
export const STATS_URL='/api/fun/merged/stats';
const THEMES=['normal','halloween','crayon'];
const RANGES=['week','month','quarter','year','all'];
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function uuid(crypto){
  if(typeof crypto?.randomUUID==='function')return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));
  b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function optedOut(nav){
  return nav?.doNotTrack==='1'||nav?.globalPrivacyControl===true||nav?.globalPrivacyControl==='1';
}

/** The browser pieces are injectable for tests; the defaults are the real ones. */
export function createStats({
  nav=globalThis.navigator,
  storage=(()=>{try{return globalThis.localStorage;}catch{return null;}})(),
  fetchImpl=globalThis.fetch?.bind(globalThis),
  crypto=globalThis.crypto,
}={}){
  function visitorId(){
    try{
      const saved=storage?.getItem(VISITOR_KEY);
      if(saved&&UUID_RE.test(saved))return saved;
      const id=uuid(crypto);
      storage?.setItem(VISITOR_KEY,id);
      return id;
    }catch{return null;}
  }
  return {
    // Fire and forget: never throws, never waits, never retries.
    recordPrint({theme,range,login}={}){
      try{
        // A past year (year:2024) counts as year: the stats never learn which one.
        if(/^year:\d{4}$/.test(range||''))range='year';
        if(optedOut(nav)||!THEMES.includes(theme)||!RANGES.includes(range))return false;
        const id=visitorId();
        if(!id)return false;
        const body=JSON.stringify({visitorId:id,theme,range,...(typeof login==='string'&&login.length<=39?{login}:{})});
        if(typeof nav?.sendBeacon==='function'&&nav.sendBeacon(PRINT_URL,new Blob([body],{type:'application/json'})))return true;
        fetchImpl?.(PRINT_URL,{method:'POST',body,keepalive:true,credentials:'omit',headers:{'content-type':'application/json'}}).catch(()=>{});
        return true;
      }catch{return false;}
    },
    // { printedTotal, printedToday }, or null when stats are unavailable.
    async fetchStats(){
      try{
        const res=await fetchImpl(STATS_URL,{credentials:'omit'});
        if(!res.ok)return null;
        const data=await res.json();
        return Number.isFinite(data?.printedTotal)&&Number.isFinite(data?.printedToday)
          ?{printedTotal:data.printedTotal,printedToday:data.printedToday}:null;
      }catch{return null;}
    },
  };
}

let shared=null;
const stats=()=>(shared??=createStats());
export const recordPrint=options=>stats().recordPrint(options);
export const fetchStats=()=>stats().fetchStats();
