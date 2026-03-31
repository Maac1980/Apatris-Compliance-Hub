import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { queryOne } from "./db.js";

// Extend Express Request to include tenantId
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      tenantSlug?: string;
    }
  }
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  domain: string | null;
  is_active: boolean;
  created_at: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "";

/**
 * Middleware that extracts tenant from JWT token.
 * If no token or no tenant_id in token, falls back to default tenant.
 * Attaches req.tenantId for use in all downstream queries.
 */
export function tenantMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Try to extract from JWT
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
      if (payload.tenantId && typeof payload.tenantId === "string") {
        req.tenantId = payload.tenantId;
        req.tenantSlug = (payload.tenantSlug as string) ?? undefined;
        return next();
      }
    } catch {
      // Token invalid — fall through to default
    }
  }

  // Try X-Tenant-ID header (for API key auth in future)
  const headerTenant = req.headers["x-tenant-id"];
  if (typeof headerTenant === "string" && headerTenant.trim()) {
    req.tenantId = headerTenant.trim();
    return next();
  }

  // Fall back to default tenant (set during DB init)
  req.tenantId = getDefaultTenantId();
  next();
}

// Cache the default tenant ID to avoid a DB query on every request
let _defaultTenantId: string | null = null;

export function setDefaultTenantId(id: string): void {
  _defaultTenantId = id;
}

export function getDefaultTenantId(): string | null {
  return _defaultTenantId;
}
