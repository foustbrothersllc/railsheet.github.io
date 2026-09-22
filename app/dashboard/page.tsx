import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (!profile.is_approved) redirect("/pending");
  // Admins are deliberately allowed through here: this is the "driver view"
  // they switch into from the admin header (useful on a phone, where the
  // admin board is too dense). The shield icon in the driver header
  // (components/NavShield.tsx) is how they get back to /admin. Note that "/"
  // still sends admins to /admin, so this only happens on purpose.

  return <DashboardClient initialProfile={profile} />;
}
