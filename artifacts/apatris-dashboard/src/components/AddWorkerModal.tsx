import React, { useState } from "react";
import { X, UserPlus, Loader2, Landmark } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWorkersQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const SPEC_OPTIONS = ["TIG", "MIG", "MAG", "MMA", "ARC / Electrode", "FCAW", "FABRICATOR"];
const ZUS_OPTIONS = ["Registered", "Unregistered", "Unknown"];
const VISA_TYPES = [
  "Karta Pobytu - Czasowy", "Karta Pobytu - Stały", "Karta Pobytu - UE LT",
  "Wiza D", "Wiza C", "EU Citizen", "Other",
];

const inputCls =
  "w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-red-500/60 placeholder:text-gray-600 transition-colors";
const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 border-b border-white/10 pb-2 mb-3 mt-5 first:mt-0">
      {children}
    </p>
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (workerId: string) => void;
}

export function AddWorkerModal({ isOpen, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Required
  const [name, setName] = useState("");
  // Core
  const [specialization, setSpecialization] = useState("");
  const [assignedSite, setAssignedSite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // Expiries
  const [trcExpiry, setTrcExpiry] = useState("");
  const [passportExpiry, setPassportExpiry] = useState("");
  const [bhpExpiry, setBhpExpiry] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [workPermitExpiry, setWorkPermitExpiry] = useState("");
  const [medicalExamExpiry, setMedicalExamExpiry] = useState("");
  const [oswiadczenieExpiry, setOswiadczenieExpiry] = useState("");
  const [udtCertExpiry, setUdtCertExpiry] = useState("");
  // Identity
  const [pesel, setPesel] = useState("");
  const [nip, setNip] = useState("");
  const [visaType, setVisaType] = useState("");
  const [zusStatus, setZusStatus] = useState("");
  // Bank
  const [iban, setIban] = useState("");

  const reset = () => {
    setName(""); setSpecialization(""); setAssignedSite(""); setEmail(""); setPhone("");
    setTrcExpiry(""); setPassportExpiry(""); setBhpExpiry(""); setContractEndDate("");
    setWorkPermitExpiry(""); setMedicalExamExpiry(""); setOswiadczenieExpiry(""); setUdtCertExpiry("");
    setPesel(""); setNip(""); setVisaType(""); setZusStatus(""); setIban("");
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { name: name.trim() };
      if (specialization) body.specialization = specialization;
      if (assignedSite.trim()) body.assignedSite = assignedSite.trim();
      if (email.trim()) body.email = email.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (trcExpiry) body.trcExpiry = trcExpiry;
      if (passportExpiry) body.passportExpiry = passportExpiry;
      if (bhpExpiry) body.bhpExpiry = bhpExpiry;
      if (contractEndDate) body.contractEndDate = contractEndDate;
      if (workPermitExpiry) body.workPermitExpiry = workPermitExpiry;
      if (medicalExamExpiry) body.medicalExamExpiry = medicalExamExpiry;
      if (oswiadczenieExpiry) body.oswiadczenieExpiry = oswiadczenieExpiry;
      if (udtCertExpiry) body.udtCertExpiry = udtCertExpiry;
      if (pesel.trim()) body.pesel = pesel.trim();
      if (nip.trim()) body.nip = nip.trim();
      if (visaType) body.visaType = visaType;
      if (zusStatus) body.zusStatus = zusStatus;
      if (iban.trim()) body.iban = iban.trim().toUpperCase().replace(/\s/g, "");

      const res = await fetch(`${import.meta.env.BASE_URL}api/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create worker" }));
        throw new Error(err.error ?? "Failed to create worker");
      }
      const worker = await res.json();
      await queryClient.invalidateQueries({ queryKey: getGetWorkersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: ["workers-sites"] });
      toast({
        title: "Worker Created",
        description: `${worker.name} has been added to the system.`,
        className: "border-green-500/50 bg-slate-900 text-white [&>div]:text-green-400",
      });
      reset();
      onClose();
      if (onCreated) onCreated(worker.id);
    } catch (err) {
      toast({
        title: "Creation Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 0 0 1px rgba(196,30,24,0.2), 0 25px 60px rgba(0,0,0,0.7)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Add New Worker</h2>
              <p className="text-xs text-gray-500 font-mono">Creates a record directly in Airtable</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-0">

            <SectionTitle>Identity (required)</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Full Name *">
                  <input
                    type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Jan Kowalski" required
                    className={`${inputCls} ${!name.trim() ? "border-red-500/40" : ""}`}
                  />
                </Field>
              </div>
              <Field label="Specialization">
                <select value={specialization} onChange={(e) => setSpecialization(e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {SPEC_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Client / Site">
                <input type="text" value={assignedSite} onChange={(e) => setAssignedSite(e.target.value)} placeholder="e.g. Gdańsk Shipyard" className={inputCls} />
              </Field>
              <Field label="Email">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@example.com" className={inputCls} />
              </Field>
              <Field label="Phone">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 000 000 000" className={inputCls} />
              </Field>
            </div>

            <SectionTitle>Document Expiry Dates</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="TRC Expiry">
                <input type="date" value={trcExpiry} onChange={(e) => setTrcExpiry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Passport Expiry">
                <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="BHP Certificate Expiry">
                <input type="date" value={bhpExpiry} onChange={(e) => setBhpExpiry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Contract End Date">
                <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Work Permit Expiry">
                <input type="date" value={workPermitExpiry} onChange={(e) => setWorkPermitExpiry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Medical Exam (Badania) Expiry">
                <input type="date" value={medicalExamExpiry} onChange={(e) => setMedicalExamExpiry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Oświadczenie Expiry">
                <input type="date" value={oswiadczenieExpiry} onChange={(e) => setOswiadczenieExpiry(e.target.value)} className={inputCls} />
              </Field>
              <Field label="UDT Certificate Expiry">
                <input type="date" value={udtCertExpiry} onChange={(e) => setUdtCertExpiry(e.target.value)} className={inputCls} />
              </Field>
            </div>

            <SectionTitle>Legal Status</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="PESEL">
                <input type="text" value={pesel} onChange={(e) => setPesel(e.target.value)} placeholder="00000000000" maxLength={11} className={inputCls} />
              </Field>
              <Field label="NIP">
                <input type="text" value={nip} onChange={(e) => setNip(e.target.value)} placeholder="000-000-00-00" className={inputCls} />
              </Field>
              <Field label="ZUS Status">
                <select value={zusStatus} onChange={(e) => setZusStatus(e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {ZUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Visa / Permit Type">
                <select value={visaType} onChange={(e) => setVisaType(e.target.value)} className={inputCls}>
                  <option value="">— Select —</option>
                  {VISA_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>

            <SectionTitle>Bank Details</SectionTitle>
            <div className="grid grid-cols-1 gap-3">
              <Field label="IBAN (Bank Account Number)">
                <div className="relative">
                  <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
                    placeholder="e.g. PL61109010140000071219812874"
                    className={`${inputCls} pl-9`}
                    maxLength={34}
                  />
                </div>
                <p className="text-[10px] text-gray-600 font-mono mt-1.5">Used for automatic bank transfer CSV generation. Spaces are auto-removed.</p>
              </Field>
            </div>

            <div className="pt-2 pb-1">
              <p className="text-xs text-gray-600 font-mono text-center">
                Documents & payroll can be added after creation via the worker profile panel
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-white/10 flex-shrink-0">
            <button
              type="button" onClick={handleClose}
              className="flex-1 py-2.5 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl text-sm font-bold uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving || !name.trim()}
              className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(196,30,24,0.35)]"
            >
              {saving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Worker</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
