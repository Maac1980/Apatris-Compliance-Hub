import { MapPin, Users, ShieldCheck, AlertTriangle, ChevronRight, Building2, HardHat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Site {
  id: string;
  name: string;
  location: string;
  professionals: number;
  compliant: number;
  status: "Fully Compliant" | "Issues Present" | "Critical";
}

const SITES: Site[] = [
  { id: "s1", name: "Site A", location: "Warsaw North", professionals: 2, compliant: 1, status: "Issues Present" },
  { id: "s2", name: "Site B", location: "Kraków East", professionals: 2, compliant: 0, status: "Critical" },
  { id: "s3", name: "Site C", location: "Gdańsk Port", professionals: 1, compliant: 1, status: "Fully Compliant" },
];

const statusStyle: Record<string, { pill: string; border: string; dot: string }> = {
  "Fully Compliant": { pill: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", border: "border-l-emerald-400", dot: "bg-emerald-400" },
  "Issues Present":  { pill: "bg-amber-500/10 text-amber-400 border-amber-500/25",   border: "border-l-amber-400",  dot: "bg-amber-400" },
  "Critical":        { pill: "bg-red-500/10 text-red-400 border-red-500/25",          border: "border-l-red-500",    dot: "bg-red-500" },
};

export function SitesModule() {
  const { t } = useTranslation();
  const total = SITES.reduce((s, site) => s + site.professionals, 0);
  const compliantAll = SITES.reduce((s, site) => s + site.compliant, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="px-4 py-5 space-y-5 pb-6"
    >
      <div className="flex items-center gap-2 ml-1">
        <MapPin className="w-4 h-4 text-blue-600" />
        <h2 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground">{t("sites.activeDeployments")}</h2>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-xl font-heading font-black text-foreground">{SITES.length}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{t("sites.activeSites")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-xl font-heading font-black text-blue-600">{total}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{t("sites.deployedPros")}</div>
        </div>
        <div className="premium-card rounded-2xl p-3.5 text-center">
          <div className="text-xl font-heading font-black text-emerald-600">{compliantAll}</div>
          <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{t("sites.fullyCompliant")}</div>
        </div>
      </div>

      {/* Site cards */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-heading font-bold uppercase tracking-widest text-muted-foreground ml-1">{t("sites.sitesOverview")}</h3>
        {SITES.map(site => {
          const style = statusStyle[site.status];
          return (
            <div key={site.id} className={cn("premium-card rounded-2xl border-l-4 p-4 cursor-pointer active:scale-[0.98] transition-transform", style.border)}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-sm text-foreground">{site.name} – {site.location}</h3>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0", style.pill)}>
                      {site.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <HardHat className="w-3.5 h-3.5" />
                      <span>{site.professionals} {t("sites.deployed")}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{site.compliant} {t("sites.compliant")}</span>
                    </div>
                    {site.professionals - site.compliant > 0 && (
                      <div className="flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        <span className="text-red-600 font-medium">{site.professionals - site.compliant} {t("sites.issues")}</span>
                      </div>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0 self-center" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Map placeholder */}
      <div className="premium-card rounded-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 h-36 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-blue-600">{t("sites.interactiveMap")}</p>
            <p className="text-xs text-blue-400">{t("sites.mapPhase4")}</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
