"use client";

import { NavShield } from "@/components/NavShield";
import { PullToRefresh } from "@/components/PullToRefresh";
import { TrailerCard } from "@/components/TrailerCard";
import { TrailerDetailModal } from "@/components/TrailerDetailModal";
import { useAuth } from "@/hooks/useAuth";
import { useAutoReloadOnNewDeploy } from "@/hooks/useAutoReloadOnNewDeploy";
import { usePresence } from "@/hooks/usePresence";
import { useTrailers } from "@/hooks/useTrailers";
import { cn } from "@/lib/utils";
import { rememberView } from "@/lib/viewPreference";
import { Profile, Trailer } from "@/lib/types";
import { LogOut, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface DashboardClientProps {
  initialProfile: Profile;
}

export function DashboardClient({ initialProfile }: DashboardClientProps) {
  const { profile: liveProfile, signOut } = useAuth();
  const profile = liveProfile ?? initialProfile;
  usePresence(profile); // joins the shared presence channel so admins see this driver as active
  useAutoReloadOnNewDeploy(); // self-heal if this tab is left open across a deploy
  const { atRail, departed, loading, refresh } = useTrailers();

  // Only admins have two views to choose between, so only they record one.
  // Leaving a driver's preference unset means that if they're promoted later
  // they start on the admin board instead of in driver view.
  useEffect(() => {
    if (profile.is_admin) rememberView("driver");
  }, [profile.is_admin]);
  const [tab, setTab] = useState<"at_rail" | "departed">("at_rail");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Trailer | null>(null);
  // Separate refs: both inputs are always rendered (one hidden via CSS), so a
  // shared ref would point at the hidden desktop input and focus() would no-op.
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const desktopSearchRef = useRef<HTMLInputElement>(null);

  // Clear the query while keeping the given input focused so the user can keep typing.
  const clearSearch = (input: HTMLInputElement | null) => {
    setQuery("");
    input?.focus();
  };

  const matches = (t: Trailer) =>
    query.trim() === "" || t.equipment_number.includes(query.trim().toUpperCase());

  const filteredAtRail = atRail.filter(matches);
  const filteredDeparted = departed.filter(matches);

  const Column = ({
    title,
    trailers,
    accent,
  }: {
    title: string;
    trailers: Trailer[];
    accent: string;
  }) => (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="hidden sm:flex items-center gap-2 px-1 mb-3">
        <span className={cn("h-2 w-2 rounded-full", accent)} />
        <h2 className="font-display text-sm uppercase tracking-widest text-yard-muted">
          {title}
        </h2>
        <span className="text-xs text-yard-faint">{trailers.length}</span>
      </div>
      <PullToRefresh onRefresh={refresh} className="flex-1 space-y-2.5 pb-6">
        {trailers.length === 0 && (
          <p className="text-sm text-yard-faint px-1 py-8 text-center">Nothing here.</p>
        )}
        {trailers.map((t) => (
          <TrailerCard key={t.id} trailer={t} onClick={() => setSelected(t)} />
        ))}
      </PullToRefresh>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 sm:px-6 h-16 border-b border-yard-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="h-2 w-6 bg-amber rounded-full" />
          <span className="font-stencil text-xs tracking-[0.25em] text-yard-muted uppercase">
            Rail Sheet
          </span>
        </div>
        <div className="flex items-center gap-1">
          {profile.is_admin && <NavShield />}
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="h-10 w-10 flex items-center justify-center rounded-full text-yard-muted hover:text-yard-text hover:bg-yard-panel"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Mobile controls: category dropdown + search */}
      <div className="sm:hidden flex px-4 pt-4 gap-2 shrink-0">
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as "at_rail" | "departed")}
          className="h-11 px-3 rounded-card bg-yard-panel border border-yard-border text-sm font-display uppercase tracking-wide text-yard-text outline-none focus:border-amber"
        >
          <option value="at_rail">At Rail</option>
          <option value="departed">Departed</option>
        </select>
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-yard-faint pointer-events-none"
          />
          <input
            ref={mobileSearchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="numeric"
            placeholder="Search equipment number"
            className="w-full h-11 pl-9 pr-9 rounded-card bg-yard-panel border border-yard-border text-sm outline-none focus:border-amber"
          />
          {query && (
            <button
              type="button"
              // Never let the X take focus away from the input (keeps the mobile keyboard open).
              // On touch devices we handle the tap in touchend and cancel the synthetic
              // mouse/click events, since iOS won't reliably re-open a keyboard it just closed.
              onMouseDown={(e) => e.preventDefault()}
              onTouchEnd={(e) => {
                e.preventDefault();
                clearSearch(mobileSearchRef.current);
              }}
              onClick={() => clearSearch(mobileSearchRef.current)}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-yard-faint hover:text-yard-text"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Desktop search */}
      <div className="hidden sm:block px-6 pt-6 shrink-0">
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-yard-faint pointer-events-none"
          />
          <input
            ref={desktopSearchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="numeric"
            placeholder="Search equipment number"
            className="w-full h-11 pl-9 pr-9 rounded-card bg-yard-panel border border-yard-border text-sm outline-none focus:border-amber"
          />
          {query && (
            <button
              type="button"
              // Never let the X take focus away from the input (keeps the mobile keyboard open).
              // On touch devices we handle the tap in touchend and cancel the synthetic
              // mouse/click events, since iOS won't reliably re-open a keyboard it just closed.
              onMouseDown={(e) => e.preventDefault()}
              onTouchEnd={(e) => {
                e.preventDefault();
                clearSearch(desktopSearchRef.current);
              }}
              onClick={() => clearSearch(desktopSearchRef.current)}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-yard-faint hover:text-yard-text"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <main className="flex-1 min-h-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 flex flex-col sm:flex-row sm:gap-8">
        {loading ? (
          <p className="text-yard-faint text-sm px-1 py-8">Loading yard board…</p>
        ) : (
          <>
            <div
              className={cn(
                "sm:flex-1 sm:flex sm:min-h-0",
                tab === "at_rail" ? "flex flex-1 min-h-0" : "hidden"
              )}
            >
              <Column title="At Rail" trailers={filteredAtRail} accent="bg-amber" />
            </div>
            <div
              className={cn(
                "sm:flex-1 sm:flex sm:min-h-0",
                tab === "departed" ? "flex flex-1 min-h-0" : "hidden"
              )}
            >
              <Column title="Departed" trailers={filteredDeparted} accent="bg-depart" />
            </div>
          </>
        )}
      </main>

      <TrailerDetailModal trailer={selected} profile={profile} onClose={() => setSelected(null)} />
    </div>
  );
}
