import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { springGentle } from "@/lib/t90Motion";
import T90AuthShell from "@/components/t90/T90AuthShell";
import { captureInviteToken, getInviteToken, getInviteContext, setInviteContext } from "@/lib/inviteToken";
import { resolveInvitationDestination } from "@/lib/invitationRouting";
import { safeReturnTo } from "@/lib/authReturnTo";
import { track } from "@/lib/analytics";
import { useSocialLogin } from "@/hooks/useSocialLogin";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { socialLoading, startSocialLogin } = useSocialLogin({ onError: setError });

  // Capture invite token from URL (?invite=<token>) on mount and resolve its
  // type so post-login + OAuth routing can distinguish account invites (→
  // onboarding/role home) from connection/guardian invites (→ /invite/review).
  useEffect(() => {
    captureInviteToken();
    if (getInviteToken() && !getInviteContext()) {
      base44.functions
        .invoke("manageInvitation", { action: "resolve_by_token", token: getInviteToken() })
        .then((res) => { if (res.data?.valid) setInviteContext(res.data); })
        .catch(() => {});
    }
  }, []);

  const canSubmit = email.trim() && password;

  // Resolve the post-auth destination by invitation type.
  // account → onboarding (or role home if already onboarded); the user's
  // existing roles determine completeness. connection/guardian → /invite/review.
  const resolveLoginDestination = () => {
    // OAuth MCP consent resume: honor a safe returnTo so the consent page
    // resumes after sign-in. Invite/legacy flows keep priority when present.
    const returnTo = safeReturnTo();
    if (returnTo !== "/") return returnTo;
    const ctx = getInviteContext();
    if (ctx && ctx.valid) {
      const roles = [];
      return resolveInvitationDestination(ctx, { roles, onboarded: false });
    }
    return getInviteToken() ? "/invite/review" : "/";
  };

  const handleSocialLogin = (provider) => {
    setError("");
    track("auth_login_started", { provider });
    startSocialLogin(provider, resolveLoginDestination());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    track("auth_login_started", { provider: "email" });
    try {
      await base44.auth.loginViaEmailPassword(email.trim().toLowerCase(), password);
      track("auth_login_completed", { provider: "email" });
      window.location.href = resolveLoginDestination();
    } catch (err) {
      track("auth_login_failed", { reason: "credentials", provider: "email" });
      setError("We couldn't log you in with those credentials. Check your email and password and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <T90AuthShell title="Welcome Back" subtitle="Return to your Athlete Operating System.">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-primary/10 border border-primary/25 rounded-2xl px-4 py-2.5"
          >
            <p role="alert" className="text-[14px] text-primary leading-relaxed">{error}</p>
          </motion.div>
        )}

        {/* Email */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, ...springGentle }}
        >
          <label className="text-[11px] font-heading font-bold text-white/45 uppercase tracking-[0.12em] block mb-1.5">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-secondary border border-white/10 rounded-2xl px-4 py-3.5 text-[16px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
            placeholder="you@email.com"
            autoComplete="email"
            required
          />
        </motion.div>

        {/* Password */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, ...springGentle }}
        >
          <label className="text-[11px] font-heading font-bold text-white/45 uppercase tracking-[0.12em] block mb-1.5">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-secondary border border-white/10 rounded-2xl px-4 py-3.5 pr-12 text-[16px] text-white placeholder:text-white/25 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-all"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/60 transition-colors p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
            </button>
          </div>
          <div className="flex justify-end mt-1.5">
            <Link
              to="/forgot-password"
              className="text-[12px] font-body text-white/45 hover:text-white/70 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </motion.div>

        {/* Login button */}
        <motion.button
          type="submit"
          disabled={!canSubmit || loading}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.39, ...springGentle }}
          whileTap={{ scale: 0.97 }}
          className="w-full text-white font-heading font-bold text-[13px] tracking-[0.08em] uppercase rounded-2xl py-4 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed t90-cta-glow flex items-center justify-center gap-2"
          style={{ backgroundColor: "hsl(356 78% 56%)" }}
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Signing In</span>
            </>
          ) : (
            <>
              <span>Log In</span>
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </>
          )}
        </motion.button>
      </form>

      {/* Create account */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="text-[13px] font-body text-white/55 text-center mt-3.5"
      >
        New to T90?{" "}
        <Link to="/register" className="text-primary font-semibold hover:underline">
          Create an account
        </Link>
      </motion.p>

      {/* Divider */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="flex items-center gap-3 mt-5 mb-4"
      >
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] font-heading font-bold text-white/30 tracking-[0.14em] uppercase">
          Or Continue With
        </span>
        <div className="flex-1 h-px bg-white/10" />
      </motion.div>

      {/* Social buttons */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, ...springGentle }}
        className="space-y-2.5"
      >
        <button
          type="button"
          onClick={() => handleSocialLogin("apple")}
          disabled={Boolean(socialLoading)}
          aria-label="Sign in with Apple"
          className="w-full bg-card border border-white/10 hover:bg-secondary/80 hover:border-white/15 text-white font-medium text-[14px] rounded-2xl py-3.5 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
        >
          {socialLoading === "apple" ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.51-3.74 4.25z" />
            </svg>
          )}
          {socialLoading === "apple" ? "Opening Apple Sign-In" : "Continue with Apple"}
        </button>
        <button
          type="button"
          onClick={() => handleSocialLogin("google")}
          disabled={Boolean(socialLoading)}
          className="w-full bg-card border border-white/10 hover:bg-secondary/80 hover:border-white/15 text-white font-medium text-[14px] rounded-2xl py-3.5 transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>
      </motion.div>
    </T90AuthShell>
  );
}