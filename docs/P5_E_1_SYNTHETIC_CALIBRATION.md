# P5-E.1 — Synthetic audio calibration baseline and listening package

Date: 2026-11-04. Baseline main: b11d891 (P6.3).

## Scope and evidence classification

**Delivered in this phase:** a deterministic acoustic verification bench, an
original synthesized WAV comparison pack, and automated source/spectral/peak
checks at 44,100 Hz and 48,000 Hz, with no extra mobile runtime dependencies.

**NOT delivered or claimed:** measured Toyota/Nissan in-cabin SPL,
factory-certified acoustic equalization, real-car microphone frequency
response, YouTube-audio extraction, verified real-car recordings, device
microphone measurements, iPhone Safari/Pixel Chrome listening, and a measured
100 ms end-to-end audio latency or a 10-minute physical-device thermal test.

The WAVs are generated with the *exact* existing
`apps/web/public/synth-core.js`, not different offline sound models. Original
procedural synthesis is still the single required runtime audio backend. The
new tools run only under Node.js/CI and do not add audio clips or recording
assets to the deployed PWA.

## Independent manufacturer references

### Toyota Prius 60 HEV

Toyota's official hybrid owner manual documents motor noise, gasoline engine
start/stop, acceleration noise, mechanical noises around the drivetrain,
regenerative braking noise, and quiet operation without combustion during
some ready/EV states. This justifies the distinct source gates and testing
these states; it **does not** document the car's precise cabin EQ or decibel
ratio. Also, Prius has a power-split HEV: a generator and traction motor do
not make the gasoline engine merely a non-propulsive generator.

Official manual:
https://manual.toyota.jp/prius/3022/hev/ja_JP/contents/vhch01se040401.php

### Nissan Aura FE13 e-POWER

Nissan documents that electric traction propels the vehicle and that
road-noise-based masking can inform generator-engine operation. Its FAQ
lists generation demanded by low battery SOC or acceleration; it also
describes engine-running situations such as warming or noncombustion operation
that **cannot be reconstructed from an unobserved sensor**. The FE13 owner
manual notes engine start/stop and regenerative braking motor noise.
The original acoustic engine/traction/generator separation should be retained.

- Official Aura overview:
  https://www3.nissan.co.jp/vehicles/new/aura/performance_safety/e-power.html
- Official second-generation e-POWER explanation:
  https://www.nissan-global.com/EN/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER_GEN2/
- Nissan FAQ on FE13 engine activity:
  https://faq2.nissan.co.jp/faq/show/2279?back=front%2Fcategory%3Ashow&category_id=206&page=1&site_domain=default&sort=sort_access&sort_order=desc
- Official Aura 2021 owner manual (e-POWER noise):
  https://www.nissan.co.jp/SP/OM/AURA/2108/manual_t00um6xl2a.pdf

None of these establishes genuine microphone recordings, measured
inverter PWM carrier frequencies or electric machine pole/tooth counts.
Values in P5-B/P5-C/D remain explicit acoustic estimates.

## Eight controlled hypothetical test conditions per model

| Scenario | Fuelled ICE | Traction | Generator | Expected distinction |
|---|---|---|---|---|
| parked-silent | no | no | no | Silence; no arbitrary idle noise |
| ev-launch | no | yes | no | Motor present before combustion |
| ev-gentle | no | yes | no | Stronger shaft-dependent electric tone |
| fuelled-accelerate | yes | yes | yes | Engine and motor coexist |
| steady-cruise | yes | yes | yes | Lower-load combustion, road and wind |
| regen-decelerate | no | regen | no | Negative torque/recovery, no ICE |
| soc-generation | yes | yes | yes | Generator independently audible |
| unfuelled-spin | no | yes | starter/motoring | No fuelled combustion order |

These are **frozen simulated AudioWorklet inputs**—a requested audible
condition, not a universal prediction of whether a real hybrid will choose
EV or fuelled mode under any particular speed/temperature/SOC.

The bench uses the real EngineSynthCore for both vehicle profiles:
Prius 2.0L-I4-inspired and Aura I3-inspired. Traction and generator shaft
RPMs are independent estimated values, not OEM gear equations.

## Measurements and acceptance gates

`npm run audio:qa` renders 8 × 2 × 2 = **32 steady original WAV files**
plus 2 × 2 = **4 live EV→fuelled acceleration→regen→EV sequences**.
Each WAV is mono, signed 16-bit PCM; the original browser's AudioWorklet
copies the mono synthesis into its two stereo output channels.

Every steady clip has JSON measurements:
- RMS amplitude in dBFS; digital peak and fraction of samples contacting
  the existing output saturation ceiling;
- engine, engine-motoring, traction/regen, generator/starter, tyre and wind
  **separate bus RMS** (before final DC filter and tanh limiter);
- max neighboring-sample amplitude jump (click-risk proxy);
- FFT (8192-sample Hann window) dominant synthesized peak and
  frequency-region 20–250 / 250–1500 / 1500–8000 Hz energy fractions;
- deterministic float-PCM SHA-256 and firing-event count.

The criteria verify finite bounded samples, a silent parked car, zero
combustion and zero generator source in EV/regen, nonfuelled motoring with
no fake combustion events, electric presence during fuelled acceleration,
a generator source under generating demand, and no significant sample
discontinuities in transitions. Absolute RMS or spectral scores are **NOT**
used as purported manufacturer targets.

Reproducibility / CI:

```bash
npm install
npm run audio:qa
# artifacts: test-results/p5e-audio/*.wav, measurements.json, README.md
npm test
```

The `acoustic-calibration-qa` CI job uploads
`p5-e-acoustic-audition` containing `*.wav` and `measurements.json`.
For listening, start at a low playback volume and compare the same events
between Prius/Aura and 44.1/48 kHz. These generated tracks contain no
copyrighted vehicle recordings.

## What must happen before "real-car calibrated" can be claimed

1. Acquire appropriately licensed, matched real-car microphone references
   with vehicle trim, speed, RPM, SOC and load, listener/microphone position,
   indoor/outdoor setup, file level and postprocessing documented.
2. Level-match synthetic and recorded comparisons at fixed conditions;
   compare spectral order tracks, acceleration transients, generator start,
   decay, road masking, motor and regen separately. Do not equalize to random
   videos with missing microphone provenance.
3. User performs a listening evaluation on Android Chrome and iPhone Safari:
   EV, gentle drive, strong acceleration, regen, long continuous replay,
   interruption/background resume, headphone and speaker sound, and
   potential clipping. Report phone-specific differences honestly.
4. Tune estimated filter/gains *only after* recordings and listening are
   available. Lock comparison measurements and avoid copying protected audio.

**Project status:** P5-E.1 is an engineering **synthetic baseline + manual
audition pack**; actual externally referenced acoustic calibration and
physical-device acceptance remain pending.
