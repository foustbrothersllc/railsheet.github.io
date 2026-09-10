// "staged" = part of an upcoming/numbered train, staged separately from the
// active At Rail list until an admin promotes it (or it auto-promotes once
// At Rail empties out). Invisible to drivers the same way "departed" trailers
// simply aren't in their list — see hooks/useTrailers.ts.
export type TrailerStatus = "at_rail" | "departed" | "staged";

export interface Trailer {
  id: string;
  equipment_number: string;
  pickup_number: string;
  origin: string | null;
  origin_sort_type: string | null;
  destination: string | null;
  destination_sort_type: string | null;
  load_percentage: number | null;
  flag_note: string | null;
  flag_created_by: string | null;
  flag_created_at: string | null;
  is_hot: boolean;
  is_cold: boolean;
  // Auto-set by the database only when a trailer is first created (never on
  // re-import) when destination isn't GRENC. Behaves like is_cold everywhere
  // in the UI (hidden from drivers, shows in the Cold section) but is a
  // separate column so it never gets caught by the "release all cold
  // trailers when the lot empties out" logic that's specific to is_cold.
  is_wrong_dest: boolean;
  // Optional — most CSVs won't have this column, and that's fine. When present
  // and the trailer is being newly created, the database auto-marks it Hot if
  // this date is before today. Stored as an ISO date string ("YYYY-MM-DD").
  due_date: string | null;
  // Which numbered train a staged trailer belongs to (e.g. "42"). Set by the
  // admin at import time; the database uses it to decide a brand-new row's
  // status (see supabase_migration_staged_trains.sql). Sticks around after
  // promotion to At Rail just as a record of where it came from — nothing
  // reads it once a trailer is no longer staged.
  train_number: string | null;
  assigned_to_id: string | null;
  assigned_driver_name: string | null;
  assigned_driver_emp_id: string | null;
  status: TrailerStatus;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  is_approved: boolean;
  is_admin: boolean;
  created_at: string;
}

export interface PresenceState {
  user_id: string;
  first_name: string;
  last_name: string;
  online_at: string;
}

export interface SignupProblem {
  id: string;
  name: string;
  email: string;
  employee_id: string | null;
  message: string;
  resolved: boolean;
  created_at: string;
}

// Row shape coming out of an uploaded CSV/XLSX before it's cleaned and mapped.
export type RawImportRow = Record<string, string | number | null>;

export interface ParsedTrailerRow {
  row_index: number;
  equipment_number: string | null;
  pickup_number: string | null;
  origin: string | null;
  origin_sort_type: string | null;
  destination: string | null;
  destination_sort_type: string | null;
  load_percentage: number | null;
  due_date: string | null;
  issues: string[];
}
