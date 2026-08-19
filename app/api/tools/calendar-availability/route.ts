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
    // Only fetch 2 days of slots (today + tomorrow)
    const data = await getGhlFreeSlots(calendarId, tz, 2);

    const earliestAllowed = Date.now() + minHoursAhead * 60 * 60 * 1000;

    // Collect all raw slot ISO strings, filtered by min hours ahead
    const rawSlots: string[] = [];
    for (const [, dayData] of Object.entries(data)) {
      if (dayData && dayData.slots) {
        for (const slot of dayData.slots) {
          const slotTime = new Date(slot).getTime();
          if (slotTime >= earliestAllowed) {
            rawSlots.push(slot);
          }
        }
      }
    }

    if (rawSlots.length === 0) {
      return NextResponse.json({
        message: "No available times found today or tomorrow. Ask the lead what day and time works best and we will confirm manually.",
      });
    }

    // Pick 2 slots to present — one from morning, one from afternoon if possible
    const morningSlots: string[] = [];
    const afternoonSlots: string[] = [];
    for (const slot of rawSlots) {
      const d = new Date(slot);
      const hour = parseInt(d.toLocaleTimeString("en-US", { hour: "numeric", hour12: false, timeZone: tz }), 10);
      if (hour < 12) {
        morningSlots.push(slot);
      } else {
        afternoonSlots.push(slot);
      }
    }

    // Select 2 representative slots
    const selected: string[] = [];
    if (morningSlots.length > 0) selected.push(morningSlots[0]);
    if (afternoonSlots.length > 0) selected.push(afternoonSlots[0]);
    // If we only have one category, grab a second from the same
    if (selected.length < 2) {
      const pool = morningSlots.length > 0 ? morningSlots : afternoonSlots;
      if (pool.length > 1) selected.push(pool[1]);
    }

    // Format the selected slots as readable strings
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
