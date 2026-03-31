import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";

// Exact verified formula — matches KnowledgeCenter.tsx
function calcFromGross(grossPerHour: number, hours: number, pit2: boolean) {
  const gross = Math.round(grossPerHour * hours * 100) / 100;
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const zus = pension + disability;
  const healthBase = gross - zus;
  const health = Math.round(healthBase * 0.09 * 100) / 100;
  const kup = Math.round(healthBase * 0.20 * 100) / 100;
  const taxBase = Math.max(0, Math.round(healthBase - kup));
  const grossTax = Math.round(taxBase * 0.12);
  const pit = Math.max(0, grossTax - (pit2 ? 300 : 0));
  const net = Math.round((gross - zus - health - pit) * 100) / 100;
  const netPerHour = hours > 0 ? Math.round((net / hours) * 100) / 100 : 0;
  const empPension = Math.round(gross * 0.0976 * 100) / 100;
  const empDisability = Math.round(gross * 0.065 * 100) / 100;
  const empFP = Math.round(gross * 0.0245 * 100) / 100;
  const empFGSP = Math.round(gross * 0.001 * 100) / 100;
  const employerZus = empPension + empDisability + empFP + empFGSP;
  const totalCost = Math.round((gross + employerZus) * 100) / 100;
  return { gross, pension, disability, zus, healthBase, health, kup, taxBase, grossTax, pit, net, netPerHour, employerZus, totalCost };
}

// Reverse: desired net/h → find gross/h via binary search
function calcFromNet(desiredNetPerHour: number, hours: number, pit2: boolean) {
  let lo = 0, hi = desiredNetPerHour * 3;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const r = calcFromGross(mid, hours, pit2);
    if (r.netPerHour < desiredNetPerHour) lo = mid; else hi = mid;
    if (Math.abs(r.netPerHour - desiredNetPerHour) < 0.005) break;
  }
  const grossRate = Math.round(((lo + hi) / 2) * 100) / 100;
  return { grossRate, ...calcFromGross(grossRate, hours, pit2) };
}

