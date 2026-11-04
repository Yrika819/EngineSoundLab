# Audio engine contract — synthesis-first v0.7

## Current implementation (P1 first slice)
- The runnable mobile Web demo uses a **generic I3/I4/I6 4-stroke audio sound profiles with shared vehicle physics** engine profile. Not a verified Prius, Aura or other manufacturer's sound.
- `apps/web/public/synth-core.js` is the pure, reusable DSP implemented as original source code. `engine-worklet.js` is the AudioWorklet bridge.
- The 720-degree engine cycle can be configured to I3 (three events every 240 degrees), I4 (four events every 180 degrees), or I6 (six events every 120 degrees), with per-cylinder strength variations. A sound profile change does not reset vehicle physics or audio node, and is not a change to mechanical drivetrain calibration. Each excites a fast/slow pressure envelope.
- Exhaust low-frequency pressure, two fixed-frequency acoustic resonators (118 Hz, 247 Hz), load-dependent pressure edge, intake air noise, mechanical order, and speed-dependent road noise are separate DSP layers.
- The DSP receives RPM, engine load, throttle, speed, combustion and application-active independently; both the audio gate and combustion have smoothed control inputs.
- A DC blocking filter, bounded saturation, and Web Audio dynamics compressor are used to limit output; this is not an acoustic loudness certification.
- `tests/synth-core.test.mjs` renders this **exact DSP code** offline and checks event cadence, amplitude, load response, finite values, fade continuity, no-combustion behavior and determinism.
- `tests/worklet-bridge.test.mjs` mocks the browser worklet host and verifies registration and audio output.
- Web AudioWorklet unavailable -> explicitly labeled simplified oscillator fallback (still synth).
- No prerecorded clips, factory ECU maps, brand audio samples or imported third-party synthesizer code.

## Sound requirements / future slices
- **Procedural SYNTH remains the default and essential sound path.**
- P1 later: real firing order/bank phasing, improved exhaust pipe / muffler models, engine-specific ignition behavior, measurements against recordings (where lawful), proper motor/road crossfades and offline spectral diagnostics. Note: inline 3/4/6 configuration switching is now implemented as an acoustic prototype, not OEM calibration.
- P2: when powertrain controllers are implemented, engine `combustion` will follow actual engine state; stopped engine must not produce synthetic combustion even when the vehicle moves.
- P5 optional HYBRID may use appropriately licensed RPM × load recordings, but may not block the synthesized simulator.

## API timing / lifecycle
- Authoritative simulation exports RPM, load and speed independently of any gauge-needle animation. The UI passes throttle directly as an additional acoustic parameter.
- Fixed-step vehicle simulation; audio via worklet sample clock and AudioParam scheduling, no per-sample object allocations.
- Audio must start after user activation and suspend on backgrounding; do not automatically resume microphone/speaker access without user intent.
- The compressor, output gain and worklet are all released by `dispose`; app lifecycle state is separate from ignition state.

## Unverified / measurement goals
- Real-phone listening quality, audible latency, battery draw, dynamic range and ten-minute stability are **not yet measured on the new P1 implementation**.
- Targets: 30+ fps gauge, aim for <=100 ms throttle-to-audible change, no audible clicks or persistent buffer dropouts. These are targets, not claimed outcomes.
- High-order resonance tuning / exact real-car authenticity require controlled listening and proper reference material.

## P3+ Electric traction, inverter & regen synthesis (prototype)

The new `apps/web/public/electric-synth.js` runs at the same WebAudio sample clock as the combustion DSP but with independent phase accumulators and smoothed controls. No prerecorded or OEM assets.

Electric voices:
- Traction motor electromagnetic fundamental and harmonics tied to `mg2Rpm` and the magnitude of `motorPowerKw`.
- Approximate reduction gear order tied to traction motor RPM.
- Low-level inverter-related synthetic carrier/sideband, pitch-smoothed for profile changes; **carrier values are not verified switching frequencies.**
- Additional braking/regen modulation driven by `regenPowerKw` and independent from engine combustion.
- Generator-machine harmonics driven by `generatorPowerKw` and the separate `mg1Rpm` channel.

