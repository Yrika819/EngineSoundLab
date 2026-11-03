# Audio engine contract — synthesis-first v0.7

## Current implementation (P1 first slice)
- The runnable mobile Web demo uses a **generic I4 4-stroke** engine profile. Not a verified Prius, Aura or other manufacturer's sound.
- `apps/web/public/synth-core.js` is the pure, reusable DSP implemented as original source code. `engine-worklet.js` is the AudioWorklet bridge.
- The 720-degree engine cycle has four 180-degree-spaced firing events with small per-cylinder strength variation. Each excites a fast/slow pressure envelope.
- Exhaust low-frequency pressure, two fixed-frequency acoustic resonators (118 Hz, 247 Hz), load-dependent pressure edge, intake air noise, mechanical order, and speed-dependent road noise are separate DSP layers.
- The DSP receives RPM, engine load, throttle, speed, combustion and application-active independently; both the audio gate and combustion have smoothed control inputs.
- A DC blocking filter, bounded saturation, and Web Audio dynamics compressor are used to limit output; this is not an acoustic loudness certification.
- `tests/synth-core.test.mjs` renders this **exact DSP code** offline and checks event cadence, amplitude, load response, finite values, fade continuity, no-combustion behavior and determinism.
- `tests/worklet-bridge.test.mjs` mocks the browser worklet host and verifies registration and audio output.
- Web AudioWorklet unavailable -> explicitly labeled simplified oscillator fallback (still synth).
- No prerecorded clips, factory ECU maps, brand audio samples or imported third-party synthesizer code.

## Sound requirements / future slices
- **Procedural SYNTH remains the default and essential sound path.**
- P1 later: more than one cylinder configuration, real firing order/bank phasing, improved exhaust pipe / muffler models, engine-specific ignition behavior, measurements against recordings (where lawful), proper motor/road crossfades and offline spectral diagnostics.
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
