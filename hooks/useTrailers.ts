import { createClient } from "@/lib/supabase/client";
import { Trailer } from "@/lib/types";
import { compareEquipmentNumbers } from "@/lib/utils";
import { useEffect, useState } from "react";

// Treated identically to is_cold everywhere a trailer is filtered/sorted: hidden
// from drivers, grouped into the same Cold bucket. is_wrong_dest is auto-set by
// the database when a trailer is first created (see supabase_migration_wrong_dest.sql)
// and never touched again automatically, so once it's cleared it stays cleared.
const isHiddenLikeCold = (t: Trailer) => t.is_cold || t.is_wrong_dest;

// One realtime subscription and one cached snapshot per browser tab, shared by
// every mounted useTrailers() caller. The board is the same data for everyone,
// so there's no reason for the admin view and the driver view to each open
// their own channel.
//
// Every mounted caller registers a Listener here and is unregistered on
// unmount, and realtime events push to ALL current listeners. This matters
// because an admin can switch between /admin and /dashboard without a page
// reload: the module state survives that navigation, so a subscription that
// fed only the component that happened to create it would leave the view
// they switched INTO frozen on a stale snapshot.
interface Listener {
  // Drivers never see Cold trailers; the admin board does. Each caller keeps
  // its own preference so one shared snapshot can serve both.
  hideCold: boolean;
  setAtRail: (t: Trailer[]) => void;
  setCold: (t: Trailer[]) => void;
  setDeparted: (t: Trailer[]) => void;
  setStaged: (t: Trailer[]) => void;
  setLoading: (v: boolean) => void;
}

const listeners = new Set<Listener>();

let globalSubscription: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
let globalAtRail: Trailer[] = [];
let globalCold: Trailer[] = [];
let globalDeparted: Trailer[] = [];
let globalStaged: Trailer[] = [];
let hasSnapshot = false;
let isLoading = false;
let debounceRef: NodeJS.Timeout | null = null;

// Lazily created so importing this module never touches browser APIs during SSR.
let client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!client) client = createClient();
  return client;
}

function pushTo(l: Listener) {
  l.setAtRail(globalAtRail);
  l.setCold(l.hideCold ? [] : globalCold);
  l.setDeparted(globalDeparted);
  l.setStaged(globalStaged);
}

function emit() {
  listeners.forEach(pushTo);
}

function setLoadingAll(v: boolean) {
  isLoading = v;
  listeners.forEach((l) => l.setLoading(v));
}

/**
 * Splits a fresh `trailers` fetch into the four lists the UI renders and
 * notifies every mounted caller. Each list is only replaced when its contents
 * actually changed, so unchanged lists keep their array identity and React
 * skips re-rendering those columns.
 */
function applySnapshot(trailers: Trailer[]) {
  const nextAtRail = trailers
    .filter((t) => t.status === "at_rail" && !isHiddenLikeCold(t))
    .sort((a, b) => {
      if (a.is_hot !== b.is_hot) return a.is_hot ? -1 : 1;
      return compareEquipmentNumbers(a.equipment_number, b.equipment_number);
    });

  const nextCold = trailers
    .filter((t) => isHiddenLikeCold(t) && t.status === "at_rail")
    .sort((a, b) => compareEquipmentNumbers(a.equipment_number, b.equipment_number));

  const nextDeparted = trailers
    .filter((t) => t.status === "departed" && !isHiddenLikeCold(t))
    .sort((a, b) => compareEquipmentNumbers(a.equipment_number, b.equipment_number));

  // Oldest first, so grouping by train_number downstream naturally puts
  // whichever train was staged first at the front — the one due to
  // auto-promote next when At Rail empties out.
  const nextStaged = trailers
    .filter((t) => t.status === "staged")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let changed = !hasSnapshot;

  if (JSON.stringify(nextAtRail) !== JSON.stringify(globalAtRail)) {
    globalAtRail = nextAtRail;
    changed = true;
  }
  if (JSON.stringify(nextCold) !== JSON.stringify(globalCold)) {
    globalCold = nextCold;
    changed = true;
  }
  if (JSON.stringify(nextDeparted) !== JSON.stringify(globalDeparted)) {
    globalDeparted = nextDeparted;
    changed = true;
  }
  if (JSON.stringify(nextStaged) !== JSON.stringify(globalStaged)) {
    globalStaged = nextStaged;
    changed = true;
  }

  hasSnapshot = true;
  if (changed) emit();
}

async function fetchTrailers() {
  const { data: trailers } = await db().from("trailers").select("*");
  if (trailers) applySnapshot(trailers as Trailer[]);
}

function subscribeToChanges() {
  if (globalSubscription) return;

  // Claimed before the await so two callers mounting in the same tick can't
  // both open a channel.
  globalSubscription = db()
    .channel("trailer-changes-v3")
    .on("postgres_changes", { event: "*", schema: "public", table: "trailers" }, () => {
      if (debounceRef) clearTimeout(debounceRef);
      debounceRef = setTimeout(() => {
        void fetchTrailers();
      }, 500);
    })
    .subscribe();
}

export function useTrailers(hideColdfromDrivers = true) {
  const [atRail, setAtRail] = useState<Trailer[]>(globalAtRail);
  const [cold, setCold] = useState<Trailer[]>(hideColdfromDrivers ? [] : globalCold);
  const [departed, setDeparted] = useState<Trailer[]>(globalDeparted);
  // status "staged" trailers (an upcoming/numbered train not yet promoted to At
  // Rail) are simply never returned to a driver-facing caller — unlike Cold,
  // which is data-hidden via hideColdfromDrivers, staged trailers are excluded
  // by status alone, so there's no separate flag to remember to check here.
  const [staged, setStaged] = useState<Trailer[]>(globalStaged);
  const [loading, setLoading] = useState(!hasSnapshot);

  useEffect(() => {
    const listener: Listener = {
      hideCold: hideColdfromDrivers,
      setAtRail,
      setCold,
      setDeparted,
      setStaged,
      setLoading,
    };
    listeners.add(listener);

    // Paint whatever this tab already has, so switching views is instant
    // rather than showing an empty board while the refetch lands.
    if (hasSnapshot) {
      pushTo(listener);
      setLoading(false);
    }

    // Make sure this tab has a live channel. On a view switch the channel from
    // the previous view is still open and is reused as-is.
    subscribeToChanges();

    if (!hasSnapshot) {
      if (!isLoading) {
        setLoadingAll(true);
        void fetchTrailers().finally(() => setLoadingAll(false));
      }
    } else {
      // We're showing a snapshot that could be as old as whenever the other
      // view loaded it, so refresh in the background.
      void fetchTrailers();
    }

    return () => {
      listeners.delete(listener);
    };
  }, [hideColdfromDrivers]);

  async function refresh() {
    if (debounceRef) clearTimeout(debounceRef);
    await fetchTrailers();
  }

  return { atRail, cold, departed, staged, loading, refresh };
}
