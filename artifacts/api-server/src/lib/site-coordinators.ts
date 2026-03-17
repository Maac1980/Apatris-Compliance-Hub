import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "artifacts/api-server/data");
const FILE = path.join(DATA_DIR, "site-coordinators.json");

export interface SiteCoordinator {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  assignedSite: string;
  alertEmail: string;
}

function read(): SiteCoordinator[] {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, "utf-8")) as SiteCoordinator[];
  } catch {
    return [];
  }
}

function write(list: SiteCoordinator[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2), "utf-8");
}

function hash(password: string): string {
  return crypto.createHash("sha256").update(password + "apatris-salt").digest("hex");
}

export function listCoordinators(): SiteCoordinator[] {
  return read();
}

export function findCoordinatorByEmail(email: string): SiteCoordinator | undefined {
  return read().find((c) => c.email.toLowerCase() === email.toLowerCase());
}

export function verifyCoordinatorPassword(coord: SiteCoordinator, password: string): boolean {
  return coord.passwordHash === hash(password);
}

export function getCoordinatorForSite(site: string): SiteCoordinator | undefined {
  return read().find((c) => c.assignedSite.toLowerCase() === site.toLowerCase());
}

export function addCoordinator(data: {
  name: string; email: string; password: string; assignedSite: string; alertEmail: string;
}): SiteCoordinator {
  const list = read();
  const existing = list.find((c) => c.email.toLowerCase() === data.email.toLowerCase());
  if (existing) throw new Error("Coordinator with this email already exists");
  const coord: SiteCoordinator = {
    id: crypto.randomUUID(),
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    passwordHash: hash(data.password),
    assignedSite: data.assignedSite.trim(),
    alertEmail: data.alertEmail.trim(),
  };
  list.push(coord);
  write(list);
  return coord;
}

export function updateCoordinator(
  id: string,
  updates: Partial<{ name: string; password: string; assignedSite: string; alertEmail: string }>
): SiteCoordinator {
  const list = read();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Coordinator not found");
  const coord = list[idx];
  if (updates.name) coord.name = updates.name.trim();
  if (updates.assignedSite) coord.assignedSite = updates.assignedSite.trim();
  if (updates.alertEmail !== undefined) coord.alertEmail = updates.alertEmail.trim();
  if (updates.password) coord.passwordHash = hash(updates.password);
  list[idx] = coord;
  write(list);
  return coord;
}

export function removeCoordinator(id: string): void {
  const list = read().filter((c) => c.id !== id);
  write(list);
}
