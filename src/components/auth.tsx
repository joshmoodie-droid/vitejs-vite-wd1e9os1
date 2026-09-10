// Magic-link sign-in screens (customer + supplier) and the "not linked" notice.
// Extracted verbatim from App.tsx. Each auth form owns its own local state and
// calls supabase.auth.signInWithOtp directly.

import { useState } from "react";
import { ArrowLeft, User, Building2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { Field, inputClass } from "./ui";

export function CustomerAuth({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sendLink = async () => {
    const addr = email.trim();
    if (!addr) return;
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div className="max-w-sm mx-auto">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-lg bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-3">
          <User className="w-6 h-6 text-orange-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-white">
          {sent ? "Check your email" : "Sign in"}
        </h1>
        <p className="text-neutral-500 text-sm mt-1">
          {sent
            ? `We sent a sign-in link to ${email.trim()}. Open it and you're in — no password needed.`
            : "Enter your email and we'll send you a one-tap sign-in link."}
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {sent ? (
        <button
          onClick={() => { setSent(false); setErr(""); }}
          className="w-full text-sm text-neutral-400 hover:text-white"
        >
          Use a different email
        </button>
      ) : (
        <>
          <Field label="Email" required>
            <input
              type="email"
              autoFocus
              placeholder="you@example.com"
              className={inputClass()}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
            />
          </Field>
          <button
            onClick={sendLink}
            disabled={busy || !email.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-black font-bold py-3 rounded-lg transition-colors"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </>
      )}
    </div>
  );
}

export function SupplierAuth({ onBack }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const sendLink = async () => {
    const addr = email.trim();
    if (!addr) return;
    setErr(""); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/supplier` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div className="max-w-sm mx-auto">
      {onBack && (
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
      )}
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-6 h-6 text-orange-500" />
        </div>
        <h1 className="text-2xl font-extrabold text-white mb-1">
          {sent ? "Check your email" : "Supplier Portal"}
        </h1>
        <p className="text-neutral-400 text-sm">
          {sent
            ? `We sent a sign-in link to ${email.trim()}.`
            : "Sign in with the email on your supplier account."}
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      )}

      {sent ? (
        <button onClick={() => { setSent(false); setErr(""); }} className="w-full text-sm text-neutral-400 hover:text-white">
          Use a different email
        </button>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <Field label="Email" required>
            <input
              type="email"
              autoFocus
              placeholder="you@company.com"
              className={inputClass()}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
            />
          </Field>
          <button
            onClick={sendLink}
            disabled={busy || !email.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-black font-bold py-3 rounded-lg transition-colors"
          >
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </div>
      )}
    </div>
  );
}

export function SupplierNotLinked({ email, onSignOut }) {
  return (
    <div className="max-w-sm mx-auto text-center">
      <div className="w-14 h-14 rounded-xl bg-orange-500/10 border border-orange-500/40 flex items-center justify-center mx-auto mb-4">
        <Building2 className="w-6 h-6 text-orange-500" />
      </div>
      <h1 className="text-2xl font-extrabold text-white mb-1">Account not linked</h1>
      <p className="text-neutral-400 text-sm mb-6">
        <span className="text-neutral-300">{email}</span> isn't attached to a
        supplier account yet. Ask the operator to set this as the contact email
        on your supplier record, then sign in again.
      </p>
      <button onClick={onSignOut} className="text-sm text-neutral-400 hover:text-white">
        Sign out
      </button>
    </div>
  );
}
