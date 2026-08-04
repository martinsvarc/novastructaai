import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { calendarId, timezone } = body;
    const n8nUrl = process.env.N8N_CALENDAR_AVAILABILITY_URL;

    if (!n8nUrl) {
      return NextResponse.json({
        message:
          "Calendar availability is temporarily unavailable. Ask the lead what day and time works best and proceed with booking.",
      });
    }

    const res = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId, timezone }),
    });

    if (!res.ok) {
      console.error("N8N calendar-availability error:", await res.text());
      return NextResponse.json({
        message:
          "Could not fetch available times. Ask the lead what day and time works best and proceed with booking.",
      });
    }

    const data = await res.json();
    const slots: string[] = data.slots || [];

    if (slots.length === 0) {
      return NextResponse.json({
        message:
          "No available times found this week. Ask the lead what day and time works best and we will confirm manually.",
      });
    }

    const slotList =
      slots.length === 1
        ? slots[0]
        : slots.slice(0, -1).join(", ") + ", or " + slots[slots.length - 1];

    return NextResponse.json({
      message: `Available times: ${slotList}. Which works better for you?`,
    });
  } catch (error) {
    console.error("Calendar availability error:", error);
    return NextResponse.json({
      message:
        "Could not fetch available times. Ask the lead what day and time works best and proceed with booking.",
    });
  }
}
