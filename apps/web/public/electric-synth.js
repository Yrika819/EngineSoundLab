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
  GENERIC: { poleOrder: 6.0, gearOrder: 11.0, carrierHz: 1200, tractionGain: 1.0, generatorGain: 0.7 },
  PRIUS: { poleOrder: 6.0, gearOrder: 13.0, carrierHz: 1450, tractionGain: 0.85, generatorGain: 0.85 },
  AURA: { poleOrder: 5.0, gearOrder: 15.0, carrierHz: 1800, tractionGain: 1.05, generatorGain: 0.9 }
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
    this.regenLevel = 0;
    this.generatorLevel = 0;
    this.generatorRpm = 0;
    this.poleOrder = 6;
    this.gearOrder = 11;
    this.carrierHz = 1200;
    this.tractionGain = 1;
    this.generatorGain = 0.7;
    this.electromagneticPhase = 0;
    this.meshPhase = 0;
    this.pwmPhase = 0;
    this.regenPhase = 0;
    this.generatorPhase = 0;
    this.smoothing = Math.exp(-1 / (sampleRate * 0.035));
    this.profileSmoothing = Math.exp(-1 / (sampleRate * 0.12));
    this.peakLimit = Math.min(sampleRate * 0.38, 6800);
  }

  /**
   * @param {number} motorAmplitude normalized 0..1 drive or regen torque magnitude
   * @param {number} shaftRpm signed or unsigned traction motor shaft speed
   * @param {number} regenAmplitude normalized 0..1 regen braking intensity
   * @param {number} generatorAmplitude normalized 0..1 electricity produced
   * @param {number} generatorRpm signed/unsigned generator shaft speed
   * @param {number} profileCode 0 generic, 1 Prius-inspired, 2 Aura-inspired
   */
  next(motorAmplitude = 0, shaftRpm = 0, regenAmplitude = 0,
       generatorAmplitude = 0, generatorRpm = 0, profileCode = 0) {
    const profile = profileCode === 1 ? ELECTRIC_AUDIO_PROFILES.PRIUS :
      profileCode === 2 ? ELECTRIC_AUDIO_PROFILES.AURA : ELECTRIC_AUDIO_PROFILES.GENERIC;
    const alpha = this.smoothing, beta = this.profileSmoothing;
    this.motorLevel = alpha * this.motorLevel +
      (1 - alpha) * clip(motorAmplitude, 0, 1);
    this.motorRpm = alpha * this.motorRpm +
      (1 - alpha) * clip(Math.abs(shaftRpm), 0, 22000);
    this.regenLevel = alpha * this.regenLevel +
      (1 - alpha) * clip(regenAmplitude, 0, 1);
    this.generatorLevel = alpha * this.generatorLevel +
      (1 - alpha) * clip(generatorAmplitude, 0, 1);
    this.generatorRpm = alpha * this.generatorRpm +
      (1 - alpha) * clip(Math.abs(generatorRpm), 0, 22000);
    this.poleOrder = beta * this.poleOrder + (1 - beta) * profile.poleOrder;
    this.gearOrder = beta * this.gearOrder + (1 - beta) * profile.gearOrder;
    this.carrierHz = beta * this.carrierHz + (1 - beta) * profile.carrierHz;
    this.tractionGain = beta * this.tractionGain + (1 - beta) * profile.tractionGain;
    this.generatorGain = beta * this.generatorGain + (1 - beta) * profile.generatorGain;

    const motorHz = this.motorRpm / 60;
    const generatorHz = this.generatorRpm / 60;
    const step = 2 * Math.PI / this.rate;
    const elecHz = clip(motorHz * this.poleOrder, 0, this.peakLimit / 3.2);
    const meshHz = clip(motorHz * this.gearOrder, 0, this.peakLimit);
    const regenHz = clip(motorHz * (this.poleOrder + 2), 0, this.peakLimit);
    const genHz = clip(generatorHz * 5, 0, this.peakLimit / 2.3);

    this.electromagneticPhase = (this.electromagneticPhase + step * elecHz) % (2 * Math.PI);
    this.meshPhase = (this.meshPhase + step * meshHz) % (2 * Math.PI);
    this.regenPhase = (this.regenPhase + step * regenHz) % (2 * Math.PI);
    this.generatorPhase = (this.generatorPhase + step * genHz) % (2 * Math.PI);
    const carrier = clip(this.carrierHz + 0.12 * elecHz, 0, this.peakLimit);
    this.pwmPhase = (this.pwmPhase + step * carrier) % (2 * Math.PI);

    // Only active electrical components contribute: no synthetic whine at rest.
    const motor = this.motorLevel * this.tractionGain *
      (0.104 * Math.sin(this.electromagneticPhase) +
       0.030 * Math.sin(2 * this.electromagneticPhase + 0.2));
    const gear = this.motorLevel * 0.030 * Math.sin(this.meshPhase + 0.35);
    const inverter = this.motorLevel * 0.010 * (0.5 + 0.5 * this.motorLevel) *
      Math.sin(this.pwmPhase) * (0.8 + 0.2 * Math.sin(this.electromagneticPhase));
    // Regenerative braking adds a separate modulated harmonic. It remains
    // audible while combustion is off, and is not counted as energy.
    const regen = this.regenLevel * (0.041 * Math.sin(this.regenPhase) +
      0.017 * Math.sin(this.pwmPhase + 0.4));
    const generator = this.generatorLevel * this.generatorGain *
      (0.082 * Math.sin(this.generatorPhase) +
       0.023 * Math.sin(2 * this.generatorPhase + 0.4));

    return motor + gear + inverter + regen + generator;
  }
}
