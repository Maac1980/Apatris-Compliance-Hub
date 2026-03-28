import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * File storage abstraction — supports S3-compatible (Cloudflare R2, AWS S3)
 * and local filesystem fallback for development.
 *
 * Set these env vars for S3/R2:
 *   FILE_STORAGE=s3
 *   S3_BUCKET=apatris-documents
 *   S3_REGION=auto (for R2) or us-east-1
 *   S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com (for R2)
 *   S3_ACCESS_KEY_ID=...
 *   S3_SECRET_ACCESS_KEY=...
 *
 * Without these, falls back to local filesystem (uploads/ directory).
 */

const STORAGE_MODE = process.env.FILE_STORAGE === "s3" ? "s3" : "local";
const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

// ── S3 config ──────────────────────────────────────────────────────────────
const S3_BUCKET = process.env.S3_BUCKET ?? "apatris-documents";
const S3_REGION = process.env.S3_REGION ?? "auto";
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY;

async function getS3Client(): Promise<{ client: any; sdk: any } | null> {
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
  } catch {
    console.warn("[file-storage] @aws-sdk/client-s3 not installed — falling back to local storage");
    return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface StoredFile {
  key: string;          // Unique storage key (path in S3 or local)
  url: string;          // URL to access the file
  size: number;
  mimeType: string;
}

/**
 * Store a file. Returns storage metadata.
 */
export async function storeFile(params: {
  tenantId: string;
  category: string;      // "documents", "contracts", "signatures"
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
  return storeToLocal(key, params.buffer, params.mimeType);
}

/**
 * Retrieve a file by key. Returns the buffer or null if not found.
 */
export async function getFile(key: string): Promise<Buffer | null> {
  if (STORAGE_MODE === "s3") {
    return getFromS3(key);
  }
  return getFromLocal(key);
}

/**
 * Delete a file by key.
 */
export async function deleteFile(key: string): Promise<void> {
  if (STORAGE_MODE === "s3") {
    return deleteFromS3(key);
  }
  return deleteFromLocal(key);
}

/**
 * Get a public/signed URL for a file.
 */
export function getFileUrl(key: string): string {
  if (STORAGE_MODE === "s3" && S3_ENDPOINT) {
    return `${S3_ENDPOINT}/${S3_BUCKET}/${key}`;
  }
  return `/api/files/${encodeURIComponent(key)}`;
}

// ── S3 Implementation ──────────────────────────────────────────────────────

async function storeToS3(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
  const s3 = await getS3Client();
  if (!s3) return storeToLocal(key, buffer, mimeType);

  await s3.client.send(new s3.sdk.PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType,
  }));
  return { key, url: getFileUrl(key), size: buffer.length, mimeType };
}

async function getFromS3(key: string): Promise<Buffer | null> {
  const s3 = await getS3Client();
  if (!s3) return getFromLocal(key);

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
  const s3 = await getS3Client();
  if (!s3) return deleteFromLocal(key);

  try {
    await s3.client.send(new s3.sdk.DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch {}
}

// ── Local Filesystem Implementation ────────────────────────────────────────

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

// ── File serving route (for local mode) ────────────────────────────────────
export { LOCAL_UPLOAD_DIR };
