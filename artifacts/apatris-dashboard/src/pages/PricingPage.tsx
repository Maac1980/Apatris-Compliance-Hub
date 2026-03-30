import { useState } from "react";
import { Check, Loader2, ArrowRight, Shield, Zap, Building2 } from "lucide-react";

const API = "/api";

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  workerLimit: string;
  popular: boolean;
  icon: typeof Shield;
  color: string;
  borderColor: string;
  bgColor: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 199,
    currency: "PLN",
    period: "/month",
    workerLimit: "Up to 25 workers",
    popular: false,
    icon: Shield,
    color: "text-slate-300",
    borderColor: "border-slate-700/50",
    bgColor: "bg-slate-800/60",
    features: [
      "Worker compliance tracking",
      "Document expiry alerts",
      "Basic payroll calculator",
      "Email notifications",
      "CSV export",
      "1 admin user",
      "Standard support",
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 499,
    currency: "PLN",
    period: "/month",
    workerLimit: "Up to 100 workers",
    popular: true,
    icon: Zap,
    color: "text-red-400",
    borderColor: "border-red-500/40",
    bgColor: "bg-gradient-to-b from-red-900/20 to-slate-800/60",
    features: [
      "Everything in Starter",
      "AI Compliance Copilot",
      "TRC Case Management",
      "Contract & document hub",
      "GPS site tracking",
      "Shift scheduling",
      "Skills matrix",
      "Salary benchmarking",
      "AI audit trail (EU AI Act)",
      "5 admin users",
      "Priority support",
      "API access",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 0,
    currency: "",
    period: "",
    workerLimit: "Unlimited workers",
    popular: false,
    icon: Building2,
    color: "text-blue-400",
    borderColor: "border-blue-500/30",
    bgColor: "bg-slate-800/60",
    features: [
      "Everything in Professional",
      "Unlimited admin users",
      "Multi-company support",
      "Custom integrations",
      "Regulatory intelligence feed",
      "Immigration search engine",
      "Dedicated account manager",
      "On-premise deployment option",
      "Custom SLA",
      "GDPR DPO support",
      "White-label option",
    ],
  },
];

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (planId: string) => {
    if (planId === "enterprise") {
      window.location.href = "mailto:contact@apatris.pl?subject=Enterprise%20Plan%20Inquiry";
      return;
    }
    setLoadingPlan(planId);
    try {
      const res = await fetch(`${API}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // Fallback
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Bar */}
      <header className="border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full bg-white flex items-center justify-center"
              style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.35), 0 0 10px rgba(196,30,24,0.2)" }}
            >
              <svg width="24" height="24" viewBox="0 0 38 38" fill="none">
                <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z"
                  fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
                <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900"
                  fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold tracking-widest uppercase text-white leading-none">APATRIS</p>
              <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase leading-none mt-0.5">Outsourcing &amp; Certified Welders</p>
            </div>
          </div>
          <a href="/login" className="text-sm text-slate-400 hover:text-white transition-colors">
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-4 pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto">
          Choose the plan that fits your workforce. All plans include full compliance tracking,
          document management, and Polish labor law automation.
        </p>
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PLANS.map(plan => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 relative ${plan.bgColor} ${plan.borderColor} ${
                  plan.popular ? "ring-2 ring-red-500/40 md:-mt-4 md:pb-8" : ""
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-red-600 text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wide">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 mb-4">
                  <Icon className={`w-5 h-5 ${plan.color}`} />
                  <h2 className={`text-xl font-bold ${plan.color}`}>{plan.name}</h2>
                </div>

                <div className="mb-1">
                  {plan.price > 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">{plan.price}</span>
                      <span className="text-lg text-slate-400">{plan.currency}</span>
                      <span className="text-sm text-slate-500">{plan.period}</span>
                    </div>
                  ) : (
                    <p className="text-4xl font-bold text-white">Custom</p>
                  )}
                </div>
                <p className="text-sm text-slate-400 mb-6">{plan.workerLimit}</p>

                <ul className="space-y-2.5 mb-8">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.popular ? "text-red-400" : "text-emerald-400"}`} />
                      <span className="text-slate-300">{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleCheckout(plan.id)}
                  disabled={loadingPlan === plan.id}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    plan.popular
                      ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/30"
                      : "bg-slate-700 hover:bg-slate-600 text-white"
                  }`}
                >
                  {loadingPlan === plan.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {plan.price > 0 ? "Get Started" : "Contact Sales"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500">
            All prices are net (+ 23% VAT). Annual billing available with 15% discount.
          </p>
          <p className="text-xs text-slate-600 mt-2">
            GDPR compliant &middot; EU AI Act ready &middot; Data stored in EU (Frankfurt)
          </p>
        </div>
      </div>
    </div>
  );
}
