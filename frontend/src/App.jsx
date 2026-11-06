import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, ShoppingCart, Package, Factory, Users, Calculator,
  CalendarCheck, BarChart3, Settings, Search, Bell, Plus,
  Clock3, Boxes, ClipboardList, FileText, Menu, X,
  Trash2, Pencil, Download, RefreshCw, CheckCircle2, PhoneCall, ClipboardCheck, Building2, PackageCheck } from "lucide-react";
import "./index.css";
import Calculators from "./Calculators";

import Products from "./Products";
import Customers from "./Customers";
import Enquiries from "./Enquiries";
import Calling from "./Calling";
import Quotations from "./Quotations";
import SalesOrders from "./SalesOrders";
import Vendors from "./Vendors";
import PurchaseOrders from "./PurchaseOrders";
import GoodsReceipts from "./GoodsReceipts";
import InventoryControl from "./InventoryControl";
import Production from "./Production";
import QualityControl from "./QualityControl";
import Dispatch from "./Dispatch";
import Finance from "./Finance";
import Accounting from "./Accounting";
import Login from "./Login";
import { getCurrentUser, logout } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";
const API = "http://127.0.0.1:8000";

const modules = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "enquiries", label: "Enquiries", icon: ClipboardList },
  { id: "calling", label: "Calling & Follow-ups", icon: PhoneCall },
  { id: "quotations", label: "Quotations", icon: FileText },
  { id: "salesorders", label: "Sales Orders", icon: ClipboardCheck },
  { id: "vendors", label: "Vendors", icon: Building2 },
  { id: "purchaseorders", label: "Purchase Orders", icon: ShoppingCart },
  { id: "goodsreceipts", label: "Goods Receipts (GRN)", icon: PackageCheck },
  { id: "inventorycontrol", label: "Inventory Control", icon: Package },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "production", label: "Production", icon: Factory },
  { id: "qualitycontrol", label: "Quality Control", icon: ClipboardCheck },
  { id: "dispatch", label: "Dispatch & Delivery", icon: ClipboardCheck },
  { id: "accounting", label: "General Accounting", icon: Calculator },
  { id: "finance", label: "Finance & Invoicing", icon: FileText },
  { id: "employees", label: "Employees & Tasks", icon: Users },
  { id: "attendance", label: "Attendance & Payroll", icon: CalendarCheck },
  { id: "calculators", label: "Calculators", icon: Calculator },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

