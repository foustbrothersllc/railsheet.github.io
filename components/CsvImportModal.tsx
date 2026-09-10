"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { parseSheetRows, recomputeIssues } from "@/lib/importParser";
import { ParsedTrailerRow, Trailer } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  DuplicateResolutionPanel,
  DuplicateRow,
  ResolvedFields,
} from "@/components/DuplicateResolutionPanel";
import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
}

type Stage = "upload" | "review" | "checking" | "duplicates" | "importing" | "done";

export function CsvImportModal({ open, onClose }: CsvImportModalProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState<ParsedTrailerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  // Where this batch goes: straight onto the live At Rail list (existing
  // behavior), or staged as a separate, not-yet-promoted numbered train so it
  // doesn't mix in with what's currently at rail.
  const [importMode, setImportMode] = useState<"at_rail" | "train">("at_rail");
  const [trainNumber, setTrainNumber] = useState("");
  // Rows whose equipment number already exists in the database — held here
  // while the duplicate-resolution panel is shown, alongside the rows that
  // are genuinely new and can go straight into the write.
  const [duplicates, setDuplicates] = useState<DuplicateRow[]>([]);
  const [freshRows, setFreshRows] = useState<ParsedTrailerRow[]>([]);

  function reset() {
    setStage("upload");
    setRows([]);
    setError(null);
    setImportedCount(0);
    setImportMode("at_rail");
    setTrainNumber("");
    setDuplicates([]);
    setFreshRows([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: null,
        raw: true,
      });

      if (raw.length === 0) {
        setError("That file doesn't have any rows in it.");
        return;
      }

      const parsed = parseSheetRows(raw);
      if (parsed.length === 0) {
        setError("Couldn't find any data rows in that file.");
        return;
      }

      setRows(parsed);
      setStage("review");
    } catch (err) {
      console.error(err);
      setError("Couldn't read that file. Make sure it's a .csv or .xlsx.");
    }
  }

  function updateRow(rowIndex: number, patch: Partial<ParsedTrailerRow>) {
    setRows((current) => {
      const updated = current.map((r) =>
        r.row_index === rowIndex ? { ...r, ...patch } : r
      );
      return recomputeIssues(updated);
    });
  }

  // Deliberately omit status/assignment/flag/hot fields here. On INSERT
  // (brand-new equipment number) they fall back to the table's defaults
  // (status = 'at_rail', everything else null/false) — exactly right for
  // a new trailer. On UPDATE (equipment number already exists), leaving
  // them out means they're never touched, so re-importing the same file
  // never bounces an already-Departed trailer back to At Rail.
  function rowToPayload(r: ParsedTrailerRow) {
    return {
      equipment_number: r.equipment_number!,
      pickup_number: r.pickup_number!,
      origin: r.origin || null,
      origin_sort_type: r.origin_sort_type || null,
      destination: r.destination || null,
      destination_sort_type: r.destination_sort_type || null,
      load_percentage: r.load_percentage,
      due_date: r.due_date,
      // A train number is optional here — the batch can be "Numbered" with
      // no actual number and just shows as a generic "Staged Train" on the
      // dashboard. Left null for "at_rail" mode so a re-import never
      // accidentally re-stages an already-live trailer.
      train_number: importMode === "train" ? trainNumber.trim() || null : null,
      // Explicitly staged on brand-new rows only — this key is never
      // included for duplicates (see writeImport), so re-importing an
      // existing equipment number never bounces its status around.
      ...(importMode === "train" ? { status: "staged" as const } : {}),
    };
  }

  async function handleImport() {
    setStage("checking");
    const cleanRows = rows.filter((r) => r.issues.length === 0);
    const equipNums = cleanRows.map((r) => r.equipment_number!);

    const { data: existing, error: lookupError } = await supabase
      .from("trailers")
      .select("*")
      .in("equipment_number", equipNums);

    if (lookupError) {
      setError(lookupError.message);
      setStage("review");
      return;
    }

    const existingByEquip = new Map<string, Trailer>(
      (existing ?? []).map((t: Trailer) => [t.equipment_number, t])
    );

    const dups: DuplicateRow[] = [];
    const fresh: ParsedTrailerRow[] = [];
    for (const r of cleanRows) {
      const match = existingByEquip.get(r.equipment_number!);
      if (match) {
        const p = rowToPayload(r);
        dups.push({
          equipment_number: r.equipment_number!,
          existing: match,
          incoming: {
            pickup_number: p.pickup_number,
            origin: p.origin,
            origin_sort_type: p.origin_sort_type,
            destination: p.destination,
            destination_sort_type: p.destination_sort_type,
            load_percentage: p.load_percentage,
            due_date: p.due_date,
            train_number: p.train_number,
          },
        });
      } else {
        fresh.push(r);
      }
    }

    if (dups.length > 0) {
      setDuplicates(dups);
      setFreshRows(fresh);
      setStage("duplicates");
      return;
    }

    await writeImport(fresh.map(rowToPayload), {});
  }

  async function writeImport(
    freshPayload: ReturnType<typeof rowToPayload>[],
    resolvedByEquip: Record<string, ResolvedFields>
  ) {
    setStage("importing");

    const resolvedPayload = Object.entries(resolvedByEquip).map(([equipment_number, r]) => ({
      equipment_number,
      pickup_number: r.pickup_number ?? "",
      origin: r.origin,
      origin_sort_type: r.origin_sort_type,
      destination: r.destination,
      destination_sort_type: r.destination_sort_type,
      load_percentage: r.load_percentage,
      due_date: r.due_date,
      train_number: r.train_number,
    }));

    const payload = [...freshPayload, ...resolvedPayload];

    const { error } = await supabase
      .from("trailers")
      .upsert(payload, { onConflict: "equipment_number", ignoreDuplicates: false });

    if (error) {
      setError(error.message);
      setStage(duplicates.length > 0 ? "duplicates" : "review");
      return;
    }

    setImportedCount(payload.length);
    setStage("done");
  }

  const validRows = rows.filter((r) => r.issues.length === 0);
  const problemRows = rows.filter((r) => r.issues.length > 0);

  return (
    <Modal open={open} onClose={handleClose} title="Import Equipment">
      {stage === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed py-12 cursor-pointer transition-colors",
            dragOver ? "border-amber bg-amber/5" : "border-yard-border hover:border-yard-borderLight"
          )}
        >
          <UploadCloud size={28} className="text-yard-faint" />
          <p className="text-sm text-yard-muted text-center px-6">
            Drag a .csv or .xlsx file here, or tap to browse
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {error && (
            <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-3 py-2 mx-6">
              {error}
            </p>
          )}
        </div>
      )}

      {stage === "review" && (
        <div className="space-y-5">
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-okay">
              <CheckCircle2 size={16} /> {validRows.length} ready
            </span>
            <span className="flex items-center gap-1.5 text-amber">
              <AlertTriangle size={16} /> {problemRows.length} need attention
            </span>
          </div>

          {problemRows.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-amber mb-2">Problem Rows</p>
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hidden">
                {problemRows.map((r) => (
                  <div
                    key={r.row_index}
                    className="bg-amber/5 border border-amber/25 rounded-card p-3 space-y-2"
                  >
                    <p className="text-xs text-amber">
                      Row {r.row_index + 1}: {r.issues.join(", ")}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["equipment_number", "Equipment #"],
                          ["pickup_number", "Pickup #"],
                          ["origin", "Origin"],
                          ["origin_sort_type", "Origin Sort"],
                          ["destination", "Destination"],
                          ["destination_sort_type", "Destination Sort"],
                        ] as const
                      ).map(([key, label]) => (
                        <input
                          key={key}
                          value={r[key] ?? ""}
                          onChange={(e) => updateRow(r.row_index, { [key]: e.target.value })}
                          placeholder={label}
                          className="h-9 px-2.5 rounded-md bg-yard-bg border border-yard-border text-xs focus:border-amber outline-none"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {validRows.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-okay mb-2">
                Ready to Import
              </p>
              <div className="max-h-40 overflow-y-auto scrollbar-hidden space-y-1">
                {validRows.map((r) => (
                  <div
                    key={r.row_index}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md bg-okay/5"
                  >
                    <span className="font-stencil font-semibold">{r.equipment_number}</span>
                    <span className="text-yard-faint">{r.destination}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-card px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-2 rounded-card border border-yard-border p-3">
            <p className="text-xs uppercase tracking-wide text-yard-muted">Import As</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setImportMode("at_rail")}
                className={cn(
                  "flex-1 h-9 rounded-card border text-xs font-semibold",
                  importMode === "at_rail"
                    ? "bg-amber/15 border-amber text-amber"
                    : "bg-yard-bg border-yard-border text-yard-muted hover:border-yard-borderLight"
                )}
              >
                Add to At Rail
              </button>
              <button
                type="button"
                onClick={() => setImportMode("train")}
                className={cn(
                  "flex-1 h-9 rounded-card border text-xs font-semibold",
                  importMode === "train"
                    ? "bg-train/15 border-train text-train"
                    : "bg-yard-bg border-yard-border text-yard-muted hover:border-yard-borderLight"
                )}
              >
                Number This Train
              </button>
            </div>
            {importMode === "train" && (
              <input
                value={trainNumber}
                onChange={(e) => setTrainNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && validRows.length > 0) {
                    e.preventDefault();
                    handleImport();
                  }
                }}
                placeholder="Train Number"
                className="w-full h-9 px-2.5 rounded-md bg-yard-bg border border-yard-border text-sm focus:border-train outline-none"
              />
            )}
          </div>

          <Button className="w-full" disabled={validRows.length === 0} onClick={handleImport}>
            {importMode === "train"
              ? trainNumber.trim()
                ? `Stage Train ${trainNumber.trim()} (${validRows.length})`
                : `Stage Train (${validRows.length})`
              : `Fix & Import (${validRows.length})`}
          </Button>
        </div>
      )}

      {stage === "checking" && (
        <div className="py-12 text-center">
          <div className="h-8 w-8 mx-auto rounded-full border-2 border-amber border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-yard-muted">Checking for existing equipment…</p>
        </div>
      )}

      {stage === "duplicates" && (
        <DuplicateResolutionPanel
          duplicates={duplicates}
          showTrainNumber={importMode === "train"}
          onCancel={() => setStage("review")}
          onConfirm={(resolved) => writeImport(freshRows.map(rowToPayload), resolved)}
        />
      )}

      {stage === "importing" && (
        <div className="py-12 text-center">
          <div className="h-8 w-8 mx-auto rounded-full border-2 border-amber border-t-transparent animate-spin mb-4" />
          <p className="text-sm text-yard-muted">Writing to the yard board…</p>
        </div>
      )}

      {stage === "done" && (
        <div className="py-10 text-center space-y-4">
          <CheckCircle2 size={32} className="mx-auto text-okay" />
          <p className="text-sm text-yard-text">
            Imported {importedCount} trailer{importedCount === 1 ? "" : "s"}.
          </p>
          <Button onClick={handleClose} className="w-full">
            Done
          </Button>
        </div>
      )}
    </Modal>
  );
}
