import crypto from "crypto";
import { query, queryOne, execute } from "./db.js";

export interface SiteCoordinator {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  assignedSite: string;
  alertEmail: string;
}

function hash(password: string): string {
  return crypto.createHash("sha256").update(password + "apatris-salt").digest("hex");
}

function mapRow(row: any): SiteCoordinator {
  return {
    id: row.id,
    name: row.name ?? "",
    email: row.email ?? "",
    passwordHash: row.password_hash ?? "",
    assignedSite: row.assigned_site ?? "",
    alertEmail: row.alert_email ?? "",
  };
}

export async function listCoordinators(): Promise<SiteCoordinator[]> {
  const rows = await query("SELECT * FROM site_coordinators ORDER BY name");
  return rows.map(mapRow);
}

export async function findCoordinatorByEmail(email: string): Promise<SiteCoordinator | undefined> {
  const row = await queryOne(
    "SELECT * FROM site_coordinators WHERE LOWER(email) = LOWER($1)",
    [email]
  );
  return row ? mapRow(row) : undefined;
}

export function verifyCoordinatorPassword(coord: SiteCoordinator, password: string): boolean {
  return coord.passwordHash === hash(password);
}

export async function getCoordinatorForSite(site: string): Promise<SiteCoordinator | undefined> {
  const row = await queryOne(
    "SELECT * FROM site_coordinators WHERE LOWER(assigned_site) = LOWER($1)",
    [site]
  );
  return row ? mapRow(row) : undefined;
}

export async function addCoordinator(data: {
  name: string;
  email: string;
  password: string;
  assignedSite: string;
  alertEmail: string;
}): Promise<SiteCoordinator> {
  // Check for duplicate email
  const existing = await findCoordinatorByEmail(data.email);
  if (existing) throw new Error("Coordinator with this email already exists");

  const row = await queryOne(
    `INSERT INTO site_coordinators (name, email, password_hash, assigned_site, alert_email)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.name.trim(),
      data.email.trim().toLowerCase(),
      hash(data.password),
      data.assignedSite.trim(),
      data.alertEmail.trim(),
    ]
  );
  return mapRow(row);
}

export async function updateCoordinator(
  id: string,
  updates: Partial<{ name: string; password: string; assignedSite: string; alertEmail: string }>
): Promise<SiteCoordinator> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.name) { setClauses.push(`name = $${idx++}`); params.push(updates.name.trim()); }
  if (updates.assignedSite) { setClauses.push(`assigned_site = $${idx++}`); params.push(updates.assignedSite.trim()); }
  if (updates.alertEmail !== undefined) { setClauses.push(`alert_email = $${idx++}`); params.push(updates.alertEmail.trim()); }
  if (updates.password) { setClauses.push(`password_hash = $${idx++}`); params.push(hash(updates.password)); }

  if (setClauses.length === 0) {
    const row = await queryOne("SELECT * FROM site_coordinators WHERE id = $1", [id]);
    if (!row) throw new Error("Coordinator not found");
    return mapRow(row);
  }

  params.push(id);
  const row = await queryOne(
    `UPDATE site_coordinators SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );
  if (!row) throw new Error("Coordinator not found");
  return mapRow(row);
}

export async function removeCoordinator(id: string): Promise<void> {
  await execute("DELETE FROM site_coordinators WHERE id = $1", [id]);
}
