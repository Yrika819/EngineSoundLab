# Roadmap — synthesis-first (v0.6)

A working procedural **accelerating car sound** on a phone is the next deliverable. Recorded-source hybrid mode is **not** a blocker and free revving is postponed.

1. **P0 Audible prototype**: working mobile page, throttle, brake, generic vehicle physics and continuously generated acceleration sound; CI and browser smoke.
2. **P1 High-quality synthesis**: firing geometry, load-sensitive induction/exhaust, motor and road sound, audio diagnostics.
3. **P2 Prius/Aura controllers**: independent THS/e-POWER behavior, SOC, electrical energy balance, start/stop states.
4. **P3 Manufacturer-inspired gauges**: Prius, Aura, SPORT, ENGINEERING, portrait/landscape.
5. **P4 Release hardening**: PWA, offline baseline, iOS/Android QA, public Web deployment.
6. **P5 Optional hybrid samples**: only with licensed recordings and only if they improve realism; synthesis remains default.
7. **P6 Later**: more vehicles, free revving, advanced customizations.

**Execution policy**: implementation delegated for routine decisions; work through small PRs, require green CI before merge, record measurable results. No autonomous activity between explicit tool-equipped sessions.

Full details: [Implementation plan](IMPLEMENTATION_PLAN.md).
