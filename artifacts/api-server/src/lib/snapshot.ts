import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const SNAP_FILE = path.join(DATA_DIR, "compliance-snapshots.json");

export interface ComplianceSnapshot {
  date: string;
  total: number;
  compliant: number;
  warning: number;
  critical: number;
  expired: number;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): ComplianceSnapshot[] {
  try {
    ensureDir();
    if (!fs.existsSync(SNAP_FILE)) return [];
    return JSON.parse(fs.readFileSync(SNAP_FILE, "utf-8")) as ComplianceSnapshot[];
  } catch {
    return [];
  }
}

function writeAll(snaps: ComplianceSnapshot[]) {
  ensureDir();
  fs.writeFileSync(SNAP_FILE, JSON.stringify(snaps, null, 2), "utf-8");
}

export function saveSnapshot(snap: ComplianceSnapshot): void {
  const all = readAll();
  const today = snap.date;
  const idx = all.findIndex((s) => s.date === today);
  if (idx >= 0) {
    all[idx] = snap;
  } else {
    all.push(snap);
  }
  all.sort((a, b) => a.date.localeCompare(b.date));
  if (all.length > 90) all.splice(0, all.length - 90);
  writeAll(all);
}

export function getSnapshots(days = 30): ComplianceSnapshot[] {
  const all = readAll();
  return all.slice(-days);
}
