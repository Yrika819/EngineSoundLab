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
  for (const name of ["rpm", "load", "throttle", "speed", "combustion", "active", "motor", "motorRpm", "motorTorque", "regen", "generator", "generatorRpm", "generatorMotoring", "electricProfile", "iceProfile", "engineMotoring"]) {
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
    engineMotoring: Float32Array.of(0.2)
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
