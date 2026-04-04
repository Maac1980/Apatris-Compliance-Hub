import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
}

const API = import.meta.env.VITE_API_URL ?? "";
const FLAGS: Record<string, string> = { PL: "🇵🇱", NL: "🇳🇱", BE: "🇧🇪", LT: "🇱🇹", SK: "🇸🇰", CZ: "🇨🇿", RO: "🇷🇴" };

interface Country { country_code: string; country_name: string; currency: string; min_wage_hourly: string; social_security_employee: string; social_security_employer: string; income_tax_rate: string; posted_worker_rules: string; }

export function CountryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["country-configs"],
    queryFn: async () => {
      const res = await fetch(`${API}api/countries`, { headers: authHeaders() });
      if (!res.ok) return { countries: [] };
      return res.json() as Promise<{ countries: Country[] }>;
    },
  });

  const countries = data?.countries ?? [];

  return (
    <div className="p-4 min-h-full overflow-y-auto pb-24 bg-[#0c0c0e]">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5 text-[#C41E18]" />
        <h2 className="text-lg font-bold text-white">Country Rules</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[#C41E18] border-t-transparent rounded-full" /></div>
      ) : (
        <div className="space-y-2">
          {countries.map(c => (
            <div key={c.country_code} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{FLAGS[c.country_code] || "🌍"}</span>
                <p className="text-sm font-bold text-white">{c.country_name}</p>
                <span className="text-[10px] text-white/30 font-mono ml-auto">{c.currency}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                <div><p className="text-white/30">Min Wage</p><p className="text-white font-mono font-bold">{c.currency} {Number(c.min_wage_hourly).toFixed(2)}/h</p></div>
                <div><p className="text-white/30">SS Emp/Empl</p><p className="text-white font-mono">{c.social_security_employee}% / {c.social_security_employer}%</p></div>
                <div><p className="text-white/30">Tax</p><p className="text-white font-mono">{c.income_tax_rate}%</p></div>
              </div>
              <p className="text-[9px] text-white/30 line-clamp-2">{c.posted_worker_rules}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
