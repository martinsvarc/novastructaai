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
  if (!businessHours) return true; // default to business hours if not configured

  // Use Intl.DateTimeFormat to reliably get Eastern Time components
  // This avoids the unreliable toLocaleString → new Date() re-parse pattern
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
    const formData = await req.text();
    const params = new URLSearchParams(formData);
    const callerPhone = params.get("From") || "";
    const callSid = params.get("CallSid") || "";
    const channelPhone = params.get("To") || "";

    const sql = getDb();

    // Fetch settings
    const settingsRows = await sql`SELECT * FROM settings WHERE id = 1`;

    if (settingsRows.length === 0) {
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>System not configured.</Say></Response>',
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    const settings = settingsRows[0];

    // Pre-call GHL lookup via N8N (2s timeout, fallback to empty strings)
    const lookup = await lookupContactBeforeCall(callerPhone);

    const contactId = lookup?.contactId || "unknown";
    const leadName = lookup?.name || "";

    // Build template vars with real data from GHL if available
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

    let systemPrompt = populatePrompt(
      settings.system_prompt || "",
      templateVars
    );

    // Determine if we're within business hours
    const closers = (settings.closers || []) as Closer[];
    const duringBusinessHours = isBusinessHours(
      settings.business_hours as Record<string, DayHours> | null
    );

    // Read scenario scripts from settings (fall back to defaults)
    const scenarioAScript = settings.scenario_a_script ||
      "All our advisors are finishing up with other homeowners right now — which actually means they're in high demand. Here's what I'll do: I'm sending you a text right now so you stay at the front of the line. Just reply 'Hi' to confirm and an advisor will call you back within 15 minutes. Sound good?";
    const scenarioBScript = settings.scenario_b_script ||
      "Great news — based on what you've told me, you do qualify for the program. The thing is, our advisors are off for the evening, but I don't want you to lose your spot. Here's what I'm going to do: I'm locking in your information right now, and first thing tomorrow morning one of our advisors will give you a personal call. What time works best for you — earlier in the morning or later in the afternoon?";

    // Inject scenario-specific directive based on business hours
    if (duringBusinessHours) {
      // Business hours → try live transfer, Scenario A fallback if no answer
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
      // After hours → Scenario B
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
            "Look up information about the lead calling based on their phone number. The caller's information is already loaded in your context — only use this tool if specific data is missing or needs refreshing mid-call. Do not call it at the start of every call.",
          dynamicParameters: [],
          staticParameters: [
            {
              name: "phone",
              location: "PARAMETER_LOCATION_BODY",
              value: callerPhone,
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/lookup-contact`,
            httpMethod: "POST",
          },
        },
      },
      {
        toolName: "hangUp",
      },
      {
        temporaryTool: {
          modelToolName: "holdLine",
          description:
            "Put the call on hold when the caller asks for a moment, says they need a minute, or asks you to wait. If they already said how long (e.g. 'give me 10 seconds', 'one minute'), say 'No problem, take your time' and call this tool immediately with that duration. Only ask how long if they were vague (e.g. just 'hold on' or 'give me a sec' with no specific time) — in that case ask naturally like 'Sure, how long do you need?' Do NOT use this for normal conversational pauses.",
          defaultReaction: "AGENT_REACTION_LISTENS",
          timeout: "120s",
          dynamicParameters: [
            {
              name: "waitSeconds",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description: "How many seconds to wait. Convert what the caller said to seconds — e.g. 'a minute' = 60, '30 seconds' = 30, 'a couple minutes' = 120, 'a sec' = 15.",
              },
              required: true,
            },
          ],
          staticParameters: [
            {
              name: "phone",
              location: "PARAMETER_LOCATION_BODY",
              value: callerPhone,
            },
            {
              name: "leadName",
              location: "PARAMETER_LOCATION_BODY",
              value: leadName,
            },
            {
              name: "contactId",
              location: "PARAMETER_LOCATION_BODY",
              value: contactId,
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/hold-line`,
            httpMethod: "POST",
          },
        },
      },
    ];

    if (duringBusinessHours) {
      // Business hours — transfer + Scenario A fallback
      selectedTools.push({
        temporaryTool: {
          modelToolName: "transferCall",
          description:
            "Transfer this call to a live solar energy consultant. Call this tool the moment the lead is qualified — do not ask, do not offer to schedule, just transfer. If the transfer fails, fall back to sendTextScenarioA.",
          defaultReaction: "AGENT_REACTION_SPEAKS",
          dynamicParameters: [],
          staticParameters: [
            {
              name: "callSid",
              location: "PARAMETER_LOCATION_BODY",
              value: callSid,
            },
            {
              name: "accountSid",
              location: "PARAMETER_LOCATION_BODY",
              value: params.get("AccountSid") || settings.twilio_sid || "",
            },
            {
              name: "contactId",
              location: "PARAMETER_LOCATION_BODY",
              value: contactId,
            },
          ],
          automaticParameters: [
            {
              name: "ultravoxCallId",
              location: "PARAMETER_LOCATION_BODY",
              knownValue: "KNOWN_PARAM_CALL_ID",
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/warm-transfer`,
            httpMethod: "POST",
          },
        },
      });

      // Scenario A as fallback when transfer fails
      selectedTools.push({
        temporaryTool: {
          modelToolName: "sendTextScenarioA",
          description:
            "Send a callback text to the lead when all advisors are busy. Only use this if transferCall failed. This sends an SMS asking the lead to reply 'Hi' to confirm their callback spot.",
          dynamicParameters: [],
          staticParameters: [
            {
              name: "phone",
              location: "PARAMETER_LOCATION_BODY",
              value: callerPhone,
            },
            {
              name: "leadName",
              location: "PARAMETER_LOCATION_BODY",
              value: leadName,
            },
            {
              name: "contactId",
              location: "PARAMETER_LOCATION_BODY",
              value: contactId,
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/scenario-a`,
            httpMethod: "POST",
          },
        },
      });
    } else {
      // After hours — Scenario B
      selectedTools.push({
        temporaryTool: {
          modelToolName: "notifyScenarioB",
          description:
            "Lock in the lead's information for a morning callback. Use this after hours when the lead is qualified and has given a time preference (morning or afternoon). This notifies the team to call them back first thing.",
          dynamicParameters: [
            {
              name: "timePreference",
              location: "PARAMETER_LOCATION_BODY",
              schema: {
                type: "string",
                description:
                  "The lead's preferred callback time — 'morning' or 'afternoon'",
              },
              required: true,
            },
          ],
          staticParameters: [
            {
              name: "phone",
              location: "PARAMETER_LOCATION_BODY",
              value: callerPhone,
            },
            {
              name: "leadName",
              location: "PARAMETER_LOCATION_BODY",
              value: leadName,
            },
            {
              name: "contactId",
              location: "PARAMETER_LOCATION_BODY",
              value: contactId,
            },
          ],
          http: {
            baseUrlPattern: `${APP_URL}/api/tools/scenario-b`,
            httpMethod: "POST",
          },
        },
      });
    }

    // Create Ultravox call
    const ultravoxRes = await fetch("https://api.ultravox.ai/api/calls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": settings.ultravox_api_key || "",
      },
      body: JSON.stringify({
        systemPrompt,
        model: "fixie-ai/ultravox-v0.7",
        voice: settings.ultravox_voice_id || undefined,
        medium: { twilio: {} },
        firstSpeakerSettings: settings.opener_speaks_first !== false
          ? { agent: { text: settings.opener || "hey there" } }
          : { user: {} },
        recordingEnabled: true,
        selectedTools,
        // Silence detection — handled at audio level, not prompt level
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
        // VAD tuning — higher threshold = less false triggers from background noise
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
      console.error("Request body:", JSON.stringify({ systemPrompt: systemPrompt.slice(0, 100) + "...", selectedTools }, null, 2));
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Say>We are experiencing technical difficulties. Please try again later.</Say></Response>',
        { headers: { "Content-Type": "text/xml" } }
      );
    }

    const ultravoxData = await ultravoxRes.json();
    const joinUrl = ultravoxData.joinUrl;

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Connect>\n    <Stream url="${joinUrl}" />\n  </Connect>\n</Response>`;

    return new NextResponse(twiml, {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio inbound error:", error);
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again later.</Say></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }
}
