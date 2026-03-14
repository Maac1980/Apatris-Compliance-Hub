import React, { useRef, useState } from "react";
import { Shield, Upload, CheckCircle2, AlertCircle, Loader2, X, FileText, Award, User } from "lucide-react";

interface UploadedFile {
  file: File;
  name: string;
}

interface FieldFile {
  passport: UploadedFile | null;
  trc: UploadedFile | null;
  cv: UploadedFile | null;
}

const BASE_URL = import.meta.env.BASE_URL ?? "/";

function FileDropZone({
  label,
  hint,
  icon: Icon,
  color,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  icon: React.ElementType;
  color: string;
  value: UploadedFile | null;
  onChange: (f: UploadedFile | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const colorMap: Record<string, string> = {
    blue: "border-blue-500/40 bg-blue-500/10 hover:border-blue-400/60 text-blue-400",
    green: "border-green-500/40 bg-green-500/10 hover:border-green-400/60 text-green-400",
    violet: "border-violet-500/40 bg-violet-500/10 hover:border-violet-400/60 text-violet-400",
  };

  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">{label}</label>
      <div
        className={`relative border-2 border-dashed rounded-xl p-4 cursor-pointer transition-all ${
          dragging ? "scale-[1.01]" : ""
        } ${value ? "border-green-500/50 bg-green-500/5" : colorMap[color]}`}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) onChange({ file: f, name: f.name });
        }}
      >
        <input
          ref={ref}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange({ file: f, name: f.name });
          }}
        />
        {value ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-green-300 text-sm font-mono truncate">{value.name}</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Drop file or click to browse</p>
              <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
            </div>
            <Upload className="w-4 h-4 ml-auto flex-shrink-0 opacity-50" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Apply() {
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [files, setFiles] = useState<FieldFile>({ passport: null, trc: null, cv: null });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const setFile = (key: keyof FieldFile) => (val: UploadedFile | null) =>
    setFiles((prev) => ({ ...prev, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setMessage("Name is required."); return; }

    setStatus("loading");
    setMessage("");

    const fd = new FormData();
    fd.append("name", form.name.trim());
    if (form.email.trim()) fd.append("email", form.email.trim());
    if (form.phone.trim()) fd.append("phone", form.phone.trim());
    if (files.passport) fd.append("passport", files.passport.file);
    if (files.trc) fd.append("trc", files.trc.file);
    if (files.cv) fd.append("cv", files.cv.file);

    try {
      const res = await fetch(`${BASE_URL}api/workers/apply`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      setStatus("success");
      setMessage("Your application has been submitted. We will be in touch.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-wide">Application Received</h2>
            <p className="text-gray-400 mt-2">{message}</p>
          </div>
          <button
            onClick={() => { setStatus("idle"); setForm({ name: "", email: "", phone: "" }); setFiles({ passport: null, trc: null, cv: null }); }}
            className="px-6 py-2.5 border border-white/10 text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
          >
            Submit Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent" />

      <div className="relative z-10 max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white mb-5" style={{ boxShadow: "0 0 0 2px rgba(196,30,24,0.4), 0 0 20px rgba(196,30,24,0.2)" }}>
            <svg width="42" height="42" viewBox="0 0 38 38" fill="none">
              <path d="M19 2 L33 8.5 L33 21 Q33 30 19 36 Q5 30 5 21 L5 8.5 Z" fill="#fef2f2" stroke="#C41E18" strokeWidth="1.5" strokeLinejoin="round" />
              <text x="19" y="28" textAnchor="middle" fontSize="19" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" fill="#C41E18" letterSpacing="-0.5">A</text>
            </svg>
          </div>
          <div className="w-12 h-0.5 bg-red-600 mx-auto mb-4 rounded-full" />
          <h1 className="text-3xl font-bold tracking-[0.15em] uppercase">APATRIS</h1>
          <p className="text-gray-400 text-sm tracking-wider mt-2">Welder Application Portal</p>
          <p className="text-gray-600 text-xs font-mono mt-1 tracking-widest uppercase">Specialist Welding · Warsaw</p>
        </div>

        {/* Form card */}
        <div className="bg-slate-800/60 border border-white/10 rounded-2xl p-6 md:p-8 shadow-2xl backdrop-blur-sm space-y-6">
          <div>
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-red-500" /> Personal Details
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Your full name"
                  className="w-full bg-slate-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-all placeholder:text-gray-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="email@example.com"
                    className="w-full bg-slate-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-all placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="+48 000 000 000"
                    className="w-full bg-slate-900 border border-gray-600 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-all placeholder:text-gray-600"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/5" />

          <div>
            <h2 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-500" /> Documents
            </h2>
            <div className="space-y-3">
              <FileDropZone
                label="Passport"
                hint="AI will extract name & expiry date"
                icon={FileText}
                color="blue"
                value={files.passport}
                onChange={setFile("passport")}
              />
              <FileDropZone
                label="TRC Certificate"
                hint="AI will extract TRC expiry & specialization"
                icon={Award}
                color="green"
                value={files.trc}
                onChange={setFile("trc")}
              />
              <FileDropZone
                label="CV / Experience"
                hint="AI will extract experience & qualifications"
                icon={FileText}
                color="violet"
                value={files.cv}
                onChange={setFile("cv")}
              />
            </div>
          </div>

          {message && status === "error" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {message}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={status === "loading"}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors rounded-xl px-4 py-3.5 text-white font-bold uppercase tracking-widest text-sm shadow-lg shadow-red-900/30"
          >
            {status === "loading" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
            ) : (
              <><Shield className="w-4 h-4" /> Submit Application</>
            )}
          </button>
        </div>

        <p className="text-center text-xs font-mono text-gray-600 mt-6 tracking-wider">
          APATRIS SPECIALIST WELDING · WARSAW · CONFIDENTIAL
        </p>
      </div>
    </div>
  );
}
