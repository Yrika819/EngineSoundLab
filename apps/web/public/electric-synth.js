/**
 * EngineSoundLab P3+ electric drivetrain acoustics.
 *
 * An ORIGINAL procedural approximation (not recorded samples, OEM inverter
 * frequencies or calibrated tooth counts). Independently models:
 * - traction motor electromagnetic orders,
 * - approximate gear/reduction mesh order,
 * - low-level inverter/drive tones,
 * - regenerative braking timbre,
 * - engine-driven generator/machine whine.
 *
 * Stateless inputs, stateful oscillators; no dynamic allocation per sample.
 * All pitch transitions are smoothed, including vehicle/profile switches.
 */

export const ELECTRIC_AUDIO_PROFILES = Object.freeze({
  GENERIC: Object.freeze({ poleOrder: 6.0, gearOrder: 11.0, genOrder: 5.0,
    carrierHz: 1200, tractionGain: 1.0, generatorGain: 0.7, regenGain: 0.9, meshGain: 1.0 }),
  PRIUS: Object.freeze({ poleOrder: 6.0, gearOrder: 13.5, genOrder: 7.0,
    carrierHz: 1450, tractionGain: 0.85, generatorGain: 0.85, regenGain: 0.84, meshGain: 0.78 }),
  AURA: Object.freeze({ poleOrder: 5.5, gearOrder: 15.0, genOrder: 5.0,
    carrierHz: 1800, tractionGain: 1.05, generatorGain: 0.9, regenGain: 1.08, meshGain: 0.93 })
});

const clip = (x, low, high) =>
  Number.isFinite(x) ? Math.min(high, Math.max(low, x)) : low;

