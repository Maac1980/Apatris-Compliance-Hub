import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const LOG_FILE = path.join(DATA_DIR, "audit-log.json");

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  action: "UPDATE_WORKER" | "CREATE_WORKER" | "UPLOAD_DOCUMENT" | "DELETE_WORKER";
  workerId: string;
  workerName: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): AuditEntry[] {
  try {
    ensureDir();
    if (!fs.existsSync(LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")) as AuditEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: AuditEntry[]) {
  ensureDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

export function appendAuditLog(entry: Omit<AuditEntry, "id">): void {
  const entries = readAll();
  entries.unshift({ id: `a-${Date.now()}`, ...entry });
  if (entries.length > 1000) entries.splice(1000);
  writeAll(entries);
}

export function getAuditLog(limit = 100): AuditEntry[] {
  return readAll().slice(0, limit);
}
