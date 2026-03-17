import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "artifacts/api-server/data");
const FILE = path.join(DATA_DIR, "payroll-records.json");

export interface PayrollRecord {
  id: string;
  workerId: string;
  workerName: string;
  monthYear: string;        // "2026-03"
  totalHours: number;
  hourlyRate: number;
  grossPayout: number;      // totalHours * hourlyRate
  advancesDeducted: number;
  penaltiesDeducted: number;
  finalNettoPayout: number; // grossPayout - advances - penalties
  zusBaseSalary: number;    // same as grossPayout (base before deductions)
  committedAt: string;      // ISO timestamp
  committedBy: string;
}

function readAll(): PayrollRecord[] {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) return [];
    const raw = fs.readFileSync(FILE, "utf-8").trim();
    if (!raw) return [];
    return JSON.parse(raw) as PayrollRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: PayrollRecord[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(records, null, 2), "utf-8");
}

export function getAllPayrollRecords(): PayrollRecord[] {
  return readAll();
}

export function getPayrollRecordsByWorker(workerId: string): PayrollRecord[] {
  return readAll().filter((r) => r.workerId === workerId);
}

export function appendPayrollRecord(record: Omit<PayrollRecord, "id">): PayrollRecord {
  const all = readAll();
  const newRecord: PayrollRecord = { id: randomUUID(), ...record };
  all.push(newRecord);
  writeAll(all);
  return newRecord;
}

export function payrollRecordExistsForMonth(workerId: string, monthYear: string): boolean {
  return readAll().some((r) => r.workerId === workerId && r.monthYear === monthYear);
}
