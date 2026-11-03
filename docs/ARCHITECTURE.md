# Architecture — v0.5 design baseline

Status: **design / contracts only**. There is no functioning audio or vehicle simulator yet.

## Modules
1. Mobile input: pointer input, accelerator/brake, lifecycle. No keyboard-only UI.
2. Fixed-step vehicle physics: 10 ms nominal integration step; bounded catch-up after frame delays.
3. Powertrain controllers: dedicated ICE, Toyota power-split HEV, Nissan series HEV implementations.
4. Battery/energy accounting: state of charge (SOC) and power conservation, unit-stable.
5. Telemetry: immutable snapshot with a sequence number and simulation time.
6. Audio adapter: maps telemetry to low-allocation audio parameter frames.
7. Audio renderers: procedural synthesis / licensed-sample hybrid, independently selectable.
8. Gauge themes: model-inspired OEM-style layouts, SPORT and ENGINEERING. Gauge smoothing is visual-only.
9. App lifecycle: audio starts after user gesture; backgrounding releases controls and suspends output.

## Physics vs rendering clocks
- Simulation fixed step: initial design target **100 Hz**, not a measured performance guarantee.
- Meter: target 30–60 fps and read-only interpolated snapshots.
- Sound: AudioWorklet (where supported) at the device audio sample rate; use AudioParam automation, never set pitch from gauge-needle animation.
- Event queue: starting, stopping, shift events etc. need sequence IDs; a single UI frame must not swallow events.
- Audio sample playback rate and synthetic combustion phase both derive from authoritative simulation RPM.
- Keep synchronization by timestamping telemetry and scheduling audio envelopes on the audio clock.

## Audio modes
- SYNTH: firing geometry, exhaust/intake, motor whine, road/wind layers.
- HYBRID: load/RPM sample interpolation *plus* compatible procedural layers. Missing licensed samples -> explicit SYNTH fallback.
- Switching mode must preserve powertrain simulation state. Crossfade without reset or sudden gain surge.
- Engine stopped and no combustion: combustion generator is silent. Motoring (engine rotating without fuel) is a separate acoustic state.

## Mobile constraints
- Support both portrait and landscape; controls large enough for touch and safe-area insets.
- Pause simulation and zero inputs on document visibility loss or audio interruption.
- Never start WebAudio without a user activation.
- Load assets by selected vehicle; cache only allowed assets and expose cache usage.
- Desktop keyboard support can be added without making it a requirement for mobile UX.
- Source code is public; no credentials, copyrighted car audio, or manufacturer artwork committed by default.

## Scope exclusions for first milestone
No free-rev/neutral rev mode, no driving 3D game, no OBD integration, no GPS or device sensor-based real-car driving, no remote telemetry.
