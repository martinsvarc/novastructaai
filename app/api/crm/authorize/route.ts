import { NextResponse } from "next/server";

const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || "";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export async function GET() {
  if (!GHL_CLIENT_ID) {
    return NextResponse.json({ error: "GHL_CLIENT_ID not configured" }, { status: 500 });
  }

  const redirectUri = `${APP_URL}/api/crm/callback`;
  const scopes = [
    "calendars.readonly",
    "calendars.write",
    "calendars/events.readonly",
    "calendars/events.write",
    "contacts.readonly",
    "contacts.write",
    "locations/customFields.readonly",
    "opportunities.readonly",
  ].join(" ");

  const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${GHL_CLIENT_ID}&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(authUrl);
}
