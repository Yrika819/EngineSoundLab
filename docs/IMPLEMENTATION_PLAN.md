# EngineSoundLab 自律開発計画 — synthesis-first (v0.6)

> Status: agreed project direction. This document is a plan, not evidence that a working simulator has shipped.

## Product directive

- **Primary deliverable:** A responsive, mobile-first, browser-based **driving acceleration sound simulator** whose engine sounds are synthesized procedurally in real time. **The primary sound must work without any prerecorded samples.**
- **Reference cars:** Toyota Prius 60-series 2.0L HEV (power-split THS) and Nissan Aura FE13 2nd-gen e-POWER (series HEV). Their engine operating modes must be distinct.
- **Audio priority:** believable combustion pulse timing, intake/exhaust resonances, throttle/load transients, motor whine, cabin acoustics and road noise. Do not claim identical-to-real-vehicle sound without recordings and listening verification.
- **Meters:** usable mobile layout and Toyota/Nissan-inspired gauge skins, plus SPORT and ENGINEERING. Do not copy proprietary artwork.
- **Playback modes:** SYNTH ships first, works offline, and is the default. HYBRID (licensed samples + synthesis) is an **optional future feature**, not a release blocker. Its interface should remain extensible, but its implementation and sample sourcing must not delay synthesis.
- **Simulation:** driving acceleration/deceleration only. **No neutral/free-rev in the first release.**
- **All core behavior must run locally in the browser** without telemetry, login, external APIs or paid cloud dependencies.

## Autonomy policy

The implementer can make routine software, technical and visual choices and open/merge PRs **only after checks succeed**, as part of the user's delegated implementation authority. Changes should be small and reviewable. Do not request input for routine low-risk trade-offs; document important choices in ADRs. Avoid acquiring paid services, introducing sensitive permissions, adding unlicensed assets, deleting user projects, changing global account security settings, or representing experimental models as exact factory calibration. Such scope changes warrant explicit approval.

This plan does not initiate background execution. Each ChatGPT work session must report actual completed changes and CI evidence; do not promise work will continue while the conversation is idle.

## Delivery strategy: sound-first vertical slices

### P0 — First audible mobile demo (must be next implementation milestone)
- Build a functioning, public-friendly mobile Web UI, user-gesture Start/Stop, accelerator and brake input, RPM, speed, small default gauge and clear synth status.
- Add minimal fixed-step longitudinal vehicle physics and a deterministic, explicitly **generic** engine profile, enough for acceleration to change RPM under load.
- Add a self-contained Web Audio **synth** (initial engine firing pulse/harmonics, low-pass/intake and volume smoothing) that makes audible continuous acceleration sound. Use a simple fallback if AudioWorklet is unsupported.
- No external engine samples, no copyrighted assets, no real-car calibration claims.
- Test: npm build/typecheck/unit tests; GitHub Actions success; browser smoke test; no uncaught exceptions. The first demo may sound synthetic, and must be labeled *prototype*.

### P1 — Credible real-time synthesis
- Separate ignition geometry, combustion source, intake, exhaust resonators, mechanical/motor and environmental layers.
- Parameterize crank angles, cylinder count/firing pattern, RPM, engine load, throttle derivative, engine on/off, cabin position.
- Ensure sample-rate-safe anti-aliasing, smooth parameter automation, no click/clip at mode transitions.
- Add offline waveform diagnostics: RMS/peak, spectrogram/spectral checks, coherent order tracking for different cylinder counts.
- Replace generic fixed tone with independently testable synthesis modules; subjective listening test remains required.

### P2 — Dedicated Prius THS / Aura e-POWER behavior
- Use evidence-graded parameters; share chassis, battery and energy accounting but not identical powertrain controllers.
- Prius: engine + MG1 + MG2 with power-split kinematic constraints; EV/engine drive, regen, transition control.
- Aura: engine-generator only, motor drives wheels; battery SOC and generation demand, combustion on/off, motor audio.
- Preserve audio/telemetry synchronization, physical continuity, and energy flow sign conventions.
- Never equate throttle with engine RPM; no direct engine-wheel coupling in Aura.

