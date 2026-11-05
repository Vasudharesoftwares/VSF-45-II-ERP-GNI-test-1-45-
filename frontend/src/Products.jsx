import React, { useCallback, useEffect, useState } from "react";
import {
  Search, Plus, Package, BriefcaseBusiness, Boxes,
  RefreshCw, X, Save, Pencil, Power, Tag, Ruler,
  AlertCircle, CheckCircle2
} from "lucide-react";
import { apiFetch } from "./auth";
import {
  showSuccess,
  showError,
  showWarning,
  showConfirm
} from "./utils/alerts";
import "./Products.css";

const emptyForm = {
  sku: "", name: "", barcode: "", description: "",
  item_type: "product", category_id: "", unit_id: "",
  track_inventory: true, purchase_price: "0",
  selling_price: "0", tax_rate: "0",
  tax_inclusive: false, currency: "INR"
};

export default function Products({ companyId }) {
  const [resolvedCompanyId, setResolvedCompanyId] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [notice, setNotice] = useState(null);
  const [auxType, setAuxType] = useState("");
  const [auxForm, setAuxForm] = useState({
    code: "", name: "", symbol: "", decimal_places: 2
  });

  const activeCompanyId = companyId || resolvedCompanyId;
  const base = `/api/core/companies/${activeCompanyId}`;

  const notify = (message, type = "success") => {
    if (type === "error") {
      showError("Operation failed", message);
    } else if (type === "warning") {
      showWarning("Please check", message);
    } else {
      showSuccess("Success", message);
    }
  };

  // Resolve the company from the authenticated login session.
  useEffect(() => {
    if (companyId) return;
    let active = true;

    apiFetch("/api/auth/me")
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || "Could not identify the logged-in company.");
        }
        if (active) {
          setResolvedCompanyId(data.company_id ?? null);
        }
      })
      .catch(error => {
        if (active) notify(error.message, "error");
      });

    return () => { active = false; };
  }, [companyId]);

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || data.message || "Request failed.");
    }
    return data;
  };

  const loadData = useCallback(async () => {
    if (!activeCompanyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [p, c, u] = await Promise.all([
        request(`${base}/products?limit=500`),
        request(`${base}/product-categories`),
        request(`${base}/units`)
      ]);
      setProducts(p.items || []);
      setCategories(c || []);
      setUnits(u || []);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  };

  const openEdit = (item) => {
    setEditing(item.id);
    setForm({
      ...emptyForm,
      ...item,
      category_id: item.category_id || "",
      unit_id: item.unit_id || "",
      purchase_price: item.purchase_price || "0",
      selling_price: item.selling_price || "0",
      tax_rate: item.tax_rate || "0"
    });
    setModal(true);
  };

  const updateField = (key, value) => {
    setForm(current => ({
      ...current,
      [key]: value,
      ...(key === "item_type" && value !== "product"
        ? { track_inventory: false }
        : {})
    }));
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (saving) return;

    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      const invalid = formElement.querySelector(":invalid");
      showWarning("Please check the form", invalid?.validationMessage || "Please correct the highlighted fields.");
      invalid?.focus();
      return;
    }

    if (!String(form.name || "").trim()) {
      showWarning("Item name required", "Please enter an item name.");
      return;
    }
    if (!String(form.sku || "").trim()) {
      showWarning("Item code required", "Please enter an SKU or item code.");
      return;
    }
    if (!form.unit_id) {
      notify("Create or select a unit of measurement first.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        sku: form.sku.trim(),
        category_id: form.category_id ? Number(form.category_id) : null,
        unit_id: Number(form.unit_id),
        purchase_price: Number(form.purchase_price || 0),
        selling_price: Number(form.selling_price || 0),
        tax_rate: Number(form.tax_rate || 0),
        track_inventory: form.item_type === "product" && form.track_inventory
      };
      if (editing) {
        await request(`/api/core/products/${editing}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        notify("Item updated successfully.");
      } else {
        await request(`${base}/products`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
        notify("Item created successfully.");
      }
      setModal(false);
      await loadData();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const createAuxiliary = async (event) => {
    event.preventDefault();
    if (saving) return;

    const formElement = event.currentTarget;
    if (!formElement.checkValidity()) {
      const invalid = formElement.querySelector(":invalid");
      showWarning("Please check the form", invalid?.validationMessage || "Please complete the required fields.");
      invalid?.focus();
      return;
    }

    if (!auxForm.code.trim() || !auxForm.name.trim() ||
        (auxType === "unit" && !auxForm.symbol.trim())) {
      showWarning("Required field missing", "Please complete all required fields.");
      return;
    }

    setSaving(true);
    try {
      if (auxType === "unit") {
        await request(`${base}/units`, {
          method: "POST",
          body: JSON.stringify({
            code: auxForm.code,
            name: auxForm.name,
            symbol: auxForm.symbol,
            decimal_places: Number(auxForm.decimal_places)
          })
        });
      } else {
        await request(`${base}/product-categories`, {
          method: "POST",
          body: JSON.stringify({
            code: auxForm.code,
            name: auxForm.name
          })
        });
      }
      notify(auxType === "unit" ? "Unit created." : "Category created.");
      setAuxType("");
      setAuxForm({ code: "", name: "", symbol: "", decimal_places: 2 });
      await loadData();
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (item) => {
    const confirmed = await showConfirm(
      "Deactivate item?",
      `Are you sure you want to deactivate "${item.name}"?`,
      "Yes, deactivate"
    );

    if (!confirmed) return;
    try {
      await request(`/api/core/products/${item.id}/deactivate`, {
        method: "PATCH"
      });
      notify("Item deactivated.");
      await loadData();
    } catch (error) {
      notify(error.message, "error");
    }
  };

  const filtered = products.filter(item => {
    const term = search.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(term) ||
      item.sku.toLowerCase().includes(term) ||
      (item.barcode || "").toLowerCase().includes(term);
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && item.is_active) ||
      (filter === "inactive" && !item.is_active) ||
      item.item_type === filter;
    return matchesSearch && matchesFilter;
  });

  const activeCount = products.filter(p => p.is_active).length;
  const productCount = products.filter(p => p.item_type === "product").length;
  const serviceCount = products.filter(p => p.item_type !== "product").length;

  if (!activeCompanyId) {
    return (
      <div className="products-empty">
        <Package size={34} />
        <h2>Select a company</h2>
        <p>Choose an active company to manage its product catalogue.</p>
      </div>
    );
  }

  return (
    <section className="products-page">
      <header className="products-heading">
        <div>
          <span className="products-eyebrow">MASTER DATA / CATALOGUE</span>
          <h1>Products & Services</h1>
          <p>Manage the items your business buys, makes and sells.</p>
        </div>
        <button className="products-primary" onClick={openNew}>
          <Plus size={17} /> Add item
        </button>
      </header>

      {notice && (
        <div className={`products-notice ${notice.type}`}>
          {notice.type === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          {notice.message}
          <button onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}

      <div className="products-stats">
        <div className="products-stat">
          <span className="products-stat-icon"><Package size={19} /></span>
          <div><small>Total catalogue</small><strong>{products.length}</strong></div>
        </div>
        <div className="products-stat">
          <span className="products-stat-icon"><CheckCircle2 size={19} /></span>
          <div><small>Active items</small><strong>{activeCount}</strong></div>
        </div>
        <div className="products-stat">
          <span className="products-stat-icon"><Boxes size={19} /></span>
          <div><small>Physical products</small><strong>{productCount}</strong></div>
        </div>
        <div className="products-stat">
          <span className="products-stat-icon"><BriefcaseBusiness size={19} /></span>
          <div><small>Services & digital</small><strong>{serviceCount}</strong></div>
        </div>
      </div>

      <div className="products-toolbar">
        <div className="products-search">
          <Search size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by item name, SKU or barcode..."
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All items</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="product">Products</option>
          <option value="service">Services</option>
          <option value="digital">Digital</option>
        </select>
        <button className="products-secondary" onClick={loadData} title="Refresh">
          <RefreshCw size={17} />
        </button>
      </div>

      <div className="products-table-wrap">
        <table className="products-table">
          <thead>
            <tr>
              <th>ITEM DETAILS</th>
              <th>TYPE</th>
              <th>SKU / CODE</th>
              <th>SELLING PRICE</th>
              <th>TAX</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="products-placeholder">Loading catalogue...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan="7" className="products-placeholder">
                  <Package size={30} />
                  <strong>No items found</strong>
                  <span>Add your first product or service to get started.</span>
                </td>
              </tr>
            ) : filtered.map(item => (
              <tr key={item.id}>
                <td>
                  <div className="products-item-name">{item.name}</div>
                  <div className="products-item-sub">{item.description || "No description"}</div>
                </td>
                <td><span className={`products-type ${item.item_type}`}>{item.item_type}</span></td>
                <td className="products-code">{item.sku}</td>
                <td className="products-price">{item.currency} {Number(item.selling_price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                <td>{Number(item.tax_rate)}%</td>
                <td><span className={`products-status ${item.is_active ? "active" : "inactive"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <div className="products-actions">
                    <button title="Edit item" onClick={() => openEdit(item)}><Pencil size={16} /></button>
                    {item.is_active && <button title="Deactivate" onClick={() => deactivate(item)}><Power size={16} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="products-catalogue-tools">
        <div><Tag size={17} /><span><strong>{categories.length}</strong> categories</span></div>
        <button onClick={() => setAuxType("category")}> <Plus size={15} /> Add category</button>
        <div><Ruler size={17} /><span><strong>{units.length}</strong> units of measure</span></div>
        <button onClick={() => setAuxType("unit")}><Plus size={15} /> Add unit</button>
      </div>

      {modal && (
        <div className="products-overlay" onMouseDown={e => e.target === e.currentTarget && setModal(false)}>
          <form className="products-modal" onSubmit={saveProduct} noValidate>
            <div className="products-modal-head">
              <div><span className="products-eyebrow">CATALOGUE ENTRY</span><h2>{editing ? "Edit item" : "Add new item"}</h2></div>
              <button type="button" onClick={() => setModal(false)}><X size={20} /></button>
            </div>
            <div className="products-form-grid">
              <label>Item name *<input required value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Enter item name" /></label>
              <label>SKU / Item code *<input required value={form.sku} onChange={e => updateField("sku", e.target.value)} placeholder="e.g. ITEM-001" /></label>
              <label>Item type<select value={form.item_type} onChange={e => updateField("item_type", e.target.value)}><option value="product">Physical product</option><option value="service">Service</option><option value="digital">Digital item</option></select></label>
              <label>Unit of measure *<select required value={form.unit_id} onChange={e => updateField("unit_id", e.target.value)}><option value="">Select unit</option>{units.filter(u => u.is_active).map(u => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}</select></label>
              <label>Category<select value={form.category_id} onChange={e => updateField("category_id", e.target.value)}><option value="">Uncategorised</option>{categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Barcode<input value={form.barcode || ""} onChange={e => updateField("barcode", e.target.value)} placeholder="Optional barcode" /></label>
              <label>Purchase price<input type="number" min="0" step="0.01" value={form.purchase_price} onChange={e => updateField("purchase_price", e.target.value)} /></label>
              <label>Selling price<input type="number" min="0" step="0.01" value={form.selling_price} onChange={e => updateField("selling_price", e.target.value)} /></label>
              <label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => updateField("tax_rate", e.target.value)} /></label>
              <label>Currency<input maxLength="3" value={form.currency} onChange={e => updateField("currency", e.target.value.toUpperCase())} /></label>
              <label className="products-full">Description<textarea rows="3" value={form.description || ""} onChange={e => updateField("description", e.target.value)} placeholder="Item description, specifications or notes..." /></label>
            </div>
            <div className="products-checks">
              {form.item_type === "product" && <label><input type="checkbox" checked={form.track_inventory} onChange={e => updateField("track_inventory", e.target.checked)} /> Track inventory for this item</label>}
              <label><input type="checkbox" checked={form.tax_inclusive} onChange={e => updateField("tax_inclusive", e.target.checked)} /> Selling price includes tax</label>
            </div>
            <div className="products-modal-actions">
              <button type="button" className="products-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="products-primary" disabled={saving}><Save size={16} /> {saving ? "Saving..." : editing ? "Save changes" : "Create item"}</button>
            </div>
          </form>
        </div>
      )}

      {auxType && (
        <div className="products-overlay">
          <form className="products-modal products-aux-modal" onSubmit={createAuxiliary} noValidate>
            <div className="products-modal-head">
              <div><span className="products-eyebrow">CATALOGUE SETTINGS</span><h2>New {auxType === "unit" ? "unit of measure" : "category"}</h2></div>
              <button type="button" onClick={() => setAuxType("")}><X size={20} /></button>
            </div>
            <div className="products-form-grid">
              <label>Code *<input required value={auxForm.code} onChange={e => setAuxForm({ ...auxForm, code: e.target.value })} placeholder="e.g. KG" /></label>
              <label>Name *<input required value={auxForm.name} onChange={e => setAuxForm({ ...auxForm, name: e.target.value })} placeholder={auxType === "unit" ? "Kilogram" : "Raw Materials"} /></label>
              {auxType === "unit" && <>
                <label>Symbol *<input required value={auxForm.symbol} onChange={e => setAuxForm({ ...auxForm, symbol: e.target.value })} placeholder="kg" /></label>
                <label>Decimal places<input type="number" min="0" max="6" value={auxForm.decimal_places} onChange={e => setAuxForm({ ...auxForm, decimal_places: e.target.value })} /></label>
              </>}
            </div>
            <div className="products-modal-actions">
              <button type="button" className="products-secondary" onClick={() => setAuxType("")}>Cancel</button>
              <button className="products-primary" disabled={saving}><Save size={16} /> {saving ? "Saving..." : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
