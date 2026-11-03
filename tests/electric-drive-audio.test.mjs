import { test } from "node:test";
import assert from "node:assert/strict";
import { ElectricDriveSynth } from "../apps/web/public/electric-synth.js";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";

const RATE = 48000;
function render({
  motor=0, motorRpm=2300, regen=0, generator=0, generatorRpm=2800,
  profile=0, seconds=0.45, combustion=0
} = {}) {
  const core = new EngineSynthCore(RATE, 0x345678, "i3");
  const data = new Float32Array(Math.floor(RATE*seconds));
  let peak=0, maxJump=0, previous=0, energy=0, n=0;
  for (let i=0; i<data.length; i++) {
    const value=core.next(2400,0.6,0.6,0,1,combustion,
      motor,motorRpm,regen,generator,generatorRpm,profile);
    data[i]=value;
    peak=Math.max(peak,Math.abs(value));
    maxJump=Math.max(maxJump,Math.abs(value-previous));
    previous=value;
    if (i > data.length*0.6) {energy+=value*value;n++;}
  }
  return {data,peak,maxJump,rms:Math.sqrt(energy/Math.max(1,n))};
}
test("no traction, no generation, no regen, no combustion remains silent",()=>{
  assert.ok(render({motor:0,regen:0,generator:0}).rms<1e-7);
});
test("EV traction whine does not need the engine running",()=>{
  const quiet=render({motor:0}).rms;
  for (const profile of [0,1,2]) {
    const moving=render({motor:0.9,motorRpm:2600,profile}).rms;
    assert.ok(moving>quiet+0.006,`profile ${profile} motor silent (${moving})`);
  }
});
test("engine-driven generator has its own independent oscillator",()=>{
  const generator=render({motor:0,generator:0.75,generatorRpm:3000}).rms;
  const motor=render({motor:0.75,generator:0,motorRpm:3000}).rms;
  assert.ok(generator>0.006,`generator silent ${generator}`);
  assert.ok(motor>0.006,`motor silent ${motor}`);
  assert.notEqual(generator,motor);
});
test("regen braking adds a distinct sound component while ICE is off",()=>{
  const propulsion=render({motor:0.65,motorRpm:2400,regen:0,profile:2});
  const recuperation=render({motor:0.65,motorRpm:2400,regen:0.8,profile:2});
  let largestDifference=0;
  for(let i=0;i<propulsion.data.length;i++)
    largestDifference=Math.max(largestDifference,
      Math.abs(propulsion.data[i]-recuperation.data[i]));
  assert.ok(largestDifference>0.008,`regen timbre unchanged: ${largestDifference}`);
});
test("Prius and Aura electric tone maps are different, not factory-calibrated",()=>{
  const prius=render({motor:0.85,motorRpm:2800,generator:0.35,generatorRpm:2100,profile:1});
  const aura=render({motor:0.85,motorRpm:2800,generator:0.35,generatorRpm:2100,profile:2});
  assert.notDeepEqual(prius.data,aura.data);
  assert.ok(prius.rms>0.008 && aura.rms>0.008);
});
test("engine combustion remains separate from generation and motor",()=>{
  const electric=render({motor:0.7,generator:0.6,combustion:0}).rms;
  const combined=render({motor:0.7,generator:0.6,combustion:1}).rms;
  assert.ok(electric>0.006);
  assert.ok(combined>electric);
});
test("DSP handles rapid state and model switching without clipped samples",()=>{
  const synth=new ElectricDriveSynth(RATE);
  let maxJump=0, maxAmplitude=0, previous=0;
  for(let i=0;i<RATE;i++){
    const profile=Math.floor(i/4800)%3;
    const value=synth.next(i%9000<4500?0.9:0.1,3500,
      i%12000<6000?0.8:0, i%11000<6000?0.7:0.1,2400,profile);
    maxJump=Math.max(maxJump,Math.abs(value-previous));
    maxAmplitude=Math.max(maxAmplitude,Math.abs(value));
    previous=value;
    assert.ok(Number.isFinite(value));
  }
  assert.ok(maxJump<0.15,`electric click: ${maxJump}`);
  assert.ok(maxAmplitude<0.4,`unexpected electric gain: ${maxAmplitude}`);
});
test("invalid inputs and sample rates cannot destabilize electric synthesis",()=>{
  assert.throws(()=>new ElectricDriveSynth(0),RangeError);
  assert.throws(()=>new ElectricDriveSynth(384000),RangeError);
  for (const sampleRate of [8000,44100,48000,96000]) {
    const synth=new ElectricDriveSynth(sampleRate);
    for (const bad of [NaN,Infinity,-Infinity,-2000,1e12]) {
      for(let i=0;i<128;i++) {
        const v=synth.next(bad,bad,bad,bad,bad,bad);
        assert.ok(Number.isFinite(v));
        assert.ok(Math.abs(v)<0.5);
      }
    }
  }
});
