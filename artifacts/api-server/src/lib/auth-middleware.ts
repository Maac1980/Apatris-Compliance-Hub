import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        name: string;
        role: string;
        assignedSite?: string;
        tenantId?: string;
        tenantSlug?: string;
      };
    }
  }
}

/**
 * Middleware that requires a valid JWT Bearer token.
 * Attaches decoded user to req.user.
 * Returns 401 if no token or invalid token.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as {
      email: string; name: string; role: string;
      assignedSite?: string; tenantId?: string; tenantSlug?: string;
    };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token invalid or expired." });
  }
}

/**
 * Middleware factory that requires the authenticated user to have one of the specified roles.
 * Must be used AFTER requireAuth.
 *
 * Roles in the system:
 * - "Admin" — dashboard admins (Manish, Akshay)
 * - "Coordinator" — site coordinators
 * - "Executive" — T1 mobile app
 * - "LegalHead" — T2 mobile app
 * - "TechOps" — T3 mobile app
 * - "Coordinator" — T4 mobile app (same as site coordinator)
 * - "Professional" — T5 mobile app
 *
 * Usage: router.get("/payroll", requireAuth, requireRole("Admin", "Executive"), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: "Access denied. Insufficient permissions.",
        requiredRoles: allowedRoles,
        yourRole: req.user.role,
      });
      return;
    }
    next();
  };
}
