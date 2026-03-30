import React, { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, CheckCircle2, TrendingUp, Users, RefreshCcw } from "lucide-react";

interface PayData {
  avgMale: number;
  avgFemale: number;
  medianMale: number;
  medianFemale: number;
  gapPercent: number;
  byContractType: { type: string; male: number; female: number; gap: number }[];
  byNationality: { nationality: string; avgPay: number; count: number }[];
}

const DEMO_DATA: PayData = {
  avgMale: 32.50,
  avgFemale: 30.80,
  medianMale: 31.00,
  medianFemale: 29.50,
  gapPercent: 5.2,
  byContractType: [
    { type: "Umowa Zlecenie", male: 30.00, female: 28.50, gap: 5.0 },
    { type: "Umowa o Prace", male: 35.00, female: 33.10, gap: 5.4 },
    { type: "B2B", male: 45.00, female: 43.50, gap: 3.3 },
  ],
  byNationality: [
    { nationality: "Polish", avgPay: 33.20, count: 45 },
    { nationality: "Ukrainian", avgPay: 29.80, count: 62 },
    { nationality: "Belarusian", avgPay: 28.50, count: 18 },
    { nationality: "Georgian", avgPay: 29.00, count: 12 },
    { nationality: "Indian", avgPay: 31.00, count: 8 },
  ],
};

export default function PayTransparency() {
  const { toast } = useToast();
  const [data, setData] = useState<PayData | null>(null);
  const [loading, setLoading] = useState(false);

  const generateReport = () => {
    setLoading(true);
    setTimeout(() => {
      setData(DEMO_DATA);
      setLoading(false);
      toast({ title: "Report Generated", description: "Pay transparency analysis complete." });
    }, 1200);
  };

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" /> Pay Transparency
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Gender pay gap analysis - EU Pay Transparency Directive</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-mono bg-green-900/50 text-green-300 border border-green-600/50 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> EU Directive 2023/970 Compliant
            </span>
            <button
              onClick={generateReport}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Generate Report
            </button>
          </div>
        </div>

        {!data ? (
          <div className="text-center py-20">
            <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Click "Generate Report" to run pay transparency analysis.</p>
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Male Pay</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.avgMale.toFixed(2)} PLN/h</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg Female Pay</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.avgFemale.toFixed(2)} PLN/h</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Median Male</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.medianMale.toFixed(2)} PLN/h</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Median Female</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.medianFemale.toFixed(2)} PLN/h</p>
              </div>
            </div>

            {/* Pay Gap */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Gender Pay Gap
                </h2>
                <span className={`px-3 py-1 rounded text-sm font-bold ${
                  data.gapPercent <= 5 ? "text-green-400" : data.gapPercent <= 10 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {data.gapPercent}%
                </span>
              </div>
              <div className="w-full bg-background rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.gapPercent <= 5 ? "bg-green-500" : data.gapPercent <= 10 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(data.gapPercent * 5, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {data.gapPercent <= 5 ? "Within acceptable range. No action required." : "Gap exceeds 5%. Action plan recommended per EU Directive."}
              </p>
            </div>

            {/* Contract Type Breakdown */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">By Contract Type</h2>
              <div className="space-y-3">
                {data.byContractType.map((ct) => (
                  <div key={ct.type} className="flex items-center justify-between bg-background rounded-lg p-3">
                    <span className="text-foreground font-medium text-sm">{ct.type}</span>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-muted-foreground">M: <span className="text-foreground font-mono">{ct.male.toFixed(2)}</span></span>
                      <span className="text-muted-foreground">F: <span className="text-foreground font-mono">{ct.female.toFixed(2)}</span></span>
                      <span className={`font-mono font-bold ${ct.gap <= 5 ? "text-green-400" : "text-yellow-400"}`}>{ct.gap}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Nationality Breakdown */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> By Nationality
              </h2>
              <div className="space-y-3">
                {data.byNationality.map((n) => (
                  <div key={n.nationality} className="flex items-center justify-between bg-background rounded-lg p-3">
                    <div>
                      <span className="text-foreground font-medium text-sm">{n.nationality}</span>
                      <span className="text-muted-foreground text-xs ml-2">({n.count} workers)</span>
                    </div>
                    <span className="text-foreground font-mono text-sm">{n.avgPay.toFixed(2)} PLN/h</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
