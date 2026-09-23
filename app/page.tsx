import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { VIEW_COOKIE, parseSavedView } from "@/lib/viewPreference";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_approved, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_approved) {
    redirect("/pending");
  }

  if (!profile.is_admin) {
    redirect("/dashboard");
  }

  // Admins get back whichever view they were last on. Each dashboard records
  // itself on mount, so this follows them regardless of how they got there —
  // the header buttons, the back button, a bookmark, or the installed app
  // opening at "/". Unset (or anything unexpected) means the admin board.
  const savedView = parseSavedView(cookies().get(VIEW_COOKIE)?.value);
  redirect(savedView === "driver" ? "/dashboard" : "/admin");
}