const configs = {
  orders: {
    title: "Orders",
    description: "Manage customer orders, delivery schedules and order documents.",
    action: "Create Order",
    fields: [
      ["customer", "Customer Name", "text", true],
      ["product", "Product", "text", true],
      ["quantity", "Quantity", "text", true],
      ["rate", "Rate", "number"],
      ["delivery_date", "Delivery Date", "date"],
      ["status", "Order Status", "select", false, ["Received", "In Progress", "Delivered", "On Hold"]],
      ["notes", "Notes", "textarea"],
    ],
    columns: ["customer", "product", "quantity", "delivery_date", "status"],
    labels: ["Customer", "Product", "Quantity", "Delivery Date", "Status"],
  },
  inventory: {
    title: "Inventory",
    description: "Track raw materials, finished goods and stock movements.",
    action: "Add Stock Item",
    fields: [
      ["name", "Item Name", "text", true],
      ["category", "Category", "select", true, ["Raw Material", "Finished Goods", "Consumables"]],
      ["quantity", "Available Quantity", "number", true],
      ["unit", "Unit", "select", true, ["Kg", "Ton", "Pieces", "Packets"]],
      ["minimum_stock", "Minimum Stock Level", "number"],
      ["notes", "Notes", "textarea"],
    ],
    columns: ["name", "category", "quantity", "unit", "minimum_stock"],
    labels: ["Item", "Category", "Quantity", "Unit", "Minimum Stock"],
  },
  production: {
    title: "Production",
    description: "Manage production batches, material usage and wastage.",
    action: "New Production Batch",
    fields: [
      ["batch_name", "Batch Name / ID", "text", true],
      ["product", "Product", "text", true],
      ["planned_quantity", "Planned Quantity", "number", true],
      ["produced_quantity", "Produced Quantity", "number"],
      ["material_used", "Material Used", "number"],
      ["wastage", "Wastage", "number"],
      ["start_date", "Start Date", "date"],
      ["status", "Status", "select", false, ["Planned", "In Progress", "Completed", "On Hold"]],
    ],
    columns: ["batch_name", "product", "planned_quantity", "produced_quantity", "wastage", "status"],
    labels: ["Batch", "Product", "Planned", "Produced", "Wastage", "Status"],
  },
  employees: {
    title: "Employees & Tasks",
    description: "Manage employee records and assign work with progress updates.",
    action: "Add Employee / Task",
    fields: [
      ["type", "Record Type", "select", true, ["Employee", "Task"]],
      ["name", "Employee / Task Name", "text", true],
      ["employee", "Assigned Employee", "text"],
      ["description", "Description / Work Details", "textarea"],
      ["priority", "Priority", "select", false, ["Low", "Medium", "High", "Urgent"]],
      ["due_date", "Due Date", "date"],
      ["status", "Status", "select", false, ["Pending", "In Progress", "Completed", "Blocked"]],
      ["progress", "Progress (%)", "number"],
      ["work_update", "Employee Work Update", "textarea"],
    ],
    columns: ["type", "name", "employee", "priority", "due_date", "progress", "status"],
    labels: ["Type", "Name", "Employee", "Priority", "Due Date", "Progress", "Status"],
  },
  attendance: {
    title: "Attendance & Payroll",
    description: "Maintain employee attendance, overtime and salary records.",
    action: "Add Attendance / Payroll",
    fields: [
      ["type", "Entry Type", "select", true, ["Attendance", "Payroll"]],
      ["employee", "Employee Name", "text", true],
      ["date", "Date", "date"],
      ["attendance_status", "Attendance", "select", false, ["Present", "Absent", "Leave", "Half Day"]],
      ["overtime_hours", "Overtime Hours", "number"],
      ["salary", "Salary Amount", "number"],
      ["payment_status", "Payment Status", "select", false, ["Pending", "Paid"]],
      ["notes", "Notes", "textarea"],
    ],
    columns: ["type", "employee", "date", "attendance_status", "overtime_hours", "salary", "payment_status"],
    labels: ["Type", "Employee", "Date", "Attendance", "Overtime", "Salary", "Payment"],
  },
};

const money = (v) => v === undefined || v === "" ? "—" : `₹${v}`;

function Status({ value }) {
  if (!value) return "—";
  const cls = String(value).toLowerCase().replaceAll(" ", "-");
  return <span className={`status ${cls}`}>{value}</span>;
}

