"use client";

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useState } from "react";

export default function ResetWithCodePage() {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/verify-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), password }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || !data.valid) {
      setError(data.error ?? "Could not reset password. Check your code and try again.");
      return;
    }

    setDone(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="h-2 w-8 bg-amber rounded-full" />
            <span className="font-stencil text-xs tracking-[0.3em] text-yard-muted uppercase">
              Rail Sheet
            </span>
          </div>
          <h1 className="font-display text-3xl uppercase tracking-wide">Reset Password</h1>
          <p className="text-sm text-yard-muted mt-2">
            Ask an admin for a reset code, then set a new password below.
          </p>
        </div>

        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-okay bg-okay/10 border border-okay/30 rounded-card px-3 py-3">
              Password updated. You can now sign in with your new password.
            </p>
            <Link href="/login" className="text-sm text-amber hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide"
              >
                Reset Code
              </label>
              <input
                id="code"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit code"
                className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text font-stencil text-xl tracking-widest text-center focus:border-amber outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="text-xs text-danger mt-1">Passwords do not match.</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Reset Password
            </Button>

            <p className="text-center text-sm text-yard-muted">
              <Link href="/login" className="text-amber hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
