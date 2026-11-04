# P6.2 — Prius/Aura visual-fidelity refinement

Date: 2026-11-04. Reference main: 5596cce.

## Screenshot-led findings

We inspected the 39 original **P6.1 real Chromium screenshots**, including
320px and 430px EV and accelerating Prius, Aura Classic, and Aura Enhanced.
Those images are retained as the original GitHub Actions artifact:
https://github.com/Yrika819/EngineSoundLab/actions/runs/41832173692/artifacts/13322039815

Observed defects, independently corroborated by the SVG/DOM code:

1. **Aura POWER and SPEED**: long needles originating near the dial center
   crossed and visually competed with the large digital readouts. In the 430px
   acceleration screenshot, the speed needle visibly ran over the numeral
   "112"; small km/h text collided with the right-side 160 tick label.
2. **Prius acceleration**: the narrow sidebar wrapped the English word
   GENERATING, and the left-aligned gear D crowded the large central speed.
3. **Aura Enhanced vs Classic**: Enhanced's central area was geometrically
   wider but visually too similar. It needed stronger visual priority without
   sacrificing the two outside dials or 320–430px layout performance.
4. **General texture**: sparse tick gradations and shallow face detailing
   made the original vector meters look more like wireframes than instruments.

## Changes (original vector artwork only)

- The Aura SVG long needle was replaced with a **perimeter-only tapered pointer**:
  its unrotated path ranges from y=10 to y=28 in a 200x200 coordinate frame,
  leaving the central digits entirely clear at all angles. Pointer transforms
  still take exactly the same speed and regenerative power values. An original
  layered dial face, thin interior ring and more frequent calibrated tick marks
  improve instrument legibility.
- POWER and SPEED numerals now occupy separate vertical rows from their units,
  with brighter typesetting and minimum-size safeguards.
- Enhanced strengthens the center information emphasis with its own internal
  border/light treatment while preserving the actual layout checks from P6.1.
  320–360px continues showing both dials together above the lower info panel.
- Prius shows its large speed with a separate km/h line, and the D selector
  to the right of the ring, as an independent status badge. Narrow-view
  GENERATING is shortened to GEN with the complete text retained in
  aria-label and Japanese explanatory footer.
- The central Aura regen arrow visually reverses in the CHARGE state. This
  is a schematic illustration, not an OEM energy monitor drawing.
- No proprietary logos, OEM images, trip/odometer, weather, ADAS or false
  telemetry have been introduced. All power scales remain simulated.

## Acceptance criteria

- Existing P6.1 37-case Chromium matrix stays PASS for Prius, Aura Classic
  and Enhanced × 320/360/390/430px × EV/ACCEL/REGEN, including saved PNGs
  and layout JSON. **Post-fix screenshots must be inspected again.**
- P6.2 adds regression checks for peripheral-only pointer geometry, readout
  and units never overlapping, vehicle mode CSS, and Prius gear placement.
- Existing physics, audio, TypeScript, Vite build, and offline PWA checks
  remain PASS. Browser output is *not* a test on a physical Pixel or iPhone.
- The project has **not** yet established a licensed pixel-exact reference
  image baseline, so visual fidelity is a reasoned design review and not
  a numerical claim of OEM-perfect replication.

## Official sources

- Toyota Prius 60-series: https://manual.toyota.jp/prius/3041/hev/ja_JP/contents/vhch02se010402.php
- Nissan Aura Classic/Enhanced description:
  https://www.nissan.co.jp/OPTIONAL-PARTS/NAVIOM/NOTE_SPECIAL/AURA/2406/PG/guid-f51c68a2-d3bd-4a0f-b52b-1914736deba4.html
- Nissan Aura official cockpit photography:
  https://www3.nissan.co.jp/vehicles/new/aura/interior/interior.html
