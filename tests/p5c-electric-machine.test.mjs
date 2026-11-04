import { test } from "node:test";
import assert from "node:assert/strict";
import { ElectricDriveSynth, ELECTRIC_AUDIO_PROFILES } from "../apps/web/public/electric-synth.js";

function render({
  motor=0,motorRpm=2800,regen=0,generator=0,generatorRpm=2600,
  profile=1,torque=0,motoring=0,rate=48000,seconds=0.38
}={}) {
  const dsp=new ElectricDriveSynth(rate);
  let sum=0,count=0,peak=0,maxJump=0,prev=0;
  const samples=[];
  for(let i=0;i<Math.floor(rate*seconds);i++){
    const v=dsp.next(motor,motorRpm,regen,generator,generatorRpm,
      profile,torque,motoring);
    assert.ok(Number.isFinite(v));
    peak=Math.max(peak,Math.abs(v));
    maxJump=Math.max(maxJump,Math.abs(v-prev));
    prev=v;
    if(i>rate*seconds*0.6){sum+=v*v;count++;if(samples.length<500)samples.push(v);}
  }
  return {dsp,peak,maxJump,rms:Math.sqrt(sum/Math.max(1,count)),samples};
}
test("P5-C: silent vehicle has no motor/gear/inverter/generator leakage",()=>{
  const x=render({motor:0,regen:0,generator:0,motoring:0});
  assert.equal(x.peak,0);
  for(const key of ["lastTraction","lastGear","lastInverter","lastRegen",
    "lastGenerator","lastMotoring"])assert.equal(x.dsp[key],0,key);
});
test("P5-C: EV traction produces distinct motor, reduction gear and inverter orders",()=>{
  const x=render({motor:0.85,profile:1,torque:0.65});
  assert.ok(x.rms>0.01);
  assert.ok(Math.abs(x.dsp.lastTraction)>1e-6);
  assert.ok(Math.abs(x.dsp.lastGear)>1e-6);
  assert.ok(Math.abs(x.dsp.lastInverter)>1e-7);
  assert.equal(x.dsp.lastGenerator,0);
  assert.equal(x.dsp.lastMotoring,0);
});
test("P5-C: motor regen tone changes with negative torque even at equal RPM",()=>{
  const forward=render({motor:0.75,torque:0.7,regen:0,profile:2});
  const braking=render({motor:0.75,torque:-0.7,regen:0.75,profile:2});
  assert.ok(forward.rms>0.01 && braking.rms>0.01);
  assert.notDeepEqual(forward.samples,braking.samples);
  assert.equal(forward.dsp.lastRegen,0);
  assert.ok(Math.abs(braking.dsp.lastRegen)>1e-6);
});
test("P5-C: MG1/e-POWER generator and starter run without traction or combustion",()=>{
  const g=render({motor:0,generator:0.9,motoring:0,profile:1});
  const start=render({motor:0,generator:0,motoring:0.9,profile:1});
  assert.ok(g.rms>0.005);
  assert.ok(start.rms>0.005);
  assert.equal(g.dsp.lastMotoring,0);
  assert.equal(start.dsp.lastGenerator,0);
  assert.ok(Math.abs(g.dsp.lastGenerator)>1e-6);
  assert.ok(Math.abs(start.dsp.lastMotoring)>1e-6);
  assert.notDeepEqual(g.samples,start.samples);
});
test("P5-C: generator shaft pitch is independent of traction shaft pitch",()=>{
  const a=render({motor:0,generator:0.85,generatorRpm:1800});
  const b=render({motor:0,generator:0.85,generatorRpm:3300});
  assert.notDeepEqual(a.samples,b.samples);
  const c=render({motor:0,generator:0.85,generatorRpm:1800,motorRpm:6000});
  assert.deepEqual(a.samples,c.samples,
    "unpowered traction shaft must not change generator waveform");
});
test("P5-C: Prius and Aura sound maps differ without pretending factory calibration",()=>{
  const p=render({motor:0.8,generator:0.5,regen:0.3,profile:1,torque:0.6});
  const a=render({motor:0.8,generator:0.5,regen:0.3,profile:2,torque:0.6});
  assert.notDeepEqual(p.samples,a.samples);
  assert.notEqual(ELECTRIC_AUDIO_PROFILES.PRIUS.gearOrder,
    ELECTRIC_AUDIO_PROFILES.AURA.gearOrder);
  assert.notEqual(ELECTRIC_AUDIO_PROFILES.PRIUS.genOrder,
    ELECTRIC_AUDIO_PROFILES.AURA.genOrder);
});
test("P5-C: suppress upper orders above Nyquist instead of audible alias foldback",()=>{
  for(const rate of [8000,44100,48000,96000]){
    const dsp=new ElectricDriveSynth(rate);
    assert.equal(dsp.bandGain(rate),0);
    assert.equal(dsp.bandGain(999999),0);
    assert.ok(dsp.bandGain(100)>0);
    for(let i=0;i<rate/4;i++){
      const v=dsp.next(1,20000,0.8,0.8,19000,2,-1,0.3);
      assert.ok(Number.isFinite(v));
      assert.ok(Math.abs(v)<0.4,`rate=${rate}, sample=${v}`);
    }
  }
});
test("P5-C: rapidly changing vehicle/machine states do not click or overflow",()=>{
  const dsp=new ElectricDriveSynth(48000);
  let previous=0,maximumDelta=0,maximumLevel=0;
  for(let i=0;i<48000;i++){
    const profile=Math.floor(i/6000)%3;
    const v=dsp.next(i%9000<5000?0.92:0.12,3000+(i%9000)*0.18,
      i%12000<6000?0.75:0,i%10000<4000?0.8:0.1,2700,
      profile,i%11000<5000?-0.65:0.7,i%7500<2500?0.7:0);
    maximumDelta=Math.max(maximumDelta,Math.abs(v-previous));
    maximumLevel=Math.max(maximumLevel,Math.abs(v));
    previous=v;
  }
  assert.ok(maximumDelta<0.15,`sharp transient ${maximumDelta}`);
  assert.ok(maximumLevel<0.4,`gain overflow ${maximumLevel}`);
});
test("P5-C: malformed input is clamped and deterministic replay is stable",()=>{
  assert.throws(()=>new ElectricDriveSynth(0),RangeError);
  const dsp=new ElectricDriveSynth();
  for(const value of [NaN,Infinity,-Infinity,-1e12,1e12]){
    for(let i=0;i<128;i++){
      const v=dsp.next(value,value,value,value,value,value,value,value);
      assert.ok(Number.isFinite(v));
    }
  }
  assert.deepEqual(render({motor:.7,generator:.6,torque:-.2}).samples,
    render({motor:.7,generator:.6,torque:-.2}).samples);
});
