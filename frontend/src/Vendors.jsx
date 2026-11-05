import React, { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Search, RefreshCw, Pencil, X, Building2 } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError } from "./utils/alerts";
import "./Vendors.css";

const emptyForm = {
  code: "", name: "", email: "", phone: "", tax_id: "",
  billing_address: "", shipping_address: "", contact_person: "",
  payment_terms: "Immediate", credit_limit: "0",
  bank_name: "", bank_account: "", ifsc: "", notes: ""
};

async function request(path, options = {}) {
  const response = await apiFetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed.");
  return data;
}

export default function Vendors() {
  const [companyId, setCompanyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await request(`/api/purchase/companies/${id}/vendors`);
      setRows(data.items || []);
    } catch (error) {
      showError("Could not load vendors", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    request("/api/auth/me")
      .then(data => {
        const id = data.company_id || data.user?.company_id;
        if (!id) throw new Error("No active company is assigned to this account.");
        setCompanyId(id);
        load(id);
      })
      .catch(error => showError("Company information unavailable", error.message));
  }, [load]);

  const filtered = rows.filter(row =>
    [row.code, row.name, row.phone, row.email, row.tax_id]
      .some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))
  );

  const change = (field, value) => setForm(old => ({ ...old, [field]: value }));

  const startNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = row => {
    setEditing(row.id);
    setForm(Object.fromEntries(
      Object.keys(emptyForm).map(key => [key, row[key] ?? emptyForm[key]])
    ));
    setShowForm(true);
  };

  const save = async event => {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      showError("Required fields missing", "Enter both vendor code and vendor name.");
      return;
    }
    if (Number(form.credit_limit) < 0 || !Number.isFinite(Number(form.credit_limit))) {
      showError("Invalid credit limit", "Enter a valid non-negative credit limit.");
      return;
    }

    try {
      const path = editing
        ? `/api/purchase/vendors/${editing}`
        : `/api/purchase/companies/${companyId}/vendors`;

      await request(path, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ ...form, credit_limit: Number(form.credit_limit) })
      });
      showSuccess(editing ? "Vendor updated" : "Vendor created");
      setShowForm(false);
      setForm(emptyForm);
      setEditing(null);
      await load(companyId);
    } catch (error) {
      showError("Could not save vendor", error.message);
    }
  };

  const toggleStatus = async row => {
    const action = row.is_active ? "deactivate" : "activate";
    const result = await Swal.fire({
      title: `${action === "deactivate" ? "Deactivate" : "Activate"} vendor?`,
      text: `${row.name} will be ${action}d.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: action === "deactivate" ? "Deactivate" : "Activate"
    });
    if (!result.isConfirmed) return;

    try {
      await request(`/api/purchase/vendors/${row.id}/${action}`, { method: "PATCH" });
      showSuccess(`Vendor ${action}d`);
      await load(companyId);
    } catch (error) {
      showError("Status update failed", error.message);
    }
  };

  return (
    <div className="vendors-page">
      <div className="vendors-heading">
        <div>
          <div className="vendors-eyebrow">PURCHASE MANAGEMENT</div>
          <h1><Building2 size={25}/> Vendors</h1>
          <p>Manage suppliers, contacts, payment terms and vendor details.</p>
        </div>
        <button className="vendor-primary" onClick={startNew}><Plus size={17}/> Add Vendor</button>
      </div>

      <div className="vendors-toolbar">
        <div className="vendor-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code, name, phone or email"/></div>
        <button className="vendor-secondary" onClick={() => load(companyId)} disabled={loading}><RefreshCw size={16}/> Refresh</button>
        <span>{filtered.length} vendors</span>
      </div>

      {showForm && (
        <form className="vendor-form" onSubmit={save}>
          <div className="vendor-form-heading">
            <h2>{editing ? "Edit Vendor" : "New Vendor"}</h2>
            <button type="button" className="vendor-icon-button" onClick={() => setShowForm(false)}><X size={18}/></button>
          </div>
          <div className="vendor-fields">
            {[
              ["code","Vendor Code *"],["name","Vendor Name *"],["contact_person","Contact Person"],
              ["phone","Phone"],["email","Email"],["tax_id","GSTIN / Tax ID"],
              ["payment_terms","Payment Terms"],["credit_limit","Credit Limit"],
              ["bank_name","Bank Name"],["bank_account","Bank Account"],["ifsc","IFSC"]
            ].map(([key,label]) => (
              <label key={key}>{label}
                <input value={form[key]} onChange={e => change(key,e.target.value)}
                  type={key === "credit_limit" ? "number" : key === "email" ? "email" : "text"}
                  min={key === "credit_limit" ? "0" : undefined}
                  step={key === "credit_limit" ? "0.01" : undefined}
                  required={key === "code" || key === "name"}/>
              </label>
            ))}
            <label className="vendor-wide">Billing Address<textarea value={form.billing_address} onChange={e => change("billing_address",e.target.value)}/></label>
            <label className="vendor-wide">Shipping Address<textarea value={form.shipping_address} onChange={e => change("shipping_address",e.target.value)}/></label>
            <label className="vendor-wide">Notes<textarea value={form.notes} onChange={e => change("notes",e.target.value)}/></label>
          </div>
          <div className="vendor-form-actions">
            <button type="button" className="vendor-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="vendor-primary" type="submit">Save Vendor</button>
          </div>
        </form>
      )}

      <div className="vendors-table-wrap">
        <table className="vendors-table">
          <thead><tr><th>Code</th><th>Vendor</th><th>Contact</th><th>Phone</th><th>Payment Terms</th><th>Credit Limit</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(row => (
              <tr key={row.id}>
                <td><b>{row.code}</b></td>
                <td><b>{row.name}</b><small>{row.email || "—"}</small></td>
                <td>{row.contact_person || "—"}</td>
                <td>{row.phone || "—"}</td>
                <td>{row.payment_terms || "Immediate"}</td>
                <td>{Number(row.credit_limit || 0).toLocaleString("en-IN",{style:"currency",currency:"INR"})}</td>
                <td><span className={row.is_active ? "vendor-status active" : "vendor-status inactive"}>{row.is_active ? "Active" : "Inactive"}</span></td>
                <td><div className="vendor-row-actions">
                  <button title="Edit" onClick={() => startEdit(row)}><Pencil size={16}/></button>
                  <button title={row.is_active ? "Deactivate" : "Activate"} onClick={() => toggleStatus(row)}>{row.is_active ? "Deactivate" : "Activate"}</button>
                </div></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan="8" className="vendor-empty">{loading ? "Loading vendors…" : "No vendors found. Add your first vendor to get started."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