export class ElectricDriveSynth {
  constructor(sampleRate = 48000) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
      throw new RangeError("unsupported sample rate");
    this.rate = sampleRate;
    this.motorLevel = 0;
    this.motorRpm = 0;
    this.motorTorque = 0; // sign distinguishes traction from regeneration
    this.regenLevel = 0;
    this.generatorLevel = 0;
    this.generatorRpm = 0;
    this.generatorMotoring = 0; // starter/motoring separate from generation
    this.poleOrder = 6;
    this.gearOrder = 11;
    this.genOrder = 5;
    this.regenGain = 0.9;
    this.meshGain = 1;
    this.carrierHz = 1200;
    this.tractionGain = 1;
    this.generatorGain = 0.7;
    this.electromagneticPhase = 0;
    this.motorHarmonicPhase = 0;
    this.generatorHarmonicPhase = 0;
    this.meshPhase = 0;
    this.pwmPhase = 0;
    this.regenPhase = 0;
    this.generatorPhase = 0;
    this.smoothing = Math.exp(-1 / (sampleRate * 0.035));
    this.profileSmoothing = Math.exp(-1 / (sampleRate * 0.12));
    // Phase frequencies are bounded, while over-Nyquist harmonics fade
    // out (rather than audibly folding back into the bass spectrum).
    this.peakLimit = Math.min(sampleRate * 0.40, 6800);
    this.lastTraction = this.lastGear = this.lastInverter = 0;
    this.lastRegen = this.lastGenerator = this.lastMotoring = 0;
  }

  /** Smooth roll-off before Nyquist for uncalibrated upper orders. */
  bandGain(hz) {
    return clip((this.peakLimit - hz) / (this.peakLimit * 0.18), 0, 1);
  }

  /**
   * @param {number} motorAmplitude normalized 0..1 drive or regen torque magnitude
   * @param {number} shaftRpm signed or unsigned traction motor shaft speed
   * @param {number} regenAmplitude normalized 0..1 regen braking intensity
   * @param {number} generatorAmplitude normalized 0..1 electricity produced
   * @param {number} generatorRpm signed/unsigned generator shaft speed
   * @param {number} profileCode 0 generic, 1 Prius-inspired, 2 Aura-inspired
   * @param {number} torqueSigned traction torque normalized -1..1
   * @param {number} generatorMotoring starter or non-fuelled rotation 0..1
   */
  next(motorAmplitude = 0, shaftRpm = 0, regenAmplitude = 0,
       generatorAmplitude = 0, generatorRpm = 0, profileCode = 0,
       torqueSigned = 0, generatorMotoring = 0) {
    const profile = profileCode === 1 ? ELECTRIC_AUDIO_PROFILES.PRIUS :
      profileCode === 2 ? ELECTRIC_AUDIO_PROFILES.AURA : ELECTRIC_AUDIO_PROFILES.GENERIC;
    const alpha = this.smoothing, beta = this.profileSmoothing;
    this.motorLevel = alpha * this.motorLevel +
      (1 - alpha) * clip(motorAmplitude, 0, 1);
    this.motorRpm = alpha * this.motorRpm +
      (1 - alpha) * clip(Math.abs(shaftRpm), 0, 22000);
    this.motorTorque = alpha * this.motorTorque +
      (1 - alpha) * clip(torqueSigned, -1, 1);
    this.regenLevel = alpha * this.regenLevel +
      (1 - alpha) * clip(regenAmplitude, 0, 1);
    this.generatorLevel = alpha * this.generatorLevel +
      (1 - alpha) * clip(generatorAmplitude, 0, 1);
    this.generatorRpm = alpha * this.generatorRpm +
      (1 - alpha) * clip(Math.abs(generatorRpm), 0, 22000);
    this.generatorMotoring = alpha * this.generatorMotoring +
      (1 - alpha) * clip(generatorMotoring, 0, 1);
    this.poleOrder = beta * this.poleOrder + (1 - beta) * profile.poleOrder;
    this.gearOrder = beta * this.gearOrder + (1 - beta) * profile.gearOrder;
    this.genOrder = beta * this.genOrder + (1 - beta) * profile.genOrder;
    this.regenGain = beta * this.regenGain + (1 - beta) * profile.regenGain;
    this.meshGain = beta * this.meshGain + (1 - beta) * profile.meshGain;
    this.carrierHz = beta * this.carrierHz + (1 - beta) * profile.carrierHz;
    this.tractionGain = beta * this.tractionGain + (1 - beta) * profile.tractionGain;
    this.generatorGain = beta * this.generatorGain + (1 - beta) * profile.generatorGain;

    const motorHz = this.motorRpm / 60;
    const generatorHz = this.generatorRpm / 60;
    const step = 2 * Math.PI / this.rate;
    const elecHz = motorHz * this.poleOrder;
    const harmonicHz = elecHz * 2;
    const meshHz = motorHz * this.gearOrder;
    const regenHz = motorHz * (this.poleOrder + 1.5);
    const genHz = generatorHz * this.genOrder;
    const genHarmonicHz = genHz * 2;
    const motorMotion = clip((this.motorRpm - 20) / 145, 0, 1);
    const generatorMotion = clip((this.generatorRpm - 20) / 145, 0, 1);

    this.electromagneticPhase = (this.electromagneticPhase + step *
      Math.min(this.peakLimit, elecHz)) % (2 * Math.PI);
    this.motorHarmonicPhase = (this.motorHarmonicPhase + step *
      Math.min(this.peakLimit, harmonicHz)) % (2 * Math.PI);
    this.meshPhase = (this.meshPhase + step *
      Math.min(this.peakLimit, meshHz)) % (2 * Math.PI);
    this.regenPhase = (this.regenPhase + step *
      Math.min(this.peakLimit, regenHz)) % (2 * Math.PI);
    this.generatorPhase = (this.generatorPhase + step *
      Math.min(this.peakLimit, genHz)) % (2 * Math.PI);
    this.generatorHarmonicPhase = (this.generatorHarmonicPhase + step *
      Math.min(this.peakLimit, genHarmonicHz)) % (2 * Math.PI);
    const carrier = clip(this.carrierHz + 0.12 * elecHz, 0, this.peakLimit);
    this.pwmPhase = (this.pwmPhase + step * carrier) % (2 * Math.PI);

    // A motor's load changes its magnetic order harmonics. Negative torque
    // adds a distinct regen order; it does not alter the engine fuel gate.
    const negativeTorque = Math.max(0, -this.motorTorque);
    const positiveTorque = Math.max(0, this.motorTorque);
    const brightness = clip(0.70 + 0.25 * positiveTorque -
      0.17 * negativeTorque, 0.35, 1.15);
    this.lastTraction = motorMotion * this.motorLevel * this.tractionGain *
      (0.096 * this.bandGain(elecHz) * Math.sin(this.electromagneticPhase) +
       0.025 * brightness * this.bandGain(harmonicHz) *
         Math.sin(this.motorHarmonicPhase + 0.22));
    this.lastGear = motorMotion * this.motorLevel * this.meshGain * 0.025 *
      this.bandGain(meshHz) * Math.sin(this.meshPhase + 0.35);
    const carrier = this.carrierHz + 0.12 * Math.min(elecHz, this.peakLimit);
    this.pwmPhase = (this.pwmPhase + step *
      Math.min(carrier, this.peakLimit)) % (2 * Math.PI);
    this.lastInverter = motorMotion * this.motorLevel * 0.008 *
      this.bandGain(carrier) * Math.sin(this.pwmPhase) *
      (0.85 + 0.15 * Math.sin(this.electromagneticPhase));
    // Regeneration is tied to brake energy AND signed motor torque.
    // Its frequency follows the traction shaft even without combustion.
    const regenStrength = Math.max(this.regenLevel,
      negativeTorque * this.motorLevel * 0.52);
    this.lastRegen = motorMotion * regenStrength * this.regenGain *
      (0.039 * this.bandGain(regenHz) * Math.sin(this.regenPhase) +
       0.010 * this.bandGain(carrier) * Math.sin(this.pwmPhase + 0.40));

    // MG1/e-POWER generator: producing current and consuming starter power
    // use separate gain envelopes at the same generator shaft rate.
    const genBody = this.bandGain(genHz) * Math.sin(this.generatorPhase);
    const genOvertone = this.bandGain(genHarmonicHz) *
      Math.sin(this.generatorHarmonicPhase + 0.36);
    this.lastGenerator = generatorMotion * this.generatorLevel *
      this.generatorGain * (0.078 * genBody + 0.021 * genOvertone);
    this.lastMotoring = generatorMotion * this.generatorMotoring *
      this.generatorGain * (0.057 * genBody + 0.008 * genOvertone);

    // Keep source components readable for deterministic isolation tests,
    // without allocating objects inside the audio callback.
    return this.lastTraction + this.lastGear + this.lastInverter +
      this.lastRegen + this.lastGenerator + this.lastMotoring;
  }
}
