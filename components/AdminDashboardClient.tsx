"use client";

import { AddTrailerModal } from "@/components/AddTrailerModal";
import { AdminTrailerCard } from "@/components/AdminTrailerCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CsvImportModal } from "@/components/CsvImportModal";
import { EditTrailerModal } from "@/components/EditTrailerModal";
import { FlagTrailerModal } from "@/components/FlagTrailerModal";
import { PullToRefresh } from "@/components/PullToRefresh";
import { UserSidebar } from "@/components/UserSidebar";
import { PasteCSVModal } from "@/components/PasteCSVModal";
import { AdminTrailerDetailModal } from "@/components/AdminTrailerDetailModal";
import { useAuth } from "@/hooks/useAuth";
import { useAutoReloadOnNewDeploy } from "@/hooks/useAutoReloadOnNewDeploy";
import { useTrailers } from "@/hooks/useTrailers";
import { createClient } from "@/lib/supabase/client";
import { cn, trainColor } from "@/lib/utils";
import { Profile, Trailer } from "@/lib/types";
import { ArrowUpCircle, CheckSquare, LogOut, Plus, RefreshCw, Search, Trash2, Upload, X, FileText, Snowflake, TrainFront } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

interface AdminDashboardClientProps {
  initialProfile: Profile;
}

