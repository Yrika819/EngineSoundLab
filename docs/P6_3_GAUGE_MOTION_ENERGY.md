# P6.3 — gauge motion and source-correct hybrid energy flow

Date: 2026-11-04. Baseline main: `d994c3d1ec9ac0435715dafaa22869b7ff26287d`.

## Findings from the P6.2 source and actual mobile screenshots

- The Aura needles and the Prius CHG/ECO/PWR arc previously changed position
  abruptly with every ~30 Hz main UI redraw. There was no display-inertia
  model independent of the immutable powertrain and raw digital readouts.
- The Aura diagram used a single left-to-right arrow, shown even when
  motor-to-battery regeneration or engine-to-generator production was the
  actual power path. P6.2 reversed the decoration on regeneration, but that
  did not provide separate semantic pathways.
- Both vehicles were represented with a generic "GENERATING" primary label
  when an engine and a generator were operating. That obscured the crucial
  structural distinction: Prius uses a power-split hybrid system; Aura
  e-POWER uses a series architecture (combustion engine drives a generator,
  while the electric motor drives the wheels).

## Implementation

1. **Time-normalized low-pass animation.** `GaugeSmoother` is a deterministic
   finite-value first-order response with a bounded per-frame step, a
   snap-on-first-frame/model-switch policy and reduced-motion bypass.
   The same independent requestAnimationFrame loop smooths Aura power/speed
   outer pointers and progress arcs, and the Prius CHG/DRIVE power arc
   (response constants: approximately 145–165ms). The exact digital speed,
   battery SOC, power text and ARIA readings update immediately and always
   represent the raw vehicle telemetry.
2. **No restart of physics or audio.** The animation runs only while there
   is a difference between the current and target rendered values. A model
   switch cancels and resets stale motion. Hidden tabs cancel and snap.
   `prefers-reduced-motion: reduce` disables decorative flow animation
   and snaps needles to current telemetry without interpolation.
3. **Mutually exclusive power states.** `gaugeEnergyMode` maps existing
   snapshot fields to `EV`, `REGEN`, `GENERATION`, `HYBRID`,
   `ENGINE_ON`, or `SPINNING`. Regeneration takes priority even when
   a generator is running. The power-split Prius uses `HYBRID` for fuelled
   driving; Aura uses `GENERATION` only with actual generator power.
   Non-fuelled crankshaft spinning never becomes "ENGINE ON".
4. **Aura multi-path vector diagram.** The original 132x55 SVG contains
   separate `data-route` paths: battery to motor (EV traction), motor to
   battery (regen), generator to motor, optional generator to battery
   charging. Only routes backed by measured simulation output are revealed
   by `data-energy-flow`, motor torque/power and battery power signs.
   Invisible lanes are not animated. The generator icon is hidden outside
   production mode.
5. **Prius compact motion cues.** A small status strip highlights EV,
   HEV/power-split, or regeneration; it does not copy the Aura generator
   diagram or claim the engine exclusively generates electrical energy.
   The mode text has short 320px labels with full details accessible
   through the footer/ARIA.

## Acceptance and limits

- `tests/p6-gauge-motion.test.ts` tests 30/60/120Hz independence,
  instant first model render, no overshoot/reversal, NaN/Infinity resilience,
  reduced motion via browser QA, and energy-mode classification for both
  different hybrid architectures and simultaneous regen/generator conditions.
- Playwright keeps P6.1 36 screenshot combinations (3 cluster layouts x 4
  mobile widths x 3 dynamic states) and adds live in-page transitions,
  conditional route visibility, battery charging while generating,
  and accessibility/reduced-motion checks. Screenshots/JSON are uploaded as
  CI artifacts.
- All rates, 145–165ms response constants, visual colors and flow curves
  are **engineering approximations**, not OEM CAN or manufacturer cluster
  timing, waveform, or screen-recording data. No copyrighted OEM artwork
  is embedded. Real Pixel Chrome and iPhone Safari manual assessment
  remains a separate task.

## Official technical context

- Toyota Prius official display manual:
  https://manual.toyota.jp/prius/3041/hev/ja_JP/contents/vhch02se010402.php
- Nissan Aura official Classic/Enhanced meter modes:
  https://www.nissan.co.jp/OPTIONAL-PARTS/NAVIOM/NOTE_SPECIAL/AURA/2406/PG/guid-f51c68a2-d3bd-4a0f-b52b-1914736deba4.html
- Nissan second-generation e-POWER technology:
  https://www.nissan-global.com/EN/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER_GEN2/
