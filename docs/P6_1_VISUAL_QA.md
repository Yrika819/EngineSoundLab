# P6.1 browser-rendered mobile instrument QA

A real headless Chromium instance runs the **Vite application**, renders
36 deterministic hybrid scenes, and captures screenshot + DOM geometry
artifacts (plus 3 full-page narrow-mobile screenshots).

Matrix: Prius, Aura Classic, Aura Enhanced; each at 320/360/390/430 CSS px,
with EV cruise, fuelled acceleration/generation and regenerative braking.

The checks detect unexpected horizontal page overflow, clipped critical
speed/power/SOC text, zero-sized/undersized dials, and vertically stacked
Aura POWER and SPEED dials. They also inspect the real needle/path transforms
and EV/HEV, REGEN, GENERATING readouts rather than merely checking CSS source.

Small phones (<=360px) keep the **two Aura dials side-by-side** and move the
secondary information panel below the pair. Wider viewports retain three
columns with the information panel in the middle. This responsive layout
is an original simulation UI, not a pixel-for-pixel OEM artwork copy.

Run:

    npm install
    npx playwright install chromium
    npm run test:visual

CI: the separate browser-visual-qa job runs the suite and uploads artifacts
under the name p6-1-browser-screenshots even if tests fail. Screenshots
are actual browser renders; these are not yet approved pixel-golden
baselines. Pixel aesthetics and device-specific Android/iPhone Safari
rendering remain subject to further review.

A development-only hook on window injects deterministic DriveState fixtures
into the same production gauge renderer. Vite removes the hook from the
production bundle. This suite does not require audio or microphone access.
