import { NextRequest, NextResponse } from "next/server";
import { getGhlFreeSlots } from "@/lib/ghl";
import { getDb } from "@/lib/db";

const MIN_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours minimum between offered slots

/**
 * Get the day label for a slot: "today", "tomorrow", or weekday name
 */
function getDayLabel(isoSlot: string, tz: string): string {
  const slotDate = new Date(isoSlot);
  const now = new Date();

  const slotDay = slotDate.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const todayDay = now.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = tomorrow.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });

  if (slotDay === todayDay) return "today";
  if (slotDay === tomorrowDay) return "tomorrow";
  return slotDate.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
}

/**
 * Get just the time portion: "7:30 PM"
 */
function getTime(isoSlot: string, tz: string): string {
  return new Date(isoSlot).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

/**
 * Pick 2 slots that are meaningfully different (at least 2 hours apart).
 * First slot = earliest available. Second slot = first one that's 2+ hours later.
 */
function pickSpreadSlots(validSlots: string[]): string[] {
  if (validSlots.length === 0) return [];
  if (validSlots.length === 1) return [validSlots[0]];

  const first = validSlots[0];
  const firstTime = new Date(first).getTime();

  // Find second slot that's at least 2 hours from the first
  for (let i = 1; i < validSlots.length; i++) {
    if (new Date(validSlots[i]).getTime() - firstTime >= MIN_GAP_MS) {
      return [first, validSlots[i]];
    }
  }

  // If no slot is 2h+ apart, pick first and last available
  return [first, validSlots[validSlots.length - 1]];
}

/**
 * Format 2 slots for natural voice output.
 * Same day: "today at 7:30 or 9:45 PM"
 * Different days: "today at 7:30 PM or tomorrow at 10 AM"
 */
function formatSlotsForVoice(slots: string[], tz: string): string {
  if (slots.length === 1) {
    return `${getDayLabel(slots[0], tz)} at ${getTime(slots[0], tz)}`;
  }

  const day1 = getDayLabel(slots[0], tz);
  const day2 = getDayLabel(slots[1], tz);
  const time1 = getTime(slots[0], tz);
  const time2 = getTime(slots[1], tz);

  if (day1 === day2) {
    // Same day — don't repeat day or AM/PM if same period
    // "today at 7:30 or 9:45 PM"
    const period1 = time1.slice(-2); // AM or PM
    const period2 = time2.slice(-2);
    if (period1 === period2) {
      // Same AM/PM — strip it from first time: "7:30 or 9:45 PM"
      const time1NoPeriod = time1.slice(0, -3);
      return `${day1} at ${time1NoPeriod} or ${time2}`;
    }
    return `${day1} at ${time1} or ${time2}`;
  }

  // Different days — full format for each
  return `${day1} at ${time1} or ${day2} at ${time2}`;
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
    // Fetch 5 days of slots for more spread options
    const data = await getGhlFreeSlots(calendarId, tz, 5);

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
        message: "No available times in the next few days. Ask the lead what day and time works best and we will confirm manually.",
      });
    }

    // Pick 2 slots that are meaningfully spread apart (2+ hours)
    const selected = pickSpreadSlots(validSlots);

    // Format conversationally for voice (no repetition)
    const voiceMessage = formatSlotsForVoice(selected, tz);

    return NextResponse.json({
      message: `I have ${voiceMessage} available. Which works better for you?`,
      rawSlots: selected,
      totalAvailable: validSlots.length,
      instruction: "If the lead wants a different time, call checkAvailability again — more slots exist beyond these two.",
    });
  } catch (error) {
    console.error("Calendar availability error:", error);
    return NextResponse.json({
      message: "Could not fetch available times. Ask the lead what day and time works best and proceed with booking.",
    });
  }
}
