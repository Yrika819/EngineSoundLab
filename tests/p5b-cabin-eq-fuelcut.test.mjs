import { test } from "node:test";
import assert from "node:assert/strict";
import { CabinEqualizer, ICE_TONE_PROFILES, VehicleIceAcoustics } from "../apps/web/public/ice-acoustics.js";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";

const RATE=48000;
/** Steady-state amplitude transfer at one sine frequency; skip IIR startup. */
function frequencyGain(hz,db,q,rate=RATE) {
  const filter=new CabinEqualizer(rate,365,db,q);
  let input=0,output=0,n=0;
  for(let i=0;i<rate*0.5;i++){
    const x=Math.sin(2*Math.PI*hz*i/rate);
    const y=filter.process(x);
    assert.ok(Number.isFinite(y));
    if(i>rate*0.3){input+=x*x;output+=y*y;n++;}
  }
  return Math.sqrt(output/input);
}

test("P5-B.1: Prius-focused EQ attenuates the 365Hz region without erasing bass",()=>{
 const p=ICE_TONE_PROFILES.PRIUS;
 const nearNotch=frequencyGain(365,p.cabinNotchDb,p.cabinNotchQ);
 const bass=frequencyGain(90,p.cabinNotchDb,p.cabinNotchQ);
 assert.ok(nearNotch>0.48&&nearNotch<0.68,`365Hz gain ${nearNotch}`);
 assert.ok(bass>nearNotch+0.22,`bass ${bass} not dominant over mid band ${nearNotch}`);
 assert.ok(bass>0.86 && bass<1.1);
});

test("P5-B.1: Aura retains a different cabin spectrum even at identical RPM",()=>{
 const p=ICE_TONE_PROFILES.PRIUS,a=ICE_TONE_PROFILES.AURA;
 const priusMid=frequencyGain(365,p.cabinNotchDb,p.cabinNotchQ);
 const auraMid=frequencyGain(365,a.cabinNotchDb,a.cabinNotchQ);
 assert.ok(auraMid>priusMid+0.16,`Prius ${priusMid} Aura ${auraMid}`);
 assert.equal(p.cabinNotchHz,365);
 assert.equal(a.cabinNotchHz,365);
 for(const rate of [44100,48000,96000]){
  const g=frequencyGain(365,p.cabinNotchDb,p.cabinNotchQ,rate);
  assert.ok(g>0.45&&g<0.7,`rate=${rate} gain=${g}`);
 }
});

test("P5-B.1: fuel cutoff stops new ignition immediately, residual pressure decays",()=>{
 const dsp=new EngineSynthCore(RATE,0x678,"i3");
 for(let i=0;i<RATE/2;i++){
  dsp.next(3000,0.82,0.75,0,1,1,0,0,0,0,0,0,2,0);
 }
 assert.ok(dsp.firingEvents>0);
 dsp.firingEvents=0;
 let near=0,far=0,n=0;
 for(let i=0;i<RATE;i++){
  const v=dsp.next(3000,0.82,0.75,0,1,0,0,0,0,0,0,2,0);
  assert.ok(Number.isFinite(v));
  if(i<4000){near+=v*v;n++;}
  if(i>RATE-4000)far+=v*v;
 }
 assert.equal(dsp.firingEvents,0,"a new ignition after fuel cut is unphysical");
 assert.ok(far<near*.01,`old resonator decay persists: near ${near} far ${far}`);
});

test("P5-B.1: short throttle request causes a decaying intake-air response",()=>{
 const synth=new VehicleIceAcoustics(RATE);
 const voice=synth.prius;
 let sample=0;
 // First run constant throttle to settle prior filter state.
 for(let i=0;i<RATE/2;i++)synth.next(.1,0,2500,.5,.1,0,1,0,1);
 assert.ok(voice.transient<0.01);
 for(let i=0;i<400;i++)synth.next(.1,0,2500,.5,.98,0,1,0,1);
 const surge=voice.transient;
 assert.ok(surge>0.5,`surge too small: ${surge}`);
 for(let i=0;i<RATE;i++)synth.next(.1,0,2500,.5,.98,0,1,0,1);
 assert.ok(voice.transient<surge*.01,`intake surge failed to fade: ${voice.transient}`);
});

test("P5-B.1: profile and fuel transitions remain smoothly limited under heavy load",()=>{
 const dsp=new EngineSynthCore(RATE,4,"i4");
 let prev=0,maxJump=0;
 for(let i=0;i<RATE;i++){
  const profile=i<RATE/3?0:i<2*RATE/3?1:2;
  const fuel=i<0.55*RATE?1:0;
  const motoring=fuel?0:.7;
  const v=dsp.next(3600,.85,.9,5,1,fuel,0,0,0,0,0,0,profile,motoring);
  assert.ok(Number.isFinite(v) && Math.abs(v)<=0.54);
  maxJump=Math.max(maxJump,Math.abs(v-prev));
  prev=v;
 }
 assert.ok(maxJump<0.24,`click: ${maxJump}`);
});

test("P5-B.1: stable EQ rejects invalid sample rate",()=>{
 assert.throws(()=>new CabinEqualizer(0,365,-4.8,.8),RangeError);
 assert.throws(()=>new CabinEqualizer(1e6,365,-4.8,.8),RangeError);
});
