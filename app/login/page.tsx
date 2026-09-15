"use client";

import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = "/";
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
          <h1 className="font-display text-3xl uppercase tracking-wide">Sign In</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-yard-muted mb-1.5 uppercase tracking-wide">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="block text-xs font-medium text-yard-muted uppercase tracking-wide">
                Password
              </label>
              <Link href="/reset-with-code" className="text-xs text-amber hover:underline">
                Have a reset code?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 rounded-card bg-yard-panel border border-yard-border text-yard-text focus:border-amber outline-none"
            />
          </div>

          {error && (
            <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Sign In
          </Button>
        </form>

        <p className="text-center text-sm text-yard-muted mt-6">
          New here?{" "}
          <Link href="/register" className="text-amber hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
