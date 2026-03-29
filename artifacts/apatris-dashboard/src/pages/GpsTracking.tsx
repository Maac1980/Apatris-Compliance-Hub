import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Clock, AlertTriangle, Users, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API = "/api";
function authHeaders() {
  const token = localStorage.getItem("apatris_jwt");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

interface ActiveCheckin {
  id: string; worker_name: string; site_name: string;
  check_in_at: string; is_anomaly: boolean; anomaly_reason: string | null;
}

interface Geofence {
  id: string; site_name: string; latitude: number; longitude: number;
  radius_meters: number; address: string | null; is_active: boolean;
}

export default function GpsTracking() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [active, setActive] = useState<ActiveCheckin[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "sites" | "anomalies">("active");
  const [wsConnected, setWsConnected] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/gps/active`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/geofences`, { headers: authHeaders() }).then(r => r.json()),
      fetch(`${API}/gps/anomalies`, { headers: authHeaders() }).then(r => r.json()),
    ]).then(([a, g, an]) => {
      setActive(a.active ?? []);
      setGeofences(g.geofences ?? []);
      setAnomalies(an.anomalies ?? []);
    }).catch(() => {
      setActive([]);
      setGeofences([]);
      setAnomalies([]);
      toast({ title: "Error", description: "Failed to load GPS data", variant: "destructive" });
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // WebSocket for live GPS updates
  useEffect(() => {
    const token = localStorage.getItem("apatris_jwt");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        ws?.send(JSON.stringify({ type: "subscribe", channel: "gps" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.channel === "gps" && msg.data) {
            // Auto-refresh active workers on any GPS event
            load();
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Reconnect after 5 seconds
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      ws?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  const timeSince = (dateStr: string) => {
    const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MapPin className="w-6 h-6 text-red-500" /> {t("gpsTracking.title")}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{t("gpsTracking.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {wsConnected && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-900/40 text-emerald-400 text-[10px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          )}
          <button onClick={load} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center">
          <div className="text-3xl font-black text-emerald-400">{active.length}</div>
          <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">{t("gpsTracking.onSiteNow")}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center">
          <div className="text-3xl font-black text-blue-400">{geofences.filter(g => g.is_active).length}</div>
          <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">{t("gpsTracking.activeSites")}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 text-center">
          <div className="text-3xl font-black text-red-400">{anomalies.length}</div>
          <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">{t("gpsTracking.anomalies")}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["active", "sites", "anomalies"] as const).map(tb => (
          <button key={tb} onClick={() => setTab(tb)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === tb ? "bg-red-900/40 text-red-400" : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>
            {tb === "active" ? `${t("gpsTracking.onSiteTab")} (${active.length})` : tb === "sites" ? `${t("gpsTracking.geofencesTab")} (${geofences.length})` : `${t("gpsTracking.anomaliesTab")} (${anomalies.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : tab === "active" ? (
        <div className="space-y-3">
          {active.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t("gpsTracking.noWorkers")}</p>
            </div>
          ) : active.map(c => (
            <div key={c.id} className={`bg-slate-800/50 rounded-xl p-4 border ${c.is_anomaly ? "border-red-500/30" : "border-slate-700/50"} flex items-center gap-3`}>
              <div className={`w-3 h-3 rounded-full ${c.is_anomaly ? "bg-red-500" : "bg-emerald-500"} animate-pulse`} />
              <div className="flex-1">
                <span className="text-sm font-bold text-white">{c.worker_name}</span>
                <div className="text-xs text-slate-400">{c.site_name} · {t("gpsTracking.onSiteFor")} {timeSince(c.check_in_at)}</div>
                {c.is_anomaly && <div className="text-xs text-red-400 mt-0.5">{t("gpsTracking.warning")}: {c.anomaly_reason}</div>}
              </div>
              <Clock className="w-4 h-4 text-slate-500" />
            </div>
          ))}
        </div>
      ) : tab === "sites" ? (
        <div className="space-y-3">
          {geofences.map(g => (
            <div key={g.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 flex items-center gap-3">
              <MapPin className={`w-5 h-5 ${g.is_active ? "text-blue-400" : "text-slate-600"}`} />
              <div className="flex-1">
                <span className="text-sm font-bold text-white">{g.site_name}</span>
                <div className="text-xs text-slate-400">
                  {g.address ?? `${g.latitude.toFixed(4)}, ${g.longitude.toFixed(4)}`} · {t("gpsTracking.radius")} {g.radius_meters}m
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${g.is_active ? "bg-emerald-900/50 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                {g.is_active ? t("gpsTracking.active") : t("gpsTracking.inactive")}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.length === 0 ? (
            <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700/50">
              <AlertTriangle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t("gpsTracking.noAnomalies")}</p>
            </div>
          ) : anomalies.map((a: any) => (
            <div key={a.id} className="bg-slate-800/50 rounded-xl p-4 border border-red-500/20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-bold text-white">{a.worker_name}</span>
                <span className="text-xs text-slate-500 ml-auto">{new Date(a.created_at).toLocaleDateString("en-GB")}</span>
              </div>
              <div className="text-xs text-red-400/80 mt-1">{a.anomaly_reason}</div>
              <div className="text-xs text-slate-500 mt-0.5">{a.site_name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
