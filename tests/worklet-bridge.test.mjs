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
  for (const name of ["rpm", "load", "throttle", "speed", "combustion", "active"]) {
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
    active: Float32Array.of(1)
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
