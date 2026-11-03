# Gauge rendering — P3 original OEM-inspired skins

## Current browser view modes
- `AUTO` (default): Prius => Prius-inspired horizontal digital speed + CHARGE/ECO/POWER; Aura => Nissan-inspired Classic (large power and speed rings); generic gasoline => SPORT.
- `SPORT`: existing RPM-first generic dial for any vehicle.
- `ENGINEERING`: numeric speed, engine RPM, traction motor RPM, SOC, battery power, motor power, generator power, regen power and energy flow, all sourced from the same `DriveState` as sound and physics.
- `AURA_ENHANCED`: selectable **only** with Aura. Shrinks the power and speed rings and enlarges a central energy-flow view.

The descriptions "Prius-inspired" and "Aura-inspired" refer to general *information layout*, not manufacturer artwork or an exact clone of OEM gauges.

## Implementation
- `apps/web/src/gauges.ts`: pure display adapter and regression tests, no DOM or side effects. It maps `DriveState` into immutable view values. Meter presentation **never** feeds back to vehicle physics or audio.
- `apps/web/src/gauge-ui.ts`: creates the meter mode selector and responsive original DOM skins, updates labels, and hides alternate layouts.
- `apps/web/src/style.css`: touch-friendly, portrait/landscape responsive layout and visual presentation.
- `tests/gauge-layouts.test.ts`: selection rules, EV/charge/power zones, energy flow distinction, telemetry consistency, finite data.

## Data accuracy
- Toyota's hybrid indicator distinguishes CHARGE, ECO, POWER and engine-independent EV information. This project's display segments are **estimated approximations**, not OEM thresholds.
- Nissan Aura Classic uses a power gauge on the left and a speed gauge on the right. Enhanced makes a central information area more prominent. Our energy-flow labels and ring artwork are independent and not identical to Nissan production UI.
- We normalize regen power against an illustrative 28 kW display range and propulsion against 85 or 100 kW depending on prototype. These are visualization scales, **not measured calibrated vehicle maximum power**.
- The energy monitor derives from `regenPowerKw`, `motorPowerKw`, `generatorPowerKw`, `engineMechanicalKw`, and `combustionActive`. For Prius, an approximate generator input is subtracted before showing engine wheel contribution.
- The code does not fabricate odometer, fuel tank status, trip efficiency or temperature. Unknown data is not shown.
- Manufacturer graphics, logos and fonts are NOT included.

## Primary official sources
- Toyota Prius meter/manual: https://manual.toyota.jp/prius/3041/hev/ja_JP/contents/vhch02se010402.php
- Nissan Aura meter Classic vs Enhanced: https://www.nissan.co.jp/OPTIONAL-PARTS/NAVIOM/NOTE_SPECIAL/AURA/2406/PG/guid-f51c68a2-d3bd-4a0f-b52b-1914736deba4.html
- Nissan Aura power meter behavior: https://www.nissan.co.jp/OPTIONAL-PARTS/NAVIOM/NOTE_SPECIAL/AURA/2508/PG/guid-1b4d26bb-0d44-402c-b7bf-392116876251.html

## Remaining work
- User-device visual QA for small screens and orientation changes.
- Gauge runtime smoke in browsers; current automated tests are pure telemetry plus production build.
- Detailed manufacturer-specific instrument animation and validated power curves belong to later releases.
