import React, { useCallback, useEffect, useState } from "react";
import { Plus, Search, RefreshCw, Pencil, PhoneCall } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning } from "./utils/alerts";
import "./CRM.css";

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const blank = () => ({
  customer_id: "",
  enquiry_id: "",
  call_date: nowLocal(),
  direction: "Outgoing",
  contact_person: "",
  phone: "",
  outcome: "Connected",
  duration_minutes: "",
  next_follow_up: "",
  assigned_to: "",
  remarks: ""
});

const outcomes = [
  "Connected", "No Answer", "Busy", "Call Back Requested",
  "Interested", "Not Interested", "Meeting Scheduled",
  "Quotation Requested", "Converted"
];

export default function Calling() {
  const [companyId, setCompanyId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank());

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  };

  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/me").then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to identify company.");
      if (alive) setCompanyId(data.company_id);
    }).catch(error => showError("Unable to load company", error.message));
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [calls, customerRows, enquiryRows] = await Promise.all([
        request(`/api/crm/companies/${companyId}/calls`),
        request(`/api/crm/companies/${companyId}/customers`),
        request(`/api/crm/companies/${companyId}/enquiries`)
      ]);
      setRows(calls);
      setCustomers(customerRows.filter(c => c.is_active));
      setEnquiries(enquiryRows.filter(e => e.is_active));
    } catch (error) {
      showError("Could not load calling records", error.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const setField = (key, value) => setForm(old => ({
    ...old,
    [key]: value,
    ...(key === "customer_id" ? { enquiry_id: "" } : {})
  }));

  const openNew = () => {
    setEditing(null);
    setForm(blank());
    setModal(true);
  };

  const openEdit = row => {
    setEditing(row.id);
    setForm({
      customer_id: String(row.customer_id),
      enquiry_id: row.enquiry_id ? String(row.enquiry_id) : "",
      call_date: row.call_date || nowLocal(),
      direction: row.direction || "Outgoing",
      contact_person: row.contact_person || "",
      phone: row.phone || "",
      outcome: row.outcome || "Connected",
      duration_minutes: row.duration_minutes ?? "",
      next_follow_up: row.next_follow_up || "",
      assigned_to: row.assigned_to || "",
      remarks: row.remarks || ""
    });
    setModal(true);
  };

  const save = async event => {
    event.preventDefault();
    if (saving) return;
    if (!event.currentTarget.checkValidity()) {
      showWarning("Check required fields", "Please complete the highlighted fields.");
      event.currentTarget.reportValidity();
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        customer_id: Number(form.customer_id),
        enquiry_id: form.enquiry_id ? Number(form.enquiry_id) : null,
        duration_minutes: form.duration_minutes === "" ? null : Number(form.duration_minutes)
      };
      await request(
        editing ? `/api/crm/calls/${editing}` : `/api/crm/companies/${companyId}/calls`,
        { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      setModal(false);
      await load();
      showSuccess("Call record saved", editing ? "Call record updated." : "Call activity recorded.");
    } catch (error) {
      showError("Could not save call", error.message);
    } finally {
      setSaving(false);
    }
  };

  const visible = rows.filter(row =>
    [row.customer_name, row.customer_code, row.enquiry_no, row.phone,
      row.contact_person, row.outcome, row.remarks, row.assigned_to]
      .some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))
  );

  const due = rows.filter(row => row.next_follow_up &&
    row.next_follow_up.slice(0, 10) <= nowLocal().slice(0, 10)).length;

  const customerEnquiries = enquiries.filter(e => String(e.customer_id) === String(form.customer_id));

  return <div className="crm-page">
    <div className="crm-heading">
      <div>
        <label>CRM / CUSTOMER RELATIONSHIP</label>
        <h1>Calling & Follow-ups</h1>
        <p>Record customer calls, outcomes and the next sales action.</p>
      </div>
      <button className="crm-primary" onClick={openNew}><Plus size={17}/> Log Call</button>
    </div>

    <div className="crm-toolbar">
      <div className="crm-search">
        <Search size={17}/>
        <input placeholder="Search customer, phone, enquiry or remarks..." value={search}
          onChange={e => setSearch(e.target.value)}/>
      </div>
      <button className="crm-secondary" onClick={load}><RefreshCw size={15}/> Refresh</button>
    </div>

    <div className="crm-count">
      <b>{rows.length}</b> call record(s) &nbsp;·&nbsp;
      <b>{due}</b> follow-up(s) due or overdue
    </div>

    <section className="crm-panel">
      {loading ? <div className="crm-empty">Loading call records...</div> :
       visible.length === 0 ? <div className="crm-empty">No calls recorded yet. Click Log Call to record your first customer conversation.</div> :
       <div className="crm-table-wrap">
         <table className="crm-table">
           <thead><tr>
             <th>DATE / TIME</th><th>CUSTOMER</th><th>PHONE / CONTACT</th>
             <th>DIRECTION</th><th>OUTCOME</th><th>ENQUIRY</th>
             <th>NEXT FOLLOW-UP</th><th>SALESPERSON</th><th>ACTIONS</th>
           </tr></thead>
           <tbody>{visible.map(row => <tr key={row.id}>
             <td>{String(row.call_date || "").replace("T", " ")}</td>
             <td><b>{row.customer_name || "—"}</b><small className="crm-subtext">{row.customer_code}</small></td>
             <td>{row.phone || "—"}<small className="crm-subtext">{row.contact_person}</small></td>
             <td>{row.direction}</td>
             <td><span className="crm-status active">{row.outcome}</span></td>
             <td>{row.enquiry_no || "—"}</td>
             <td>{row.next_follow_up || "—"}</td>
             <td>{row.assigned_to || "—"}</td>
             <td><div className="crm-actions">
               <button title="Edit call" onClick={() => openEdit(row)}><Pencil size={15}/></button>
             </div></td>
           </tr>)}</tbody>
         </table>
       </div>}
    </section>

    {modal && <div className="crm-backdrop" onMouseDown={e => {
      if (e.target === e.currentTarget) setModal(false);
    }}>
      <form className="crm-modal" onSubmit={save}>
        <div className="crm-modal-head">
          <div><h2>{editing ? "Edit Call Record" : "Log Customer Call"}</h2>
            <p>Keep a record of the conversation and schedule the next action.</p></div>
          <button type="button" onClick={() => setModal(false)}>×</button>
        </div>
        <div className="crm-form-grid">
          <label className="crm-wide">Customer *
            <select required value={form.customer_id} onChange={e => setField("customer_id", e.target.value)}>
              <option value="">Select customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          <label>Related Enquiry
            <select value={form.enquiry_id} onChange={e => setField("enquiry_id", e.target.value)}>
              <option value="">No linked enquiry</option>
              {customerEnquiries.map(enq => <option key={enq.id} value={enq.id}>{enq.enquiry_no} — {enq.subject}</option>)}
            </select>
          </label>
          <label>Call Date & Time *
            <input type="datetime-local" required value={form.call_date}
              onChange={e => setField("call_date", e.target.value)}/>
          </label>
          <label>Call Direction *
            <select value={form.direction} onChange={e => setField("direction", e.target.value)}>
              <option>Outgoing</option><option>Incoming</option>
            </select>
          </label>
          <label>Contact Person
            <input value={form.contact_person} onChange={e => setField("contact_person", e.target.value)}/>
          </label>
          <label>Phone Number
            <input value={form.phone} onChange={e => setField("phone", e.target.value)}/>
          </label>
          <label>Call Outcome *
            <select value={form.outcome} onChange={e => setField("outcome", e.target.value)}>
              {outcomes.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Duration (minutes)
            <input type="number" min="0" value={form.duration_minutes}
              onChange={e => setField("duration_minutes", e.target.value)}/>
          </label>
          <label>Next Follow-up
            <input type="date" value={form.next_follow_up}
              onChange={e => setField("next_follow_up", e.target.value)}/>
          </label>
          <label>Assigned Salesperson
            <input value={form.assigned_to} onChange={e => setField("assigned_to", e.target.value)}/>
          </label>
          <label className="crm-wide">Call Remarks / Customer Requirement
            <textarea rows="4" value={form.remarks}
              onChange={e => setField("remarks", e.target.value)}
              placeholder="What did the customer say? What action is required?"/>
          </label>
        </div>
        <div className="crm-modal-actions">
          <button type="button" className="crm-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button type="submit" className="crm-primary" disabled={saving}>
            <PhoneCall size={16}/> {saving ? "Saving..." : "Save Call"}
          </button>
        </div>
      </form>
    </div>}
  </div>;
}
