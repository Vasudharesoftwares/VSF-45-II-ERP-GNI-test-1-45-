import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";
import "./Dispatch.css";

export default function Dispatch() {
  const [companyId, setCompanyId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [quantities, setQuantities] = useState({});
  const [form, setForm] = useState({
    dispatch_no: "", dispatch_date: new Date().toISOString().slice(0, 10),
    location: "", transporter: "", vehicle_no: "", tracking_no: "",
    delivery_address: "", notes: ""
  });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("create");

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Request failed.");
    return data;
  };

  const load = async (id) => {
    const [o, d] = await Promise.all([
      request(`/api/dispatch/companies/${id}/orders`),
      request(`/api/dispatch/companies/${id}/dispatches`)
    ]);
    setOrders(o);
    setDispatches(d);
  };

  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/me").then(async r => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || "Unable to identify company.");
      if (!alive) return;
      setCompanyId(data.company_id);
      await load(data.company_id);
    }).catch(e => showError("Dispatch", e.message));
    return () => { alive = false; };
  }, []);

  const activeOrder = useMemo(
    () => orders.find(o => String(o.id) === String(selectedOrder)),
    [orders, selectedOrder]
  );

  const update = (key, value) => setForm(old => ({ ...old, [key]: value }));

  const saveDraft = async (e) => {
    e.preventDefault();
    if (!activeOrder) return showWarning("Select a sales order first.");
    const lines = (activeOrder.lines || [])
      .filter(line => Number(quantities[line.id] || 0) > 0)
      .map(line => ({
        sales_order_line_id: line.id,
        quantity: Number(quantities[line.id])
      }));
    if (!lines.length) return showWarning("Enter at least one dispatch quantity.");
    setLoading(true);
    try {
      await request(`/api/dispatch/companies/${companyId}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sales_order_id: activeOrder.id, lines })
      });
      showSuccess("Dispatch draft saved.");
      setQuantities({});
      setSelectedOrder("");
      setForm(old => ({ ...old, dispatch_no: "", transporter: "", vehicle_no: "", tracking_no: "", notes: "" }));
      await load(companyId);
      setTab("register");
    } catch (e) {
      showError("Unable to save dispatch", e.message);
    } finally {
      setLoading(false);
    }
  };

  const postDispatch = async (id) => {
    const confirmed = await showConfirm("Post dispatch?", "Posting deducts stock from the selected location and cannot be undone here.");
    if (!confirmed) return;
    try {
      await request(`/api/dispatch/dispatches/${id}/post`, { method: "POST" });
      showSuccess("Dispatch posted and inventory updated.");
      await load(companyId);
    } catch (e) {
      showError("Dispatch not posted", e.message);
    }
  };

  const updateDelivery = async (row) => {
    const status = window.prompt("Delivery status: Pending, In Transit, Delivered, Delivery Failed, Returned", row.delivery_status);
    if (!status) return;
    const received = status === "Delivered" ? window.prompt("Received by (optional):", row.received_by || "") : row.received_by;
    try {
      await request(`/api/dispatch/dispatches/${row.id}/delivery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_status: status.trim(),
          delivered_date: status.trim() === "Delivered" ? new Date().toISOString().slice(0, 10) : row.delivered_date,
          received_by: received || null
        })
      });
      showSuccess("Delivery status updated.");
      await load(companyId);
    } catch (e) {
      showError("Unable to update delivery", e.message);
    }
  };

  const printChallan = (row) => {
    const lines = (row.lines || []).map(x =>
      `<tr><td>${x.sku || ""}</td><td>${x.description}</td><td>${x.quantity} ${x.unit}</td></tr>`
    ).join("");
    const safe = value => String(value || "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
    const html = `<!doctype html><html><head><title>Delivery Challan ${safe(row.dispatch_no)}</title>
      <style>body{font:14px Arial;padding:28px;color:#111}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border:1px solid #777;padding:9px;text-align:left}.meta{line-height:1.8}.sign{display:flex;justify-content:space-between;margin-top:90px}</style>
      </head><body><h1>DELIVERY CHALLAN</h1><div class="meta">
      <b>Challan No:</b> ${safe(row.dispatch_no)}<br><b>Date:</b> ${safe(row.dispatch_date)}<br>
      <b>Sales Order:</b> ${safe(row.order_no)}<br><b>Customer:</b> ${safe(row.customer_name)}<br>
      <b>Delivery Address:</b> ${safe(row.delivery_address)}<br><b>Transporter:</b> ${safe(row.transporter)}<br>
      <b>Vehicle:</b> ${safe(row.vehicle_no)}<br><b>Tracking:</b> ${safe(row.tracking_no)}</div>
      <table><thead><tr><th>SKU</th><th>Description</th><th>Quantity</th></tr></thead><tbody>${lines}</tbody></table>
      <p>Goods received in good condition, subject to verification.</p>
      <div class="sign"><span>Authorised Signatory</span><span>Receiver's Signature</span></div>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return showWarning("Allow pop-ups to print the challan.");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };


  return (
    <div className="dispatch-page">
      <div className="dispatch-heading">
        <div>
          <div className="dispatch-eyebrow">SALES OPERATIONS</div>
          <h1>Dispatch &amp; Delivery</h1>
          <p>Create partial dispatches, manage stock deductions and track customer deliveries.</p>
        </div>
        <div className="dispatch-heading-actions">
          <button
            type="button"
            className={`dispatch-tab ${tab === "create" ? "active" : ""}`}
            onClick={() => setTab("create")}
          >
            + New Dispatch
          </button>
          <button
            type="button"
            className={`dispatch-tab ${tab === "register" ? "active" : ""}`}
            onClick={() => setTab("register")}
          >
            Dispatch Register <span>{dispatches.length}</span>
          </button>
        </div>
      </div>

      <div className="dispatch-summary">
        <div className="dispatch-summary-card">
          <span className="dispatch-summary-icon">↗</span>
          <div><small>Total Dispatches</small><strong>{dispatches.length}</strong></div>
        </div>
        <div className="dispatch-summary-card">
          <span className="dispatch-summary-icon draft">◷</span>
          <div><small>Draft Dispatches</small><strong>{dispatches.filter(x => x.status === "Draft").length}</strong></div>
        </div>
        <div className="dispatch-summary-card">
          <span className="dispatch-summary-icon posted">✓</span>
          <div><small>Posted Dispatches</small><strong>{dispatches.filter(x => x.status === "Posted").length}</strong></div>
        </div>
        <div className="dispatch-summary-card">
          <span className="dispatch-summary-icon delivered">□</span>
          <div><small>Delivered</small><strong>{dispatches.filter(x => x.delivery_status === "Delivered").length}</strong></div>
        </div>
      </div>

      {tab === "create" && (
        <form className="dispatch-panel" onSubmit={saveDraft}>
          <div className="dispatch-panel-heading">
            <div>
              <h2>New Dispatch</h2>
              <p>Choose a sales order and enter the quantities being shipped.</p>
            </div>
            <span className="dispatch-draft-label">SAVED AS DRAFT</span>
          </div>

          <div className="dispatch-form-body">
            <div className="dispatch-section-title">
              <span>01</span>
              <div><b>Order information</b><small>Select the sales order for this shipment</small></div>
            </div>

            <div className="dispatch-field-grid">
              <label className="dispatch-field dispatch-field-wide">
                <span>Sales Order <i>*</i></span>
                <select required value={selectedOrder} onChange={e => {
                  setSelectedOrder(e.target.value);
                  setQuantities({});
                }}>
                  <option value="">Select a sales order</option>
                  {orders.map(o => (
                    <option key={o.id} value={o.id}>{o.order_no} — {o.customer_name}</option>
                  ))}
                </select>
              </label>
            </div>

            {activeOrder && (
              <div className="dispatch-order-lines">
                <div className="dispatch-section-title">
                  <span>02</span>
                  <div><b>Items to dispatch</b><small>Enter only the quantities included in this shipment</small></div>
                </div>
                <div className="dispatch-table-wrap">
                  <table className="dispatch-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Ordered</th>
                        <th>Dispatched</th>
                        <th>Pending</th>
                        <th>Dispatch now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeOrder.lines.map(line => (
                        <tr key={line.id}>
                          <td>
                            <b>{line.description}</b>
                            {line.sku && <small>{line.sku}</small>}
                          </td>
                          <td>{line.quantity}</td>
                          <td>{line.dispatched_quantity}</td>
                          <td><span className="dispatch-pending">{line.pending_quantity}</span></td>
                          <td>
                            <input
                              className="dispatch-quantity"
                              type="number"
                              min="0"
                              max={line.pending_quantity}
                              step="0.001"
                              placeholder="0"
                              disabled={Number(line.pending_quantity) <= 0}
                              value={quantities[line.id] || ""}
                              onChange={e => setQuantities(old => ({ ...old, [line.id]: e.target.value }))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="dispatch-section-title dispatch-shipment-title">
              <span>{activeOrder ? "03" : "02"}</span>
              <div><b>Shipment details</b><small>Transport and delivery information</small></div>
            </div>

            <div className="dispatch-field-grid">
              {[
                ["dispatch_no", "Dispatch / Challan No", true],
                ["dispatch_date", "Dispatch Date", true],
                ["location", "Stock Location", true],
                ["transporter", "Transporter", false],
                ["vehicle_no", "Vehicle Number", false],
                ["tracking_no", "Tracking / LR Number", false]
              ].map(([key, label, required]) => (
                <label className="dispatch-field" key={key}>
                  <span>{label} {required && <i>*</i>}</span>
                  <input
                    required={required}
                    type={key === "dispatch_date" ? "date" : "text"}
                    value={form[key]}
                    onChange={e => update(key, e.target.value)}
                    placeholder={
                      key === "dispatch_no" ? "e.g. DC-0001" :
                      key === "location" ? "Enter stock warehouse" :
                      key === "vehicle_no" ? "Vehicle registration" :
                      key === "tracking_no" ? "LR / tracking reference" :
                      key === "transporter" ? "Transport company" : undefined
                    }
                  />
                </label>
              ))}

              <label className="dispatch-field dispatch-field-wide">
                <span>Delivery Address</span>
                <textarea
                  rows="3"
                  value={form.delivery_address}
                  onChange={e => update("delivery_address", e.target.value)}
                  placeholder="Enter the delivery address"
                />
              </label>

              <label className="dispatch-field dispatch-field-wide">
                <span>Notes</span>
                <textarea
                  rows="2"
                  value={form.notes}
                  onChange={e => update("notes", e.target.value)}
                  placeholder="Additional shipment instructions (optional)"
                />
              </label>
            </div>
          </div>

          <div className="dispatch-form-footer">
            <span>Fields marked * are required</span>
            <button type="submit" className="dispatch-save" disabled={loading}>
              {loading ? "Saving dispatch..." : "Save Dispatch Draft →"}
            </button>
          </div>
        </form>
      )}

      {tab === "register" && (
        <div className="dispatch-panel">
          <div className="dispatch-panel-heading">
            <div>
              <h2>Dispatch Register</h2>
              <p>Review dispatch records, post stock deductions and manage deliveries.</p>
            </div>
            <button type="button" className="dispatch-new-button" onClick={() => setTab("create")}>
              + New Dispatch
            </button>
          </div>

          <div className="dispatch-table-wrap">
            <table className="dispatch-table dispatch-register-table">
              <thead>
                <tr>
                  <th>Challan No</th>
                  <th>Date</th>
                  <th>Sales Order</th>
                  <th>Customer</th>
                  <th>Transporter</th>
                  <th>Posting</th>
                  <th>Delivery</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map(row => (
                  <tr key={row.id}>
                    <td><b className="dispatch-challan">{row.dispatch_no}</b></td>
                    <td>{row.dispatch_date}</td>
                    <td>{row.order_no}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.transporter || "—"}</td>
                    <td>
                      <span className={`dispatch-status ${String(row.status || "").toLowerCase()}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <span className={`dispatch-status ${String(row.delivery_status || "").toLowerCase().replaceAll(" ", "-")}`}>
                        {row.delivery_status || "Pending"}
                      </span>
                    </td>
                    <td>
                      <div className="dispatch-row-actions">
                        <button type="button" onClick={() => printChallan(row)}>Print</button>
                        {row.status === "Draft" && (
                          <button type="button" className="post" onClick={() => postDispatch(row.id)}>Post</button>
                        )}
                        {row.status === "Posted" && (
                          <button type="button" className="update" onClick={() => updateDelivery(row)}>Update Delivery</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!dispatches.length && (
                  <tr><td colSpan="8" className="dispatch-empty">No dispatch records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
