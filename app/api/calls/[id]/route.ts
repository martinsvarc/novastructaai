import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sql = getDb();

    const fields: string[] = [];
    const allowed = ["lead_name", "outcome", "outcome_sub", "short_summary", "oneliner"];

    for (const key of allowed) {
      if (key in body) {
        fields.push(key);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    // Build update dynamically
    if (body.lead_name !== undefined) {
      await sql`UPDATE calls SET lead_name = ${body.lead_name} WHERE id = ${id}`;
    }
    if (body.outcome !== undefined) {
      await sql`UPDATE calls SET outcome = ${body.outcome} WHERE id = ${id}`;
    }
    if (body.outcome_sub !== undefined) {
      await sql`UPDATE calls SET outcome_sub = ${body.outcome_sub} WHERE id = ${id}`;
    }
    if (body.short_summary !== undefined) {
      await sql`UPDATE calls SET short_summary = ${body.short_summary}, oneliner = ${body.short_summary.slice(0, 80)} WHERE id = ${id}`;
    }

    const updated = await sql`SELECT * FROM calls WHERE id = ${id}`;
    return NextResponse.json(updated[0] || {});
  } catch (error) {
    console.error("Update call error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM calls WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete call error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
