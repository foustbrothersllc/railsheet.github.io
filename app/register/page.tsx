"use client";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const supabase = createClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const employeeIdValid = /^[0-9]{6,8}$/.test(employeeId);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!employeeIdValid) {
      setError("Employee ID must be 6 to 8 digits.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Where the "Confirm your email" link sends the user afterwards.
        // Must be listed in Supabase Auth > URL Configuration > Redirect URLs.
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          first_name: firstName,
          last_name: lastName,
          employee_id: employeeId,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/pending";
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="h-2 w-8 bg-amber rounded-full" />
            <span className="font-stencil text-xs tracking-[0.3em] text-yard-muted uppercase">
              Rail Sheet
            </span>
          </div>
          <h1 className="font-display text-3xl uppercase tracking-wide">Create Account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
                First Name
              </label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
                Last Name
              </label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
              Employee ID (6–8 digits)
            </label>
            <input
              required
              inputMode="numeric"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value.replace(/\D/g, ""))}
              maxLength={8}
              className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text font-stencil tracking-widest focus:border-amber outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
              Password
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
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-yard-muted mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-amber hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
