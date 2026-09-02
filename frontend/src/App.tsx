import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ArrowLeft, Bot, CalendarDays, ChevronDown, ChevronRight, ChevronUp, Globe2, History, Home, Mail, Phone, Radar, Shield, Sparkles, UserRound } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import BotControl from "@/pages/BotControl";
import TradeHistory from "@/pages/TradeHistory";
import PositionMonitor from "@/pages/PositionMonitor";
import HistoricalTesting from "@/pages/HistoricalTesting";
import RealMoneyTrade from "@/pages/RealMoneyTrade";
import ApiKeysDialog from "@/components/bot/ApiKeysDialog";

function RabbitIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M19 17c-3 0-5 2-5 6 0 3 1 5 2 7l-5 1c-4 1-5 5-3 8l3 5c2 3 5 5 9 5h6l2-5-4-10 8-4 14 2 5 8 4 5h9c4 0 7-3 7-7 0-2-1-4-3-5l-7-5-2-8c-1-4-4-7-8-8l-11-3-7 4-2-5c-1-2-3-4-6-4h-5z" fill="#2d1b52"/>
      <circle cx="27" cy="26" r="4" fill="#f6efe7"/>
      <circle cx="41" cy="26" r="4" fill="#f6efe7"/>
      <circle cx="28" cy="26" r="1.6" fill="#1f2937"/>
      <circle cx="40" cy="26" r="1.6" fill="#1f2937"/>
      <path d="M31 35c2 2 5 2 8 0" stroke="#1f2937" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M37 13l8-8m-18 0l-8 8" stroke="#2d1b52" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function RabbitArtwork() {
  return (
    <svg viewBox="0 0 700 720" role="img" aria-label="Vanta mascot illustration" style={{ width: "100%", height: "100%" }}>
      <path d="M120 550c70-140 120-194 197-216 76-22 148-16 193 8 116 60 164 169 200 265H120z" fill="#f2c0b5" opacity="0.22"/>
      <path d="M470 75c53 8 102 37 134 86 46 70 44 158 8 234-28 59-80 100-149 109-63 8-123-21-169-69-60-61-90-158-68-245 22-90 103-127 244-115z" fill="#2b1a53"/>
      <path d="M350 92c62-6 102 19 111 64 9 45-7 71-45 98-38 27-88 31-142 18-53-14-77-42-75-80 2-38 33-89 151-100z" fill="#2b1a53"/>
      <path d="M303 64c18-36 70-53 120-43 63 13 110 52 123 107 14 58-8 113-60 147-39 26-82 36-128 29-64-10-98-60-100-128-2-42 9-80 45-112z" fill="#2b1a53"/>
      <path d="M429 168c19-13 35-14 53 1 18 15 18 35 10 55-10 25-40 39-66 31-27-8-38-32-31-57 7-23 24-30 34-30z" fill="#f8efe9"/>
      <path d="M274 168c18-16 35-15 53-2 18 12 25 31 19 52-7 28-31 46-60 47-29 0-54-20-57-51-2-20 15-40 45-46z" fill="#f8efe9"/>
      <circle cx="353" cy="228" r="16" fill="#f8efe9"/>
      <circle cx="448" cy="228" r="16" fill="#f8efe9"/>
      <circle cx="354" cy="228" r="5" fill="#24163d"/>
      <circle cx="449" cy="228" r="5" fill="#24163d"/>
      <path d="M392 261c12 9 26 9 39 0" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M390 249c-15 21-39 29-60 28" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M443 250c19 15 41 23 66 19" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <ellipse cx="395" cy="322" rx="101" ry="92" fill="#2b1a53"/>
      <ellipse cx="400" cy="405" rx="113" ry="140" fill="#2b1a53"/>
      <path d="M309 383c-10 22-16 47-15 74 1 44 32 81 76 93 43 12 89-2 121-40 32-38 42-90 26-136-17-48-62-82-109-79-59 3-92 35-99 88z" fill="#2b1a53"/>
      <path d="M343 512c-54 39-101 97-94 164 9 87 119 144 216 135 72-7 149-61 174-129 26-70-10-143-84-182-59-31-147-17-212 12z" fill="#f3efe9"/>
      <path d="M371 549c18 16 37 27 61 30 28 4 52-6 72-25 21-19 28-44 31-75 2 33 5 69-16 99-25 35-61 52-102 52-49 0-91-31-101-77-8-35 6-69 26-97 16 25 20 53 29 93z" fill="#f3efe9"/>
      <circle cx="457" cy="571" r="42" fill="#f3efe9"/>
      <path d="M486 571c15 6 34 17 46 34" stroke="#2b1a53" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M357 595c-34 1-62 21-76 52" stroke="#2b1a53" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <path d="M433 594c19 88 91 155 170 175" stroke="#2b1a53" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <path d="M423 621c19 64 48 122 111 163" stroke="#2b1a53" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <path d="M232 229c-50 0-96 28-127 74-39 57-44 132-12 192 30 58 90 98 157 102 85 6 165-50 201-134 14-33 20-68 18-103-3-62-29-118-75-154-53-42-116-52-162-15z" fill="#2b1a53" opacity="0.92"/>
      <ellipse cx="310" cy="427" rx="110" ry="117" fill="#f3efe9"/>
      <path d="M278 418c-18 5-31 23-31 42 1 32 28 58 60 58 36 0 63-30 62-69-1-15-9-31-22-41-8-6-23-10-35-9-12 1-24 7-34 19z" fill="#f3efe9"/>
      <path d="M302 383c0-25 20-45 45-45s46 20 46 45v18c0 5-4 10-9 10h-74c-6 0-8-5-8-10v-18z" fill="#2b1a53"/>
      <path d="M293 430c25 8 48 8 76 0" stroke="#24163d" strokeWidth="6" strokeLinecap="round" fill="none"/>
      <circle cx="305" cy="462" r="4" fill="#24163d"/>
      <circle cx="369" cy="462" r="4" fill="#24163d"/>
      <path d="M286 480c17 16 38 25 57 24 18 0 38-7 55-24" stroke="#24163d" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <circle cx="409" cy="204" r="25" fill="#f3efe9"/>
      <circle cx="267" cy="204" r="25" fill="#f3efe9"/>
    </svg>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPassword }),
      });

      if (!res.ok) {
        throw new Error("Invalid email or password");
      }

      window.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        .login-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          background: #f5f4f2;
          color: #1f1b2e;
          font-family: "Inter", "Segoe UI", sans-serif;
        }

        .login-left {
          padding: 22px 0 0 32px;
          display: flex;
          flex-direction: column;
        }

        .login-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          font-size: 15px;
          margin-bottom: 32px;
        }

        .login-content {
          margin-left: 60px;
          max-width: 430px;
        }

        .login-card {
          background: rgba(255,255,255,0.62);
          border: 1px solid rgba(32, 24, 48, 0.14);
          border-radius: 16px;
          box-shadow: 0 12px 36px rgba(41, 24, 62, 0.08);
          padding: 18px 18px 16px;
          max-width: 400px;
        }

        .login-form {
          display: grid;
          gap: 14px;
        }

        .login-input {
          width: 100%;
          border: 1px solid rgba(33, 27, 49, 0.18);
          background: rgba(255,255,255,0.75);
          border-radius: 10px;
          padding: 14px 16px;
          font-size: 16px;
          color: #1f1b2e;
          outline: none;
          box-sizing: border-box;
        }

        .login-right {
          position: relative;
          overflow: hidden;
          background: #f36a5d;
        }

        .login-right::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(0,0,0,0.02));
        }

        .login-right::after {
          content: "";
          position: absolute;
          inset: 0 0 0 0;
          clip-path: polygon(18% 0%, 100% 0%, 100% 100%, 0% 100%);
          background: rgba(255,255,255,0.06);
        }

        .login-illustration-wrap {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .login-illustration {
          width: min(72vw, 620px);
          height: min(82vh, 620px);
        }

        @media (max-width: 768px) {
          .login-shell {
            grid-template-columns: 1fr;
          }

          .login-left {
            padding: 20px 16px 0;
          }

          .login-brand {
            margin-bottom: 28px;
            justify-content: center;
          }

          .login-content {
            margin-left: 0;
            max-width: none;
          }

          .login-card {
            max-width: none;
            padding: 18px 14px 16px;
          }

          .login-right {
            min-height: 260px;
            max-height: 300px;
          }

          .login-illustration-wrap {
            padding: 20px;
          }

          .login-illustration {
            width: min(82vw, 420px);
            height: min(36vh, 260px);
          }

          .login-form button {
            font-size: 16px;
          }
        }
      `}</style>

      <div className="login-shell">
        <div className="login-left">
          <div className="login-brand">
            <RabbitIcon />
            <span>Minnu Services</span>
          </div>

          <div className="login-content">
            <h1 style={{ margin: "0 0 28px", fontSize: "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1, letterSpacing: "-0.03em", fontWeight: 800 }}>
              Welcome back!
            </h1>

            <div className="login-card">
              <form onSubmit={handleSubmit} className="login-form">
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1c1830" }}>Sign in to Minnu Services</h2>

                <label style={{ display: "grid", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#2c2a3d", fontWeight: 600 }}>Enter your email address</span>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin"
                    autoFocus
                    className="login-input"
                  />
                </label>

                <label style={{ display: "grid", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#2c2a3d", fontWeight: 600 }}>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="login-input"
                  />
                </label>

                {error ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{error}</div> : null}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    marginTop: 6,
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 14px",
                    background: "linear-gradient(135deg, #7e4dd7, #5a3ab9)",
                    color: "white",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.8 : 1,
                    boxShadow: "0 10px 18px rgba(103, 81, 170, 0.25)",
                  }}
                >
                  {isSubmitting ? "Signing in..." : "Continue with email"}
                </button>
              </form>

              <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, color: "#433d58" }}>
                <span>Don’t have an account? <a href="#" style={{ color: "#2d1b52", textDecoration: "none", fontWeight: 700 }}>Contact us.</a></span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(36, 29, 50, 0.15)", borderRadius: 8, padding: "8px 12px", background: "rgba(255,255,255,0.52)" }}>
                  <Globe2 size={14} aria-hidden="true" />
                  <span style={{ fontSize: 12 }}>US</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-right">
          <div className="login-illustration-wrap">
            <div className="login-illustration">
              <RabbitArtwork />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

type ProfileInfo = {
  name: string;
  email: string;
  phone: string;
  age: string;
};

type AppTheme = "dark" | "light";

const PROFILE_STORAGE_KEY = "user-profile";
const THEME_STORAGE_KEY = "app-theme";
const TRADING_OVERVIEW_KEY = "trading-overview";

const getSavedProfile = (): ProfileInfo => {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return { name: "", email: "", phone: "", age: "" };
    }

    const parsed = JSON.parse(raw) as Partial<ProfileInfo>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      age: typeof parsed.age === "string" ? parsed.age : "",
    };
  } catch {
    return { name: "", email: "", phone: "", age: "" };
  }
};

const getSavedTheme = (): AppTheme => {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // ignore storage errors and fall back to dark mode
  }
  return "dark";
};

const getTradingOverview = () => {
  try {
    const raw = localStorage.getItem(TRADING_OVERVIEW_KEY);
    if (!raw) {
      return { trades: 0, wins: 0, winRate: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<{ trades: number; wins: number; winRate: number }>;
    return {
      trades: Number.isFinite(parsed.trades) ? Number(parsed.trades) : 0,
      wins: Number.isFinite(parsed.wins) ? Number(parsed.wins) : 0,
      winRate: Number.isFinite(parsed.winRate) ? Number(parsed.winRate) : 0,
    };
  } catch {
    return { trades: 0, wins: 0, winRate: 0 };
  }
};

function ProfilePage({ theme, setTheme }: { theme: AppTheme; setTheme: React.Dispatch<React.SetStateAction<AppTheme>> }) {
  const [profile, setProfile] = useState<ProfileInfo>(() => getSavedProfile());
  const [overview, setOverview] = useState(() => getTradingOverview());
  const [personalInfoOpen, setPersonalInfoOpen] = useState(false);
  const [tradingOverviewOpen, setTradingOverviewOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(true);

  const handleChange = (field: keyof ProfileInfo, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleSaveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = {
      name: profile.name.trim(),
      email: profile.email.trim(),
      phone: profile.phone.trim(),
      age: profile.age.trim(),
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      // ignore logout API errors and continue to route back to login
    }
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    localStorage.removeItem(TRADING_OVERVIEW_KEY);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    setProfile({ name: "", email: "", phone: "", age: "" });
    setTheme("dark");
    setOverview({ trades: 0, wins: 0, winRate: 0 });
    window.location.assign("/login");
  };

  const handleThemeToggle = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const displayName = profile.name.trim() || "User";
  const displayEmail = profile.email.trim() || "user@coindcx.com";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  const isDark = theme === "dark";
  const shellClasses = isDark ? "bg-[#0b1117] text-slate-100" : "bg-[#edf3f9] text-slate-900";
  const panelClasses = isDark ? "border-[#1d2d42] bg-[#0d1724]" : "border-[#dfeaf3] bg-white";
  const innerPanelClasses = isDark ? "border-[#203043] bg-[#101d2d]" : "border-[#e7edf5] bg-[#f9fbff]";
  const mutedText = isDark ? "text-slate-400" : "text-slate-600";
  const strongText = isDark ? "text-white" : "text-slate-900";
  const secondaryText = isDark ? "text-slate-300" : "text-slate-700";

  return (
    <div className={`flex h-screen flex-col ${shellClasses}`}>
      <header className={`flex h-14 shrink-0 items-center border-b px-4 md:hidden ${isDark ? "border-[#1d2d42] bg-[#0d1724] text-slate-100" : "border-[#dfeaf3] bg-white text-slate-900"}`}>
        <button
          type="button"
          onClick={() => window.history.back()}
          className={`mr-3 flex h-8 w-8 items-center justify-center rounded-full border ${isDark ? "border-[#2a3b50] bg-[#111f2d] text-slate-200" : "border-[#dfeaf3] bg-[#f7fafc] text-slate-700"}`}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-heading text-[20px] font-semibold tracking-tight text-inherit">Profile</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-5">
        <div className="mx-auto max-w-[440px]">
          <div className={`overflow-hidden rounded-2xl border shadow-[0_10px_26px_rgba(2,8,20,0.18)] ${panelClasses}`}>
            <div className={`flex items-center gap-3 border-b p-4 ${isDark ? "border-[#1d2d42]" : "border-[#edf2f8]"}`}>
              <div className="grid h-14 w-14 place-items-center rounded-full border border-[#2ecc71] bg-[#132a20] text-lg font-bold text-white">
                {initials}
              </div>

              <div className="min-w-0">
                <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${mutedText}`}>
                  Account
                </p>
                <h2 className={`truncate text-xl font-semibold ${strongText}`}>
                  {displayName}
                </h2>
                <p className={`truncate text-sm ${mutedText}`}>
                  {displayEmail}
                </p>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <div className={`rounded-xl border p-3 ${innerPanelClasses}`}>
                <button
                  type="button"
                  onClick={() => setPersonalInfoOpen((value) => !value)}
                  className={`mb-3 flex w-full items-center justify-between gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] ${secondaryText}`}
                >
                  <span className="flex items-center gap-2">
                    <UserRound className="h-3.5 w-3.5" />
                    <span>Personal Info</span>
                  </span>
                  {personalInfoOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {personalInfoOpen ? (
                  <form onSubmit={handleSaveProfile} className="space-y-3">
                    <label className="block">
                      <span className={`mb-1.5 block text-[11px] font-medium ${mutedText}`}>Full Name</span>
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${innerPanelClasses}`}>
                        <UserRound className={`h-4 w-4 ${mutedText}`} />
                        <input
                          value={profile.name}
                          onChange={(event) => handleChange("name", event.target.value)}
                          placeholder="Enter your name"
                          className={`w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 ${strongText}`}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className={`mb-1.5 block text-[11px] font-medium ${mutedText}`}>Email</span>
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${innerPanelClasses}`}>
                        <Mail className={`h-4 w-4 ${mutedText}`} />
                        <input
                          value={profile.email}
                          onChange={(event) => handleChange("email", event.target.value)}
                          placeholder="user@coindcx.com"
                          className={`w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 ${strongText}`}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className={`mb-1.5 block text-[11px] font-medium ${mutedText}`}>Phone Number</span>
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${innerPanelClasses}`}>
                        <Phone className={`h-4 w-4 ${mutedText}`} />
                        <input
                          value={profile.phone}
                          onChange={(event) => handleChange("phone", event.target.value)}
                          placeholder="+91 98765 43210"
                          className={`w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 ${strongText}`}
                        />
                      </div>
                    </label>

                    <label className="block">
                      <span className={`mb-1.5 block text-[11px] font-medium ${mutedText}`}>Date of Birth</span>
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${innerPanelClasses}`}>
                        <CalendarDays className={`h-4 w-4 ${mutedText}`} />
                        <input
                          value={profile.age}
                          onChange={(event) => handleChange("age", event.target.value)}
                          placeholder="25 years old"
                          className={`w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-500 ${strongText}`}
                        />
                      </div>
                    </label>

                    <button
                      type="submit"
                      className={`mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isDark ? "bg-[#17b26a] text-[#04130e] hover:bg-[#1cd57d]" : "bg-[#12a466] text-white hover:bg-[#15bb6f]"}`}
                    >
                      Save profile
                    </button>
                  </form>
                ) : null}
              </div>

              <div className={`rounded-xl border p-3 ${innerPanelClasses}`}>
                <button
                  type="button"
                  onClick={() => setTradingOverviewOpen((value) => !value)}
                  className={`mb-3 flex w-full items-center justify-between gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] ${secondaryText}`}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Trading Overview</span>
                  </span>
                  {tradingOverviewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {tradingOverviewOpen ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`rounded-xl border p-3 text-center ${panelClasses}`}>
                      <div className={`text-lg font-bold ${strongText}`}>{overview.trades}</div>
                      <div className={`mt-1 text-[10px] uppercase tracking-[0.12em] ${mutedText}`}>Trades</div>
                    </div>
                    <div className={`rounded-xl border p-3 text-center ${panelClasses}`}>
                      <div className={`text-lg font-bold ${strongText}`}>{overview.wins}</div>
                      <div className={`mt-1 text-[10px] uppercase tracking-[0.12em] ${mutedText}`}>Wins</div>
                    </div>
                    <div className={`rounded-xl border p-3 text-center ${panelClasses}`}>
                      <div className="text-lg font-bold text-[#27d189]">{overview.winRate}%</div>
                      <div className={`mt-1 text-[10px] uppercase tracking-[0.12em] ${mutedText}`}>Win Rate</div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={`rounded-xl border p-3 ${innerPanelClasses}`}>
                <button
                  type="button"
                  onClick={() => setAccountSettingsOpen((value) => !value)}
                  className={`mb-3 flex w-full items-center justify-between gap-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] ${secondaryText}`}
                >
                  <span className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Account Settings</span>
                  </span>
                  {accountSettingsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {accountSettingsOpen ? (
                  <div className="space-y-2">
                    {[
                      ["API Keys", "🔐"],
                      ["Notifications", "🔔"],
                      ["Dark Mode", "🌙"],
                      ["Currency", "₹"],
                      ["Security", "🛡️"],
                    ].map(([label, icon], index) => {
                      const isDarkModeRow = label === "Dark Mode";
                      return (
                        <div key={label} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${panelClasses}`}>
                          <div className="flex items-center gap-3">
                            <span className="text-base">{icon}</span>
                            <span className={`text-sm font-medium ${strongText}`}>{label}</span>
                          </div>

                          {label === "API Keys" ? (
                            <ApiKeysDialog compact />
                          ) : isDarkModeRow ? (
                            <button
                              type="button"
                              onClick={handleThemeToggle}
                              aria-label="Toggle dark mode"
                              className={`flex h-6 w-11 items-center rounded-full p-1 transition ${theme === "dark" ? "bg-[#17b26a]" : "bg-[#dfeaf3]"}`}
                            >
                              <span className={`h-4 w-4 rounded-full bg-white transition ${theme === "dark" ? "translate-x-5" : "translate-x-0"}`} />
                            </button>
                          ) : index < 4 ? (
                            <ChevronRight className={`h-4 w-4 ${mutedText}`} />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm font-medium ${panelClasses} ${strongText}`}
              >
                <span className="flex items-center gap-3"><span className="text-base">🔒</span>Logout</span>
                <ChevronRight className={`h-4 w-4 ${mutedText}`} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MobileFooter({ theme }: { theme: AppTheme }) {
  const location = useLocation();
  const isDark = theme === "dark";
  const items = [
    { to: "/", label: "Dashboard", icon: Home },
    { to: "/bot", label: "Bot control", icon: Bot },
    { to: "/history", label: "Trade history", icon: History },
    { to: "/position", label: "Live position", icon: Radar },
    { to: "/profile", label: "Profile", icon: UserRound },
  ];

  return (
    <div className={`fixed inset-x-0 bottom-0 z-50 border-t px-2 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-sm md:hidden ${isDark ? "border-[#1d2d42] bg-[#0d1724]/95 text-slate-100" : "border-[#dfeaf3] bg-white/95 text-slate-900"}`}>
      <div className="grid grid-cols-5 gap-1 text-center text-[9px]">
        {items.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          const activeClasses = active
            ? isDark
              ? "border-[#2a3b50] bg-[#111f2d] text-white shadow-[0_0_12px_rgba(109,129,147,0.18)]"
              : "border-[#dbeaf7] bg-[#f2f7fd] text-slate-900 shadow-[0_0_12px_rgba(109,129,147,0.18)]"
            : isDark
              ? "border-transparent text-slate-400 hover:border-[#2a3b50] hover:bg-[#111f2d] hover:text-slate-100"
              : "border-transparent text-slate-600 hover:border-[#dbeaf7] hover:bg-[#f2f7fd] hover:text-slate-900";

          return (
            <Link
              key={label}
              to={to}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1 transition-all duration-200 ${activeClasses}`}
            >
              <Icon className="h-4 w-4" />
              <span className="leading-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ProtectedRoutes({ theme, setTheme }: { theme: AppTheme; setTheme: React.Dispatch<React.SetStateAction<AppTheme>> }) {
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((response) => {
        if (!response.ok) throw new Error("not authenticated");
        setReady(true);
      })
      .catch(() => {
        setSessionError(true);
        window.location.assign("/login");
      });
  }, []);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--background)] px-6 text-center text-sm text-slate-400">
        {sessionError ? "Redirecting to login..." : "Loading trading workspace..."}
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bot" element={<BotControl />} />
          <Route path="/history" element={<TradeHistory />} />
          <Route path="/position" element={<PositionMonitor />} />
          <Route path="/profile" element={<ProfilePage theme={theme} setTheme={setTheme} />} />
          <Route path="/testing" element={<HistoricalTesting />} />
          <Route path="/realmoneytrade" element={<RealMoneyTrade />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <MobileFooter theme={theme} />
      <Toaster position="bottom-right" richColors />
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<AppTheme>(() => getSavedTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<ProtectedRoutes theme={theme} setTheme={setTheme} />} />
    </Routes>
  );
}
