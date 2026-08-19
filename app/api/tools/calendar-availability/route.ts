import { NextRequest, NextResponse } from "next/server";
import { getGhlFreeSlots } from "@/lib/ghl";
import { getDb } from "@/lib/db";

/**
 * Format a slot for voice — "today at 6 PM", "tomorrow at 10 AM", "Thursday at 2 PM"
 */
function formatSlotForVoice(isoSlot: string, tz: string): string {
  const slotDate = new Date(isoSlot);
  const now = new Date();

  // Get just the date parts in the target timezone
  const slotDay = slotDate.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const todayDay = now.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });

  // Calculate tomorrow
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = tomorrow.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });

  const time = slotDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });

  if (slotDay === todayDay) {
    return `today at ${time}`;
  } else if (slotDay === tomorrowDay) {
    return `tomorrow at ${time}`;
  } else {
    const weekday = slotDate.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
    return `${weekday} at ${time}`;
  }
}

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

    // Sort chronologically — earliest first
    validSlots.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    if (validSlots.length === 0) {
      return NextResponse.json({
        message: "No available times found today or tomorrow. Ask the lead what day and time works best and we will confirm manually.",
      });
    }

    // Take the first 2 soonest slots
    const selected = validSlots.slice(0, 2);

    // Format conversationally for voice
    const formatted = selected.map((slot) => formatSlotForVoice(slot, tz));

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
