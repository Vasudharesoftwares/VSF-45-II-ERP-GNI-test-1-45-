import React, { useCallback, useEffect, useState } from "react";
import Swal from "sweetalert2";
import { Plus, Search, RefreshCw, PackageCheck } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError } from "./utils/alerts";
import "./GoodsReceipts.css";

async function callApi(path, options = {}) {
  const response = await apiFetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed.");
  return data;
}

const today = () => new Date().toISOString().slice(0,10);

export default function GoodsReceipts() {
  const [companyId, setCompanyId] = useState(null);
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [form, setForm] = useState({
    purchase_order_id: "", grn_no: "", receipt_date: today(),
    location: "", notes: "", lines: []
  });
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async id => {
    if (!id) return;
    setLoading(true);
    try {
      const [po, grn, wh] = await Promise.all([
        callApi(`/api/purchase/companies/${id}/orders`),
        callApi(`/api/purchase/companies/${id}/receipts`),
        callApi(`/api/inventory/companies/${id}/warehouses`)
      ]);
      const activeWarehouses = (wh.items || []).filter(row => row.is_active);
      setWarehouses(activeWarehouses);
      setForm(old => ({
        ...old,
        location: activeWarehouses.some(row => row.name === old.location)
          ? old.location
          : (activeWarehouses[0]?.name || "")
      }));
      setOrders((po.items || []).filter(row => row.status === "Approved"));
      setReceipts(grn.items || []);
    } catch (error) {
      showError("Could not load receipt data", error.message);
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

  const selectOrder = id => {
    const po = orders.find(row => row.id === Number(id));
    if (!po) {
      setForm(old => ({ ...old, purchase_order_id: "", lines: [] }));
      return;
    }

    const lines = po.lines.map(line => {
      const alreadyReceived = receipts
        .filter(receipt => receipt.status === "Posted")
        .flatMap(receipt => receipt.lines || [])
        .filter(receiptLine => Number(receiptLine.purchase_order_line_id) === Number(line.id))
        .reduce((sum, receiptLine) => sum + Number(receiptLine.received_qty || 0), 0);
      const orderedQty = Number(line.quantity || 0);

      return {
        purchase_order_line_id: line.id,
        product_id: line.product_id,
        sku: line.sku,
        description: line.description,
        ordered_qty: orderedQty,
        already_received: alreadyReceived,
        remaining_qty: Math.max(0, orderedQty - alreadyReceived),
        received_qty: "",
        accepted_qty: "",
        rejected_qty: "0",
        notes: ""
      };
    });
    setForm(old => ({ ...old, purchase_order_id: String(po.id), lines }));
  };

  const setLine = (index, key, value) => setForm(old => ({
    ...old,
    lines: old.lines.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, [key]: value };
      if (
        key === "received_qty" &&
        (line.accepted_qty === "" || Number(line.accepted_qty) === Number(line.received_qty))
      ) {
        next.accepted_qty = value;
      }
      return next;
    })
  }));

  const create = async event => {
    event.preventDefault();
    if (!form.purchase_order_id || !form.grn_no.trim() || !form.lines.length) {
      showError("Missing information", "Select an approved purchase order and enter a GRN number.");
      return;
    }
    const selectedLines = form.lines.filter(
      line => String(line.received_qty).trim() !== ""
    );

    if (!form.location || !warehouses.some(row => row.name === form.location)) {
      showError("Select a warehouse", "Choose an active warehouse for this company.");
      return;
    }

    if (!selectedLines.length) {
      showError("No received quantities", "Enter a received quantity for at least one item.");
      return;
    }

    const invalidLine = selectedLines.find(line => {
      const received = Number(line.received_qty);
      const accepted = Number(line.accepted_qty);
      const rejected = Number(line.rejected_qty);
      return (
        !Number.isFinite(received) ||
        received <= 0 ||
        !Number.isFinite(accepted) ||
        accepted < 0 ||
        !Number.isFinite(rejected) ||
        rejected < 0 ||
        Math.abs(accepted + rejected - received) > 0.000001 ||
        received > line.remaining_qty
      );
    });

    if (invalidLine) {
      showError(
        "Check received quantities",
        `Check ${invalidLine.sku || invalidLine.description}: accepted plus rejected must equal received, and received cannot exceed the remaining PO quantity (${invalidLine.remaining_qty}).`
      );
      return;
    }

    try {
      await callApi(`/api/purchase/companies/${companyId}/receipts`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          purchase_order_id: Number(form.purchase_order_id),
          lines: selectedLines.map(line => ({
            purchase_order_line_id: line.purchase_order_line_id,
            received_qty: Number(line.received_qty),
            accepted_qty: Number(line.accepted_qty),
            rejected_qty: Number(line.rejected_qty),
            notes: line.notes
          }))
        })
      });
      showSuccess("Goods receipt saved as Draft");
      setShowForm(false);
      setForm({
        purchase_order_id: "", grn_no: "", receipt_date: today(),
        location: warehouses[0]?.name || "", notes: "", lines: []
      });
      await load(companyId);
    } catch (error) {
      showError("Could not save GRN", error.message);
    }
  };

  const postReceipt = async row => {
    const result = await Swal.fire({
      title: "Post goods receipt?",
      text: `Posting ${row.grn_no} adds accepted quantities to the stock ledger. This cannot be undone here.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Post GRN"
    });
    if (!result.isConfirmed) return;

    try {
      await callApi(`/api/purchase/receipts/${row.id}/post`, { method: "PATCH" });
      showSuccess("GRN posted and accepted stock recorded");
      await load(companyId);
    } catch (error) {
      showError("Could not post GRN", error.message);
    }
  };

  const visible = receipts.filter(row =>
    [row.grn_no, row.po_no, row.vendor_name, row.status]
      .some(value => String(value || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="grn-page">
      <div className="grn-heading">
        <div>
          <div className="grn-eyebrow">INVENTORY RECEIVING</div>
          <h1><PackageCheck size={25}/> Goods Receipt Notes</h1>
          <p>Receive supplier deliveries against approved purchase orders.</p>
        </div>
        <button className="grn-primary" onClick={() => {
          setForm({
            purchase_order_id: "", grn_no: "", receipt_date: today(),
            location: "Main Store", notes: "", lines: []
          });
          setShowForm(true);
        }}><Plus size={17}/> Create GRN</button>
      </div>

      {showForm && <form className="grn-form" onSubmit={create}>
        <div className="grn-form-heading">
          <h2>New Goods Receipt</h2>
          <button type="button" className="grn-secondary" onClick={() => setShowForm(false)}>Close</button>
        </div>
        <div className="grn-fields">
          <label>Approved Purchase Order *
            <select required value={form.purchase_order_id} onChange={e => selectOrder(e.target.value)}>
              <option value="">Select approved PO</option>
              {orders.map(po => <option key={po.id} value={po.id}>{po.po_no} — {po.vendor_name}</option>)}
            </select>
          </label>
          <label>GRN Number *
            <input required value={form.grn_no} onChange={e => setField("grn_no",e.target.value)} placeholder="GRN-0001"/>
          </label>
          <label>Receipt Date *
            <input required type="date" value={form.receipt_date} onChange={e => setField("receipt_date",e.target.value)}/>
          </label>
          <label>Store / Warehouse *
            <select required value={form.location} onChange={e => setField("location", e.target.value)}>
              <option value="">Select active warehouse</option>
              {warehouses.map(warehouse => (
                <option key={warehouse.id} value={warehouse.name}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </label>
          <label className="grn-wide">Notes
            <textarea value={form.notes} onChange={e => setField("notes",e.target.value)}/>
          </label>
        </div>

        {form.lines.length > 0 && <>
          <h3 className="grn-lines-title">Items to receive</h3>
          <div className="grn-lines">
            {form.lines.map((line,index) => <div className="grn-line" key={line.purchase_order_line_id}>
              <div className="grn-item-name"><b>{line.sku}</b><span>{line.description}</span><small>Ordered: {line.ordered_qty} · Received: {line.already_received} · Remaining: {line.remaining_qty}</small></div>
              <label>Received<input type="number" min="0.001" max={line.remaining_qty} step="0.001" disabled={line.remaining_qty <= 0} placeholder={line.remaining_qty <= 0 ? "Complete" : "Optional"} value={line.received_qty} onChange={e => setLine(index,"received_qty",e.target.value)}/></label>
              <label>Accepted<input type="number" min="0" step="0.001" value={line.accepted_qty} onChange={e => setLine(index,"accepted_qty",e.target.value)}/></label>
              <label>Rejected<input type="number" min="0" step="0.001" value={line.rejected_qty} onChange={e => setLine(index,"rejected_qty",e.target.value)}/></label>
            </div>)}
          </div>
        </>}
        <div className="grn-form-actions">
          <button type="button" className="grn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          <button type="submit" className="grn-primary">Save Draft GRN</button>
        </div>
      </form>}

      <div className="grn-toolbar">
        <div className="grn-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search GRN, PO, vendor or status"/></div>
        <button className="grn-secondary" onClick={() => load(companyId)} disabled={loading}><RefreshCw size={16}/> Refresh</button>
        <span>{visible.length} receipts</span>
      </div>

      <div className="grn-table-wrap">
        <table className="grn-table">
          <thead><tr><th>GRN Number</th><th>Date</th><th>Purchase Order</th><th>Vendor</th><th>Items</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {visible.map(row => <tr key={row.id}>
              <td><b>{row.grn_no}</b></td>
              <td>{row.receipt_date}</td>
              <td>{row.po_no || "—"}</td>
              <td>{row.vendor_name || "—"}</td>
              <td>{row.lines.length}</td>
              <td><span className={`grn-status ${row.status.toLowerCase()}`}>{row.status}</span></td>
              <td>{row.status === "Draft" && <button className="grn-post" onClick={() => postReceipt(row)}>Post GRN</button>}</td>
            </tr>)}
            {!visible.length && <tr><td colSpan="7" className="grn-empty">{loading ? "Loading receipts…" : "No goods receipts found."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
