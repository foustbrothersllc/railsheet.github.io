export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Uppercases and strips whitespace from equipment numbers, e.g. "emhu489025 " -> "EMHU489025" */
export function standardizeEquipmentNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** Live uppercase-as-you-type for free-text fields (pickup #, origin, sort types, etc.) */
export function upper(value: string): string {
  return value.toUpperCase();
}

/** Sorts equipment numbers: pure-numeric ones first (numerically), then alphanumeric (A-Z) */
export function compareEquipmentNumbers(a: string, b: string): number {
  const aNumeric = /^[0-9]+$/.test(a);
  const bNumeric = /^[0-9]+$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric && !bNumeric) return -1;
  if (!aNumeric && bNumeric) return 1;
  return a.localeCompare(b);
}

export function hoursSince(isoTimestamp: string): number {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60);
}

export function formatRelativeTime(isoTimestamp: string): string {
  const hrs = hoursSince(isoTimestamp);
  if (hrs < 1) {
    const mins = Math.max(1, Math.round(hrs * 60));
    return `${mins}m ago`;
  }
  if (hrs < 24) {
    return `${Math.round(hrs)}h ago`;
  }
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function initials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

// Distinct, deterministic colors for staged/numbered trains — the same
// train number always maps to the same color, so a trailer keeps
// identifying which train it came from even after it's promoted to At
// Rail. Picked to stay visually apart from the app's existing meaning-
// colors (amber = at rail, blue = departed, orange = hot, red = redtag).
const TRAIN_PALETTE = [
  "#9B6BFF", // violet
  "#2DD4BF", // teal
  "#F472B6", // pink
  "#A3E635", // lime
  "#E879F9", // fuchsia
  "#38BDF8", // sky
];

export function trainColor(trainNumber: string): string {
  let hash = 0;
  for (let i = 0; i < trainNumber.length; i++) {
    hash = (hash * 31 + trainNumber.charCodeAt(i)) >>> 0;
  }
  return TRAIN_PALETTE[hash % TRAIN_PALETTE.length];
}
