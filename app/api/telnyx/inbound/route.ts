import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const APP_URL_RAW =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_URL = APP_URL_RAW.replace(/\/+$/, "");

interface Closer {
  name: string;
  phone: string;
  priority: number;
}

interface DayHours {
  enabled: boolean;
  open: string;
  close: string;
}

function populatePrompt(
  template: string,
  vars: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

function getTimeSinceSubmission(submittedAt?: string): string {
  if (!submittedAt) return "recently";
  const diff = Date.now() - new Date(submittedAt).getTime();
  const minutes = diff / (1000 * 60);
  if (minutes < 3) return "just now, moments ago";
  if (minutes < 15) return "a few minutes ago";
  if (minutes < 60) return "within the last hour";
  const hours = diff / (1000 * 60 * 60);
  if (hours < 3) return "a couple hours ago";
  if (hours < 12) return "earlier today";
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 2) return "yesterday";
  if (days < 7) return "a few days ago";
  return "a while back";
}

function isBusinessHours(
  businessHours: Record<string, DayHours> | null
): boolean {
  if (!businessHours) return true;

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")!.value.toLowerCase();
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);

  const day = businessHours[weekday];
  if (!day || !day.enabled) return false;

  const currentMinutes = hour * 60 + minute;
  const [openH, openM] = day.open.split(":").map(Number);
  const [closeH, closeM] = day.close.split(":").map(Number);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  console.log(
    `Business hours check: ${weekday} ${hour}:${minute.toString().padStart(2, "0")} ET — ` +
    `window ${day.open}-${day.close} — ${currentMinutes >= openMinutes && currentMinutes < closeMinutes ? "OPEN" : "CLOSED"}`
  );

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

interface LookupResult {
  found: boolean;
  name?: string;
  contactId?: string;
  billAmount?: string;
  creditRange?: string;
  homeowner?: boolean;
  email?: string;
  submittedAt?: string;
}

