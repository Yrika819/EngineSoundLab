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
      { name: "combustion", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "motor", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "motorRpm", defaultValue: 0, minValue: 0, maxValue: 20000, automationRate: "k-rate" },
      { name: "regen", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "generator", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "generatorRpm", defaultValue: 0, minValue: 0, maxValue: 22000, automationRate: "k-rate" },
      { name: "electricProfile", defaultValue: 0, minValue: 0, maxValue: 2, automationRate: "k-rate" },
      { name: "iceVehicle", defaultValue: 0, minValue: 0, maxValue: 2, automationRate: "k-rate" },
      { name: "engineOperation", defaultValue: 2, minValue: 0, maxValue: 4, automationRate: "k-rate" },
      { name: "active", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" }
    ];
  }
  constructor(options = {}) {
    super();
    this.synth = new EngineSynthCore(
      sampleRate, 0x6d2b79f5, options.processorOptions?.profileId ?? "i4"
    );
    // The live selector changes only sound geometry; vehicle motion is unchanged.
    if (this.port) this.port.onmessage = event => {
      if (event.data?.type === "setProfile") {
        try { this.synth.setProfile(event.data.profileId); }
        catch (error) { console.warn("Invalid sound profile ignored", error); }
      }
    };
  }
  process(_inputs, outputs, parameters) {
    const channels = outputs[0];
    if (!channels || channels.length === 0) return true;
    const left = channels[0];
    const right = channels[1];
    const rpm = parameters.rpm[0], load = parameters.load[0];
    const throttle = parameters.throttle[0], speed = parameters.speed[0];
    const combustion = parameters.combustion[0], active = parameters.active[0];
    const motor = parameters.motor[0], motorRpm = parameters.motorRpm[0];
    const regen = parameters.regen[0], generator = parameters.generator[0];
    const generatorRpm = parameters.generatorRpm[0];
    const electricProfile = Math.round(parameters.electricProfile[0]);
    const iceVehicle = Math.round(parameters.iceVehicle[0]);
    const engineOperation = Math.round(parameters.engineOperation[0]);
    for (let i = 0; i < left.length; i++) {
      const value = this.synth.next(rpm, load, throttle, speed, active, combustion,
        motor, motorRpm, regen, generator, generatorRpm, electricProfile,
        iceVehicle, engineOperation);
      left[i] = value;
      if (right) right[i] = value;
    }
    return true;
  }
}
registerProcessor("engine-synth-p1", EngineWorklet);
