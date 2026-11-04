# P6 — Prius 60 and Aura FE13 instrument-cluster redesign

**Status:** Original digital cluster artwork, based on the information hierarchy in public manufacturer manuals. Not a pixel-for-pixel reproduction, OEM software, or validated ECU instrument calibration.

## Reference study

### Toyota Prius 60-series hybrid

Official instrument manual:
https://manual.toyota.jp/prius/3041/hev/ja_JP/contents/vhch02se010402.php

Toyota's Prius driver display emphasizes a **large numerical vehicle speed**, gear position and **hybrid CHG / ECO / POWER indicator**, with a compact, wide panel and EV indicator. The exact proportions vary by model year and customization. In P6 we replace the old horizontal bar with an original segmented **arc around digital speed**, with green EV/READY accents and a simplified battery indicator. The power/charge scales are **simulation-only normalized estimates**.

### Nissan Aura FE13 e-POWER

Official Aura Classic/Enhanced modes:
https://www.nissan.co.jp/OPTIONAL-PARTS/NAVIOM/NOTE_SPECIAL/AURA/2406/PG/guid-f51c68a2-d3bd-4a0f-b52b-1914736deba4.html

Nissan defines:
- **Classic** — large **POWER on the left / speed on the right** dials with a center information area.
- **Enhanced** — smaller left/right analog-style dials and a wider central advanced-drive information panel.

In P6 we implement **three explicitly sized CSS grid columns** for both modes, at every narrow-screen breakpoint. No full-span center tile can push the right dial into a new row, fixing the previously reported vertical stacking. Original SVG vector art provides independently graduated rings, a moving needle, luminous current-power arc, battery/energy-flow diagram and speed readout. Enhanced changes only the relative column widths and central prominence, not drivetrain physics.

Official Nissan power meter:
https://www.nissan.co.jp/OPTIONAL-PARTS/NAVIOM/NOTE_SPECIAL/AURA/2508/PG/guid-1b4d26bb-0d44-402c-b7bf-392116876251.html

## Implementation

- `apps/web/src/gauge-graphics.ts` — **pure SVG geometry**: clockwise meter arcs, polar coordinates, 200×200 tick marks, CHARGE-to-POWER geometry, non-finite input clipping, independent speed and power needles.
- `apps/web/src/gauge-ui.ts` — static original SVG/HTML cluster templates, cached field references for updates, no external artwork/screenshot/font, 30fps data updates under `main.ts`. Grid order: POWER / ENERGY CENTER / SPEED.
- `apps/web/src/style.css` — black-glass Aura cluster with original white tick rings and subtle red power glow; dark-teal Prius cluster with bright CHG/ECO/PWR arc and central digital speed. The design is CSS-grid responsive on 320px+ phone viewports, and smaller enhanced mode keeps left/right dials on the same row.
- `apps/web/src/gauges.ts` — unchanged deterministic view mapping: combustion/regen/SOC/power/speed derived exclusively from `DriveState`. No DOM values feed back to simulation/audio.
- `tests/p6-gauge-vector.test.ts` — angle/arc/needle/regen tests, SVG structure and non-stacking CSS contract. Existing `tests/gauge-layouts.test.ts` remains.

## Visible fields

| Display | Prius | Aura Classic | Aura Enhanced |
| --- | --- | --- | --- |
| Vehicle speed | large central digital | right circular ring | smaller right circular ring |
| Hybrid load and regen | CHG/ECO/PWR arcs | left POWER/regen ring | smaller left ring |
| Electric mode/engine operation | HEV/EV tag, source status | center state | larger center state |
| SOC | percentage + five-segment indicator | percentage + battery line | percentage + battery line |
| Electric power and generation | motor kW / energy direction | central approximate motor/generator kW | central approximate motor/generator kW |
| Unsupported data | no fabricated odometer, fuel level, temperature, range or ADAS | likewise | likewise |

The drivetrain-to-power-gauge mapping remains illustrative, not factory-calibrated. The Aura power 0–100% and speed 0–180km/h rings are design scales, not promises about simulated performance. Refer to `README.md` and `docs/POWERTRAINS.md` for model limitations.

## Quality gates and limitations

- `npm run check` (TypeScript, physics/audio/UI tests, production Vite build, offline PWA test), and successful deployment on the main SHA.
- PWA must contain the same compiled template and CSS as the accepted branch.
- Small-screen and wide-screen live visual QA is still necessary: static tests can ensure three equal layout columns but cannot prove phone-specific browser rasterization. Note unverified physical-device rendering explicitly until screenshots/inspection are available.
- **No direct OEM illustration, font, copyrighted screenshot, or proprietary icons are embedded in the published app.** Screenshots and manufacturer manuals were research references only.

## P6.1 — mobile browser screenshot/geometry audit

The P6.1 suite adds actual mobile-emulated Chromium rendering with Playwright rather than relying exclusively on CSS/source-string assertions. It captures 36 deterministic instrument combinations (Prius, Aura Classic/Enhanced × 320/360/390/430px × EV/ACCEL/REGEN), plus full narrow-page screenshots, and uploads their geometry JSON files as CI artifacts.

The **POWER and SPEED dials always share the same horizontal row**. At <=360px the center information area is deliberately moved below the pair to keep the rings legible; at >=361px it stays between the two dials. Browser checks enforce no page overflow, adequate dial diameters, readable speed and SOC, and synchronized gauge state. Source geometry and project CSS remain original designs, not manufacturer screenshots.

See [P6.1 visual acceptance checks](P6_1_VISUAL_QA.md). **These are Chromium screenshots, not physical iPhone Safari or Android Chrome screenshots**. No approved pixel-diff baselines exist yet; an engineer still needs to inspect aesthetic accuracy against referenced official documents.

## P6.2 — screenshot-led design review

A real 39-image P6.1 screenshot audit motivated a peripheral-only Aura needle that no longer crosses POWER/SPEED digits, denser dial graduation, original instrument face depth and a vertical digit/unit hierarchy. Prius moves D outside the speed ring and shortens the cramped generating label. Aura Classic/Enhanced styling separates the center information priority; CHARGE reverses the schematic flow arrow. **All SVG artwork is original, not copied or manufacturer-calibrated.** Full design notes: [P6.2 meter refinement](P6_2_METER_DESIGN.md).

## P6.3 — needle interpolation and true energy-flow lanes

A bounded, frame-time-normalized animation now smooths Aura peripheral pointer/progress arcs and the Prius charge/power SVG ring; the digital readouts remain immediate telemetry, not interpolated. Separate vectors are activated according to simulated power sources: Aura battery->motor EV, generator->motor generation, motor->battery regen, and optional generator->battery charging. Prius uses distinct HEV/power-split and EV/regeneration cues rather than reusing the Aura series architecture. Noncombustion spin, negative regen power, and visibility/reduced-motion transitions have dedicated regression checks. See [design and QA](P6_3_GAUGE_MOTION_ENERGY.md).
