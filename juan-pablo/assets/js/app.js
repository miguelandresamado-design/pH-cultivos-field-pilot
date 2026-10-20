import { get, getAll, put, remove, setStorageScope } from "./core/db.js";
import { seedDemoData } from "./core/seed.js";
import { summarize, validPh } from "./modules/stats.js";
import { loadAgronomy, interpretValue } from "./modules/agronomy.js";
import { enqueue, pendingOperations, discardPendingForRecord } from "./modules/sync.js";
import { requestPosition } from "./modules/geolocation.js";
import { YKS01Adapter } from "./modules/bluetooth.js?v=0.4.0";
import { lineChart, seriesColor, trendText, heatPlot } from "./modules/charts.js";
import { downloadCSV } from "./modules/csv.js";
import { activeLots, normalizeLotInput, validateLotInput } from "./modules/lots.js";
import { APP_CONFIG } from "../../config/app.js?v=0.4.0";
import { PilotAuth } from "./modules/auth.js";
import { PilotRemote } from "./modules/remote.js";

const app = document.querySelector("#app");
const backButton = document.querySelector("#backButton");
const bottomNav = document.querySelector("#bottomNav");
const networkButton = document.querySelector("#networkButton");
const networkLabel = document.querySelector("#networkLabel");
const toastElement = document.querySelector("#toast");
const sensor = new YKS01Adapter(APP_CONFIG.bluetooth);
const pilotMode = APP_CONFIG.mode === "pilot";
const auth = new PilotAuth(APP_CONFIG);
const remote = new PilotRemote(APP_CONFIG, auth);

const STATE_KEY = `ph-fase1-state-${APP_CONFIG.storageScope || "demo"}`;
const defaultState = { activated: true, technicianId: APP_CONFIG.technicianId || "tech-co-01", currentSessionId: null, compareLots: [], mapLots: [], mapCampaignId: "camp-2026-10" };
let state = loadState();
let demoData;
let agronomy;
let pendingLocation = null;
let sensorStatus = sensor.supportsWebBluetooth()
  ? "Enciende el YK-S01 y pulsa conectar. En iPhone, abre esta página dentro de Bluefy."
  : "Bluetooth no está disponible en este navegador. Puedes ingresar el pH manualmente.";