WebAudio parameters now include `motor`, `motorRpm`, `regen`, `generator`, `generatorRpm` and `electricProfile` (0 generic / 1 Prius-inspired / 2 Aura-inspired). Numeric frequencies, pole orders, gear orders and mixture gains are all **illustrative DSP parameters**; no factory-calibrated motor topology or measured inverter PWM is claimed.

Engine-off EV operation keeps the combustion layer silent but lets independent traction/regen sounds through. When the generator power is zero its voice fades to silence. Audio profile transitions smooth frequency and amplitude parameters; a master limiter remains active.

Regression tests in `tests/electric-drive-audio.test.mjs` cover isolated motor, generator, regen, profile distinction, noise bounds, finite output and click-free changes. The worklet bridge contract also checks all new parameters. Browser implementation and actual smartphone listening/latency/battery tests still require real device review.

Reference drivetrain topology only:
- https://www.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER/
- https://toyota.jp/prius/


## P5-A: authoritative typed audio telemetry

`apps/web/src/audio-telemetry.ts` exports a pure `toAudioTelemetry(DriveState)` converter and `AudioTelemetry` contract. `apps/web/src/audio.ts` is the only runtime bridge from that contract to Web Audio's smoothed parameters (including its simplified fallback path).

- `engineOperation`, `engineRpm`, `engineRotating` and `combustionGate` are separate. `RUNNING_FUELLED` is the only phase that can set the combustion audio gate.
- Traction shaft RPM, signed shaft torque, signed traction power, regen electrical power, generator shaft RPM/output and electrically consumed unfuelled engine motoring power are exposed independently.
- The exact P3+ normalized motor/regen/generator loudness values remain initially compatible. Redesigning their real-car spectral character is P5-B/P5-C; no manufacturer-calibrated PWM/order or equalizer values have been added.
- The converter is deterministic, clamps invalid input values, and does not read DOM meter values. `CABIN` is the default future listening mode; cabinet/engine-bay acoustics are reserved for P5-D.
- The existing P1 AudioWorklet's single combustion control remains; un-fuelled rotating machinery is **not** falsely passed through as fuelled combustion. Adding its mechanical voice is planned in P5-B.


## P5-B: Prius and Aura separate procedural combustion timbre

Added `apps/web/public/ice-acoustics.js`, a **recording-free model** built from per-cylinder four-stroke pressure pulses produced by `EngineSynthCore`, two separately tuned pipe/body resonators per car, load-sensitive induction air turbulence, crankshaft-order components and short throttle transients. The original generic I3/I4/I6 sound remains selectable. The car selection automatically chooses the Prius or Aura timbre layer; the manual sound selector still changes cylinder firing geometry only.

- Prius 60-series 2.0 HEV: I4 2.0 firing order, stronger low-frequency exhaust body, and attenuated harsh edge/mid-band relative to the generic profile. This follows the **direction** of the Prius developer's low-frequency emphasis remarks; our EQ/resonances are estimated and NOT factory measurements.
- Aura FE13 HR12DE: I3 1.5 firing order with quieter mechanical imbalance and restrained higher-frequency pressure edge to reflect Nissan's outer balancer/noise mitigation design. It is NOT a recording or engine-specific factory spectral measurement.
- `VehicleIceAcoustics` crossfades vehicle sound color over approximately 90ms, keeping both resonator banks warm through transitions.
- `engineMotoring` is a new independent AudioWorklet control, following `engineOperation` for STARTING/STOPPING/SPINNING_UNFUELLED; engine RPM alone never forces fuelled exhaust. Mechanical engine rotation without combustion can now make a subtle sound without an ignition impulse.
- All new synthesis remains inside the existing worklet, with no third-party audio assets and no per-sample allocations of arrays/objects.
- `ice-acoustics.js` joins the versioned PWA precache so offline synthesis continues to work.

