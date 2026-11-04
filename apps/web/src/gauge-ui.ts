import { arcPath, auraPowerAngle, auraRingSvg, priusArcSvg,
  priusPowerArc, speedAngle } from "./gauge-graphics";
import { makeGaugeSnapshot, type GaugeMode, type GaugeSnapshot } from "./gauges";
import type { DriveState, VehicleId } from "./powertrains";

/**
 * P6 high-density vector clusters. The Toyota/Nissan manuals guide
 * *information hierarchy*, but all geometry, marks and graphics are original.
 * No manufacturer logos, assets or unsupported fuel/range/temp readouts.
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
      <option value="AURA_ENHANCED" disabled>オーラ エンハンス表示</option>
      <option value="SPORT">SPORT（回転数）</option>
      <option value="ENGINEERING">ENGINEERING（詳細）</option>
    </select>`;
  instrument.insertBefore(toolbar, dial);

  const panels = document.createElement("div");
  panels.className = "gauge-skins";
  panels.innerHTML = `
    <section class="gauge-prius gauge-skin" data-gauge="PRIUS" hidden aria-label="プリウス風デジタルメーター">
      <header class="cluster-header">
        <span class="cluster-caption">HEV INSTRUMENT PANEL</span>
        <span data-field="prius-engine" class="cluster-status">EV READY</span>
        <span class="cluster-simulation">SIMULATION</span>
      </header>
      <div class="prius-cluster-body">
        <aside class="prius-left-readout">
          <span class="cluster-tiny">POWERTRAIN</span>
          <strong data-field="prius-drive">EV</strong>
          <div class="prius-ledger">
            <span class="cluster-tiny">MOTOR OUTPUT</span>
            <b data-field="prius-motor-kw">0.0 kW</b>
          </div>
          <span class="prius-flow-caption" data-field="prius-flow">バッテリー → モーター</span>
        </aside>
        <div class="prius-center-display" role="group" aria-label="速度とハイブリッドシステムインジケーター">
          ${priusArcSvg()}
          <div class="prius-speed-readout">
            <strong data-field="prius-speed">0</strong>
            <small>km/h</small>
          </div>
          <span class="prius-ev-badge" data-field="prius-ev">EV</span>
        </div>
        <aside class="prius-right-readout">
          <span class="prius-gear" aria-label="シフト位置D">D</span>
          <span class="cluster-tiny">BATTERY SOC</span>
          <strong data-field="prius-soc">63%</strong>
          <div class="battery-gauge" data-battery="prius" aria-label="電池残量の簡易表示">
            <i></i><i></i><i></i><i></i><i></i>
          </div>
          <span class="cluster-tiny">POWER</span>
          <b data-field="prius-zone">ECO</b>
        </aside>
      </div>
      <footer class="prius-cluster-footer">
        <span data-field="prius-state">EV DRIVE</span>
        <span class="cluster-tiny">CHG · ECO · PWR</span>
        <span>近似表示</span>
      </footer>
    </section>
    <section class="gauge-aura gauge-skin" data-gauge="AURA" hidden aria-label="オーラ風デジタルメーター">
      <header class="cluster-header">
        <span class="cluster-caption">e-POWER · DRIVE</span>
        <span class="cluster-simulation">SIMULATED DISPLAY</span>
        <span class="cluster-status" data-field="aura-engine">EV</span>
      </header>
      <div class="aura-cluster-body">
        <div class="aura-dial aura-power" role="meter" aria-label="モーター出力・回生表示" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0">
          ${auraRingSvg("power")}
          <div class="aura-dial-readout">
            <span>POWER</span>
            <strong data-field="aura-power">0</strong>
            <small>%</small>
          </div>
          <span class="aura-dial-sub">CHG / PWR</span>
        </div>
        <div class="aura-center-panel">
          <span class="aura-center-eyebrow">e-POWER</span>
          <strong data-field="aura-mode">EV DRIVE</strong>
          <svg class="aura-energy-route" viewBox="0 0 132 55" aria-hidden="true">
            <rect x="8" y="15" width="33" height="24" rx="5" class="energy-device"/>
            <rect x="13" y="21" width="8" height="12" rx="1" class="energy-charge"/>
            <rect x="23" y="21" width="8" height="12" rx="1" class="energy-charge"/>
            <path d="M45 27H87" class="energy-wire"/>
            <path d="M79 20L88 27L79 34" class="energy-arrow"/>
            <circle cx="106" cy="27" r="14" class="energy-device"/>
            <path d="M102 18V24L97 28L105 38V31L112 26L105 18V37" class="energy-machine"/>
          </svg>
          <span class="aura-energy-caption" data-field="aura-flow">バッテリー → モーター</span>
          <div class="aura-battery-row">
            <span class="cluster-tiny">BATTERY</span><strong data-field="aura-soc">63%</strong>
          </div>
          <div class="aura-battery-bar"><i data-field="aura-battery-bar"></i></div>
          <div class="aura-mini-readouts">
            <span>GEN <b data-field="aura-gen">0 kW</b></span>
            <span>MOTOR <b data-field="aura-motor">0 kW</b></span>
          </div>
        </div>
        <div class="aura-dial aura-velocity" role="meter" aria-label="車速" aria-valuemin="0" aria-valuemax="180" aria-valuenow="0">
          ${auraRingSvg("speed")}
          <div class="aura-dial-readout">
            <span>SPEED</span>
            <strong data-field="aura-speed">0</strong>
            <small>km/h</small>
          </div>
          <span class="aura-dial-sub">DIGITAL</span>
        </div>
      </div>
      <footer class="aura-cluster-footer">
        <span class="aura-meter-mode" data-field="aura-zone">ECO</span>
        <span data-field="aura-footer">バッテリー駆動</span>
        <span class="cluster-tiny">SIMULATOR</span>
      </footer>
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

  function find<T extends Element>(root: Element, selector: string): T {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error("Missing gauge field: " + selector);
    return node;
  }
  const style = find<HTMLSelectElement>(toolbar, "#gauge-style");
  const enhanced = find<HTMLOptionElement>(style, 'option[value="AURA_ENHANCED"]');
  const prius = find<HTMLElement>(panels, '[data-gauge="PRIUS"]');
  const aura = find<HTMLElement>(panels, '[data-gauge="AURA"]');
  const tech = find<HTMLElement>(panels, '[data-gauge="ENGINEERING"]');
  const powerDial = find<HTMLElement>(aura, ".aura-power");
  const speedDial = find<HTMLElement>(aura, ".aura-velocity");
  const livePriusArc = find<SVGPathElement>(prius, '[data-ring="prius"]');
  const livePowerArc = find<SVGPathElement>(aura, '[data-ring="power"]');
  const liveSpeedArc = find<SVGPathElement>(aura, '[data-ring="speed"]');
  const powerNeedle = find<SVGElement>(aura, '[data-needle="power"]');
  const speedNeedle = find<SVGElement>(aura, '[data-needle="speed"]');
  const battery = find<HTMLElement>(prius, '[data-battery="prius"]');
  const fieldMap = new Map<string, HTMLElement>();
  for (const node of panels.querySelectorAll<HTMLElement>("[data-field]")) {
    fieldMap.set(node.dataset.field ?? "", node);
  }
  const field = (name: string) => {
    const node = fieldMap.get(name);
    if (!node) throw new Error("Missing meter field: " + name);
    return node;
  };
  const set = (name: string, value: string) => {
    const node = field(name);
    if (node.textContent !== value) node.textContent = value;
  };
  let current: DriveState | null = null;

  function onVehicleChange(id: VehicleId) {
    enhanced.disabled = id !== "aura_fe13_epower";
    if (enhanced.disabled && style.value === "AURA_ENHANCED") style.value = "AUTO";
  }

  function meterState(g: GaugeSnapshot): { mode: string; flow: string; detail: string } {
    if (g.zone === "CHARGE") {
      return { mode: "REGEN", flow: "回生 → バッテリー", detail: "回生充電" };
    }
    if (g.engineRunning && g.generatorPowerKw > 0.1) {
      return { mode: "GENERATING", flow: "エンジン → 発電", detail: "エンジン発電中" };
    }
    if (g.engineRunning) {
      return { mode: "HYBRID DRIVE", flow: "エンジン＋モーター", detail: "ハイブリッド走行" };
    }
    if (g.engineRpm > 25) {
      return { mode: "STARTING", flow: "エンジン回転中", detail: "燃焼なし回転" };
    }
    return { mode: "EV DRIVE", flow: "バッテリー → モーター", detail: "EV走行" };
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
    aura.classList.toggle("regenerating", gauge.zone === "CHARGE");
    aura.classList.toggle("generating", gauge.engineRunning && gauge.generatorPowerKw > 0.1);
    aura.dataset.layout = gauge.layout;
    // Real-car-inspired displays are self-contained; ENGINEERING preserves
    // full raw telemetry and does not fabricate trip/range/temperature data.
    energyPanel.hidden = gauge.layout !== "SPORT" || vehicle.batterySoc === null;

    if (gauge.layout === "PRIUS") {
      const state = meterState(gauge);
      set("prius-engine", gauge.engineRunning ? "ENGINE ON" : "EV READY");
      // P6.2: short sidebar label on 320px; footer preserves the full state.
      set("prius-drive", state.mode === "GENERATING" ? "GEN" : state.mode);
      field("prius-drive").setAttribute("aria-label", state.mode);
      // Tight left information column: the complete path is available to
      // assistive technology; concise visible text avoids orphaned kanji.
      const displayFlow = state.mode === "GENERATING" ? "発電中"
        : state.mode === "REGEN" ? "回生充電"
        : state.mode === "EV DRIVE" ? "電池 → モーター" : state.flow;
      set("prius-flow", displayFlow);
      field("prius-flow").setAttribute("aria-label", state.flow);
      set("prius-speed", String(gauge.speedKmh));
      set("prius-motor-kw", gauge.motorPowerKw.toFixed(1) + " kW");
      set("prius-state", state.detail);
      set("prius-ev", gauge.engineRunning ? "HEV" : "EV");
      set("prius-soc", gauge.socPct + "%");
      set("prius-zone", gauge.zone);
      livePriusArc.setAttribute("d", priusPowerArc(gauge.chargeFraction, gauge.driveFraction));
      livePriusArc.classList.toggle("charging", gauge.zone === "CHARGE");
      const level = Math.round((gauge.socPct ?? 0) / 20);
      Array.from(battery.children).forEach((child, index) => {
        child.classList.toggle("lit", index < level);
      });
    }
    if (isAura) {
      const state = meterState(gauge);
      const power = gauge.zone === "CHARGE"
        ? -Math.round(gauge.chargeFraction * 100)
        : Math.round(gauge.driveFraction * 100);
      const powerAngle = auraPowerAngle(power);
      const speedPos = speedAngle(gauge.speedKmh);
      set("aura-engine", gauge.engineRunning ? "ENGINE ON" : "EV");
      set("aura-mode", state.mode);
      set("aura-power", String(power));
      set("aura-speed", String(gauge.speedKmh));
      set("aura-soc", gauge.socPct + "%");
      set("aura-flow", state.flow);
      set("aura-motor", gauge.motorPowerKw.toFixed(0) + " kW");
      set("aura-gen", gauge.generatorPowerKw.toFixed(0) + " kW");
      set("aura-zone", gauge.zone);
      set("aura-footer", state.detail);
      field("aura-battery-bar").style.width = gauge.socPct + "%";
      powerDial.setAttribute("aria-valuenow", String(power));
      speedDial.setAttribute("aria-valuenow", String(gauge.speedKmh));
      powerNeedle.setAttribute("transform", `rotate(${powerAngle} 100 100)`);
      speedNeedle.setAttribute("transform", `rotate(${speedPos} 100 100)`);
      livePowerArc.setAttribute("d", power < 0
        ? arcPath(powerAngle, -116, 76)
        : power > 0 ? arcPath(-116, powerAngle, 76) : "");
      livePowerArc.classList.toggle("charging", power < 0);
      liveSpeedArc.setAttribute("d", speedPos > -131.9
        ? arcPath(-132, speedPos, 76) : "");
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
