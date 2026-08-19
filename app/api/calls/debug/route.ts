import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

interface UltravoxMessage {
  role: string;
  text?: string;
  toolName?: string;
}

export async function GET() {
  try {
    const sql = getDb();
    const settingsRows = await sql`SELECT ultravox_api_key FROM settings WHERE id = 1`;
    const uvKey = process.env.ULTRAVOX_API_KEY || settingsRows[0]?.ultravox_api_key || "";
    const orKey = process.env.OPENROUTER_API_KEY || "";

    // Get first call with a recording
    const calls = await sql`SELECT id, recording_url FROM calls WHERE recording_url != '' ORDER BY id DESC LIMIT 1`;
    if (calls.length === 0) return NextResponse.json({ error: "No calls with recordings" });

    const callIdMatch = (calls[0].recording_url || "").match(/\/api\/recording\/(.+)/);
    if (!callIdMatch) return NextResponse.json({ error: "No callId" });

    const callId = callIdMatch[1];

    // Fetch messages from Ultravox
    const uvRes = await fetch(
      `https://api.ultravox.ai/api/calls/${callId}/messages`,
      { headers: { "X-API-Key": uvKey } }
    );
    const rawData = await uvRes.json();
    const messages: UltravoxMessage[] = rawData.results || rawData;

    // Build transcript
    const transcript = messages
      .filter((m) => (m.role === "MESSAGE_ROLE_AGENT" || m.role === "MESSAGE_ROLE_USER") && m.text)
      .map((m) => {
        const role = m.role === "MESSAGE_ROLE_AGENT" ? "Agent" : "Caller";
        return `${role}: ${m.text!.trim()}`;
      })
      .join("\n");

    // All unique roles
    const allRoles = [...new Set(messages.map((m) => m.role))];

    // Try OpenRouter extraction
    let orStatus = "not attempted";
    let orResponse = "";
    let orError = "";
    let parsed = null;

    if (orKey && transcript.length >= 50) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${orKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [
              {
                role: "system",
                content: `Extract qualification details from this solar sales call transcript. Return ONLY a JSON object with these fields (omit any that weren't discussed): homeowner, location, dwelling, bill, credit, roof, shade, decision_makers, address, appointment, disqualify_reason. Keep values short. Return valid JSON only, no markdown.`,
              },
              { role: "user", content: transcript },
            ],
            temperature: 0,
          }),
        });

        orStatus = `${res.status} ${res.statusText}`;

        if (!res.ok) {
          orError = await res.text();
        } else {
          const data = await res.json();
          orResponse = data.choices?.[0]?.message?.content || "(empty content)";
          try {
            const jsonStr = orResponse.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
            parsed = JSON.parse(jsonStr);
          } catch (e) {
            orError = `JSON parse failed: ${e}`;
          }
        }
      } catch (e) {
        orError = String(e);
      }
    }

    return NextResponse.json({
      callId,
      totalMessages: messages.length,
      allRoles,
      transcriptLength: transcript.length,
      transcriptPreview: transcript.slice(0, 300),
      hasUltravoxKey: !!uvKey,
      hasOpenRouterKey: !!orKey,
      openrouter: {
        status: orStatus,
        rawResponse: orResponse.slice(0, 500),
        error: orError,
        parsed,
        fieldCount: parsed ? Object.keys(parsed).length : 0,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) });
  }
}
