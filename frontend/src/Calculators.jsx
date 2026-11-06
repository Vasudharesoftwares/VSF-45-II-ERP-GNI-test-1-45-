import { useState } from "react";
import "./Calculators.css";
import {
  Calculator, IndianRupee, Factory, Gauge, Weight,
  Zap, TrendingUp, Clock3, Activity
} from "lucide-react";

const number = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const money = value =>
  "₹" + value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

function Field({ label, value, onChange, unit, min = 0, max, step = "any" }) {
  return (
    <label className="machine-field">
      <span>{label}</span>
      <div className="machine-input-wrap">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
        {unit && <small>{unit}</small>}
      </div>
    </label>
  );
}

function Result({ value, note }) {
  return (
    <div className="machine-result">
      <span>CALCULATED RESULT</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function Card({ title, icon: Icon, children, result, note }) {
  return (
    <section className="panel machine-card">
      <div className="machine-card-heading">
        <span className="machine-icon"><Icon size={20} /></span>
        <h3>{title}</h3>
      </div>
      <div className="machine-fields">{children}</div>
      <Result value={result} note={note} />
    </section>
  );
}

export default function Calculators() {
  const [capacity, setCapacity] = useState("50");
  const [hours, setHours] = useState("8");
  const [efficiency, setEfficiency] = useState("85");

  const [voltage, setVoltage] = useState("415");
  const [amps, setAmps] = useState("10");
  const [pf, setPf] = useState("0.85");
  const [powerHours, setPowerHours] = useState("8");

  const [tariff, setTariff] = useState("8.50");
  const [machines, setMachines] = useState("1");

  const [weight, setWeight] = useState("1000");
  const [weightUnit, setWeightUnit] = useState("kg");

  const [planned, setPlanned] = useState("1000");
  const [produced, setProduced] = useState("850");

  const [cycle, setCycle] = useState("45");
  const [cycleHours, setCycleHours] = useState("8");
  const [cycleEfficiency, setCycleEfficiency] = useState("85");

  const validEfficiency = Math.min(number(efficiency), 100);
  const output = number(capacity) * number(hours) * validEfficiency / 100;

  const validPf = Math.min(number(pf), 1);
  const kw = Math.sqrt(3) * number(voltage) * number(amps) * validPf / 1000;
  const energy = kw * number(powerHours);
  const runningCost = energy * number(tariff) * number(machines);

  const kgValue = number(weight);
  const convertedWeight = weightUnit === "kg" ? kgValue / 1000 : kgValue * 1000;

  const plan = number(planned);
  const actual = number(produced);
  const productionEfficiency = plan ? actual / plan * 100 : 0;
  const wastage = Math.max(plan - actual, 0);
  const excess = Math.max(actual - plan, 0);

  const cycleOutput = number(cycle)
    ? (3600 / number(cycle)) * number(cycleHours) *
      Math.min(number(cycleEfficiency), 100) / 100
    : 0;

  return (
    <div className="machine-calculators">
      <div className="page-heading">
        <div>
          <label>FACTORY OPERATIONS TOOLS</label>
          <h1>Machinery Calculators</h1>
          <p>Calculate machine capacity, electrical consumption, running costs and production performance.</p>
        </div>
      </div>

      <div className="machine-intro">
        <div>
          <Factory size={23} />
          <div>
            <strong>Production & Engineering</strong>
            <span>Enter your machine specifications to calculate operating estimates.</span>
          </div>
        </div>
        <span className="machine-live-label">LIVE CALCULATIONS</span>
      </div>

      <div className="machine-grid">
        <Card
          title="Machine Production Capacity"
          icon={Gauge}
          result={`${output.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units`}
          note="Estimated production for the entered shift duration"
        >
          <Field label="Rated machine capacity" value={capacity} onChange={setCapacity} unit="units/hour" />
          <Field label="Operating duration" value={hours} onChange={setHours} unit="hours" />
          <Field label="Machine efficiency" value={efficiency} onChange={v => setEfficiency(String(Math.min(Number(v) || 0, 100)))} unit="%" max="100" />
        </Card>

        <Card
          title="Three-Phase Power Consumption"
          icon={Zap}
          result={`${energy.toFixed(2)} kWh`}
          note={`Estimated connected load: ${kw.toFixed(2)} kW`}
        >
          <Field label="Line voltage" value={voltage} onChange={setVoltage} unit="V" />
          <Field label="Current" value={amps} onChange={setAmps} unit="A" />
          <Field label="Power factor" value={pf} onChange={v => setPf(String(Math.min(Number(v) || 0, 1)))} min="0" max="1" step="0.01" />
          <Field label="Operating duration" value={powerHours} onChange={setPowerHours} unit="hours" />
        </Card>

        <Card
          title="Machine Electricity Cost"
          icon={IndianRupee}
          result={money(runningCost)}
          note={`${energy.toFixed(2)} kWh per machine × ${number(machines)} machine(s)`}
        >
          <Field label="Energy consumption per machine" value={powerHours} onChange={setPowerHours} unit="hours" />
          <Field label="Electricity tariff" value={tariff} onChange={setTariff} unit="₹/kWh" step="0.01" />
          <Field label="Number of machines" value={machines} onChange={setMachines} unit="machines" step="1" />
          <small className="machine-hint">Uses the three-phase power inputs above.</small>
        </Card>

        <Card
          title="Weight Converter"
          icon={Weight}
          result={weightUnit === "kg"
            ? `${convertedWeight.toLocaleString("en-IN", { maximumFractionDigits: 3 })} tonnes`
            : `${convertedWeight.toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`}
          note="Metric weight conversion"
        >
          <Field
            label={weightUnit === "kg" ? "Weight in kilograms" : "Weight in tonnes"}
            value={weight}
            onChange={setWeight}
            unit={weightUnit === "kg" ? "kg" : "tonnes"}
          />
          <label className="machine-field">
            <span>Conversion direction</span>
            <select value={weightUnit} onChange={e => setWeightUnit(e.target.value)}>
              <option value="kg">Kilograms to tonnes</option>
              <option value="tonnes">Tonnes to kilograms</option>
            </select>
          </label>
        </Card>

        <Card
          title="Production Efficiency & Wastage"
          icon={TrendingUp}
          result={`${productionEfficiency.toFixed(2)}%`}
          note={`${actual.toLocaleString("en-IN")} actual units against ${plan.toLocaleString("en-IN")} planned units`}
        >
          <Field label="Planned production" value={planned} onChange={setPlanned} unit="units" />
          <Field label="Actual production" value={produced} onChange={setProduced} unit="units" />
          <div className="machine-metric-row">
            <span>Shortfall</span><strong>{wastage.toLocaleString("en-IN")} units</strong>
          </div>
          {excess > 0 && (
            <div className="machine-metric-row">
              <span>Above target</span><strong>{excess.toLocaleString("en-IN")} units</strong>
            </div>
          )}
        </Card>

        <Card
          title="Machine Cycle-Time Output"
          icon={Clock3}
          result={`${cycleOutput.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units`}
          note="Estimated output for the entered operating period"
        >
          <Field label="Cycle time per unit" value={cycle} onChange={setCycle} unit="seconds" />
          <Field label="Operating duration" value={cycleHours} onChange={setCycleHours} unit="hours" />
          <Field label="Operating efficiency" value={cycleEfficiency} onChange={v => setCycleEfficiency(String(Math.min(Number(v) || 0, 100)))} unit="%" max="100" />
        </Card>
      </div>

      <div className="machine-disclaimer">
        <Activity size={16} />
        <span>These are engineering estimates. Verify actual machine ratings, measured current, power factor, cycle time and electricity tariff before using results for production or financial decisions.</span>
      </div>
    </div>
  );
}
