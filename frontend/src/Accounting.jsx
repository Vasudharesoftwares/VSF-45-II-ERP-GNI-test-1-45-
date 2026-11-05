import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "./auth";
import {
  showSuccess,
  showError,
  showWarning,
  showConfirm
} from "./utils/alerts";
import "./Accounting.css";

const API = "/api/accounting";

const money = value =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const today = () => new Date().toISOString().slice(0, 10);

export default function Accounting() {
  const [companyId, setCompanyId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("accounts");
  const [accounts, setAccounts] = useState([]);
  const [journals, setJournals] = useState([]);
  const [report, setReport] = useState(null);
  const [reportType, setReportType] = useState("trial-balance");

  const [accountForm, setAccountForm] = useState({
    code: "", name: "", account_type: "Asset",
    parent_id: "", opening_balance: "0"
  });

  const [journalForm, setJournalForm] = useState({
    voucher_no: "", voucher_date: today(), narration: "",
    lines: [
      { account_id: "", description: "", debit: "", credit: "" },
      { account_id: "", description: "", debit: "", credit: "" }
    ]
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
    if (!response.ok) {
      throw new Error(data.detail || data.message || "Accounting request failed.");
    }
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
          showError("Accounting", err.message);
        }
      });
    return () => { alive = false; };
  }, []);

  const loadAccounts = async () => {
    const data = await request(`${API}/companies/${companyId}/accounts`);
    setAccounts(data.items || []);
  };

  const loadJournals = async () => {
    const data = await request(`${API}/companies/${companyId}/journals`);
    setJournals(data.items || []);
  };

  const loadReport = async (type = reportType) => {
    const data = await request(`${API}/companies/${companyId}/${type}`);
    setReport(data);
    setReportType(type);
  };

  const refresh = async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadAccounts(), loadJournals()]);
      if (tab === "reports") await loadReport(reportType);
    } catch (err) {
      setError(err.message);
      showError("Accounting", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) refresh();
    // Initial load after company identification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const updateLine = (index, field, value) => {
    setJournalForm(current => ({
      ...current,
      lines: current.lines.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      )
    }));
  };

  const addLine = () => {
    setJournalForm(current => ({
      ...current,
      lines: [
        ...current.lines,
        { account_id: "", description: "", debit: "", credit: "" }
      ]
    }));
  };

  const removeLine = index => {
    setJournalForm(current => ({
      ...current,
      lines: current.lines.filter((_, i) => i !== index)
    }));
  };

  const debitTotal = useMemo(
    () => journalForm.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0),
    [journalForm.lines]
  );
  const creditTotal = useMemo(
    () => journalForm.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0),
    [journalForm.lines]
  );

  const saveAccount = async event => {
    event.preventDefault();
    if (!accountForm.code.trim() || !accountForm.name.trim()) {
      showWarning("Required fields", "Enter both account code and account name.");
      return;
    }
    setLoading(true);
    try {
      await request(`${API}/companies/${companyId}/accounts`, {
        method: "POST",
        body: JSON.stringify({
          ...accountForm,
          parent_id: accountForm.parent_id ? Number(accountForm.parent_id) : null,
          opening_balance: Number(accountForm.opening_balance || 0)
        })
      });
      showSuccess("Account created", "The account has been saved.");
      setAccountForm({
        code: "", name: "", account_type: "Asset",
        parent_id: "", opening_balance: "0"
      });
      await loadAccounts();
    } catch (err) {
      showError("Unable to save account", err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveJournal = async event => {
    event.preventDefault();
    if (journalForm.lines.length < 2) {
      showWarning("Journal validation", "A journal requires at least two lines.");
      return;
    }
    const lines = journalForm.lines.map(line => ({
      account_id: Number(line.account_id),
      description: line.description,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0)
    }));
    if (lines.some(line =>
      !line.account_id ||
      (line.debit <= 0 && line.credit <= 0) ||
      (line.debit > 0 && line.credit > 0)
    )) {
      showWarning(
        "Journal validation",
        "Select an account and enter either a debit or a credit amount on each line."
      );
      return;
    }
    if (Math.abs(debitTotal - creditTotal) > 0.005 || debitTotal <= 0) {
      showWarning(
        "Journal not balanced",
        `Debit total ₹${money(debitTotal)} must equal credit total ₹${money(creditTotal)}.`
      );
      return;
    }
    if (!journalForm.voucher_no.trim() || !journalForm.voucher_date) {
      showWarning("Required fields", "Enter a voucher number and date.");
      return;
    }
    setLoading(true);
    try {
      await request(`${API}/companies/${companyId}/journals`, {
        method: "POST",
        body: JSON.stringify({
          ...journalForm,
          lines
        })
      });
      showSuccess("Journal saved", "The journal entry has been saved as a draft.");
      setJournalForm({
        voucher_no: "", voucher_date: today(), narration: "",
        lines: [
          { account_id: "", description: "", debit: "", credit: "" },
          { account_id: "", description: "", debit: "", credit: "" }
        ]
      });
      await loadJournals();
    } catch (err) {
      showError("Unable to save journal", err.message);
    } finally {
      setLoading(false);
    }
  };

  const postJournal = async journal => {
    const confirmed = await showConfirm(
      "Post journal entry?",
      `Post voucher ${journal.voucher_no}? A posted journal will be included in accounting reports.`
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      await request(`${API}/journals/${journal.id}/post`, { method: "PATCH" });
      showSuccess("Journal posted", `${journal.voucher_no} has been posted.`);
      await loadJournals();
      if (tab === "reports") await loadReport(reportType);
    } catch (err) {
      showError("Unable to post journal", err.message);
    } finally {
      setLoading(false);
    }
  };

  const openTab = async nextTab => {
    setTab(nextTab);
    if (!companyId) return;
    try {
      if (nextTab === "accounts") await loadAccounts();
      if (nextTab === "journals") await loadJournals();
      if (nextTab === "reports") await loadReport(reportType);
    } catch (err) {
      showError("Accounting", err.message);
    }
  };

  const renderReport = () => {
    if (!report) return <p className="acc-muted">Select a report to view its data.</p>;

    if (reportType === "trial-balance" || reportType === "general-ledger") {
      const rows = report.items || [];
      return (
        <div className="acc-table-wrap">
          <table className="acc-table">
            <thead>
              <tr>
                <th>Code</th><th>Account</th><th>Type</th>
                <th className="num">Debit</th><th className="num">Credit</th>
                {reportType === "trial-balance" && <>
                  <th className="num">Debit balance</th>
                  <th className="num">Credit balance</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.account_id || row.id || index}>
                  <td>{row.code}</td><td>{row.name}</td><td>{row.account_type}</td>
                  <td className="num">{money(row.debit)}</td>
                  <td className="num">{money(row.credit)}</td>
                  {reportType === "trial-balance" && <>
                    <td className="num">{money(row.debit_balance)}</td>
                    <td className="num">{money(row.credit_balance)}</td>
                  </>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan="7">No report entries yet.</td></tr>}
            </tbody>
            {reportType === "trial-balance" && (
              <tfoot><tr>
                <th colSpan="5">Total balances</th>
                <th className="num">{money(report.total_debit)}</th>
                <th className="num">{money(report.total_credit)}</th>
              </tr></tfoot>
            )}
          </table>
        </div>
      );
    }

    const cards = reportType === "profit-loss"
      ? [
          ["Income", report.income],
          ["Expenses", report.expenses],
          ["Net Profit / (Loss)", report.net_profit]
        ]
      : [
          ["Assets", report.assets],
          ["Liabilities", report.liabilities],
          ["Equity", report.equity],
          ["Liabilities + Equity", report.liabilities_and_equity],
          ["Difference", report.difference]
        ];

    return (
      <div className="acc-report-grid">
        {cards.map(([label, value]) => (
          <div className="acc-report-card" key={label}>
            <span>{label}</span>
            <strong>₹{money(value)}</strong>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="accounting-page">
      <div className="acc-heading">
        <div>
          <h1>General Accounting</h1>
          <p>Chart of accounts, journal vouchers and financial reports</p>
        </div>
        <button className="acc-secondary" onClick={refresh} disabled={!companyId || loading}>
          {loading ? "Loading..." : "↻ Refresh"}
        </button>
      </div>

      {error && <div className="acc-error">{error}</div>}

      <div className="acc-tabs">
        <button className={tab === "accounts" ? "active" : ""} onClick={() => openTab("accounts")}>Chart of Accounts</button>
        <button className={tab === "journals" ? "active" : ""} onClick={() => openTab("journals")}>Journal Entries</button>
        <button className={tab === "reports" ? "active" : ""} onClick={() => openTab("reports")}>Financial Reports</button>
      </div>

      {tab === "accounts" && (
        <div className="acc-layout">
          <section className="acc-panel">
            <h2>Create Account</h2>
            <form onSubmit={saveAccount} className="acc-form">
              <label>Account code<input value={accountForm.code} onChange={e => setAccountForm({ ...accountForm, code: e.target.value })} placeholder="e.g. 1001" /></label>
              <label>Account name<input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="e.g. Cash in Hand" /></label>
              <label>Account type
                <select value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}>
                  {["Asset", "Liability", "Equity", "Income", "Expense"].map(type => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>Parent account (optional)
                <select value={accountForm.parent_id} onChange={e => setAccountForm({ ...accountForm, parent_id: e.target.value })}>
                  <option value="">No parent</option>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                </select>
              </label>
              <label>Opening balance<input type="number" step="0.01" value={accountForm.opening_balance} onChange={e => setAccountForm({ ...accountForm, opening_balance: e.target.value })} /></label>
              <button className="acc-primary" disabled={loading}>Save Account</button>
            </form>
          </section>
          <section className="acc-panel acc-wide">
            <h2>Accounts <span className="acc-count">{accounts.length}</span></h2>
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead><tr><th>Code</th><th>Account name</th><th>Type</th><th>Opening balance</th><th>Status</th></tr></thead>
                <tbody>
                  {accounts.map(account => (
                    <tr key={account.id}>
                      <td>{account.code}</td><td>{account.name}</td><td>{account.account_type}</td>
                      <td className="num">{money(account.opening_balance)}</td>
                      <td>{account.is_active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                  {accounts.length === 0 && <tr><td colSpan="5">No accounts created yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "journals" && (
        <div className="acc-layout acc-journal-layout">
          <section className="acc-panel">
            <h2>New Journal Voucher</h2>
            <form onSubmit={saveJournal} className="acc-form">
              <label>Voucher number<input value={journalForm.voucher_no} onChange={e => setJournalForm({ ...journalForm, voucher_no: e.target.value })} placeholder="JV-001" /></label>
              <label>Voucher date<input type="date" value={journalForm.voucher_date} onChange={e => setJournalForm({ ...journalForm, voucher_date: e.target.value })} /></label>
              <label>Narration<textarea rows="2" value={journalForm.narration} onChange={e => setJournalForm({ ...journalForm, narration: e.target.value })} placeholder="Journal description" /></label>
              <div className="acc-lines-heading"><strong>Journal lines</strong><button type="button" className="acc-secondary" onClick={addLine}>+ Add line</button></div>
              {journalForm.lines.map((line, index) => (
                <div className="acc-line" key={index}>
                  <label>Account
                    <select value={line.account_id} onChange={e => updateLine(index, "account_id", e.target.value)}>
                      <option value="">Select account</option>
                      {accounts.filter(a => a.is_active).map(account => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                    </select>
                  </label>
                  <label>Description<input value={line.description} onChange={e => updateLine(index, "description", e.target.value)} /></label>
                  <div className="acc-line-amounts">
                    <label>Debit<input type="number" min="0" step="0.01" value={line.debit} onChange={e => updateLine(index, "debit", e.target.value)} /></label>
                    <label>Credit<input type="number" min="0" step="0.01" value={line.credit} onChange={e => updateLine(index, "credit", e.target.value)} /></label>
                  </div>
                  {journalForm.lines.length > 2 && <button type="button" className="acc-remove" onClick={() => removeLine(index)}>Remove line</button>}
                </div>
              ))}
              <div className="acc-totals">
                <span>Debit: <strong>₹{money(debitTotal)}</strong></span>
                <span>Credit: <strong>₹{money(creditTotal)}</strong></span>
                <span className={Math.abs(debitTotal - creditTotal) < 0.005 && debitTotal > 0 ? "balanced" : "unbalanced"}>
                  {Math.abs(debitTotal - creditTotal) < 0.005 && debitTotal > 0 ? "Balanced" : "Not balanced"}
                </span>
              </div>
              <button className="acc-primary" disabled={loading}>Save as Draft</button>
            </form>
          </section>

          <section className="acc-panel acc-wide">
            <h2>Journal Register</h2>
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead><tr><th>Voucher</th><th>Date</th><th>Narration</th><th>Status</th><th className="num">Debit</th><th className="num">Credit</th><th>Action</th></tr></thead>
                <tbody>
                  {journals.map(journal => (
                    <tr key={journal.id}>
                      <td>{journal.voucher_no}</td><td>{journal.voucher_date}</td><td>{journal.narration}</td>
                      <td><span className={`acc-status ${journal.status === "Posted" ? "posted" : "draft"}`}>{journal.status}</span></td>
                      <td className="num">{money(journal.total_debit)}</td><td className="num">{money(journal.total_credit)}</td>
                      <td>{journal.status === "Draft" ? <button className="acc-small-button" onClick={() => postJournal(journal)}>Post</button> : "—"}</td>
                    </tr>
                  ))}
                  {journals.length === 0 && <tr><td colSpan="7">No journal entries yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === "reports" && (
        <section className="acc-panel">
          <div className="acc-report-heading">
            <div><h2>Financial Reports</h2><p>Reports include posted journal entries.</p></div>
            <select value={reportType} onChange={e => loadReport(e.target.value)}>
              <option value="general-ledger">General Ledger</option>
              <option value="trial-balance">Trial Balance</option>
              <option value="profit-loss">Profit &amp; Loss</option>
              <option value="balance-sheet">Balance Sheet</option>
            </select>
          </div>
          {renderReport()}
        </section>
      )}
    </div>
  );
}
