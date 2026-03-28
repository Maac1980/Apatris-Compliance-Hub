import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, LogIn, LogOut, Clock, Users, Loader2, AlertTriangle, CheckCircle2, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";

const API = "/api";

interface ActiveCheckin {
  id: string;
  worker_name: string;
  site_name: string;
  check_in_at: string;
  is_anomaly: boolean;
}

export function GpsCheckinTab() {
  const { role, user } = useAuth();
  const { t } = useTranslation();
  const jwt = user?.jwt ?? "";
  const isExecutive = role === "Executive" || role === "LegalHead";

  const [loading, setLoading] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [currentSite, setCurrentSite] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeWorkers, setActiveWorkers] = useState<ActiveCheckin[]>([]);
  const [gpsStatus, setGpsStatus] = useState<"pending" | "acquired" | "denied">("pending");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Get GPS position
  const acquireGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus("denied");
      setError("GPS not available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus("acquired");
      },
      () => {
        setGpsStatus("denied");
        setError("GPS access denied. Enable location services.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => { acquireGps(); }, [acquireGps]);

  // Load active workers for Executive view
  useEffect(() => {
    if (!isExecutive || !jwt) return;
    fetch(`${API}/gps/active`, { headers: { Authorization: `Bearer ${jwt}` } })
      .then(r => r.json())
      .then(d => setActiveWorkers(d.active ?? []))
      .catch(() => {});
  }, [isExecutive, jwt]);

  const handleCheckIn = async () => {
    if (!coords || !jwt) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/gps/checkin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: user?.name ?? "unknown",
          workerName: user?.name ?? "Worker",
          latitude: coords.lat,
          longitude: coords.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Check-in failed");
        return;
      }
      setCheckedIn(true);
      setCurrentSite(data.matchedSite?.name ?? data.checkin?.site_name ?? "Unknown Site");
      setCheckInTime(new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }));
      setSuccess("Checked in successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!coords || !jwt) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/gps/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: user?.name ?? "unknown",
          latitude: coords.lat,
          longitude: coords.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Check-out failed");
        return;
      }
      setCheckedIn(false);
      setSuccess(`Checked out. ${data.durationMinutes ?? 0} min on site.`);
      setCurrentSite(null);
      setCheckInTime(null);
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const timeSince = (dateStr: string) => {
    const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  // ── EXECUTIVE VIEW: who's on site ──────────────────────────────────────
  if (isExecutive) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-5 space-y-5 pb-28">
        <div className="flex items-center gap-2 ml-1">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-heading">GPS — On Site Now</h2>
          <span className="ml-auto text-[10px] font-black bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full">{activeWorkers.length}</span>
        </div>

        {activeWorkers.length === 0 ? (
          <div className="premium-card rounded-2xl p-8 text-center">
            <Users className="w-10 h-10 text-white/15 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">No workers on site</p>
            <p className="text-xs text-muted-foreground mt-1">Workers check in when they arrive at a geofenced site</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {activeWorkers.map(w => (
              <div key={w.id} className={cn("premium-card rounded-2xl p-4 flex items-center gap-3", w.is_anomaly && "border-red-500/30")}>
                <div className={cn("w-3 h-3 rounded-full animate-pulse", w.is_anomaly ? "bg-red-500" : "bg-emerald-500")} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">{w.worker_name}</div>
                  <div className="text-xs text-muted-foreground">{w.site_name} · {timeSince(w.check_in_at)}</div>
                </div>
                <Clock className="w-4 h-4 text-white/20" />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  // ── WORKER VIEW: check-in / check-out ──────────────────────────────────
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="px-4 py-5 space-y-5 pb-28">
      <div className="flex items-center gap-2 ml-1">
        <MapPin className="w-4 h-4 text-cyan-400" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground font-heading">GPS Check-In</h2>
      </div>

      {/* GPS Status */}
      <div className={cn("premium-card rounded-2xl p-4 flex items-center gap-3",
        gpsStatus === "acquired" ? "border-emerald-500/20" : gpsStatus === "denied" ? "border-red-500/20" : ""
      )}>
        <Navigation className={cn("w-5 h-5",
          gpsStatus === "acquired" ? "text-emerald-400" : gpsStatus === "denied" ? "text-red-400" : "text-white/30 animate-pulse"
        )} />
        <div className="flex-1">
          <div className="text-sm font-semibold text-foreground">
            {gpsStatus === "acquired" ? "GPS Active" : gpsStatus === "denied" ? "GPS Unavailable" : "Acquiring GPS..."}
          </div>
          {coords && (
            <div className="text-[10px] text-muted-foreground font-mono">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</div>
          )}
        </div>
        {gpsStatus === "denied" && (
          <button onClick={acquireGps} className="text-xs text-cyan-400 font-bold">Retry</button>
        )}
      </div>

      {/* Current status card */}
      {checkedIn && currentSite && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="premium-card rounded-2xl p-5 border-emerald-500/20 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-emerald-400 font-heading">On Site</div>
          <div className="text-sm text-foreground font-semibold mt-1">{currentSite}</div>
          <div className="text-xs text-muted-foreground mt-1">Since {checkInTime}</div>
        </motion.div>
      )}

      {/* Big action button */}
      <button
        onClick={checkedIn ? handleCheckOut : handleCheckIn}
        disabled={loading || gpsStatus !== "acquired"}
        className={cn(
          "w-full py-5 rounded-2xl text-lg font-black font-heading tracking-wide transition-all active:scale-95 flex items-center justify-center gap-3",
          loading || gpsStatus !== "acquired"
            ? "bg-white/[0.06] text-white/20 cursor-not-allowed"
            : checkedIn
              ? "bg-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-500"
              : "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
        )}
      >
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : checkedIn ? (
          <><LogOut className="w-6 h-6" /> CHECK OUT</>
        ) : (
          <><LogIn className="w-6 h-6" /> CHECK IN</>
        )}
      </button>

      {/* Error / Success messages */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400 font-medium">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
