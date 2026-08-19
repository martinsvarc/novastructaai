import { NextRequest, NextResponse } from "next/server";
import { bookGhlAppointment, upsertGhlContact } from "@/lib/ghl";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { calendarId, contactId: rawContactId, selectedSlot, leadName, phone } = body;

    if (!calendarId || !selectedSlot) {
      return NextResponse.json({
        success: false,
        message: "Missing calendar or time slot. Ask the lead to confirm a time and try again.",
      });
    }

    // Resolve a real GHL contactId — upsert by phone (finds existing or creates new)
    let contactId = rawContactId;
    if (!contactId || contactId === "unknown") {
      if (phone) {
        const upserted = await upsertGhlContact(phone, leadName);
        if (upserted) {
          contactId = upserted.contactId;
        } else {
          console.error("Could not upsert GHL contact for", phone);
          return NextResponse.json({
            success: false,
            message: "Could not create a contact record. Let the lead know we'll confirm their time manually and someone will reach out.",
          });
        }
      } else {
        return NextResponse.json({
          success: false,
          message: "No phone number available to look up contact. Let the lead know we'll confirm their time manually and someone will reach out.",
        });
      }
    }

    // Ensure startTime is ISO format
    let startTime = selectedSlot;
    if (!selectedSlot.includes("T")) {
      const parsed = new Date(selectedSlot);
      if (!isNaN(parsed.getTime())) {
        startTime = parsed.toISOString();
      }
    }

    const result = await bookGhlAppointment({
      calendarId,
      contactId,
      startTime,
      title: leadName ? `Consultation — ${leadName}` : "AI-Booked Consultation",
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: "Appointment booked successfully. Confirm the time with the lead and wrap up the call warmly.",
      });
    }

    console.error("GHL book appointment error detail:", result.error);
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
