// Makes the Merge-O-Matic hackathon demo voice-over on macOS: one AAC clip per step of demo-script.js, read by `say`
// and encoded by ffmpeg, and voice.json with each clip's length in seconds, which demo.js uses for timing.
// Usage: node tools/merge-o-matic-voice.mjs [voice=Samantha] [words-per-minute=172]
import {execFileSync} from 'node:child_process';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const dir=new URL('../web/',import.meta.url);
const out=fileURLToPath(new URL('demo/voice/',dir));
const {STEPS}=await import(new URL('demo-script.js',dir));
const [voice='Samantha',rate='172']=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const lengths={};
for(const step of STEPS){
  const aiff=`${out}${step.id}.aiff`,m4a=`${out}${step.id}.m4a`;
  execFileSync('say',['-v',voice,'-r',rate,'-o',aiff,step.say||step.text]);
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',aiff,'-ac','1','-c:a','aac','-b:a','64k','-movflags','+faststart',m4a]);
  rmSync(aiff);
  const secs=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',m4a],{encoding:'utf8'});
  lengths[step.id]=Number(Number(secs).toFixed(2));
  if(!(lengths[step.id]>0))throw new Error(`${step.id}: say made an empty clip`);
  console.log(step.id,lengths[step.id]);
}
writeFileSync(`${out}voice.json`,JSON.stringify(lengths,null,1)+'\n');
console.log('total',Object.values(lengths).reduce((a,b)=>a+b,0).toFixed(1),'s');
