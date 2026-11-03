import { EngineSynthCore } from "./synth-core.js";

/**
 * WebAudio module: no external recordings; each sample is rendered by
 * the exact same source code used in Node offline regression tests.
 */
class EngineWorklet extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "rpm", defaultValue: 850, minValue: 0, maxValue: 8000, automationRate: "k-rate" },
      { name: "load", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "throttle", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "speed", defaultValue: 0, minValue: 0, maxValue: 90, automationRate: "k-rate" },
      { name: "combustion", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "active", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" }
    ];
  }
  constructor() {
    super();
    this.synth = new EngineSynthCore(sampleRate);
  }
  process(_inputs, outputs, parameters) {
    const channels = outputs[0];
    if (!channels || channels.length === 0) return true;
    const left = channels[0];
    const right = channels[1];
    const rpm = parameters.rpm[0], load = parameters.load[0];
    const throttle = parameters.throttle[0], speed = parameters.speed[0];
    const combustion = parameters.combustion[0], active = parameters.active[0];
    for (let i = 0; i < left.length; i++) {
      const value = this.synth.next(rpm, load, throttle, speed, active, combustion);
      left[i] = value;
      if (right) right[i] = value;
    }
    return true;
  }
}
registerProcessor("engine-synth-p1", EngineWorklet);
