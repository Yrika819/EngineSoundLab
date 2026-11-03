# Quality and release gates

## Baseline
- Every PR: schema contract tests, TypeScript typecheck, and later physics/audio test suites.
- Runtime works without geolocation, microphone, OBD, or device motion permissions.
- Source values labeled official/measured/estimated/placeholder.
- No credentials, personal files, or proprietary vehicle/audio artifacts in the public repository.

## Physics (future tests)
- `PHY-01`: finite speed/acceleration, no numerical blowups at fixed step.
- `BAT-01`: 0 <= SOC <= 1 with feasible charge/discharge limits.
- `BAT-02`: energy balance within documented tolerance.
- `THS-01`: EV start possible under appropriate conditions.
- `THS-02`: engine/motor contributions and gear speed coupling consistent.
- `EPO-01`: e-POWER motor drives wheels; no engine shaft-to-wheel torque path.
- `EPO-02`: SOC/generation request changes engine operation as designed.
- `EPO-03`: no combustion audio when combustionActive is false.

## Audio (future tests)
- `AUD-01`: RPM ramps smoothly, no synthetic pitch jumps.
- `AUD-02`: audio mode switch preserves simulation state and avoids clipping.
- `AUD-03`: missing sample assets yield explicitly labeled synth fallback.
- `AUD-04`: start/stop events occur exactly once when applicable.

## Mobile and display (future tests)
- `UI-01`: gauge telemetry equals simulation telemetry (only visual smoothing allowed).
- `UI-02`: portrait/landscape, touch cancel and safe-area layouts.
- `MOB-01`: background/foreground clears accelerator state; resume uses user gesture.
- `MOB-02`: 10-minute live test, no persistent audio dropouts.
- Target 30+ fps under normal load; target audible response <=100 ms; both require measurement, not claims.

## Branch discipline
- Main branch protected after baseline once requirements are decided; use PRs and required CI.
- No force-push to main; no unreviewed external audio/code.
