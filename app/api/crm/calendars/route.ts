import { NextResponse } from "next/server";
import { getGhlCalendars } from "@/lib/ghl";

export async function GET() {
  try {
    const calendars = await getGhlCalendars();
    return NextResponse.json(calendars);
  } catch (error) {
    console.error("GHL calendars error:", error);
    return NextResponse.json({ error: "Failed to fetch calendars" }, { status: 500 });
  }
}
