const SESSION_KEY = "ph-a-la-vista-auth-v1";

function decodePayload(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(payload).split("").map(char => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`).join("")));
  } catch { return null; }
}

export class PilotAuth {
  constructor(config) { this.url = config.supabaseUrl.replace(/\/$/, ""); this.key = config.supabasePublishableKey; }
  getSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
  saveSession(session) { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); return session; }
  clearSession() { localStorage.removeItem(SESSION_KEY); }
  userId() { return this.getSession()?.user?.id || decodePayload(this.getSession()?.access_token || "")?.sub || null; }
  async request(path, options = {}) {
    const response = await fetch(`${this.url}${path}`, {
      ...options,
      headers: { apikey: this.key, "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.msg || body?.message || body?.error_description || "No fue posible autenticar el acceso");
    return body;
  }
  async signIn(email, password) {
    const session = await this.request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) });
    return this.saveSession(session);
  }
  async requestPasswordReset(email, redirectTo) {
    return this.request("/auth/v1/recover", { method: "POST", body: JSON.stringify({ email, redirect_to: redirectTo }) });
  }
  async refresh() {
    const current = this.getSession();
    if (!current?.refresh_token) throw new Error("La sesión no puede renovarse");
    const session = await this.request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: current.refresh_token }) });
    return this.saveSession(session);
  }
  async validSession() {
    const session = this.getSession();
    if (!session?.access_token || !this.userId()) return null;
    const payload = decodePayload(session.access_token);
    if (!payload?.exp || payload.exp * 1000 > Date.now() + 60000) return session;
    if (!navigator.onLine) return session;
    try { return await this.refresh(); } catch { this.clearSession(); return null; }
  }
  captureRedirectSession() {
    const raw = location.hash.startsWith("#access_token=") ? location.hash.slice(1) : "";
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const access_token = params.get("access_token"), refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) return null;
    const payload = decodePayload(access_token);
    const session = { access_token, refresh_token, token_type: "bearer", expires_in: Number(params.get("expires_in") || 3600), user: { id: payload?.sub, email: payload?.email } };
    this.saveSession(session);
    history.replaceState(null, "", `${location.pathname}${location.search}#/set-password`);
    return session;
  }
  async updatePassword(password) {
    const session = await this.validSession();
    if (!session) throw new Error("El enlace de invitación venció. Solicita uno nuevo al administrador.");
    return this.request("/auth/v1/user", { method: "PUT", headers: { Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ password }) });
  }
  async signOut() {
    const session = this.getSession();
    if (session?.access_token && navigator.onLine) {
      try { await this.request("/auth/v1/logout", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } }); } catch { /* local close still applies */ }
    }
    this.clearSession();
  }
}
