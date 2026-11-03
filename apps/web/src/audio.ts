import type { VehicleState } from "./physics";

/** One audio context, original procedural audio only. No media samples. */
export class EngineAudio {
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private fallback: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private master: GainNode | null = null;
  private active = false;
  simplified = false;

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
      this.worklet = new AudioWorkletNode(context, "engine-synth-p1");
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

  update(state: VehicleState, throttleInput = state.load): void {
    if (!this.active || !this.context) return;
    const now = this.context.currentTime;
    const rpm = Number.isFinite(state.rpm) ? state.rpm : 850;
    const load = Number.isFinite(state.load) ? state.load : 0;
    if (this.worklet) {
      this.worklet.parameters.get("rpm")?.setTargetAtTime(rpm, now, 0.025);
      this.worklet.parameters.get("load")?.setTargetAtTime(load, now, 0.025);
      this.worklet.parameters.get("throttle")?.setTargetAtTime(Math.max(0, Math.min(1, throttleInput)), now, 0.025);
      this.worklet.parameters.get("speed")?.setTargetAtTime(Math.max(0, state.speedMps), now, 0.04);
      this.worklet.parameters.get("combustion")?.setTargetAtTime(1, now, 0.025);
    } else {
      this.fallback?.frequency.setTargetAtTime(Math.max(20, rpm / 30), now, 0.035);
      this.filter?.frequency.setTargetAtTime(400 + 2400 * load, now, 0.05);
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
