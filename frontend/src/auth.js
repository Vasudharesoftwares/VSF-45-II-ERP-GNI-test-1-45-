const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const TOKEN_KEY = "vasudhare_access_token";
const USER_KEY = "vasudhare_current_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(data) {
  if (!data?.access_token || !data?.user) {
    throw new Error("Invalid authentication response");
  }

  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(email, password, companyId = null) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      ...(companyId !== null ? { company_id: Number(companyId) } : {})
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.detail || "Login failed");
  }

  saveSession(result);
  return result.user;
}

export async function logout() {
  const token = getToken();

  try {
    if (token) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  } finally {
    clearSession();
  }
}

export async function getCurrentUser() {
  const token = getToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 401 || response.status === 403) {
    clearSession();
    return null;
  }

  if (!response.ok) {
    throw new Error("Unable to verify current user");
  }

  const user = await response.json();
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("vasudhare:session-expired"));
  }

  return response;
}

// Client-side permission checks are for interface visibility only.
// The backend must independently enforce every permission.
export function hasPermission(user, permission) {
  if (!user) return false;

  const permissions = user.permissions || [];

  return permissions.includes("*") || permissions.includes(permission);
}

export function canAccessRole(user, allowedRoles = []) {
  if (!user) return false;
  return allowedRoles.includes(user.role);
}

export { API_BASE };