function loadState() {
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem(STATE_KEY) || "{}") }; }
  catch { localStorage.removeItem(STATE_KEY); return { ...defaultState }; }
}
function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function toast(message) { toastElement.textContent = message; toastElement.classList.add("show"); setTimeout(() => toastElement.classList.remove("show"), 2400); }
function go(path) { location.hash = `#/${path}`; }
function route() { const raw = location.hash.replace(/^#\//, "") || (state.activated ? "home" : "activate"); const [name, id] = raw.split("/"); return { name, id }; }
function activeTechnician() { return demoData?.technicians?.find(item => item.id === state.technicianId) || demoData?.technicians?.[0]; }
function farmsForTechnician() { return demoData.farms.filter(item => item.technician_id === activeTechnician().id); }
function lotsForFarm(farmId, includeArchived = false) { const lots = demoData.lots.filter(item => item.farm_id === farmId); return includeArchived ? lots : activeLots(lots); }
function currentFarm(farmId) { return demoData.farms.find(item => item.id === farmId); }
function currentLot(lotId) { return demoData.lots.find(item => item.id === lotId); }
function currentCampaign(campaignId) { return demoData.campaigns.find(item => item.id === campaignId); }
function formatDate(value) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function formatNumber(value) { return Number.isFinite(value) ? value.toFixed(2) : "—"; }
function heading(eyebrow, title, lead = "") { return `<div class="eyebrow">${escapeHTML(eyebrow)}</div><h1>${escapeHTML(title)}</h1>${lead ? `<p class="lead">${escapeHTML(lead)}</p>` : ""}`; }
function statusBadge(text, tone = "") { return `<span class="status-badge ${tone}">${escapeHTML(text)}</span>`; }
function scale(value = null) { const position = Number.isFinite(value) ? Math.max(2, Math.min(98, value / 14 * 100)) : 0; return `<div class="scale"><span class="scale-marker" style="left:${position}%"></span></div><div class="scale-labels"><span>Bajo</span><span>Adecuado</span><span>Alto</span></div>`; }
function interpretation(value) { return interpretValue(value, "coffee", agronomy); }

function updateChrome() {
  const { name } = route();
  const hiddenBack = ["activate", "set-password", "home"].includes(name);
  backButton.classList.toggle("is-hidden", hiddenBack);
  bottomNav.classList.toggle("is-hidden", ["activate", "set-password"].includes(name));
  bottomNav.querySelectorAll("a").forEach(link => link.classList.toggle("active", link.dataset.nav === name || (["farm", "lots", "lotnew", "lotedit", "new", "history", "compare", "maps"].includes(name) && link.dataset.nav === "farms")));
  networkLabel.textContent = navigator.onLine ? "En línea" : "Offline";
  networkButton.classList.toggle("offline", !navigator.onLine);
}

async function activationView() {
  if (pilotMode) return `<section class="activation"><div class="activation-mark">pH</div>${heading("Acceso al piloto", "Inicia sesión", "Usa únicamente la cuenta personal que fue invitada al piloto.")}<div class="notice">${statusBadge("Acceso controlado", "good")}<p style="margin:10px 0 0">No está habilitado el registro público. Tus fincas se cargarán de acuerdo con la asignación de tu cuenta.</p></div><form id="loginForm"><label class="field"><span>Correo electrónico</span><input class="input" id="loginEmail" type="email" autocomplete="username" required></label><label class="field"><span>Contraseña</span><input class="input" id="loginPassword" type="password" minlength="8" autocomplete="current-password" required></label><p id="loginError" class="form-error" role="alert"></p><button class="button primary" id="loginButton" type="submit">Ingresar</button><button class="button secondary" id="sendRecovery" type="button">Crear o recuperar contraseña</button></form><p class="meta" style="text-align:center">Solo las cuentas previamente invitadas pueden solicitar este enlace.</p></section>`;
  return `<section class="activation"><div class="activation-mark">pH</div>${heading("Bienvenido", "Activa tu acceso", "Selecciona un perfil ficticio para explorar la Fase 1. No se utilizan cuentas ni contraseñas reales.")}<div class="notice">${statusBadge("Modo demostración", "good")}<p style="margin:10px 0 0">Los datos permanecen en este dispositivo. Supabase todavía no está conectado.</p></div><form id="activationForm"><label class="field"><span>Técnico</span><select id="technicianSelect" class="select">${demoData.technicians.map(item => `<option value="${item.id}" ${item.id === state.technicianId ? "selected" : ""}>${item.code} · ${item.name}</option>`).join("")}</select></label><button class="button primary" type="submit">Entrar en modo demostración</button></form></section>`;
}

async function setPasswordView() {
  return `<section class="activation"><div class="activation-mark">pH</div>${heading("Invitación verificada", "Crea tu contraseña", "Debe tener al menos 10 caracteres y ser exclusiva para este piloto.")}<form id="setPasswordForm"><label class="field"><span>Nueva contraseña</span><input class="input" id="newPassword" type="password" minlength="10" autocomplete="new-password" required></label><label class="field"><span>Confirmar contraseña</span><input class="input" id="confirmPassword" type="password" minlength="10" autocomplete="new-password" required></label><p id="passwordError" class="form-error" role="alert"></p><button class="button primary" id="passwordButton" type="submit">Guardar contraseña</button></form></section>`;
}

async function homeView() {
  const farms = farmsForTechnician();
  const pending = await pendingOperations();
  const sessions = await getAll("sessions");
  const activeSession = sessions.find(item => item.technician_id === activeTechnician().id && item.status === "in_progress");
  return `${heading(`Hola, ${activeTechnician().name}`, "¿Qué vas a hacer?", "Elige una medición rápida o un muestreo organizado por finca y lote.")}${activeSession ? `<div class="resume-card"><div><strong>Muestreo sin finalizar</strong><span>${escapeHTML(currentLot(activeSession.lot_id)?.name)} · jornada recuperable</span></div><button class="text-link" type="button" data-go="capture/${activeSession.id}">Continuar</button></div>` : ""}<button class="card action-card" type="button" data-go="quick"><span class="icon-tile">pH</span><span><h2>Medición individual</h2><p>Lectura rápida de pH con geolocalización opcional.</p></span><span class="chevron">›</span></button><button class="card action-card" type="button" data-go="farms"><span class="icon-tile">⌑</span><span><h2>Fincas</h2><p>Muestreo por lotes, historial y geolocalización.</p></span><span class="chevron">›</span></button><div class="stats-grid"><div class="stat"><strong>${farms.length}</strong><span>fincas asignadas</span></div><div class="stat"><strong>${pending.length}</strong><span>registros pendientes</span></div></div><p class="meta" style="text-align:center;margin-top:18px">Los registros se conservan localmente aunque cierres la aplicación.</p>`;
}

function readingCard(value = null, mode = "Sin lectura") {
  const result = Number.isFinite(value) ? interpretation(value) : { label: "Esperando lectura" };
  return `<div class="reading-card"><div class="reading-head"><strong>Lectura actual</strong>${statusBadge(mode)}</div><div class="ph-value" id="phValue">${Number.isFinite(value) ? `pH ${value.toFixed(2)}` : "—"}</div><div class="interpretation" id="phInterpretation">${escapeHTML(result.label)}</div><div class="reading-temperature" id="readingTemperature">Temperatura no disponible</div>${scale(value)}</div>`;
}

function bluetoothPanel() {
  const connected = sensor.isConnected();
  const unavailable = !sensor.supportsWebBluetooth();
  return `<section class="bluetooth-panel" aria-label="Conexión con medidor de pH"><div class="row"><div><strong>Medidor YK-S01</strong><span class="bluetooth-device-copy">Conexión Bluetooth directa</span></div>${statusBadge(connected ? "Conectado" : "No conectado", connected ? "good" : "")}</div><p class="bluetooth-status" id="bluetoothStatus" aria-live="polite">${escapeHTML(sensorStatus)}</p><div class="button-row"><button class="button secondary" id="connectBluetooth" type="button" ${connected || unavailable ? "disabled" : ""}>Conectar YK-S01</button><button class="button ghost" id="disconnectBluetooth" type="button" ${connected ? "" : "disabled"}>Desconectar</button></div></section>`;
}

async function quickView() {
  return `${heading("Lectura rápida", "Medición individual", "Guarda un valor sin seleccionar finca ni lote.")}<div class="notice warning"><strong>Rangos de prueba</strong><br>La interpretación de café es provisional hasta aprobación agronómica.</div>${readingCard()}${bluetoothPanel()}<label class="field"><span>Lectura manual</span><div class="manual-row"><input class="input" id="manualPh" inputmode="decimal" type="number" min="0" max="14" step="0.01" placeholder="Ej. 5,3"><button class="button secondary" id="useManual" type="button">Usar</button></div></label><label class="check-row"><input id="quickGps" type="checkbox">Solicitar ubicación al guardar</label><div class="gps-state" id="gpsState">La medición puede guardarse sin GPS.</div><button class="button primary" id="saveQuick" type="button" disabled>Guardar medición</button>`;
}

async function farmsView() {
  const farms = farmsForTechnician();
  const sessions = await getAll("sessions");
  const activeSession = sessions.find(item => item.technician_id === activeTechnician().id && item.status === "in_progress");
  return `${heading("Trabajo de campo", "Fincas", "Selecciona una de las fincas asignadas a tu perfil.")}${activeSession ? `<div class="resume-card"><div><strong>Muestreo sin finalizar</strong><span>${escapeHTML(currentLot(activeSession.lot_id)?.name)} · ${(await measurementsForSession(activeSession.id)).length}/${activeSession.target_samples} puntos</span></div><button class="text-link" data-go="capture/${activeSession.id}" type="button">Continuar</button></div>` : ""}<div class="list">${farms.map(farm => `<button class="list-item" type="button" data-go="farm/${farm.id}"><span><strong>${escapeHTML(farm.code)} · ${escapeHTML(farm.name)}</strong><span>${lotsForFarm(farm.id).length} lotes · Café · ${escapeHTML(farm.region)}</span></span><b>›</b></button>`).join("")}</div>`;
}

async function farmView(farmId) {
  const farm = currentFarm(farmId);
  if (!farm || farm.technician_id !== activeTechnician().id) return notFoundView();
  const lots = lotsForFarm(farmId);
  const location = [farm.region, farm.municipality, farm.village].filter(Boolean).join(" · ");
  return `${heading("Finca asignada", farm.name, `${farm.code} · ${location || "Ubicación pendiente"} · ${lots.length} lotes activos`)}<div class="notice"><strong>Datos de la finca protegidos</strong><br>La finca y su ubicación son de solo lectura. En esta fase únicamente puedes administrar sus lotes.</div><div class="section-title"><h2>Lotes</h2><button class="text-link" type="button" data-go="lots/${farmId}">Administrar</button></div>${lots.length ? lots.map(lot => `<article class="card lot-card"><div class="row"><div><h3>${escapeHTML(lot.name)}</h3><p class="meta">${lot.area_ha ? `${formatNumber(Number(lot.area_ha))} ha` : "Área pendiente"}${lot.planting_year ? ` · siembra ${lot.planting_year}` : " · año pendiente"}</p></div><button class="icon-action" type="button" data-go="history/${lot.id}">Historial</button></div></article>`).join("") : `<div class="empty-state">Esta finca todavía no tiene lotes activos.<br>Agrega el primero para iniciar una jornada.</div>`}${lots.length >= 2 ? `<button class="button secondary" type="button" data-go="compare/${farmId}">Comparar evolución de lotes</button><button class="button secondary" type="button" data-go="maps/${farmId}">Comparar distribución espacial</button>` : ""}<button class="button primary" type="button" data-go="new/${farmId}" ${lots.length ? "" : "disabled"}>Nueva jornada de muestreo</button>`;
}

async function lotsView(farmId) {
  const farm = currentFarm(farmId);
  if (!farm || farm.technician_id !== activeTechnician().id) return notFoundView();
  const lots = lotsForFarm(farmId, true), active = activeLots(lots), archived = lots.filter(lot => lot.archived_at);
  const card = lot => `<article class="card lot-admin-card ${lot.archived_at ? "archived" : ""}"><div class="row"><div><h3>${escapeHTML(lot.name)}</h3><p class="meta">${lot.area_ha ? `${formatNumber(Number(lot.area_ha))} ha` : "Área pendiente"}${lot.planting_year ? ` · siembra ${lot.planting_year}` : " · año pendiente"}</p></div>${lot.archived_at ? statusBadge("Archivado") : statusBadge("Activo", "good")}</div><button class="button secondary compact" type="button" data-go="lotedit/${lot.id}">${lot.archived_at ? "Ver o reactivar" : "Editar lote"}</button></article>`;
  return `${heading("Administración de lotes", farm.name, "Puedes crear, editar o archivar lotes. Los datos de la finca no se modifican desde esta pantalla.")}<button class="button primary" type="button" data-go="lotnew/${farm.id}">Agregar lote</button><div class="section-title"><h2>Activos (${active.length})</h2></div>${active.length ? active.map(card).join("") : `<div class="empty-state">No hay lotes activos.</div>`}${archived.length ? `<div class="section-title"><h2>Archivados (${archived.length})</h2></div>${archived.map(card).join("")}` : ""}`;
}

async function lotFormView(id, isNew = false) {
  const lot = isNew ? null : currentLot(id);
  const farm = currentFarm(isNew ? id : lot?.farm_id);
  if (!farm || farm.technician_id !== activeTechnician().id || (!isNew && !lot)) return notFoundView();
  const title = isNew ? "Agregar lote" : "Editar lote";
  return `${heading("Lotes", title, `${farm.name} · la finca permanece en modo de solo lectura`)}<form id="lotForm" data-farm-id="${farm.id}" data-lot-id="${lot?.id || ""}"><label class="field"><span>Nombre del lote</span><input class="input" id="lotName" maxlength="80" required value="${escapeHTML(lot?.name || "")}" placeholder="Ej. Lote Norte"></label><label class="field"><span>Área en hectáreas <small>(opcional)</small></span><input class="input" id="lotArea" inputmode="decimal" type="number" min="0.01" max="10000" step="0.01" value="${lot?.area_ha ?? ""}" placeholder="Ej. 1,80"></label><label class="field"><span>Año de siembra <small>(opcional)</small></span><input class="input" id="lotYear" inputmode="numeric" type="number" min="1900" max="${new Date().getFullYear() + 1}" step="1" value="${lot?.planting_year ?? ""}" placeholder="Ej. 2021"></label><div class="readonly-field"><span>Cultivo</span><strong>Café</strong><small>Definido para esta fase del piloto</small></div><p id="lotFormError" class="form-error" role="alert"></p><button class="button primary" type="submit">${isNew ? "Guardar lote" : "Guardar cambios"}</button></form>${lot ? `<button class="button secondary" id="archiveLot" type="button">${lot.archived_at ? "Reactivar lote" : "Archivar lote"}</button><p class="meta">Archivar conserva todas las jornadas y mediciones históricas. El lote deja de aparecer al iniciar nuevos muestreos.</p>` : ""}`;
}

async function newSessionView(farmId) {
  const farm = currentFarm(farmId);
  if (!farm || farm.technician_id !== activeTechnician().id) return notFoundView();
  const lots = lotsForFarm(farmId);
  if (!lots.length) return `${heading("Preparación", "Nueva jornada", farm.name)}<div class="empty-state">Primero debes agregar al menos un lote activo.</div><button class="button primary" type="button" data-go="lotnew/${farm.id}">Agregar lote</button>`;
  return `${heading("Preparación", "Nueva jornada", "Define el lote, la campaña y el número de puntos.")}<form id="newSessionForm"><label class="field"><span>Finca asignada</span><div class="readonly-field"><strong>${escapeHTML(farm.code)} · ${escapeHTML(farm.name)}</strong><small>Solo lectura</small></div></label><label class="field"><span>Lote</span><select id="lotSelect" class="select">${lots.map(item => `<option value="${item.id}">${escapeHTML(item.name)}${item.area_ha ? ` · ${formatNumber(Number(item.area_ha))} ha` : ""}</option>`).join("")}</select></label><label class="field"><span>Campaña de monitoreo</span><select id="campaignSelect" class="select">${demoData.campaigns.map(item => `<option value="${item.id}" ${item.id === state.mapCampaignId ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select></label><label class="field"><span>Protocolo</span><select id="targetSelect" class="select"><option value="10">10 puntos</option><option value="15">15 puntos</option></select></label><div class="protocol-card"><span class="icon-tile">⌁</span><span><strong>Recorrido en zigzag</strong><span>GPS y temperatura se guardan cuando estén disponibles.</span></span></div><button class="button primary" type="submit">Iniciar submuestreo</button></form>`;
}

async function measurementsForSession(sessionId) { return (await getAll("measurements")).filter(item => item.session_id === sessionId).sort((a, b) => a.sample_number - b.sample_number); }

async function captureView(sessionId) {
  const session = await get("sessions", sessionId);
  if (!session || session.technician_id !== activeTechnician().id) return notFoundView();
  const points = await measurementsForSession(session.id);
  const farm = currentFarm(session.farm_id), lot = currentLot(session.lot_id), next = points.length + 1;
  const canUndo = points.length && points.at(-1).sync_status !== "synced";
  return `${heading("Captura", `Punto ${Math.min(next, session.target_samples)} de ${session.target_samples}`, `${farm.name} · ${lot.name}`)}<div class="progress-meta"><span>Recorrido</span><span>${points.length}/${session.target_samples}</span></div><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${session.target_samples}" aria-valuenow="${points.length}"><span style="width:${points.length / session.target_samples * 100}%"></span></div>${readingCard()}${bluetoothPanel()}<label class="field"><span>Lectura manual</span><div class="manual-row"><input class="input" id="manualPh" inputmode="decimal" type="number" min="0" max="14" step="0.01" placeholder="Ej. 5,3"><button class="button secondary" id="useManual" type="button">Usar</button></div></label><label class="field"><span>Temperatura opcional</span><input class="input" id="temperature" inputmode="decimal" type="number" min="-10" max="60" step="0.1" placeholder="Ej. 21,5"></label><label class="check-row"><input id="captureGps" type="checkbox" checked>Solicitar GPS al guardar</label><div class="gps-state" id="gpsState">La ubicación se solicitará al guardar este punto.</div><button class="button primary" id="savePoint" type="button" disabled>Guardar punto</button>${canUndo ? `<button class="button secondary" id="undoPoint" type="button">Corregir último punto</button>` : points.length ? `<p class="meta">El último punto ya fue sincronizado y no puede eliminarse desde el teléfono.</p>` : ""}`;
}

async function resultView(sessionId) {
  const session = await get("sessions", sessionId);
  if (!session) return notFoundView();
  const points = await measurementsForSession(session.id);
  const stats = session.summary || summarize(points.map(item => item.ph));
  const result = interpretation(stats.median);
  const lot = currentLot(session.lot_id), farm = currentFarm(session.farm_id);
  return `${heading("Jornada completada", "Resultado del lote", `${farm.name} · ${lot.name} · ${stats.count} puntos`)}<div class="result-hero"><div class="meta">pH representativo · mediana</div><div class="ph-value">${formatNumber(stats.median)}</div>${statusBadge(result.label, "good")}</div><article class="card interpret-card"><h3>Interpretación</h3><p>El lote se encuentra en el nivel <strong>${escapeHTML(result.label.toLowerCase())}</strong> según los rangos provisionales de demostración para café.</p></article><div class="metric-grid" style="margin-top:15px"><div class="metric"><strong>${formatNumber(stats.median)}</strong><span>mediana</span></div><div class="metric"><strong>${formatNumber(stats.mean)}</strong><span>promedio</span></div><div class="metric"><strong>${formatNumber(stats.stddev)}</strong><span>desv. estándar</span></div></div>${stats.stddev > .5 ? `<div class="notice warning" style="margin-top:14px">Alta dispersión: revisa las mediciones antes de interpretar el lote.</div>` : ""}<div class="notice" style="margin-top:14px">Jornada guardada localmente · sincronización pendiente</div><button class="button secondary" type="button" data-go="history/${lot.id}">Ver historial del lote</button><button class="button secondary" type="button" data-go="maps/${farm.id}">Ver distribución espacial</button><button class="button primary" type="button" data-go="farm/${farm.id}">Volver a la finca</button>`;
}

async function completedSessionsForLot(lotId) { return (await getAll("sessions")).filter(item => item.lot_id === lotId && item.status === "completed").sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at)); }

async function historyView(lotId) {
  const lot = currentLot(lotId); if (!lot) return notFoundView();
  const farm = currentFarm(lot.farm_id); const sessions = await completedSessionsForLot(lot.id);
  return `${heading("Monitoreo", lot.name, `${farm.name} · historial del lote`)}${sessions.length ? `<div class="list">${sessions.map(session => { const stats = session.summary || {}; const campaign = currentCampaign(session.campaign_id); const result = interpretation(stats.median); return `<article class="card history-card"><div class="row"><strong>${escapeHTML(campaign?.name || formatDate(session.started_at))}</strong>${statusBadge(session.sync_status === "pending" ? "Pendiente" : "Sincronizado demo", session.sync_status === "pending" ? "warning" : "good")}</div><div class="metric-grid"><div class="metric"><span>Mediana</span><strong>${formatNumber(stats.median)}</strong></div><div class="metric"><span>Promedio</span><strong>${formatNumber(stats.mean)}</strong></div><div class="metric"><span>Desviación</span><strong>${formatNumber(stats.stddev)}</strong></div><div class="metric"><span>Puntos</span><strong>${stats.count ?? "—"}</strong></div></div><p class="meta" style="margin:12px 0 0">${escapeHTML(result.label)} · ${formatDate(session.completed_at || session.started_at)}</p><div class="history-actions"><a href="#/result/${session.id}">Ver detalle</a><a href="#/maps/${farm.id}">Distribución espacial</a></div></article>`; }).join("")}</div>` : `<div class="empty-state">Este lote todavía no tiene jornadas finalizadas.</div>`}<button class="button secondary" type="button" id="exportHistory" ${sessions.length ? "" : "disabled"}>Exportar historial CSV</button><button class="button primary" type="button" data-go="compare/${farm.id}">Comparar lotes</button>`;
}

async function compareView(farmId) {
  const farm = currentFarm(farmId); if (!farm) return notFoundView();
  const lots = lotsForFarm(farmId); let selected = state.compareLots.filter(id => lots.some(lot => lot.id === id)).slice(0, 3);
  if (lots.length < 2) return `${heading("Monitoreo de finca", "Comparar lotes", farm.name)}<div class="empty-state">Necesitas al menos dos lotes activos para comparar su evolución.</div><button class="button primary" type="button" data-go="lots/${farm.id}">Administrar lotes</button>`;
  if (!selected.length) selected = lots.slice(0, 3).map(lot => lot.id);
  state.compareLots = selected; saveState();
  const sessions = (await getAll("sessions")).filter(item => item.farm_id === farmId && item.status === "completed");
  const series = selected.map(lotId => { const lot = currentLot(lotId); return { id: lotId, name: lot.name, values: demoData.campaigns.map(campaign => { const session = sessions.filter(item => item.lot_id === lotId && item.campaign_id === campaign.id).sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at))[0]; return { campaignId: campaign.id, value: session?.summary?.median ?? null }; }) }; });
  return `${heading("Monitoreo de finca", "Comparar lotes", `${farm.name} · mediana de pH en el tiempo`)}<p class="meta">Selecciona máximo 3 lotes.</p><div class="lot-chips">${lots.map(lot => `<button class="lot-chip" type="button" data-compare-lot="${lot.id}" aria-pressed="${selected.includes(lot.id)}">${escapeHTML(lot.name)}</button>`).join("")}</div><p id="compareError" class="meta" role="alert"></p><article class="card chart-card"><div class="chart-legend">${series.map((item, index) => `<span class="legend-item"><i class="legend-dot" style="background:${seriesColor(index)}"></i>${escapeHTML(item.name)}</span>`).join("")}</div>${lineChart(series, demoData.campaigns)}</article>${series.map(item => `<div class="insight"><strong>${escapeHTML(item.name)}:</strong> ${escapeHTML(trendText(item.values))}</div>`).join("")}<p class="meta" style="margin-top:14px">Las conclusiones se derivan únicamente de las jornadas almacenadas. Los espacios indican ausencia de datos.</p><button class="button secondary" type="button" data-go="maps/${farm.id}">Comparar distribución espacial</button>`;
}

