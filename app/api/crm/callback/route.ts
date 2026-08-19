import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";

const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || "";
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET || "";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/settings?ghl=error&reason=no_code`);
  }

  try {
    await runMigrations();
    const redirectUri = `${APP_URL}/api/crm/callback`;

    const res = await fetch("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("GHL token exchange failed:", res.status, errText);
      return NextResponse.redirect(`${APP_URL}/settings?ghl=error&reason=token_exchange`);
    }

    const data = await res.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 86399) * 1000).toISOString();

    const sql = getDb();
    await sql`
      UPDATE settings SET
        ghl_access_token = ${data.access_token},
        ghl_refresh_token = ${data.refresh_token},
        ghl_token_expires_at = ${expiresAt},
        ghl_location_id = ${data.locationId || ""},
        updated_at = NOW()
      WHERE id = 1
    `;

    console.log("GHL OAuth connected successfully. Location:", data.locationId);
    return NextResponse.redirect(`${APP_URL}/settings?ghl=connected`);
  } catch (err) {
    console.error("GHL callback error:", err);
    return NextResponse.redirect(`${APP_URL}/settings?ghl=error&reason=exception`);
  }
}