async function lookupContactBeforeCall(
  phone: string
): Promise<LookupResult | null> {
  const n8nUrl = process.env.N8N_LOOKUP_CONTACT_URL;
  if (!n8nUrl || !phone) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.found) return null;
    return data as LookupResult;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Telnyx sends JSON webhooks
    const webhook = await req.json();
    const eventType = webhook?.data?.event_type;

    // Only handle inbound call.initiated events
    if (eventType !== "call.initiated") {
      return NextResponse.json({ ok: true });
    }

    const payload = webhook.data.payload;

    // CRITICAL: Ignore outbound calls to prevent infinite loops from warm-transfer
    if (payload.direction !== "incoming") {
      console.log("Ignoring non-incoming call:", payload.direction);
      return NextResponse.json({ ok: true });
    }

    const callerPhone = payload.from || "";
    const callControlId = payload.call_control_id || "";
    const channelPhone = payload.to || "";

    console.log("Telnyx inbound:", callerPhone, "→", channelPhone, "ccid:", callControlId);

    const sql = getDb();

    // Fetch settings
    const settingsRows = await sql`SELECT * FROM settings WHERE id = 1`;

    if (settingsRows.length === 0) {
      // Answer and say not configured, then hang up
      const telnyxApiKey = process.env.TELNYX_API_KEY || "";
      await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
        body: JSON.stringify({ client_state: "" }),
      });
      await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
        body: JSON.stringify({ payload: "System not configured.", language: "en-US", voice: "female" }),
      });
      return NextResponse.json({ ok: true });
    }

    const settings = settingsRows[0];

    // Check for channel-specific scripts — normalize phone for matching
    const cleanChannelPhone = channelPhone.replace(/[^+\d]/g, "");
    const channelRows = await sql`SELECT * FROM channels WHERE phone = ${cleanChannelPhone} OR phone = ${channelPhone}`;
    const channel = channelRows.length > 0 ? channelRows[0] : null;
    if (channel) {
      console.log("Channel matched:", channel.name, channel.phone, "— using channel-specific script:", !!channel.system_prompt);
    } else {
      console.log("No channel match for", channelPhone, "— using global settings");
    }

    // Answer the call first via Telnyx Call Control
    const telnyxApiKey = process.env.TELNYX_API_KEY || "";
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
      body: JSON.stringify({ client_state: "" }),
    });

    // Pre-call GHL lookup via N8N (2s timeout, fallback to empty strings)
    const lookup = await lookupContactBeforeCall(callerPhone);

    const contactId = lookup?.contactId || "unknown";
    const leadName = lookup?.name || "";

    const templateVars: Record<string, string> = {
      leadName,
      leadPhone: callerPhone,
      billAmount: lookup?.billAmount || "",
      creditRange: lookup?.creditRange || "",
      homeowner:
        lookup?.homeowner !== undefined
          ? lookup.homeowner
            ? "yes"
            : "no"
          : "",
      email: lookup?.email || "",
      timeSinceSubmission: getTimeSinceSubmission(lookup?.submittedAt),
    };

    // Use channel script if it exists, otherwise fall back to global settings
    let systemPrompt = populatePrompt(
      (channel?.system_prompt || settings.system_prompt || ""),
      templateVars
    );

    const closers = ((channel?.closers?.length ? channel.closers : settings.closers) || []) as Closer[];

    const channelBizHours = channel?.business_hours as Record<string, DayHours> | null;
    const duringBusinessHours = isBusinessHours(
      (channelBizHours && Object.keys(channelBizHours).length ? channelBizHours : settings.business_hours) as Record<string, DayHours> | null
    );

    const scenarioAScript = channel?.scenario_a_script || settings.scenario_a_script ||
      "All our advisors are finishing up with other homeowners right now. I'm sending you a text right now so you stay at the front of the line. Just reply 'Hi' to confirm and an advisor will call you back within 15 minutes. Sound good?";
    const scenarioBScript = channel?.scenario_b_script || settings.scenario_b_script ||
      "Great news — you do qualify for the program. Our advisors are off for the evening, but I don't want you to lose your spot. I'm locking in your information right now, and first thing tomorrow morning one of our advisors will give you a personal call. What time works best for you — earlier in the morning or later in the afternoon?";

    if (duringBusinessHours) {
      const closerNames = closers
        .sort((a, b) => a.priority - b.priority)
        .map((c) => c.name)
        .join(", ");

      const directive = `THIS IS DURING BUSINESS HOURS.

THE CLOSE — LIVE TRANSFER
Once all four gates are confirmed, say something like: "Great, you qualify for our program... please hold while I find an available advisor for you. Okay, I found one — I'm transferring you now." Then call the transferCall tool immediately. Do NOT ask for their address. Do NOT offer to schedule.
${closerNames ? `Available consultants: ${closerNames}.` : ""}

IF TRANSFER FAILS (you'll get an error response from transferCall):
Use the Scenario A approach — deliver this naturally in your own words: "${scenarioAScript}" Then call sendTextScenarioA after they confirm.

ENDING CALLS: Never hang up abruptly. After any scenario completes, always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good.
——————————————————————————\n\n`;

      systemPrompt = directive + systemPrompt + `\n\n——————————————————————————
REMINDER: Use transferCall the moment the lead qualifies. If transfer fails, fall back to sendTextScenarioA. Never hang up without saying goodbye and giving them a chance to respond.`;
    } else {
      const directive = `AFTER HOURS MODE — SCENARIO B.

It is currently after business hours. Our advisors are not available right now.

THE CLOSE — AFTER HOURS LOCK-IN
Once all four gates are confirmed, deliver this naturally in your own words: "${scenarioBScript}"

After they give a preference, call the notifyScenarioB tool with their timePreference (e.g. "morning" or "afternoon"). Then confirm warmly that they're locked in.

ENDING CALLS: Never hang up abruptly. Always ask "Is there anything else before I let you go?" and wait for their response. Only use hangUp after they say goodbye or confirm they're good. Do NOT attempt to transfer. Do NOT ask for their address.
——————————————————————————\n\n`;

      systemPrompt = directive + systemPrompt;
    }

    // Build selectedTools
    const selectedTools: object[] = [
      {
        temporaryTool: {
          modelToolName: "lookupContact",
          description:
            "Look up information about the lead calling based on their phone number. Only use this if specific data is missing.",
          dynamicParameters: [],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/lookup-contact`,
            httpMethod: "POST",
          },
        },
      },
      { toolName: "hangUp" },
      {
        temporaryTool: {
          modelToolName: "holdLine",
          description:
            "Put the call on hold when the caller asks for a moment. If they said how long, use that duration. Only ask how long if they were vague.",
          defaultReaction: "AGENT_REACTION_LISTENS",
          timeout: "120s",
          dynamicParameters: [
            {
              name: "waitSeconds",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description: "Seconds to wait. 'a minute' = 60, '30 seconds' = 30.",
              },
              required: true,
            },
          ],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
            { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
            { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/hold-line`,
            httpMethod: "POST",
          },
        },
      },
    ];

    if (duringBusinessHours) {
      selectedTools.push({
        temporaryTool: {
          modelToolName: "transferCall",
          description:
            "Transfer this call to a live consultant. Call this tool the moment the lead is qualified.",
          defaultReaction: "AGENT_REACTION_SPEAKS",
          dynamicParameters: [],
          staticParameters: [
            { name: "callControlId", location: "PARAMETER_LOCATION_BODY", value: callControlId },
            { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
          ],
          automaticParameters: [
            { name: "ultravoxCallId", location: "PARAMETER_LOCATION_BODY", knownValue: "KNOWN_PARAM_CALL_ID" },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/warm-transfer`,
            httpMethod: "POST",
          },
        },
      });

      selectedTools.push({
        temporaryTool: {
          modelToolName: "sendTextScenarioA",
          description:
            "Send a callback text to the lead when all advisors are busy. Only use this if transferCall failed.",
          dynamicParameters: [],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
            { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
            { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/scenario-a`,
            httpMethod: "POST",
          },
        },
      });
    } else {
      selectedTools.push({
        temporaryTool: {
          modelToolName: "notifyScenarioB",
          description:
            "Lock in the lead's information for a morning callback. Use this after hours when the lead is qualified.",
          dynamicParameters: [
            {
              name: "timePreference",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description: "The lead's preferred callback time — 'morning' or 'afternoon'",
              },
              required: true,
            },
          ],
          staticParameters: [
            { name: "phone", location: "PARAMETER_LOCATION_BODY", value: callerPhone },
            { name: "leadName", location: "PARAMETER_LOCATION_BODY", value: leadName },
            { name: "contactId", location: "PARAMETER_LOCATION_BODY", value: contactId },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/scenario-b`,
            httpMethod: "POST",
          },
        },
      });
    }

    // Use ULTRAVOX_API_KEY env var (set in Vercel), fall back to DB setting
    const ultravoxApiKey = process.env.ULTRAVOX_API_KEY || settings.ultravox_api_key || "";

    // Create Ultravox call with Telnyx medium
    const ultravoxRes = await fetch("https://api.ultravox.ai/api/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ultravoxApiKey,
      },
      body: JSON.stringify({
        systemPrompt,
        model: "fixie-ai/ultravox-v0.7",
        voice: settings.ultravox_voice_id || undefined,
        medium: { telnyx: { callControlId, telnyxApiKey: telnyxApiKey } },
        callbacks: { ended: { url: `${APP_URL}/api/webhooks/ultravox` } },
        firstSpeakerSettings: (channel?.opener_speaks_first !== undefined ? channel.opener_speaks_first !== false : settings.opener_speaks_first !== false)
          ? { agent: { text: channel?.opener || settings.opener || "hey there" } }
          : { user: {} },
        recordingEnabled: true,
        selectedTools,
        inactivityMessages: [
          {
            duration: `${settings.inactivity_1_seconds ?? 8}s`,
            message: settings.inactivity_1_message || "Hey, are you still there?",
          },
          {
            duration: `${settings.inactivity_2_seconds ?? 10}s`,
            message: settings.inactivity_2_message || "I'm having a little trouble hearing you... are you there?",
            endBehavior: "END_BEHAVIOR_HANG_UP_SOFT",
          },
        ],
        experimentalSettings: {
          turnEndpointDelay: 384,
          frameActivationThreshold: settings.vad_sensitivity ?? 0.15,
        },
        maxDuration: "600s",
        timeExceededMessage: "We've been on for a while. I'll have someone follow up with you. Have a great day!",
        metadata: {
          contactId,
          leadPhone: callerPhone,
          leadName,
          channelPhone,
        },
      }),
    });

    if (!ultravoxRes.ok) {
      const err = await ultravoxRes.text();
      console.error("Ultravox API error:", ultravoxRes.status, err);
      await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${telnyxApiKey}` },
        body: JSON.stringify({ payload: "We are experiencing technical difficulties. Please try again later.", language: "en-US", voice: "female" }),
      });
      return NextResponse.json({ ok: true });
    }

    const ultravoxData = await ultravoxRes.json();
    console.log("Ultravox call created:", ultravoxData.callId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telnyx inbound error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
