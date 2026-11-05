import React, { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Search, RefreshCw, Trash2, ShoppingCart } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError } from "./utils/alerts";
import "./PurchaseOrders.css";

const blankLine = () => ({
  product_id: "", description: "", quantity: "1",
  unit_price: "0", discount_percent: "0", tax_rate: "0"
});

const blankForm = () => ({
  vendor_id: "", po_no: "", po_date: new Date().toISOString().slice(0,10),
  expected_date: "", currency: "INR", terms: "", notes: "",
  lines: [blankLine()]
});

async function callApi(path, options = {}) {
  const response = await apiFetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed.");
  return data;
}

export default function PurchaseOrders() {
  const [companyId, setCompanyId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blankForm());
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async id => {
    if (!id) return;
    setLoading(true);
    try {
      const [o, v, p] = await Promise.all([
        callApi(`/api/purchase/companies/${id}/orders`),
        callApi(`/api/purchase/companies/${id}/vendors`),
        callApi(`/api/core/companies/${id}/products`)
      ]);
      setOrders(o.items || []);
      setVendors(v.items || []);
      setProducts(p.items || []);
    } catch (error) {
      showError("Could not load purchase data", error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    callApi("/api/auth/me").then(data => {
      const id = data.company_id || data.user?.company_id;
      if (!id) throw new Error("No active company is assigned to this account.");
      setCompanyId(id);
      load(id);
    }).catch(error => showError("Company information unavailable", error.message));
  }, [load]);

  const setField = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const setLine = (index, key, value) => setForm(old => ({
    ...old,
    lines: old.lines.map((line, i) => i === index ? { ...line, [key]: value } : line)
  }));

  const addLine = () => setForm(old => ({ ...old, lines: [...old.lines, blankLine()] }));
  const removeLine = index => setForm(old => ({
    ...old, lines: old.lines.filter((_, i) => i !== index)
  }));

  const totals = form.lines.reduce((acc, line) => {
    const base = Number(line.quantity || 0) * Number(line.unit_price || 0);
    const discount = base * Number(line.discount_percent || 0) / 100;
    const taxable = base - discount;
    const tax = taxable * Number(line.tax_rate || 0) / 100;
    acc.subtotal += base;
    acc.discount += discount;
    acc.tax += tax;
    acc.total += taxable + tax;
    return acc;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });

  const newOrder = () => {
    setEditing(null);
    setForm(blankForm());
    setShowForm(true);
  };

  const editOrder = order => {
    setEditing(order.id);
    setForm({
      vendor_id: String(order.vendor_id),
      po_no: order.po_no,
      po_date: order.po_date,
      expected_date: order.expected_date || "",
      currency: order.currency || "INR",
      terms: order.terms || "",
      notes: order.notes || "",
      lines: order.lines.map(line => ({
        product_id: String(line.product_id),
        description: line.description || "",
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_percent: line.discount_percent,
        tax_rate: line.tax_rate
      }))
    });
    setShowForm(true);
  };

  const save = async event => {
    event.preventDefault();
    if (!form.vendor_id || !form.po_no.trim() || !form.po_date || !form.lines.length) {
      showError("Missing information", "Choose a vendor, enter the PO number and date, and add at least one item.");
      return;
    }
    if (form.lines.some(line => !line.product_id || Number(line.quantity) <= 0)) {
      showError("Invalid purchase lines", "Choose a product and enter a quantity greater than zero for every line.");
      return;
    }

    try {
      const payload = {
        ...form,
        vendor_id: Number(form.vendor_id),
        lines: form.lines.map(line => ({
          ...line,
          product_id: Number(line.product_id),
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price),
          discount_percent: Number(line.discount_percent),
          tax_rate: Number(line.tax_rate)
        }))
      };
      await callApi(
        editing ? `/api/purchase/orders/${editing}` : `/api/purchase/companies/${companyId}/orders`,
        { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      showSuccess(editing ? "Purchase order updated" : "Purchase order created");
      setShowForm(false);
      setEditing(null);
      setForm(blankForm());
      await load(companyId);
    } catch (error) {
      showError("Could not save purchase order", error.message);
    }
  };

  const changeStatus = async (order, status) => {
    const result = await Swal.fire({
      title: `Change status to ${status}?`,
      text: `Purchase order ${order.po_no}`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Confirm"
    });
    if (!result.isConfirmed) return;
    try {
      await callApi(`/api/purchase/orders/${order.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status })
      });
      showSuccess(`Purchase order ${status.toLowerCase()}`);
      await load(companyId);
    } catch (error) {
      showError("Status update failed", error.message);
    }
  };

  const visible = orders.filter(order =>
    [order.po_no, order.vendor_name, order.status]
      .some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))
  );

  const money = value => Number(value || 0).toLocaleString("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2
  });

  return (
    <div className="po-page">
      <div className="po-heading">
        <div>
          <div className="po-eyebrow">PROCUREMENT MANAGEMENT</div>
          <h1><ShoppingCart size={25}/> Purchase Orders</h1>
          <p>Create supplier orders and track submission and approval.</p>
        </div>
        <button className="po-primary" onClick={newOrder}><Plus size={17}/> New Purchase Order</button>
      </div>

      <div className="po-toolbar">
        <div className="po-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PO number, vendor or status"/></div>
        <button className="po-secondary" onClick={() => load(companyId)} disabled={loading}><RefreshCw size={16}/> Refresh</button>
        <span>{visible.length} orders</span>
      </div>

      {showForm && <form className="po-form" onSubmit={save}>
        <div className="po-form-top">
          <h2>{editing ? "Edit Purchase Order" : "Create Purchase Order"}</h2>
          <button type="button" className="po-secondary" onClick={() => setShowForm(false)}>Close</button>
        </div>
        <div className="po-fields">
          <label>Vendor *
            <select required value={form.vendor_id} onChange={e => setField("vendor_id",e.target.value)}>
              <option value="">Select vendor</option>
              {vendors.filter(v => v.is_active).map(v => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
            </select>
          </label>
          <label>PO Number *
            <input required value={form.po_no} onChange={e => setField("po_no",e.target.value)} placeholder="PO-0001"/>
          </label>
          <label>PO Date *
            <input required type="date" value={form.po_date} onChange={e => setField("po_date",e.target.value)}/>
          </label>
          <label>Expected Delivery
            <input type="date" value={form.expected_date} onChange={e => setField("expected_date",e.target.value)}/>
          </label>
          <label>Currency
            <select value={form.currency} onChange={e => setField("currency",e.target.value)}>
              <option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select>
          </label>
        </div>

        <div className="po-lines-heading"><h3>Purchase Items</h3><button type="button" className="po-secondary" onClick={addLine}><Plus size={15}/> Add Item</button></div>
        <div className="po-lines">
          {form.lines.map((line,index) => <div className="po-line" key={index}>
            <label className="po-product">Product *
              <select required value={line.product_id} onChange={e => {
                const product = products.find(p => p.id === Number(e.target.value));
                setLine(index,"product_id",e.target.value);
                if (product) {
                  setLine(index,"description",product.name);
                  setLine(index,"unit_price",String(product.purchase_price || 0));
                  setLine(index,"tax_rate",String(product.tax_rate || 0));
                }
              }}>
                <option value="">Select product</option>
                {products.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
            </label>
            <label>Description<input value={line.description} onChange={e => setLine(index,"description",e.target.value)}/></label>
            <label>Quantity<input type="number" min="0.001" step="0.001" value={line.quantity} onChange={e => setLine(index,"quantity",e.target.value)}/></label>
            <label>Rate<input type="number" min="0" step="0.01" value={line.unit_price} onChange={e => setLine(index,"unit_price",e.target.value)}/></label>
            <label>Discount %<input type="number" min="0" max="100" step="0.01" value={line.discount_percent} onChange={e => setLine(index,"discount_percent",e.target.value)}/></label>
            <label>Tax %<input type="number" min="0" max="100" step="0.01" value={line.tax_rate} onChange={e => setLine(index,"tax_rate",e.target.value)}/></label>
            <button type="button" className="po-remove" title="Remove item" disabled={form.lines.length === 1} onClick={() => removeLine(index)}><Trash2 size={17}/></button>
          </div>)}
        </div>

        <div className="po-bottom">
          <div className="po-notes">
            <label>Terms<textarea value={form.terms} onChange={e => setField("terms",e.target.value)}/></label>
            <label>Notes<textarea value={form.notes} onChange={e => setField("notes",e.target.value)}/></label>
          </div>
          <div className="po-totals">
            <div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div>
            <div><span>Discount</span><b>{money(totals.discount)}</b></div>
            <div><span>Tax</span><b>{money(totals.tax)}</b></div>
            <div className="po-grand"><span>Grand Total</span><b>{money(totals.total)}</b></div>
          </div>
        </div>
        <div className="po-form-actions">
          <button type="button" className="po-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button type="submit" className="po-primary">Save Draft</button>
        </div>
      </form>}

      <div className="po-table-wrap">
        <table className="po-table">
          <thead><tr><th>PO Number</th><th>Date</th><th>Vendor</th><th>Expected Date</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {visible.map(order => <tr key={order.id}>
              <td><b>{order.po_no}</b></td>
              <td>{order.po_date}</td>
              <td>{order.vendor_name || "—"}</td>
              <td>{order.expected_date || "—"}</td>
              <td>{money(order.grand_total)}</td>
              <td><span className={`po-status ${String(order.status).toLowerCase()}`}>{order.status}</span></td>
              <td><div className="po-actions">
                {order.status === "Draft" && <><button onClick={() => editOrder(order)}>Edit</button><button onClick={() => changeStatus(order,"Submitted")}>Submit</button></>}
                {order.status === "Submitted" && <><button onClick={() => changeStatus(order,"Approved")}>Approve</button><button onClick={() => changeStatus(order,"Rejected")}>Reject</button></>}
                {["Draft","Submitted","Approved","Rejected"].includes(order.status) && <button onClick={() => changeStatus(order,"Cancelled")}>Cancel</button>}
              </div></td>
            </tr>)}
            {!visible.length && <tr><td colSpan="7" className="po-empty">{loading ? "Loading purchase orders…" : "No purchase orders found."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
