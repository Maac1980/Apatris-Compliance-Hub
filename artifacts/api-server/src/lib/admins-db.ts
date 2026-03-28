import { query, queryOne } from "./db.js";

export interface AdminRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

function mapRow(row: any): AdminRecord {
  return {
    id: row.id,
    fullName: row.full_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    role: row.role ?? "Admin",
  };
}

export async function fetchAdmins(): Promise<AdminRecord[]> {
  const rows = await query("SELECT * FROM admins ORDER BY full_name");
  return rows.map(mapRow);
}

export async function updateAdmin(
  id: string,
  fields: { email?: string; phone?: string }
): Promise<AdminRecord> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (fields.email !== undefined) { setClauses.push(`email = $${idx++}`); params.push(fields.email); }
  if (fields.phone !== undefined) { setClauses.push(`phone = $${idx++}`); params.push(fields.phone); }

  if (setClauses.length === 0) {
    const row = await queryOne("SELECT * FROM admins WHERE id = $1", [id]);
    if (!row) throw new Error("Admin not found");
    return mapRow(row);
  }

  params.push(id);
  const row = await queryOne(
    `UPDATE admins SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (!row) throw new Error("Admin not found");
  return mapRow(row);
}
