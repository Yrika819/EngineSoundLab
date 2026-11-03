import { makeGaugeSnapshot, type GaugeMode } from "./gauges";
import type { DriveState, VehicleId } from "./powertrains";

/**
 * Presentation-only dashboard skins. All labels and shapes are original,
 * manufacturer-inspired designs (not screenshots or copied OEM artwork).
 */
export function createGaugePanel(dial: HTMLElement, energyPanel: HTMLElement) {
  const instrument = dial.parentElement;
  if (!instrument) throw new Error("Missing gauge parent");
  const toolbar = document.createElement("div");
  toolbar.className = "meter-toolbar";
  toolbar.innerHTML = `
    <label for="gauge-style">METER DISPLAY</label>
    <select id="gauge-style" aria-label="メーター表示モード">
      <option value="AUTO">車種別（自動）</option>
      <option value="SPORT">SPORT（回転数）</option>
      <option value="ENGINEERING">ENGINEERING（詳細）</option>
      <option value="AURA_ENHANCED" disabled>オーラ エンハンス風</option>
    </select>`;
  instrument.insertBefore(toolbar, dial);
  const panels = document.createElement("div");
  panels.className = "gauge-skins";
  panels.innerHTML = `
    <section class="gauge-prius gauge-skin" data-gauge="PRIUS" hidden aria-label="プリウス風メーター">
      <div class="skin-top"><span>HYBRID SYSTEM</span><strong data-field="prius-engine">READY</strong></div>
      <div class="prius-speed"><span>D</span><strong data-field="prius-speed">0</strong><small>km/h</small></div>
      <p class="meter-label">CHARGE · ECO · POWER</p>
      <div class="meter-track" aria-label="ハイブリッドシステム出力">
        <div class="track-left"><span data-field="prius-charge"></span></div>
        <div class="track-right"><span data-field="prius-drive"></span></div>
      </div>
      <div class="meter-key"><span>CHG</span><span>ECO</span><span>POWER</span></div>
      <div class="skin-bottom"><strong data-field="prius-state">EV READY</strong><span data-field="prius-soc">SOC 63%</span></div>
    </section>
    <section class="gauge-aura gauge-skin" data-gauge="AURA" hidden aria-label="オーラ風メーター">
      <div class="skin-top"><span>e-POWER · DRIVE DISPLAY</span><strong data-field="aura-engine">EV</strong></div>
      <div class="aura-layout">
        <div class="aura-analog aura-power">
          <small>POWER / REGEN</small>
          <strong data-field="aura-power">0</strong>
          <div class="meter-track">
            <div class="track-left"><span data-field="aura-charge"></span></div>
            <div class="track-right"><span data-field="aura-drive"></span></div>
          </div>
          <span class="aura-label">CHG · DRIVE</span>
        </div>
        <div class="aura-flow"><small>ENERGY FLOW</small>
          <strong data-field="aura-flow">電池 → モーター → 車輪</strong>
          <span data-field="aura-soc">BATTERY 63%</span>
        </div>
        <div class="aura-analog aura-velocity"><small>SPEED</small>
          <strong data-field="aura-speed">0</strong><span>km/h</span>
        </div>
      </div>
    </section>
    <section class="gauge-technical gauge-skin" data-gauge="ENGINEERING" hidden aria-label="技術データ表示">
      <div class="skin-top"><span>ENGINEERING · SIMULATION DATA</span><strong>推定モデル</strong></div>
      <div class="tech-grid">
        <div><span>SPEED</span><strong data-field="tech-speed">0 km/h</strong></div>
        <div><span>ENGINE</span><strong data-field="tech-rpm">0 rpm</strong></div>
        <div><span>MOTOR</span><strong data-field="tech-motor-rpm">0 rpm</strong></div>
        <div><span>BATTERY SOC</span><strong data-field="tech-soc">—</strong></div>
        <div><span>BATTERY kW</span><strong data-field="tech-battery">—</strong></div>
        <div><span>MOTOR kW</span><strong data-field="tech-motor">—</strong></div>
        <div><span>GENERATOR kW</span><strong data-field="tech-generator">—</strong></div>
        <div><span>REGEN kW</span><strong data-field="tech-regen">—</strong></div>
      </div>
      <p class="tech-flow" data-field="tech-flow">エンジン → 車輪</p>
    </section>`;
  dial.insertAdjacentElement("afterend", panels);

  function find<T extends HTMLElement>(root: HTMLElement, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error("Missing meter field: " + selector);
    return node;
  }
  const style = find<HTMLSelectElement>(toolbar, "#gauge-style");
  const enhanced = find<HTMLOptionElement>(style, 'option[value="AURA_ENHANCED"]');
  const prius = find<HTMLElement>(panels, '[data-gauge="PRIUS"]');
  const aura = find<HTMLElement>(panels, '[data-gauge="AURA"]');
  const tech = find<HTMLElement>(panels, '[data-gauge="ENGINEERING"]');
  const field = (name: string) => find<HTMLElement>(panels, '[data-field="' + name + '"]');
  const set = (name: string, value: string) => { field(name).textContent = value; };
  const bar = (name: string, fraction: number) => {
    field(name).style.width = Math.round(fraction * 100) + "%";
  };
  let current: DriveState | null = null;

  function onVehicleChange(id: VehicleId) {
    enhanced.disabled = id !== "aura_fe13_epower";
    if (enhanced.disabled && style.value === "AURA_ENHANCED") style.value = "AUTO";
  }
  function render(vehicle: DriveState) {
    current = vehicle;
    onVehicleChange(vehicle.vehicleId);
    const gauge = makeGaugeSnapshot(vehicle, style.value as GaugeMode);
    const isAura = gauge.layout === "AURA_CLASSIC" || gauge.layout === "AURA_ENHANCED";
    dial.hidden = gauge.layout !== "SPORT";
    prius.hidden = gauge.layout !== "PRIUS";
    aura.hidden = !isAura;
    tech.hidden = gauge.layout !== "ENGINEERING";
    aura.classList.toggle("enhanced", gauge.layout === "AURA_ENHANCED");
    // ENGINEERING already displays all electric state fields.
    energyPanel.hidden = vehicle.batterySoc === null || gauge.layout === "ENGINEERING";
    if (gauge.layout === "PRIUS") {
      set("prius-engine", gauge.engineRunning ? "ENGINE ON" : "READY");
      set("prius-speed", String(gauge.speedKmh));
      set("prius-state", gauge.zone === "CHARGE" ? "CHARGING" :
        gauge.engineRunning ? "HYBRID DRIVE" : "EV DRIVE");
      set("prius-soc", "SOC " + gauge.socPct + "%");
      bar("prius-charge", gauge.chargeFraction);
      bar("prius-drive", gauge.driveFraction);
    }
    if (isAura) {
      set("aura-engine", gauge.engineRunning ? "GENERATOR ON" : "EV");
      set("aura-power", String(gauge.zone === "CHARGE"
        ? -Math.round(gauge.chargeFraction * 100)
        : Math.round(gauge.driveFraction * 100)));
      set("aura-speed", String(gauge.speedKmh));
      set("aura-soc", "BATTERY " + gauge.socPct + "%");
      set("aura-flow", gauge.energyFlow);
      bar("aura-charge", gauge.chargeFraction);
      bar("aura-drive", gauge.driveFraction);
    }
    if (gauge.layout === "ENGINEERING") {
      const electric = gauge.socPct !== null;
      set("tech-speed", gauge.speedKmh + " km/h");
      set("tech-rpm", gauge.engineRpm + " rpm");
      set("tech-motor-rpm", electric ? gauge.motorRpm + " rpm" : "—");
      set("tech-soc", electric ? gauge.socPct + "%" : "—");
      set("tech-battery", electric ? gauge.batteryPowerKw.toFixed(1) : "—");
      set("tech-motor", electric ? gauge.motorPowerKw.toFixed(1) : "—");
      set("tech-generator", electric ? gauge.generatorPowerKw.toFixed(1) : "—");
      set("tech-regen", electric ? gauge.regenPowerKw.toFixed(1) : "—");
      set("tech-flow", gauge.engineState + " · " + gauge.energyFlow);
    }
  }
  style.addEventListener("change", () => { if (current) render(current); });
  return { onVehicleChange, render };
}
