"use client";

import { Trailer, Profile } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ArrowUpCircle, Check, Flame, Pencil, RotateCcw, Send, Tag, Trash2, User, Snowflake, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AdminTrailerCardProps {
  trailer: Trailer;
  profileId: string;
  onRevert: () => void;
  onEdit: () => void;
  onFlag: () => void;
  onToggleHot: () => void;
  onToggleCold: () => void;
  onMarkDeparted: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
  // Only relevant for a staged (upcoming train) trailer — promotes it to At
  // Rail individually. Omitted entirely for at_rail/departed cards.
  onPromoteToAtRail?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function AdminTrailerCard({
  trailer,
  profileId,
  onRevert,
  onEdit,
  onFlag,
  onToggleHot,
  onToggleCold,
  onMarkDeparted,
  onDelete,
  onViewDetails,
  onPromoteToAtRail,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: AdminTrailerCardProps) {
  const supabase = createClient();
  const [flagCreator, setFlagCreator] = useState<Profile | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalNotes, setTotalNotes] = useState(0);
  const isDeparted = trailer.status === "departed";
  const isStaged = trailer.status === "staged";

  useEffect(() => {
    if (trailer.flag_created_by) {
      fetchFlagCreator(trailer.flag_created_by);
    }
    fetchUnreadCount();
  }, [trailer.flag_created_by, trailer.id, profileId]);

  async function fetchFlagCreator(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();

    if (data) {
      setFlagCreator(data as Profile);
    }
  }

  async function fetchUnreadCount() {
    const { data } = await supabase
      .from("admin_notes")
      .select("id, read_by_ids")
      .eq("trailer_id", trailer.id);

    if (data) {
      setTotalNotes(data.length);
      const unread = data.filter(note => {
        const readByIds = note.read_by_ids || [];
        return !readByIds.includes(profileId);
      }).length;
      setUnreadCount(unread);
    }
  }

  const routeLine = [
    trailer.origin ?? "—",
    trailer.destination ? `→ ${trailer.destination}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const sortLine = [trailer.origin_sort_type, trailer.destination_sort_type]
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className={cn(
        "flex items-stretch bg-yard-surface border rounded-card overflow-hidden",
        selectMode && selected ? "border-amber ring-1 ring-amber" : "border-yard-border"
      )}
    >
      <div className={cn("w-1.5 shrink-0", isDeparted ? "bg-depart" : isStaged ? "bg-train" : "bg-amber")} />
      {selectMode && (
        <button
          onClick={onToggleSelect}
          aria-label={selected ? "Deselect trailer" : "Select trailer"}
          className="flex items-center justify-center pl-3 pr-1 shrink-0"
        >
          <span
            className={cn(
              "h-5 w-5 rounded flex items-center justify-center border-2 transition-colors",
              selected ? "bg-amber border-amber" : "border-yard-borderLight"
            )}
          >
            {selected && <Check size={14} className="text-yard-bg" strokeWidth={3} />}
          </span>
        </button>
      )}
      <div className="flex items-center gap-2 px-2 shrink-0">
        {totalNotes > 0 && (
          <div title={`${totalNotes} note${totalNotes === 1 ? "" : "s"}`} className="flex items-center gap-1 text-xs">
            <MessageSquare size={14} className="text-amber" />
            {unreadCount > 0 && (
              <span className="bg-amber text-yard-bg text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
        )}
      </div>
      <div
        className="flex-1 min-w-0 px-3.5 py-3 cursor-pointer hover:bg-yard-panel/50 transition-colors"
        onClick={selectMode ? onToggleSelect : onViewDetails}
      >
        <p className="font-stencil font-bold text-base tracking-wider text-yard-text truncate">
          {trailer.equipment_number}
        </p>
        <p className="text-xs text-yard-muted truncate mt-0.5">
          {routeLine}
          {sortLine && ` · ${sortLine}`}
        </p>
        {trailer.flag_note && flagCreator && trailer.flag_created_at && (
          <p className="text-xs text-danger mt-1">
            Redtag: {trailer.flag_note.substring(0, 30)}
            {trailer.flag_note.length > 30 ? "..." : ""} · Tagged by {flagCreator.first_name}{" "}
            {flagCreator.last_name} {formatRelativeTime(trailer.flag_created_at)}
          </p>
        )}
        {isDeparted && trailer.assigned_driver_name && (
          <p className="flex items-center gap-1 text-xs text-depart mt-1">
            <User size={11} />
            {trailer.assigned_driver_name} ({trailer.assigned_driver_emp_id}) ·{" "}
            {formatRelativeTime(trailer.updated_at)}
          </p>
        )}
      </div>
      {!selectMode && (
      <div className="flex items-center gap-0.5 px-2 border-l border-yard-border shrink-0">
        <button
          onClick={onToggleHot}
          title={trailer.is_hot ? "Clear HOT" : "Mark HOT — needs to come back ASAP"}
          aria-label="Toggle HOT"
          className={cn(
            "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
            trailer.is_hot
              ? "text-hot bg-hot/15 hover:bg-hot/25"
              : "text-yard-muted hover:text-hot hover:bg-hot/10"
          )}
        >
          <Flame size={16} />
        </button>
        <button
          onClick={onToggleCold}
          // is_wrong_dest is invisible to everyone — this button and its label look
          // exactly the same whether a trailer is cold manually or auto-flagged.
          title={
            trailer.is_cold || trailer.is_wrong_dest ? "Clear COLD" : "Mark COLD — hide from drivers"
          }
          aria-label="Toggle COLD"
          className={cn(
            "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
            trailer.is_cold || trailer.is_wrong_dest
              ? "text-depart bg-depart/15 hover:bg-depart/25"
              : "text-yard-muted hover:text-depart hover:bg-depart/10"
          )}
        >
          <Snowflake size={16} />
        </button>
        <button
          onClick={onFlag}
          title={trailer.flag_note ? `${trailer.flag_note} — tap to edit or clear` : "Redtag trailer"}
          aria-label="Redtag trailer"
          className={cn(
            "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
            trailer.flag_note
              ? "text-danger bg-danger/15 hover:bg-danger/25"
              : "text-yard-muted hover:text-danger hover:bg-danger/10"
          )}
        >
          <Tag size={16} />
        </button>
        {isStaged && (
          <button
            onClick={onPromoteToAtRail}
            title="Promote to At Rail"
            aria-label="Promote to At Rail"
            className="h-9 w-9 flex items-center justify-center rounded-full text-yard-muted hover:text-train hover:bg-train/10"
          >
            <ArrowUpCircle size={16} />
          </button>
        )}
        {!isDeparted && !isStaged && (
          <button
            onClick={onMarkDeparted}
            title="Move to Departed"
            aria-label="Move to Departed"
            className="h-9 w-9 flex items-center justify-center rounded-full text-yard-muted hover:text-depart hover:bg-depart/10"
          >
            <Send size={16} />
          </button>
        )}
        {isDeparted && (
          <button
            onClick={onRevert}
            title="Revert to At Rail"
            aria-label="Revert to At Rail"
            className="h-9 w-9 flex items-center justify-center rounded-full text-yard-muted hover:text-okay hover:bg-okay/10"
          >
            <RotateCcw size={16} />
          </button>
        )}
        <button
          onClick={onEdit}
          title="Edit"
          aria-label="Edit"
          className="h-9 w-9 flex items-center justify-center rounded-full text-yard-muted hover:text-amber hover:bg-amber/10"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          aria-label="Delete"
          className="h-9 w-9 flex items-center justify-center rounded-full text-yard-muted hover:text-danger hover:bg-danger/10"
        >
          <Trash2 size={16} />
        </button>
      </div>
      )}
    </div>
  );
}
