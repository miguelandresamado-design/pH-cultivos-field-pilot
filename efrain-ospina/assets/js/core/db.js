const DB_PREFIX = "ph-a-la-vista-fase-1";
const LEGACY_DEMO_DB = "ph-cultivos-fase-1";
const DB_VERSION = 1;
const STORES = ["meta", "technicians", "farms", "lots", "campaigns", "sessions", "measurements", "sync_operations"];
let storageScope = "demo";

function normalizeScope(scope) {
  const normalized = String(scope ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(normalized)) throw new Error("Identificador de almacenamiento inválido");
  return normalized;
}

export function setStorageScope(scope) {
  storageScope = normalizeScope(scope);
  return databaseName();
}

export function databaseName() {
  return storageScope === "demo" ? LEGACY_DEMO_DB : `${DB_PREFIX}-${storageScope}`;
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName(), DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(store, mode, work) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = work(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(result?.result ?? result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error("Transacción cancelada")); };
  });
}

export const put = (store, value) => transaction(store, "readwrite", objectStore => objectStore.put(value));
export const remove = (store, id) => transaction(store, "readwrite", objectStore => objectStore.delete(id));
export const clear = store => transaction(store, "readwrite", objectStore => objectStore.clear());

export async function get(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).get(id);
    request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    values.forEach(value => objectStore.put(value));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function resetOperationalData() {
  for (const store of ["sessions", "measurements", "sync_operations"]) await clear(store);
}

export function deleteStorageScope(scope = storageScope) {
  const normalized = normalizeScope(scope);
  const target = normalized === "demo" ? LEGACY_DEMO_DB : `${DB_PREFIX}-${normalized}`;
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(target);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Cierra otras pestañas de pH a la vista para borrar los datos locales"));
  });
}

export { DB_PREFIX, STORES };
