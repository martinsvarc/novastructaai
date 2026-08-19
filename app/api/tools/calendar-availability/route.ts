import { NextRequest, NextResponse } from "next/server";
import { getGhlFreeSlots } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { calendarId, timezone } = body;

    if (!calendarId) {
      return NextResponse.json({
        message: "Calendar not configured. Ask the lead what day and time works best and proceed with booking.",
      });
    }

    const data = await getGhlFreeSlots(calendarId, timezone || "America/New_York", 7);

    // Flatten slots into a readable list
    const allSlots: string[] = [];
    for (const [, dayData] of Object.entries(data)) {
      if (dayData && dayData.slots) {
        for (const slot of dayData.slots) {
          // Format: "Monday Oct 28 at 10:00 AM"
          const d = new Date(slot);
          const formatted = d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            timeZone: timezone || "America/New_York",
          }) + " at " + d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: timezone || "America/New_York",
          });
          allSlots.push(formatted);
        }
      }
    }

    if (allSlots.length === 0) {
      return NextResponse.json({
        message: "No available times found this week. Ask the lead what day and time works best and we will confirm manually.",
      });
    }

    // Show up to 6 slots to keep it conversational
    const display = allSlots.slice(0, 6);
    const slotList = display.length === 1
      ? display[0]
      : display.slice(0, -1).join(", ") + ", or " + display[display.length - 1];

    return NextResponse.json({
      message: `Available times: ${slotList}. Which works best for you?`,
      slots: allSlots.slice(0, 6),
      rawSlots: Object.entries(data).flatMap(([, d]) => d?.slots || []).slice(0, 6),
    });
  } catch (error) {
    console.error("Calendar availability error:", error);
    return NextResponse.json({
      message: "Could not fetch available times. Ask the lead what day and time works best and proceed with booking.",
    });
  }
}