async function mapsView(farmId) {
  const farm = currentFarm(farmId); if (!farm) return notFoundView();
  const lots = lotsForFarm(farmId); let selected = state.mapLots.filter(id => lots.some(lot => lot.id === id)).slice(0, 2);
  if (lots.length < 2) return `${heading("Comparación espacial", "Distribución espacial", farm.name)}<div class="empty-state">Necesitas exactamente dos lotes activos para abrir esta comparación.</div><button class="button primary" type="button" data-go="lots/${farm.id}">Administrar lotes</button>`;
  if (selected.length !== 2) selected = lots.slice(0, 2).map(lot => lot.id);
  state.mapLots = selected; if (!demoData.campaigns.some(item => item.id === state.mapCampaignId)) state.mapCampaignId = demoData.campaigns.at(-1).id; saveState();
  const sessions = await getAll("sessions"); const allMeasurements = await getAll("measurements");
  const cards = selected.map(lotId => { const lot = currentLot(lotId); const session = sessions.filter(item => item.lot_id === lotId && item.campaign_id === state.mapCampaignId && item.status === "completed").sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at))[0]; const points = session ? allMeasurements.filter(item => item.session_id === session.id) : []; const poorGps = points.some(point => Number(point.gps_accuracy_m) > 20); return `<article class="card map-card"><div class="row"><h2 style="margin:0">${escapeHTML(lot.name)}</h2><span class="meta">${session ? `Mediana ${formatNumber(session.summary?.median)}` : "Sin jornada"}</span></div><p class="meta">${escapeHTML(currentCampaign(state.mapCampaignId)?.name || "Campaña")}${points.length ? ` · ${points.length} puntos` : ""}</p>${heatPlot(points)}${poorGps ? `<div class="notice warning" style="margin-top:10px">Algunos puntos tienen precisión GPS superior a 20 m.</div>` : ""}</article>`; }).join("");
  return `${heading("Comparación espacial", "Distribución espacial de las mediciones", `${farm.name} · exactamente 2 lotes`)}<label class="field"><span>Campaña</span><select id="mapCampaign" class="select">${demoData.campaigns.map(item => `<option value="${item.id}" ${item.id === state.mapCampaignId ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select></label><div class="lot-chips">${lots.map(lot => `<button class="lot-chip" type="button" data-map-lot="${lot.id}" aria-pressed="${selected.includes(lot.id)}">${escapeHTML(lot.name)}</button>`).join("")}</div><p id="mapError" class="meta" role="alert"></p><div class="map-grid two">${cards}</div><div class="heat-legend"><span>Más ácido</span><i></i><span>Mayor pH</span></div><div class="notice" style="margin-top:15px"><strong>Alcance de la vista</strong><br>Los colores representan únicamente las zonas observadas y no la totalidad del lote. Es una representación espacial local; no se muestran perímetros.</div>`;
}

async function syncView() {
  const operations = await pendingOperations();
  const groups = operations.reduce((acc, item) => { acc[item.entity] = (acc[item.entity] || 0) + 1; return acc; }, {});
  const labels = { sessions: "Jornadas", measurements: "Mediciones", lots: "Cambios en lotes" };
  if (!pilotMode) return `${heading("Datos locales", "Sincronización", "El trabajo queda almacenado en este teléfono hasta conectar el backend.")}<div class="notice warning"><strong>Supabase no conectado</strong><br>Esta versión no finge una escritura remota. Todos los estados pendientes son reales y locales.</div><article class="card" style="margin-top:16px"><div class="row"><h2 style="margin:0">${operations.length} pendientes</h2>${statusBadge(navigator.onLine ? "En línea" : "Offline", navigator.onLine ? "good" : "warning")}</div>${Object.entries(groups).map(([entity, count]) => `<div class="sync-row"><span>${labels[entity] || escapeHTML(entity)}</span><strong>${count}</strong></div>`).join("") || `<p class="meta" style="margin:16px 0 0">No hay operaciones pendientes.</p>`}</article><button class="button primary" type="button" disabled>Conectar Supabase para sincronizar</button>`;
  return `${heading("Datos del piloto", "Sincronización segura", "Los cambios se guardan primero en este dispositivo y se envían únicamente con tu sesión.")}<article class="card" style="margin-top:16px"><div class="row"><h2 style="margin:0">${operations.length} pendientes</h2>${statusBadge(navigator.onLine ? "En línea" : "Offline", navigator.onLine ? "good" : "warning")}</div>${Object.entries(groups).map(([entity, count]) => `<div class="sync-row"><span>${labels[entity] || escapeHTML(entity)}</span><strong>${count}</strong></div>`).join("") || `<p class="meta" style="margin:16px 0 0">Todos los registros locales están sincronizados.</p>`}</article><p id="syncError" class="form-error" role="alert"></p><button class="button primary" id="syncNow" type="button" ${!navigator.onLine || !operations.length ? "disabled" : ""}>Sincronizar ahora</button><button class="button secondary" id="signOut" type="button">Cerrar sesión</button><p class="meta">Al cerrar sesión, los datos locales permanecen separados y protegidos bajo este usuario en el dispositivo.</p>`;
}

function notFoundView() { return `${heading("No disponible", "No encontramos este registro", "Vuelve al inicio e inténtalo nuevamente.")}<button class="button primary" type="button" data-go="home">Ir al inicio</button>`; }

async function render() {
  updateChrome();
  const { name, id } = route();
  if (["quick", "capture"].includes(name)) sensor.startPolling(); else sensor.stopPolling();
  if (!state.activated && !["activate", "set-password"].includes(name)) { go("activate"); return; }
  const views = { activate: activationView, "set-password": setPasswordView, home: homeView, quick: quickView, farms: farmsView, farm: () => farmView(id), lots: () => lotsView(id), lotnew: () => lotFormView(id, true), lotedit: () => lotFormView(id), new: () => newSessionView(id), capture: () => captureView(id), result: () => resultView(id), history: () => historyView(id), compare: () => compareView(id), maps: () => mapsView(id), sync: syncView };
  try { app.innerHTML = await (views[name] || notFoundView)(); bind(name, id); app.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); }
  catch (error) { console.error(error); app.innerHTML = `${heading("Error", "No pudimos abrir esta pantalla", error.message)}<button class="button primary" type="button" data-go="home">Volver al inicio</button>`; bind(name, id); }
}

function updateReading(value, source, temperatureC = null) {
  const phValue = document.querySelector("#phValue"), label = document.querySelector("#phInterpretation"), temperatureLabel = document.querySelector("#readingTemperature"), input = document.querySelector("#manualPh"), temperatureInput = document.querySelector("#temperature"), save = document.querySelector("#saveQuick") || document.querySelector("#savePoint"), badge = document.querySelector(".reading-card .status-badge"), marker = document.querySelector(".scale-marker");
  if (input) {
    input.value = value;
    input.dataset.source = source;
    if (source === "bluetooth" && Number.isFinite(temperatureC)) input.dataset.temperature = String(temperatureC);
    else delete input.dataset.temperature;
  }
  if (temperatureInput && source === "bluetooth" && Number.isFinite(temperatureC)) {
    temperatureInput.value = temperatureC;
    temperatureInput.dataset.sensorFilled = "true";
  } else if (temperatureInput?.dataset.sensorFilled) {
    temperatureInput.value = "";
    delete temperatureInput.dataset.sensorFilled;
  }
  const valid = validPh(value); if (phValue) phValue.textContent = valid ? `pH ${Number(value).toFixed(2)}` : "—";
  if (label) label.textContent = valid ? interpretation(Number(value)).label : "Esperando lectura";
  if (badge) badge.textContent = source === "bluetooth" ? "Bluetooth YK-S01" : source === "manual" ? "Lectura manual" : "Sin lectura";
  if (temperatureLabel) temperatureLabel.textContent = Number.isFinite(temperatureC) ? `Temperatura ${Number(temperatureC).toFixed(1)} °C` : "Temperatura no disponible";
  if (marker) marker.style.left = `${valid ? Math.max(2, Math.min(98, Number(value) / 14 * 100)) : 0}%`;
  if (save) save.disabled = !valid;
}

function updateBluetoothControls() {
  const connected = sensor.isConnected();
  const status = document.querySelector("#bluetoothStatus");
  const badge = document.querySelector(".bluetooth-panel .status-badge");
  const connect = document.querySelector("#connectBluetooth");
  const disconnect = document.querySelector("#disconnectBluetooth");
  if (status) status.textContent = sensorStatus;
  if (badge) { badge.textContent = connected ? "Conectado" : "No conectado"; badge.classList.toggle("good", connected); }
  if (connect) connect.disabled = connected || sensor.isConnecting() || !sensor.supportsWebBluetooth();
  if (disconnect) disconnect.disabled = !connected;
}

sensor.setHandlers({
  onReading: reading => {
    if (!["quick", "capture"].includes(route().name)) return;
    updateReading(reading.ph, "bluetooth", reading.temperatureC);
  },
  onStatus: message => { sensorStatus = message; updateBluetoothControls(); },
  onConnectionChange: () => updateBluetoothControls()
});

async function captureLocation(enabled, targetId) {
  pendingLocation = null; const target = document.querySelector(targetId);
  if (!enabled) { if (target) target.textContent = "Se guardará sin GPS."; return null; }
  if (target) target.textContent = "Solicitando ubicación…";
  try { pendingLocation = await requestPosition(); if (target) target.textContent = `GPS disponible · precisión ±${Math.round(pendingLocation.accuracy)} m`; return pendingLocation; }
  catch (error) { if (target) target.textContent = `${error.message}. Se guardará sin GPS.`; return null; }
}

function bind(name, id) {
  app.querySelectorAll("[data-go]").forEach(element => element.addEventListener("click", () => go(element.dataset.go)));
  if (name === "activate" && !pilotMode) document.querySelector("#activationForm").addEventListener("submit", event => { event.preventDefault(); state.technicianId = document.querySelector("#technicianSelect").value; state.activated = true; saveState(); go("home"); });
  if (name === "activate" && pilotMode) document.querySelector("#loginForm").addEventListener("submit", async event => {
    event.preventDefault(); const button = document.querySelector("#loginButton"), error = document.querySelector("#loginError");
    button.disabled = true; error.textContent = "";
    try { await auth.signIn(document.querySelector("#loginEmail").value.trim(), document.querySelector("#loginPassword").value); await startPilot(); go("home"); }
    catch (failure) { error.textContent = failure.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : failure.message; button.disabled = false; }
  });
  if (name === "activate" && pilotMode) document.querySelector("#sendRecovery").addEventListener("click", async () => {
    const email = document.querySelector("#loginEmail"), error = document.querySelector("#loginError"), button = document.querySelector("#sendRecovery");
    if (!email.reportValidity()) return;
    button.disabled = true; error.textContent = "";
    const redirectTo = `${new URL("./", location.href).href.split("#")[0].split("?")[0]}#/set-password`;
    try { await auth.requestPasswordReset(email.value.trim(), redirectTo); error.textContent = "Revisa tu correo. Si la cuenta está habilitada, recibirás un enlace para crear la contraseña."; }
    catch (failure) { error.textContent = failure.message; button.disabled = false; }
  });
  if (name === "set-password") document.querySelector("#setPasswordForm").addEventListener("submit", async event => {
    event.preventDefault(); const password = document.querySelector("#newPassword").value, confirm = document.querySelector("#confirmPassword").value, error = document.querySelector("#passwordError"), button = document.querySelector("#passwordButton");
    if (password !== confirm) { error.textContent = "Las contraseñas no coinciden."; return; }
    button.disabled = true; error.textContent = "";
    try { await auth.updatePassword(password); await startPilot(); go("home"); } catch (failure) { error.textContent = failure.message; button.disabled = false; }
  });
  if (["quick", "capture"].includes(name)) {
    const input = document.querySelector("#manualPh"); input.addEventListener("input", () => updateReading(input.value, "manual"));
    document.querySelector("#useManual").addEventListener("click", () => updateReading(input.value, "manual"));
    document.querySelector("#connectBluetooth")?.addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try { await sensor.connect(); }
      catch (failure) { sensorStatus = failure.message || "No fue posible conectar el YK-S01."; updateBluetoothControls(); }
    });
    document.querySelector("#disconnectBluetooth")?.addEventListener("click", () => sensor.disconnect());
    updateBluetoothControls();
  }
  if (name === "quick") document.querySelector("#saveQuick").addEventListener("click", async () => {
    const input = document.querySelector("#manualPh"), location = await captureLocation(document.querySelector("#quickGps").checked, "#gpsState");
    const now = new Date().toISOString(); const technician = activeTechnician();
    const sensorTemperature = Number(input.dataset.temperature);
    const record = { id: crypto.randomUUID(), session_id: null, technician_id: technician.id, country_id: technician.country_id, sample_number: null, ph: Number(input.value), temperature_c: Number.isFinite(sensorTemperature) ? sensorTemperature : null, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, gps_accuracy_m: location?.accuracy ?? null, source: input.dataset.source || "manual", captured_at: now, updated_at: now, sync_status: "pending" };
    await put("measurements", record); await enqueue("measurements", record); toast("Medición guardada localmente"); go("home");
  });
  if (["lotnew", "lotedit"].includes(name)) {
    const form = document.querySelector("#lotForm");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const farmId = form.dataset.farmId, currentLotId = form.dataset.lotId || null;
      const input = normalizeLotInput({ name: document.querySelector("#lotName").value, area_ha: document.querySelector("#lotArea").value, planting_year: document.querySelector("#lotYear").value });
      const error = validateLotInput(input, demoData.lots, farmId, currentLotId);
      if (error) { document.querySelector("#lotFormError").textContent = error; return; }
      const now = new Date().toISOString();
      const existing = currentLotId ? currentLot(currentLotId) : null;
      const record = { id: existing?.id || crypto.randomUUID(), farm_id: farmId, name: input.name, crop: "coffee", area_ha: input.area_ha, planting_year: input.planting_year, archived_at: existing?.archived_at || null, created_at: existing?.created_at || now, updated_at: now, sync_status: "pending" };
      await put("lots", record); await enqueue("lots", record);
      if (existing) Object.assign(existing, record); else demoData.lots.push(record);
      toast(existing ? "Cambios del lote guardados" : "Lote agregado"); go(`lots/${farmId}`);
    });
    document.querySelector("#archiveLot")?.addEventListener("click", async () => {
      const lot = currentLot(form.dataset.lotId); if (!lot) return;
      const now = new Date().toISOString();
      lot.archived_at = lot.archived_at ? null : now; lot.updated_at = now; lot.sync_status = "pending";
      await put("lots", lot); await enqueue("lots", lot);
      state.compareLots = state.compareLots.filter(item => item !== lot.id); state.mapLots = state.mapLots.filter(item => item !== lot.id); saveState();
      toast(lot.archived_at ? "Lote archivado; su historial se conserva" : "Lote reactivado"); go(`lots/${lot.farm_id}`);
    });
  }
  if (name === "new") {
    document.querySelector("#newSessionForm")?.addEventListener("submit", async event => { event.preventDefault(); const technician = activeTechnician(), now = new Date().toISOString(); const session = { id: crypto.randomUUID(), technician_id: technician.id, country_id: technician.country_id, farm_id: id, lot_id: document.querySelector("#lotSelect").value, campaign_id: document.querySelector("#campaignSelect").value, crop: "coffee", target_samples: Number(document.querySelector("#targetSelect").value), status: "in_progress", started_at: now, completed_at: null, updated_at: now, sync_status: "pending", summary: null }; await put("sessions", session); await enqueue("sessions", session); state.currentSessionId = session.id; saveState(); go(`capture/${session.id}`); });
  }
  if (name === "capture") {
    document.querySelector("#savePoint").addEventListener("click", async () => { const session = await get("sessions", id), existing = await measurementsForSession(id); if (existing.length >= session.target_samples) return go(`result/${id}`); const input = document.querySelector("#manualPh"), location = await captureLocation(document.querySelector("#captureGps").checked, "#gpsState"); const now = new Date().toISOString(); const record = { id: crypto.randomUUID(), session_id: session.id, technician_id: session.technician_id, country_id: session.country_id, farm_id: session.farm_id, lot_id: session.lot_id, campaign_id: session.campaign_id, sample_number: existing.length + 1, ph: Number(input.value), temperature_c: document.querySelector("#temperature").value === "" ? null : Number(document.querySelector("#temperature").value), latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, gps_accuracy_m: location?.accuracy ?? null, source: input.dataset.source || "manual", captured_at: now, updated_at: now, sync_status: "pending" }; await put("measurements", record); await enqueue("measurements", record); const points = [...existing, record]; session.updated_at = now; if (points.length >= session.target_samples) { session.status = "completed"; session.completed_at = now; session.summary = summarize(points.map(item => item.ph)); state.currentSessionId = null; } await put("sessions", session); await enqueue("sessions", session); saveState(); if (session.status === "completed") go(`result/${session.id}`); else { toast(`Punto ${record.sample_number} guardado`); render(); } });
    document.querySelector("#undoPoint")?.addEventListener("click", async () => { const points = await measurementsForSession(id), last = points.at(-1); if (!last) return; await remove("measurements", last.id); await discardPendingForRecord("measurements", last.id); const session = await get("sessions", id); session.status = "in_progress"; session.completed_at = null; session.summary = null; session.updated_at = new Date().toISOString(); await put("sessions", session); await enqueue("sessions", session); toast("Último punto eliminado"); render(); });
  }
  if (name === "history") document.querySelector("#exportHistory")?.addEventListener("click", async () => { const sessions = await completedSessionsForLot(id); downloadCSV(`historial-${id}.csv`, sessions.map(session => ({ campana: currentCampaign(session.campaign_id)?.name, fecha: session.completed_at || session.started_at, mediana: session.summary?.median, promedio: session.summary?.mean, desviacion: session.summary?.stddev, puntos: session.summary?.count, sincronizacion: session.sync_status }))); });
  if (name === "compare") app.querySelectorAll("[data-compare-lot]").forEach(button => button.addEventListener("click", () => { const lotId = button.dataset.compareLot, selected = [...state.compareLots]; if (selected.includes(lotId)) state.compareLots = selected.filter(item => item !== lotId); else if (selected.length < 3) state.compareLots = [...selected, lotId]; else { document.querySelector("#compareError").textContent = "Máximo 3 lotes. Desactiva uno antes de seleccionar otro."; return; } saveState(); render(); }));
  if (name === "maps") {
    document.querySelector("#mapCampaign").addEventListener("change", event => { state.mapCampaignId = event.target.value; saveState(); render(); });
    app.querySelectorAll("[data-map-lot]").forEach(button => button.addEventListener("click", () => { const lotId = button.dataset.mapLot, selected = [...state.mapLots]; if (selected.includes(lotId)) { document.querySelector("#mapError").textContent = "La comparación requiere exactamente 2 lotes."; return; } state.mapLots = [selected.at(-1), lotId].filter(Boolean); saveState(); render(); }));
  }
  if (name === "sync" && pilotMode) {
    document.querySelector("#syncNow")?.addEventListener("click", async event => { const button = event.currentTarget, error = document.querySelector("#syncError"); button.disabled = true; error.textContent = ""; try { const count = await remote.syncPending(); toast(`${count} cambios sincronizados`); await startPilot(); render(); } catch (failure) { error.textContent = failure.message; button.disabled = false; } });
    document.querySelector("#signOut")?.addEventListener("click", async () => { sensor.disconnect(); await auth.signOut(); state.activated = false; state.technicianId = null; state.currentSessionId = null; saveState(); demoData = null; go("activate"); });
  }
}

