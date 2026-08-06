import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const channelPhone = searchParams.get("channel");

    let rows;
    if (channelPhone) {
      rows = await sql`SELECT * FROM calls WHERE channel_phone = ${channelPhone} ORDER BY created_at DESC`;
    } else {
      rows = await sql`SELECT * FROM calls ORDER BY created_at DESC`;
    }
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([]);
  }
}
