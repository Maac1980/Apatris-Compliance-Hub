import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const LOG_FILE = path.join(DATA_DIR, "notification-log.json");

export interface NotifEntry {
  id: string;
  timestamp: string;
  workerName: string;
  documentType: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: "RED" | "EXPIRED";
  recipients: string[];
  sent: boolean;
  error?: string;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): NotifEntry[] {
  try {
    ensureDir();
    if (!fs.existsSync(LOG_FILE)) return [];
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8")) as NotifEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: NotifEntry[]) {
  ensureDir();
  fs.writeFileSync(LOG_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

export function appendNotifLog(entry: Omit<NotifEntry, "id">): void {
  const entries = readAll();
  entries.unshift({ id: `n-${Date.now()}`, ...entry });
  if (entries.length > 500) entries.splice(500);
  writeAll(entries);
}

export function getNotifLog(limit = 100): NotifEntry[] {
  return readAll().slice(0, limit);
}
