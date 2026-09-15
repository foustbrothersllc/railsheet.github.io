import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Verifies a 6-digit reset code and, if it's valid, immediately sets the
 * account's new password with it — this is the whole driver-facing side of
 * the code system: an admin hands them a code (Edit User > Generate Reset
 * Code), they never touch email at all.
 *
 * POST /api/verify-reset-code
 * Body: { code: string, password: string }
 * Returns: { valid: boolean, error?: string }
 *
 * The code is only marked used once the password update actually succeeds,
 * so a failed update (e.g. password too short) doesn't burn a one-time code.
 */
export async function POST(req: NextRequest) {
  try {
    const { code, password } = await req.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Missing code." }, { status: 400 });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Find the reset code
    const { data, error } = await admin
      .from("reset_codes")
      .select("*")
      .eq("code", code.trim())
      .single();

    if (error || !data) {
      return NextResponse.json({ valid: false, error: "Invalid code." }, { status: 200 });
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    if (now > expiresAt) {
      return NextResponse.json(
        { valid: false, error: "This code has expired." },
        { status: 200 }
      );
    }

    // Check if already used
    if (data.used_at) {
      return NextResponse.json(
        { valid: false, error: "This code has already been used." },
        { status: 200 }
      );
    }

    // Set the new password before marking the code used, so a failed update
    // leaves the code intact and reusable.
    const { error: updateError } = await admin.auth.admin.updateUserById(data.user_id, {
      password,
    });

    if (updateError) {
      console.error("verify-reset-code updateUserById error:", updateError);
      return NextResponse.json(
        { valid: false, error: updateError.message || "Could not set new password." },
        { status: 200 }
      );
    }

    await admin
      .from("reset_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.id);

    return NextResponse.json({ valid: true });
  } catch (err) {
    console.error("verify-reset-code error", err);
    return NextResponse.json({ error: "Failed to verify code." }, { status: 500 });
  }
}
