import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { User, FileText, Calendar, DollarSign, Clock, Send, CheckCircle2, Stamp, Shield } from "lucide-react";
import { authHeaders, BASE } from "@/lib/api";
import { WorkerLegalStatus } from "@/components/WorkerLegalStatus";


export default function SelfService() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"status" | "profile" | "docs" | "leave" | "payslips">("status");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [leaveForm, setLeaveForm] = useState<Record<string, string>>({});

  const { data: profile } = useQuery({
    queryKey: ["self-profile"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/self-service/profile`, { headers: authHeaders() });
      if (!res.ok) return null;
      return (await res.json()).profile;
    },
  });

  const { data: docsData } = useQuery({
    queryKey: ["self-docs"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/self-service/documents`, { headers: authHeaders() });
      if (!res.ok) return { contracts: [], permits: [], workflows: [] };
      return res.json();
    },
    enabled: tab === "docs",
  });

  const { data: leavesData } = useQuery({
    queryKey: ["self-leaves"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/self-service/leave`, { headers: authHeaders() });
      if (!res.ok) return { leaves: [] };
      return res.json();
    },
    enabled: tab === "leave",
  });

  const { data: payslipsData } = useQuery({
    queryKey: ["self-payslips"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/self-service/payslips`, { headers: authHeaders() });
      if (!res.ok) return { payslips: [] };
      return res.json();
    },
    enabled: tab === "payslips",
  });

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/self-service/profile`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ description: "Profile updated" }); queryClient.invalidateQueries({ queryKey: ["self-profile"] }); setEditMode(false); },
  });

  const leaveMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await fetch(`${import.meta.env.BASE_URL}api/self-service/leave`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast({ description: "Leave request submitted" }); queryClient.invalidateQueries({ queryKey: ["self-leaves"] }); setLeaveForm({}); },
    onError: (err) => { toast({ description: err instanceof Error ? err.message : "Failed", variant: "destructive" }); },
  });

  const TABS = [
    { id: "status" as const, label: "My Status", icon: Shield },
    { id: "profile" as const, label: "Profile", icon: User },
    { id: "docs" as const, label: "Documents", icon: FileText },
    { id: "leave" as const, label: "Leave", icon: Calendar },
    { id: "payslips" as const, label: "Payslips", icon: DollarSign },
  ];

  return (
    <div className="p-6 min-h-screen overflow-y-auto pb-20 bg-background">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <User className="w-7 h-7 text-[#C41E18]" />
          <h1 className="text-3xl font-bold text-white">Worker Self-Service</h1>
        </div>
        <p className="text-gray-400">View and manage your own data, documents, and requests</p>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${tab === t.id ? "bg-[#C41E18] text-white shadow" : "text-slate-400 hover:text-white"}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === "status" && <WorkerLegalStatus />}

      {tab === "profile" && profile && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">My Profile</h3>
            <button onClick={() => { setEditMode(!editMode); setEditForm({ phone: profile.phone || "", email: profile.email || "", iban: profile.iban || "" }); }}
              className="text-xs text-[#C41E18] font-bold">{editMode ? "Cancel" : "Edit"}</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              { label: "Name", value: profile.full_name },
              { label: "Specialization", value: profile.specialization },
              { label: "Site", value: profile.assigned_site },
              { label: "PESEL", value: profile.pesel },
              { label: "Rate", value: profile.hourly_rate ? `${profile.hourly_rate} PLN/h` : "—" },
              { label: "Hours", value: profile.monthly_hours ? `${profile.monthly_hours}h` : "—" },
            ].map(f => (
              <div key={f.label}><p className="text-slate-500 text-xs">{f.label}</p><p className="text-white font-medium">{f.value || "—"}</p></div>
            ))}
            {editMode ? (
              <>
                {["phone", "email", "iban"].map(f => (
                  <div key={f}><p className="text-slate-500 text-xs mb-1">{f.charAt(0).toUpperCase() + f.slice(1)}</p>
                    <input value={editForm[f] || ""} onChange={e => setEditForm({ ...editForm, [f]: e.target.value })}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
                  </div>
                ))}
                <div className="col-span-full mt-2">
                  <button onClick={() => updateMutation.mutate(editForm)} className="px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold">Save</button>
                </div>
              </>
            ) : (
              <>
                <div><p className="text-slate-500 text-xs">Phone</p><p className="text-white font-medium">{profile.phone || "—"}</p></div>
                <div><p className="text-slate-500 text-xs">Email</p><p className="text-white font-medium">{profile.email || "—"}</p></div>
                <div><p className="text-slate-500 text-xs">IBAN</p><p className="text-white font-medium font-mono">{profile.iban || "—"}</p></div>
              </>
            )}
          </div>
          {/* Document expiry dates */}
          <h3 className="text-sm font-bold text-white mt-6 mb-3">Document Expiry Dates</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {[
              { label: "TRC", date: profile.trc_expiry },
              { label: "Passport", date: profile.passport_expiry },
              { label: "BHP", date: profile.bhp_expiry },
              { label: "Work Permit", date: profile.work_permit_expiry },
              { label: "Contract", date: profile.contract_end_date },
              { label: "Medical", date: profile.medical_exam_expiry },
            ].map(d => {
              const days = d.date ? Math.ceil((new Date(d.date).getTime() - Date.now()) / 86_400_000) : null;
              const color = days === null ? "text-slate-500" : days < 0 ? "text-red-400" : days < 30 ? "text-red-400" : days < 60 ? "text-amber-400" : "text-emerald-400";
              return (
                <div key={d.label} className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-500">{d.label}</p>
                  <p className={`font-mono font-bold ${color}`}>{d.date ? new Date(d.date).toLocaleDateString("en-GB") : "—"}</p>
                  {days !== null && <p className={`text-[10px] ${color}`}>{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "docs" && (
        <div className="space-y-4">
          {[
            { title: "Contracts", items: docsData?.contracts ?? [], fields: ["contract_type", "status"] },
            { title: "Permits", items: docsData?.permits ?? [], fields: ["permit_type", "country", "status"] },
            { title: "Documents", items: docsData?.workflows ?? [], fields: ["document_type", "status"] },
          ].map(section => (
            <div key={section.title}>
              <h3 className="text-sm font-bold text-white mb-2">{section.title} ({section.items.length})</h3>
              {section.items.length === 0 ? <p className="text-slate-500 text-xs">None</p> : (
                <div className="space-y-1">
                  {section.items.map((item: any) => (
                    <div key={item.id} className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
                      <div className="text-xs">
                        {section.fields.map(f => <span key={f} className="text-white mr-3">{item[f] || "—"}</span>)}
                      </div>
                      <span className={`text-[10px] font-bold ${item.status === "signed" || item.status === "active" ? "text-emerald-400" : "text-slate-400"}`}>{item.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "leave" && (
        <div>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-white mb-3">Submit Leave Request</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select value={leaveForm.leaveType || "annual"} onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]">
                <option value="annual">Annual Leave</option><option value="sick">Sick Leave</option><option value="unpaid">Unpaid Leave</option><option value="other">Other</option>
              </select>
              <input placeholder="Reason" value={leaveForm.reason || ""} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input type="date" value={leaveForm.startDate || ""} onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
              <input type="date" value={leaveForm.endDate || ""} onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C41E18]" />
            </div>
            <button onClick={() => leaveMutation.mutate(leaveForm)} disabled={!leaveForm.startDate || !leaveForm.endDate}
              className="px-4 py-2 bg-[#C41E18] text-white rounded-lg text-sm font-bold disabled:opacity-50">Submit</button>
          </div>
          <h3 className="text-sm font-bold text-white mb-2">My Leave Requests</h3>
          <div className="space-y-2">
            {(leavesData?.leaves ?? []).map((l: any) => (
              <div key={l.id} className={`rounded-xl border p-3 ${l.status === "approved" ? "bg-emerald-500/10 border-emerald-500/20" : l.status === "rejected" ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white">{l.leave_type} · {l.days}d</p>
                  <span className={`text-[10px] font-bold uppercase ${l.status === "approved" ? "text-emerald-400" : l.status === "rejected" ? "text-red-400" : "text-amber-400"}`}>{l.status}</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">{new Date(l.start_date).toLocaleDateString("en-GB")} — {new Date(l.end_date).toLocaleDateString("en-GB")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "payslips" && (
        <div className="space-y-2">
          {(payslipsData?.payslips ?? []).length === 0 ? <p className="text-slate-500 text-center py-12">No payslips available</p> : (
            (payslipsData?.payslips ?? []).map((p: any) => (
              <div key={p.id || p.month_year} className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
                <div><p className="text-sm font-bold text-white">{p.month_year}</p><p className="text-xs text-slate-400">{p.worker_name}</p></div>
                <p className="text-emerald-400 font-bold font-mono">{Number(p.final_netto_payout || p.net_pay || 0).toLocaleString("pl")} PLN</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
