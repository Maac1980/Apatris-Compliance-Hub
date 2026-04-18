import { query, queryOne, execute } from "./db.js";
import { encryptIfPresent, lookupHash, decrypt, isEncrypted } from "./encryption.js";

// ── PII encryption: columns that get encrypted at rest + mirrored to a hash column
//    for searchable duplicate detection. NOT including nip (Blocker 2 locked 2026-04-18).
const PII_TO_HASH_COL: Record<string, string> = {
  pesel: "pesel_hash",
  iban: "iban_hash",
  passport_number: "passport_hash",
};

/**
 * Compute the lookup hash for a write value that may be plaintext or already ciphertext.
 * Returns null for null/empty/invalid inputs. If input is ciphertext, decrypts first then
 * hashes the plaintext so the hash column stays searchable even for already-encrypted input.
 */
function piiHashFromInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isEncrypted(trimmed)) {
    const pt = decrypt(trimmed);
    return pt === null ? null : lookupHash(pt);
  }
  return lookupHash(trimmed);
}

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
  oswiadczenie_expiry: string | null;
  gross_total: number | null;
  hourly_rate: number;
  monthly_hours: number;
  advance: number;
  penalties: number;
  iban: string | null;
  pesel: string | null;
  nip: string | null;
  passport_number: string | null;
  pit2: boolean;
  created_at: string;
  updated_at: string;
}

// Decrypts PII fields (pesel, iban, passport_number) on a row before returning.
// nip stays plaintext (Blocker 2). Legacy plaintext passes through via decrypt() passthrough.
function decryptWorkerPii<T extends Partial<WorkerRow>>(row: T): T {
  return {
    ...row,
    pesel: decrypt(row.pesel ?? null) as T["pesel"],
    iban: decrypt(row.iban ?? null) as T["iban"],
    passport_number: decrypt(row.passport_number ?? null) as T["passport_number"],
  };
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
  grossTotal: "gross_total",
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
  passportNumber: "passport_number",
  nationality: "nationality",
  dateOfBirth: "date_of_birth",

  // snake_case pass-through (already DB column names)
  full_name: "full_name",
  passport_number: "passport_number",
  date_of_birth: "date_of_birth",
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
  "gross_total",
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
  "passport_number",
  "nationality",
  "date_of_birth",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchAllWorkers(tenantId: string): Promise<WorkerRow[]> {
  const rows = await query<WorkerRow>("SELECT * FROM workers WHERE tenant_id = $1 ORDER BY full_name", [tenantId]);
  return rows.map(decryptWorkerPii);
}

export async function fetchWorkerById(id: string, tenantId: string): Promise<WorkerRow | null> {
  const row = await queryOne<WorkerRow>("SELECT * FROM workers WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
  return row ? decryptWorkerPii(row) : null;
}

export async function createWorker(
  fields: Partial<WorkerRow>,
  tenantId: string
): Promise<WorkerRow> {
  // Check for duplicate PESEL/NIP before insert
  const pesel = fields.pesel ?? (fields as Record<string, unknown>)["PESEL"];
  const nip = fields.nip ?? (fields as Record<string, unknown>)["NIP"];

  // Duplicate PESEL check: migrated to hash-column lookup since pesel itself is now ciphertext.
  const peselHashForDupCheck = piiHashFromInput(pesel);
  if (peselHashForDupCheck) {
    const dup = await queryOne(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND pesel_hash = $2",
      [tenantId, peselHashForDupCheck]
    );
    if (dup) {
      throw new Error(`PESEL ${pesel} already exists for worker "${(dup as any).full_name}". Duplicate workers are not allowed.`);
    }
  }

  if (nip && typeof nip === "string" && nip.trim() !== "") {
    const dup = await queryOne(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND nip = $2",
      [tenantId, nip.trim()]
    );
    if (dup) {
      throw new Error(`NIP ${nip} already exists for worker "${(dup as any).full_name}". Duplicate workers are not allowed.`);
    }
  }

  const columns: string[] = ["tenant_id"];
  const placeholders: string[] = ["$1"];
  const values: unknown[] = [tenantId];

  let idx = 2;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const col = resolveColumn(key) ?? key;
    if (!MUTABLE_COLUMNS.has(col)) continue;
    const hashCol = PII_TO_HASH_COL[col];
    if (hashCol) {
      // Hash-Column Atomicity: encrypted column + hash column added in same INSERT.
      columns.push(col);
      placeholders.push(`$${idx}`);
      values.push(encryptIfPresent(value));
      idx++;
      columns.push(hashCol);
      placeholders.push(`$${idx}`);
      values.push(piiHashFromInput(value));
      idx++;
    } else {
      columns.push(col);
      placeholders.push(`$${idx}`);
      values.push(value);
      idx++;
    }
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
  // Check for duplicate PESEL/NIP if these fields are being updated
  const peselVal = fields.pesel ?? fields.PESEL;
  // Duplicate PESEL check on update: migrated to hash-column lookup.
  const peselHashForUpdateCheck = piiHashFromInput(peselVal);
  if (peselHashForUpdateCheck) {
    const dup = await queryOne(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND pesel_hash = $2 AND id != $3",
      [tenantId, peselHashForUpdateCheck, id]
    );
    if (dup) {
      throw new Error(`PESEL ${peselVal} already exists for worker "${(dup as any).full_name}". Duplicate workers are not allowed.`);
    }
  }

  const nipVal = fields.nip ?? fields.NIP;
  if (nipVal && typeof nipVal === "string" && nipVal.trim() !== "") {
    const dup = await queryOne(
      "SELECT id, full_name FROM workers WHERE tenant_id = $1 AND nip = $2 AND id != $3",
      [tenantId, nipVal.trim(), id]
    );
    if (dup) {
      throw new Error(`NIP ${nipVal} already exists for worker "${(dup as any).full_name}". Duplicate workers are not allowed.`);
    }
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const col = resolveColumn(key);
    if (!col || !MUTABLE_COLUMNS.has(col)) continue;
    const hashCol = PII_TO_HASH_COL[col];
    if (hashCol) {
      // Hash-Column Atomicity: encrypted column + hash column updated in same SET.
      setClauses.push(`${col} = $${idx}`);
      values.push(encryptIfPresent(value));
      idx++;
      setClauses.push(`${hashCol} = $${idx}`);
      values.push(piiHashFromInput(value));
      idx++;
    } else {
      setClauses.push(`${col} = $${idx}`);
      values.push(value);
      idx++;
    }
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