export default function NetPerHourTab() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"gross" | "net">("gross");
  const [grossInput, setGrossInput] = useState(31.40);
  const [netInput, setNetInput] = useState(24.56);
  const [hours, setHours] = useState(160);
  const [pit2, setPit2] = useState(true);

  const r = useMemo(() => {
    if (mode === "gross") return { grossRate: grossInput, ...calcFromGross(grossInput, hours, pit2) };
    return calcFromNet(netInput, hours, pit2);
  }, [mode, grossInput, netInput, hours, pit2]);

  const rows = [
    { label: "Gross / Hour", value: `${r.grossRate.toFixed(2)} PLN`, color: "#3B82F6", bold: true },
    { label: "Hours / Month", value: `${hours}h`, color: "#6B7280" },
    { label: "Gross Monthly", value: `${r.gross.toFixed(2)} PLN`, color: "#3B82F6", bold: true },
    { label: "", value: "", color: "" },
    { label: "Pension (9.76%)", value: `- ${r.pension.toFixed(2)} PLN`, color: "#DC2626" },
    { label: "Disability (1.50%)", value: `- ${r.disability.toFixed(2)} PLN`, color: "#DC2626" },
    { label: "Employee ZUS", value: `- ${r.zus.toFixed(2)} PLN`, color: "#DC2626", bold: true },
    { label: "", value: "", color: "" },
    { label: "Health Base", value: `${r.healthBase.toFixed(2)} PLN`, color: "#6B7280" },
    { label: "Health Ins. (9%)", value: `- ${r.health.toFixed(2)} PLN`, color: "#D97706" },
    { label: "KUP (20%)", value: `${r.kup.toFixed(2)} PLN`, color: "#6B7280" },
    { label: "Tax Base", value: `${r.taxBase.toFixed(2)} PLN`, color: "#6B7280" },
    { label: "Gross Tax (12%)", value: `${r.grossTax.toFixed(2)} PLN`, color: "#6B7280" },
    { label: `PIT${pit2 ? " (after PIT-2 -300)" : ""}`, value: `- ${r.pit.toFixed(2)} PLN`, color: "#D97706", bold: true },
    { label: "", value: "", color: "" },
    { label: "NET MONTHLY", value: `${r.net.toFixed(2)} PLN`, color: "#059669", bold: true, big: true },
    { label: "NET / HOUR", value: `${r.netPerHour.toFixed(2)} PLN`, color: "#10B981", bold: true, big: true },
    { label: "", value: "", color: "" },
    { label: "Employer ZUS", value: `+ ${r.employerZus.toFixed(2)} PLN`, color: "#F59E0B" },
    { label: "TOTAL EMPLOYER COST", value: `${r.totalCost.toFixed(2)} PLN`, color: "#EF4444", bold: true },
  ];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Net Per Hour Calculator</h1>
        <p className="text-sm text-muted-foreground mb-6">Gross ↔ Net with full ZUS breakdown</p>

      {/* Mode toggle */}
      <div style={{ display: "flex", borderRadius: 12, overflow: "hidden", border: "2px solid #1B2A4A", marginBottom: 12 }}>
        <button onClick={() => setMode("gross")} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", background: mode === "gross" ? "#1B2A4A" : "#fff", color: mode === "gross" ? "#FFD600" : "#6B7280" }}>
          Gross → Net
        </button>
        <button onClick={() => setMode("net")} style={{ flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", background: mode === "net" ? "#059669" : "#fff", color: mode === "net" ? "#fff" : "#6B7280" }}>
          Net → Gross
        </button>
      </div>

      {/* Inputs */}
      <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 16, marginBottom: 12 }}>
        {mode === "gross" ? (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Gross Per Hour (PLN)</label>
            <input type="number" step="0.10" value={grossInput} onChange={(e) => setGrossInput(Number(e.target.value))}
              style={{ width: "100%", padding: "10px 12px", border: "2px solid #3B82F6", borderRadius: 10, fontSize: 18, fontWeight: 800, color: "#3B82F6", outline: "none" }} />
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Desired Net Per Hour (PLN)</label>
            <input type="number" step="0.10" value={netInput} onChange={(e) => setNetInput(Number(e.target.value))}
              style={{ width: "100%", padding: "10px 12px", border: "2px solid #059669", borderRadius: 10, fontSize: 18, fontWeight: 800, color: "#059669", outline: "none" }} />
            <div style={{ marginTop: 6, fontSize: 13, color: "#3B82F6", fontWeight: 700 }}>
              Need gross: {r.grossRate.toFixed(2)} PLN/h
            </div>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Hours / Month</label>
          <input type="range" min={1} max={300} value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ width: "100%" }} />
          <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: "#1B2A4A" }}>{hours}h</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#374151", cursor: "pointer" }}>
          <input type="checkbox" checked={pit2} onChange={(e) => setPit2(e.target.checked)} style={{ width: 18, height: 18 }} />
          PIT-2 filed (−300 PLN tax reduction)
        </label>
      </div>

      {/* Big result card */}
      <div style={{ background: "linear-gradient(135deg, #1B2A4A 0%, #2D4270 100%)", borderRadius: 14, padding: 20, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Gross / Hour</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#FFD600" }}>{r.grossRate.toFixed(2)} PLN</div>
        </div>
        <div style={{ fontSize: 24, color: "rgba(255,255,255,0.3)" }}>→</div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Net / Hour</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: "#10B981" }}>{r.netPerHour.toFixed(2)} PLN</div>
        </div>
      </div>

      {/* Full breakdown */}
      <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 }}>Full ZUS Breakdown</div>
        {rows.map((row, i) => {
          if (!row.label) return <div key={i} style={{ height: 6 }} />;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: row.big ? "6px 0" : "3px 0", borderTop: row.big ? "1.5px solid #E5E7EB" : "none" }}>
              <span style={{ fontSize: row.big ? 14 : 12, fontWeight: row.bold ? 700 : 400, color: row.bold ? "#111827" : "#6B7280" }}>{row.label}</span>
              <span style={{ fontSize: row.big ? 16 : 12, fontWeight: row.bold ? 800 : 500, color: row.color, fontFamily: "monospace" }}>{row.value}</span>
            </div>
          );
        })}
      </div>

      </div>
    </div>
  );
}
