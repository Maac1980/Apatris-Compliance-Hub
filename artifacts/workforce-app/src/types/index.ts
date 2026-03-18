export type Role = "Owner" | "Manager" | "Office" | "Worker";

export interface UserSession {
  role: Role | null;
}
