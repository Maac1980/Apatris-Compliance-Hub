import { query, queryOne, execute } from "./db.js";

export interface FaceEncoding {
  id: string;
  tenantId: string;
  workerId: string;
  workerName: string;
  descriptor: number[];
  qualityScore: number;
  enrolledAt: string;
  enrolledBy: string | null;
}

/**
 * Calculate Euclidean distance between two face descriptors.
 * face-api.js produces 128-float descriptors.
 * A distance < 0.6 is typically a match.
 */
function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

const MATCH_THRESHOLD = 0.6;  // Lower = stricter matching
const GOOD_MATCH_THRESHOLD = 0.45;  // High-confidence match

/**
 * Enroll a face for a worker. Stores the 128-float descriptor vector.
 * A worker can have multiple enrolled faces (different angles/lighting).
 */
export async function enrollFace(params: {
  tenantId: string;
  workerId: string;
  workerName: string;
  descriptor: number[];
  qualityScore?: number;
  enrolledBy?: string;
}): Promise<FaceEncoding> {
  if (!Array.isArray(params.descriptor) || params.descriptor.length !== 128) {
    throw new Error("Face descriptor must be an array of 128 floats");
  }

  // Validate all values are numbers
  if (params.descriptor.some(v => typeof v !== "number" || isNaN(v))) {
    throw new Error("Face descriptor contains invalid values");
  }

  const row = await queryOne(
    `INSERT INTO face_encodings (tenant_id, worker_id, worker_name, descriptor, quality_score, enrolled_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      params.tenantId,
      params.workerId,
      params.workerName,
      params.descriptor,  // PostgreSQL FLOAT8[] accepts JS number arrays
      params.qualityScore ?? 0,
      params.enrolledBy ?? null,
    ]
  );
  return mapRow(row!);
}

/**
 * Get all face encodings for a specific worker.
 */
export async function getWorkerFaces(workerId: string, tenantId: string): Promise<FaceEncoding[]> {
  const rows = await query(
    "SELECT * FROM face_encodings WHERE worker_id = $1 AND tenant_id = $2 ORDER BY enrolled_at DESC",
    [workerId, tenantId]
  );
  return rows.map(mapRow);
}

/**
 * Delete all face encodings for a worker.
 */
export async function deleteWorkerFaces(workerId: string, tenantId: string): Promise<number> {
  const rows = await query(
    "DELETE FROM face_encodings WHERE worker_id = $1 AND tenant_id = $2 RETURNING id",
    [workerId, tenantId]
  );
  return rows.length;
}

/**
 * Verify a face against all enrolled faces for a tenant.
 * Returns the best matching worker, or null if no match found.
 */
export async function verifyFace(
  descriptor: number[],
  tenantId: string
): Promise<{
  matched: boolean;
  worker: { id: string; name: string } | null;
  confidence: number;
  distance: number;
}> {
  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    throw new Error("Face descriptor must be an array of 128 floats");
  }

  // Fetch all enrolled faces for this tenant
  const rows = await query<{ worker_id: string; worker_name: string; descriptor: number[] }>(
    "SELECT worker_id, worker_name, descriptor FROM face_encodings WHERE tenant_id = $1",
    [tenantId]
  );

  if (rows.length === 0) {
    return { matched: false, worker: null, confidence: 0, distance: Infinity };
  }

  let bestDistance = Infinity;
  let bestMatch: { id: string; name: string } | null = null;

  for (const row of rows) {
    // PostgreSQL returns FLOAT8[] as a JS number array
    const storedDescriptor = Array.isArray(row.descriptor)
      ? row.descriptor
      : (typeof row.descriptor === "string" ? JSON.parse(row.descriptor) : []);

    const dist = euclideanDistance(descriptor, storedDescriptor);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = { id: row.worker_id, name: row.worker_name };
    }
  }

  const matched = bestDistance < MATCH_THRESHOLD;
  // Convert distance to confidence: 0.0 distance = 100% confidence, threshold = 0%
  const confidence = matched
    ? Math.max(0, Math.min(1, 1 - (bestDistance / MATCH_THRESHOLD)))
    : 0;

  return {
    matched,
    worker: matched ? bestMatch : null,
    confidence: Math.round(confidence * 100) / 100,
    distance: Math.round(bestDistance * 1000) / 1000,
  };
}

function mapRow(row: any): FaceEncoding {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workerId: row.worker_id,
    workerName: row.worker_name,
    descriptor: Array.isArray(row.descriptor) ? row.descriptor : [],
    qualityScore: Number(row.quality_score ?? 0),
    enrolledAt: new Date(row.enrolled_at).toISOString(),
    enrolledBy: row.enrolled_by,
  };
}
