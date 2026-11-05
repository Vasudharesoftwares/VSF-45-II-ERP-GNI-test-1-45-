import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, RefreshCw, Pencil, Power, Download, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";
import "./CRM.css";

const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  customer_id: "", enquiry_no: `ENQ-${Date.now()}`, enquiry_date: today(), source: "",
  subject: "", product_requirement: "", estimated_value: "", status: "New",
  next_follow_up: "", owner: "", notes: ""
});
const statuses = ["New", "Contacted", "Qualified", "Quoted", "Negotiation", "Won", "Lost", "On Hold"];

export default function Enquiries() {
  const [companyId, setCompanyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank());
  const fileRef = useRef(null);

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  };

  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/me").then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.detail || "Unable to identify company.");
      if (alive) setCompanyId(d.company_id);
    }).catch(e => showError("Unable to load company", e.message));
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [e, c] = await Promise.all([
        request(`/api/crm/companies/${companyId}/enquiries`),
        request(`/api/crm/companies/${companyId}/customers?active=true`)
      ]);
      setRows(e);
      setCustomers(c);
    } catch (err) { showError("Could not load enquiries", err.message); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(blank()); setModal(true); };
  const openEdit = row => {
    setEditing(row.id);
    setForm({
      customer_id: String(row.customer_id), enquiry_no: row.enquiry_no || "",
      enquiry_date: row.enquiry_date || today(), source: row.source || "",
      subject: row.subject || "", product_requirement: row.product_requirement || "",
      estimated_value: row.estimated_value || "", status: row.status || "New",
      next_follow_up: row.next_follow_up || "", owner: row.owner || "", notes: row.notes || ""
    });
    setModal(true);
  };

  const save = async e => {
    e.preventDefault();
    if (saving) return;
    if (!e.currentTarget.checkValidity()) {
      showWarning("Check required fields", "Please complete the highlighted fields.");
      e.currentTarget.reportValidity();
      return;
    }
    setSaving(true);
    try {
      const payload = {...form, customer_id:Number(form.customer_id), estimated_value:form.estimated_value ? String(form.estimated_value) : null};
      await request(editing ? `/api/crm/enquiries/${editing}` : `/api/crm/companies/${companyId}/enquiries`, {
        method: editing ? "PUT" : "POST", body: JSON.stringify(payload)
      });
      setModal(false);
      await load();
      showSuccess("Enquiry saved", editing ? "Enquiry updated successfully." : "New enquiry created.");
    } catch (err) { showError("Could not save enquiry", err.message); }
    finally { setSaving(false); }
  };

  const toggle = async row => {
    const action = row.is_active ? "deactivate" : "activate";
    if (!await showConfirm(`${action === "deactivate" ? "Deactivate" : "Activate"} enquiry?`, row.enquiry_no, `Yes, ${action}`)) return;
    try {
      await request(`/api/crm/enquiries/${row.id}/${action}`, {method:"PATCH"});
      await load();
      showSuccess("Enquiry updated", `${row.enquiry_no} status changed.`);
    } catch (e) { showError("Status update failed", e.message); }
  };

  const visible = rows.filter(r =>
    (status === "All" || r.status === status) &&
    [r.enquiry_no, r.customer_name, r.subject, r.product_requirement].some(v => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );

  const exportExcel = () => {
    const data = visible.map(({enquiry_no,enquiry_date,customer_code,customer_name,source,subject,product_requirement,estimated_value,status,next_follow_up,owner,notes}) =>
      ({enquiry_no,enquiry_date,customer_code,customer_name,source,subject,product_requirement,estimated_value,status,next_follow_up,owner,notes}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Enquiries");
    XLSX.writeFile(wb, "Enquiries.xlsx");
  };

  const importExcel = async e => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), {type:"array"});
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:""});
      if (!data.length) return showWarning("Empty spreadsheet", "No enquiry rows found.");
      let created = 0, skipped = 0;
      const existing = new Set(rows.map(r => String(r.enquiry_no).toUpperCase()));
      for (const item of data) {
        const no = String(item.enquiry_no || item.Enquiry_No || "").trim().toUpperCase();
        const code = String(item.customer_code || item.Customer_Code || "").trim().toUpperCase();
        const customer = customers.find(c => c.code.toUpperCase() === code);
        const subject = String(item.subject || item.Subject || "").trim();
        if (!no || !customer || !subject || existing.has(no)) { skipped++; continue; }
        try {
          await request(`/api/crm/companies/${companyId}/enquiries`, {
            method:"POST",
            body:JSON.stringify({
              customer_id:customer.id, enquiry_no:no,
              enquiry_date:String(item.enquiry_date || item.Enquiry_Date || today()),
              source:String(item.source || item.Source || ""),
              subject, product_requirement:String(item.product_requirement || item.Product_Requirement || ""),
              estimated_value:String(item.estimated_value || item.Estimated_Value || ""),
              status:String(item.status || item.Status || "New"),
              next_follow_up:String(item.next_follow_up || item.Next_Follow_Up || ""),
              owner:String(item.owner || item.Owner || ""), notes:String(item.notes || item.Notes || "")
            })
          });
          existing.add(no); created++;
        } catch { skipped++; }
      }
      await load();
      showSuccess("Import completed", `${created} enquiry(s) imported. ${skipped} row(s) skipped. Match customers using customer_code.`);
    } catch (err) { showError("Excel import failed", err.message); }
  };

  return <div className="crm-page">
    <div className="crm-heading"><div><label>CRM / SALES PIPELINE</label><h1>Enquiries</h1><p>Capture customer requirements and manage follow-ups.</p></div><button className="crm-primary" onClick={openNew}><Plus size={17}/> New Enquiry</button></div>
    <div className="crm-toolbar">
      <div className="crm-search"><Search size={17}/><input placeholder="Search enquiry, customer or requirement..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option>All</option>{statuses.map(s=><option key={s}>{s}</option>)}</select>
      <button className="crm-secondary" onClick={load}><RefreshCw size={15}/> Refresh</button>
      <button className="crm-secondary" onClick={exportExcel}><Download size={15}/> Export</button>
      <button className="crm-secondary" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Import</button>
      <input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={importExcel}/>
    </div>
    <section className="crm-panel">
      {loading ? <div className="crm-empty">Loading enquiries...</div> : visible.length === 0 ? <div className="crm-empty">No enquiries found. Create your first enquiry.</div> :
      <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>ENQUIRY NO.</th><th>DATE</th><th>CUSTOMER</th><th>SUBJECT / REQUIREMENT</th><th>VALUE</th><th>STATUS</th><th>FOLLOW-UP</th><th>ACTIONS</th></tr></thead>
        <tbody>{visible.map(r=><tr key={r.id}><td><b>{r.enquiry_no}</b></td><td>{r.enquiry_date}</td><td>{r.customer_name || "—"}</td><td><b>{r.subject}</b><small className="crm-subtext">{r.product_requirement}</small></td><td>{r.estimated_value ? `₹ ${r.estimated_value}` : "—"}</td><td><span className="crm-status active">{r.status}</span></td><td>{r.next_follow_up || "—"}</td><td><div className="crm-actions"><button title="Edit" onClick={()=>openEdit(r)}><Pencil size={15}/></button><button title={r.is_active ? "Deactivate" : "Activate"} onClick={()=>toggle(r)}><Power size={15}/></button></div></td></tr>)}</tbody></table></div>}
    </section>
    <div className="crm-count">{visible.length} enquiry(s)</div>
    {modal && <div className="crm-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false);}}>
      <form className="crm-modal" onSubmit={save}>
        <div className="crm-modal-head"><div><h2>{editing ? "Edit Enquiry" : "New Enquiry"}</h2><p>Record the customer's requirement and next action.</p></div><button type="button" onClick={()=>setModal(false)}><X/></button></div>
        <div className="crm-form-grid">
          <label>Enquiry Number *<input required value={form.enquiry_no} onChange={e=>setForm({...form,enquiry_no:e.target.value})}/></label>
          <label>Enquiry Date *<input type="date" required value={form.enquiry_date} onChange={e=>setForm({...form,enquiry_date:e.target.value})}/></label>
          <label className="crm-wide">Customer *<select required value={form.customer_id} onChange={e=>setForm({...form,customer_id:e.target.value})}><option value="">Select customer...</option>{customers.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</select></label>
          <label>Subject *<input required value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/></label>
          <label>Lead Source<select value={form.source} onChange={e=>setForm({...form,source:e.target.value})}><option value="">Select source...</option>{["Website","Phone","Email","Dealer","Referral","Exhibition","Walk-in","Other"].map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="crm-wide">Product / Requirement<textarea rows="2" value={form.product_requirement} onChange={e=>setForm({...form,product_requirement:e.target.value})}/></label>
          <label>Estimated Value (INR)<input type="number" min="0" step="0.01" value={form.estimated_value} onChange={e=>setForm({...form,estimated_value:e.target.value})}/></label>
          <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(v=><option key={v}>{v}</option>)}</select></label>
          <label>Next Follow-up<input type="date" value={form.next_follow_up} onChange={e=>setForm({...form,next_follow_up:e.target.value})}/></label>
          <label>Assigned To<input value={form.owner} onChange={e=>setForm({...form,owner:e.target.value})}/></label>
          <label className="crm-wide">Notes<textarea rows="3" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
        </div>
        <div className="crm-modal-actions"><button type="button" className="crm-secondary" onClick={()=>setModal(false)}>Cancel</button><button className="crm-primary" disabled={saving}>{saving ? "Saving..." : "Save Enquiry"}</button></div>
      </form>
    </div>}
  </div>;
}
