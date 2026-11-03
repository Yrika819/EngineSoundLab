import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/web/src/style.css", import.meta.url), "utf8");
const markup = readFileSync(new URL("../apps/web/src/gauge-ui.ts", import.meta.url), "utf8");

function gridPlacement(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(escaped + "\\s*\\{([^}]*)\\}", "m").exec(css);
  assert.ok(rule, "missing CSS rule: " + selector);
  const col = /grid-column:\s*([^;]+);/.exec(rule[1]);
  const row = /grid-row:\s*([^;]+);/.exec(rule[1]);
  assert.ok(col && row, "missing explicit grid placement for " + selector);
  return { col: col[1].trim(), row: row[1].trim() };
}

test("Aura Classic power + speed must share top row while flow spans beneath", () => {
  const power = gridPlacement(".gauge-aura:not(.enhanced) .aura-power");
  const speed = gridPlacement(".gauge-aura:not(.enhanced) .aura-velocity");
  const flow = gridPlacement(".gauge-aura:not(.enhanced) .aura-flow");
  assert.deepEqual(power, { col: "1", row: "1" });
  assert.deepEqual(speed, { col: "2", row: "1" });
  assert.deepEqual(flow, { col: "1 / -1", row: "2" });
});

test("enhanced layout remains independently three-column", () => {
  assert.match(css, /\.gauge-aura\.enhanced \.aura-layout\s*\{grid-template-columns:.*?3/);
  assert.match(css, /\.gauge-aura\.enhanced \.aura-velocity\s*\{grid-column:3;grid-row:1/);
});

test("Aura dial and energy panels are still part of the instrument template", () => {
  for (const className of ["aura-power", "aura-velocity", "aura-flow"]) {
    assert.ok(markup.includes(`class="${className}`) ||
      markup.includes(`class="aura-analog ${className}`));
  }
});
