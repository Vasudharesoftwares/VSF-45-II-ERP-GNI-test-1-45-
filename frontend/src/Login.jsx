import { useState } from "react";
import { login } from "./auth";
import { showSuccess, showError } from "./utils/alerts";
import "./Login.css";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);

    try {
      const user = await login(email, password);
      await showSuccess("Welcome back!", "You have signed in successfully.");
      onLogin?.(user);
    } catch (err) {
      await showError("Sign in failed", err.message || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="erp-login">
      <section className="erp-login-panel">
        <div className="erp-login-brand">
          <div className="erp-login-logo">V</div>
          <div>
            <h1>VASUDHARE</h1>
            <span>SALESFORCE ERP</span>
          </div>
        </div>

        <div className="erp-login-intro">
          <span className="erp-eyebrow">BUSINESS MANAGEMENT PLATFORM</span>
          <h2>Welcome back.</h2>
          <p>Sign in to access your workspace and manage your business.</p>
        </div>

        <form className="erp-login-form" onSubmit={handleSubmit}>
          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </label>


          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in to workspace"}
          </button>
        </form>

        <footer>
          Secure business access · VASUDHARE SALESFORCE
        </footer>
      </section>

      <aside className="erp-login-side">
        <div className="erp-login-side-content">
          <span>ONE PLATFORM. EVERY BUSINESS.</span>
          <h2>Run your business with clarity and control.</h2>
          <p>
            Connect teams, operations, finance, inventory and workflows
            through one configurable ERP platform.
          </p>
          <div className="erp-login-features">
            <div><b>01</b><span>Unified operations</span></div>
            <div><b>02</b><span>Role-based access</span></div>
            <div><b>03</b><span>Real-time visibility</span></div>
          </div>
        </div>
      </aside>
    </main>
  );
}
