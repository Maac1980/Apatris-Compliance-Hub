import { createRoot } from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Convert URL-safe base64 VAPID key to Uint8Array (required by pushManager).
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Std = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Std);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Best-effort push subscription. All failure paths are swallowed and logged —
// push is an enhancement, never a blocker for app usage.
async function trySubscribeToPush(reg: ServiceWorkerRegistration): Promise<void> {
  try {
    if (!("PushManager" in window)) { console.info("[Push] PushManager unsupported — skipping."); return; }
    const existing = await reg.pushManager.getSubscription();
    if (existing) return;

    if (Notification.permission === "denied") { console.info("[Push] Notification permission denied — skipping."); return; }
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { console.info("[Push] Notification permission not granted — skipping."); return; }
    }

    const keyRes = await fetch("/api/push/vapid-key");
    if (!keyRes.ok) { console.info("[Push] VAPID key unavailable — skipping."); return; }
    const { publicKey } = await keyRes.json();
    if (!publicKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const token = localStorage.getItem("jwt") ?? "";
    const subRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!subRes.ok) console.info("[Push] Backend subscribe returned", subRes.status);
  } catch (err) {
    console.info("[Push] Subscription skipped:", err instanceof Error ? err.message : err);
  }
}

// Register service worker for offline support, then attempt push subscription.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => trySubscribeToPush(reg))
      .catch(() => {});
  });
}
