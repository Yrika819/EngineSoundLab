import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/web/src/style.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("../apps/web/src/gauge-ui.ts", import.meta.url), "utf8");

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(escaped + "\\s*\\{([^}]*)\\}", "m").exec(css);
  assert.ok(match, "Missing CSS rule: " + selector);
  return match[1];
}
function isThreeColumns(style) {
  const col = /grid-template-columns:\s*([^;]+);/.exec(style);
  assert.ok(col, "Missing grid-template-columns");
  return (col[1].match(/minmax\(0,/g) || []).length === 3;
}

test("P6 Aura Classic: POWER, energy center and SPEED share one row", () => {
  const rule = ruleFor(".aura-cluster-body");
  assert.match(rule, /display:grid/);
  assert.ok(isThreeColumns(rule));
  const names = [
    'class="aura-dial aura-power"',
    'class="aura-center-panel"',
    'class="aura-dial aura-velocity"'
  ];
  const indexes = names.map(n => markup.indexOf(n));
  assert.ok(indexes.every(v => v >= 0), "Missing original cluster region");
  assert.ok(indexes[0] < indexes[1] && indexes[1] < indexes[2],
    "DOM placement must match the 3 grid columns");
});

test("P6 Enhanced preserves both outside dials and expands middle", () => {
  const enhanced = ruleFor(".gauge-aura.enhanced .aura-cluster-body");
  assert.ok(isThreeColumns(enhanced));
  assert.match(enhanced, /minmax\(0,1\.35fr\)/);
  assert.ok(ruleFor(".gauge-aura.enhanced .aura-center-panel").includes("padding"));
  assert.ok(markup.includes('data-gauge="AURA"'));
});

test("P6 narrow phones do not use single column and never stack Aura dials", () => {
  const breakpoint = css.indexOf("@media(max-width:390px)");
  assert.ok(breakpoint !== -1);
  const remaining = css.slice(breakpoint);
  const mobile = /\.aura-cluster-body\{[^}]*grid-template-columns:([^;}]+)/.exec(remaining);
  assert.ok(mobile, "No mobile-specific dial grid");
  assert.equal((mobile[1].match(/minmax\(0,/g)||[]).length, 3);
  assert.match(css, /\.aura-dial\{[^}]*min-width:0/);
  assert.match(css, /\.gauge-skin\[hidden\]\{display:none!important\}/);
});

test("P6 generated SVG dial, speed, charge and energy displays are available", () => {
  assert.ok(markup.includes('auraRingSvg("power")'));
  assert.ok(markup.includes('auraRingSvg("speed")'));
  for(const field of [
    'data-field="aura-flow"', 'data-field="aura-speed"',
    'data-field="aura-power"', 'data-field="aura-soc"'
  ]) assert.ok(markup.includes(field),field);
});