### P3 — Manufacturer-inspired mobile gauges
- Toyota Prius-inspired top-mounted speed + CHARGE/ECO/POWER.
- Nissan Aura-inspired wide dual/energy flow display, selectable classic/enhanced aesthetic.
- Generic SPORT RPM/speed and ENGINEERING SOC, generation, load, RPM; with responsive portrait/landscape touch-safe layouts.
- Distinguish true engine RPM from power meter readout; avoid misleading gauge behavior.

### P4 — Test & release hardening
- Installable PWA, cache only local baseline synth assets, privacy and offline UX.
- Automated tests for physics invariants, battery SOC, power balance, audio start/stop, audio mode fallback and UI lifecycle.
- Android Chrome and iPhone Safari hands-on smoke testing; 10-min sustained session and input-loss recovery.
- Deploy a public Web build only after successful CI and content review; keep prototype and release quality labels distinct.

### P5 — Optional licensed sample hybrid audio
- Implement only once synthesis is satisfactory.
- Maintain SYNTH as default and self-sufficient; HYBRID is opt-in and visibly indicates sample availability.
- Keep permission ledger with provenance and permitted uses for each clip; no unlicensed recordings.
- Crossfade RPM × load sample banks with synthesis while preserving vehicle state. A/B tests should show whether hybrid meaningfully improves realism. If not, leave it optional.

### P6 — Additional vehicles / later experiments
- Skyline V37, Lexus IS300h, GR Supra, Civic e:HEV and further models.
- Neutral/free-rev mode only as later separate feature. No fake RPM behavior in production THS/e-POWER.

## Tech and repo conventions

- Mobile-first TypeScript (Vite for browser build), low-allocation Web Audio API + AudioWorklet for sound; Canvas/SVG for gauges.
- Fixed-step physics (initial 10 ms target), audio independently clocked, meter at adaptive 30–60 fps.
- Shared type contracts in `packages/shared-types`, audio in `packages/audio`, simulation in `packages/simulation`, skins in `packages/gauges`, Web UI in `apps/web`.
- Build a functional vertical slice before prematurely splitting packages; refactor only after tests lock behavior.
- Branches `feat/*` / `fix/*` / `docs/*`; small PRs with test evidence. GitHub Actions checks before merging; no direct risky edits to main.
- Public repository and CI. Prefer GitHub Pages for static releases if suitable; no recurring cloud cost.
- Keep code/simple generated test tones original or license-cleared; track third-party dependencies and advisories.

## Quality gates

| Gate | Evidence |
| --- | --- |
| Build | npm build succeeds |
| Types | tsc/typecheck passes |
| Physics | finite values, bounded speed/torque, energy conservation approximations documented |
| Audio | no NaNs, excessive clipping, hard jumps, sustained crackle; audio source independent of recording |
| UI | touch cancel and visibility interruption clear accelerator, usable on narrow screens |
| Devices | Android Chrome / iPhone Safari smoke reports; measured, not assumed |
| Source | official/measured/estimated/placeholder values distinguishable |
| Repo | green GitHub Actions on exact PR HEAD before merge |

Initial performance **targets**, not verified outcomes: >=30 fps for meter on baseline phones, accelerator-to-audible response <=100 ms if attainable, 10 minutes without sustained audio dropouts.

## Priorities when trade-offs arise

1. **Working, stable procedural sound with direct acceleration feedback**
2. **Mobile usability and audio continuity**
3. **Correct Prius/Aura drivetrain differences**
4. **Per-manufacturer gauge fidelity**
5. Broader vehicle catalog / hybrid recorded samples / cosmetic effects

Avoid low-value 3D features and overly detailed physical solvers before usable sound exists.

## GitHub issues

- [#1 Vehicle physics](../issues/1)
- [#2 Prius THS](../issues/2)
- [#3 Aura e-POWER](../issues/3)
- [#4 Procedural audio](../issues/4) — first-class priority
- [#5 Mobile gauges](../issues/5)
- [#6 Hybrid samples](../issues/6) — optional P5
- [#7 Mobile PWA/QA](../issues/7)

## References for architecture only

- https://github.com/YigitSalihEmecen/Engine_Sim
- https://github.com/markeasting/engine-audio
- https://github.com/VinZu17/Engine-Sound-Simulator
- https://github.com/sanketp60/revsynth
- https://github.com/mathworks/Simscape-Hybrid-Electric-Vehicle-Model (license restricts reuse)
