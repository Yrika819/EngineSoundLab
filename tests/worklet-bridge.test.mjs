import { test } from "node:test";
import assert from "node:assert/strict";

// The native browser binds these globals before loading an AudioWorklet module.
// This test exercises the real module registration and worklet process() path.
let registeredName = "";
let Worklet = null;
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class {
  constructor() { this.port = { onmessage: null }; }
};
globalThis.registerProcessor = (name, constructor) => {
  registeredName = name;
  Worklet = constructor;
};
await import("../apps/web/public/engine-worklet.js");

test("worklet registers and consumes UI parameter channels", () => {
  assert.equal(registeredName, "engine-synth-p1");
  assert.ok(Worklet);
  const descriptors = Worklet.parameterDescriptors;
  for (const name of ["rpm", "load", "throttle", "speed", "combustion", "active", "motor", "motorRpm", "motorTorque", "regen", "generator", "generatorRpm", "generatorMotoring", "electricProfile", "iceProfile", "engineMotoring", "listenerMode", "roadRoughness", "electricFocus"]) {
    assert.ok(descriptors.some(param => param.name === name), "missing " + name);
  }
  const node = new Worklet();
  const output = [[new Float32Array(128), new Float32Array(128)]];
  const parameters = {
    rpm: Float32Array.of(2300),
    load: Float32Array.of(0.8),
    throttle: Float32Array.of(0.9),
    speed: Float32Array.of(14),
    combustion: Float32Array.of(1),
    active: Float32Array.of(1),
    motor: Float32Array.of(0.5),
    motorRpm: Float32Array.of(1800),
    motorTorque: Float32Array.of(-0.7),
    regen: Float32Array.of(0.3),
    generator: Float32Array.of(0.4),
    generatorRpm: Float32Array.of(2600),
    generatorMotoring: Float32Array.of(0.45),
    electricProfile: Float32Array.of(2),
    iceProfile: Float32Array.of(2),
    engineMotoring: Float32Array.of(0.2),
    listenerMode: Float32Array.of(0),
    roadRoughness: Float32Array.of(0.35),
    electricFocus: Float32Array.of(0)
  };
  assert.equal(node.process([], output, parameters), true);
  assert.ok(output[0][0].some(value => value !== 0), "silent worklet output");
  assert.ok(output[0][0].every(Number.isFinite), "non-finite audio");
  assert.deepEqual(output[0][0], output[0][1], "stereo channels not consistent");
});

test("worklet can change I3/I4/I6 geometry without resetting the audio node", () => {
  const node = new Worklet({ processorOptions: { profileId: "i3" } });
  assert.equal(node.synth.profileId, "i3");
  assert.equal(node.synth.profile.cylinders, 3);
  node.port.onmessage({ data: { type: "setProfile", profileId: "i6" } });
  assert.equal(node.synth.profileId, "i6");
  assert.equal(node.synth.profile.cylinders, 6);
  node.port.onmessage({ data: { type: "setProfile", profileId: "not-supported" } });
  assert.equal(node.synth.profileId, "i6");
});


test("P5-C: Worklet forwards signed torque and independent generator motoring",()=>{
  const node=new Worklet({processorOptions:{profileId:"i4"}});
  const output=[[new Float32Array(128),new Float32Array(128)]];
  const params=Object.fromEntries(
    Worklet.parameterDescriptors.map(p=>[p.name,Float32Array.of(p.defaultValue)]));
  params.active=Float32Array.of(1);
  params.motor=Float32Array.of(0.8);
  params.motorRpm=Float32Array.of(2700);
  params.motorTorque=Float32Array.of(-0.8);
  params.generator=Float32Array.of(0);
  params.generatorMotoring=Float32Array.of(0.8);
  params.generatorRpm=Float32Array.of(1900);
  params.electricProfile=Float32Array.of(1);
  for(let i=0;i<100;i++)node.process([],output,params);
  assert.ok(node.synth.electric.motorTorque<-0.1);
  assert.ok(node.synth.electric.generatorMotoring>0.1);
  assert.equal(node.synth.electric.generatorLevel,0);
  assert.ok(Math.abs(node.synth.electric.lastMotoring)>0);
  assert.equal(node.synth.electric.lastGenerator,0);
  assert.deepEqual(output[0][0],output[0][1]);
});


test("P5-D: Worklet applies live cabin / engine-bay and rough-surface controls",()=>{
  const node=new Worklet({processorOptions:{profileId:"i4"}});
  const output=[[new Float32Array(128),new Float32Array(128)]];
  const params=Object.fromEntries(
    Worklet.parameterDescriptors.map(p=>[p.name,Float32Array.of(p.defaultValue)]));
  params.active=Float32Array.of(1);
  params.speed=Float32Array.of(25);
  params.combustion=Float32Array.of(1);
  params.rpm=Float32Array.of(2900);
  params.load=Float32Array.of(0.72);
  params.motor=Float32Array.of(0.65);
  params.motorRpm=Float32Array.of(2800);
  params.generator=Float32Array.of(0.45);
  params.generatorRpm=Float32Array.of(2200);
  params.iceProfile=Float32Array.of(2);
  params.electricProfile=Float32Array.of(2);
  params.listenerMode=Float32Array.of(0);
  params.roadRoughness=Float32Array.of(0);
  for(let i=0;i<250;i++)node.process([],output,params);
  assert.ok(node.synth.soundstage.bayMix<0.01);
  const quietRoughness=node.synth.soundstage.roughness;
  params.listenerMode=Float32Array.of(1);
  params.roadRoughness=Float32Array.of(1);
  let peak=0;
  for(let i=0;i<300;i++){
    node.process([],output,params);
    for(const value of output[0][0]){
      assert.ok(Number.isFinite(value));
      peak=Math.max(peak,Math.abs(value));
    }
  }
  assert.ok(node.synth.soundstage.bayMix>0.9);
  assert.ok(node.synth.soundstage.roughness>quietRoughness+0.6);
  assert.ok(peak>0 && peak<0.55);
  assert.deepEqual(output[0][0],output[0][1]);
});

test("P5-D.1: Worklet updates hybrid sound balance without rebuilding synth",()=>{
  const node=new Worklet({processorOptions:{profileId:"i3"}});
  const output=[[new Float32Array(128),new Float32Array(128)]];
  const p=Object.fromEntries(
    Worklet.parameterDescriptors.map(item=>[item.name,Float32Array.of(item.defaultValue)]));
  p.active=Float32Array.of(1);
  p.iceProfile=Float32Array.of(2);
  p.electricProfile=Float32Array.of(2);
  p.combustion=Float32Array.of(1);
  p.rpm=Float32Array.of(2200);
  p.load=Float32Array.of(.6);
  p.motor=Float32Array.of(.7);
  p.motorRpm=Float32Array.of(3300);
  p.generator=Float32Array.of(.4);
  p.generatorRpm=Float32Array.of(2200);
  p.electricFocus=Float32Array.of(1);
  for(let i=0;i<200;i++) node.process([],output,p);
  assert.ok(node.synth.soundstage.hybridFocus>0.9);
  const previous=node.synth;
  p.electricFocus=Float32Array.of(-1);
  for(let i=0;i<200;i++)node.process([],output,p);
  assert.equal(node.synth,previous,"switch must not re-create synth");
  assert.ok(node.synth.soundstage.hybridFocus<-.85);
  assert.ok(output[0][0].every(Number.isFinite));
  assert.deepEqual(output[0][0],output[0][1]);
});
