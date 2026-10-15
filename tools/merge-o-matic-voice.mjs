// Makes the Merge-O-Matic hackathon demo voice-over: one AAC clip per step of demo-script.js, encoded by ffmpeg, and
// voice.json with each clip's length in seconds, which demo.js uses for timing.
// With --kokoro the clips are read by Kokoro, a local neural voice (pip install kokoro-onnx soundfile, plus
// kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases, all in <dir>); otherwise
// by macOS `say`.
// Usage: node tools/merge-o-matic-voice.mjs --kokoro <dir> [voice=af_bella] [speed=1]
//        node tools/merge-o-matic-voice.mjs [voice=Samantha] [words-per-minute=172]
import {execFileSync} from 'node:child_process';
import {mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const KOKORO=`import sys, soundfile as sf
from kokoro_onnx import Kokoro
d, voice, speed = sys.argv[1], sys.argv[2], float(sys.argv[3])
k = Kokoro(d + '/kokoro-v1.0.onnx', d + '/voices-v1.0.bin')
for line in sys.stdin:
    out, text = line.rstrip('\\n').split('\\t', 1)
    samples, rate = k.create(text, voice=voice, speed=speed, lang='en-us')
    sf.write(out, samples, rate)
`;
const dir=new URL('../web/',import.meta.url);
const out=fileURLToPath(new URL('demo/voice/',dir));
const {STEPS}=await import(new URL('demo-script.js',dir));
const args=process.argv.slice(2),kokoro=args[0]==='--kokoro'?args[1]:null;
mkdirSync(out,{recursive:true});
for(const f of readdirSync(out))if(f.endsWith('.m4a'))rmSync(join(out,f));
const raw=id=>`${out}${id}.${kokoro?'wav':'aiff'}`;
if(kokoro){
  const [voice='af_bella',speed='1']=args.slice(2);
  const lines=STEPS.map(s=>`${raw(s.id)}\t${(s.say||s.text).replace(/\s+/g,' ')}`).join('\n')+'\n';
  execFileSync(join(kokoro,'venv/bin/python'),['-c',KOKORO,kokoro,voice,speed],{input:lines,stdio:['pipe','inherit','inherit']});
}else{
  const [voice='Samantha',rate='172']=args;
  for(const s of STEPS)execFileSync('say',['-v',voice,'-r',rate,'-o',raw(s.id),s.say||s.text]);
}
const lengths={};
for(const step of STEPS){
  const m4a=`${out}${step.id}.m4a`;
  execFileSync('ffmpeg',['-y','-loglevel','error','-i',raw(step.id),'-ac','1','-c:a','aac','-b:a','64k','-movflags','+faststart',m4a]);
  rmSync(raw(step.id));
  const secs=execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',m4a],{encoding:'utf8'});
  lengths[step.id]=Number(Number(secs).toFixed(2));
  if(!(lengths[step.id]>0))throw new Error(`${step.id}: the voice made an empty clip`);
  console.log(step.id,lengths[step.id]);
}
writeFileSync(`${out}voice.json`,JSON.stringify(lengths,null,1)+'\n');
console.log('total',Object.values(lengths).reduce((a,b)=>a+b,0).toFixed(1),'s');
