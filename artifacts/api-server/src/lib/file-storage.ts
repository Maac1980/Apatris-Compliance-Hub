import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * File storage abstraction — supports S3-compatible (Cloudflare R2, AWS S3)
 * and local filesystem for development ONLY.
 *
 * PRODUCTION SAFETY:
 *   In production (NODE_ENV=production), R2/S3 config MUST be present.
 *   Local filesystem is DISABLED in production — Fly.io is ephemeral.
 *   Missing config in production = startup failure (loud, not silent).
 *
 * Required env vars for S3/R2:
 *   FILE_STORAGE=s3
 *   S3_BUCKET=apatris-documents
 *   S3_REGION=auto (for R2) or us-east-1
 *   S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com (for R2)
 *   S3_ACCESS_KEY_ID=...
 *   S3_SECRET_ACCESS_KEY=...
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const STORAGE_MODE = process.env.FILE_STORAGE === "s3" ? "s3" : "local";
const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// ── S3 config ──────────────────────────────────────────────────────────────
const S3_BUCKET = process.env.S3_BUCKET ?? "apatris-documents";
const S3_REGION = process.env.S3_REGION ?? "auto";
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;

// ── PRODUCTION VALIDATION (runs at import time — fails hard) ────────────────
if (IS_PRODUCTION && STORAGE_MODE !== "s3") {
  throw new Error(
    "[file-storage] FATAL: FILE_STORAGE is not set to 's3' in production. " +
    "Local filesystem is ephemeral on Fly.io — refusing to start. " +
    "Set FILE_STORAGE=s3 with R2/S3 credentials."
  );
}

if (IS_PRODUCTION && STORAGE_MODE === "s3") {
  const missing: string[] = [];
  if (!S3_BUCKET) missing.push("S3_BUCKET");
  if (!S3_ACCESS_KEY) missing.push("S3_ACCESS_KEY_ID");
  if (!S3_SECRET_KEY) missing.push("S3_SECRET_ACCESS_KEY");
  if (!S3_ENDPOINT) missing.push("S3_ENDPOINT");

  if (missing.length > 0) {
    throw new Error(
      `[file-storage] FATAL: S3/R2 config incomplete in production. Missing: ${missing.join(", ")}. ` +
      "Refusing to start — file uploads would fail."
    );
  }
}

// Log storage provider on load
if (STORAGE_MODE === "s3") {
  console.log(`[file-storage] Storage provider: S3/R2 — bucket: ${S3_BUCKET}, endpoint: ${S3_ENDPOINT ?? "default"}`);
} else {
  console.log(`[file-storage] Storage provider: LOCAL — path: ${LOCAL_UPLOAD_DIR}${IS_PRODUCTION ? " ⚠️ WARNING: ephemeral in production!" : ""}`);
}

// ── S3 Client ──────────────────────────────────────────────────────────────

async function getS3Client(): Promise<{ client: any; sdk: any }> {
  try {
    const sdk = await import("@aws-sdk/client-s3");
    const client = new sdk.S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
      credentials: S3_ACCESS_KEY && S3_SECRET_KEY
        ? { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY }
        : undefined,
      forcePathStyle: true,
    });
    return { client, sdk };
  } catch (err) {
    if (IS_PRODUCTION) {
      throw new Error("[file-storage] @aws-sdk/client-s3 not installed — cannot store files in production without S3 SDK");
    }
    console.warn("[file-storage] @aws-sdk/client-s3 not installed — falling back to local storage (development only)");
    throw err;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

export async function storeFile(params: {
  tenantId: string;
  category: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<StoredFile> {
  const ext = path.extname(params.fileName) || "";
  const hash = crypto.createHash("md5").update(params.buffer).digest("hex").slice(0, 8);
  const safeFileName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${params.tenantId}/${params.category}/${Date.now()}_${hash}_${safeFileName}`;

  if (STORAGE_MODE === "s3") {
    return storeToS3(key, params.buffer, params.mimeType);
  }
  if (IS_PRODUCTION) {
    throw new Error("[file-storage] Local storage is disabled in production");
  }
  return storeToLocal(key, params.buffer, params.mimeType);
}

export async function getFile(key: string): Promise<Buffer | null> {
  if (STORAGE_MODE === "s3") {
    return getFromS3(key);
  }
  if (IS_PRODUCTION) {
    throw new Error("[file-storage] Local storage is disabled in production");
  }
  return getFromLocal(key);
}

export async function deleteFile(key: string): Promise<void> {
  if (STORAGE_MODE === "s3") {
    return deleteFromS3(key);
  }
  if (IS_PRODUCTION) {
    throw new Error("[file-storage] Local storage is disabled in production");
  }
  return deleteFromLocal(key);
}

export function getFileUrl(key: string): string {
  if (STORAGE_MODE === "s3" && S3_ENDPOINT) {
    return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
  }
  return `/api/files/${encodeURIComponent(key)}`;
}

// ── S3 Implementation (NO silent fallback in production) ─────────────────

async function storeToS3(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  let s3;
  try {
    s3 = await getS3Client();
  } catch {
    if (IS_PRODUCTION) {
      throw new Error("File storage unavailable — S3/R2 not configured in production");
    }
    return storeToLocal(key, buffer, mimeType);
  }

  await s3.client.send(new s3.sdk.PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType,
  }));
  return { key, url: getFileUrl(key), size: buffer.length, mimeType };
}

async function getFromS3(key: string): Promise<Buffer | null> {
  let s3;
  try {
    s3 = await getS3Client();
  } catch (err) {
    if (IS_PRODUCTION) throw err;
    return getFromLocal(key);
  }

  try {
    const response = await s3.client.send(new s3.sdk.GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

async function deleteFromS3(key: string): Promise<void> {
  let s3;
  try {
    s3 = await getS3Client();
  } catch (err) {
    if (IS_PRODUCTION) throw err;
    return deleteFromLocal(key);
  }

  try {
    await s3.client.send(new s3.sdk.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {}
}

// ── Local Filesystem Implementation (development only) ───────────────────

async function storeToLocal(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, buffer);
  return { key, url: getFileUrl(key), size: buffer.length, mimeType };
}

async function getFromLocal(key: string): Promise<Buffer | null> {
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

async function deleteFromLocal(key: string): Promise<void> {
  const filePath = path.join(LOCAL_UPLOAD_DIR, key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export { LOCAL_UPLOAD_DIR };
