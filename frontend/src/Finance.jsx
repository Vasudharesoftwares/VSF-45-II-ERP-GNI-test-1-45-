import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./auth";
import { showSuccess, showError, showWarning, showConfirm } from "./utils/alerts";
import "./Finance.css";

const money = value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));

export default function Finance() {
  const [companyId, setCompanyId] = useState(null);
  const [tab, setTab] = useState("invoices");
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [cashTransactions, setCashTransactions] = useState([]);
  const [expenseSummary, setExpenseSummary] = useState({
    total_approved: 0, total_paid: 0, total_unpaid: 0, by_category: []
  });
  const [categoryForm, setCategoryForm] = useState({name: "", description: ""});
  const [accountForm, setAccountForm] = useState({
    account_code: "", account_name: "", account_type: "bank",
    bank_name: "", account_number: "", opening_balance: "0"
  });
  const [expenseForm, setExpenseForm] = useState({
    category_id: "", expense_date: new Date().toISOString().slice(0, 10),
    payee: "", description: "", amount: "", reference_no: "", notes: ""
  });
  const [payingExpenseId, setPayingExpenseId] = useState(null);
  const [expensePayAccountId, setExpensePayAccountId] = useState("");
  const [transactionForm, setTransactionForm] = useState({
    account_id: "", to_account_id: "",
    transaction_type: "receipt",
    transaction_date: new Date().toISOString().slice(0, 10),
    amount: "", reference_no: "", description: ""
  });
  const [taxProfile, setTaxProfile] = useState({
    legal_name: "", gstin: "", address: "", city: "",
    state: "", state_code: "", postal_code: "", phone: "", email: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: "",
    sales_order_id: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    place_of_supply: "",
    notes: ""
  });
  const [paymentForm, setPaymentForm] = useState({
    invoice_id: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amount: "",
    payment_mode: "Bank Transfer",
    reference_no: "",
    notes: ""
  });

  const request = async (path, options = {}) => {
    const response = await apiFetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "Finance request failed.");
    return data;
  };

  useEffect(() => {
    let alive = true;
    apiFetch("/api/auth/me")
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Unable to identify company.");
        if (alive) setCompanyId(data.company_id);
      })
      .catch(err => {
        if (alive) {
          setError(err.message);
          showError("Finance", err.message);
        }
      });
    return () => { alive = false; };
  }, []);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const profileData = await request(`/api/finance/companies/${companyId}/tax-profile`);
      setTaxProfile({
        legal_name: profileData.legal_name || "",
        gstin: profileData.gstin || "",
        address: profileData.address || "",
        city: profileData.city || "",
        state: profileData.state || "",
        state_code: profileData.state_code || "",
        postal_code: profileData.postal_code || "",
        phone: profileData.phone || "",
        email: profileData.email || ""
      });
      const [
        invoiceData, customerData, orderData, paymentData,
        categoryData, expenseData, accountData, transactionData, summaryData
      ] = await Promise.all([
        request(`/api/finance/companies/${companyId}/invoices`),
        request(`/api/crm/companies/${companyId}/customers`),
        request(`/api/sales/companies/${companyId}/orders`),
        request(`/api/finance/companies/${companyId}/payments`),
        request(`/api/finance/companies/${companyId}/expense-categories`),
        request(`/api/finance/companies/${companyId}/expenses`),
        request(`/api/finance/companies/${companyId}/cash-bank-accounts`),
        request(`/api/finance/companies/${companyId}/cash-bank-transactions`),
        request(`/api/finance/companies/${companyId}/expense-summary`)
      ]);
      setInvoices(Array.isArray(invoiceData) ? invoiceData : invoiceData.items || []);
      setCustomers(Array.isArray(customerData) ? customerData : customerData.items || []);
      setOrders(Array.isArray(orderData) ? orderData : orderData.items || []);
      setPayments(Array.isArray(paymentData) ? paymentData : paymentData.items || []);
      setExpenseCategories(categoryData.items || []);
      setExpenses(expenseData.items || []);
      setCashAccounts(accountData.items || []);
      setCashTransactions(transactionData.items || []);
      setExpenseSummary(summaryData || {
        total_approved: 0, total_paid: 0, total_unpaid: 0, by_category: []
      });
    } catch (err) {
      setError(err.message);
      showError("Unable to load Finance", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [companyId]);

  const outstanding = useMemo(
    () => invoices.reduce((sum, item) => sum + Number(item.balance_due || 0), 0),
    [invoices]
  );
  const invoiced = useMemo(
    () => invoices.reduce((sum, item) => sum + Number(item.grand_total || 0), 0),
    [invoices]
  );
  const received = useMemo(
    () => payments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [payments]
  );

  const createInvoice = async event => {
    event.preventDefault();
    if (!invoiceForm.customer_id) return showWarning("Select a customer.");
    if (!invoiceForm.sales_order_id) return showWarning("Select a sales order.");
    try {
      await request(`/api/finance/companies/${companyId}/invoices`, {
        method: "POST",
        body: JSON.stringify({
          ...invoiceForm,
          customer_id: Number(invoiceForm.customer_id),
          sales_order_id: Number(invoiceForm.sales_order_id)
        })
      });
      showSuccess("Invoice created successfully.");
      setInvoiceForm({
        customer_id: "",
        sales_order_id: "",
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: "",
        place_of_supply: "",
        notes: ""
      });
      await load();
    } catch (err) {
      showError("Invoice could not be created", err.message);
    }
  };

  const createPayment = async event => {
    event.preventDefault();
    if (!paymentForm.invoice_id || Number(paymentForm.amount) <= 0) {
      return showWarning("Select an invoice and enter a valid payment amount.");
    }
    try {
      await request(`/api/finance/companies/${companyId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          ...paymentForm,
          invoice_id: Number(paymentForm.invoice_id),
          amount: Number(paymentForm.amount)
        })
      });
      showSuccess("Payment receipt recorded.");
      setPaymentForm({
        invoice_id: "",
        payment_date: new Date().toISOString().slice(0, 10),
        amount: "",
        payment_mode: "Bank Transfer",
        reference_no: "",
        notes: ""
      });
      await load();
    } catch (err) {
      showError("Payment could not be recorded", err.message);
    }
  };

  
  const saveTaxProfile = async event => {
    event.preventDefault();
    try {
      await request(`/api/finance/companies/${companyId}/tax-profile`, {
        method: "PUT",
        body: JSON.stringify(taxProfile)
      });
      showSuccess("GST company profile saved.");
      await load();
    } catch (err) {
      showError("Unable to save GST profile", err.message);
    }
  };

const issueInvoice = async invoice => {
    const confirmed = await showConfirm(
      "Issue this invoice?",
      "The invoice will be marked as issued."
    );
    if (!confirmed) return;
    try {
      await request(`/api/finance/invoices/${invoice.id}/issue`, { method: "PATCH" });
      showSuccess("Invoice issued.");
      await load();
    } catch (err) {
      showError("Unable to issue invoice", err.message);
    }
  };

  const createCategory = async event => {
    event.preventDefault();
    if (!categoryForm.name.trim()) return showWarning("Enter a category name.");
    try {
      await request(`/api/finance/companies/${companyId}/expense-categories`, {
        method: "POST", body: JSON.stringify(categoryForm)
      });
      showSuccess("Expense category created.");
      setCategoryForm({name: "", description: ""});
      await load();
    } catch (err) {
      showError("Unable to create category", err.message);
    }
  };

  const createCashAccount = async event => {
    event.preventDefault();
    if (!accountForm.account_code.trim() || !accountForm.account_name.trim()) {
      return showWarning("Enter an account code and account name.");
    }
    try {
      await request(`/api/finance/companies/${companyId}/cash-bank-accounts`, {
        method: "POST",
        body: JSON.stringify({
          ...accountForm, opening_balance: Number(accountForm.opening_balance || 0)
        })
      });
      showSuccess("Cash/bank account created.");
      setAccountForm({
        account_code: "", account_name: "", account_type: "bank",
        bank_name: "", account_number: "", opening_balance: "0"
      });
      await load();
    } catch (err) {
      showError("Unable to create account", err.message);
    }
  };

  const createExpense = async event => {
    event.preventDefault();
    if (!expenseForm.category_id || !expenseForm.payee.trim() ||
        Number(expenseForm.amount) <= 0) {
      return showWarning("Select a category, enter a payee and a valid amount.");
    }
    try {
      await request(`/api/finance/companies/${companyId}/expenses`, {
        method: "POST",
        body: JSON.stringify({
          ...expenseForm, category_id: Number(expenseForm.category_id),
          amount: Number(expenseForm.amount)
        })
      });
      showSuccess("Expense voucher created as Draft.");
      setExpenseForm({
        category_id: "", expense_date: new Date().toISOString().slice(0, 10),
        payee: "", description: "", amount: "", reference_no: "", notes: ""
      });
      await load();
    } catch (err) {
      showError("Unable to create expense", err.message);
    }
  };

  const approveExpense = async expense => {
    const confirmed = await showConfirm(
      "Approve expense voucher?",
      `${expense.voucher_no} — ${money(expense.amount)}`
    );
    if (!confirmed) return;
    try {
      await request(`/api/finance/expenses/${expense.id}/approve`, {method: "PATCH"});
      showSuccess("Expense approved.");
      await load();
    } catch (err) {
      showError("Unable to approve expense", err.message);
    }
  };

  const payExpense = expense => {
    const availableAccounts = cashAccounts.filter(a => a.is_active);
    if (!availableAccounts.length) {
      return showWarning("Create an active cash/bank account before paying an expense.");
    }
    setPayingExpenseId(expense.id);
    setExpensePayAccountId(String(availableAccounts[0].id));
  };

  const confirmExpensePayment = async expense => {
    if (!expensePayAccountId) {
      return showWarning("Select the cash/bank account to pay from.");
    }
    const account = cashAccounts.find(a => String(a.id) === String(expensePayAccountId));
    if (!account) return showWarning("Please select a valid account.");

    const confirmed = await showConfirm(
      "Pay this expense?",
      `${expense.voucher_no} — ${money(expense.amount)} from ${account.account_name}.`
    );
    if (!confirmed) return;

    try {
      await request(`/api/finance/expenses/${expense.id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({account_id: Number(expensePayAccountId)})
      });
      setPayingExpenseId(null);
      setExpensePayAccountId("");
      showSuccess("Expense payment recorded.");
      await load();
    } catch (err) {
      showError("Unable to pay expense", err.message);
    }
  };

  const createCashTransaction = async event => {
    event.preventDefault();
    if (!transactionForm.account_id || Number(transactionForm.amount) <= 0) {
      return showWarning("Select an account and enter a valid amount.");
    }
    if (transactionForm.transaction_type === "transfer" &&
        !transactionForm.to_account_id) {
      return showWarning("Select the destination account.");
    }
    const confirmed = await showConfirm(
      "Post this cash/bank transaction?",
      "This will immediately update the account balance."
    );
    if (!confirmed) return;
    try {
      await request(`/api/finance/companies/${companyId}/cash-bank-transactions`, {
        method: "POST",
        body: JSON.stringify({
          ...transactionForm,
          account_id: Number(transactionForm.account_id),
          to_account_id: transactionForm.to_account_id
            ? Number(transactionForm.to_account_id) : undefined,
          amount: Number(transactionForm.amount)
        })
      });
      showSuccess("Cash/bank transaction posted.");
      setTransactionForm({
        account_id: "", to_account_id: "", transaction_type: "receipt",
        transaction_date: new Date().toISOString().slice(0, 10),
        amount: "", reference_no: "", description: ""
      });
      await load();
    } catch (err) {
      showError("Unable to post transaction", err.message);
    }
  };

  const printInvoice = invoice => {
    const win = window.open("", "_blank");
    if (!win) return showWarning("Allow pop-ups to print invoices.");
    const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
    win.document.write(`
      <!doctype html><html><head><title>${safe(invoice.invoice_no || "Invoice")}</title>
      <style>body{font:14px Arial;margin:35px;color:#222}h1{text-align:center}
      table{width:100%;border-collapse:collapse;margin-top:25px}
      th,td{border:1px solid #bbb;padding:9px;text-align:left}
      .right{text-align:right}.muted{color:#666}</style></head><body>
      <h1>TAX INVOICE</h1><h2>${safe(invoice.invoice_no)}</h2>
      <p>Customer: ${safe(invoice.customer_name)}</p>
      <p>Invoice date: ${safe(invoice.invoice_date)} | Due: ${safe(invoice.due_date)}</p>
      <p>GSTIN: ${safe(invoice.customer_gstin || "—")}</p>
      <table><tr><th>Description</th><th>Qty</th><th>Taxable</th><th>Tax</th><th>Total</th></tr>
      ${(invoice.lines || []).map(line => `<tr><td>${safe(line.description)}</td>
      <td>${safe(line.quantity)}</td><td>${money(line.taxable_amount)}</td>
      <td>${money(line.tax_amount)}</td><td>${money(line.line_total)}</td></tr>`).join("")}
      </table><h3 class="right">Grand Total: ${money(invoice.grand_total)}</h3>
      <p class="right">Balance Due: ${money(invoice.balance_due)}</p>
      <p class="muted">${safe(invoice.notes || "")}</p>
      <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="finance-page">
      <div className="finance-heading">
        <div>
          <span className="finance-eyebrow">ACCOUNTS & RECEIVABLES</span>
          <h1>Finance Management</h1>
          <p>GST invoices, receipts and customer balances.</p>
        </div>
        <button className="finance-refresh" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="finance-stats">
        <div><span>Total Invoiced</span><strong>{money(invoiced)}</strong></div>
        <div><span>Payments Received</span><strong>{money(received)}</strong></div>
        <div><span>Outstanding</span><strong>{money(outstanding)}</strong></div>
        <div><span>Invoices</span><strong>{invoices.length}</strong></div>
      </div>

      <div className="finance-tabs">
        {[
          ["invoices", "Invoices"],
          ["new-invoice", "Create Invoice"],
          ["payments", "Payments"],
          ["new-payment", "Record Payment"],
          ["receivables", "Receivables"],
          ["tax-profile", "GST Settings"],
          ["expenses", "Expenses"],
          ["new-expense", "Create Expense"],
          ["expense-categories", "Expense Categories"],
          ["cash-accounts", "Cash/Bank Accounts"],
          ["new-cash-transaction", "Cash/Bank Entry"],
          ["cash-transactions", "Cash/Bank Ledger"]
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="finance-error">{error}</div>}

      {tab === "invoices" && (
        <section className="finance-panel">
          <h2>Sales Invoices</h2>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Due Date</th><th>Total</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{invoices.map(item => (
              <tr key={item.id}>
                <td>{item.invoice_no}</td><td>{item.customer_name}</td>
                <td>{item.invoice_date}</td><td>{item.due_date || "—"}</td>
                <td>{money(item.grand_total)}</td><td>{money(item.balance_due)}</td>
                <td><span className="finance-status">{item.status}</span></td>
                <td className="finance-actions">
                  <button onClick={() => printInvoice(item)}>Print</button>
                  {item.status === "Draft" && <button onClick={() => issueInvoice(item)}>Issue</button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          {!invoices.length && <p className="finance-empty">No invoices recorded yet.</p>}
        </section>
      )}

      {tab === "new-invoice" && (
        <form className="finance-panel finance-form" onSubmit={createInvoice}>
          <h2>Create GST Invoice</h2>
          <label>Customer<select value={invoiceForm.customer_id} onChange={e => setInvoiceForm({...invoiceForm, customer_id:e.target.value})} required>
            <option value="">Select customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
          </select></label>
          <label>Sales Order<select value={invoiceForm.sales_order_id} onChange={e => setInvoiceForm({...invoiceForm, sales_order_id:e.target.value})} required>
            <option value="">Select sales order</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} — {o.customer_name} — {money(o.grand_total)}</option>)}
          </select></label>
          <label>Invoice Date<input type="date" value={invoiceForm.invoice_date} onChange={e => setInvoiceForm({...invoiceForm, invoice_date:e.target.value})} required /></label>
          <label>Due Date<input type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm({...invoiceForm, due_date:e.target.value})} /></label>
          <label>Place of Supply<input value={invoiceForm.place_of_supply} onChange={e => setInvoiceForm({...invoiceForm, place_of_supply:e.target.value})} placeholder="State name / code" /></label>
          <label className="finance-wide">Notes<textarea value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes:e.target.value})}/></label>
          <button className="finance-primary" type="submit">Create Draft Invoice</button>
        </form>
      )}

      {tab === "payments" && (
        <section className="finance-panel">
          <h2>Payment Receipts</h2>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Receipt</th><th>Invoice</th><th>Customer</th><th>Date</th><th>Mode</th><th>Reference</th><th>Amount</th></tr></thead>
            <tbody>{payments.map(p => <tr key={p.id}>
              <td>{p.receipt_no}</td><td>{p.invoice_no}</td><td>{p.customer_name}</td>
              <td>{p.payment_date}</td><td>{p.payment_mode}</td><td>{p.reference_no || "—"}</td><td>{money(p.amount)}</td>
            </tr>)}</tbody>
          </table></div>
          {!payments.length && <p className="finance-empty">No payments recorded yet.</p>}
        </section>
      )}

      {tab === "new-payment" && (
        <form className="finance-panel finance-form" onSubmit={createPayment}>
          <h2>Record Customer Payment</h2>
          <label>Invoice<select value={paymentForm.invoice_id} onChange={e => setPaymentForm({...paymentForm, invoice_id:e.target.value})} required>
            <option value="">Select invoice</option>
            {invoices.filter(i => Number(i.balance_due) > 0 && i.status !== "Cancelled").map(i =>
              <option key={i.id} value={i.id}>{i.invoice_no} — {i.customer_name} — Due {money(i.balance_due)}</option>
            )}
          </select></label>
          <label>Payment Date<input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({...paymentForm, payment_date:e.target.value})} required /></label>
          <label>Amount<input type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount:e.target.value})} required /></label>
          <label>Payment Mode<select value={paymentForm.payment_mode} onChange={e => setPaymentForm({...paymentForm, payment_mode:e.target.value})}>
            {["Cash","Bank Transfer","UPI","Cheque","Card","Other"].map(mode => <option key={mode}>{mode}</option>)}
          </select></label>
          <label>Reference / Transaction No.<input value={paymentForm.reference_no} onChange={e => setPaymentForm({...paymentForm, reference_no:e.target.value})}/></label>
          <label>Notes<input value={paymentForm.notes} onChange={e => setPaymentForm({...paymentForm, notes:e.target.value})}/></label>
          <button className="finance-primary" type="submit">Save Payment Receipt</button>
        </form>
      )}

      
      {tab === "expenses" && (
        <section className="finance-panel">
          <h2>Expense Summary</h2>
          <div className="finance-stats finance-substats">
            <div><span>Approved Expenses</span><strong>{money(expenseSummary.total_approved)}</strong></div>
            <div><span>Paid</span><strong>{money(expenseSummary.total_paid)}</strong></div>
            <div><span>Unpaid</span><strong>{money(expenseSummary.total_unpaid)}</strong></div>
            <div><span>Vouchers</span><strong>{expenses.length}</strong></div>
          </div>
          <h3>Expense Vouchers</h3>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Voucher</th><th>Date</th><th>Category</th><th>Payee</th><th>Amount</th><th>Status</th><th>Payment</th><th>Actions</th></tr></thead>
            <tbody>{expenses.map(item => (
              <tr key={item.id}>
                <td>{item.voucher_no}</td><td>{item.expense_date}</td>
                <td>{item.category_name || "—"}</td><td>{item.payee}</td>
                <td>{money(item.amount)}</td><td><span className="finance-status">{item.status}</span></td>
                <td>{item.payment_status}</td>
                <td className="finance-actions">
                  {item.status === "Draft" && <button onClick={() => approveExpense(item)}>Approve</button>}
                  {item.status === "Approved" && item.payment_status === "Unpaid" && (
                    payingExpenseId === item.id ? (
                      <div className="finance-pay-selector">
                        <select value={expensePayAccountId}
                          onChange={e => setExpensePayAccountId(e.target.value)}>
                          {cashAccounts.filter(a => a.is_active).map(a => (
                            <option key={a.id} value={a.id}>
                              {a.account_name} — {money(a.current_balance)}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => confirmExpensePayment(item)}>Confirm Payment</button>
                        <button type="button" onClick={() => setPayingExpenseId(null)}>Cancel</button>
                      </div>
                    ) : <button onClick={() => payExpense(item)}>Pay</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          {!expenses.length && <p className="finance-empty">No expense vouchers recorded yet.</p>}
          <h3>Expenses by Category</h3>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Category</th><th>Approved Amount</th></tr></thead>
            <tbody>{expenseSummary.by_category.map(item => (
              <tr key={item.category}><td>{item.category}</td><td>{money(item.amount)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {tab === "new-expense" && (
        <form className="finance-panel finance-form" onSubmit={createExpense}>
          <h2>Create Expense Voucher</h2>
          <label>Expense Date<input type="date" value={expenseForm.expense_date}
            onChange={e => setExpenseForm({...expenseForm, expense_date:e.target.value})} required /></label>
          <label>Category<select value={expenseForm.category_id}
            onChange={e => setExpenseForm({...expenseForm, category_id:e.target.value})} required>
            <option value="">Select category</option>
            {expenseCategories.filter(c => c.is_active).map(c =>
              <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
          <label>Payee / Supplier<input value={expenseForm.payee}
            onChange={e => setExpenseForm({...expenseForm, payee:e.target.value})} required /></label>
          <label>Amount (₹)<input type="number" min="0.01" step="0.01"
            value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount:e.target.value})} required /></label>
          <label>Description<input value={expenseForm.description}
            onChange={e => setExpenseForm({...expenseForm, description:e.target.value})} /></label>
          <label>Reference Number<input value={expenseForm.reference_no}
            onChange={e => setExpenseForm({...expenseForm, reference_no:e.target.value})} /></label>
          <label className="finance-wide">Notes<textarea value={expenseForm.notes}
            onChange={e => setExpenseForm({...expenseForm, notes:e.target.value})} /></label>
          <button className="finance-primary" type="submit">Create Draft Expense</button>
        </form>
      )}

      {tab === "expense-categories" && (
        <section className="finance-panel">
          <form className="finance-form" onSubmit={createCategory}>
            <h2>Create Expense Category</h2>
            <label>Category Name<input value={categoryForm.name}
              onChange={e => setCategoryForm({...categoryForm, name:e.target.value})} required /></label>
            <label>Description<input value={categoryForm.description}
              onChange={e => setCategoryForm({...categoryForm, description:e.target.value})} /></label>
            <button className="finance-primary" type="submit">Save Category</button>
          </form>
          <h3>Existing Categories</h3>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Category</th><th>Description</th><th>Status</th></tr></thead>
            <tbody>{expenseCategories.map(c => (
              <tr key={c.id}><td>{c.name}</td><td>{c.description || "—"}</td>
                <td>{c.is_active ? "Active" : "Inactive"}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {tab === "cash-accounts" && (
        <section className="finance-panel">
          <form className="finance-form" onSubmit={createCashAccount}>
            <h2>Add Cash / Bank Account</h2>
            <label>Account Code<input value={accountForm.account_code}
              onChange={e => setAccountForm({...accountForm, account_code:e.target.value})} required /></label>
            <label>Account Name<input value={accountForm.account_name}
              onChange={e => setAccountForm({...accountForm, account_name:e.target.value})} required /></label>
            <label>Account Type<select value={accountForm.account_type}
              onChange={e => setAccountForm({...accountForm, account_type:e.target.value})}>
              <option value="cash">Cash</option><option value="bank">Bank</option>
            </select></label>
            <label>Bank Name<input value={accountForm.bank_name}
              onChange={e => setAccountForm({...accountForm, bank_name:e.target.value})} /></label>
            <label>Account Number<input value={accountForm.account_number}
              onChange={e => setAccountForm({...accountForm, account_number:e.target.value})} /></label>
            <label>Opening Balance (₹)<input type="number" min="0" step="0.01"
              value={accountForm.opening_balance}
              onChange={e => setAccountForm({...accountForm, opening_balance:e.target.value})} /></label>
            <button className="finance-primary" type="submit">Create Account</button>
          </form>
          <h3>Cash & Bank Balances</h3>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Bank</th><th>Opening</th><th>Current Balance</th></tr></thead>
            <tbody>{cashAccounts.map(a => (
              <tr key={a.id}><td>{a.account_code}</td><td>{a.account_name}</td>
                <td>{a.account_type}</td><td>{a.bank_name || "—"}</td>
                <td>{money(a.opening_balance)}</td><td>{money(a.current_balance)}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {tab === "new-cash-transaction" && (
        <form className="finance-panel finance-form" onSubmit={createCashTransaction}>
          <h2>Cash / Bank Transaction</h2>
          <label>Transaction Type<select value={transactionForm.transaction_type}
            onChange={e => setTransactionForm({...transactionForm, transaction_type:e.target.value})}>
            <option value="receipt">Receipt</option><option value="payment">Payment</option>
            <option value="transfer">Transfer Between Accounts</option>
          </select></label>
          <label>Date<input type="date" value={transactionForm.transaction_date}
            onChange={e => setTransactionForm({...transactionForm, transaction_date:e.target.value})} required /></label>
          <label>{transactionForm.transaction_type === "transfer" ? "From Account" : "Account"}
            <select value={transactionForm.account_id}
              onChange={e => setTransactionForm({...transactionForm, account_id:e.target.value})} required>
              <option value="">Select account</option>
              {cashAccounts.filter(a => a.is_active).map(a =>
                <option key={a.id} value={a.id}>{a.account_name} — {money(a.current_balance)}</option>)}
            </select>
          </label>
          {transactionForm.transaction_type === "transfer" && (
            <label>To Account<select value={transactionForm.to_account_id}
              onChange={e => setTransactionForm({...transactionForm, to_account_id:e.target.value})} required>
              <option value="">Select destination</option>
              {cashAccounts.filter(a => a.is_active && String(a.id) !== String(transactionForm.account_id)).map(a =>
                <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select></label>
          )}
          <label>Amount (₹)<input type="number" min="0.01" step="0.01"
            value={transactionForm.amount} onChange={e => setTransactionForm({...transactionForm, amount:e.target.value})} required /></label>
          <label>Reference Number<input value={transactionForm.reference_no}
            onChange={e => setTransactionForm({...transactionForm, reference_no:e.target.value})} /></label>
          <label className="finance-wide">Description<input value={transactionForm.description}
            onChange={e => setTransactionForm({...transactionForm, description:e.target.value})} /></label>
          <button className="finance-primary" type="submit">Post Transaction</button>
        </form>
      )}

      {tab === "cash-transactions" && (
        <section className="finance-panel">
          <h2>Cash / Bank Transaction Ledger</h2>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Amount</th><th>Reference</th><th>Description</th></tr></thead>
            <tbody>{cashTransactions.map(t => (
              <tr key={t.id}><td>{t.transaction_date}</td>
                <td>{cashAccounts.find(a => a.id === t.account_id)?.account_name || `Account ${t.account_id}`}</td>
                <td>{t.transaction_type}</td><td>{money(t.amount)}</td>
                <td>{t.reference_no || "—"}</td><td>{t.description || "—"}</td></tr>
            ))}</tbody>
          </table></div>
          {!cashTransactions.length && <p className="finance-empty">No cash/bank transactions recorded yet.</p>}
        </section>
      )}

      {tab === "tax-profile" && (
        <form className="finance-panel finance-form" onSubmit={saveTaxProfile}>
          <h2>Company GST & Registered Details</h2>
          {[
            ["legal_name", "Registered Legal Name"],
            ["gstin", "GSTIN"],
            ["address", "Registered Address"],
            ["city", "City"],
            ["state", "State"],
            ["state_code", "GST State Code"],
            ["postal_code", "PIN Code"],
            ["phone", "Business Phone"],
            ["email", "Business Email"]
          ].map(([key, label]) => (
            <label key={key}>{label}
              <input
                value={taxProfile[key]}
                onChange={e => setTaxProfile({...taxProfile, [key]: e.target.value})}
                required={["legal_name", "gstin", "state", "state_code"].includes(key)}
              />
            </label>
          ))}
          <button className="finance-primary" type="submit">Save GST Details</button>
        </form>
      )}

{tab === "receivables" && (
        <section className="finance-panel">
          <h2>Customer Receivables</h2>
          <div className="finance-table-wrap"><table>
            <thead><tr><th>Custovoice</th><th>Invoice Date</th><th>Due Date</th><th>Invoice Total</th><th>Outstanding</th></tr></thead>
            <tbody>{invoices.filter(i => Number(i.balance_due) > 0).map(i => (
              <tr key={i.id}><td>{i.customer_name}</td><td>{i.invoice_no}</td>
                <td>{i.invoice_date}</td><td>{i.due_date || "—"}</td>
                <td>{money(i.grand_total)}</td><td>{money(i.balance_due)}</td></tr>
            ))}</tbody>
          </table></div>
          <h3>Total Outstanding: {money(outstanding)}</h3>
        </section>
      )}
    </div>
  );
}
