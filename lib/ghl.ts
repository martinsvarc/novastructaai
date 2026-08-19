import { getDb } from "./db";

const GHL_API = "https://services.leadconnectorhq.com";
const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || "";
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET || "";

interface TokenData {
  ghl_access_token: string;
  ghl_refresh_token: string;
  ghl_token_expires_at: string;
  ghl_location_id: string;
}

/**
 * Get a valid GHL access token, auto-refreshing if expired.
 * Uses a simple DB-level check to avoid race conditions.
 */
export async function getGhlToken(): Promise<{ accessToken: string; locationId: string } | null> {
  const sql = getDb();
  const rows = await sql`SELECT ghl_access_token, ghl_refresh_token, ghl_token_expires_at, ghl_location_id FROM settings WHERE id = 1`;
  if (rows.length === 0) return null;

  const { ghl_access_token, ghl_refresh_token, ghl_token_expires_at, ghl_location_id } = rows[0] as TokenData;

  if (!ghl_access_token || !ghl_refresh_token) return null;

  // Check if token expires within the next 5 minutes
  const expiresAt = new Date(ghl_token_expires_at).getTime();
  const buffer = 5 * 60 * 1000;

  if (Date.now() < expiresAt - buffer) {
    return { accessToken: ghl_access_token, locationId: ghl_location_id };
  }

  // Token expired or about to expire — refresh it
  console.log("GHL token expired, refreshing...");
  const refreshed = await refreshGhlToken(ghl_refresh_token);
  if (!refreshed) return null;

  return { accessToken: refreshed.access_token, locationId: ghl_location_id || refreshed.locationId };
}

async function refreshGhlToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; locationId: string } | null> {
  try {
    const res = await fetch(GHL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GHL_CLIENT_ID,
        client_secret: GHL_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      console.error("GHL token refresh failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 86399) * 1000).toISOString();

    // Store new tokens
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

    console.log("GHL token refreshed successfully, expires:", expiresAt);
    return { access_token: data.access_token, refresh_token: data.refresh_token, locationId: data.locationId || "" };
  } catch (err) {
    console.error("GHL token refresh error:", err);
    return null;
  }
}

/**
 * Get available calendars for the connected GHL location
 */
export async function getGhlCalendars(): Promise<{ id: string; name: string }[]> {
  const token = await getGhlToken();
  if (!token) return [];

  try {
    const res = await fetch(`${GHL_API}/calendars/?locationId=${token.locationId}`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Version: "2021-04-15",
      },
    });

    if (!res.ok) {
      console.error("GHL get calendars failed:", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    return (data.calendars || []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
  } catch (err) {
    console.error("GHL get calendars error:", err);
    return [];
  }
}

/**
 * Get free slots for a calendar in the next N days
 */
export async function getGhlFreeSlots(calendarId: string, timezone: string = "America/New_York", days: number = 7): Promise<Record<string, { slots: string[] }>> {
  const token = await getGhlToken();
  if (!token) return {};

  const startDate = Date.now();
  const endDate = startDate + days * 24 * 60 * 60 * 1000;

  try {
    const params = new URLSearchParams({
      startDate: startDate.toString(),
      endDate: endDate.toString(),
      timezone,
    });

    const res = await fetch(`${GHL_API}/calendars/${calendarId}/free-slots?${params}`, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Version: "2021-04-15",
      },
    });

    if (!res.ok) {
      console.error("GHL get slots failed:", res.status, await res.text());
      return {};
    }

    return await res.json();
  } catch (err) {
    console.error("GHL get slots error:", err);
    return {};
  }
}

/**
 * Book an appointment on a GHL calendar
 */
export async function bookGhlAppointment(opts: {
  calendarId: string;
  contactId: string;
  startTime: string;
  title?: string;
}): Promise<{ success: boolean; appointmentId?: string; error?: string }> {
  const token = await getGhlToken();
  if (!token) return { success: false, error: "GHL not connected" };

  try {
    const res = await fetch(`${GHL_API}/calendars/events/appointments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        Version: "2021-04-15",
      },
      body: JSON.stringify({
        calendarId: opts.calendarId,
        locationId: token.locationId,
        contactId: opts.contactId,
        startTime: opts.startTime,
        title: opts.title || "AI-Booked Consultation",
        appointmentStatus: "new",
        toNotify: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("GHL book appointment failed:", res.status, errText);
      return { success: false, error: errText };
    }

    const data = await res.json();
    return { success: true, appointmentId: data.id };
  } catch (err) {
    console.error("GHL book appointment error:", err);
    return { success: false, error: String(err) };
  }
}
