"use client";

import { Button } from "@/components/ui/Button";
import { Trailer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

// The subset of fields an import actually writes — same set CsvImportModal
// and PasteCSVModal already build their payload from, plus train_number
// when the batch is being staged as a numbered train.
export interface DuplicateIncoming {
  pickup_number: string | null;
  origin: string | null;
  origin_sort_type: string | null;
  destination: string | null;
  destination_sort_type: string | null;
  load_percentage: number | null;
  due_date: string | null;
  train_number: string | null;
}

export interface DuplicateRow {
  equipment_number: string;
  existing: Trailer;
  incoming: DuplicateIncoming;
}

export type ResolvedFields = DuplicateIncoming;

interface DuplicateResolutionPanelProps {
  duplicates: DuplicateRow[];
  // Only show the train_number comparison row when this batch is being
  // staged as a numbered train — for a plain "Add to At Rail" import,
  // train_number is always null and comparing it would just be noise.
  showTrainNumber: boolean;
  onCancel: () => void;
  onConfirm: (resolved: Record<string, ResolvedFields>) => void;
}

const FIELD_DEFS: { key: keyof DuplicateIncoming; label: string }[] = [
  { key: "pickup_number", label: "Pickup #" },
  { key: "origin", label: "Origin" },
  { key: "origin_sort_type", label: "Origin Sort" },
  { key: "destination", label: "Destination" },
  { key: "destination_sort_type", label: "Destination Sort" },
  { key: "load_percentage", label: "Load %" },
  { key: "due_date", label: "Due Date" },
  { key: "train_number", label: "Train #" },
];

function displayVal(v: string | number | null): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function DuplicateResolutionPanel({
  duplicates,
  showTrainNumber,
  onCancel,
  onConfirm,
}: DuplicateResolutionPanelProps) {
  // Keyed by equipment_number. Defaults to the incoming (freshly imported)
  // values — admin can click "Use existing" per field, or just type over
  // either one directly. Whatever's in this state when they confirm is
  // exactly what gets written.
  const [resolved, setResolved] = useState<Record<string, ResolvedFields>>(() => {
    const init: Record<string, ResolvedFields> = {};
    duplicates.forEach((d) => {
      init[d.equipment_number] = { ...d.incoming };
    });
    return init;
  });

  function setField(
    equipmentNumber: string,
    key: keyof DuplicateIncoming,
    value: string | number | null
  ) {
    const str = value === null || value === undefined ? "" : String(value);
    setResolved((current) => ({
      ...current,
      [equipmentNumber]: {
        ...current[equipmentNumber],
        [key]: key === "load_percentage" ? (str === "" ? null : Number(str)) : str || null,
      },
    }));
  }

  const fields = showTrainNumber ? FIELD_DEFS : FIELD_DEFS.filter((f) => f.key !== "train_number");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-amber font-semibold">
          {duplicates.length} equipment number{duplicates.length === 1 ? "" : "s"} already
          {duplicates.length === 1 ? " exists" : " exist"} in the system
        </p>
        <p className="text-xs text-yard-muted mt-1">
          Pick which value to keep for each field, or type your own. Nothing is saved until you
          continue.
        </p>
      </div>

      <div className="space-y-4 max-h-[28rem] overflow-y-auto scrollbar-hidden pr-1">
        {duplicates.map((d) => {
          const current = resolved[d.equipment_number];
          return (
            <div
              key={d.equipment_number}
              className="rounded-card border border-amber/30 bg-amber/5 p-3 space-y-2.5"
            >
              <p className="font-stencil font-bold text-sm tracking-wide text-yard-text">
                {d.equipment_number}
              </p>
              <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-2 items-center text-xs">
                <span />
                <span className="text-yard-faint uppercase tracking-wide">Existing</span>
                <span className="text-yard-faint uppercase tracking-wide">Imported</span>
                <span className="text-yard-faint uppercase tracking-wide">Keep</span>
                {fields.map(({ key, label }) => {
                  const existingVal =
                    key === "train_number"
                      ? d.existing.train_number
                      : (d.existing as any)[key];
                  const incomingVal = d.incoming[key];
                  return (
                    <div key={key} className="contents">
                      <span className="text-yard-muted">{label}</span>
                      <button
                        type="button"
                        onClick={() => setField(d.equipment_number, key, existingVal ?? "")}
                        className={cn(
                          "text-left px-2 py-1.5 rounded-md border truncate",
                          String(current[key] ?? "") === String(existingVal ?? "")
                            ? "border-okay bg-okay/10 text-yard-text"
                            : "border-yard-border text-yard-muted hover:border-yard-borderLight"
                        )}
                        title={displayVal(existingVal)}
                      >
                        {displayVal(existingVal)}
                      </button>
                      <button
                        type="button"
                        onClick={() => setField(d.equipment_number, key, incomingVal ?? "")}
                        className={cn(
                          "text-left px-2 py-1.5 rounded-md border truncate",
                          String(current[key] ?? "") === String(incomingVal ?? "")
                            ? "border-okay bg-okay/10 text-yard-text"
                            : "border-yard-border text-yard-muted hover:border-yard-borderLight"
                        )}
                        title={displayVal(incomingVal)}
                      >
                        {displayVal(incomingVal)}
                      </button>
                      <input
                        value={current[key] ?? ""}
                        onChange={(e) => setField(d.equipment_number, key, e.target.value)}
                        className="h-8 px-2 rounded-md bg-yard-bg border border-yard-border text-xs focus:border-amber outline-none"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          Back
        </Button>
        <Button className="flex-1" onClick={() => onConfirm(resolved)}>
          Continue Import
        </Button>
      </div>
    </div>
  );
}
