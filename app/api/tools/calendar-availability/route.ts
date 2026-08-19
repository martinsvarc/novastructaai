import { NextRequest, NextResponse } from "next/server";
import { getGhlFreeSlots } from "@/lib/ghl";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { calendarId, timezone } = body;

    if (!calendarId) {
      return NextResponse.json({
        message: "Calendar not configured. Ask the lead what day and time works best and proceed with booking.",
      });
    }

    // Get min hours ahead from settings
    const sql = getDb();
    const settingsRows = await sql`SELECT booking_min_hours_ahead FROM settings WHERE id = 1`;
    const minHoursAhead = settingsRows.length > 0 ? (settingsRows[0].booking_min_hours_ahead ?? 3) : 3;

    const tz = timezone || "America/New_York";
    // Fetch 2 days of slots (today + tomorrow)
    const data = await getGhlFreeSlots(calendarId, tz, 2);

    const earliestAllowed = Date.now() + minHoursAhead * 60 * 60 * 1000;

    // Collect all valid slots, filtered by min hours ahead
    const validSlots: string[] = [];
    for (const [, dayData] of Object.entries(data)) {
      if (dayData && dayData.slots) {
        for (const slot of dayData.slots) {
          if (new Date(slot).getTime() >= earliestAllowed) {
            validSlots.push(slot);
          }
        }
      }
    }

    // Sort chronologically — earliest first, always
    validSlots.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    if (validSlots.length === 0) {
      return NextResponse.json({
        message: "No available times found today or tomorrow. Ask the lead what day and time works best and we will confirm manually.",
      });
    }

    // Take the first 2 soonest slots
    const selected = validSlots.slice(0, 2);

    // Format as readable strings
    const formatted = selected.map((slot) => {
      const d = new Date(slot);
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: tz,
      }) + " at " + d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      });
    });

    const slotList = formatted.length === 1
      ? formatted[0]
      : formatted[0] + " or " + formatted[1];

    return NextResponse.json({
      message: `I have ${slotList} available. Which works better for you?`,
      slots: formatted,
      rawSlots: selected,
    });
  } catch (error) {
    console.error("Calendar availability error:", error);
    return NextResponse.json({
      message: "Could not fetch available times. Ask the lead what day and time works best and proceed with booking.",
    });
  }
}
