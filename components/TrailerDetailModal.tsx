"use client";

import { ConfirmModal } from "@/components/ConfirmModal";
import { BarcodeModal } from "@/components/BarcodeModal";
import { FlagTrailerModal } from "@/components/FlagTrailerModal";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { Profile, Trailer } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Flame, Tag, BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";

interface TrailerDetailModalProps {
  trailer: Trailer | null;
  profile: Profile;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-yard-border last:border-b-0">
      <span className="text-sm uppercase tracking-wide text-yard-muted">{label}</span>
      <span className="text-lg font-semibold text-yard-text text-right">{value}</span>
    </div>
  );
}

export function TrailerDetailModal({ trailer, profile, onClose }: TrailerDetailModalProps) {
  const supabase = createClient();
  const [confirming, setConfirming] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [showBarcode, setShowBarcode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState<string | null>(null);
  const [flagCreator, setFlagCreator] = useState<{ first_name: string; last_name: string } | null>(null);
  const [flagCreatedAt, setFlagCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (trailer) {
      setFlagNote(trailer.flag_note);
      setFlagCreatedAt(trailer.flag_created_at);
      
      // Fetch creator's name if flag exists
      if (trailer.flag_created_by) {
        fetchFlagCreator(trailer.flag_created_by);
      } else {
        setFlagCreator(null);
      }
    }
  }, [trailer]);

  async function fetchFlagCreator(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();

    if (data) {
      setFlagCreator(data);
    }
  }

  if (!trailer) return null;

  const canAccept = trailer.status === "at_rail";

  async function handleAccept() {
    if (!trailer) return;
    setAccepting(true);
    setError(null);

    const { error } = await supabase
      .from("trailers")
      .update({
        status: "departed",
        assigned_to_id: profile.id,
        assigned_driver_name: `${profile.first_name} ${profile.last_name}`,
        assigned_driver_emp_id: profile.employee_id,
        // This is a real pickup even when an admin does it from the driver
        // view, so it is never flagged as an admin close-out.
        departed_by_admin: false,
      })
      .eq("id", trailer.id)
      .eq("status", "at_rail");

    setAccepting(false);

    if (error) {
      setError("Could not accept — it may have just been taken by someone else.");
      return;
    }

    setConfirming(false);
    onClose();
  }

  return (
    <>
      <Modal
        open={!!trailer && !confirming && !flagging && !showBarcode}
        onClose={onClose}
        title={trailer.equipment_number}
        titleClassName="text-4xl"
        headerActions={
          <>
            <button
              onClick={() => setShowBarcode(true)}
              aria-label="Show barcode"
              title="Show Code128 barcode"
              className="h-9 w-9 flex items-center justify-center rounded-full text-yard-muted hover:text-amber hover:bg-amber/10"
            >
              <BarChart3 size={17} />
            </button>
            <button
              onClick={() => setFlagging(true)}
              aria-label="Redtag trailer"
              title={flagNote ? "View or update Redtag" : "Redtag trailer"}
              className={cn(
                "h-9 w-9 flex items-center justify-center rounded-full transition-colors",
                flagNote
                  ? "text-danger bg-danger/15 hover:bg-danger/25"
                  : "text-yard-muted hover:text-danger hover:bg-danger/10"
              )}
            >
              <Tag size={17} />
            </button>
          </>
        }
        footer={
          canAccept ? (
            <Button className="w-full" onClick={() => setConfirming(true)}>
              Accept Trailer
            </Button>
          ) : undefined
        }
      >
        <div>
          {trailer.is_hot && (
            <div className="bg-hot/10 border border-hot/30 rounded-card px-3 py-2.5 mb-3 flex items-center gap-2">
              <Flame size={14} className="text-hot shrink-0" />
              <p className="text-xs uppercase tracking-wide text-hot font-semibold">
                Hot — needs to come back ASAP
              </p>
            </div>
          )}
          {flagNote && (
            <div className="bg-danger/10 border border-danger/30 rounded-card px-3 py-2.5 mb-4">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-danger mb-1">
                <Tag size={12} />
                Redtag
              </p>
              <p className="text-sm text-yard-text mb-2">{flagNote}</p>
              {flagCreator && flagCreatedAt && (
                <p className="text-xs text-danger/80">
                  Tagged by {flagCreator.first_name} {flagCreator.last_name} · {formatRelativeTime(flagCreatedAt)}
                </p>
              )}
            </div>
          )}
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
          {trailer.status === "departed" && trailer.assigned_driver_name && (
            <DetailRow
              label="Departed by"
              value={
                trailer.departed_by_admin
                  ? `${trailer.assigned_driver_name} (admin)`
                  : trailer.assigned_driver_name
              }
            />
          )}
        </div>
        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-3 py-2 mt-3">
            {error}
          </p>
        )}
      </Modal>

      <BarcodeModal trailer={showBarcode ? trailer : null} onClose={() => setShowBarcode(false)} />

      <FlagTrailerModal
        trailer={flagging ? trailer : null}
        onClose={() => setFlagging(false)}
        onSaved={setFlagNote}
        allowClear={profile.is_admin}
      />

      <ConfirmModal
        open={confirming}
        title="Confirm"
        message={
          <div className="text-center">
            <p>You are taking trailer</p>
            <p className="text-3xl font-stencil font-bold text-amber mt-1.5 tracking-wider">
              {trailer.equipment_number}
            </p>
          </div>
        }
        onCancel={() => setConfirming(false)}
        onConfirm={handleAccept}
        loading={accepting}
      />
    </>
  );
}
