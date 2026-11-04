/**
 * P5-D: dedicated in-cabin / engine-bay soundstage and speed-dependent
 * tyre/wind masking. All audio is ORIGINAL real-time procedural synthesis.
 *
 * Physically motivated but NOT measured Toyota/Nissan cabin transfer
 * functions, NVH coefficients or real vehicle microphone recordings.
 *
 * The cabin and engine-bay presets blend smoothly without allocating new
 * objects in the AudioWorklet's sample-render loop. Distinct ICE, rotating
 * machinery, traction, generator, tyre and airflow sound buses are retained.
 */
const clip = (x, low, high) =>
  Number.isFinite(x) ? Math.max(low, Math.min(high, x)) : low;

export const SOUNDSTAGE_PRESETS = Object.freeze({
  GENERIC: Object.freeze({
    engineGain: 0.28, engineCutoffHz: 1150,
    motoringGain: 0.60, tractionGain: 0.85,
    generatorGain: 0.58, electricCutoffHz: 3900,
    tyreGain: 1.0, windGain: 1.0
  }),
  PRIUS: Object.freeze({
    // P5-D.1: estimated mix to keep MG2/MG1 audible with a fuelled ICE.
    engineGain: 0.075, engineCutoffHz: 950,
    motoringGain: 0.70, tractionGain: 1.72,
    generatorGain: 1.08, electricCutoffHz: 4200,
    tyreGain: 0.90, windGain: 0.86
  }),
  AURA: Object.freeze({
    // P5-D.1: estimated mix for the independent e-POWER electric drive.
    engineGain: 0.090, engineCutoffHz: 1030,
    motoringGain: 0.69, tractionGain: 1.68,
    generatorGain: 1.10, electricCutoffHz: 4500,
    tyreGain: 0.85, windGain: 0.84
  })
});

export class CabinSoundstage {
  constructor(rate = 48000, seed = 0x4e56534d) {
    if (!Number.isFinite(rate) || rate < 8000 || rate > 192000)
      throw new RangeError("invalid sample rate");
    this.rate = rate;
    this.seed = (seed >>> 0) || 1;
    this.profileLag = Math.exp(-1 / (rate * 0.16));
    this.modeLag = Math.exp(-1 / (rate * 0.12));
    this.focusLag = Math.exp(-1 / (rate * 0.16));
    this.speedLag = Math.exp(-1 / (rate * 0.10));
    this.engineLow = 0;
    this.motoringLow = 0;
    this.tractionLow = 0;
    this.generatorLow = 0;
    this.tyreLow = 0;
    this.tyreMid = 0;
    this.windLow = 0;
    this.windMid = 0;
    this.speed = 0;
    this.roughness = 0.35;
    this.bayMix = 0;
    this.hybridFocus = 0;
    this.engineGain = SOUNDSTAGE_PRESETS.GENERIC.engineGain;
    this.motoringGain = SOUNDSTAGE_PRESETS.GENERIC.motoringGain;
    this.tractionGain = SOUNDSTAGE_PRESETS.GENERIC.tractionGain;
    this.generatorGain = SOUNDSTAGE_PRESETS.GENERIC.generatorGain;
    this.engineCutoff = SOUNDSTAGE_PRESETS.GENERIC.engineCutoffHz;
    this.electricCutoff = SOUNDSTAGE_PRESETS.GENERIC.electricCutoffHz;
    this.tyreGain = SOUNDSTAGE_PRESETS.GENERIC.tyreGain;
    this.windGain = SOUNDSTAGE_PRESETS.GENERIC.windGain;
    this.lastEngine = 0;
    this.lastMotoring = 0;
    this.lastTraction = 0;
    this.lastGenerator = 0;
    this.lastTyre = 0;
    this.lastWind = 0;
    this.lastMaskAmount = 0;
  }

  random() {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 2147483648 - 1;
  }

