# Roadmap — synthesis-first (v0.6)

A working procedural **accelerating car sound** on a phone is the next deliverable. Recorded-source hybrid mode is **not** a blocker and free revving is postponed.

1. **P0 Audible prototype**: working mobile page, throttle, brake, generic vehicle physics and continuously generated acceleration sound; CI and browser smoke.
2. **P1 High-quality synthesis**: firing geometry, load-sensitive induction/exhaust, motor and road sound, audio diagnostics.
3. **P2 Prius/Aura controllers**: independent THS/e-POWER behavior, SOC, electrical energy balance, start/stop states.
4. **P3 Manufacturer-inspired gauges (implemented prototype)**: Prius, Aura Classic/Enhanced, SPORT, ENGINEERING; mobile layout tests and device visual QA remain.
5. **P4 PWA/mobile baseline**: offline app shell, home-screen icons, safe app lifecycle, narrow-screen improvements and build-level tests implemented. Android/iPhone hardware QA remains pending.
6. **P5 Procedural sound refinement (next)**: tune combustion/motor/inverter/regen acoustics after P4; licensed recorded-sample hybrid audio remains an optional later feature.
7. **P6 Later**: more vehicles, free revving, advanced customizations.

**Execution policy**: implementation delegated for routine decisions; work through small PRs, require green CI before merge, record measurable results. No autonomous activity between explicit tool-equipped sessions.

Full details: [Implementation plan](IMPLEMENTATION_PLAN.md).
