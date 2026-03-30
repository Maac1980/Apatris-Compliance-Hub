import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Globe, Loader2, CheckCircle2, Info } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}
const BASE = import.meta.env.BASE_URL;

interface CountryInfo {
  code: string;
  name: string;
  flag: string;
}

interface ComplianceRules {
  code: string;
  name: string;
  minimumWage: string;
  socialContributions: string;
  taxRate: string;
  workPermitRequired: boolean;
  maxPostingDuration: string;
  requirements: string[];
  notes: string;
}

const COUNTRIES: CountryInfo[] = [
  { code: "PL", name: "Poland", flag: "PL" },
  { code: "CZ", name: "Czech Republic", flag: "CZ" },
  { code: "RO", name: "Romania", flag: "RO" },
  { code: "DE", name: "Germany", flag: "DE" },
];

export default function CountryCompliance() {
  const { toast } = useToast();
  const [selectedCountry, setSelectedCountry] = useState("PL");

  const { data: countries = [] } = useQuery<CountryInfo[]>({
    queryKey: ["compliance-countries"],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}api/compliance/countries`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        return res.json();
      } catch {
        return COUNTRIES;
      }
    },
  });

  const { data: rules, isLoading } = useQuery<ComplianceRules>({
    queryKey: ["compliance-country", selectedCountry],
    queryFn: async () => {
      try {
        const res = await fetch(`${BASE}api/compliance/country/${selectedCountry}`, { headers: authHeaders() });
        if (!res.ok) throw new Error();
        return res.json();
      } catch {
        // Fallback demo data
        const fallback: Record<string, ComplianceRules> = {
          PL: { code: "PL", name: "Poland", minimumWage: "4 666 PLN/month", socialContributions: "ZUS: ~35% employer", taxRate: "12% / 32% PIT", workPermitRequired: false, maxPostingDuration: "N/A (home country)", requirements: ["ZUS registration", "PIT-11 annual filing", "BHP training", "Medical examination"], notes: "EU citizens do not need work permits." },
          CZ: { code: "CZ", name: "Czech Republic", minimumWage: "18 900 CZK/month", socialContributions: "~34% employer", taxRate: "15% / 23% income tax", workPermitRequired: true, maxPostingDuration: "12 months (extendable to 18)", requirements: ["A1 certificate", "Posted worker notification", "Czech labor law compliance", "Minimum wage adherence"], notes: "Notification to Czech labor inspectorate required before posting." },
          RO: { code: "RO", name: "Romania", minimumWage: "3 700 RON/month", socialContributions: "~37.25% total", taxRate: "10% flat income tax", workPermitRequired: true, maxPostingDuration: "12 months (extendable to 18)", requirements: ["A1 certificate", "Romanian labor code compliance", "Posted worker notification", "Social security coverage"], notes: "Non-EU workers need separate work authorization." },
          DE: { code: "DE", name: "Germany", minimumWage: "12.82 EUR/hour", socialContributions: "~20% employer", taxRate: "14-45% progressive", workPermitRequired: true, maxPostingDuration: "12 months (extendable to 18)", requirements: ["A1 certificate", "MiLoG registration", "Posted worker notification (Meldung)", "German minimum wage compliance", "Document retention in German"], notes: "Strict enforcement via Zoll (customs). Fines up to EUR 500,000." },
        };
        return fallback[selectedCountry] ?? fallback["PL"];
      }
    },
  });

  const displayCountries = countries.length > 0 ? countries : COUNTRIES;

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="w-6 h-6 text-primary" /> Country Compliance Rules
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Minimum wages, tax rates, and posting requirements per country</p>
        </div>

        {/* Country Selector */}
        <div className="flex gap-2 flex-wrap">
          {displayCountries.map((c) => (
            <button
              key={c.code}
              onClick={() => setSelectedCountry(c.code)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                selectedCountry === c.code
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : rules ? (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Minimum Wage</p>
                <p className="text-xl font-bold text-foreground mt-1">{rules.minimumWage}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Social Contributions</p>
                <p className="text-xl font-bold text-foreground mt-1">{rules.socialContributions}</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tax Rate</p>
                <p className="text-xl font-bold text-foreground mt-1">{rules.taxRate}</p>
              </div>
            </div>

            {/* Details */}
            <div className="bg-card border border-border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">{rules.name} - Compliance Requirements</h2>
                <span className={`px-3 py-1 rounded text-xs font-mono uppercase ${
                  rules.workPermitRequired
                    ? "bg-yellow-900/50 text-yellow-300 border border-yellow-500/50"
                    : "bg-green-900/50 text-green-300 border border-green-600/50"
                }`}>
                  {rules.workPermitRequired ? "Work Permit Required" : "No Permit Needed"}
                </span>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-1">Max Posting Duration: <span className="text-foreground font-medium">{rules.maxPostingDuration}</span></p>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-2">Requirements:</p>
                <ul className="space-y-2">
                  {rules.requirements.map((req, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" /> {req}
                    </li>
                  ))}
                </ul>
              </div>

              {rules.notes && (
                <div className="flex items-start gap-2 bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
                  <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-blue-300">{rules.notes}</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
