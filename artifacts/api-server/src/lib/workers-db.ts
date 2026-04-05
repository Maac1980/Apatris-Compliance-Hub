import { query, queryOne, execute } from "./db.js";

export interface WorkerRow {
  id: string;
  full_name: string;
  specialization: string;
  experience: string | null;
  qualification: string | null;
  assigned_site: string | null;
  email: string | null;
  phone: string | null;
  trc_expiry: string | null;
  passport_expiry: string | null;
  bhp_expiry: string | null;
  work_permit_expiry: string | null;
  contract_end_date: string | null;
  medical_exam_expiry: string | null;
  udt_cert_expiry: string | null;
  hourly_rate: number;
  monthly_hours: number;
  advance: number;
  penalties: number;
  iban: string | null;
  pesel: string | null;
  nip: string | null;
  pit2: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Field-name mapping
// Maps Airtable-style names AND camelCase API names to DB column names.
// ---------------------------------------------------------------------------
const FIELD_MAP: Record<string, string> = {
  // Airtable-style names
  "Full Name": "full_name",
  NAME: "full_name",
  SPEC: "specialization",
  QUALIFICATION: "specialization",
  SITE: "assigned_site",
  TRC_EXPIRY: "trc_expiry",
  PASSPORT_EXPIRY: "passport_expiry",
  "BHP EXPIRY": "bhp_expiry",
  "Work Permit Expiry": "work_permit_expiry",
  "Contract End Date": "contract_end_date",
  "Medical Exam Expiry": "medical_exam_expiry",
  "UDT Cert Expiry": "udt_cert_expiry",
  EMAIL: "email",
  PHONE: "phone",
  EXPERIENCE: "experience",
  HOURLY_RATE: "hourly_rate",
  MONTHLY_HOURS: "monthly_hours",
  Advance: "advance",
  Penalties: "penalties",
  IBAN: "iban",
  PESEL: "pesel",
  NIP: "nip",
  PIT2: "pit2",

  // camelCase API names
  fullName: "full_name",
  specialization: "specialization",
  qualification: "qualification",
  assignedSite: "assigned_site",
  trcExpiry: "trc_expiry",
  passportExpiry: "passport_expiry",
  bhpExpiry: "bhp_expiry",
  workPermitExpiry: "work_permit_expiry",
  contractEndDate: "contract_end_date",
  medicalExamExpiry: "medical_exam_expiry",
  udtCertExpiry: "udt_cert_expiry",
  email: "email",
  phone: "phone",
  experience: "experience",
  hourlyRate: "hourly_rate",
  monthlyHours: "monthly_hours",
  advance: "advance",
  penalties: "penalties",
  iban: "iban",
  pesel: "pesel",
  nip: "nip",
  pit2: "pit2",

  // Additional frontend fields
  name: "full_name",
  oswiadczenieExpiry: "oswiadczenie_expiry",
  visaType: "visa_type",
  zusStatus: "zus_status",

  // snake_case pass-through (already DB column names)
  full_name: "full_name",
  assigned_site: "assigned_site",
  trc_expiry: "trc_expiry",
  passport_expiry: "passport_expiry",
  bhp_expiry: "bhp_expiry",
  work_permit_expiry: "work_permit_expiry",
  contract_end_date: "contract_end_date",
  medical_exam_expiry: "medical_exam_expiry",
  udt_cert_expiry: "udt_cert_expiry",
  hourly_rate: "hourly_rate",
  monthly_hours: "monthly_hours",
};

/** Resolve an incoming field name to the DB column name. Returns null if unknown. */
function resolveColumn(field: string): string | null {
  return FIELD_MAP[field] ?? null;
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/** Allowed columns for INSERT / UPDATE (excludes id, created_at, updated_at). */
const MUTABLE_COLUMNS = new Set([
  "full_name",
  "specialization",
  "experience",
  "qualification",
  "assigned_site",
  "email",
  "phone",
  "trc_expiry",
  "passport_expiry",
  "bhp_expiry",
  "work_permit_expiry",
  "contract_end_date",
  "medical_exam_expiry",
  "udt_cert_expiry",
  "hourly_rate",
  "monthly_hours",
  "advance",
  "penalties",
  "iban",
  "pesel",
  "nip",
  "pit2",
  "oswiadczenie_expiry",
  "visa_type",
  "zus_status",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchAllWorkers(tenantId: string): Promise<WorkerRow[]> {
  return query<WorkerRow>("SELECT * FROM workers WHERE tenant_id = $1 ORDER BY full_name", [tenantId]);
}

export async function fetchWorkerById(id: string, tenantId: string): Promise<WorkerRow | null> {
  return queryOne<WorkerRow>("SELECT * FROM workers WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
}

export async function createWorker(
  fields: Partial<WorkerRow>,
  tenantId: string
): Promise<WorkerRow> {
  const columns: string[] = ["tenant_id"];
  const placeholders: string[] = ["$1"];
  const values: unknown[] = [tenantId];

  let idx = 2;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const col = resolveColumn(key) ?? key;
    if (!MUTABLE_COLUMNS.has(col)) continue;
    columns.push(col);
    placeholders.push(`$${idx}`);
    values.push(value);
    idx++;
  }

  if (columns.length === 1) {
    throw new Error("createWorker: no valid fields provided");
  }

  const sql = `
    INSERT INTO workers (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const rows = await query<WorkerRow>(sql, values);
  return rows[0]!;
}

export async function updateWorker(
  id: string,
  fields: Record<string, unknown>,
  tenantId: string
): Promise<WorkerRow> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const col = resolveColumn(key);
    if (!col || !MUTABLE_COLUMNS.has(col)) continue;
    setClauses.push(`${col} = $${idx}`);
    values.push(value);
    idx++;
  }

  // Always bump updated_at
  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 1) {
    // Only updated_at — nothing meaningful to update
    throw new Error("updateWorker: no valid fields to update");
  }

  values.push(id);
  const idIdx = idx;
  idx++;
  values.push(tenantId);
  const sql = `
    UPDATE workers
    SET ${setClauses.join(", ")}
    WHERE id = $${idIdx} AND tenant_id = $${idx}
    RETURNING *
  `;

  const rows = await query<WorkerRow>(sql, values);
  if (rows.length === 0) {
    throw new Error(`updateWorker: worker ${id} not found`);
  }
  return rows[0]!;
}

export async function deleteWorker(id: string, tenantId: string): Promise<void> {
  await execute("DELETE FROM workers WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
}
