import { Request, Response, NextFunction } from "express";
import { z, ZodError, ZodSchema } from "zod";

/**
 * Express middleware factory that validates request body against a Zod schema.
 * Returns 400 with field-level error messages on validation failure.
 *
 * Usage: router.post("/path", validateBody(MySchema), handler)
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors = err.errors.map(e => ({
          field: e.path.join("."),
          message: e.message,
          code: e.code,
        }));
        res.status(400).json({
          error: "Validation failed",
          details: fieldErrors,
        });
        return;
      }
      res.status(400).json({ error: "Invalid request body" });
    }
  };
}

/**
 * Validates query parameters against a Zod schema.
 *
 * Usage: router.get("/path", validateQuery(MyQuerySchema), handler)
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const fieldErrors = err.errors.map(e => ({
          field: e.path.join("."),
          message: e.message,
          code: e.code,
        }));
        res.status(400).json({
          error: "Invalid query parameters",
          details: fieldErrors,
        });
        return;
      }
      res.status(400).json({ error: "Invalid query parameters" });
    }
  };
}

// ── Common Zod schemas for API validation ──────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password is required"),
});

export const MobileLoginSchema = z.object({
  tier: z.number().int().min(1).max(5),
  password: z.string().min(1, "Password is required"),
  name: z.string().optional(),
});

export const ChangePinSchema = z.object({
  currentPin: z.string().min(1, "Current PIN is required"),
  newPin: z.string().min(4, "New PIN must be at least 4 characters"),
  confirmPin: z.string().min(4, "Confirm PIN is required"),
});

// Reusable field validators
const emailField = z.string().email("Valid email required").or(z.literal("")).optional();
const phoneField = z.string().regex(/^\+?[\d\s()-]{7,20}$/, "Phone must be 7-20 digits, may include +, spaces, dashes").or(z.literal("")).optional();
const peselField = z.string().regex(/^\d{11}$/, "PESEL must be exactly 11 digits").or(z.literal("")).optional();
const nipField = z.string().regex(/^\d{10}$/, "NIP must be exactly 10 digits").or(z.literal("")).optional();
const ibanField = z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, "IBAN must start with 2 letters + 2 digits followed by 10-30 alphanumeric characters").or(z.literal("")).optional();
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional().nullable();

export const CreateWorkerSchema = z.object({
  full_name: z.string().min(2, "Name must be at least 2 characters").optional(),
  fullName: z.string().min(2, "Name must be at least 2 characters").optional(),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  specialization: z.string().optional(),
  assigned_site: z.string().optional(),
  email: emailField,
  phone: phoneField,
  pesel: peselField,
  nip: nipField,
  iban: ibanField,
  trcExpiry: dateField,
  passportExpiry: dateField,
  bhpExpiry: dateField,
  workPermitExpiry: dateField,
  contractEndDate: dateField,
}).passthrough(); // Allow additional fields from legacy API callers

export const UpdateWorkerSchema = z.object({
  email: emailField,
  phone: phoneField,
  pesel: peselField,
  nip: nipField,
  iban: ibanField,
}).passthrough();

export const SelfServiceUpdateSchema = z.object({
  email: emailField,
  phone: phoneField,
  iban: ibanField,
});

export const CreateContractSchema = z.object({
  workerId: z.string().uuid("Valid worker ID required"),
  contractType: z.enum(["umowa_zlecenie", "umowa_o_prace", "b2b", "aneks"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  hourlyRate: z.number().min(0).optional(),
  monthlySalary: z.number().min(0).optional(),
  workLocation: z.string().optional(),
  jobDescription: z.string().optional(),
  poaId: z.string().uuid().optional(),
  language: z.enum(["pl", "en", "bilingual"]).optional(),
});

export const CreateDocumentSchema = z.object({
  workerName: z.string().min(1, "Worker name required"),
  workerId: z.string().optional(),
  documentType: z.string().min(1, "Document type required"),
  issueDate: z.string().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expiry date must be YYYY-MM-DD"),
});

export const ConsentSchema = z.object({
  workerId: z.string().uuid("Valid worker ID required"),
  workerName: z.string().min(1),
  consentType: z.string().min(1),
  version: z.string().optional(),
});

export const GpsCheckinSchema = z.object({
  workerId: z.string().min(1, "Worker ID required"),
  workerName: z.string().min(1, "Worker name required"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const GpsCheckoutSchema = z.object({
  workerId: z.string().min(1, "Worker ID required"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const CreateTenantSchema = z.object({
  name: z.string().min(1, "Tenant name required"),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().optional(),
  domain: z.string().optional().nullable(),
});

export const CopilotSchema = z.object({
  question: z.string().min(1, "Question is required").max(1000),
});

export const SignatureSchema = z.object({
  contractId: z.string().uuid("Valid contract ID required"),
  signerName: z.string().min(1),
  signerRole: z.enum(["worker", "company"]),
  signatureData: z.string().startsWith("data:image/", "Must be a base64 image"),
  workerId: z.string().optional(),
});