export function AdminDashboardClient({ initialProfile }: AdminDashboardClientProps) {
  const supabase = createClient();
  const { profile: liveProfile, signOut } = useAuth();
  const profile = liveProfile ?? initialProfile;
  useAutoReloadOnNewDeploy();
  const { atRail, cold, departed, staged, refresh } = useTrailers(false);

  const [editing, setEditing] = useState<Trailer | null>(null);
  const [flagging, setFlagging] = useState<Trailer | null>(null);
  const [deleting, setDeleting] = useState<Trailer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPasteCSV, setShowPasteCSV] = useState(false);
  const [selectedTrailerDetail, setSelectedTrailerDetail] = useState<Trailer | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Clear the query while keeping the search box focused so the user can keep typing.
  const clearSearch = () => {
    setQuery("");
    searchInputRef.current?.focus();
  };
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Auto-release cold trailers (manual Cold and auto-flagged wrong-destination
  // alike) when at_rail is depleted. Anything that still isn't actually ready
  // to go out (still wrong dest, etc.) is expected to be deleted by an admin
  // rather than sit flagged forever — this just clears the flags so it's
  // visible again to make that call on.
  useEffect(() => {
    if (atRail.length === 0 && cold.length > 0) {
      releaseColdTrailers();
    }
  }, [atRail.length, cold.length]);

  async function releaseColdTrailers() {
    await supabase
      .from("trailers")
      .update({ is_cold: false, is_wrong_dest: false })
      .or("is_cold.eq.true,is_wrong_dest.eq.true");
  }

  // Mirrors the cold-release effect above: the moment At Rail empties out,
  // promote just the earliest staged train (not every staged train) so the
  // yard isn't left empty while a numbered train is sitting ready. staged is
  // already sorted oldest-first by useTrailers, so the earliest train_number
  // group is whichever one the first item belongs to.
  useEffect(() => {
    if (atRail.length === 0 && staged.length > 0) {
      promoteTrain(staged[0].train_number);
    }
  }, [atRail.length, staged.length]);

  // trainNumber is null for a train staged without a number (shown on the
  // dashboard as a generic "Staged Train") — matched with .is() instead of
  // .eq() since Postgres null never equals anything, including itself.
  async function promoteTrain(trainNumber: string | null) {
    let q = supabase.from("trailers").update({ status: "at_rail" }).eq("status", "staged");
    q = trainNumber ? q.eq("train_number", trainNumber) : q.is("train_number", null);
    await q;
  }

  const matches = (t: Trailer) =>
    query.trim() === "" || t.equipment_number.includes(query.trim().toUpperCase());

  const filteredAtRail = atRail.filter(matches);
  const filteredCold = cold.filter(matches);
  const filteredDeparted = departed.filter(matches);
  const filteredStaged = staged.filter(matches);

  // Group staged trailers by train_number, preserving the oldest-first order
  // useTrailers already sorted them in so the first group listed is the next
  // one due to auto-promote. Every un-numbered staged trailer lands in one
  // shared null-keyed group, shown as a generic "Staged Train".
  const stagedTrains: { trainNumber: string | null; trailers: Trailer[] }[] = [];
  for (const t of filteredStaged) {
    let group = stagedTrains.find((g) => g.trainNumber === t.train_number);
    if (!group) {
      group = { trainNumber: t.train_number, trailers: [] };
      stagedTrains.push(group);
    }
    group.trailers.push(t);
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function handleRevert(trailer: Trailer) {
    await supabase
      .from("trailers")
      .update({
        status: "at_rail",
        assigned_to_id: null,
        assigned_driver_name: null,
        assigned_driver_emp_id: null,
        is_cold: false,
        is_wrong_dest: false,
      })
      .eq("id", trailer.id);
  }

  async function handleMarkDeparted(trailer: Trailer) {
    // Clearing is_wrong_dest here for the same reason is_cold is cleared: the
    // Departed list filters out anything still flagged as cold-like, so leaving
    // either flag set would make a departed trailer vanish from every list.
    await supabase
      .from("trailers")
      .update({
        status: "departed",
        assigned_to_id: null,
        assigned_driver_name: null,
        assigned_driver_emp_id: null,
        is_cold: false,
        is_wrong_dest: false,
      })
      .eq("id", trailer.id)
      .eq("status", "at_rail");
  }

  async function handleToggleHot(trailer: Trailer) {
    await supabase
      .from("trailers")
      .update({ is_hot: !trailer.is_hot })
      .eq("id", trailer.id);
  }

  async function handleToggleCold(trailer: Trailer) {
    const isEffectivelyCold = trailer.is_cold || trailer.is_wrong_dest;
    // Clicking the button always fully releases a trailer, regardless of whether
    // it was cold manually, auto-flagged for a wrong destination, or both — the
    // admin sees one button, so one click clears everything it represents. This
    // is also the only thing that ever clears is_wrong_dest, and it sticks: the
    // database only sets that flag once, on creation, never again automatically.
    await supabase
      .from("trailers")
      .update(
        isEffectivelyCold ? { is_cold: false, is_wrong_dest: false } : { is_cold: true }
      )
      .eq("id", trailer.id);
  }

  async function handlePromoteToAtRail(trailer: Trailer) {
    await supabase
      .from("trailers")
      .update({ status: "at_rail" })
      .eq("id", trailer.id)
      .eq("status", "staged");
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    await supabase.from("trailers").delete().eq("id", deleting.id);
    setDeletingBusy(false);
    setDeleting(null);
  }

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // Selects every trailer currently visible (respects the search filter),
  // across At Rail, Cold, Departed, and Staged. Replaces the current
  // selection rather than adding to it.
  function selectAll() {
    const ids = [...filteredAtRail, ...filteredCold, ...filteredDeparted, ...filteredStaged].map(
      (t) => t.id
    );
    setSelectedIds(new Set(ids));
  }

  // Selects only what's currently visible in the At Rail column — the
  // trailers actually at rail plus the Cold ones grouped underneath them,
  // since that's one visual section on screen. Leaves Departed and Staged
  // alone. Also replaces the current selection.
  function selectAllAtRail() {
    const ids = [...filteredAtRail, ...filteredCold].map((t) => t.id);
    setSelectedIds(new Set(ids));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    await supabase.from("trailers").delete().in("id", Array.from(selectedIds));
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
    setSelectedIds(new Set());
    setSelectMode(false);
    await refresh();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 h-16 border-b border-yard-border shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="h-2 w-6 bg-amber rounded-full" />
            <span className="font-stencil text-xs tracking-[0.25em] text-yard-muted uppercase">
              Rail Sheet
            </span>
          </Link>
          <span className="text-xs font-semibold text-amber bg-amber/10 border border-amber/30 rounded-full px-2.5 py-1 uppercase tracking-wide">
            Admin
          </span>
        </div>
        <button
          onClick={signOut}
          aria-label="Sign out"
          className="h-10 w-10 flex items-center justify-center rounded-full text-yard-muted hover:text-yard-text hover:bg-yard-panel"
        >
          <LogOut size={18} />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 lg:flex-[7] min-h-0 flex flex-col px-6 pt-6 pb-4">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-yard-panel border border-yard-border text-sm text-yard-text hover:border-yard-borderLight"
            >
              <Plus size={15} /> Add Trailer
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-amber text-yard-bg text-sm font-semibold hover:bg-amber/90"
            >
              <Upload size={15} /> Import CSV / Excel
            </button>
            <button
              onClick={() => setShowPasteCSV(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-yard-panel border border-yard-border text-sm text-yard-text hover:border-yard-borderLight"
            >
              <FileText size={15} /> Paste CSV
            </button>
            <button
              onClick={handleManualRefresh}
              title="Refresh yard board"
              aria-label="Refresh yard board"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-yard-panel border border-yard-border text-sm text-yard-text hover:border-yard-borderLight"
            >
              <RefreshCw size={15} className={cn(refreshing && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={toggleSelectMode}
              title={selectMode ? "Cancel selection" : "Select multiple trailers"}
              aria-label={selectMode ? "Cancel selection" : "Select multiple trailers"}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card border text-sm",
                selectMode
                  ? "bg-amber/15 border-amber text-amber font-semibold"
                  : "bg-yard-panel border-yard-border text-yard-text hover:border-yard-borderLight"
              )}
            >
              <CheckSquare size={15} />
              {selectMode ? "Cancel" : "Select"}
            </button>
            {selectMode && (
              <button
                onClick={selectAll}
                title="Select all trailers"
                aria-label="Select all trailers"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-yard-panel border border-yard-border text-sm text-yard-text hover:border-yard-borderLight"
              >
                Select All
              </button>
            )}
            {selectMode && (
              <button
                onClick={selectAllAtRail}
                title="Select all At Rail trailers"
                aria-label="Select all At Rail trailers"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-yard-panel border border-yard-border text-sm text-yard-text hover:border-yard-borderLight"
              >
                Select At Rail
              </button>
            )}
            {selectMode && (
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={selectedIds.size === 0}
                title="Delete selected trailers"
                aria-label="Delete selected trailers"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card bg-danger text-white text-sm font-semibold hover:bg-danger/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} />
                Delete Selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
              </button>
            )}
            <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-yard-faint pointer-events-none"
              />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search equipment number"
                className="w-full h-9 pl-9 pr-9 rounded-card bg-yard-panel border border-yard-border text-sm outline-none focus:border-amber"
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
                    clearSearch();
                  }}
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-yard-faint hover:text-yard-text"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-6">
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-amber" />
                <h2 className="font-display text-sm uppercase tracking-widest text-yard-muted">
                  At Rail
                </h2>
                <span className="text-xs text-yard-faint">{filteredAtRail.length}</span>
              </div>
              <PullToRefresh onRefresh={refresh} className="flex-1 space-y-2.5 pb-4 min-h-0 overflow-y-auto">
                {filteredAtRail.length === 0 && filteredCold.length === 0 && (
                  <p className="text-sm text-yard-faint px-1 py-8 text-center">Nothing here.</p>
                )}
                {filteredAtRail.map((t) => (
                  <AdminTrailerCard
                    key={t.id}
                    trailer={t}
                    profileId={profile.id}
                    onRevert={() => handleRevert(t)}
                    onEdit={() => setEditing(t)}
                    onFlag={() => setFlagging(t)}
                    onToggleHot={() => handleToggleHot(t)}
                    onToggleCold={() => handleToggleCold(t)}
                    onMarkDeparted={() => handleMarkDeparted(t)}
                    onDelete={() => setDeleting(t)}
                    onViewDetails={() => setSelectedTrailerDetail(t)}
                    selectMode={selectMode}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={() => toggleSelected(t.id)}
                  />
                ))}

                {filteredCold.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 mt-6 pt-6 border-t border-yard-border">
                      <Snowflake size={14} className="text-depart" />
                      <h3 className="font-display text-xs uppercase tracking-widest text-yard-muted">
                        Cold ({filteredCold.length})
                      </h3>
                    </div>
                    {filteredCold.map((t) => (
                      <AdminTrailerCard
                        key={t.id}
                        trailer={t}
                        profileId={profile.id}
                        onRevert={() => handleRevert(t)}
                        onEdit={() => setEditing(t)}
                        onFlag={() => setFlagging(t)}
                        onToggleHot={() => handleToggleHot(t)}
                        onToggleCold={() => handleToggleCold(t)}
                        onMarkDeparted={() => handleMarkDeparted(t)}
                        onDelete={() => setDeleting(t)}
                        onViewDetails={() => setSelectedTrailerDetail(t)}
                        selectMode={selectMode}
                        selected={selectedIds.has(t.id)}
                        onToggleSelect={() => toggleSelected(t.id)}
                      />
                    ))}
                  </>
                )}
              </PullToRefresh>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-depart" />
                <h2 className="font-display text-sm uppercase tracking-widest text-yard-muted">
                  Departed
                </h2>
                <span className="text-xs text-yard-faint">{filteredDeparted.length}</span>
              </div>
              <PullToRefresh onRefresh={refresh} className="flex-1 space-y-2.5 pb-4 min-h-0 overflow-y-auto">
                {filteredDeparted.length === 0 && (
                  <p className="text-sm text-yard-faint px-1 py-8 text-center">Nothing here.</p>
                )}
                {filteredDeparted.map((t) => (
                  <AdminTrailerCard
                    key={t.id}
                    trailer={t}
                    profileId={profile.id}
                    onRevert={() => handleRevert(t)}
                    onEdit={() => setEditing(t)}
                    onFlag={() => setFlagging(t)}
                    onToggleHot={() => handleToggleHot(t)}
                    onToggleCold={() => handleToggleCold(t)}
                    onMarkDeparted={() => handleMarkDeparted(t)}
                    onDelete={() => setDeleting(t)}
                    onViewDetails={() => setSelectedTrailerDetail(t)}
                    selectMode={selectMode}
                    selected={selectedIds.has(t.id)}
                    onToggleSelect={() => toggleSelected(t.id)}
                  />
                ))}
              </PullToRefresh>
            </div>
          </div>

          {stagedTrains.length > 0 && (
            <div className="mt-6 pt-6 border-t border-yard-border shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <TrainFront size={14} className="text-train" />
                <h2 className="font-display text-sm uppercase tracking-widest text-yard-muted">
                  Staged Trains
                </h2>
                <span className="text-xs text-yard-faint">{filteredStaged.length}</span>
              </div>
              <div className="space-y-6">
                {stagedTrains.map((group) => {
                  // Un-numbered staged batches all share one generic purple —
                  // there's no number to derive a distinct color from.
                  const color = group.trainNumber ? trainColor(group.trainNumber) : "#9B6BFF";
                  const label = group.trainNumber ? `Train ${group.trainNumber}` : "Staged Train";
                  return (
                  <div key={group.trainNumber ?? "unnumbered"}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <h3 className="font-display text-xs uppercase tracking-widest text-yard-muted">
                        {label} ({group.trailers.length})
                      </h3>
                      <button
                        onClick={() => promoteTrain(group.trainNumber)}
                        className="ml-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-card text-xs font-semibold border"
                        style={{
                          backgroundColor: `${color}26`,
                          borderColor: `${color}66`,
                          color,
                        }}
                      >
                        <ArrowUpCircle size={13} /> Promote to At Rail
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {group.trailers.map((t) => (
                        <AdminTrailerCard
                          key={t.id}
                          trailer={t}
                          profileId={profile.id}
                          onRevert={() => handleRevert(t)}
                          onEdit={() => setEditing(t)}
                          onFlag={() => setFlagging(t)}
                          onToggleHot={() => handleToggleHot(t)}
                          onToggleCold={() => handleToggleCold(t)}
                          onMarkDeparted={() => handleMarkDeparted(t)}
                          onDelete={() => setDeleting(t)}
                          onViewDetails={() => setSelectedTrailerDetail(t)}
                          onPromoteToAtRail={() => handlePromoteToAtRail(t)}
                          selectMode={selectMode}
                          selected={selectedIds.has(t.id)}
                          onToggleSelect={() => toggleSelected(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="lg:flex-[3] min-h-0">
          <UserSidebar currentProfile={profile} />
        </div>
      </div>

      <AddTrailerModal open={showAddModal} onClose={() => setShowAddModal(false)} />
      <EditTrailerModal trailer={editing} onClose={() => setEditing(null)} />
      <FlagTrailerModal trailer={flagging} onClose={() => setFlagging(null)} />
      <CsvImportModal open={showImport} onClose={() => setShowImport(false)} />
      <PasteCSVModal open={showPasteCSV} onClose={() => setShowPasteCSV(false)} />
      <AdminTrailerDetailModal
        trailer={selectedTrailerDetail}
        profile={profile}
        onClose={() => setSelectedTrailerDetail(null)}
      />
      <ConfirmModal
        open={!!deleting}
        title="Delete Trailer"
        message={`Remove ${deleting?.equipment_number} from active inventory? This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deletingBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={handleDelete}
      />
      <ConfirmModal
        open={showBulkDeleteConfirm}
        title="Delete Trailers"
        message={`Remove ${selectedIds.size} trailer${selectedIds.size === 1 ? "" : "s"} from active inventory? This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={bulkDeleting}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
