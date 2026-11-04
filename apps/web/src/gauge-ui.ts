import { arcPath, auraPowerAngle, auraRingSvg, priusArcSvg,
  priusPowerArc, speedAngle } from "./gauge-graphics";
import { gaugeEnergyMode, makeGaugeSnapshot, type GaugeMode,
  type GaugeSnapshot } from "./gauges";
import { GaugeSmoother } from "./gauge-motion";
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
          <span class="prius-flow-strip" aria-hidden="true"><i></i><i></i><i></i></span>
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
          <svg class="aura-energy-route" viewBox="0 0 132 55"
               data-flow-diagram="series-epower" aria-hidden="true">
            <!-- Left: battery. Right: traction motor. Top: independent generator. -->
            <rect x="8" y="15" width="33" height="24" rx="5" class="energy-device"/>
            <rect x="13" y="21" width="8" height="12" rx="1" class="energy-charge"/>
            <rect x="23" y="21" width="8" height="12" rx="1" class="energy-charge"/>
            <circle cx="106" cy="27" r="14" class="energy-device"/>
            <path d="M102 18V24L97 28L105 38V31L112 26L105 18V37"
                  class="energy-machine"/>
            <!-- Each route is mutually controlled by the telemetry-derived mode. -->
            <path d="M45 27H87" class="energy-flow-lane" data-route="ev"/>
            <path d="M87 27H45" class="energy-flow-lane" data-route="regen"/>
            <path d="M66 17V27H87" class="energy-flow-lane" data-route="generation"/>
            <path d="M66 17V27H45" class="energy-flow-lane" data-route="charging"/>
            <path d="M80 20L88 27L80 34" class="energy-flow-head" data-arrow="ev"/>
            <path d="M52 20L44 27L52 34" class="energy-flow-head" data-arrow="regen"/>
            <path d="M80 20L88 27L80 34" class="energy-flow-head" data-arrow="generation"/>
            <path d="M52 20L44 27L52 34" class="energy-flow-head" data-arrow="charging"/>
            <g class="energy-generator">
              <rect x="52" y="2" width="28" height="15" rx="4" class="energy-generator-box"/>
              <text x="66" y="13" text-anchor="middle">GEN</text>
            </g>
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
  // A single requestAnimationFrame paints all needles/level arcs between
  // the 30Hz telemetry updates. Exact numeric values remain unfiltered.
  const powerMotion = new GaugeSmoother(145, 0.06);
  const speedMotion = new GaugeSmoother(165, 0.06);
  const priusChargeMotion = new GaugeSmoother(165, 0.0008);
  const priusDriveMotion = new GaugeSmoother(165, 0.0008);
  const motions = [powerMotion, speedMotion, priusChargeMotion, priusDriveMotion];
  let motionVehicle: VehicleId | null = null;
  let motionFrame: number | null = null;
  let previousFrameTime = 0;
  const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stopMotionFrame = () => {
    if (motionFrame !== null) cancelAnimationFrame(motionFrame);
    motionFrame = null;
    previousFrameTime = 0;
  };

  function paintMotion(): void {
    if (!prius.hidden) {
      livePriusArc.setAttribute("d",
        priusPowerArc(priusChargeMotion.value, priusDriveMotion.value));
    }
    if (!aura.hidden) {
      const powerAngle = powerMotion.value;
      const speedPos = speedMotion.value;
      powerNeedle.setAttribute("transform", `rotate(${powerAngle.toFixed(3)} 100 100)`);
      speedNeedle.setAttribute("transform", `rotate(${speedPos.toFixed(3)} 100 100)`);
      const neutral = -116;
      livePowerArc.setAttribute("d", powerAngle < neutral - 0.08
        ? arcPath(powerAngle, neutral, 76)
        : powerAngle > neutral + 0.08
          ? arcPath(neutral, powerAngle, 76) : "");
      liveSpeedArc.setAttribute("d", speedPos > -131.92
        ? arcPath(-132, speedPos, 76) : "");
    }
  }

  function scheduleMotion(): void {
    if (motionFrame !== null || document.hidden || reducedMotion() ||
        (prius.hidden && aura.hidden) || motions.every(m => m.settled)) return;
    motionFrame = requestAnimationFrame(now => {
      motionFrame = null;
      if (document.hidden || reducedMotion()) {
        motions.forEach(m => m.snap());
        paintMotion();
        previousFrameTime = 0;
        return;
      }
      const dt = previousFrameTime ? now - previousFrameTime : 16.67;
      previousFrameTime = now;
      motions.forEach(m => m.step(dt));
      paintMotion();
      if (motions.every(m => m.settled)) previousFrameTime = 0;
      else scheduleMotion();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    stopMotionFrame();
    motions.forEach(m => m.snap());
    paintMotion();
  });

  let current: DriveState | null = null;

  function onVehicleChange(id: VehicleId) {
    if (motionVehicle !== id) {
      // Model switches must not tween from the last model's unrelated scale.
      motionVehicle = id;
      stopMotionFrame();
      motions.forEach(m => m.reset());
    }
    enhanced.disabled = id !== "aura_fe13_epower";
    if (enhanced.disabled && style.value === "AURA_ENHANCED") style.value = "AUTO";
  }

  function meterState(g: GaugeSnapshot, id: VehicleId):
    { mode: string; flow: string; detail: string } {
    const flow = gaugeEnergyMode(g, id);
    switch (flow) {
      case "REGEN":
        return { mode: "REGEN", flow: "車輪 → 回生 → バッテリー", detail: "回生充電" };
      case "GENERATION":
        return { mode: "GENERATING", flow: "エンジン → 発電機 → モーター",
          detail: "e-POWER発電中" };
      case "HYBRID":
        return { mode: "HYBRID DRIVE", flow: "エンジン＋モーター → 車輪",
          detail: "HEV駆動（動力分割式）" };
      case "ENGINE_ON":
        return { mode: "ENGINE ON", flow: "電池 → モーター（発電なし）",
          detail: "エンジン稼働・発電なし" };
      case "SPINNING":
        return { mode: "SPINNING", flow: "燃焼なし回転", detail: "燃焼なし回転" };
      default:
        return { mode: "EV DRIVE", flow: "バッテリー → モーター",
          detail: "EV走行" };
    }
  }

  function render(vehicle: DriveState) {
    current = vehicle;
    onVehicleChange(vehicle.vehicleId);
    const gauge = makeGaugeSnapshot(vehicle, style.value as GaugeMode);
    const isAura = gauge.layout === "AURA_CLASSIC" || gauge.layout === "AURA_ENHANCED";
    const energyMode = gaugeEnergyMode(gauge, vehicle.vehicleId);
    const instant = document.hidden || reducedMotion();
    dial.hidden = gauge.layout !== "SPORT";
    prius.hidden = gauge.layout !== "PRIUS";
    aura.hidden = !isAura;
    tech.hidden = gauge.layout !== "ENGINEERING";
    aura.classList.toggle("enhanced", gauge.layout === "AURA_ENHANCED");
    aura.classList.toggle("regenerating", energyMode === "REGEN");
    aura.classList.toggle("generating", energyMode === "GENERATION");
    aura.dataset.energyFlow = energyMode.toLowerCase();
    aura.dataset.batteryCharging = energyMode === "GENERATION" &&
      gauge.batteryPowerKw < -0.1 ? "true" : "false";
    aura.dataset.motorDrive = gauge.motorPowerKw > 0.1 ? "true" : "false";
    aura.dataset.batteryDischarging = gauge.batteryPowerKw > 0.1 ? "true" : "false";
    prius.dataset.energyFlow = energyMode.toLowerCase();
    aura.dataset.layout = gauge.layout;
    // Real-car-inspired displays are self-contained; ENGINEERING preserves
    // full raw telemetry and does not fabricate trip/range/temperature data.
    energyPanel.hidden = gauge.layout !== "SPORT" || vehicle.batterySoc === null;

    if (gauge.layout === "PRIUS") {
      const state = meterState(gauge, vehicle.vehicleId);
      set("prius-engine", gauge.engineRunning ? "ENGINE ON" : "EV READY");
      // P6.2: short sidebar label on 320px; footer preserves the full state.
      set("prius-drive", state.mode === "HYBRID DRIVE" ? "HEV" :
        state.mode === "GENERATING" ? "GEN" : state.mode);
      field("prius-drive").setAttribute("aria-label", state.mode);
      // Tight left information column: the complete path is available to
      // assistive technology; concise visible text avoids orphaned kanji.
      const displayFlow = state.mode === "HYBRID DRIVE" ? "HEV駆動"
        : state.mode === "GENERATING" ? "発電中"
        : state.mode === "REGEN" ? "回生充電"
        : state.mode === "EV DRIVE" ? "電池→駆動" : state.flow;
      set("prius-flow", displayFlow);
      field("prius-flow").setAttribute("aria-label", state.flow);
      set("prius-speed", String(gauge.speedKmh));
      set("prius-motor-kw", gauge.motorPowerKw.toFixed(1) + " kW");
      set("prius-state", state.detail);
      set("prius-ev", gauge.engineRunning ? "HEV" : "EV");
      set("prius-soc", gauge.socPct + "%");
      set("prius-zone", gauge.zone);
      priusChargeMotion.setTarget(gauge.chargeFraction, instant);
      priusDriveMotion.setTarget(gauge.driveFraction, instant);
      livePriusArc.classList.toggle("charging", gauge.zone === "CHARGE");
      const level = Math.round((gauge.socPct ?? 0) / 20);
      Array.from(battery.children).forEach((child, index) => {
        child.classList.toggle("lit", index < level);
      });
    }
    if (isAura) {
      const state = meterState(gauge, vehicle.vehicleId);
      const power = gauge.zone === "CHARGE"
        ? -Math.round(gauge.chargeFraction * 100)
        : Math.round(gauge.driveFraction * 100);
      powerMotion.setTarget(auraPowerAngle(power), instant);
      speedMotion.setTarget(speedAngle(gauge.speedKmh), instant);
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
      livePowerArc.classList.toggle("charging", power < 0);
    }
    paintMotion();
    if (prius.hidden && aura.hidden) stopMotionFrame();
    else scheduleMotion();

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
