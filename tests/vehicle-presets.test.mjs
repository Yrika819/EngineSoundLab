import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

function load(filename) {
  const text = readFileSync(new URL("../packages/vehicle-data/presets/" + filename, import.meta.url), "utf8");
  return JSON.parse(text);
}

const required = ["schemaVersion","id","manufacturer","model","modelYear","market",
  "powertrain","chassisId","engineId","motorIds","audioProfileId","gaugeThemeId","evidenceId"];

test("both vehicle presets are parseable, versioned, and independently typed", () => {
  const prius = load("toyota_prius_60_20_hev_fwd.json");
  const aura = load("nissan_aura_fe13_epower_fwd.json");
  for (const vehicle of [prius, aura]) {
    for (const key of required) assert.ok(Object.hasOwn(vehicle, key), `missing ${key}`);
    assert.equal(vehicle.schemaVersion, 1);
    assert.equal(vehicle.market, "JP");
    assert.ok(vehicle.modelYear > 2000);
    assert.ok(vehicle.powertrain.controllerId);
    assert.ok(Array.isArray(vehicle.motorIds) && vehicle.motorIds.length > 0);
  }
  assert.equal(prius.powertrain.kind, "POWER_SPLIT_HEV");
  assert.equal(aura.powertrain.kind, "SERIES_HEV");
  assert.notEqual(prius.powertrain.controllerId, aura.powertrain.controllerId);
});

test("placeholder vehicle components are never represented as verified calibration data", () => {
  for (const vehicle of [
    load("toyota_prius_60_20_hev_fwd.json"),
    load("nissan_aura_fe13_epower_fwd.json")
  ]) {
    assert.match(vehicle.evidenceId, /pending/);
    assert.match(vehicle.audioProfileId, /pending/);
  }
});
