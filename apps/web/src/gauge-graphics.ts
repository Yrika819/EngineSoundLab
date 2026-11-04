/**
 * P6 original vector dial geometry. The information hierarchy follows
 * public Toyota Prius and Nissan Aura meter manuals, but artwork and dial
 * proportions are independent illustrations, NOT copied OEM assets.
 *
 * SVG coordinates use a 200 × 200 logical box. Angle=0 is 12 o'clock.
 */
export function polar(radius: number, angleDeg: number, cx = 100, cy = 100) {
  const radians = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

const n = (value: number) => Number(value.toFixed(3));
export function arcPath(startDeg: number, endDeg: number, radius = 79, cx = 100, cy = 100): string {
  if (![startDeg, endDeg, radius, cx, cy].every(Number.isFinite)
      || radius <= 0 || endDeg <= startDeg || endDeg - startDeg >= 360)
    throw new RangeError("Invalid SVG gauge arc");
  const a = polar(radius, startDeg, cx, cy), b = polar(radius, endDeg, cx, cy);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${n(a.x)} ${n(a.y)} A ${n(radius)} ${n(radius)} 0 ${large} 1 ${n(b.x)} ${n(b.y)}`;
}
export function finiteFraction(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
export function speedAngle(speedKmh: number): number {
  return -132 + finiteFraction(speedKmh / 180) * 264;
}
export function auraPowerAngle(powerPercent: number): number {
  const safe = Number.isFinite(powerPercent) ? Math.max(-100, Math.min(100, powerPercent)) : 0;
  return safe < 0 ? -116 + (safe / 100) * 16 : -116 + (safe / 100) * 248;
}
export function priusPowerArc(charge: number, power: number): string {
  const recovery = finiteFraction(charge);
  if (recovery > 0) return arcPath(-121 - recovery * 44, -121, 68);
  const driving = finiteFraction(power);
  if (driving <= 0) return "";
  return arcPath(-113, -113 + driving * 248, 68);
}

function tick(angle: number, major: boolean, radius = 84): string {
  const p1 = polar(radius, angle), p2 = polar(radius - (major ? 11 : 5.5), angle);
  return `<line x1="${n(p1.x)}" y1="${n(p1.y)}" x2="${n(p2.x)}" y2="${n(p2.y)}" class="dial-tick${major ? " major" : ""}"/>`;
}
function textAt(angle: number, label: string, radius = 58): string {
  const p = polar(radius, angle);
  return `<text x="${n(p.x)}" y="${n(p.y)}" class="dial-number" text-anchor="middle" dominant-baseline="central">${label}</text>`;
}
/** Original drawn rings: left POWER/CHG, right speed. */
export function auraRingSvg(kind: "power" | "speed"): string {
  const speed = kind === "speed";
  const start = speed ? -132 : -116;
  const stop = speed ? 132 : 132;
  const divisions = speed ? 36 : 40;
  let ticks = "";
  for (let i = 0; i <= divisions; i++) {
    const angle = start + (stop - start) * i / divisions;
    ticks += tick(angle, i % (speed ? 4 : 8) === 0);
  }
  const labels = speed
    ? [0, 40, 80, 120, 160].map(v =>
      textAt(speedAngle(v), String(v), 61)).join("")
    : [0, 20, 40, 60, 80, 100].map(v =>
      textAt(auraPowerAngle(v), String(v), 61)).join("");
  const ring = arcPath(start, stop, 89);
  const chargeArc = arcPath(-137, -117, 75);
  return `<svg viewBox="0 0 200 200" role="img" aria-label="${speed ? "速度計の目盛り" : "パワーメーターの目盛り"}">
    <defs><filter id="gauge-glow-${kind}" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur stdDeviation="3"/></filter>
    </defs>
    <circle cx="100" cy="100" r="93" class="dial-bezel"/>
    <circle cx="100" cy="100" r="86" class="dial-bezel-inset"/>
    <path d="${ring}" class="dial-track"/>
    ${speed ? "" : `<path d="${chargeArc}" class="dial-charge-tick"/>`}
    <g>${ticks}</g>
    ${labels}
    <path data-ring="${speed ? "speed" : "power"}" class="dial-progress" d=""/>
    <g data-needle="${speed ? "speed" : "power"}" transform="rotate(${speed ? -132 : -116} 100 100)">
      <path d="M 97.8 108 L 99.2 29 Q 100 24 100.8 29 L 102.2 108 Z" class="dial-pointer"/>
      <circle cx="100" cy="100" r="6.5" class="dial-hub"/>
    </g>
  </svg>`;
}
/** Prius uses a wide HEV arc around digital vehicle speed. */
export function priusArcSvg(): string {
  const charge = arcPath(-165, -121, 68);
  const eco = arcPath(-113, 57, 68);
  const pwr = arcPath(65, 135, 68);
  let marks = "";
  for (let i = 0; i <= 32; i++) {
    const a = -165 + 300 * i / 32;
    marks += tick(a, i % 4 === 0, 72);
  }
  return `<svg viewBox="0 0 200 200" aria-hidden="true">
    <path d="${charge}" class="prius-arc-charge"/>
    <path d="${eco}" class="prius-arc-eco"/>
    <path d="${pwr}" class="prius-arc-power"/>
    <g class="prius-ticks">${marks}</g>
    <path d="" data-ring="prius" class="prius-arc-live"/>
    <text x="23" y="143" class="prius-arc-caption">CHG</text>
    <text x="58" y="45" class="prius-arc-caption">ECO</text>
    <text x="145" y="54" class="prius-arc-caption">PWR</text>
  </svg>`;
}
