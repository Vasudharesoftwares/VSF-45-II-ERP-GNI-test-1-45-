import { useState } from "react";
import { Calculator, IndianRupee, Factory, Gauge, Weight, Zap, TrendingUp, Users } from "lucide-react";

function Card({ title, icon: Icon, children, result, note }) {
  return (
    <section className="panel" style={{ padding: 20, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Icon size={21} color="#16865b" />
        <h3 style={{ margin: 0 }}>{title}</h3>
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
      <div style={{ background: "#edf8f2", borderRadius: 9, padding: 13, marginTop: 18 }}>
        <small style={{ color: "#527363" }}>CALCULATED RESULT</small>
        <h2 style={{ color: "#16865b", margin: "5px 0" }}>{result}</h2>
        {note && <small style={{ color: "#527363" }}>{note}</small>}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, unit = "", step = "any" }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#52645b" }}>
      {label}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: "100%", minWidth: 0, padding: "10px 12px", border: "1px solid #dce6df", borderRadius: 7 }}
        />
        {unit && <span>{unit}</span>}
      </div>
    </label>
  );
}

const num = v => Math.max(0, Number(v) || 0);
const money = v => "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function Calculators() {
  const [tab, setTab] = useState("business");

  const [qty, setQty] = useState("100");
  const [rate, setRate] = useState("100");
  const [discount, setDiscount] = useState("0");
  const [gst, setGst] = useState("18");
  const subtotal = num(qty) * num(rate) * (1 - num(discount) / 100);
  const gstAmount = subtotal * num(gst) / 100;

  const [materialQty, setMaterialQty] = useState("100");
  const [materialRate, setMaterialRate] = useState("50");
  const [labour, setLabour] = useState("1000");
  const [overhead, setOverhead] = useState("500");
  const materialCost = num(materialQty) * num(materialRate);
  const totalCost = materialCost + num(labour) + num(overhead);

  const [cost, setCost] = useState("10000");
  const [selling, setSelling] = useState("15000");
  const profit = num(selling) - num(cost);

  const [salary, setSalary] = useState("15000");
  const [days, setDays] = useState("26");
  const [worked, setWorked] = useState("26");
  const [overtime, setOvertime] = useState("0");
  const daily = num(days) ? num(salary) / num(days) : 0;
  const salaryTotal = daily * num(worked) + daily / 8 * num(overtime) * 1.5;

  const [capacity, setCapacity] = useState("5");
  const [hours, setHours] = useState("8");
  const [efficiency, setEfficiency] = useState("85");

  const [voltage, setVoltage] = useState("415");
  const [amps, tAmps] = useState("10");
  const [pf, setPf] = useState("0.85");
  const [powerHours, setPowerHours] = useState("8");
  const kw = Math.sqrt(3) * num(voltage) * num(amps) * num(pf) / 1000;

  const [kg, setKg] = useState("1000");
  const [unit, setUnit] = useState("kg");

  const [planned, setPlanned] = useState("1000");
  const [produced, setProduced] = useState("850");

  return (
    <div>
      <div className="page-heading">
        <div>
          <label>BUSINESS TOOLS</label>
          <h1>Calculators</h1>
          <p>Quick calculations for business operations and machinery.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <button className={tab === "business" ? "primary" : "secondary"} onClick={() => setTab("business")}>
          <IndianRupee size={16} /> Business Calculators
        </button>
        <button className={tab === "machinery" ? "primary" : "secondary"} onClick={() => setTab("machinery")}>
          <Factory size={16} /> Machinery Calculators
        </button>
      </div>

      {tab === "business" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
          <Card title="Order & GST Calculator" icon={Calculator} result={money(subtotal + gstAmount)} note={`Subtotal ${money(subtotal)} · GST ${money(gstAmount)}`}>
            <Field label="Quantity" value={qty} onChange={setQty} />
            <Field label="Rate per unit (₹)" value={rate} onChange={setRate} />
            <Field label="Discount (%)" value={discount} onChange={setDiscount} />
            <Field label="GST (%)" value={gst} onChange={setGst} />
          </Card>

          <Card title="Material & Production Cost" icon={Factory} result={money(totalCost)} note={`Material ${money(materialCost)} + labour + overhead`}>
            <Field label="Material quantity" value={materialQty} onChange={setMaterialQty} />
            <Field label="Material rate (₹)" value={materialRate} onChange={setMaterialRate} />
            <Field label="Labour cost (₹)" value={labour} onChange={setLabour} />
            <Field label="Other overhead (₹)" value={overhead} onChange={setOverhead} />
          </Card>

          <Card title="Profit & Margin" icon={TrendingUp} result={money(profit)} note={`Profit margin: ${num(selling) ? (profit / num(selling) * 100).toFixed(2) : "0.00"}%`}>
            <Field label="Total cost (₹)" value={cost} onChange={setCost} />
            <Field label="Selling price (₹)" value={selling} onChange={setSelling} />
          </Card>

          <Card title="Salary & Overtime" icon={Users} result={money(salaryTotal)} note={`Daily basic rate: ${money(daily)}`}>
            <Field label="Monthly salary (₹)" value={salary} onChange={setSalary} />
            <Field label="Standard working days" value={days} onChange={setDays} />
            <Field label="Days worked" value={worked} onChange={setWorked} />
            <Field label="Overtime hours (1.5×)" value={overtime} onChange={setOvertime} />
          </Card>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
          <Card title="Machine Capacity" icon={Gauge} result={`${(num(capacity) * num(hours) * num(efficiency) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })} units`} note="Estimated output per shift">
            <Field label="Rated capacity per hour" value={capacity} onChange={setCapacity} unit="units/hr" />
            <Field label="Operating hours" value={hours} onChange={setHours} unit="hours" />
            <Field label="Efficiency" value={efficiency} onChange={setEfficiency} unit="%" />
          </Card>

          <Card title="Power Consumption" icon={Zap} result={`${(kw * num(powerHours)).toFixed(2)} kWh`} note={`Estimated load: ${kw.toFixed(2)} kW`}>
            <Field label="Voltage (3-phase)" value={voltage} onChange={setVoltage} unit="V" />
            <Field label="Current" value={amps} onChange={setAmps} unit="A" />
            <Field label="Power factor" value={pf} onChange={setPf} />
            <Field label="Operating hours" value={powerHours} onChange={setPowerHours} unit="hours" />
          </Card>

          <Card title="Weight Converter" icon={Weight} result={unit === "kg" ? `${num(kg).toLocaleString("en-IN")} kg = ${(num(kg) / 1000).toLocaleString("en-IN")} tonnes` : `${num(kg).toLocaleString("en-IN")} tonnes = ${(num(kg) * 1000).toLocaleString("en-IN")} kg`}>
            <Field label={unit === "kg" ? "Weight in kilograms" : "Weight in tonnes"} value={kg} onChange={setKg} />
            <select value={unit} onChange={e => setUnit(e.target.value)} style={{ padding: 10, borderRadius: 7, border: "1px solid #dce6df" }}>
              <option value="kg">Kilograms to tonnes</option>
              <option value="tonnes">Tonnes to kilograms</option>
            </select>
          </Card>

          <Card title="Production Output & Efficiency" icon={Factory} result={`${(num(planned) ? num(produced) / num(planned) * 100 : 0).toFixed(2)}%`} note={`${num(produced).toLocaleString("en-IN")} produced out of ${num(planned).toLocaleString("en-IN")} planned`}>
            <Field label="Planned production" value={planned} onChange={setPlanned} />
            <Field label="Actual production" value={produced} onChange={setProduced} />
          </Card>
        </div>
      )}
      <p style={{ color: "#718078", fontSize: 12, marginTop: 18 }}>
        Results are estimates. Confirm machine ratings, electrical specifications, applicable GST and company payroll rules before using calculations for official decisions.
      </p>
    </div>
  );
}
