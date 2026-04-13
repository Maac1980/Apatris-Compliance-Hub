import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT) || 3000;
const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-recharts";
            if (id.includes("@tanstack")) return "vendor-tanstack";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("jspdf")) return "vendor-pdf";
            if (id.includes("i18next")) return "vendor-i18n";
            if (id.includes("date-fns")) return "vendor-dates";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("wouter")) return "vendor-router";
            if (id.includes("html2canvas")) return "vendor-html2canvas";
            if (id.includes("qrcode")) return "vendor-qrcode";
            if (id.includes("framer-motion")) return "vendor-motion";
          }
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
