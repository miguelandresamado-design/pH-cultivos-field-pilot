import { getAll, put, putMany, remove } from "../core/db.js";
import { deduplicateOperations } from "./sync.js";

const TABLES = { sessions: "sampling_sessions", measurements: "measurements", lots: "lots" };
const FIELDS = {
  lots: ["id", "farm_id", "name", "crop", "area_ha", "planting_year", "archived_at", "created_at", "updated_at"],
  sessions: ["id", "technician_id", "country_id", "farm_id", "lot_id", "campaign_id", "device_id", "crop", "target_samples", "status", "started_at", "completed_at", "updated_at", "sync_status", "summary"],
  measurements: ["id", "session_id", "technician_id", "country_id", "farm_id", "lot_id", "campaign_id", "sample_number", "ph", "temperature_c", "latitude", "longitude", "gps_accuracy_m", "source", "captured_at", "updated_at", "sync_status"]
};

export class PilotRemote {
  constructor(config, auth) { this.url = config.supabaseUrl.replace(/\/$/, ""); this.key = config.supabasePublishableKey; this.auth = auth; }
  async request(path, options = {}) {
    let session = await this.auth.validSession();
    if (!session) throw new Error("Inicia sesión para conectarte con Supabase");
    let response = await fetch(`${this.url}/rest/v1/${path}`, { ...options, headers: { apikey: this.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    if (response.status === 401 && navigator.onLine) {
      session = await this.auth.refresh();
      response = await fetch(`${this.url}/rest/v1/${path}`, { ...options, headers: { apikey: this.key, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    }
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || body?.details || `Error remoto ${response.status}`);
    return body;
  }
  async select(table, query = "select=*") { return this.request(`${table}?${query}`); }
  async load(userId) {
    const [profiles, farms, lots, campaigns, sessions, measurements] = await Promise.all([
      this.select("profiles", `id=eq.${userId}&select=id,code,name,country_id,role`),
      this.select("farms", "select=id,code,name,country_id,region,municipality,village,created_at,updated_at&order=code"),
      this.select("lots", "select=*&order=name"),
      this.select("monitoring_campaigns", "select=*&order=starts_on"),
      this.select("sampling_sessions", "select=*&order=started_at"),
      this.select("measurements", "select=*&order=captured_at")
    ]);
    const profile = profiles[0];
    if (!profile) throw new Error("Tu cuenta existe, pero todavía no tiene un perfil del piloto asignado");
    const normalizedFarms = farms.map(farm => ({ ...farm, technician_id: profile.id }));
    const normalizedCampaigns = campaigns.map(campaign => ({ ...campaign, date: campaign.starts_on }));
    await Promise.all([putMany("technicians", [profile]), putMany("farms", normalizedFarms), putMany("lots", lots), putMany("campaigns", normalizedCampaigns), putMany("sessions", sessions), putMany("measurements", measurements)]);
    const pending = deduplicateOperations((await getAll("sync_operations")).filter(item => item.status !== "synced"));
    for (const operation of pending) {
      if (["lots", "sessions", "measurements"].includes(operation.entity)) await put(operation.entity, operation.payload);
    }
    const localLots = await getAll("lots");
    return { mode: "pilot", country: { id: profile.country_id, name: profile.country_id === "co" ? "Colombia" : profile.country_id }, technicians: [profile], farms: normalizedFarms, lots: localLots, campaigns: normalizedCampaigns };
  }
  async loadCached(userId) {
    const [profiles, farms, lots, campaigns] = await Promise.all([getAll("technicians"), getAll("farms"), getAll("lots"), getAll("campaigns")]);
    const profile = profiles.find(item => item.id === userId);
    if (!profile) throw new Error("Debes conectarte a internet al menos una vez para activar este dispositivo");
    return { mode: "pilot", country: { id: profile.country_id, name: profile.country_id === "co" ? "Colombia" : profile.country_id }, technicians: [profile], farms, lots, campaigns };
  }
  clean(entity, payload) {
    const allowed = new Set(FIELDS[entity]);
    return Object.fromEntries(Object.entries(payload).filter(([key]) => allowed.has(key)).map(([key, value]) => [key, key === "sync_status" ? "synced" : value]));
  }
  async syncPending() {
    const operations = deduplicateOperations((await getAll("sync_operations")).filter(item => item.status !== "synced"));
    const ordered = operations.sort((a, b) => ["lots", "sessions", "measurements"].indexOf(a.entity) - ["lots", "sessions", "measurements"].indexOf(b.entity));
    let synced = 0;
    for (const operation of ordered) {
      if (!TABLES[operation.entity]) continue;
      const payload = this.clean(operation.entity, operation.payload);
      await this.request(`${TABLES[operation.entity]}?on_conflict=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(payload) });
      if (operation.entity !== "lots") await put(operation.entity, { ...operation.payload, sync_status: "synced" });
      await remove("sync_operations", operation.id);
      synced += 1;
    }
    return synced;
  }
}
