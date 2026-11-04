/**
 * P5-B original vehicle-specific combustion timbre model.
 *
 * A synthetic approximation of 2.0L inline-four Prius / HR12DE inline-three
 * Aura sound CHARACTER, not a reverse-engineered factory transfer function.
 * Frequencies, weights, resonator radii and filtering coefficients are
 * manually authored hypotheses: no OEM acoustic measurements are claimed.
 *
 * Generated solely by 4-stroke combustion pulses, colored air turbulence and
 * crankshaft orders. No recordings, copyrighted engine audio or imported DSP.
 * Stateful filters and phase generation run with no per-sample allocations.
 */
export const ICE_TONE_PROFILES = Object.freeze({
  PRIUS: Object.freeze({
    id: 1, label: "Prius 2.0L I4 (estimated)",
    exhaustHz: 98, shellHz: 178,
    lowBody: 0.93, resonantBody: 0.40, shellBody: 0.12,
    edgeRasp: 0.095, intakeGain: 0.086, mechanicalGain: 0.030,
    crankOrder: 2, crankSubOrder: 1, subOrderGain: 0.28,
    cabinLowWeight: 0.95
  }),
  AURA: Object.freeze({
    id: 2, label: "Aura HR12DE I3 (estimated)",
    exhaustHz: 128, shellHz: 295,
    lowBody: 0.66, resonantBody: 0.34, shellBody: 0.17,
    edgeRasp: 0.055, intakeGain: 0.064, mechanicalGain: 0.016,
    crankOrder: 1.5, crankSubOrder: 1, subOrderGain: 0.10,
    cabinLowWeight: 0.76
  })
});

const finite = (value, low, high) =>
  Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;

class TunedResonator {
  constructor(rate, frequency, radius = 0.973) {
    this.radius2 = radius * radius;
    this.coeff = 2 * radius * Math.cos(2 * Math.PI * frequency / rate);
    this.gain = 1 - radius;
    this.a = 0;
    this.b = 0;
  }
  next(input) {
    const sample = this.coeff * this.a - this.radius2 * this.b +
      this.gain * input;
    this.b = this.a;
    this.a = sample;
    return sample;
  }
}

class VehicleCombustionVoice {
  constructor(rate, config) {
    this.rate = rate;
    this.config = config;
    this.tube = new TunedResonator(rate, config.exhaustHz);
    this.shell = new TunedResonator(rate, config.shellHz, 0.965);
    this.low = 0;
    this.mid = 0;
    this.intake = 0;
    this.heat = 0;
    this.previousThrottle = 0;
    this.transient = 0;
  }

  next(pressure, crankRadians, rpm, load, throttle, randomAir) {
    const c = this.config;
    const normalizedSpeed = finite(rpm / 5500, 0, 1);
    // Multi-band pressure shaping separates low exhaust body from
    // hard metallic pressure edges; no fixed-frequency oscillator alone
    // defines the ignition character.
    this.low += 0.037 * (pressure - this.low);
    this.mid += 0.18 * (pressure - this.mid);
    const edge = pressure - this.mid;
    const firstTube = this.tube.next(pressure);
    const shell = this.shell.next(pressure);

    // Air box/induction turbulence grows with throttle and engine airflow,
    // but remains far below the exhaust source in a simulated cabin.
    const airflow = 0.18 + 0.60 * throttle + 0.22 * load;
    const cutoffHz = 210 + 1300 * throttle + 0.11 * rpm;
    const coeff = Math.min(0.50, 2 * Math.PI * cutoffHz / this.rate);
    this.intake += coeff * (randomAir - this.intake);
    const intake = this.intake * airflow * c.intakeGain;

    // Brief air-surge response when accelerator opens: smoothing prevents
    // square-wave pitch/gain discontinuities at sound profile transitions.
    const surge = Math.max(0, throttle - this.previousThrottle);
    this.previousThrottle = throttle;
    this.transient = this.transient * 0.997 + surge * 0.025;
    const loadGain = 0.30 + 0.68 * load + 0.13 * this.transient;
    const pressureBody = this.low * c.lowBody +
      firstTube * c.resonantBody + shell * c.shellBody;
    const noisyEdge = edge * c.edgeRasp *
      (0.27 + 0.48 * load + 0.25 * normalizedSpeed);
    const mechanical = c.mechanicalGain * (0.4 + load * 0.6) *
      (Math.sin(crankRadians * c.crankOrder) +
       c.subOrderGain * Math.sin(crankRadians * c.crankSubOrder + 0.24));
    // A car's actual cabin transfer function is unknown; these damping
    // coefficients give Prius a deeper and Aura a more muted I3 profile.
    return pressureBody * loadGain * c.cabinLowWeight +
      noisyEdge + intake + mechanical;
  }
}

/**
 * A single stateful instance renders two explicitly voiced resonator banks,
 * crossfading smoothly between generic / Prius / Aura.
 * `profileCode` is 0=generic, 1=Prius, 2=Aura.
 */
export class VehicleIceAcoustics {
  constructor(rate = 48000) {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000)
      throw new RangeError("unsupported sample rate");
    this.rate = rate;
    this.prius = new VehicleCombustionVoice(rate, ICE_TONE_PROFILES.PRIUS);
    this.aura = new VehicleCombustionVoice(rate, ICE_TONE_PROFILES.AURA);
    this.priusBlend = 0;
    this.auraBlend = 0;
    this.engineMotoring = 0;
    this.motoringPhase = 0;
    this.motoringHarmonicPhase = 0;
    this.profileLag = Math.exp(-1 / (rate * 0.090));
    this.motoringLag = Math.exp(-1 / (rate * 0.028));
  }

  /** No arrays or objects are allocated per sample. Rendered combustion
   * and non-fuelled motoring voices are read from instance fields.
   */
  next(pressure, crankRadians, rpm, load, throttle, white,
       combustionGate, motoringLevel, profileCode) {
    const priusTarget = profileCode === 1 ? 1 : 0;
    const auraTarget = profileCode === 2 ? 1 : 0;
    this.priusBlend += (priusTarget - this.priusBlend) *
      (1 - this.profileLag);
    this.auraBlend += (auraTarget - this.auraBlend) *
      (1 - this.profileLag);
    this.engineMotoring += (finite(motoringLevel, 0, 1) -
      this.engineMotoring) * (1 - this.motoringLag);

    // Each bank continues rendering during a crossfade; its resonators
    // always track current pressure, so entering a profile has no cold start.
    const prius = this.prius.next(pressure, crankRadians,
      rpm, load, throttle, white);
    const aura = this.aura.next(pressure, crankRadians,
      rpm, load, throttle, white);
    this.combustionVoice = (prius * this.priusBlend +
      aura * this.auraBlend) * finite(combustionGate, 0, 1);
    this.genericBlend = Math.max(0, 1 - this.priusBlend - this.auraBlend);

    // Engine rotation without fuelled ignition: starter/generator and
    // low-level crank/gear motion, not false exhaust pressure pulses.
    // Separate oscillator lets SPINNING_UNFUELLED remain audible.
    const freq = finite(rpm, 0, 8000) / 60;
    const step = (2 * Math.PI * freq) / this.rate;
    this.motoringPhase = (this.motoringPhase + step) % (2 * Math.PI);
    this.motoringHarmonicPhase = (this.motoringHarmonicPhase +
      step * 2.4) % (2 * Math.PI);
    const rpmAudibility = Math.min(1, freq / 14);
    this.motoringVoice = this.engineMotoring * rpmAudibility *
      (0.031 * Math.sin(this.motoringPhase) +
       0.010 * Math.sin(this.motoringHarmonicPhase + 0.21));
  }
}
