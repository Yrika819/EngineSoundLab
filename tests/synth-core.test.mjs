import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineSynthCore } from "../apps/web/public/synth-core.js";

const RATE = 48000;
function render({ rpm = 850, load = 0, throttle = 0, speed = 0,
                  active = 1, combustion = 1, seconds = 1, seed = 0x12345 } = {}) {
  const dsp = new EngineSynthCore(RATE, seed);
  const n = Math.floor(RATE * seconds);
  const data = new Float32Array(n);
  let maxJump = 0;
  for (let i = 0; i < n; i++) {
    data[i] = dsp.next(rpm, load, throttle, speed, active, combustion);
    if (i) maxJump = Math.max(maxJump, Math.abs(data[i] - data[i-1]));
  }
  const tail = data.subarray(Math.floor(n * 0.6));
  const rms = Math.sqrt(tail.reduce((sum, v) => sum + v*v, 0) / tail.length);
  const peak = data.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return { data, dsp, rms, peak, maxJump };
}

test("four-stroke I4 firing timing tracks engine RPM", () => {
  const idle = render({ rpm: 900 });
  const accel = render({ rpm: 3600 });
  assert.ok(Math.abs(idle.dsp.firingEvents - 30) <= 3, idle.dsp.firingEvents);
  assert.ok(Math.abs(accel.dsp.firingEvents - 120) <= 5, accel.dsp.firingEvents);
});

test("synthesis has signal, stays finite, and never hard-clips", () => {
  for (const rpm of [850, 2200, 4500, 6300]) {
    const { data, rms, peak } = render({ rpm, load: 0.8, throttle: 0.95, seconds: 0.35 });
    assert.ok(rms > 0.0005, `silent at ${rpm}`);
    assert.ok(peak < 0.55, `peak ${peak} at ${rpm}`);
    assert.ok(data.every(Number.isFinite));
  }
});

test("increasing engine load changes audible energy even at fixed RPM", () => {
  const low = render({ rpm: 2800, load: 0.05, throttle: 0.05, seconds: 0.6 });
  const high = render({ rpm: 2800, load: 0.95, throttle: 0.95, seconds: 0.6 });
  assert.ok(high.rms > low.rms * 1.15, `low=${low.rms} high=${high.rms}`);
});

test("event timing and noise sequence are reproducible for diagnostic snapshots", () => {
  const a = render({ rpm: 2600, load: 0.55, throttle: 0.55, seconds: 0.1 });
  const b = render({ rpm: 2600, load: 0.55, throttle: 0.55, seconds: 0.1 });
  assert.deepEqual(a.data, b.data);
});

test("no combustion gives no exhaust signal; road noise remains while moving", () => {
  const quiet = render({ rpm: 2500, load: 0.9, throttle: 0.9, combustion: 0,
                          speed: 0, seconds: 0.65 });
  const rolling = render({ rpm: 2500, load: 0.9, throttle: 0.9, combustion: 0,
                            speed: 28, seconds: 0.65 });
  assert.ok(quiet.rms < 0.00005, `unexpected combustion sound ${quiet.rms}`);
  assert.ok(rolling.rms > quiet.rms + 0.0001);
});

test("activation fades in/out with no sharp discontinuities", () => {
  const dsp = new EngineSynthCore(RATE);
  let previous = 0, peakJump = 0, end = 0;
  for (let i = 0; i < RATE; i++) {
    const gate = i < RATE / 2 ? 1 : 0;
    const value = dsp.next(3000, 0.7, 0.7, 10, gate, 1);
    peakJump = Math.max(peakJump, Math.abs(value - previous));
    previous = value;
    end = value;
  }
  assert.ok(peakJump < 0.22, `sharp sample jump: ${peakJump}`);
  assert.ok(Math.abs(end) < 0.00001, `tail not silent: ${end}`);
});

test("invalid parameters do not produce NaN or Inf", () => {
  const dsp = new EngineSynthCore(RATE);
  for (const v of [NaN, Infinity, -Infinity, -999, 1e15]) {
    for (let i = 0; i < 512; i++) {
      const out = dsp.next(v, v, v, v, v, v);
      assert.ok(Number.isFinite(out) && Math.abs(out) < 0.55);
    }
  }
});

test("sample rate input is validated", () => {
  assert.throws(() => new EngineSynthCore(0), RangeError);
  assert.throws(() => new EngineSynthCore(480000), RangeError);
});
