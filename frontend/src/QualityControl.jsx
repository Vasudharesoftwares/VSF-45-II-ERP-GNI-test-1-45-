import React, { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, ClipboardCheck, ShieldCheck } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning } from "./utils/alerts";

const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  inspection_no: `QC-${Date.now()}`,
  inspection_type: "incoming",
  inspection_date: today(),
  product_id: "",
  goods_receipt_id: "",
  work_order_id: "",
  inspected_quantity: "1",
  accepted_quantity: "1",
  rejected_quantity: "0",
  rejection_reason: "",
  corrective_action: "",
  inspected_by: "",
  notes: ""
});

export default function QualityControl() {
  const [companyId, setCompanyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(blank());
  const [tab, setTab] = useState("register");
  const [busy, setBusy] = useState(false);

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  };

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      const [qc, p, grn, wo] = await Promise.all([
        request(`/api/quality/companies/${companyId}/inspections`),
        request(`/api/core/companies/${companyId}/products?active=true`),
        request(`/api/purchase/companies/${companyId}/receipts`),
        request(`/api/production/companies/${companyId}/work-orders`)
      ]);
      setRows(qc);
      setProducts(p.items || []);
      setReceipts(Array.isArray(grn) ? grn : grn.items || []);
      setOrders(wo);
    } catch (e) {
      showError("Quality data could not be loaded", e.message);
    }
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/me").then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Unable to identify company.");
      if (alive) setCompanyId(data.company_id);
    }).catch(e => showError("Company could not be loaded", e.message));
    return () => { alive = false; };
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const save = async e => {
    e.preventDefault();
    if (Number(form.accepted_quantity) + Number(form.rejected_quantity) !== Number(form.inspected_quantity)) {
      showWarning("Accepted quantity plus rejected quantity must equal inspected quantity.");
      return;
    }
    if (Number(form.rejected_quantity) > 0 && !form.rejection_reason.trim()) {
      showWarning("Please enter a rejection reason.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        product_id: Number(form.product_id),
        goods_receipt_id: form.inspection_type === "incoming" ? Number(form.goods_receipt_id) : null,
        work_order_id: form.inspection_type !== "incoming" ? Number(form.work_order_id) : null
      };
      await request(`/api/quality/companies/${companyId}/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      showSuccess("Quality inspection recorded.");
      setForm(blank());
      await load();
      setTab("register");
    } catch (e) {
      showError("Inspection could not be saved", e.message);
    } finally {
      setBusy(false);
    }
  };

  const field = { padding: 10, border: "1px solid #d8dee8", borderRadius: 7, width: "100%", boxSizing: "border-box" };
  const label = { display: "block", fontSize: 12, color: "#526174", marginBottom: 5 };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 };
  const button = { padding: "9px 14px", border: 0, borderRadius: 7, cursor: "pointer", background: "#244f85", color: "white" };
  const panel = { background: "white", padding: 18, borderRadius: 12, border: "1px solid #e1e6ed", marginBottom: 16 };

  const typeLabel = value => ({
    incoming: "Incoming",
    "in-process": "In-process",
    "finished-goods": "Finished goods"
  }[value] || value);

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:18}}>
      <div><h1 style={{margin:"0 0 5px"}}>Quality Control</h1><p style={{margin:0,color:"#64748b"}}>Incoming, in-process and finished goods inspections</p></div>
      <button style={button} onClick={load}><RefreshCw size={15} style={{verticalAlign:"middle"}}/> Refresh</button>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <button style={{...button,background:tab==="register"?"#18375f":"#e9eef5",color:tab==="register"?"white":"#23364d"}} onClick={()=>setTab("register")}>Inspection Register</button>
      <button style={{...button,background:tab==="new"?"#18375f":"#e9eef5",color:tab==="new"?"white":"#23364d"}} onClick={()=>setTab("new")}><Plus size={14}/> New Inspection</button>
    </div>

    {tab==="new" && <form onSubmit={save} style={panel}>
      <h2><ShieldCheck size={19}/> Record Quality Inspection</h2>
      <div style={grid}>
        <label><span style={label}>Inspection Number</span><input required style={field} value={form.inspection_no} onChange={e=>update("inspection_no",e.target.value)}/></label>
        <label><span style={label}>Inspection Date</span><input type="date" required style={field} value={form.inspection_date} onChange={e=>update("inspection_date",e.target.value)}/></label>
        <label><span style={label}>Inspection Type</span><select style={field} value={form.inspection_type} onChange={e=>setForm({...form,inspection_type:e.target.value,product_id:"",goods_receipt_id:"",work_order_id:""})}><option value="incoming">Incoming material</option><option value="in-process">In-process</option><option value="finished-goods">Finished goods</option></select></label>
        <label><span style={label}>Product</span><select required style={field} value={form.product_id} onChange={e=>update("product_id",e.target.value)}><option value="">Select product</option>{products.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label>

        {form.inspection_type==="incoming" ?
          <label><span style={label}>Goods Receipt</span><select required style={field} value={form.goods_receipt_id} onChange={e=>update("goods_receipt_id",e.target.value)}><option value="">Select GRN</option>{receipts.map(r=><option key={r.id} value={r.id}>{r.grn_no || `GRN-${r.id}`}</option>)}</select></label>
          :
          <label><span style={label}>Work Order</span><select required style={field} value={form.work_order_id} onChange={e=>update("work_order_id",e.target.value)}><option value="">Select work order</option>{orders.map(o=><option key={o.id} value={o.id}>{o.work_order_no} — {o.product_name}</option>)}</select></label>
        }

        <label><span style={label}>Inspected Quantity</span><input type="number" min="0.001" step="0.001" required style={field} value={form.inspected_quantity} onChange={e=>update("inspected_quantity",e.target.value)}/></label>
        <label><span style={label}>Accepted Quantity</span><input type="number" min="0" step="0.001" required style={field} value={form.accepted_quantity} onChange={e=>update("accepted_quantity",e.target.value)}/></label>
        <label><span style={label}>Rejected Quantity</span><input type="number" min="0" step="0.001" required style={field} value={form.rejected_quantity} onChange={e=>update("rejected_quantity",e.target.value)}/></label>
        <label><span style={label}>Inspected By</span><input style={field} value={form.inspected_by} onChange={e=>update("inspected_by",e.target.value)}/></label>
      </div>
      <label style={{display:"block",marginTop:12}}><span style={label}>Rejection Reason</span><textarea style={field} value={form.rejection_reason} onChange={e=>update("rejection_reason",e.target.value)} placeholder="Required when rejected quantity is greater than zero"/></label>
      <label style={{display:"block",marginTop:12}}><span style={label}>Corrective Action / Rework Instructions</span><textarea style={field} value={form.corrective_action} onChange={e=>update("corrective_action",e.target.value)}/></label>
      <label style={{display:"block",marginTop:12}}><span style={label}>Notes</span><textarea style={field} value={form.notes} onChange={e=>update("notes",e.target.value)}/></label>
      <button disabled={busy} style={{...button,marginTop:14}}>Save Inspection</button>
    </form>}

    {tab==="register" && <div style={panel}>
      <h2><ClipboardCheck size={19}/> Inspection Register</h2>
      <div style={grid}>
        <div><strong>Total Inspections</strong><h2>{rows.length}</h2></div>
        <div><strong>Total Accepted</strong><h2>{rows.reduce((n,r)=>n+Number(r.accepted_quantity),0).toLocaleString("en-IN")}</h2></div>
        <div><strong>Total Rejected</strong><h2>{rows.reduce((n,r)=>n+Number(r.rejected_quantity),0).toLocaleString("en-IN")}</h2></div>
      </div>
      {rows.length===0?<p>No inspections recorded yet.</p>:<div style={{overflowX:"auto",marginTop:16}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead><tr>{["Inspection","Date","Type","Product","Inspected","Accepted","Rejected","Reason","Corrective Action"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #ddd"}}>{x}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={r.id}>{[r.inspection_no,r.inspection_date,typeLabel(r.inspection_type),r.product_name,r.inspected_quantity,r.accepted_quantity,r.rejected_quantity,r.rejection_reason||"—",r.corrective_action||"—"].map((x,i)=><td key={i} style={{padding:10,borderBottom:"1px solid #eee",verticalAlign:"top"}}>{x}</td>)}</tr>)}</tbody>
        </table>
      </div>}
    </div>}
  </div>;
}
