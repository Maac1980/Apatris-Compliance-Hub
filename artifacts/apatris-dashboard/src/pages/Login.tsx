import React, { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useTranslation } from "react-i18next";
import { KeyRound, Loader2, RotateCcw, Shield } from "lucide-react";

export default function Login() {
  const { login, verifyOtp } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  // Screen: "login" | "otp"
  const [screen, setScreen] = useState<"login" | "otp">("login");
  const [otpSession, setOtpSession] = useState("");
  const [otpEmail, setOtpEmail] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP: 6 individual digit inputs
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || t("login.invalidCredentials"));
      return;
    }
    if (result.otpRequired && result.session) {
      setOtpSession(result.session);
      setOtpEmail(email);
      setScreen("otp");
      return;
    }
    setLocation("/");
  };

  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = digit;
    setOtp(next);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      otpRefs.current[5]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) { setError("Please enter all 6 digits."); return; }
    setError("");
    setLoading(true);
    const result = await verifyOtp(otpSession, code);
    setLoading(false);
    if (!result.ok) {
      setError(result.error || "Invalid code");
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      return;
    }
    setLocation("/");
  };

  const brandPanel = (
    <div className="hidden lg:flex flex-1 relative overflow-hidden">
      <img
        src={`${import.meta.env.BASE_URL}images/brand-bg.png`}
        alt="Apatris Brand"
        className="w-full h-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-background" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-background/20" />
      <div className="absolute bottom-10 left-10 right-16">
        <p className="text-white/30 font-mono text-xs tracking-widest uppercase">
          APATRIS · SPECIALIST WELDING · EST. WARSAW
        </p>
      </div>
    </div>
  );

  const brandHeader = (
    <div className="text-center mb-8">
      <div className="w-14 h-1 bg-red-600 mx-auto mb-6 rounded-full" />
      <h1 className="text-4xl font-bold text-white tracking-[0.2em] uppercase leading-none">APATRIS</h1>
      <p className="text-gray-400 text-sm tracking-wider uppercase mt-3 leading-snug">
        Precision Welding Outsourcing.&nbsp;Your vision, expertly welded.
      </p>
    </div>
  );

  // ── OTP Screen ──────────────────────────────────────────────────────────────
  if (screen === "otp") {
    return (
      <div className="h-screen w-full flex bg-background overflow-hidden">
        {brandPanel}
        <div className="w-full lg:w-[460px] flex flex-col justify-center items-center h-full overflow-y-auto relative bg-background border-l border-white/5 px-8 py-10">
          <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
          <div className="relative z-10 w-full max-w-sm">
            {brandHeader}
            <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6 text-red-400" />
                </div>
                <h2 className="text-white font-bold text-base tracking-widest uppercase">Two-Factor Verification</h2>
                <p className="text-gray-400 text-xs mt-2 leading-relaxed">
                  A 6-digit code was sent to<br />
                  <span className="text-gray-200 font-mono">{otpEmail}</span>
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 tracking-widest uppercase mb-3 text-center">
                    Enter Verification Code
                  </label>
                  <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => { otpRefs.current[idx] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        disabled={loading}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className="w-11 h-14 text-center text-xl font-bold font-mono bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all disabled:opacity-50 caret-transparent"
                      />
                    ))}
                  </div>
                  <p className="text-center text-xs text-gray-600 font-mono mt-3">Code expires in 5 minutes</p>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.join("").length < 6}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900/60 disabled:cursor-not-allowed transition-colors rounded-lg px-4 py-3 text-white font-bold uppercase tracking-widest text-sm shadow-lg shadow-red-900/30"
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Verifying...</span></> : <><Shield className="w-4 h-4" /><span>Verify & Sign In</span></>}
                </button>
              </form>
            </div>

            <button
              onClick={() => { setScreen("login"); setError(""); setOtp(["", "", "", "", "", ""]); }}
              className="mt-4 w-full flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 text-xs font-mono transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Login Screen ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {brandPanel}
      <div className="w-full lg:w-[460px] flex flex-col justify-center items-center h-full overflow-y-auto relative bg-background border-l border-white/5 px-8 py-10">
        <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative z-10 w-full max-w-sm">
          {brandHeader}
          <div className="flex items-center gap-3 mb-8">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/10" />
            <span className="text-gray-500 font-mono text-xs tracking-widest uppercase">{t("login.terminal")}</span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/10" />
          </div>

          <div className="bg-gray-900/80 border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-300 tracking-widest uppercase">{t("login.operatorId")}</label>
                <input
                  type="email" required disabled={loading}
                  className="w-full bg-gray-800 border border-gray-500 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-gray-500 disabled:opacity-50"
                  placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-300 tracking-widest uppercase">{t("login.passcode")}</label>
                <input
                  type="password" required disabled={loading}
                  className="w-full bg-gray-800 border border-gray-500 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-gray-500 disabled:opacity-50"
                  placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-900/60 disabled:cursor-not-allowed transition-colors rounded-lg px-4 py-3 text-white font-bold uppercase tracking-widest text-sm mt-2 shadow-lg shadow-red-900/30"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Verifying...</span></> : <><Shield className="w-4 h-4" /><span>{t("login.submit")}</span></>}
              </button>
            </form>
          </div>

          <p className="text-center text-xs font-mono text-gray-600 mt-5">{t("login.unauthorized")}</p>
        </div>
      </div>
    </div>
  );
}
