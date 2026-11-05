import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Warehouse, ArrowLeftRight, ClipboardList } from "lucide-react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";
import "./InventoryControl.css";

const today = () => new Date().toISOString().slice(0, 10);
const blankMovement = () => ({
  movement_no: `STK-${Date.now()}`,
  movement_type: "Transfer",
  movement_date: today(),
  notes: "",
  product_id: "",
  quantity: "1",
  unit_cost: "0",
  source_location: "",
  destination_location: "",
  direction: "IN",
  reason: ""
});

const blankOpeningStock = () => ({
  movement_no: `OPEN-${Date.now()}`,
  movement_date: today(),
  product_id: "",
  warehouse: "",
  quantity: "1",
  unit_cost: "0",
  notes: ""
});


async function request(path, options = {}) {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.detail || `Request failed (${response.status}).`);
  }

  return data;
}

export default function InventoryControl() {
  const [companyId, setCompanyId] = useState(null);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [stock, setStock] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movement, setMovement] = useState(blankMovement());
  const [openingStock, setOpeningStock] = useState(blankOpeningStock());
  const [warehouse, setWarehouse] = useState({ code: "", name: "", address: "" });
  const [tab, setTab] = useState("stock");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id) => {
    setLoading(true);
    try {
      const [p, w, s, m] = await Promise.all([
        request(`/api/core/companies/${id}/products`),
        request(`/api/inventory/companies/${id}/warehouses`),
        request(`/api/inventory/companies/${id}/stock-by-location`),
        request(`/api/inventory/companies/${id}/movements`)
      ]);
      setProducts(p.items || []);
      setWarehouses(w.items || []);
      setStock(s.items || []);
      setMovements(m.items || []);
    } catch (error) {
      showError(error.message || "Unable to load inventory control data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    request("/api/auth/me")
      .then(data => {
        const id = data.company_id || data.user?.company_id || data.active_company_id;
        if (!id) throw new Error("No active company was found for this account.");
        if (mounted) {
          setCompanyId(id);
          load(id);
        }
      })
      .catch(error => showError(error.message || "Unable to identify the active company."));
    return () => { mounted = false; };
  }, [load]);

  const saveWarehouse = async (event) => {
    event.preventDefault();
    if (!warehouse.code.trim() || !warehouse.name.trim()) {
      showWarning("Enter both warehouse code and name.");
      return;
    }
    try {
      await request(`/api/inventory/companies/${companyId}/warehouses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(warehouse)
      });
      showSuccess("Warehouse created successfully.");
      setWarehouse({ code: "", name: "", address: "" });
      load(companyId);
    } catch (error) {
      showError(error.message || "Could not create warehouse.");
    }
  };

  const saveMovement = async (event) => {
    event.preventDefault();
    if (!movement.product_id || !movement.quantity || Number(movement.quantity) <= 0) {
      showWarning("Select a product and enter a quantity greater than zero.");
      return;
    }
    const payload = {
      movement_no: movement.movement_no,
      movement_type: movement.movement_type,
      movement_date: movement.movement_date,
      notes: movement.notes,
      lines: [{
        product_id: Number(movement.product_id),
        quantity: movement.quantity,
        unit_cost: movement.unit_cost || "0",
        source_location: movement.movement_type === "Adjustment" ? "" : movement.source_location,
        destination_location: movement.movement_type === "Issue" ? "" : movement.destination_location,
        direction: movement.movement_type === "Adjustment" ? movement.direction : null,
        reason: movement.reason
      }]
    };
    try {
      await request(`/api/inventory/companies/${companyId}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      showSuccess("Draft stock movement saved. Stock has not changed yet.");
      setMovement(blankMovement());
      setTab("movements");
      load(companyId);
    } catch (error) {
      showError(error.message || "Could not save stock movement.");
    }
  };

  const saveOpeningStock = async (event) => {
    event.preventDefault();

    if (!openingStock.product_id || !openingStock.warehouse) {
      showWarning("Select both a product and a warehouse.");
      return;
    }
    if (!openingStock.quantity || Number(openingStock.quantity) <= 0) {
      showWarning("Opening quantity must be greater than zero.");
      return;
    }
    if (Number(openingStock.unit_cost) < 0) {
      showWarning("Unit cost cannot be negative.");
      return;
    }

    const payload = {
      movement_no: openingStock.movement_no,
      movement_type: "Opening Stock",
      movement_date: openingStock.movement_date,
      notes: openingStock.notes,
      lines: [{
        product_id: Number(openingStock.product_id),
        quantity: openingStock.quantity,
        unit_cost: openingStock.unit_cost || "0",
        source_location: "",
        destination_location: openingStock.warehouse,
        direction: "IN",
        reason: "Opening stock"
      }]
    };

    try {
      await request(`/api/inventory/companies/${companyId}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      showSuccess("Opening stock draft saved. Inventory has not changed yet.");
      setOpeningStock(blankOpeningStock());
      await load(companyId);
    } catch (error) {
      showError(error.message || "Could not save opening stock.");
    }
  };

  const postMovement = async (row) => {
    const confirmed = await showConfirm(
      `Post ${row.movement_no}? This will update inventory balances and cannot be undone here.`
    );
    if (!confirmed) return;
    try {
      await request(`/api/inventory/movements/${row.id}/post`, { method: "PATCH" });
      showSuccess("Stock movement posted successfully.");
      load(companyId);
    } catch (error) {
      showError(error.message || "Could not post stock movement.");
    }
  };

  const locationOptions = warehouses.filter(w => w.is_active).map(w => w.name);

  return (
    <div className="inventory-control">
      <div className="ic-heading">
        <div>
          <span className="ic-eyebrow">INVENTORY MANAGEMENT</span>
          <h1>Inventory Control</h1>
          <p>Warehouses, stock balances and controlled stock movements.</p>
        </div>
        <button className="ic-refresh" onClick={() => companyId && load(companyId)} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="ic-tabs">
        <button className={tab === "stock" ? "active" : ""} onClick={() => setTab("stock")}>Stock by Location</button>
        <button className={tab === "opening" ? "active" : ""} onClick={() => setTab("opening")}>Opening Stock</button>
        <button className={tab === "movement" ? "active" : ""} onClick={() => setTab("movement")}>New Movement</button>
        <button className={tab === "movements" ? "active" : ""} onClick={() => setTab("movements")}>Movement Register</button>
        <button className={tab === "warehouses" ? "active" : ""} onClick={() => setTab("warehouses")}>Warehouses</button>
      </div>

      {tab === "opening" && (
        <>
          <section className="ic-panel">
            <h2><Plus size={19} /> Record Opening Stock</h2>
            <p className="ic-note">
              Enter the verified starting quantity for a real inventory product at an active warehouse.
              Saving creates a draft; stock changes only after posting.
            </p>
            <form onSubmit={saveOpeningStock} className="ic-form">
              <label>Opening Stock Number
                <input value={openingStock.movement_no} readOnly />
              </label>
              <label>Opening Date
                <input type="date" value={openingStock.movement_date}
                  onChange={e => setOpeningStock({ ...openingStock, movement_date: e.target.value })} required />
              </label>
              <label className="ic-wide">Warehouse
                <select value={openingStock.warehouse}
                  onChange={e => setOpeningStock({ ...openingStock, warehouse: e.target.value })} required>
                  <option value="">Select active warehouse</option>
                  {warehouses.filter(w => w.is_active).map(w =>
                    <option key={w.id} value={w.name}>{w.code} — {w.name}</option>
                  )}
                </select>
              </label>
              <label className="ic-wide">Inventory Product
                <select value={openingStock.product_id}
                  onChange={e => setOpeningStock({ ...openingStock, product_id: e.target.value })} required>
                  <option value="">Select inventory product</option>
                  {products.filter(p => p.track_inventory).map(p =>
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  )}
                </select>
              </label>
              <label>Opening Quantity
                <input type="number" min="0.001" step="0.001" value={openingStock.quantity}
                  onChange={e => setOpeningStock({ ...openingStock, quantity: e.target.value })} required />
              </label>
              <label>Unit Cost
                <input type="number" min="0" step="0.01" value={openingStock.unit_cost}
                  onChange={e => setOpeningStock({ ...openingStock, unit_cost: e.target.value })} required />
              </label>
              <label className="ic-wide">Notes
                <textarea rows="2" value={openingStock.notes}
                  onChange={e => setOpeningStock({ ...openingStock, notes: e.target.value })}
                  placeholder="Optional opening balance reference or remarks" />
              </label>
              <div className="ic-wide">
                <button className="ic-primary" type="submit"><Plus size={16} /> Save Opening Stock Draft</button>
              </div>
            </form>
            <p className="ic-note">
              Duplicate protection: only one opening balance per product per warehouse can be posted.
              Use a regular stock adjustment for later corrections.
            </p>
          </section>

          <section className="ic-panel">
            <h2><ClipboardList size={19} /> Opening Stock Register</h2>
            <div className="ic-table-wrap">
              <table>
                <thead><tr><th>Number</th><th>Date</th><th>Product</th><th>Warehouse</th><th>Quantity</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {movements.filter(row => row.movement_type === "Opening Stock").map(row =>
                    row.lines.map(line => (
                      <tr key={`${row.id}-${line.id}`}>
                        <td>{row.movement_no}</td>
                        <td>{row.movement_date}</td>
                        <td>{line.sku} — {line.product_name}</td>
                        <td>{line.destination_location}</td>
                        <td>{line.quantity}</td>
                        <td><span className={`ic-status ${row.status.toLowerCase()}`}>{row.status}</span></td>
                        <td>{row.status === "Draft"
                          ? <button className="ic-post" onClick={() => postMovement(row)}>Post</button>
                          : "Posted"}</td>
                      </tr>
                    ))
                  )}
                  {!movements.some(row => row.movement_type === "Opening Stock") &&
                    <tr><td colSpan="7" className="ic-empty">No opening stock entries yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "stock" && (
        <section className="ic-panel">
          <h2>Stock by Location</h2>
          <div className="ic-table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Product</th><th>Location</th><th>Received</th><th>Issued</th><th>On Hand</th></tr></thead>
              <tbody>
                {stock.map((row, i) => <tr key={`${row.product_id}-${row.location}-${i}`}>
                  <td>{row.sku}</td><td>{row.product_name}</td><td>{row.location}</td>
                  <td>{row.quantity_in}</td><td>{row.quantity_out}</td><td><strong>{row.on_hand}</strong></td>
                </tr>)}
                {!stock.length && <tr><td colSpan="6" className="ic-empty">No location-based stock movements found yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "movement" && (
        <section className="ic-panel">
          <h2><ArrowLeftRight size={19} /> Create Stock Movement</h2>
          <form onSubmit={saveMovement} className="ic-form">
            <label>Movement Type
              <select value={movement.movement_type} onChange={e => setMovement({ ...movement, movement_type: e.target.value })}>
                <option>Transfer</option><option>Issue</option><option>Adjustment</option>
              </select>
            </label>
            <label>Movement Number
              <input value={movement.movement_no} onChange={e => setMovement({ ...movement, movement_no: e.target.value })} required />
            </label>
            <label>Date
              <input type="date" value={movement.movement_date} onChange={e => setMovement({ ...movement, movement_date: e.target.value })} required />
            </label>
            <label>Product
              <select value={movement.product_id} onChange={e => setMovement({ ...movement, product_id: e.target.value })} required>
                <option value="">Select product</option>
                {products.filter(p => p.track_inventory).map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
            </label>
            <label>Quantity
              <input type="number" min="0.001" step="0.001" value={movement.quantity} onChange={e => setMovement({ ...movement, quantity: e.target.value })} required />
            </label>
            <label>Unit Cost
              <input type="number" min="0" step="0.01" value={movement.unit_cost} onChange={e => setMovement({ ...movement, unit_cost: e.target.value })} />
            </label>
            {movement.movement_type !== "Adjustment" && <label>Source Location
              <input list="ic-locations" value={movement.source_location} onChange={e => setMovement({ ...movement, source_location: e.target.value })} required />
            </label>}
            {movement.movement_type !== "Issue" && <label>{movement.movement_type === "Adjustment" ? "Adjustment Location" : "Destination Location"}
              <input list="ic-locations" value={movement.destination_location} onChange={e => setMovement({ ...movement, destination_location: e.target.value })} required />
            </label>}
            {movement.movement_type === "Adjustment" && <label>Adjustment Direction
              <select value={movement.direction} onChange={e => setMovement({ ...movement, direction: e.target.value })}>
                <option value="IN">Increase stock</option><option value="OUT">Decrease stock</option>
              </select>
            </label>}
            <label>Reason
              <input value={movement.reason} onChange={e => setMovement({ ...movement, reason: e.target.value })} placeholder="Reason for movement" />
            </label>
            <label className="ic-wide">Notes
              <textarea value={movement.notes} onChange={e => setMovement({ ...movement, notes: e.target.value })} rows="2" />
            </label>
            <datalist id="ic-locations">{locationOptions.map(name => <option key={name} value={name} />)}</datalist>
            <div className="ic-wide"><button className="ic-primary" type="submit"><Plus size={16} /> Save Draft</button></div>
          </form>
          <p className="ic-note">Saving creates a draft only. Post it from the Movement Register to update stock.</p>
        </section>
      )}

      {tab === "movements" && (
        <section className="ic-panel">
          <h2><ClipboardList size={19} /> Stock Movement Register</h2>
          <div className="ic-table-wrap">
            <table>
              <thead><tr><th>Number</th><th>Date</th><th>Type</th><th>Product / Lines</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {movements.map(row => <tr key={row.id}>
                  <td>{row.movement_no}</td><td>{row.movement_date}</td><td>{row.movement_type}</td>
                  <td>{row.lines.map(line => `${line.sku} × ${line.quantity}`).join(", ")}</td>
                  <td><span className={`ic-status ${row.status.toLowerCase()}`}>{row.status}</span></td>
                  <td>{row.status === "Draft" ? <button className="ic-post" onClick={() => postMovement(row)}>Post</button> : "Posted"}</td>
                </tr>)}
                {!movements.length && <tr><td colSpan="6" className="ic-empty">No stock movements created yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "warehouses" && (
        <section className="ic-panel">
          <h2><Warehouse size={19} /> Warehouse Locations</h2>
          <form onSubmit={saveWarehouse} className="ic-form">
            <label>Warehouse Code<input value={warehouse.code} onChange={e => setWarehouse({ ...warehouse, code: e.target.value })} required /></label>
            <label>Warehouse Name<input value={warehouse.name} onChange={e => setWarehouse({ ...warehouse, name: e.target.value })} required /></label>
            <label className="ic-wide">Address<input value={warehouse.address} onChange={e => setWarehouse({ ...warehouse, address: e.target.value })} /></label>
            <div className="ic-wide"><button className="ic-primary" type="submit"><Plus size={16} /> Add Warehouse</button></div>
          </form>
          <div className="ic-table-wrap">
            <table><thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Status</th></tr></thead>
              <tbody>{warehouses.map(w => <tr key={w.id}><td>{w.code}</td><td>{w.name}</td><td>{w.address || "—"}</td><td>{w.is_active ? "Active" : "Inactive"}</td></tr>)}
                {!warehouses.length && <tr><td colSpan="4" className="ic-empty">No warehouses created yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
