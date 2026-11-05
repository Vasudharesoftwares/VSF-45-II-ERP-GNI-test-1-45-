import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, RefreshCw, Pencil, Printer, X, Trash2 } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning } from "./utils/alerts";
import "./CRM.css";

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = () => ({
  product_id: "", sku: "", description: "", unit: "Nos",
  quantity: "1", unit_price: "0", discount_percent: "0",
  tax_rate: "18", tax_inclusive: false
});
const blankForm = () => ({
  customer_id: "", enquiry_id: "", quote_no: `QT-${Date.now()}`,
  quote_date: today(), valid_until: "", currency: "INR",
  terms: "Prices are valid until the quotation validity date. Delivery as mutually agreed.",
  notes: "", lines: [blankLine()]
});
const money = value => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const statuses = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

export default function Quotations() {
  const [companyId, setCompanyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [printing, setPrinting] = useState(null);

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
    }).catch(error => showError("Company could not be loaded", error.message));
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [quotes, customerRows, productRows, enquiryRows] = await Promise.all([
        request(`/api/crm/companies/${companyId}/quotations`),
        request(`/api/crm/companies/${companyId}/customers?active=true`),
        request(`/api/core/companies/${companyId}/products?active=true`),
        request(`/api/crm/companies/${companyId}/enquiries`)
      ]);
      setRows(quotes);
      setCustomers(customerRows);
      setProducts(productRows.items || []);
      setEnquiries(enquiryRows);
    } catch (error) {
      showError("Could not load quotations", error.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const selectedEnquiries = useMemo(
    () => enquiries.filter(row => String(row.customer_id) === String(form.customer_id)),
    [enquiries, form.customer_id]
  );

  const updateField = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const updateLine = (index, key, value) => {
    setForm(current => ({
      ...current,
      lines: current.lines.map((line, i) => i === index ? { ...line, [key]: value } : line)
    }));
  };

  const chooseProduct = (index, productId) => {
    const product = products.find(item => String(item.id) === String(productId));
    setForm(current => ({
      ...current,
      lines: current.lines.map((line, i) => i !== index ? line : product ? {
        ...line,
        product_id: String(product.id),
        sku: product.sku,
        description: product.name,
        unit_price: String(product.selling_price),
        tax_rate: String(product.tax_rate),
        tax_inclusive: Boolean(product.tax_inclusive)
      } : { ...line, product_id: "" })
    }));
  };

  const totals = useMemo(() => form.lines.reduce((acc, line) => {
    const qty = Number(line.quantity || 0);
    const rate = Number(line.unit_price || 0);
    const discountPercent = Number(line.discount_percent || 0);
    const taxRate = Number(line.tax_rate || 0);
    const base = qty * rate;
    const discount = base * discountPercent / 100;
    const afterDiscount = base - discount;
    const taxable = line.tax_inclusive && taxRate > 0
      ? afterDiscount / (1 + taxRate / 100) : afterDiscount;
    const tax = line.tax_inclusive ? afterDiscount - taxable : taxable * taxRate / 100;
    const total = line.tax_inclusive ? afterDiscount : taxable + tax;
    acc.subtotal += base;
    acc.discount += discount;
    acc.tax += tax;
    acc.total += total;
    return acc;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 }), [form.lines]);

  const openNew = () => {
    setEditing(null);
    setForm(blankForm());
    setModal(true);
  };

  const openEdit = row => {
    if (["Accepted", "Converted"].includes(row.status)) {
      showWarning("Quotation locked", "Accepted or converted quotations cannot be edited.");
      return;
    }
    setEditing(row.id);
    setForm({
      customer_id: String(row.customer_id),
      enquiry_id: row.enquiry_id ? String(row.enquiry_id) : "",
      quote_no: row.quote_no,
      quote_date: row.quote_date,
      valid_until: row.valid_until || "",
      currency: row.currency || "INR",
      terms: row.terms || "",
      notes: row.notes || "",
      lines: row.lines.map(line => ({
        product_id: line.product_id ? String(line.product_id) : "",
        sku: line.sku || "",
        description: line.description,
        unit: line.unit || "Nos",
        quantity: String(line.quantity),
        unit_price: String(line.unit_price),
        discount_percent: String(line.discount_percent),
        tax_rate: String(line.tax_rate),
        tax_inclusive: Boolean(line.tax_inclusive)
      }))
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
    if (!form.lines.length || form.lines.some(line =>
      !line.description.trim() || Number(line.quantity) <= 0 ||
      Number(line.unit_price) < 0 || Number(line.discount_percent) < 0 ||
      Number(line.discount_percent) > 100 || Number(line.tax_rate) < 0 ||
      Number(line.tax_rate) > 100
    )) {
      showWarning("Invalid line items", "Check descriptions, quantities, rates, discounts and tax rates.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        customer_id: Number(form.customer_id),
        enquiry_id: form.enquiry_id ? Number(form.enquiry_id) : null,
        lines: form.lines.map(line => ({
          ...line,
          product_id: line.product_id ? Number(line.product_id) : null,
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price),
          discount_percent: Number(line.discount_percent),
          tax_rate: Number(line.tax_rate)
        }))
      };
      await request(
        editing ? `/api/crm/quotations/${editing}` : `/api/crm/companies/${companyId}/quotations`,
        { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      setModal(false);
      await load();
      showSuccess("Quotation saved", editing ? "Quotation updated successfully." : "New quotation created.");
    } catch (error) {
      showError("Could not save quotation", error.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row, status) => {
    try {
      await request(`/api/crm/quotations/${row.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status })
      });
      await load();
      showSuccess("Quotation status updated", `${row.quote_no} is now ${status}.`);
    } catch (error) {
      showError("Status update failed", error.message);
    }
  };

  const visible = rows.filter(row =>
    (filter === "All" || row.status === filter) &&
    [row.quote_no, row.customer_name, row.customer_code, row.enquiry_no]
      .some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))
  );

  const printQuote = row => {
    setPrinting(row);
    setTimeout(() => window.print(), 100);
  };

  return <div className="crm-page">
    <div className="crm-heading">
      <div><label>SALES / COMMERCIAL</label><h1>Quotations</h1><p>Create customer quotations with products, discounts and GST.</p></div>
      <button className="crm-primary" onClick={openNew}><Plus size={17}/> Create Quotation</button>
    </div>

    <div className="crm-toolbar">
      <div className="crm-search"><Search size={16}/><input placeholder="Search quotation, customer or enquiry..." value={search} onChange={event => setSearch(event.target.value)}/></div>
      <select value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="All">All statuses</option>
        {statuses.map(status => <option key={status}>{status}</option>)}
      </select>
      <button className="crm-secondary" onClick={load}><RefreshCw size={15}/> Refresh</button>
    </div>

    <div className="crm-panel">
      <div className="crm-table-wrap">
        <table className="crm-table">
          <thead><tr><th>QUOTATION</th><th>CUSTOMER</th><th>DATE</th><th>VALID UNTIL</th><th>AMOUNT (₹)</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="crm-empty">Loading quotations...</td></tr> :
              visible.length === 0 ? <tr><td colSpan="7" className="crm-empty">No quotations found. Create your first quotation.</td></tr> :
              visible.map(row => <tr key={row.id}>
                <td><b>{row.quote_no}</b><small className="crm-subtext">{row.enquiry_no || "No linked enquiry"}</small></td>
                <td><b>{row.customer_name}</b><small className="crm-subtext">{row.customer_code}</small></td>
                <td>{row.quote_date}</td>
                <td>{row.valid_until || "—"}</td>
                <td><b>{money(row.grand_total)}</b></td>
                <td>
                  <select className="crm-status-select" value={row.status} disabled={row.status === "Converted"} onChange={event => changeStatus(row, event.target.value)}>
                    {statuses.map(status => <option key={status}>{status}</option>)}
                    {row.status === "Converted" && <option>Converted</option>}
                  </select>
                </td>
                <td><div className="crm-actions">
                  <button title="Print quotation" onClick={() => printQuote(row)}><Printer size={15}/></button>
                  <button title="Edit quotation" onClick={() => openEdit(row)}><Pencil size={15}/></button>
                </div></td>
              </tr>)
            }
          </tbody>
        </table>
      </div>
    </div>
    <div className="crm-count">{visible.length} quotation(s) shown</div>

    {modal && <div className="crm-backdrop">
      <form className="crm-modal quotation-modal" onSubmit={save}>
        <div className="crm-modal-head">
          <div><h2>{editing ? "Edit Quotation" : "Create Quotation"}</h2><p>Enter customer details and quotation line items.</p></div>
          <button type="button" onClick={() => setModal(false)}><X size={18}/></button>
        </div>

        <div className="crm-form-grid">
          <label>Quotation Number<input required value={form.quote_no} onChange={event => updateField("quote_no", event.target.value)}/></label>
          <label>Quotation Date<input required type="date" value={form.quote_date} onChange={event => updateField("quote_date", event.target.value)}/></label>
          <label>Customer<select required value={form.customer_id} onChange={event => { updateField("customer_id", event.target.value); updateField("enquiry_id", ""); }}>
            <option value="">Select customer</option>
            {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.code} — {customer.name}</option>)}
          </select></label>
          <label>Related Enquiry<select value={form.enquiry_id} onChange={event => updateField("enquiry_id", event.target.value)}>
            <option value="">No linked enquiry</option>
            {selectedEnquiries.map(enquiry => <option key={enquiry.id} value={enquiry.id}>{enquiry.enquiry_no} — {enquiry.subject}</option>)}
          </select></label>
          <label>Valid Until<input type="date" value={form.valid_until} onChange={event => updateField("valid_until", event.target.value)}/></label>
          <label>Currency<select value={form.currency} onChange={event => updateField("currency", event.target.value)}><option>INR</option><option>USD</option><option>EUR</option></select></label>
        </div>

        <div className="quotation-lines-heading"><h3>Quotation Items</h3><button type="button" className="crm-secondary" onClick={() => updateField("lines", [...form.lines, blankLine()])}><Plus size={14}/> Add line</button></div>
        {form.lines.map((line, index) => <div className="quotation-line-editor" key={index}>
          <div className="quotation-line-top"><b>Item {index + 1}</b>{form.lines.length > 1 && <button type="button" onClick={() => updateField("lines", form.lines.filter((_, i) => i !== index))}><Trash2 size={14}/> Remove</button>}</div>
          <div className="crm-form-grid">
            <label className="crm-wide">Catalogue Product (optional)<select value={line.product_id} onChange={event => chooseProduct(index, event.target.value)}>
              <option value="">Custom description / service</option>
              {products.map(product => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
            </select></label>
            <label className="crm-wide">Description<input required value={line.description} onChange={event => updateLine(index, "description", event.target.value)}/></label>
            <label>SKU<input value={line.sku} onChange={event => updateLine(index, "sku", event.target.value)}/></label>
            <label>Unit<input value={line.unit} onChange={event => updateLine(index, "unit", event.target.value)}/></label>
            <label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={event => updateLine(index, "quantity", event.target.value)}/></label>
            <label>Unit Price<input required type="number" min="0" step="0.01" value={line.unit_price} onChange={event => updateLine(index, "unit_price", event.target.value)}/></label>
            <label>Discount %<input type="number" min="0" max="100" step="0.01" value={line.discount_percent} onChange={event => updateLine(index, "discount_percent", event.target.value)}/></label>
            <label>GST %<input type="number" min="0" max="100" step="0.01" value={line.tax_rate} onChange={event => updateLine(index, "tax_rate", event.target.value)}/></label>
          </div>
        </div>)}

        <div className="quotation-total-preview">
          <div><span>Subtotal</span><b>₹ {money(totals.subtotal)}</b></div>
          <div><span>Discount</span><b>₹ {money(totals.discount)}</b></div>
          <div><span>GST</span><b>₹ {money(totals.tax)}</b></div>
          <div className="quotation-grand-total"><span>Grand Total</span><b>₹ {money(totals.total)}</b></div>
        </div>

        <div className="crm-form-grid quotation-extra">
          <label className="crm-wide">Terms & Conditions<textarea rows="3" value={form.terms} onChange={event => updateField("terms", event.target.value)}/></label>
          <label className="crm-wide">Internal / Customer Notes<textarea rows="2" value={form.notes} onChange={event => updateField("notes", event.target.value)}/></label>
        </div>
        <div className="crm-modal-actions">
          <button type="button" className="crm-secondary" onClick={() => setModal(false)}>Cancel</button>
          <button type="submit" className="crm-primary" disabled={saving}>{saving ? "Saving..." : "Save Quotation"}</button>
        </div>
      </form>
    </div>}

    {printing && <div className="quotation-print-area">
      <div className="quotation-print-header">
        <div><h1>QUOTATION</h1><p>Quotation No: <b>{printing.quote_no}</b></p><p>Date: {printing.quote_date} {printing.valid_until ? ` · Valid until: ${printing.valid_until}` : ""}</p></div>
        <div className="quotation-print-company"><h2>Vasudhare Softwares</h2><p>Quotation / Commercial Offer</p></div>
      </div>
      <hr/>
      <h3>Quotation To</h3>
      <b>{printing.customer_name}</b>
      <p>{printing.customer_billing_address}</p>
      <p>{printing.customer_phone} {printing.customer_email}</p>
      {printing.customer_tax_id && <p>GSTIN: {printing.customer_tax_id}</p>}
      <table className="quotation-print-table">
        <thead><tr><th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th>Discount</th><th>GST</th><th>Total</th></tr></thead>
        <tbody>{printing.lines.map((line, index) => <tr key={line.id || index}>
          <td>{index + 1}</td><td>{line.description}<small>{line.sku}</small></td>
          <td>{line.quantity} {line.unit}</td><td>{money(line.unit_price)}</td>
          <td>{line.discount_percent}%</td><td>{line.tax_rate}%</td><td>{money(line.line_total)}</td>
        </tr>)}</tbody>
      </table>
      <div className="quotation-print-totals">
        <p>Subtotal: ₹ {money(printing.subtotal)}</p>
        <p>Discount: ₹ {money(printing.discount_total)}</p>
        <p>GST: ₹ {money(printing.tax_total)}</p>
        <h2>Grand Total: ₹ {money(printing.grand_total)}</h2>
      </div>
      <h3>Terms & Conditions</h3><p>{printing.terms}</p>
      {printing.notes && <><h3>Notes</h3><p>{printing.notes}</p></>}
      <div className="quotation-print-footer"><span>Customer Acceptance</span><span>Authorised Signatory</span></div>
    </div>}
  </div>;
}
