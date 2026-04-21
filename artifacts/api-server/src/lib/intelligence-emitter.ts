/**
 * Intelligence Event Emitter — broadcasts legal events via SSE.
 *
 * In-memory EventEmitter. Single-machine scope (fine for MVP).
 * Clients connect via GET /api/intelligence/stream.
 */

import { EventEmitter } from "events";

export interface IntelligenceEvent {
  type: "status_change" | "doc_verified" | "mos_ready" | "brief_stage";
  workerId: string;
  workerName?: string;
  message?: string;
  timestamp: string;
  meta?: Record<string, any>;
  // brief_stage-specific optional fields (Wave 1 streaming — legal-brief-pipeline).
  // For other event types these stay undefined.
  pipelineRunId?: string;
  stage?: 1 | 2 | 3 | 4 | 5 | 6;
  stageName?: string;
  status?: "started" | "completed" | "failed";
  confidence?: number;
  summary?: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export function emitIntelligenceEvent(event: IntelligenceEvent): void {
  emitter.emit("intelligence", event);
}

export function onIntelligenceEvent(handler: (event: IntelligenceEvent) => void): () => void {
  emitter.on("intelligence", handler);
  return () => emitter.off("intelligence", handler);
}
