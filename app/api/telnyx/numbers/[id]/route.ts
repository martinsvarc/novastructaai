import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const sql = getDb();

    // Look up the channel to get telnyx_id
    const rows = await sql`SELECT * FROM channels WHERE id = ${Number(id)}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const channel = rows[0];
    const telnyxId = channel.telnyx_id;

    // Attempt to release the number from Telnyx (non-fatal if it fails)
    if (telnyxId && apiKey) {
      try {
        const deleteRes = await fetch(
          `https://api.telnyx.com/v2/phone_numbers/${telnyxId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!deleteRes.ok) {
          const errText = await deleteRes.text();
          console.error(`Telnyx number release failed (continuing): ${errText}`);
        }
      } catch (telnyxErr) {
        console.error("Telnyx delete request failed (continuing):", telnyxErr);
      }
    }

    // Always delete from DB even if Telnyx release failed
    await sql`DELETE FROM channels WHERE id = ${Number(id)}`;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Telnyx number delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete number" },
      { status: 500 }
    );
  }
}
