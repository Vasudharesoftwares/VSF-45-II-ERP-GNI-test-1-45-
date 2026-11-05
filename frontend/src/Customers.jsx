import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, RefreshCw, Pencil, Power, Download, Upload, FileSpreadsheet, X } from "lucide-react";
import * as XLSX from "xlsx";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";
import "./CRM.css";

const blank = { code: "", name: "", email: "", phone: "", tax_id: "", billing_address: "", shipping_address: "" };

export default function Customers() {
  const [companyId, setCompanyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
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
      const data = await request(`/api/crm/companies/${companyId}/customers`);
      setRows(data);
    } catch (e) {
      showError("Could not load customers", e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(blank); setModal(true); };
  const openEdit = row => {
    setEditing(row.id);
    setForm(Object.fromEntries(Object.keys(blank).map(k => [k, row[k] || ""])));
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
      await request(editing ? `/api/crm/customers/${editing}` : `/api/crm/companies/${companyId}/customers`, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(form)
      });
      setModal(false);
      await load();
      showSuccess("Customer saved", editing ? "Customer details updated." : "New customer created.");
    } catch (err) {
      showError("Could not save customer", err.message);
    } finally { setSaving(false); }
  };

  const toggle = async row => {
    const action = row.is_active ? "deactivate" : "activate";
    const yes = await showConfirm(`${action === "deactivate" ? "Deactivate" : "Activate"} customer?`, `${row.name} (${row.code})`, `Yes, ${action}`);
    if (!yes) return;
    try {
      await request(`/api/crm/customers/${row.id}/${action}`, { method: "PATCH" });
      await load();
      showSuccess("Customer updated", `${row.name} is now ${action}d.`);
    } catch (e) { showError("Status update failed", e.message); }
  };

  const visible = rows.filter(r =>
    (filter === "all" || (filter === "active" ? r.is_active : !r.is_active)) &&
    [r.code, r.name, r.email, r.phone, r.tax_id].some(v => String(v || "").toLowerCase().includes(search.toLowerCase()))
  );

  const download = (data, name) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, name);
  };

  const exportExcel = () => {
    download(visible.map(({ code, name, email, phone, tax_id, billing_address, shipping_address, is_active }) =>
      ({ code, name, email, phone, tax_id, billing_address, shipping_address, is_active: is_active ? "Yes" : "No" })
    ), "Customers.xlsx");
  };

  const importExcel = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!data.length) return showWarning("Empty spreadsheet", "The selected Excel file has no customer rows.");
      let created = 0, skipped = 0;
      const existing = new Set(rows.map(r => String(r.code).toUpperCase()));
      for (const item of data) {
        const code = String(item.code || item.Code || "").trim().toUpperCase();
        const name = String(item.name || item.Name || "").trim();
        if (!code || !name || existing.has(code)) { skipped++; continue; }
        try {
          await request(`/api/crm/companies/${companyId}/customers`, {
            method: "POST",
            body: JSON.stringify({
              code, name,
              email: String(item.email || item.Email || ""),
              phone: String(item.phone || item.Phone || ""),
              tax_id: String(item.tax_id || item.GSTIN || ""),
              billing_address: String(item.billing_address || item.Billing_Address || ""),
              shipping_address: String(item.shipping_address || item.Shipping_Address || "")
            })
          });
          existing.add(code);
          created++;
        } catch { skipped++; }
      }
      await load();
      showSuccess("Import completed", `${created} customer(s) imported. ${skipped} row(s) skipped.`);
    } catch (err) { showError("Excel import failed", err.message); }
  };

  return <div className="crm-page">
    <div className="crm-heading">
      <div><label>CRM / MASTER DATA</label><h1>Customers</h1><p>Manage customer accounts and contact information.</p></div>
      <button className="crm-primary" onClick={openNew}><Plus size={17}/> Add Customer</button>
    </div>
    <div className="crm-toolbar">
      <div className="crm-search"><Search size={17}/><input placeholder="Search code, name, phone, email or GSTIN..." value={search} onChange={e => setSearch(e.target.value)}/></div>
      <select value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All customers</option></select>
      <button className="crm-secondary" onClick={load}><RefreshCw size={15}/> Refresh</button>
      <button className="crm-secondary" onClick={exportExcel}><Download size={15}/> Export</button>
      <button className="crm-secondary" onClick={() => download([{code:"CUST-001",name:"Example Customer",email:"",phone:"",tax_id:"",billing_address:"",shipping_address:""}], "Customer_Template.xlsx")}><FileSpreadsheet size={15}/> Template</button>
      <button className="crm-secondary" onClick={() => fileRef.current?.click()}><Upload size={15}/> Import</button>
      <input ref={fileRef} hidden type="file" accept=".xlsx,.xls" onChange={importExcel}/>
    </div>
    <section className="crm-panel">
      {loading ? <div className="crm-empty">Loading customers...</div> : visible.length === 0 ? <div className="crm-empty">No customers found. Add a customer or change your search.</div> :
        <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>CODE</th><th>CUSTOMER</th><th>PHONE</th><th>EMAIL</th><th>GST / TAX ID</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>{visible.map(r => <tr key={r.id}><td><b>{r.code}</b></td><td>{r.name}</td><td>{r.phone || "—"}</td><td>{r.email || "—"}</td><td>{r.tax_id || "—"}</td><td><span className={`crm-status ${r.is_active ? "active" : "inactive"}`}>{r.is_active ? "Active" : "Inactive"}</span></td>
            <td><div className="crm-actions"><button title="Edit" onClick={() => openEdit(r)}><Pencil size={15}/></button><button title={r.is_active ? "Deactivate" : "Activate"} onClick={() => toggle(r)}><Power size={15}/></button></div></td></tr>)}</tbody></table></div>}
    </section>
    <div className="crm-count">{visible.length} customer(s)</div>
    {modal && <div className="crm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}>
      <form className="crm-modal" onSubmit={save}>
        <div className="crm-modal-head"><div><h2>{editing ? "Edit Customer" : "Add Customer"}</h2><p>Enter customer master details.</p></div><button type="button" onClick={() => setModal(false)}><X/></button></div>
        <div className="crm-form-grid">
          <label>Customer Code *<input required value={form.code} onChange={e => setForm({...form, code:e.target.value})}/></label>
          <label>Customer Name *<input required value={form.name} onChange={e => setForm({...form, name:e.target.value})}/></label>
          <label>Email<input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})}/></label>
          <label>Phone<input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}/></label>
          <label>GST / Tax ID<input value={form.tax_id} onChange={e => setForm({...form, tax_id:e.target.value})}/></label>
          <label className="crm-wide">Billing Address<textarea rows="2" value={form.billing_address} onChange={e => setForm({...form, billing_address:e.target.value})}/></label>
          <label className="crm-wide">Shipping Address<textarea rows="2" value={form.shipping_address} onChange={e => setForm({...form, shipping_address:e.target.value})}/></label>
        </div>
        <div className="crm-modal-actions"><button type="button" className="crm-secondary" onClick={() => setModal(false)}>Cancel</button><button className="crm-primary" disabled={saving}>{saving ? "Saving..." : "Save Customer"}</button></div>
      </form>
    </div>}
  </div>;
}
