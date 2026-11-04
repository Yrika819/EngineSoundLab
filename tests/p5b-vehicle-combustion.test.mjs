import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VehicleCombustionSynth, ENGINE_OPERATIONS, ICE_VOICES
} from "../apps/web/public/vehicle-combustion.js";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";

const RATE = 48000;
function renderVoice({
  rate = RATE, rpm = 3000, load = 0.7, throttle = 0.6,
  gate = 1, operation = 2, vehicle = 1, cylinders = "i4",
  seconds = 0.5, seed = 1234
} = {}) {
  const dsp = new VehicleCombustionSynth(rate, seed, cylinders);
  const count = Math.floor(rate*seconds);
  const data = new Float64Array(count);
  let rms = 0, peak = 0, maxJump = 0, last = 0;
  for(let i=0;i<count;i++){
    const v = dsp.next(rpm,load,throttle,gate,operation,vehicle);
    assert.ok(Number.isFinite(v), `NaN at sample ${i}`);
    peak = Math.max(peak,Math.abs(v));
    maxJump = Math.max(maxJump,Math.abs(v-last));
    if(i>count/2) rms += v*v;
    data[i] = v;
    last = v;
  }
  return { dsp, data, rms:Math.sqrt(rms/Math.max(1,count/2)), peak, maxJump };
}

test("P5-B: real four-stroke I4 and I3 ignition event rates at 3000 RPM",()=>{
 for(const [profile,code,wanted] of [["i4",1,100],["i3",2,75]]){
   const dsp = new VehicleCombustionSynth(RATE,31,profile);
   for(let i=0;i<RATE;i++)dsp.next(3000,0.75,0.7,1,2,code);
   dsp.firingEvents=0;
   for(let i=0;i<RATE;i++)dsp.next(3000,0.75,0.7,1,2,code);
   assert.ok(Math.abs(dsp.firingEvents-wanted)<=1,
     `${profile} ${dsp.firingEvents} wanted ${wanted}`);
   assert.equal(ICE_VOICES[code===1?"PRIUS_20":"AURA_12"].firingOrder,
     code===1?2:1.5);
 }
});

test("P5-B: non-fuelled crank rotation audibly differs from silent stopped ICE",()=>{
 const stopped=renderVoice({rpm:2500,gate:0,operation:ENGINE_OPERATIONS.STOPPED,vehicle:2});
 const unfuelled=renderVoice({rpm:2500,gate:0,operation:ENGINE_OPERATIONS.SPINNING_UNFUELLED,vehicle:2});
 assert.ok(stopped.rms<0.00001,`stopped has sound ${stopped.rms}`);
 assert.ok(unfuelled.rms>stopped.rms+0.001,
   `unfuelled shaft should have mechanical sound ${unfuelled.rms}`);
 assert.equal(stopped.dsp.firingEvents,0);
 assert.equal(unfuelled.dsp.firingEvents,0);
});

test("P5-B: starter rotation does not create combustion while RPM rises",()=>{
 const started=renderVoice({rpm:1200,gate:1,operation:ENGINE_OPERATIONS.STARTING,vehicle:2,seconds:0.7});
 assert.equal(started.dsp.firingEvents,0);
 assert.equal(started.dsp.combustion,0);
 assert.ok(started.rms>0.001);
});

test("P5-B: combustion amplitude responds to fuelled engine load",()=>{
 const low=renderVoice({rpm:2700,load:0.10,throttle:0.1,vehicle:1,seconds:0.75});
 const high=renderVoice({rpm:2700,load:0.96,throttle:0.95,vehicle:1,seconds:0.75});
 assert.ok(high.rms>low.rms*1.12,
   `engine load did not increase signal: ${low.rms} -> ${high.rms}`);
});

