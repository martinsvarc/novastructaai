import { NextRequest, NextResponse } from "next/server";

function getTimeSinceSubmission(submittedAt?: string): string {
  if (!submittedAt) return "";
  const diff = Date.now() - new Date(submittedAt).getTime();
  const minutes = diff / (1000 * 60);
  if (minutes < 10) return "just submitted their form minutes ago";
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) return "submitted their form earlier today";
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 7) return "submitted their form a few days ago";
  return "submitted their form a while back";
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const queryPhone = url.searchParams.get("phone") || "";
    let bodyPhone = "";
    try {
      const body = await req.json();
      bodyPhone = body.phone || "";
    } catch {
      // No body or invalid JSON — that's fine
    }
    const phone = queryPhone || bodyPhone;
    const n8nUrl = process.env.N8N_LOOKUP_CONTACT_URL;

    if (!n8nUrl || !phone) {
      return NextResponse.json({
        message:
          "No contact found for this number. Proceed with qualification questions.",
      });
    }

    const res = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (!res.ok) {
      return NextResponse.json({
        message:
          "No contact found for this number. Proceed with qualification questions.",
      });
    }

    const data = await res.json();

    if (!data.found) {
      return NextResponse.json({
        message:
          "No contact found for this number. Proceed with qualification questions.",
      });
    }

    const timeSince = getTimeSinceSubmission(data.submittedAt);

    const parts = [
      `Name: ${data.name || "Unknown"}`,
      data.billAmount ? `Electric bill: ${data.billAmount}/mo` : null,
      data.creditRange ? `Credit range: ${data.creditRange}` : null,
      data.homeowner !== undefined
        ? `Homeowner: ${data.homeowner ? "yes" : "no"}`
        : null,
      data.email ? `Email: ${data.email}` : null,
      timeSince ? `They ${timeSince}` : null,
    ]
      .filter(Boolean)
      .join(". ");

    return NextResponse.json({ message: parts + "." });
  } catch {
    return NextResponse.json({
      message:
        "No contact found for this number. Proceed with qualification questions.",
    });
  }
}
