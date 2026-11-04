import type { DriveState } from "./powertrains";
import { toAudioTelemetry } from "./audio-telemetry";

export type EngineSoundProfile = "i3" | "i4" | "i6";

/** One audio context, original procedural audio only. No media samples. */
export class EngineAudio {
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private fallback: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private active = false;
  private profile: EngineSoundProfile = "i4";
  simplified = false;

  /** Changes only the sound profile; the generic driving physics is shared. */
  setProfile(profile: EngineSoundProfile): void {
    if (!["i3", "i4", "i6"].includes(profile)) throw new RangeError("Invalid sound profile");
    this.profile = profile;
    this.worklet?.port.postMessage({ type: "setProfile", profileId: profile });
  }

  async start(): Promise<void> {
    if (this.context) {
      await this.context.resume();
      this.active = true;
      this.setActive(1);
      return;
    }
    const context = new AudioContext({ latencyHint: "interactive" });
    this.context = context;
    // Calling resume from the user's click retains autoplay activation.
    const resume = context.resume();
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 10;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    master.gain.value = 0;
    master.connect(compressor).connect(context.destination);
    this.master = master;

    try {
      if (!context.audioWorklet) throw new Error("AudioWorklet unavailable");
      await context.audioWorklet.addModule(new URL("engine-worklet.js", document.baseURI).toString());
      this.worklet = new AudioWorkletNode(context, "engine-synth-p1", {
        processorOptions: { profileId: this.profile }
      });
      this.worklet.connect(master);
    } catch (error) {
      console.warn("AudioWorklet could not start, using simpler procedural fallback", error);
      this.simplified = true;
      const osc = context.createOscillator();
      const filter = context.createBiquadFilter();
      osc.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.value = 650;
      osc.connect(filter).connect(master);
      osc.start();
      this.fallback = osc;
      this.filter = filter;
    }
    await resume;
    this.active = true;
    this.setActive(1);
  }

  update(state: DriveState, throttleInput = state.load): void {
    if (!this.active || !this.context) return;
    const now = this.context.currentTime;
    const telemetry = toAudioTelemetry(state, throttleInput);
    if (this.worklet) {
      const set = (name: string, value: number, smoothing: number) =>
        this.worklet?.parameters.get(name)?.setTargetAtTime(value, now, smoothing);
      set("rpm", telemetry.engineRpm, 0.025);
      set("load", telemetry.engineLoad, 0.025);
      set("throttle", telemetry.throttle, 0.025);
      set("speed", telemetry.speedMps, 0.04);
      // A spinning engine does not imply a fuelled ignition pulse.
      set("combustion", telemetry.combustionGate, 0.025);
      set("motor", telemetry.motorAmplitude, 0.03);
      set("motorRpm", telemetry.tractionShaftRpm, 0.035);
      set("regen", telemetry.regenAmplitude, 0.04);
      set("generator", telemetry.generatorAmplitude, 0.04);
      set("generatorRpm", telemetry.generatorShaftRpm, 0.04);
      set("electricProfile", telemetry.electricProfile, 0.075);
    } else {
      const cylinders = this.profile === "i3" ? 3 : this.profile === "i6" ? 6 : 4;
      const hz = telemetry.combustionGate
        ? Math.max(20, telemetry.engineRpm * cylinders / 120)
        : Math.max(80, telemetry.tractionShaftRpm * 6 / 60);
      this.fallback?.frequency.setTargetAtTime(hz, now, 0.035);
      this.master?.gain.setTargetAtTime(telemetry.combustionGate ? 0.32 :
        Math.min(0.14, Math.abs(telemetry.tractionPowerKw) / 400), now, 0.06);
      this.filter?.frequency.setTargetAtTime(
        400 + 2400 * telemetry.engineLoad, now, 0.05);
    }
  }

  private setActive(value: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.worklet?.parameters.get("active")?.setTargetAtTime(value, now, 0.02);
    this.master?.gain.setTargetAtTime(value ? 0.32 : 0, now, 0.035);
  }

  async suspend(): Promise<void> {
    if (!this.context || !this.active) return;
    this.active = false;
    this.setActive(0);
    await this.context.suspend();
  }

  async dispose(): Promise<void> {
    this.active = false;
    this.worklet?.disconnect();
    this.fallback?.stop();
    this.fallback?.disconnect();
    this.filter?.disconnect();
    this.master?.disconnect();
    this.worklet = null;
    this.fallback = null;
    this.filter = null;
    this.master = null;
    const ctx = this.context;
    this.context = null;
    if (ctx && ctx.state !== "closed") await ctx.close();
  }
}
