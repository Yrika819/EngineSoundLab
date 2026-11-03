# Vehicle powertrain specification — design v0.5

**These are conceptual models, not manufacturer ECU maps or validated digital twins.**

## Prius 60 series 2.0 HEV (FWD): POWER_SPLIT_HEV
- Powertrain components: engine, MG1/generator, MG2/traction motor, battery, power split mechanism, wheels.
- Controller computes requested wheel traction, battery limits, engine start request and operating target.
- Physical coupling of gear members must be respected in the detailed model. Conceptually: `(Ns + Nr) * omegaCarrier = Ns * omegaSun + Nr * omegaRing`.
- Modes: READY, EV_DRIVE, ENGINE_STARTING, HYBRID_DRIVE, REGEN_BRAKE. Engine rotation/burning state modeled separately from drive mode.
- Low-speed EV start can be possible if operating conditions permit; kick-in under higher load / low SOC / warm-up. No unsupported fixed thresholds.
- Distinguish HEV 2.0, HEV 1.8, PHEV, FWD/AWD as different preset variants.

## Nissan Aura FE13 (FWD): SERIES_HEV, second-generation e-POWER
- Engine drives generator; **no mechanical engine-to-wheel path**. Traction motor exclusively drives wheels.
- Modes: READY, BATTERY_DRIVE, GENERATION_REQUEST, ENGINE_STARTING, ENGINE_GENERATING, REGEN_BRAKE.
- Engine may start due to SOC, load, temperature/warm-up, heating and other environmental/vehicle requirements. Some operation without generation is possible.
- Generation request does not imply a one-to-one link between RPM and road speed.
- Distinguish e-POWER generations by model and year; do not apply third-generation maps automatically.

## Separate engine state
`STOPPED | CRANKING | RUNNING | MOTORING | STOPPING`.
Combustion and engine mechanical rotation are separate signals. When no combustion: no combustion bursts, even if wheels accelerate.

## Power accounting conventions
- All power in kW; wheel speed in m/s; engine speed in rpm; time in seconds.
- Battery power positive = **discharge**; generator power positive = **electric production**; positive motor mechanical power = wheel propulsion.
- Regenerative braking = negative traction motor mechanical power, with separate nonnegative `regenPowerKw` for display, never counted twice.
- Basic SOC integration: `deltaSOC = -(P_battery_kW * dt_seconds) / (3600 * E_usable_kWh)`, with power limits and efficiencies applied upstream.
- No energy creation. Test motor/generator/battery losses and SOC clamping, including reverse power flows.
- Unknown proprietary maps/thresholds are flagged as estimated or placeholder, not represented as fact.

## Data sources and evidence
Primary manufacturer sources:
- Toyota Prius: https://toyota.jp/prius/
- Nissan e-POWER: https://www.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER/
- Nissan Aura: https://www3.nissan.co.jp/vehicles/new/aura.html

All numeric presets need a source marker: `official`, `measured`, `estimated`, or `placeholder`. Specific numerical vehicle specs should be verified before being labeled official.

## P2 prototype implementation (estimated, NOT manufacturer calibrated)

**Implemented:** `apps/web/src/powertrains.ts` now has distinct `prius_60_hev` (conceptual power-split) and `aura_fe13_epower` (series HEV) models. The mobile cockpit offers a selector, SOC/engine-phase/motor kW/generator kW readout, and original motor audio that continues during electric-only drive.

**Prius:** engine mechanical wheel traction plus traction-motor support; conceptual MG1/MG2 and planetary relationship `(Ns+Nr)*carrier = Ns*sun + Nr*ring`. Teeth Ns=30, Nr=78 and final output gearing are **illustrative**, not Toyota part specs.

**Aura:** all wheel torque is from the electric motor; engine mechanical energy flows only to a generator. Its RPM demand is based on load and SOC, not wheel RPM. The controller uses approximate start thresholds and hysteresis.

**Energy sign conventions:** `motorPowerKw` is mechanical wheel power (+drive, -regen), `regenPowerKw` a positive display-only recovered electrical amount, `batteryPowerKw = motorElectricalKw + auxiliaries - generatorPowerKw`, and SOC integrates in kWh. Recovered power is never counted twice in wheel braking.

**Calibration caveat:** body mass, motor torque/power, battery usable capacity, estimated efficiencies, hysteresis thresholds, conceptual gear teeth and power limits are *placeholders*. Battery SOC is clamped but full electrical current/power limiting at SOC extrema is not yet implemented. This is a functional topology demo rather than a validated vehicle digital twin.

The audio worklet has independent `combustion`, `motor` and `motorRpm` channels. Prius defaults to synthetic I4; Aura defaults to synthetic I3. Manual sound profile selection changes acoustics only, not vehicle performance.

Validation: `tests/hybrid-powertrains.test.ts`, `tests/hybrid-audio.test.mjs`, `tests/worklet-bridge.test.mjs`. See manufacturer overviews for the public drivetrain topology:
- https://toyota.jp/prius/
- https://www.nissan-global.com/JP/INNOVATION/TECHNOLOGY/ARCHIVE/E_POWER/
