"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { Profile, Trailer } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Flame, Tag, BarChart3, Snowflake } from "lucide-react";
import { useEffect, useState } from "react";

interface AdminTrailerDetailModalProps {
  trailer: Trailer | null;
  profile: Profile;
  onClose: () => void;
}

interface AdminNote {
  id: string;
  created_by_id: string;
  note_text: string;
  created_at: string;
  creator_name: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-yard-border last:border-b-0">
      <span className="text-sm uppercase tracking-wide text-yard-muted">{label}</span>
      <span className="text-lg font-semibold text-yard-text text-right">{value}</span>
    </div>
  );
}

export function AdminTrailerDetailModal({
  trailer,
  profile,
  onClose,
}: AdminTrailerDetailModalProps) {
  const supabase = createClient();
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (trailer) {
      loadNotes();
      markNotesAsRead();
      setError(null);
      setNewNote("");
    }
  }, [trailer]);

  async function loadNotes() {
    if (!trailer) return;

    const { data } = await supabase
      .from("admin_notes")
      .select("*")
      .eq("trailer_id", trailer.id)
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch creator names
      const notesWithNames = await Promise.all(
        data.map(async (note) => {
          const { data: creator } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", note.created_by_id)
            .single();

          return {
            ...note,
            creator_name: creator
              ? `${creator.first_name} ${creator.last_name}`
              : "Unknown",
          };
        })
      );
      setNotes(notesWithNames as AdminNote[]);
    }
  }

  async function markNotesAsRead() {
    if (!trailer) return;

    const { data: notes } = await supabase
      .from("admin_notes")
      .select("id, read_by_ids")
      .eq("trailer_id", trailer.id);

    if (notes) {
      for (const note of notes) {
        const readByIds = note.read_by_ids || [];
        if (!readByIds.includes(profile.id)) {
          readByIds.push(profile.id);
          await supabase
            .from("admin_notes")
            .update({ read_by_ids: readByIds })
            .eq("id", note.id);
        }
      }
    }
  }

  async function handleAddNote() {
    if (!trailer || !newNote.trim()) return;

    setSavingNote(true);
    setError(null);

    const { error: err } = await supabase.from("admin_notes").insert({
      trailer_id: trailer.id,
      created_by_id: profile.id,
      note_text: newNote.trim(),
    });

    setSavingNote(false);

    if (err) {
      setError(err.message);
      return;
    }

    setNewNote("");
    loadNotes();
  }

  if (!trailer) return null;

  const isDeparted = trailer.status === "departed";

  return (
    <Modal
      open={!!trailer}
      onClose={onClose}
      title={trailer.equipment_number}
      titleClassName="text-4xl"
      footer={
        <Button onClick={onClose} className="w-full">
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          {trailer.is_hot && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-hot bg-hot/15 border border-hot/30 rounded-full px-2 py-0.5">
              <Flame size={10} />
              Hot
            </span>
          )}
          {(trailer.is_cold || trailer.is_wrong_dest) && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-depart bg-depart/15 border border-depart/30 rounded-full px-2 py-0.5">
              <Snowflake size={10} />
              Cold
            </span>
          )}
          {trailer.flag_note && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-danger bg-danger/15 border border-danger/30 rounded-full px-2 py-0.5">
              <Tag size={10} />
              Redtag
            </span>
          )}
        </div>

        {/* Trailer details */}
        <DetailRow label="Pickup #" value={trailer.pickup_number} />
        {trailer.origin && <DetailRow label="Origin" value={trailer.origin} />}
        {trailer.origin_sort_type && (
          <DetailRow label="Origin Sort" value={trailer.origin_sort_type} />
        )}
        {trailer.destination && <DetailRow label="Destination" value={trailer.destination} />}
        {trailer.destination_sort_type && (
          <DetailRow label="Destination Sort" value={trailer.destination_sort_type} />
        )}
        {trailer.load_percentage != null && (
          <DetailRow label="Load %" value={`${trailer.load_percentage}%`} />
        )}
        {isDeparted && trailer.assigned_driver_name && (
          <DetailRow
            label="Departed by"
            value={
              trailer.departed_by_admin
                ? `${trailer.assigned_driver_name} (admin)`
                : trailer.assigned_driver_name
            }
          />
        )}

        {/* Flag note */}
        {trailer.flag_note && (
          <div className="bg-danger/10 border border-danger/30 rounded-card px-3 py-3 mt-3">
            <p className="text-xs uppercase tracking-wide text-danger mb-1 font-semibold">
              Redtag
            </p>
            <p className="text-sm text-yard-text">{trailer.flag_note}</p>
          </div>
        )}

        {/* Admin notes section */}
        <div className="border-t border-yard-border pt-4 mt-4">
          <h3 className="text-xs uppercase tracking-wide text-yard-muted mb-3 font-semibold">
            Admin Notes
          </h3>

          {notes.length > 0 && (
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="bg-yard-panel border border-yard-border rounded-card px-3 py-2"
                >
                  <p className="text-sm text-yard-text">{note.note_text}</p>
                  <p className="text-xs text-yard-faint mt-1">
                    {note.creator_name} · {formatRelativeTime(note.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2 rounded-card bg-yard-bg border border-yard-border focus:border-amber outline-none text-sm resize-none"
            />
            <Button
              onClick={handleAddNote}
              loading={savingNote}
              disabled={!newNote.trim()}
              size="md"
              className="w-full"
            >
              Add Note
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
