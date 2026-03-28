import { createRoot } from "react-dom/client";
import App from "./App";
import "./lib/i18n";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
