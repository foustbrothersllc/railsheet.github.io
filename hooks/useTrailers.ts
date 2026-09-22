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
//
// Nothing in here ever reloads the page. The only thing that happens on an
// update is that these lists are replaced in place, so open modals, search
// text, selections and scroll position are all left alone.
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

type Channel = ReturnType<ReturnType<typeof createClient>["channel"]>;

const listeners = new Set<Listener>();

let globalSubscription: Channel | null = null;
let subscribePromise: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

let globalAtRail: Trailer[] = [];
let globalCold: Trailer[] = [];
let globalDeparted: Trailer[] = [];
let globalStaged: Trailer[] = [];
let hasSnapshot = false;
let isLoading = false;
let debounceRef: ReturnType<typeof setTimeout> | null = null;

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

/** Closes the current channel without letting its CLOSED status trigger a retry. */
function teardown() {
  const ch = globalSubscription;
  // Nulled first: the status callback ignores any channel that is no longer
  // the current one, so the CLOSED that removeChannel triggers is a no-op.
  globalSubscription = null;
  subscribePromise = null;
  if (ch) void db().removeChannel(ch);
}

function scheduleRetry() {
  if (retryTimer) return;
  // 1s, 2s, 4s … capped at 30s, so a phone that lost signal in the yard keeps
  // trying without hammering the connection.
  const delay = Math.min(30_000, 1_000 * 2 ** retryAttempt);
  retryAttempt++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    teardown();
    void ensureSubscribed();
  }, delay);
}

/**
 * Opens the tab's realtime channel, once. Resolves as soon as the channel is
 * live OR has failed, so a caller never hangs waiting on a dead socket.
 *
 * On reaching SUBSCRIBED it takes a fresh snapshot. That is deliberate: a row
 * committed before the channel finished joining produces no event at all, so
 * without this the board would sit on pre-join data until some later, unrelated
 * change happened to arrive. Same reason it runs after a reconnect — events
 * that fired while the socket was down are gone.
 */
function ensureSubscribed(): Promise<void> {
  if (subscribePromise) return subscribePromise;

  subscribePromise = (async () => {
    // Realtime authorizes with whatever token the client holds at join time,
    // and an anonymous join has its postgres_changes events filtered out by
    // RLS. getSession() reads local storage, so this costs nothing.
    await db().auth.getSession();

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      const ch = db()
        .channel("trailer-changes-v3")
        .on("postgres_changes", { event: "*", schema: "public", table: "trailers" }, () => {
          if (debounceRef) clearTimeout(debounceRef);
          debounceRef = setTimeout(() => {
            void fetchTrailers();
          }, 500);
        });

      globalSubscription = ch;

      ch.subscribe((status: string) => {
        // A channel from a previous attempt that is still winding down.
        if (globalSubscription !== ch) return;

        if (status === "SUBSCRIBED") {
          retryAttempt = 0;
          done();
          void fetchTrailers();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn(`[rail-sheet] trailer realtime ${status} — reconnecting`);
          done();
          scheduleRetry();
        }
      });
    });
  })();

  return subscribePromise;
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
    // rather than showing an empty board while the fetch lands.
    if (hasSnapshot) {
      pushTo(listener);
      setLoading(false);
    }

    let cancelled = false;

    (async () => {
      if (!hasSnapshot && !isLoading) setLoadingAll(true);

      // Fetch and subscribe in parallel rather than waiting on the socket:
      // the Supabase project can be cold (see the keep-alive cron in
      // vercel.json) and a slow websocket join would otherwise hold up the
      // first paint. ensureSubscribed() takes its own snapshot once the
      // channel is actually live, which is what covers the join gap.
      void ensureSubscribed();
      await fetchTrailers();

      if (!cancelled) setLoadingAll(false);
    })();

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, [hideColdfromDrivers]);

  async function refresh() {
    if (debounceRef) clearTimeout(debounceRef);
    await fetchTrailers();
  }

  return { atRail, cold, departed, staged, loading, refresh };
}
