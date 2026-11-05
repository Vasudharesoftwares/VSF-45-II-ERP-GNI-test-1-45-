import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, RefreshCw, Pencil, Printer, X, Trash2, FileCheck2 } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning } from "./utils/alerts";
import "./SalesOrders.css";

const today = () => new Date().toISOString().slice(0, 10);
const statuses = ["Confirmed", "In Production", "Ready for Dispatch", "Dispatched", "Completed", "On Hold", "Cancelled"];

const blankLine = () => ({
  product_id: "", sku: "", description: "", unit: "Nos",
  quantity: "1", unit_price: "0", discount_percent: "0",
  tax_rate: "18", tax_inclusive: false
});

const blankForm = () => ({
  customer_id: "", enquiry_id: "", order_no: `SO-${Date.now()}`,
  order_date: today(), promised_date: "", currency: "INR",
  terms: "Delivery as mutually agreed.",
  notes: "", lines: [blankLine()]
});

const money = value => Number(value || 0).toLocaleString("en-IN", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

export default function SalesOrders() {
  const [companyId, setCompanyId] = useState(null);
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [conversionQuoteId, setConversionQuoteId] = useState(null);
  const [form, setForm] = useState(blankForm());

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
      const [orders, customerRows, productRows, enquiryRows, quoteRows] = await Promise.all([
        request(`/api/sales/companies/${companyId}/orders`),
        request(`/api/crm/companies/${companyId}/customers?active=true`),
        request(`/api/core/companies/${companyId}/products?active=true`),
        request(`/api/crm/companies/${companyId}/enquiries`),
        request(`/api/crm/companies/${companyId}/quotations`)
      ]);
      setRows(orders);
      setCustomers(customerRows);
      setProducts(productRows.items || []);
      setEnquiries(enquiryRows);
      setQuotations(quoteRows);
    } catch (error) {
      showError("Could not load sales orders", error.message);
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
        sku: product.sku || "",
        description: product.name,
        unit: product.unit_symbol || product.unit || "Nos",
        unit_price: String(product.selling_price || 0),
        tax_rate: String(product.tax_rate || 0),
        tax_inclusive: Boolean(product.tax_inclusive)
      } : { ...line, product_id: "" })
    }));
  };

  const totals = useMemo(() => form.lines.reduce((acc, line) => {
    const base = Number(line.quantity || 0) * Number(line.unit_price || 0);
    const discount = base * Number(line.discount_percent || 0) / 100;
    const afterDiscount = base - discount;
    const rate = Number(line.tax_rate || 0);
    const taxable = line.tax_inclusive && rate > 0
      ? afterDiscount / (1 + rate / 100) : afterDiscount;
    const tax = line.tax_inclusive ? afterDiscount - taxable : taxable * rate / 100;
    acc.subtotal += base;
    acc.discount += discount;
    acc.tax += tax;
    acc.total += line.tax_inclusive ? afterDiscount : taxable + tax;
    return acc;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 }), [form.lines]);

  const openNew = () => {
    setEditing(null);
    setConversionQuoteId(null);
    setForm(blankForm());
    setModal(true);
  };

  const openEdit = row => {
    if (row.quotation_id) {
      showWarning("Quotation order locked", "Orders converted from quotations cannot be edited.");
      return;
    }
    setEditing(row.id);
    setConversionQuoteId(null);
    setForm({
      customer_id: String(row.customer_id),
      enquiry_id: row.enquiry_id ? String(row.enquiry_id) : "",
      order_no: row.order_no,
      order_date: row.order_date,
      promised_date: row.promised_date || "",
      currency: row.currency || "INR",
      terms: row.terms || "",
      notes: row.notes || "",
      lines: (row.lines || []).map(line => ({
        product_id: line.product_id ? String(line.product_id) : "",
        sku: line.sku || "",
        description: line.description || "",
        unit: line.unit || "Nos",
        quantity: String(line.quantity),
        unit_price: String(line.unit_price),
        discount_percent: String(line.discount_percent || 0),
        tax_rate: String(line.tax_rate || 0),
        tax_inclusive: Boolean(line.tax_inclusive)
      }))
    });
    setModal(true);
  };

  const chooseQuotation = quoteId => {
    const quote = quotations.find(item => String(item.id) === String(quoteId));
    if (!quote) {
      setConversionQuoteId(null);
      return;
    }
    if (quote.status !== "Accepted") {
      showWarning("Quotation not accepted", "Only accepted quotations can be converted.");
      return;
    }
    setConversionQuoteId(quote.id);
    setForm(current => ({
      ...current,
      customer_id: String(quote.customer_id),
      enquiry_id: quote.enquiry_id ? String(quote.enquiry_id) : "",
      currency: quote.currency || "INR",
      terms: quote.terms || "",
      notes: quote.notes || "",
      lines: (quote.lines || []).map(line => ({
        product_id: line.product_id ? String(line.product_id) : "",
        sku: line.sku || "",
        description: line.description || "",
        unit: line.unit || "Nos",
        quantity: String(line.quantity),
        unit_price: String(line.unit_price),
        discount_percent: String(line.discount_percent || 0),
        tax_rate: String(line.tax_rate || 0),
        tax_inclusive: Boolean(line.tax_inclusive)
      }))
    }));
  };

  const save = async event => {
    event.preventDefault();
    if (!form.customer_id) return showWarning("Customer required", "Please select a customer.");
    if (!form.order_no.trim() || !form.order_date) return showWarning("Order details required", "Enter an order number and date.");
    if (!form.lines.length || form.lines.some(line => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.unit_price) < 0)) {
      return showWarning("Check order items", "Every line needs a description, positive quantity and non-negative price.");
    }

    const payload = {
      ...form,
      customer_id: Number(form.customer_id),
      enquiry_id: form.enquiry_id ? Number(form.enquiry_id) : null,
      lines: form.lines.map(line => ({
        ...line,
        product_id: line.product_id ? Number(line.product_id) : null,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
        discount_percent: Number(line.discount_percent || 0),
        tax_rate: Number(line.tax_rate || 0)
      }))
    };

    setSaving(true);
    try {
      if (conversionQuoteId) {
        await request(`/api/sales/companies/${companyId}/orders/from-quotation/${conversionQuoteId}`, {
          method: "POST",
          body: JSON.stringify({
            order_no: form.order_no,
            order_date: form.order_date,
            promised_date: form.promised_date || null
          })
        });
      } else if (editing) {
        await request(`/api/sales/orders/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await request(`/api/sales/companies/${companyId}/orders`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      showSuccess("Sales order saved", "The sales order has been saved successfully.");
      setModal(false);
      setEditing(null);
      setConversionQuoteId(null);
      await load();
    } catch (error) {
      showError("Could not save sales order", error.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (row, status) => {
    try {
      await request(`/api/sales/orders/${row.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      showSuccess("Status updated", `Order ${row.order_no} is now ${status}.`);
      await load();
    } catch (error) {
      showError("Could not update status", error.message);
    }
  };

  const filtered = rows.filter(row => {
    const term = search.toLowerCase();
    const matchesSearch = !term || [
      row.order_no, row.customer_name, row.customer_code, row.quote_no, row.status
    ].some(value => String(value || "").toLowerCase().includes(term));
    return matchesSearch && (filter === "All" || row.status === filter);
  });

  const printOrder = row => {
    const content = `
      <h1>Sales Order</h1>
      <p><b>Order:</b> ${row.order_no} &nbsp; <b>Date:</b> ${row.order_date}</p>
      <p><b>Customer:</b> ${row.customer_name || ""}<br/>
      <b>Phone:</b> ${row.customer_phone || ""}<br/>
      <b>Address:</b> ${row.customer_billing_address || ""}</p>
      <table border="1" cellspacing="0" cellpadding="7" width="100%">
        <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr>
        ${(row.lines || []).map(line => `<tr><td>${line.description}</td><td>${line.quantity} ${line.unit}</td><td>${money(line.unit_price)}</td><td>${money(line.line_total)}</td></tr>`).join("")}
      </table>
      <h3>Total: ₹${money(row.grand_total)}</h3>
      <p>${row.terms || ""}</p><p>${row.notes || ""}</p>`;
    const w = window.open("", "_blank");
    if (!w) return showWarning("Popup blocked", "Allow popups to print this order.");
    w.document.write(`<html><head><title>${row.order_no}</title></head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="so-page">
      <div className="so-header">
        <div>
          <h1>Sales Orders</h1>
          <p>Manage confirmed customer orders, quotation conversions and delivery progress.</p>
        </div>
        <div className="so-header-actions">
          <button className="so-btn secondary" onClick={load}><RefreshCw size={16}/> Refresh</button>
          <button className="so-btn primary" onClick={openNew}><Plus size={17}/> New Sales Order</button>
        </div>
      </div>

      <div className="so-stats">
        <div><span>Total orders</span><strong>{rows.length}</strong></div>
        <div><span>Confirmed / Production</span><strong>{rows.filter(r => ["Confirmed", "In Production"].includes(r.status)).length}</strong></div>
        <div><span>Ready / Dispatched</span><strong>{rows.filter(r => ["Ready for Dispatch", "Dispatched"].includes(r.status)).length}</strong></div>
        <div><span>Order value</span><strong>₹{money(rows.reduce((sum, r) => sum + Number(r.grand_total || 0), 0))}</strong></div>
      </div>

      <div className="so-toolbar">
        <div className="so-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, customer or quotation..."/></div>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option>All</option>{statuses.map(status => <option key={status}>{status}</option>)}
        </select>
      </div>

      <div className="so-table-wrap">
        {loading ? <div className="so-empty">Loading sales orders...</div> : filtered.length === 0 ? (
          <div className="so-empty"><FileCheck2 size={34}/><strong>No sales orders found</strong><span>Create an order or convert an accepted quotation to get started.</span></div>
        ) : (
          <table className="so-table">
            <thead><tr><th>Order No.</th><th>Date</th><th>Customer</th><th>Quotation</th><th>Promised Date</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{filtered.map(row => (
              <tr key={row.id}>
                <td><strong>{row.order_no}</strong></td>
                <td>{row.order_date}</td>
                <td>{row.customer_name}<small>{row.customer_code}</small></td>
                <td>{row.quote_no || "—"}</td>
                <td>{row.promised_date || "—"}</td>
                <td>₹{money(row.grand_total)}</td>
                <td><select className="so-status" value={row.status} onChange={e => changeStatus(row, e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td>
                <td><div className="so-row-actions">
                  {!row.quotation_id && <button title="Edit order" onClick={() => openEdit(row)}><Pencil size={16}/></button>}
                  <button title="Print order" onClick={() => printOrder(row)}><Printer size={16}/></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {modal && <div className="so-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setModal(false); }}>
        <form className="so-modal" onSubmit={save}>
          <div className="so-modal-head">
            <div><h2>{editing ? "Edit Sales Order" : conversionQuoteId ? "Convert Quotation" : "New Sales Order"}</h2><p>Enter customer, order and item details.</p></div>
            <button type="button" className="so-close" onClick={() => setModal(false)}><X size={20}/></button>
          </div>

          {!editing && <div className="so-field">
            <label>Convert accepted quotation (optional)</label>
            <select value={conversionQuoteId || ""} onChange={e => chooseQuotation(e.target.value)}>
              <option value="">Create a manual sales order</option>
              {quotations.filter(q => q.status === "Accepted").map(q => <option key={q.id} value={q.id}>{q.quote_no} — {q.customer_name} — ₹{money(q.grand_total)}</option>)}
            </select>
          </div>}

          <div className="so-form-grid">
            <div className="so-field"><label>Customer *</label>
              <select required disabled={!!conversionQuoteId} value={form.customer_id} onChange={e => updateField("customer_id", e.target.value)}>
                <option value="">Select customer</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
              </select>
            </div>
            <div className="so-field"><label>Enquiry</label>
              <select disabled={!!conversionQuoteId} value={form.enquiry_id} onChange={e => updateField("enquiry_id", e.target.value)}>
                <option value="">No linked enquiry</option>{selectedEnquiries.map(enq => <option key={enq.id} value={enq.id}>{enq.enquiry_no} — {enq.subject}</option>)}
              </select>
            </div>
            <div className="so-field"><label>Order Number *</label><input required value={form.order_no} onChange={e => updateField("order_no", e.target.value)}/></div>
            <div className="so-field"><label>Order Date *</label><input type="date" required value={form.order_date} onChange={e => updateField("order_date", e.target.value)}/></div>
            <div className="so-field"><label>Promised Delivery Date</label><input type="date" value={form.promised_date} onChange={e => updateField("promised_date", e.target.value)}/></div>
            <div className="so-field"><label>Currency</label><select value={form.currency} disabled={!!conversionQuoteId} onChange={e => updateField("currency", e.target.value)}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></div>
          </div>

          <div className="so-lines-head"><h3>Order Items</h3>{!conversionQuoteId && <button type="button" className="so-btn secondary small" onClick={() => updateField("lines", [...form.lines, blankLine()])}><Plus size={15}/> Add Item</button>}</div>
          <div className="so-lines">
            {form.lines.map((line, index) => <div className="so-line" key={index}>
              <div className="so-line-top">
                <strong>Item {index + 1}</strong>
                {!conversionQuoteId && <button type="button" className="so-icon-btn danger" onClick={() => updateField("lines", form.lines.filter((_, i) => i !== index))} disabled={form.lines.length === 1}><Trash2 size={15}/></button>}
              </div>
              {!conversionQuoteId && <div className="so-field"><label>Choose Product</label><select value={line.product_id} onChange={e => chooseProduct(index, e.target.value)}><option value="">Custom / manual item</option>{products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}</select></div>}
              <div className="so-line-grid">
                <div className="so-field wide"><label>Description *</label><input requid disabled={!!conversionQuoteId} value={line.description} onChange={e => updateLine(index, "description", e.target.value)}/></div>
                <div className="so-field"><label>Unit</label><input disabled={!!conversionQuoteId} value={line.unit} onChange={e => updateLine(index, "unit", e.target.value)}/></div>
                <div className="so-field"><label>Quantity *</label><input type="number" min="0.0001" step="any" required disabled={!!conversionQuoteId} value={line.quantity} onChange={e => updateLine(index, "quantity", e.target.value)}/></div>
                <div className="so-field"><label>Unit Price</label><input type="number" min="0" step="any" disabled={!!conversionQuoteId} value={line.unit_price} onChange={e => updateLine(index, "unit_price", e.target.value)}/></div>
                <div className="so-field"><label>Discount %</label><input type="number" min="0" max="100" step="any" disabled={!!conversionQuoteId} value={line.discount_percent} onChange={e => updateLine(index, "discount_percent", e.target.value)}/></div>
                <div className="so-field"><label>Tax %</label><input type="number" min="0" max="100" step="any" disabled={!!conversionQuoteId} value={line.tax_rate} onChange={e => updateLine(index, "tax_rate", e.target.value)}/></div>
              </div>
            </div>)}
          </div>

          <div className="so-totals">
            <div><span>Subtotal</span><strong>₹{money(totals.subtotal)}</strong></div>
            <div><span>Discount</span><strong>₹{money(totals.discount)}</strong></div>
            <div><span>Tax</span><strong>₹{money(totals.tax)}</strong></div>
            <div className="grand"><span>Grand Total</span><strong>₹{money(totals.total)}</strong></div>
          </div>

          <div className="so-form-grid">
            <div className="so-field full"><label>Terms & Conditions</label><textarea rows="2" disabled={!!conversionQuoteId} value={form.terms} onChange={e => updateField("terms", e.target.value)}/></div>
            <div className="so-field full"><label>Internal Notes</label><textarea rows="2" value={form.notes} disabled={!!conversionQuoteId} onChange={e => updateField("notes", e.target.value)}/></div>
          </div>
          <div className="so-modal-actions">
            <button type="button" className="so-btn secondary" disabled={saving} onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="so-btn primary" disabled={saving}>{saving ? "Saving..." : editing ? "Update Order" : conversionQuoteId ? "Convert to Sales Order" : "Create Sales Order"}</button>
          </div>
        </form>
      </div>}
    </div>
  );
}
