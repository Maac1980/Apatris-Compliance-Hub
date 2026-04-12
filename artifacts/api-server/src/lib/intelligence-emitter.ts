/**
 * Intelligence Event Emitter — broadcasts legal events via SSE.
 *
 * In-memory EventEmitter. Single-machine scope (fine for MVP).
 * Clients connect via GET /api/intelligence/stream.
 */

import { EventEmitter } from "events";

export interface IntelligenceEvent {
  type: "status_change" | "doc_verified" | "mos_ready";
  workerId: string;
  workerName: string;
  message: string;
  timestamp: string;
  meta?: Record<string, any>;
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