  /**
   * Return one mono sample mixed from separate powertrain sources.
   *
   * @param {number} combustion fuelled ICE (may be 0 during EV operation)
   * @param {number} engineMotoring unfuelled crankshaft/start sound
   * @param {number} traction MG2 or EM47 drive, reducer, inverter and regen
   * @param {number} generator MG1 / generator or starter electric voice
   * @param {number} speedTarget vehicle speed, m/s
   * @param {number} profileCode 0 generic, 1 Prius-inspired, 2 Aura-inspired
   * @param {number} listeningMode 0 CABIN, 1 ENGINE_BAY (creative preview)
   * @param {number} roadRoughness 0 smooth, 0.35 standard, 1 coarse
   * @param {number} electricFocus -1 engine-forward, 0 balanced, 1 electric-forward
   */
  next(combustion = 0, engineMotoring = 0, traction = 0, generator = 0,
       speedTarget = 0, profileCode = 0, listeningMode = 0,
       roadRoughness = 0.35, electricFocus = 0) {
    const preset = profileCode === 1 ? SOUNDSTAGE_PRESETS.PRIUS
      : profileCode === 2 ? SOUNDSTAGE_PRESETS.AURA
      : SOUNDSTAGE_PRESETS.GENERIC;
    const a = 1 - this.profileLag;
    this.engineGain += (preset.engineGain - this.engineGain) * a;
    this.motoringGain += (preset.motoringGain - this.motoringGain) * a;
    this.tractionGain += (preset.tractionGain - this.tractionGain) * a;
    this.generatorGain += (preset.generatorGain - this.generatorGain) * a;
    this.engineCutoff += (preset.engineCutoffHz - this.engineCutoff) * a;
    this.electricCutoff += (preset.electricCutoffHz - this.electricCutoff) * a;
    this.tyreGain += (preset.tyreGain - this.tyreGain) * a;
    this.windGain += (preset.windGain - this.windGain) * a;

    const m = 1 - this.modeLag;
    this.bayMix += ((listeningMode >= 0.5 ? 1 : 0) - this.bayMix) * m;
    this.roughness += (clip(roadRoughness, 0, 1) - this.roughness) * m;
    this.speed += (clip(speedTarget, 0, 90) - this.speed) * (1 - this.speedLag);
    // Focus is an audition-only mix control. It never changes drivetrain
    // state or creates electrical audio from an unpowered generator.
    const requestedFocus = profileCode === 1 || profileCode === 2
      ? clip(electricFocus, -1, 1) : 0;
    this.hybridFocus += (requestedFocus - this.hybridFocus) *
      (1 - this.focusLag);
    const moreElectric = Math.max(0, this.hybridFocus);
    const moreEngine = Math.max(0, -this.hybridFocus);
    const engineMix = 1 - 0.22 * moreElectric + 0.50 * moreEngine;
    const tractionMix = 1 + 0.65 * moreElectric - 0.25 * moreEngine;
    const generatorMix = 1 + 0.60 * moreElectric - 0.28 * moreEngine;
    const bay = this.bayMix;

    // Subtle low-pass acoustic shielding for cabin. In engine-bay mode,
    // the dry source is more prominent, but all filters stay warm.
    const engineAlpha = clip(
      (2 * Math.PI * this.engineCutoff) / this.rate, 0.015, 0.52);
    const electricAlpha = clip(
      (2 * Math.PI * this.electricCutoff) / this.rate, 0.020, 0.70);
    const ice = clip(combustion, -64, 64);
    const machinery = clip(engineMotoring, -64, 64);
    const drive = clip(traction, -64, 64);
    const gen = clip(generator, -64, 64);
    this.engineLow += engineAlpha * (ice - this.engineLow);
    this.motoringLow += engineAlpha * (machinery - this.motoringLow);
    this.tractionLow += electricAlpha * (drive - this.tractionLow);
    this.generatorLow += electricAlpha * (gen - this.generatorLow);

    // Speed-dependent tyre/road noise: coarse surface broadens the mid-band.
    // The wind layer rises more steeply with speed. These are estimated
    // texture and amplitude curves; weather/tyre/road conditions are not
    // available from the P5-A vehicle model.
    const whiteTyre = this.random();
    const whiteWind = this.random();
    this.tyreLow += 0.021 * (whiteTyre - this.tyreLow);
    this.tyreMid += 0.19 * (whiteTyre - this.tyreMid);
    this.windLow += 0.017 * (whiteWind - this.windLow);
    this.windMid += 0.35 * (whiteWind - this.windMid);
    const rolling = Math.pow(clip(this.speed / 34, 0, 1.8), 1.08);
    const rushing = Math.pow(clip((this.speed - 3) / 28, 0, 2), 1.7);
    const tyreEnvelope = rolling *
      (0.018 + this.roughness * 0.027) * this.tyreGain;
    const windEnvelope = rushing * 0.017 * this.windGain;
    const tyreTexture = this.tyreLow * 2.5 +
      (this.tyreMid - this.tyreLow) * (0.52 + 0.48 * this.roughness);
    const windTexture = this.windMid - this.windLow;
    const maskingIntensity = clip(
      (tyreEnvelope + windEnvelope) / 0.083, 0, 1);
    this.lastMaskAmount = maskingIntensity;

    // Masking is mainly perceptual: background becomes louder. This gentle,
    // capped 12% powertrain attenuation only approximates reduced salience.
    // Do NOT apply compressor-style pumping to the engine/generator bus.
    const cabinMask = 1 - 0.12 * maskingIntensity;
    const cabinEngine = (0.20 * ice + 0.80 * this.engineLow)
      * this.engineGain * cabinMask;
    const cabinMotoring = (0.20 * machinery + 0.80 * this.motoringLow)
      * this.motoringGain * cabinMask;
    const cabinTraction = (0.40 * drive + 0.60 * this.tractionLow)
      * this.tractionGain * cabinMask;
    const cabinGenerator = (0.30 * gen + 0.70 * this.generatorLow)
      * this.generatorGain * cabinMask;

    // Engine bay is a qualitative listening-perspective switch, NOT a
    // certified measured microphone position or outdoor noise propagation.
    // Bay preview should not overdrive the core limiter for hybrid ICE.
    const bayEngine = profileCode === 0 ? 1.10 : 0.35;
    this.lastEngine = (cabinEngine * (1 - bay) + ice * bayEngine * bay)
      * engineMix;
    this.lastMotoring = (cabinMotoring * (1 - bay) + machinery * 1.02 * bay)
      * engineMix;
    this.lastTraction = (cabinTraction * (1 - bay) + drive * 1.45 * bay)
      * tractionMix;
    this.lastGenerator = (cabinGenerator * (1 - bay) + gen * 1.16 * bay)
      * generatorMix;
    this.lastTyre = tyreTexture * tyreEnvelope * (1 - 0.75 * bay);
    this.lastWind = windTexture * windEnvelope * (1 - 0.82 * bay);

    return this.lastEngine + this.lastMotoring +
      this.lastTraction + this.lastGenerator +
      this.lastTyre + this.lastWind;
  }
}
