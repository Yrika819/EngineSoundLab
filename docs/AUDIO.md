# Audio engine contract — synthesis-first v0.6

## Non-negotiable product priority
**Procedural synthesis is the primary and fully functional sound path.** The first running demo must produce acceleration sound without loading recordings. HYBRID is an optional future extension, not needed for baseline release or CI.

## Input and timing
The authoritative simulation exports RPM, engine load, engine state, combustionActive, motor speed and load, road speed and timestamp. Audio ignores visual needle smoothing. Drive physics on a fixed-step clock and schedule audio via AudioContext timing. Avoid per-render allocations.

## Core synth pipeline
1. Per-cylinder combustion/ignition geometry at 720 degrees for 4-stroke engines (never just raw RPM -> oscillator pitch).
2. Intake, exhaust and bank-resonator sound; allow load/throttle derivative to modify timbre independently of RPM.
3. Engine starter/stopping and motoring distinction, motor whine/road-wind bed as separate controllable voices.
4. Stable interpolation/AudioParam smoothing, clipping guard and fallback for unsupported AudioWorklet.
5. Save measurable sample-to-sample continuity, RMS and peak diagnostics; subjective comparison needed for realism claims.

## Optional rendering mode
- `SYNTH`: default, always available, offline-capable, no sample dependencies.
- `HYBRID`: after P4 only, use licensed RPM/load recordings blended with synthesis and equal-power crossfades.
- Switching audio mode must preserve simulation state and avoid level jumps.
- Missing authorized sample assets must show an explicit SYNTH fallback. Do not relabel synthesis as recorded audio.

## State/events
- Engine state: STOPPED, CRANKING, RUNNING, MOTORING, STOPPING.
- Combustion audio must be silent when combustionActive=false; remaining motor/road layers may continue.
- Timestamp and queue transient events once.
- Audio must suspend on backgrounding and reactivate through user gesture where browser requires.
- Dispose graph nodes/buffers on vehicle change or teardown.

## Performance / safety targets — not yet verified
- Target audible throttle response <=100 ms, to be confirmed on Android Chrome and iPhone Safari.
- No unexpected clicks, clipping or gaps during RPM transitions and start/stop.
- Stereo/output limiting must be comfortable at reasonable device volume (never force maximum volume).
- Prioritize audio stability over meter animations under CPU pressure.

## Asset policy
Do not bundle unlicensed recordings, trademark artwork, music, or third-party source code. Test signals must be original. The synthesized result is an approximation until listening and real-car measurements validate it.