function Workspace({ onLogout }) {
  const [active, setActive] = useState(() => { try { return localStorage.getItem("vsf_active_page") || "dashboard"; } catch { return "dashboard"; } });
  const [records, setRecords] = useState([]);
  const [dashboard, setDashboard] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const loadDashboard = async () => {
    try {
      const res = await fetch(`${API}/api/dashboard`);
      if (!res.ok) throw new Error("Could not load dashboard");
      setDashboard(await res.json());
    } catch {
      setError("Backend not connected. Start the FastAPI server in Terminal.");
    }
  };

  const loadRecords = async () => {
    if (!configs[active]) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/${active}`);
      if (!res.ok) throw new Error("Unable to load records");
      setRecords(await res.json());
    } catch (e) {
      setError(`${e.message}. Check that the backend is running.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);
  useEffect(() => { loadRecords(); }, [active]);

  const filtered = useMemo(() => records.filter((r) =>
    JSON.stringify(r.data).toLowerCase().includes(search.toLowerCase())
  ), [records, search]);

  const openNew = () => {
    setEditing(null);
    setForm({});
    setModal(true);
  };

  const openEdit = (record) => {
    setEditing(record);
    setForm(record.data);
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;

    const formElement = e.currentTarget;
    if (!formElement.checkValidity()) {
      const invalid = formElement.querySelector(":invalid");
      showWarning("Please check the form", invalid?.validationMessage || "Please correct the highlighted fields.");
      invalid?.focus();
      return;
    }

    const missingField = config.fields.find(([key, label, type, required]) =>
      required && String(form[key] ?? "").trim() === ""
    );
    if (missingField) {
      showWarning("Required field missing", `Please enter ${missingField[1]}.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const url = editing
        ? `${API}/api/${active}/${editing.id}`
        : `${API}/api/${active}`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: form }),
      });
      if (!res.ok) throw new Error("Could not save record");
      setModal(false);
      showSuccess(
        editing ? "Record updated successfully" : "Record created successfully"
      );
      await loadRecords();
      await loadDashboard();
    } catch (e) {
      showError("Save failed", e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    const confirmed = await showConfirm(
      "Delete this record?",
      "This record will be permanently deleted. This action cannot be undone.",
      "Yes, delete"
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`${API}/api/${active}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await loadRecords();
      await loadDashboard();
      showSuccess("Record deleted successfully");
    } catch (e) {
      showError("Delete failed", e.message);
    }
  };

  const exportOrder = (id) => window.open(`${API}/api/orders/${id}/pdf`, "_blank");

  const go = (id) => {
  try { localStorage.setItem("vsf_active_page", id); } catch {}

    setActive(id);
    setSearch("");
    setMobileOpen(false);
    setError("");
  };

  const statCards = [
    ["Total Orders", dashboard.orders ?? 0, ShoppingCart, "blue"],
    ["Pending Orders", dashboard.pending_orders ?? 0, Clock3, "orange"],
    ["Inventory Items", dashboard.inventory_items ?? 0, Boxes, "green"],
    ["Employees", dashboard.employees ?? 0, Users, "purple"],
  ];

  const config = configs[active];

  return (
    <div className="app">
      {mobileOpen && <div className="overlay" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">V</div>
          <div><b>VASUDHARE</b><small>SALESFORCE</small></div>
          <button className="close-menu" onClick={() => setMobileOpen(false)}><X /></button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {modules.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${active === id ? "active" : ""}`} onClick={() => go(id)}>
              <Icon size={19}/><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={`nav-item ${active === "settings" ? "active" : ""}`} onClick={() => go("settings")}>
            <Settings size={19}/><span>Settings</span>
          </button>
          <div className="profile"><div className="avatar">AD</div><div><b>Administrator</b><small>Owner account</small></div><i/></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-left">
            <button className="menu-button" onClick={() => setMobileOpen(true)}><Menu/></button>
            <span>Workspace <b>/</b> {modules.find(m => m.id === active)?.label || "Settings"}</span>
          </div>
          <div className="top-actions">
            <div className="global-search"><Search size={16}/><input placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)}/></div>
            <button className="bell"><Bell size={19}/></button>
            <button className="auth-signout" onClick={onLogout}>Sign out</button>
            <div className="avatar">AD</div>
          </div>
        </header>

        <div className="content">
          {error && <div className="alert error">{error}</div>}

          {active === "accounting" ? (<Accounting />) : active === "finance" ? (<Finance />) : active === "dispatch" ? (<Dispatch />) : active === "qualitycontrol" ? (<QualityControl />) : active === "production" ? (<Production />) : active === "inventorycontrol" ? (<InventoryControl />) : active === "goodsreceipts" ? (<GoodsReceipts />) : active === "purchaseorders" ? (<PurchaseOrders />) : active === "vendors" ? (<Vendors />) : active === "salesorders" ? (<SalesOrders />) : active === "quotations" ? (<Quotations />) : active === "calling" ? (<Calling />) : active === "customers" ? (<Customers />) : active === "enquiries" ? (<Enquiries />) : active === "inventory" ? (<Products />) : active === "dashboard" ? (
            <>
              <div className="page-heading">
                <div><label>BUSINESS OVERVIEW</label><h1>Good morning, Administrator</h1><p>Here is what's happening in your business today.</p></div>
                <button className="primary" onClick={() => go("orders")}><Plus size={17}/> Create New Order</button>
              </div>
              <div className="stat-grid">
                {statCards.map(([label, value, Icon, tone]) => <div className="stat-card" key={label}>
                  <div className={`stat-icon ${tone}`}><Icon size={21}/></div>
                  <div className="stat-label">{label}</div><div className="stat-value">{value}</div>
                  <div className="stat-note">Live database records</div>
                </div>)}
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading"><div><h2>Recent Orders</h2><p>Latest customer order activity</p></div><button className="link" onClick={() => go("orders")}>View all →</button></div>
                  <RecentOrders/>
                </section>
                <section className="panel">
                  <div className="panel-heading"><div><h2>Quick Actions</h2><p>Common business activities</p></div></div>
                  <div className="quick-actions">
                    <button onClick={() => go("orders")}><ShoppingCart/><span><b>Create Order</b><small>Record a customer order</small></span></button>
                    <button onClick={() => go("inventory")}><Package/><span><b>Update Inventory</b><small>Add or update stock</small></span></button>
                    <button onClick={() => go("employees")}><ClipboardList/><span><b>Assign Task</b><small>Give work to an employee</small></span></button>
                    <button onClick={() => go("reports")}><FileText/><span><b>View Reports</b><small>Review business activity</small></span></button>
                  </div>
                </section>
              </div>
              <section className="panel overview-panel">
                <div className="panel-heading"><div><h2>Business Modules</h2><p>Quick overview of your management sections</p></div></div>
                <div className="module-shortcuts">
                  {modules.slice(1).map(m => <button key={m.id} onClick={() => go(m.id)}><m.icon/><span>{m.label}</span><b>→</b></button>)}
                </div>
              </section>
            </>
          ) : config ? (
            <>
              <div className="page-heading">
                <div><label>MANAGEMENT MODULE</label><h1>{config.title}</h1><p>{config.description}</p></div>
                <button className="primary" onClick={openNew}><Plus size={17}/>{config.action}</button>
              </div>
              <div className="module-toolbar">
                <span>{filtered.length} records</span>
                <button className="secondary" onClick={loadRecords}><RefreshCw size={15}/> Refresh</button>
              </div>
              <section className="panel records-panel">
                {loading ? <div className="empty">Loading records...</div> : filtered.length === 0 ? (
                  <div className="empty"><div className="empty-icon"><Boxes size={25}/></div><h3>No records yet</h3><p>Add your first record to get started.</p><button className="primary" onClick={openNew}><Plus size={16}/> {config.action}</button></div>
                ) : (
                  <div className="table-wrap"><table><thead><tr>{config.labels.map(l => <th key={l}>{l}</th>)}<th>ACTIONS</th></tr></thead>
                    <tbody>{filtered.map(record => <tr key={record.id}>
                      {config.columns.map((col, i) => <td key={col}>{col === "status" || col === "payment_status" || col === "attendance_status" ? <Status value={record.data[col]}/> : col === "salary" ? money(record.data[col]) : record.data[col] || "—"}</td>)}
                      <td><div className="row-actions">
                        {active === "orders" && <button title="Download order PDF" onClick={() => exportOrder(record.id)}><Download size={15}/></button>}
                        <button title="Edit" onClick={() => openEdit(record)}><Pencil size={15}/></button>
                        <button title="Delete" className="danger" onClick={() => remove(record.id)}><Trash2 size={15}/></button>
                      </div></td>
                    </tr>)}</tbody>
                  </table></div>
                )}
              </section>
            </>
          ) : active === "calculators" ? (
            <Calculators />
          ) : active === "reports" ? (
            <>
              <div className="page-heading"><div><label>BUSINESS INTELLIGENCE</label><h1>Reports</h1><p>Review current business records and summaries.</p></div></div>
              <div className="stat-grid">
                {statCards.map(([label,value,Icon,tone])=><div className="stat-card" key={label}><div className={`stat-icon ${tone}`}><Icon/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}
              </div>
              <section className="panel report-panel"><div className="panel-heading"><div><h2>Available Reports</h2><p>Download order documents or review records in each module.</p></div></div>
                {modules.slice(1,6).map(m=><button className="report-link" key={m.id} onClick={()=>go(m.id)}><m.icon size={19}/><span>{m.label}</span><b>Open →</b></button>)}
              </section>
            </>
          ) : (
            <div className="page-heading"><div><label>APPLICATION</label><h1>Settings</h1><p>System preferences and access management will be added here.</p></div></div>
          )}
          <footer>VASUDHARE SALESFORCE <span>•</span> Industrial Order, Inventory & Workforce Management System</footer>
        </div>
      </main>

      {modal && config && (
        <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget) setModal(false);}}>
          <form className="modal" onSubmit={save} noValidate>
            <div className="modal-heading"><div><h2>{editing ? "Edit Record" : config.action}</h2><p>Enter the information below.</p></div><button type="button" className="close-modal" onClick={() => setModal(false)}><X/></button></div>
            <div className="form-grid">
              {config.fields.map(([key,label,type,required,options]) => (
                <label className={type === "textarea" ? "full-field" : ""} key={key}>
                  <span>{label}{required && <i> *</i>}</span>
                  {type === "select" ? <select required={!!required} value={form[key] || ""} onChange={e => setForm({...form,[key]:e.target.value})}><option value="">Select...</option>{options.map(o=><option key={o}>{o}</option>)}</select>
                  : type === "textarea" ? <textarea rows="3" value={form[key] || ""} onChange={e=>setForm({...form,[key]:e.target.value})}/>
                  : <input type={type} required={!!required} min={type==="number" ? "0" : undefined} value={form[key] || ""} onChange={e=>setForm({...form,[key]:e.target.value})}/>}
                </label>
              ))}
            </div>
            <div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(false)}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Save Record"}</button></div>
          </form>
        </div>
      )}
    </div>
  );
}


function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function verifySession() {
      try {
        const currentUser = await getCurrentUser();
        if (mounted) setUser(currentUser);
      } catch (error) {
        if (mounted) setAuthError("Unable to contact the server. Please check that the backend is running.");
      } finally {
        if (mounted) setChecking(false);
      }
    }

    const handleExpired = () => {
      if (mounted) {
        setUser(null);
        setAuthError("Your session has expired. Please sign in again.");
      }
    };

    window.addEventListener("vasudhare:session-expired", handleExpired);
    verifySession();

    return () => {
      mounted = false;
      window.removeEventListener("vasudhare:session-expired", handleExpired);
    };
  }, []);

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setAuthError("");
  }

  async function handleLogout() {
    const confirmed = await showConfirm(
      "Sign out?",
      "Are you sure you want to sign out of your workspace?",
      "Yes, sign out"
    );

    if (!confirmed) return;

    let logoutError = null;

    try {
      await logout();
    } catch (err) {
      logoutError = err;
    } finally {
      setUser(null);
      setAuthError("");
    }

    if (logoutError) {
      await showError(
        "Sign out completed locally",
        logoutError.message || "Your session was closed on this device."
      );
    } else {
      await showSuccess("Signed out", "You have been securely signed out.");
    }
  }

  if (checking) {
    return <div style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      fontFamily: "Arial, sans-serif",
      color: "#334155"
    }}>Verifying secure workspace access...</div>;
  }

  if (!user) {
    return (
      <>
        {authError && (
          <div role="alert" style={{
            padding: "12px 20px",
            color: "#991b1b",
            background: "#fee2e2",
            textAlign: "center"
          }}>{authError}</div>
        )}
        <Login onLogin={handleLogin} />
      </>
    );
  }

  return <Workspace onLogout={handleLogout} />;
}

function RecentOrders() {
  const [orders, setOrders] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/orders`).then(r => r.json()).then(setOrders).catch(() => setOrders([]));
  }, []);
  return orders.length ? <div className="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PRODUCT</th><th>STATUS</th></tr></thead><tbody>
    {orders.slice(0,5).map(o=><tr key={o.id}><td className="order-id">ORD-{String(o.id).padStart(4,"0")}</td><td>{o.data.customer}</td><td>{o.data.product}</td><td><Status value={o.data.status}/></td></tr>)}
  </tbody></table></div> : <div className="small-empty">No customer orders recorded yet.</div>;
}

export default App;