test("P5-B: Prius/Aura cabin tones differ beyond cylinder count",()=>{
 const prius=renderVoice({rpm:3200,load:0.72,cylinders:"i4",vehicle:1,seconds:0.6});
 const aura=renderVoice({rpm:3200,load:0.72,cylinders:"i4",vehicle:2,seconds:0.6});
 assert.notDeepEqual(prius.data.subarray(10000,11000),aura.data.subarray(10000,11000));
 assert.ok(Math.abs(prius.rms-aura.rms)>0.0002 ||
   Math.abs(prius.peak-aura.peak)>0.001);
 assert.equal(ICE_VOICES.PRIUS_20.cabinNotchDb,-4.8);
 assert.ok(ICE_VOICES.PRIUS_20.cabinNotchDb<ICE_VOICES.AURA_12.cabinNotchDb);
});

test("P5-B: smooth vehicle/ICE profile transition stays finite and bounded",()=>{
 const dsp=new EngineSynthCore(RATE,2234,"i4");
 let maxJump=0,previous=0,peak=0;
 for(let i=0;i<Math.floor(RATE*0.9);i++){
   if(i===RATE*0.3)dsp.setProfile("i3");
   if(i===RATE*0.6)dsp.setProfile("i4");
   const vehicle=i<RATE*0.3?0:i<RATE*0.6?2:1;
   const v=dsp.next(2600,0.75,0.6,0,1,1,0,0,0,0,0,0,vehicle,2);
   peak=Math.max(peak,Math.abs(v));
   maxJump=Math.max(maxJump,Math.abs(v-previous));
   previous=v;
   assert.ok(Number.isFinite(v));
 }
 assert.ok(maxJump<0.25,`profile jump ${maxJump}`);
 assert.ok(peak<0.55,`output outside safe limiter: ${peak}`);
 assert.equal(dsp.profileId,"i4");
});

test("P5-B: integrated Aura ICE has no combustion pulses in zero-fuel mode",()=>{
 const dsp=new EngineSynthCore(RATE,22,"i3");
 let sum=0,peak=0;
 for(let i=0;i<RATE;i++){
   const value=dsp.next(2000,0.8,0.8,0,1,0,0,0,0,0,0,2,2,3);
   if(i>RATE/2)sum+=value*value;
   peak=Math.max(peak,Math.abs(value));
 }
 assert.equal(dsp.vehicleIce.firingEvents,0);
 assert.ok(sum>0,`expected crank machinery while combustion off`);
 assert.ok(peak<0.55);
});

test("P5-B: vehicle combustion remains safe at 44.1/48/96 kHz",()=>{
 for(const rate of [44100,48000,96000]){
   const dsp=new EngineSynthCore(rate,9,"i3");
   let peak=0,previous=0,maxJump=0;
   for(let i=0;i<Math.floor(rate*0.2);i++){
     const fuel=i<rate*0.1?1:0;
     const operation=fuel?2:3;
     const v=dsp.next(3900,0.7,0.65,0,1,fuel,0,0,0,0,0,2,2,operation);
     peak=Math.max(peak,Math.abs(v));
     maxJump=Math.max(maxJump,Math.abs(v-previous));
     previous=v;
     assert.ok(Number.isFinite(v));
   }
   assert.ok(peak<0.55);
   assert.ok(maxJump<0.25,`rate=${rate}, max jump ${maxJump}`);
 }
});

test("P5-B: sample output repeatable with a fixed procedural seed",()=>{
 const a=renderVoice({rpm:2700,vehicle:2,cylinders:"i3",seconds:0.12,seed:77});
 const b=renderVoice({rpm:2700,vehicle:2,cylinders:"i3",seconds:0.12,seed:77});
 assert.deepEqual(a.data,b.data);
 assert.throws(()=>new VehicleCombustionSynth(0),RangeError);
 assert.throws(()=>new VehicleCombustionSynth(48000,1,"v8"),RangeError);
});

test("P5-B: invalid RPM/load/operation inputs do not produce nonfinite samples",()=>{
 const dsp=new VehicleCombustionSynth(RATE,16,"i4");
 for(const wrong of [NaN,Infinity,-Infinity,-1,1e12]){
   for(let i=0;i<160;i++){
     const v=dsp.next(wrong,wrong,wrong,wrong,wrong,wrong);
     assert.ok(Number.isFinite(v));
   }
 }
});
