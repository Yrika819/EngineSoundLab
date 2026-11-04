/**
 * P5-E synthetic audio acceptance harness.
 * The EXACT EngineSynthCore used by the AudioWorklet renders deterministic
 * audio; no vehicle recordings, OEM NVH curves, or proprietary sources.
 *
 * Synthetic operational scenarios are not OEM ECU state forecasts.
 */
import { EngineSynthCore } from "../apps/web/public/synth-core.js";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

export const RATES=Object.freeze([44100,48000]);
export const CARS=Object.freeze([
  Object.freeze({id:"prius",profile:1,engine:"i4",motorRpm:4100,generatorRpm:3150}),
  Object.freeze({id:"aura",profile:2,engine:"i3",motorRpm:4900,generatorRpm:2550})
]);
const scenario=(id,label,params)=>Object.freeze({id,label,params:Object.freeze(params)});
export const SCENARIOS=Object.freeze([
 scenario("parked-silent","Stopped powertrain",{rpm:0,load:0,throttle:0,speed:0,
   combustion:0,motor:0,motorRpm:0,regen:0,generator:0,generatorRpm:0,torque:0}),
 scenario("ev-launch","EV launch",{rpm:0,load:0,throttle:.28,speed:4,
   combustion:0,motor:.42,motorRpm:1500,regen:0,generator:0,generatorRpm:0,torque:.5}),
 scenario("ev-gentle","Gentle EV acceleration",{rpm:0,load:0,throttle:.36,speed:12,
   combustion:0,motor:.58,motorRpm:3200,regen:0,generator:0,generatorRpm:0,torque:.62}),
 scenario("fuelled-accelerate","Strong fuelled acceleration",{rpm:3250,load:.85,
   throttle:.92,speed:20,combustion:1,motor:.86,motorRpm:5400,regen:0,
   generator:.65,generatorRpm:3250,torque:.9}),
 scenario("steady-cruise","Fuelled steady cruise",{rpm:2200,load:.33,
   throttle:.30,speed:25,combustion:1,motor:.31,motorRpm:4400,regen:0,
   generator:.4,generatorRpm:2300,torque:.3}),
 scenario("regen-decelerate","Motor regeneration",{rpm:0,load:0,
   throttle:0,speed:16,combustion:0,motor:.55,motorRpm:3900,regen:.75,
   generator:0,generatorRpm:0,torque:-.8}),
 scenario("soc-generation","Low-SOC generating demand (hypothetical)",{rpm:2700,load:.67,
   throttle:.36,speed:11,combustion:1,motor:.35,motorRpm:2800,regen:0,
   generator:.92,generatorRpm:2700,torque:.37}),
 scenario("unfuelled-spin","Unfuelled crankshaft rotation",{rpm:2100,load:0,
   throttle:0,speed:10,combustion:0,motor:.18,motorRpm:2800,regen:0,
   generator:0,generatorRpm:2100,torque:.1,engineMotoring:.75,generatorMotoring:.7})
]);
export const QA_SEED=0x50e2026;
const SOURCES=Object.freeze(["engine","motoring","traction","generator","tyre","wind"]);
const validRate=r=>RATES.includes(r);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function sampleParams(car,scenario) {
 if(!CARS.includes(car)) throw new RangeError("unknown car");
 if(!SCENARIOS.includes(scenario))throw new RangeError("unknown scenario");
 const p={...scenario.params};
 // Source shaft speeds are independent. Prius MG1 and Aura generator motor
 // must not be interpreted as the same proprietary transmission ratio.
 if(p.motorRpm>0)p.motorRpm=Math.round(p.motorRpm*(car.id==="aura"?1.12:1));
 if(p.generatorRpm>0)p.generatorRpm=Math.round(p.generatorRpm*(car.id==="prius"?1.10:1));
 if(p.combustion===1 && car.id==="aura") {
   p.generator=Math.min(1,p.generator*1.05);
   p.rpm+=100;
 }
 if(p.combustion===1 && car.id==="prius")p.generator*=.75;
 return p;
}
export function feed(core,car,p) {
 return core.next(p.rpm,p.load,p.throttle,p.speed,1,p.combustion,
   p.motor,p.motorRpm,p.regen,p.generator,p.generatorRpm,
   car.profile,car.profile,p.engineMotoring||0,p.torque||0,
   p.generatorMotoring||0,0,.35,0);
}
function spectrum(samples,rate) {
 const n=8192;
 if(samples.length<n)throw new RangeError("not enough samples for FFT");
 const re=new Float64Array(n),im=new Float64Array(n);
 const start=samples.length-n;
 let average=0;
 for(let i=0;i<n;i++)average+=samples[start+i];
 average/=n;
 for(let i=0;i<n;i++) {
   const hann=.5-.5*Math.cos(2*Math.PI*i/(n-1));
   re[i]=(samples[start+i]-average)*hann;
 }
 // Iterative radix-2 DFT, no optional FFT dependency.
 for(let i=1,j=0;i<n;i++){
   let bit=n>>1;
   for(;j&bit;bit>>=1)j^=bit;
   j^=bit;
   if(i<j){const t=re[i];re[i]=re[j];re[j]=t;}
 }
 for(let width=2;width<=n;width<<=1){
   const half=width>>1,angle=-2*Math.PI/width;
   const wr=Math.cos(angle),wi=Math.sin(angle);
   for(let base=0;base<n;base+=width){
     let cr=1,ci=0;
     for(let j=0;j<half;j++){
       const a=base+j,b=a+half;
       const vr=cr*re[b]-ci*im[b],vi=cr*im[b]+ci*re[b];
       re[b]=re[a]-vr;im[b]=im[a]-vi;
       re[a]+=vr;im[a]+=vi;
       const nr=cr*wr-ci*wi;
       ci=cr*wi+ci*wr;cr=nr;
     }
   }
 }
 let bass=0,mid=0,treble=0,peakPower=0,peakBin=0,centroid=0,total=0;
 for(let bin=1;bin<n/2;bin++){
   const hz=bin*rate/n,power=re[bin]*re[bin]+im[bin]*im[bin];
   if(hz<20||hz>8000)continue;
   if(hz<250)bass+=power;
   else if(hz<1500)mid+=power;
   else treble+=power;
   if(power>peakPower){peakPower=power;peakBin=bin;}
   total+=power;centroid+=power*hz;
 }
 const div=Math.max(total,1e-18);
 return {
   dominantHz:+(peakBin*rate/n).toFixed(1),
   centroidHz:+(centroid/div).toFixed(1),
   lowFraction:+(bass/div).toFixed(5),
   midFraction:+(mid/div).toFixed(5),
   highFraction:+(treble/div).toFixed(5)
 };
}
export function wavMono16(samples,rate) {
 if(!validRate(rate))throw new RangeError("sample rate");
 const buf=Buffer.alloc(44+samples.length*2);
 buf.write("RIFF",0);buf.writeUInt32LE(buf.length-8,4);
 buf.write("WAVEfmt ",8);buf.writeUInt32LE(16,16);
 buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);
 buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*2,28);
 buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);
 buf.write("data",36);buf.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++){
   const x=clamp(samples[i],-1,1);
   buf.writeInt16LE(Math.round(x<0?x*32768:x*32767),44+i*2);
 }
 return buf;
}
export function renderClip(car,scene,rate=48000,seconds=1.35) {
 if(!validRate(rate))throw new RangeError("unsupported QA sample rate");
 if(!Number.isFinite(seconds)||seconds<.25||seconds>20)throw new RangeError("seconds");
 const p=sampleParams(car,scene);
 const dsp=new EngineSynthCore(rate,QA_SEED,car.engine);
 const n=Math.floor(rate*seconds);
 const samples=new Float32Array(n);
 const sourcePower=Object.fromEntries(SOURCES.map(k=>[k,0]));
 const seen=Math.floor(n*.50);
 let squared=0,sum=0,peak=0,jump=0,previous=0,clipCount=0,observed=0;
 for(let i=0;i<n;i++){
   const value=feed(dsp,car,p);
   if(!Number.isFinite(value))throw Error("non-finite audio");
   samples[i]=value;
   peak=Math.max(peak,Math.abs(value));
   jump=Math.max(jump,Math.abs(value-previous));
   if(Math.abs(value)>=.5399)clipCount++;
   previous=value;
   if(i>=seen){
     squared+=value*value;sum+=value;observed++;
     const stage=dsp.soundstage;
     sourcePower.engine+=stage.lastEngine**2;
     sourcePower.motoring+=stage.lastMotoring**2;
     sourcePower.traction+=stage.lastTraction**2;
     sourcePower.generator+=stage.lastGenerator**2;
     sourcePower.tyre+=stage.lastTyre**2;
     sourcePower.wind+=stage.lastWind**2;
   }
 }
 const rms=Math.sqrt(squared/observed);
 const sources=Object.fromEntries(
   SOURCES.map(k=>[k,+Math.sqrt(sourcePower[k]/observed).toFixed(7)]));
 const fft=spectrum(samples,rate);
 return {car:car.id,scene:scene.id,rate,seconds,samples,
   stats:{
     rms:+rms.toFixed(7),dbfs:+(20*Math.log10(Math.max(rms,1e-12))).toFixed(2),
     dc:+(sum/observed).toFixed(7),
     peak:+peak.toFixed(7),maxSampleStep:+jump.toFixed(7),
     limiterContactSamples:clipCount,sourceRms:sources,
     electricToEngine:+((sources.traction+sources.generator)/
       Math.max(sources.engine,1e-9)).toFixed(4),
     firingEvents:dsp.firingEvents,
     spectrum:fft,
     sha256:createHash("sha256")
       .update(Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength))
       .digest("hex")
   }};
}
export function renderTransition(car,rate=48000,secondsPerLeg=.65) {
 if(!validRate(rate))throw RangeError("rate");
 const chain=["ev-gentle","fuelled-accelerate","regen-decelerate","ev-launch"];
 const scenes=chain.map(id=>SCENARIOS.find(s=>s.id===id));
 const core=new EngineSynthCore(rate,QA_SEED+13,car.engine);
 const leg=Math.floor(rate*secondsPerLeg),values=new Float32Array(leg*scenes.length);
 const blocks=[];
 let maxJump=0,previous=0,peak=0;
 for(let block=0;block<scenes.length;block++){
   const p=sampleParams(car,scenes[block]);
   let squared=0;
   for(let i=0;i<leg;i++){
     const x=feed(core,car,p),offset=block*leg+i;
     if(!Number.isFinite(x))throw Error("nonfinite transition");
     values[offset]=x;
     maxJump=Math.max(maxJump,Math.abs(x-previous));
     peak=Math.max(peak,Math.abs(x));previous=x;
     squared+=x*x;
   }
   blocks.push({name:chain[block],rms:+Math.sqrt(squared/leg).toFixed(7)});
 }
 return {samples:values,stats:{
   car:car.id,rate,legs:blocks,peak,maxJump,
   sha256:createHash("sha256").update(Buffer.from(values.buffer)).digest("hex")
 }};
}
export function checkClip(clip) {
 const {scene,stats}=clip;
 if(!Number.isFinite(stats.rms)||!Number.isFinite(stats.peak)||
    !Number.isFinite(stats.dc)||!Number.isFinite(stats.spectrum.centroidHz))
   throw Error("nonfinite QA metric: "+scene);
 if(stats.peak>.540001)throw Error("DSP limiter exceeded: "+scene);
 if(stats.maxSampleStep>.235)throw Error("click-sized sample discontinuity: "+scene);
 if(stats.limiterContactSamples>clip.samples.length*.1)
   throw Error("sustained limiter saturation: "+scene);
 if(scene==="parked-silent" && stats.peak>1e-9)
   throw Error("parked car emitted a synthetic source");
 if(scene.startsWith("ev-")||scene==="regen-decelerate"){
   if(stats.sourceRms.engine>1e-8||stats.sourceRms.generator>1e-8)
     throw Error("EV/regen leaked fuelled ICE or generator: "+scene);
 }
 if(scene==="unfuelled-spin" && stats.sourceRms.engine>1e-8)
   throw Error("nonfuelled crankshaft created combustion audio");
 if(scene==="fuelled-accelerate"){
   if(stats.sourceRms.engine<.02)throw Error("fuelled ICE became inaudible");
   if(stats.sourceRms.traction<.018)throw Error("electric drive masked");
   if(stats.electricToEngine<.15)throw Error("hybrid electrical bus masked by combustion");
 }
 if(scene==="soc-generation" && stats.sourceRms.generator<.009)
   throw Error("required generator lane became inaudible");
 if(scene==="regen-decelerate" && stats.sourceRms.traction<.012)
   throw Error("no regenerative traction");
 return true;
}
export async function runSuite(outDir="test-results/p5e-audio"){
 await mkdir(outDir,{recursive:true});
 const metrics=[],transitions=[];
 for(const rate of RATES)for(const car of CARS){
   for(const scene of SCENARIOS){
     const clip=renderClip(car,scene,rate);
     checkClip(clip);
     const name=car.id+"-"+scene.id+"-"+rate+"hz";
     await writeFile(resolve(outDir,name+".wav"),wavMono16(clip.samples,rate));
     metrics.push({car:car.id,scenario:scene.id,label:scene.label,rate,...clip.stats});
   }
   const tr=renderTransition(car,rate);
   if(tr.stats.peak>.540001||tr.stats.maxJump>.235)
     throw Error("audible transition overload: "+car.id+" "+rate);
   await writeFile(resolve(outDir,car.id+"-continuous-transitions-"+rate+"hz.wav"),
     wavMono16(tr.samples,rate));
   transitions.push(tr.stats);
 }
 const manifest={version:"p5-e.1",estimated:true,oemMeasured:false,
   provenance:"EngineSoundLab original deterministic EngineSynthCore",
   sampleRates:RATES,clipCount:metrics.length+transitions.length,
   clips:metrics,transitions};
 await writeFile(resolve(outDir,"measurements.json"),
   JSON.stringify(manifest,null,2)+"\n");
 const md=["# P5-E.1 original synthetic acoustic QA","",
   "These are deterministic engine/motor synthesis previews, NOT real-car recordings.",
   "Headphones at LOW volume; no automated physical-device audition was performed.","",
   "| Car | Scenario | Rate | Output dBFS | Peak | ICE RMS | Traction RMS | Generator RMS | Peak Hz |",
   "|---|---|---:|---:|---:|---:|---:|---:|---:|"];
 for(const m of metrics)md.push("| "+m.car+" | "+m.scenario+" | "+m.rate+
   " | "+m.dbfs+" | "+m.peak+" | "+m.sourceRms.engine+" | "+
   m.sourceRms.traction+" | "+m.sourceRms.generator+" | "+m.spectrum.dominantHz+" |");
 md.push("","All measurements are computed from this repository's synthetic waveforms;",
   "they are not in-car SPL measurements or factory PWM/inverter frequencies.","");
 await writeFile(resolve(outDir,"README.md"),md.join("\n"));
 return manifest;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const outIndex=process.argv.indexOf("--out-dir");
 const out=outIndex>=0?process.argv[outIndex+1]:undefined;
 runSuite(out).then(x=>console.log("P5-E acoustic QA PASS:",x.clipCount,
    "WAV files across",x.sampleRates.join("/"),"Hz"))
   .catch(e=>{console.error("P5-E acoustic QA FAIL",e);process.exitCode=1;});
}
