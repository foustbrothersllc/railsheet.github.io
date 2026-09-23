/**
 * Remembers which view an admin was last on, so landing on "/" sends them back
 * there instead of always dropping them on the admin board.
 *
 * A cookie rather than localStorage on purpose: the redirect in app/page.tsx
 * runs on the server, before any client JS exists. localStorage would mean
 * rendering the admin board first and then bouncing to the driver view, which
 * the user sees as a flash.
 *
 * Only admins ever write this. A driver has one view, and leaving their cookie
 * unset means that if they're promoted later they start on the admin board
 * rather than being dropped into driver view by a stale preference.
 */
export const VIEW_COOKIE = "rs_view";

export type SavedView = "admin" | "driver";

/** Client-side only; a no-op anywhere there's no document. */
export function rememberView(view: SavedView) {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  // A year. This is a convenience, not a security boundary — worst case
  // someone lands on the wrong one of their own two views and taps once.
  document.cookie = `${VIEW_COOKIE}=${view}; path=/; max-age=31536000; SameSite=Lax${secure}`;
}

/** Normalizes whatever is in the cookie; anything unexpected reads as unset. */
export function parseSavedView(value: string | undefined): SavedView | null {
  return value === "admin" || value === "driver" ? value : null;
}
