"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authError, useI18n } from "@/lib/i18n/provider";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (result.error) setError(authError(result.error.message, t));
    else window.location.href = mode === "login" ? "/dashboard" : "/onboarding";
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div><label className="label">{t.auth.email}</label><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div><label className="label">{t.auth.password}</label><input className="field" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
      <button className="btn-primary w-full" disabled={loading}>{loading ? t.auth.wait : mode === "login" ? t.auth.login : t.auth.signup}</button>
    </form>
  );
}
