import { NextRequest, NextResponse } from "next/server";
import { bookGhlAppointment } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { calendarId, contactId, selectedSlot, leadName } = body;

    if (!calendarId || !selectedSlot) {
      return NextResponse.json({
        success: false,
        message: "Missing calendar or time slot. Ask the lead to confirm a time and try again.",
      });
    }

    // selectedSlot could be an ISO string or a human-readable string
    // The AI should pass the raw ISO slot from the availability response
    let startTime = selectedSlot;

    // If it's not already ISO, try to parse it
    if (!selectedSlot.includes("T")) {
      const parsed = new Date(selectedSlot);
      if (!isNaN(parsed.getTime())) {
        startTime = parsed.toISOString();
      }
    }

    const result = await bookGhlAppointment({
      calendarId,
      contactId: contactId || "unknown",
      startTime,
      title: leadName ? `Consultation — ${leadName}` : "AI-Booked Consultation",
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Appointment booked successfully. Confirm the time with the lead and wrap up the call warmly.",
      });
    }

    return NextResponse.json({
      success: false,
      message: "Could not book the appointment right now. Let the lead know we'll confirm their time manually and someone will reach out. Then wrap up warmly.",
    });
  } catch (error) {
    console.error("Book appointment error:", error);
    return NextResponse.json({
      success: false,
      message: "Could not book the appointment right now. Let the lead know we'll confirm their time manually and someone will reach out. Then wrap up warmly.",
    });
  }
}
