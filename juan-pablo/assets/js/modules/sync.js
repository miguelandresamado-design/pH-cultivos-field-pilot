import { getAll, put, remove } from "../core/db.js";

export async function enqueue(entity, record, operation = "upsert") {
  const operations = await getAll("sync_operations");
  const existing = operations.find(item => item.entity === entity && item.record_id === record.id && item.status === "pending");
  const now = new Date().toISOString();
  const entry = existing || { id: crypto.randomUUID(), entity, record_id: record.id, created_at: now, attempts: 0 };
  Object.assign(entry, { operation, payload: record, status: "pending", updated_at: now, last_error: null, next_retry_at: null });
  await put("sync_operations", entry);
  return entry;
}

export async function pendingOperations() {
  return (await getAll("sync_operations")).filter(item => item.status !== "synced");
}

export async function discardPendingForRecord(entity, recordId) {
  const operations = await getAll("sync_operations");
  const matches = operations.filter(item => item.entity === entity && item.record_id === recordId && item.status !== "synced");
  for (const item of matches) await remove("sync_operations", item.id);
}

export function deduplicateOperations(operations) {
  const map = new Map();
  operations.forEach(operation => map.set(`${operation.entity}:${operation.record_id}`, operation));
  return [...map.values()];
}
