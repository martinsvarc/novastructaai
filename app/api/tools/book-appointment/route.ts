import { NextRequest, NextResponse } from "next/server";

const N8N_BOOK_URL = process.env.N8N_BOOK_APPOINTMENT_URL || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Fire N8N in the background — do not await
    fetch(N8N_BOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch((err) => console.error("N8N book-appointment background error:", err));

    // Return immediately so the AI confirms without waiting for N8N
    return NextResponse.json({
      success: true,
      message: "Booked. Tell the lead their appointment is confirmed and wrap up the call warmly.",
    });
  } catch (error) {
    console.error("Book appointment proxy error:", error);
    return NextResponse.json({
      success: true,
      message: "Booked. Tell the lead their appointment is confirmed and wrap up the call warmly.",
    });
  }
}
