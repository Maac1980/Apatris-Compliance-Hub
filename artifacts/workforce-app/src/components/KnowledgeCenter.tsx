import { useState, useMemo } from "react";

type ContractType = "zlecenie" | "praca";

function calculate(hours: number, rate: number, contract: ContractType, applyPit2: boolean, includeSickness: boolean) {
  const gross = Math.round(hours * rate * 100) / 100;
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const sickness = includeSickness ? Math.round(gross * 0.0245 * 100) / 100 : 0;
  const employeeZus = pension + disability + sickness;
  const healthRate = contract === "zlecenie" ? 0.079866 : 0.077661;
  const health = Math.round(gross * healthRate * 100) / 100;
  const healthBase = gross - employeeZus;
  const kup = Math.round(healthBase * 0.20 * 100) / 100;
  const taxBase = Math.round(healthBase - kup);
  const rawPit = Math.round(taxBase * 0.12) - (applyPit2 ? 300 : 0);
  const pit = Math.max(0, rawPit);
  const net = Math.round((gross - employeeZus - health - pit) * 100) / 100;
  const empRate = contract === "zlecenie" ? 0.1881 : 0.2048;
  const employerZus = Math.round(gross * empRate * 100) / 100;
  const totalCost = Math.round((gross + employerZus) * 100) / 100;
  return { gross, employeeZus, health, pit, net, employerZus, totalCost, taxBase };
}

export function KnowledgeCenter() {
  const [hours, setHours] = useState(160);
  const [rate, setRate] = useState(31.40);
  const [contract, setContract] = useState<ContractType>("zlecenie");
  const [applyPit2, setApplyPit2] = useState(true);
  const [includeSickness, setIncludeSickness] = useState(false);
  const r = useMemo(() => calculate(hours, rate, contract, applyPit2, includeSickness), [hours, rate, contract, applyPit2, includeSickness]);

  return (
    <div style={{ padding: "16px", color: "#e2e8f0", fontFamily: "Inter, sans-serif", maxWidth: "500px", margin: "0 auto" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "16px", color: "#f8fafc" }}>ZUS Calculator</h2>

      <div style={{ display: "flex", borderRadius: "10px", overflow: "hidden", border: "1px solid #334155", marginBottom: "16px" }}>
        <button onClick={() => setContract("zlecenie")} style={{ flex: 1, padding: "10px", fontSize: "13px", fontWeight: 700, background: contract === "zlecenie" ? "#3b82f6" : "#1e293b", color: "#fff", border: "none", cursor: "pointer" }}>
          Umowa Zlecenie
        </button>
        <button onClick={() => setContract("praca")} style={{ flex: 1, padding: "10px", fontSize: "13px", fontWeight: 700, background: contract === "praca" ? "#22c55e" : "#1e293b", color: "#fff", border: "none", cursor: "pointer" }}>
          Umowa o Pracę
        </button>
      </div>

      <div style={{ background: "#1e293b", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "13px", color: "#94a3b8" }}>Hours</span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#3b82f6" }}>{hours}h</span>
        </div>
        <input type="range" min={1} max={300} value={hours} onChange={e => setHours(Number(e.target.value))} style={{ width: "100%", marginBottom: "12px", accentColor: "#3b82f6" }} />
        <div style={{ marginBottom: "8px" }}>
          <label style={{ fontSize: "12px", color: "#94a3b8", display: "block", marginBottom: "4px" }}>Hourly Rate (PLN)</label>
          <input type="number" step="0.10" value={rate} onChange={e => setRate(Number(e.target.value))} style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", padding: "8px 12px", color: "#fff", fontSize: "14px", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "16px", paddingTop: "8px", borderTop: "1px solid #334155" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#cbd5e1", cursor: "pointer" }}>
            <input type="checkbox" checked={applyPit2} onChange={e => setApplyPit2(e.target.checked)} style={{ accentColor: "#3b82f6" }} />
            PIT-2 (300 PLN)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#cbd5e1", cursor: "pointer" }}>
            <input type="checkbox" checked={includeSickness} onChange={e => setIncludeSickness(e.target.checked)} style={{ accentColor: "#3b82f6" }} />
            Sickness (2.45%)
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        {[
          ["GROSS", r.gross.toFixed(2), "#60a5fa"],
          ["NET TAKE-HOME", r.net.toFixed(2), "#34d399"],
          ["EMPLOYEE ZUS", `-${r.employeeZus.toFixed(2)}`, "#f87171"],
          ["HEALTH", `-${r.health.toFixed(2)}`, "#f87171"],
          ["PIT TAX", `-${r.pit.toFixed(2)}`, "#fbbf24"],
          ["TOTAL EMPLOYER COST", r.totalCost.toFixed(2), "#e879f9"],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: "#1e293b", borderRadius: "10px", padding: "12px", border: "1px solid #334155" }}>
            <div style={{ fontSize: "10px", color: "#64748b", fontWeight: 600, letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: color as string }}>{value}</div>
            <div style={{ fontSize: "10px", color: "#475569" }}>PLN</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#1e293b", borderRadius: "10px", padding: "12px", border: "1px solid #334155", fontSize: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ color: "#64748b" }}>Tax Base (Podstawa)</span>
          <span style={{ color: "#f8fafc", fontWeight: 600 }}>{r.taxBase.toFixed(2)} PLN</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ color: "#64748b" }}>Employer ZUS</span>
          <span style={{ color: "#f8fafc", fontWeight: 600 }}>{r.employerZus.toFixed(2)} PLN</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#64748b" }}>Contract Type</span>
          <span style={{ color: "#f8fafc", fontWeight: 600 }}>{contract === "zlecenie" ? "Umowa Zlecenie" : "Umowa o Pracę"}</span>
        </div>
      </div>
    </div>
  );
}