backButton.addEventListener("click", () => history.back());
networkButton.addEventListener("click", () => go("sync"));
window.addEventListener("hashchange", render);
window.addEventListener("online", () => { updateChrome(); toast("Conexión recuperada"); });
window.addEventListener("offline", () => { updateChrome(); toast("Modo offline: los datos seguirán guardándose localmente"); });

async function startPilot() {
  const session = await auth.validSession();
  const userId = session?.user?.id || auth.userId();
  if (!userId) throw new Error("Inicia sesión para abrir el piloto");
  setStorageScope(userId);
  demoData = navigator.onLine ? await remote.load(userId) : await remote.loadCached(userId);
  state.technicianId = userId;
  state.activated = true;
  saveState();
  return demoData;
}

try {
  agronomy = await loadAgronomy();
  if (pilotMode) {
    const redirectSession = auth.captureRedirectSession();
    if (redirectSession) render();
    else if (await auth.validSession()) {
      try { await startPilot(); if (!location.hash || route().name === "activate") go("home"); else render(); }
      catch (failure) { console.error(failure); state.activated = false; saveState(); auth.clearSession(); go("activate"); toast(failure.message); }
    } else { state.activated = false; saveState(); if (!location.hash || route().name !== "activate") go("activate"); else render(); }
  } else {
    setStorageScope(APP_CONFIG.storageScope || APP_CONFIG.technicianId || "demo");
    demoData = await seedDemoData();
    state.technicianId = APP_CONFIG.technicianId || demoData.technicians[0].id;
    state.activated = true;
    saveState();
    if (!location.hash || route().name === "activate") go("home"); else render();
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
} catch (error) {
  console.error(error); app.innerHTML = `<div class="notice error"><strong>No fue posible iniciar la aplicación.</strong><br>${escapeHTML(error.message)}</div>`;
}
