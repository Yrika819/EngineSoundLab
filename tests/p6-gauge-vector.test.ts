import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  polar, arcPath, auraPowerAngle, auraRingSvg, finiteFraction,
  priusArcSvg, priusPowerArc, speedAngle
} from "../apps/web/src/gauge-graphics";
import { makeDriveState } from "../apps/web/src/powertrains";
import { makeGaugeSnapshot, resolveGaugeLayout } from "../apps/web/src/gauges";

test("P6 vector geometry uses deterministic finite viewBox coordinates", () => {
  assert.deepEqual(polar(50, 0), { x: 100, y: 50 });
  assert.ok(Math.abs(polar(50, 90).x - 150) < 1e-10);
  assert.match(arcPath(-135, 135), /^M .+ A 79 79 0 1 1 /);
  assert.match(arcPath(-120, -70), / A 79 79 0 0 1 /);
  assert.throws(() => arcPath(10, 10), RangeError);
  assert.throws(() => arcPath(10, 370), RangeError);
  assert.throws(() => arcPath(10, 20, NaN), RangeError);
});
test("P6 speed needle maps 0..180 km/h continuously across dial", () => {
  assert.equal(speedAngle(0), -132);
  assert.equal(speedAngle(180), 132);
  assert.equal(speedAngle(900), 132);
  assert.equal(speedAngle(-10), -132);
  assert.equal(speedAngle(NaN), -132);
  assert.ok(speedAngle(90) > speedAngle(45));
  assert.ok(speedAngle(150) > speedAngle(90));
});
test("P6 Aura meter keeps regenerative power on the charge side", () => {
  assert.equal(auraPowerAngle(0), -116);
  assert.equal(auraPowerAngle(100), 132);
  assert.equal(auraPowerAngle(-100), -132);
  assert.equal(auraPowerAngle(Infinity), -116);
  assert.ok(auraPowerAngle(-60) < auraPowerAngle(-20));
  assert.ok(auraPowerAngle(75) > auraPowerAngle(25));
});
test("P6 Prius energy arc covers disjoint charging, ECO and power sectors", () => {
  assert.equal(priusPowerArc(0,0), "");
  assert.match(priusPowerArc(0.8,0.5), /^M /);
  assert.match(priusPowerArc(0,0.75), /^M /);
  assert.ok(!priusPowerArc(1,0.4).includes("NaN"));
  assert.ok(priusArcSvg().includes("data-ring=\"prius\""));
  assert.ok(priusArcSvg().includes("CHG"));
  assert.ok(priusArcSvg().includes("ECO"));
  assert.ok(priusArcSvg().includes("PWR"));
  assert.equal(finiteFraction(NaN), 0);
});
test("P6 SVG artwork has two distinct, ticked Aura dials", () => {
  const power = auraRingSvg("power");
  const speed = auraRingSvg("speed");
  assert.ok(power.includes('data-needle="power"'));
  assert.ok(speed.includes('data-needle="speed"'));
  assert.ok(power.includes('data-ring="power"'));
  assert.ok(speed.includes('data-ring="speed"'));
  assert.ok((power.match(/class="dial-tick/g)||[]).length >= 30);
  assert.ok((speed.match(/class="dial-tick/g)||[]).length >= 30);
  assert.ok(power.includes("dial-charge-tick"));
  assert.ok(!speed.includes("dial-charge-tick"));
  assert.ok(!power.includes("NaN"));
});
test("P6 display remains a read-only adapter; no fabricated fuel or range values", () => {
  const prius=makeGaugeSnapshot(makeDriveState("prius_60_hev"));
  const aura=makeGaugeSnapshot(makeDriveState("aura_fe13_epower"));
  assert.equal(prius.layout,"PRIUS");
  assert.equal(aura.layout,"AURA_CLASSIC");
  assert.equal(prius.socPct,63);
  assert.equal(aura.speedKmh,0);
  assert.equal(resolveGaugeLayout("aura_fe13_epower","AURA_ENHANCED"),"AURA_ENHANCED");
  assert.equal(resolveGaugeLayout("prius_60_hev","AURA_ENHANCED"),"PRIUS");
  const source=readFileSync(new URL("../apps/web/src/gauge-ui.ts",import.meta.url),"utf8");
  const begin=source.indexOf("panels.innerHTML =");
  const end=source.indexOf("dial.insertAdjacentElement",begin);
  assert.ok(begin >= 0 && end > begin);
  const template=source.slice(begin,end);
  // Check displayed fields, not comments describing why unavailable data
  // such as temperature and odometer are intentionally not shown.
  assert.ok(!/fuel.?level|fuel.?range|outside.?temp|trip.?odometer/i.test(template));
});
test("P6 Aura is a 3-column cluster at every responsive breakpoint", () => {
  const css=readFileSync(new URL("../apps/web/src/style.css",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../apps/web/src/gauge-ui.ts",import.meta.url),"utf8");
  assert.ok(css.includes(".aura-cluster-body{display:grid;grid-template-columns:"));
  assert.ok(css.includes(".gauge-aura.enhanced .aura-cluster-body{grid-template-columns:"));
  assert.ok(css.includes("@media(max-width:390px)"));
  assert.ok(!/\.aura-cluster-body\{[^}]*grid-template-columns:\s*1fr\s*[;}]/.test(css));
  assert.ok(ui.indexOf('class="aura-power"')===-1); // nested dial remains explicit
  assert.ok(ui.indexOf("class=\"aura-dial aura-power\"") <
    ui.indexOf("class=\"aura-center-panel\""));
  assert.ok(ui.indexOf("class=\"aura-center-panel\"") <
    ui.indexOf("class=\"aura-dial aura-velocity\""));
  assert.ok(css.includes(".gauge-skin[hidden]{display:none!important}"));
});
