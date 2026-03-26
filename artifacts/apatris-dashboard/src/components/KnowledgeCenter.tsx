import { useState } from "react";

const TABLE = [
  { tier: "Part-Time", h: 10,  gross: 314.00,  zus: 60.44,   pit: 0,   net: 253.56,  employer: 378.31 },
  { tier: "Part-Time", h: 50,  gross: 1570.00, zus: 302.17,  pit: 0,   net: 1267.83, employer: 1891.54 },
  { tier: "Part-Time", h: 80,  gross: 2512.00, zus: 483.47,  pit: 0,   net: 2028.53, employer: 3026.46 },
  { tier: "Part-Time", h: 100, gross: 3140.00, zus: 604.34,  pit: 0,   net: 2535.66, employer: 3783.07 },
  { tier: "Standard",  h: 120, gross: 3768.00, zus: 725.21,  pit: 18,  net: 3024.79, employer: 4539.69 },
  { tier: "Standard",  h: 130, gross: 4082.00, zus: 785.64,  pit: 48,  net: 3248.36, employer: 4917.99 },
  { tier: "Standard",  h: 150, gross: 4710.00, zus: 906.51,  pit: 108, net: 3695.49, employer: 5674.61 },
  { tier: "Standard",  h: 160, gross: 5024.00, zus: 966.95,  pit: 128, net: 3929.05, employer: 6052.91 },
  { tier: "Overtime",  h: 180, gross: 5652.00, zus: 1087.82, pit: 181, net: 4383.18, employer: 6809.53 },
  { tier: "Overtime",  h: 200, gross: 6280.00, zus: 1208.69, pit: 235, net: 4836.31, employer: 7566.14 },
  { tier: "Overtime",  h: 230, gross: 7222.00, zus: 1389.99, pit: 315, net: 5517.01, employer: 8701.07 },
  { tier: "Overtime",  h: 250, gross: 7850.00, zus: 1510.86, pit: 369, net: 5970.14, employer: 9457.68 },
];

const RATE = 31.40;

function calc(hours: number) {
  const gross = Math.round(hours * RATE * 100) / 100;
  const pension = Math.round(gross * 0.0976 * 100) / 100;
  const disability = Math.round(gross * 0.015 * 100) / 100;
  const social = pension + disability;
  const hb = gross - social;
  const health = Math.round(hb * 0.09 * 100) / 100;
  const kup = Math.round(hb * 0.20 * 100) / 100;
  const tb = Math.round(hb - kup);
  const pit = Math.max(0, Math.round(tb * 0.12) - 300);
  const net = Math.round((gross - social - health - pit) * 100) / 100;
  const employerZus = Math.round(gross * 0.2048 * 100) / 100;
  const employer = Math.round((gross + employerZus) * 100) / 100;
  return { gross, zus: social + health, pit, net, employer };
}

export function KnowledgeCenter() {
  const [hours, setHours] = useState(160);
  const r = calc(hours);
  return (
    <div style={{ padding: "24px", color: "#e2e8f0" }}>
      <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px", color: "#f8fafc" }}>ZUS / PIT Calculator</h2>
      <div style={{ background: "#1e293b", borderRadius: "12px", padding: "20px", marginBottom: "20px", maxWidth: "600px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Hours: <strong style={{ color: "#E9FF70" }}>{hours}h</strong></span>
          <span style={{ fontSize: "14px", color: "#94a3b8" }}>Rate: {RATE} PLN/h</span>
        </div>
        <input type="range" min={1} max={250} value={hours} onChange={e => setHours(Number(e.target.value))} style={{ width: "100%", marginBottom: "16px", accentColor: "#E9FF70" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[["Gross", r.gross.toFixed(2), "#60a5fa"], ["Net Take-Home", r.net.toFixed(2), "#34d399"], ["ZUS + Health", `-${r.zus.toFixed(2)}`, "#f87171"], ["PIT Tax", `-${r.pit.toFixed(2)}`, "#fbbf24"], ["Employer Cost", r.employer.toFixed(2), "#a78bfa"]].map(([label, value, color]) => (
            <div key={label} style={{ background: "#0f172a", borderRadius: "8px", padding: "12px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>{label}</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: color as string }}>{value} PLN</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#1e293b" }}>
              {["Tier","Hours","Gross","ZUS+Health","PIT","Net Take-Home","Employer Cost"].map(h => (
                <th key={h} style={{ padding: "10px 12px", textAlign: "right", color: "#64748b", whiteSpace: "nowrap", borderBottom: "1px solid #334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE.map((row, i) => (
              <tr key={i} style={{ background: i%2===0?"#0f172a":"#1e293b", cursor: "pointer" }} onClick={() => setHours(row.h)}>
                <td style={{ padding: "10px 12px", color: row.tier==="Overtime"?"#f87171":row.tier==="Standard"?"#60a5fa":"#94a3b8", fontWeight: 600 }}>{row.tier}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#f8fafc" }}>{row.h}h</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#60a5fa" }}>{row.gross.toFixed(2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#f87171" }}>-{row.zus.toFixed(2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#fbbf24" }}>{row.pit.toFixed(2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#34d399", fontWeight: 700 }}>{row.net.toFixed(2)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#a78bfa" }}>{row.employer.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