WebAudio controls: `iceProfile` (0 generic, 1 Prius-inspired, 2 Aura-inspired), `engineMotoring` (0..1). `AudioTelemetry` is the source of truth. Numeric resonator parameters, amplitudes, RPM curves and acoustic blends are synthetic **estimates**. Future P5-C addresses electric-machine tuning; P5-D will perform explicit cabin/engine-bay transfer/road masking. A recording-based real-car validation has **not** been performed.

Manufacturer background:
- https://www.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/HR12DE/ — balance/quietness of the HR12DE.
- https://www2.nissan-global.com/EN/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER_GEN2/ — second generation e-POWER road-noise masking.
- https://car.watch.impress.co.jp/docs/event_repo/2023aee/1503945.html — Prius engineer interview on sound shaping (reported speech, not measured transfer function).
- https://manual.toyota.jp/prius/ — hybrid engine/EV operating states.

## P5-B.1 estimated cabin equalization and fuel cut

The existing P5-B `ice-acoustics.js` remains the only vehicle-specific ICE source; the conflicting parallel alternate prototype is NOT combined into a second active engine. Each car's combustion voice now has a stable peaking biquad with coefficients set once at construction. The initial **estimated** mid-band presets are Prius 365Hz/-4.8dB (Q 0.78) and Aura 365Hz/-1.5dB (Q 0.98). This is a qualitative development direction based on reported Prius low-frequency emphasis, not a measured Toyota transfer function. The intake transient envelope lasts about 85ms instead of 7ms.

Raw fuel-off now prohibits any new firing impulse immediately, even while the combustion output and duct resonance are smoothing toward silence. This avoids ghost ignitions during the first moments after fuel cut. The AudioWorklet combustion default is now **0** until vehicle telemetry explicitly requests a fuelled engine, avoiding an unwanted starter blast when the app begins in EV mode.

New tests verify 365Hz and 90Hz steady-state filter transfer, distinct Prius/Aura mid-band gains, 44.1/48/96kHz filter stability, no new fuel-cut ignition pulses, and bounded output during transitions. Browser and PWA functionality stay unchanged. User listening comparisons with real cabin recordings are still pending.

Reference: https://car.watch.impress.co.jp/docs/event_repo/2023aee/1503945.html and https://www.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/HR12DE/.

## P5-C: distinct motor/generator motoring, torque sign and alias protection

- Updated `electric-synth.js` now provides individual (inspectable) traction electromagnetic, reduction-gear, inverter carrier, regen, generator and starter/motoring components. These voices stay independent of combustion.
- P5-A's `tractionMotorTorqueNm` is normalized to signed `motorTorqueNormalized`, and STARTING/non-fuelled rotation is normalized to `generatorMotoringAmplitude`. These separate `motorTorque` [-1,+1] and `generatorMotoring` [0,1] Web Audio parameters are distinct from positive electrical generation.
- Prius MG1 and MG2 use separate shaft speeds; the Aura generator and traction motor also remain independent, without any new mechanical engine-to-wheel path. Profile orders/inverter carriers are **estimated synthesis parameters**, not OEM machine poles, PWM maps, gear counts or measurements.
- Above-Nyquist upper harmonics fade out rather than folding into the audible range. Profile/audio gain are interpolated; the audio loop does not allocate per-sample objects. Output remains covered by the existing compressor/soft limiter.
- The old 6-argument `ElectricDriveSynth.next()` remains backward compatible. New optional arguments are signed torque and generator motoring; `EngineSynthCore.next()` appends them after the existing P5-B fields.
- Validation: `tests/p5c-electric-machine.test.mjs`, `tests/p5c-electric-telemetry.test.ts`, `tests/worklet-bridge.test.mjs`, and PWA production build. A passing test proves signal routing and DSP stability, **not actual Prius/Aura sound authenticity**.
