# Audio engine contract — v0.5

## Input
The authoritative simulation exports RPM, engine load, engine state, combustionActive, motor speed and load, road speed, and timestamp. Audio receives these independently of gauge animation.

## Rendering modes
- `SYNTH`: per-cylinder firing order, exhaust resonators, intake, relevant vehicle mechanical components, motor and rolling noise.
- `HYBRID`: licensed RPM/load recordings blended with synthetic components using equal-power crossfade and appropriately bounded pitch adjustments.
- Runtime A/B switch preserves vehicle state and avoids level spikes.
- Missing unlicensed or unavailable samples must use a visible SYNTH fallback, **not synthetic audio presented as a recording**.

## State and events
- Distinguish engine stopped, starting, running/combusting, motoring, stopping.
- Emit timestamped start/stop/load-transition events once; schedule short audio events against `AudioContext.currentTime`.
- Audio source parameters should be smoothed independently of UI frame rate.
- Audio worklet and buffers must be disposed on vehicle changes and app termination.

## Target measurements (not yet verified)
- Accelerator-to-audible-response: design target <= 100 ms on reference devices, measured at audio output where possible.
- No audible gaps, clicks, or gain spikes on engine start, stop or mode switching.
- Source loading is vehicle-scoped; waveform clipping and prolonged CPU overload fail tests.
- Test on Android Chrome and iPhone Safari in both portrait and landscape.

## Licensing
Never add real-car recordings, music, manufacturer artwork, or third-party code without checking the required license/permission. Test waveforms should be original or independently synthesized.
