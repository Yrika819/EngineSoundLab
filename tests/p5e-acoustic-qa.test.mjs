import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RATES, CARS, SCENARIOS, renderClip, renderTransition, checkClip,
  wavMono16, sampleParams
} from "../tools/p5e-acoustic-qa.mjs";

test("P5-E: exactly two sampled hybrid models and eight deterministic acoustic events",()=>{
  assert.deepEqual(RATES,[44100,48000]);
  assert.deepEqual(CARS.map(c=>c.id),["prius","aura"]);
  assert.equal(SCENARIOS.length,8);
  assert.equal(new Set(SCENARIOS.map(s=>s.id)).size,8);
  for(const car of CARS){
    for(const s of SCENARIOS) {
      const p=sampleParams(car,s);
      assert.ok([0,1].includes(p.combustion),s.id);
      assert.ok(p.rpm>=0&&p.motorRpm>=0);
      if(s.id==="parked-silent")assert.equal(p.speed,0);
    }
  }
});
test("P5-E: engine and electric generator stay silent during EV/regen for both models",()=>{
  for(const car of CARS){
    for(const id of ["ev-launch","ev-gentle","regen-decelerate"]){
      const scene=SCENARIOS.find(s=>s.id===id);
      const clip=renderClip(car,scene,48000,.42);
      checkClip(clip);
      assert.equal(clip.stats.sourceRms.engine,0);
      assert.equal(clip.stats.sourceRms.generator,0);
      assert.ok(clip.stats.sourceRms.traction>.004,id+" "+car.id);
    }
  }
});
test("P5-E: unfuelled rotating engine has motorized voice without a firing event",()=>{
  const scene=SCENARIOS.find(s=>s.id==="unfuelled-spin");
  for(const car of CARS){
    const clip=renderClip(car,scene,48000,.5);
    checkClip(clip);
    assert.equal(clip.stats.firingEvents,0);
    assert.equal(clip.stats.sourceRms.engine,0);
    assert.ok(clip.stats.sourceRms.motoring>.001);
    assert.ok(clip.stats.sourceRms.generator>.001,
      "starter/motoring generator bus should be distinct from fuelled generation");
  }
});
test("P5-E: generator sound and combustion occur only in fuelled load scenarios",()=>{
  const fuelled=SCENARIOS.filter(s=>s.params.combustion===1);
  assert.equal(fuelled.length,3);
  for(const car of CARS){
    for(const scene of fuelled){
      const clip=renderClip(car,scene,48000,.45);
      checkClip(clip);
      assert.ok(clip.stats.firingEvents>0);
      assert.ok(clip.stats.sourceRms.engine>.002);
      assert.ok(clip.stats.sourceRms.generator>.001);
    }
  }
});
test("P5-E: exact replay has identical PCM checksum and no external sample assets",()=>{
  const car=CARS[1],scene=SCENARIOS[3];
  const a=renderClip(car,scene,44100,.45);
  const b=renderClip(car,scene,44100,.45);
  assert.equal(a.stats.sha256,b.stats.sha256);
  assert.deepEqual(a.stats.spectrum,b.stats.spectrum);
  assert.deepEqual(a.stats.sourceRms,b.stats.sourceRms);
  const header=wavMono16(a.samples,44100);
  assert.equal(header.subarray(0,4).toString(),"RIFF");
  assert.equal(header.subarray(8,12).toString(),"WAVE");
  assert.equal(header.readUInt16LE(20),1);
  assert.equal(header.readUInt16LE(22),1); // mono; WebAudio duplicates L/R
  assert.equal(header.readUInt32LE(24),44100);
  assert.equal(header.readUInt16LE(34),16);
  assert.equal(header.readUInt32LE(40),a.samples.length*2);
  assert.equal(header.length,44+a.samples.length*2);
});
test("P5-E: FFT reports real measured internal spectrum with bounded fractions",()=>{
  for(const car of CARS) {
    const scene=SCENARIOS.find(s=>s.id==="ev-gentle");
    for(const rate of RATES){
      const x=renderClip(car,scene,rate,.45);
      checkClip(x);
      const spec=x.stats.spectrum;
      assert.ok(spec.dominantHz>50&&spec.dominantHz<8000);
      assert.ok(spec.centroidHz>50&&spec.centroidHz<8000);
      const sum=spec.lowFraction+spec.midFraction+spec.highFraction;
      assert.ok(Math.abs(sum-1)<.001);
      assert.ok(x.stats.rms>0);
    }
  }
});
test("P5-E: both supported rates are bounded through EV->ICE->regen->EV",()=>{
  for(const car of CARS)for(const rate of RATES){
    const t=renderTransition(car,rate,.28);
    assert.equal(t.stats.legs.length,4);
    assert.deepEqual(t.stats.legs.map(x=>x.name),[
      "ev-gentle","fuelled-accelerate","regen-decelerate","ev-launch"
    ]);
    assert.ok(t.stats.peak<.55);
    assert.ok(t.stats.maxJump<.235);
    assert.ok(t.stats.legs.every(leg=>leg.rms>0.001));
  }
});
test("P5-E: parked vehicle has zero output at either rate, independently of ICE cylinder count",()=>{
  const scene=SCENARIOS[0];
  for(const car of CARS)for(const rate of RATES){
    const clip=renderClip(car,scene,rate,.3);
    checkClip(clip);
    assert.equal(clip.stats.peak,0);
    assert.equal(clip.stats.rms,0);
    assert.equal(clip.stats.firingEvents,0);
  }
});
test("P5-E: invalid QA inputs are rejected instead of generating mislabeled audio",()=>{
  assert.throws(()=>renderClip(CARS[0],SCENARIOS[0],96000),RangeError);
  assert.throws(()=>renderClip(CARS[0],SCENARIOS[0],48000,.01),RangeError);
  assert.throws(()=>sampleParams({id:"fake"},SCENARIOS[0]),RangeError);
  assert.throws(()=>sampleParams(CARS[0],{id:"fake"}),RangeError);
  assert.throws(()=>wavMono16(new Float32Array(4),8000),RangeError);
});
