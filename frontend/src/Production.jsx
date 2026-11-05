import React, { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Factory, ClipboardList, Boxes, CheckCircle2 } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";

const today = () => new Date().toISOString().slice(0, 10);
const blankBom = () => ({
  bom_no: `BOM-${Date.now()}`,
  name: "",
  product_id: "",
  output_quantity: "1",
  notes: "",
  lines: [{ material_product_id: "", quantity_per_output: "1", wastage_percent: "0" }]
});

export default function Production() {
  const [companyId, setCompanyId] = useState(null);
  const [products, setProducts] = useState([]);
  const [boms, setBoms] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("orders");
  const [bomForm, setBomForm] = useState(blankBom());
  const [orderForm, setOrderForm] = useState({
    bom_id: "", work_order_no: `WO-${Date.now()}`,
    planned_quantity: "1", planned_date: today(), due_date: "",
    location: "Main Store", notes: ""
  });
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
      const [b, w, p] = await Promise.all([
        request(`/api/production/companies/${companyId}/boms`),
        request(`/api/production/companies/${companyId}/work-orders`),
        request(`/api/core/companies/${companyId}/products?active=true`)
      ]);
      setBoms(b);
      setOrders(w);
      setProducts(p.items || []);
    } catch (e) {
      showError("Production data could not be loaded", e.message);
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

  const saveBom = async e => {
    e.preventDefault();
    if (!bomForm.lines.length || bomForm.lines.some(x => !x.material_product_id)) {
      showWarning("Complete all BOM material rows.");
      return;
    }
    setBusy(true);
    try {
      await request(`/api/production/companies/${companyId}/boms`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...bomForm,
          product_id: Number(bomForm.product_id),
          lines: bomForm.lines.map(x => ({
            ...x, material_product_id: Number(x.material_product_id)
          }))
        })
      });
      showSuccess("BOM saved successfully.");
      setBomForm(blankBom());
      await load();
    } catch (e) { showError("BOM could not be saved", e.message); }
    finally { setBusy(false); }
  };

  const saveOrder = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await request(`/api/production/companies/${companyId}/work-orders`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderForm, bom_id: Number(orderForm.bom_id) })
      });
      showSuccess("Work order created.");
      setOrderForm({
        bom_id: "", work_order_no: `WO-${Date.now()}`,
        planned_quantity: "1", planned_date: today(), due_date: "",
        location: "Main Store", notes: ""
      });
      await load();
      setTab("orders");
    } catch (e) { showError("Work order could not be created", e.message); }
    finally { setBusy(false); }
  };

  const completeOrder = async order => {
    const answer = await showConfirm(
      "Complete production?",
      `This will consume raw materials and receive ${order.product_name} into ${order.location}.`
    );
    if (!answer) return;
    const qty = window.prompt("Enter actual finished quantity:", order.planned_quantity);
    if (qty === null) return;
    if (!(Number(qty) > 0)) {
      showWarning("Enter a valid finished quantity.");
      return;
    }
    try {
      await request(`/api/production/work-orders/${order.id}/complete`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produced_quantity: qty })
      });
      showSuccess("Production posted. Inventory ledger updated.");
      await load();
    } catch (e) { showError("Production could not be posted", e.message); }
  };

  const field = { padding: 10, border: "1px solid #d8dee8", borderRadius: 7, width: "100%", boxSizing: "border-box" };
  const button = { padding: "9px 14px", border: 0, borderRadius: 7, cursor: "pointer", background: "#244f85", color: "white" };
  const panel = { background: "white", padding: 18, borderRadius: 12, border: "1px solid #e1e6ed", marginBottom: 16 };
  const label = { display: "block", fontSize: 12, marginBottom: 5, color: "#526174" };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:18}}>
      <div><h1 style={{margin:"0 0 5px"}}>Production Management</h1><p style={{margin:0,color:"#64748b"}}>Bill of Materials, work orders and production posting</p></div>
      <button style={button} onClick={load}><RefreshCw size={15} style={{verticalAlign:"middle"}}/> Refresh</button>
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
      {[["orders","Work Orders"],["boms","Bill of Materials"],["newbom","Create BOM"],["neworder","Create Work Order"]].map(([id,name]) =>
        <button key={id} onClick={()=>setTab(id)} style={{...button,background:tab===id?"#18375f":"#e9eef5",color:tab===id?"white":"#23364d"}}>{name}</button>
      )}
    </div>

    {tab==="newbom" && <form onSubmit={saveBom} style={panel}>
      <h2>Create Bill of Materials</h2>
      <div style={grid}>
        <label><span style={label}>BOM Number</span><input required style={field} value={bomForm.bom_no} onChange={e=>setBomForm({...bomForm,bom_no:e.target.value})}/></label>
        <label><span style={label}>BOM Name</span><input required style={field} value={bomForm.name} onChange={e=>setBomForm({...bomForm,name:e.target.value})}/></label>
        <label><span style={label}>Finished Product</span><select required style={field} value={bomForm.product_id} onChange={e=>setBomForm({...bomForm,product_id:e.target.value})}><option value="">Select product</option>{products.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label>
        <label><span style={label}>BOM Output Quantity</span><input type="number" min="0.001" step="0.001" required style={field} value={bomForm.output_quantity} onChange={e=>setBomForm({...bomForm,output_quantity:e.target.value})}/></label>
      </div>
      <h3>Raw Materials</h3>
      {bomForm.lines.map((line,i)=><div key={i} style={{...grid,marginBottom:10}}>
        <label><span style={label}>Material</span><select required style={field} value={line.material_product_id} onChange={e=>setBomForm({...bomForm,lines:bomForm.lines.map((x,j)=>j===i?{...x,material_product_id:e.target.value}:x)})}><option value="">Select raw material</option>{products.filter(p=>p.is_active && p.track_inventory).map(p=><option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></label>
        <label><span style={label}>Required Quantity</span><input type="number" min="0.0001" step="0.0001" required style={field} value={line.quantity_per_output} onChange={e=>setBomForm({...bomForm,lines:bomForm.lines.map((x,j)=>j===i?{...x,quantity_per_output:e.target.value}:x)})}/></label>
        <label><span style={label}>Wastage %</span><input type="number" min="0" step="0.001" style={field} value={line.wastage_percent} onChange={e=>setBomForm({...bomForm,lines:bomForm.lines.map((x,j)=>j===i?{...x,wastage_percent:e.target.value}:x)})}/></label>
        <button type="button" style={{...button,background:"#a33"}} onClick={()=>setBomForm({...bomForm,lines:bomForm.lines.filter((_,j)=>j!==i)})}>Remove</button>
      </div>)}
      <button type="button" style={{...button,background:"#526174",marginRight:8}} onClick={()=>setBomForm({...bomForm,lines:[...bomForm.lines,{material_product_id:"",quantity_per_output:"1",wastage_percent:"0"}]})}><Plus size={14}/> Add Material</button>
      <button disabled={busy} style={button}>Save BOM</button>
    </form>}

    {tab==="neworder" && <form onSubmit={saveOrder} style={panel}>
      <h2>Create Work Order</h2>
      <div style={grid}>
        <label><span style={label}>Work Order Number</span><input required style={field} value={orderForm.work_order_no} onChange={e=>setOrderForm({...orderForm,work_order_no:e.target.value})}/></label>
        <label><span style={label}>BOM</span><select required style={field} value={orderForm.bom_id} onChange={e=>setOrderForm({...orderForm,bom_id:e.target.value})}><option value="">Select BOM</option>{boms.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.bom_no} — {b.name}</option>)}</select></label>
        <label><span style={label}>Planned Quantity</span><input type="number" min="0.001" step="0.001" required style={field} value={orderForm.planned_quantity} onChange={e=>setOrderForm({...orderForm,planned_quantity:e.target.value})}/></label>
        <label><span style={label}>Stock Location</span><input required style={field} value={orderForm.location} onChange={e=>setOrderForm({...orderForm,location:e.target.value})}/></label>
        <label><span style={label}>Planned Date</span><input type="date" style={field} value={orderForm.planned_date} onChange={e=>setOrderForm({...orderForm,planned_date:e.target.value})}/></label>
        <label><span style={label}>Due Date</span><input type="date" style={field} value={orderForm.due_date} onChange={e=>setOrderForm({...orderForm,due_date:e.target.value})}/></label>
      </div>
      <label style={{display:"block",marginTop:12}}><span style={label}>Notes</span><textarea style={field} value={orderForm.notes} onChange={e=>setOrderForm({...orderForm,notes:e.target.value})}/></label>
      <button disabled={busy} style={{...button,marginTop:14}}>Create Work Order</button>
    </form>}

    {tab==="boms" && <div style={panel}><h2><Boxes size={19}/> Bill of Materials</h2>
      {boms.length===0?<p>No BOMs created yet.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["BOM No.","Name","Finished Product","Output Qty","Materials","Status"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #ddd"}}>{x}</th>)}</tr></thead><tbody>{boms.map(b=><tr key={b.id}>{[b.bom_no,b.name,b.product_name,b.output_quantity,b.lines.length,b.is_active?"Active":"Inactive"].map((x,i)=><td key={i} style={{padding:10,borderBottom:"1px solid #eee"}}>{x}</td>)}</tr>)}</tbody></table></div>}
    </div>}

    {tab==="orders" && <div style={panel}><h2><ClipboardList size={19}/> Work Order Register</h2>
      {orders.length===0?<p>No work orders created yet.</p>:<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>{["Work Order","Finished Product","BOM","Planned","Produced","Location","Due Date","Status","Action"].map(x=><th key={x} style={{textAlign:"left",padding:10,borderBottom:"1px solid #ddd"}}>{x}</th>)}</tr></thead><tbody>{orders.map(o=><tr key={o.id}>{[o.work_order_no,o.product_name,o.bom_no,o.planned_quantity,o.produced_quantity,o.location,o.due_date||"—",o.status].map((x,i)=><td key={i} style={{padding:10,borderBottom:"1px solid #eee"}}>{x}</td>)}<td style={{padding:10}}>{o.status!=="Completed"&&o.status!=="Cancelled"?<button style={button} onClick={()=>completeOrder(o)}><CheckCircle2 size={14}/> Complete</button>:"—"}</td></tr>)}</tbody></table></div>}
    </div>}
  </div>;
}
