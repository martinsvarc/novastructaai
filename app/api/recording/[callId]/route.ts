import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  if (!callId) {
    return NextResponse.json({ error: "Missing callId" }, { status: 400 });
  }

  const sql = getDb();
  const settings = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
  const apiKey = process.env.ULTRAVOX_API_KEY || settings[0]?.ultravox_api_key;

  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.ultravox.ai/api/calls/${callId}/recording`,
    { headers: { "X-API-Key": apiKey } }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Recording not available" },
      { status: 404 }
    );
  }

  const audioData = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "audio/wav";

  return new NextResponse(audioData, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
