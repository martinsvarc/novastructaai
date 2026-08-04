import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function maskCred(val: string): string {
  if (!val || val.length < 4) return val ? "****" : "";
  return "****" + val.slice(-4);
}

export async function GET() {
  const sql = getDb();
  const rows = await sql`SELECT * FROM settings WHERE id = 1`;
  if (rows.length === 0) {
    return NextResponse.json({ error: "No settings found" }, { status: 404 });
  }

  const s = rows[0];
  return NextResponse.json({
    system_prompt: s.system_prompt,
    opener: s.opener || "hey there",
    opener_speaks_first: s.opener_speaks_first !== false,
    transfer_enabled: s.transfer_enabled,
    closers: s.closers,
    twilio_sid: maskCred(s.twilio_sid),
    twilio_auth_token: maskCred(s.twilio_auth_token),
    twilio_phone: s.twilio_phone,
    ultravox_api_key: maskCred(s.ultravox_api_key),
    ultravox_agent_id: s.ultravox_agent_id,
    ultravox_voice_id: s.ultravox_voice_id,
    ghl_calendar_id: s.ghl_calendar_id,
    scenario_a_script: s.scenario_a_script || "",
    scenario_b_script: s.scenario_b_script || "",
    transfer_connecting_msg: s.transfer_connecting_msg || "Connecting you now.",
    transfer_retry_msg: s.transfer_retry_msg || "Let me try another consultant for you.",
    scenario_a_opener: s.scenario_a_opener || "Hey, I'm sorry about the wait. All our advisors are finishing up with other homeowners right now — which actually means they're in high demand. Here's what I'll do...",
    transfer_error_msg: s.transfer_error_msg || "Our consultant is unavailable right now. We will have someone call you back shortly.",
    inactivity_1_seconds: s.inactivity_1_seconds ?? 8,
    inactivity_1_message: s.inactivity_1_message || "Hey, are you still there?",
    inactivity_2_seconds: s.inactivity_2_seconds ?? 10,
    inactivity_2_message: s.inactivity_2_message || "I'm having a little trouble hearing you... are you there?",
    vad_sensitivity: s.vad_sensitivity ?? 0.15,
    business_hours: s.business_hours || {
      monday: { enabled: true, open: "09:00", close: "18:00" },
      tuesday: { enabled: true, open: "09:00", close: "18:00" },
      wednesday: { enabled: true, open: "09:00", close: "18:00" },
      thursday: { enabled: true, open: "09:00", close: "18:00" },
      friday: { enabled: true, open: "09:00", close: "18:00" },
      saturday: { enabled: true, open: "09:00", close: "14:00" },
      sunday: { enabled: false, open: "", close: "" },
    },
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const sql = getDb();

  // Build dynamic update — only update fields that are sent
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 0;

  const fields: Record<string, string> = {
    system_prompt: "system_prompt",
    opener: "opener",
    opener_speaks_first: "opener_speaks_first",
    transfer_enabled: "transfer_enabled",
    closers: "closers",
    twilio_sid: "twilio_sid",
    twilio_auth_token: "twilio_auth_token",
    twilio_phone: "twilio_phone",
    ultravox_api_key: "ultravox_api_key",
    ultravox_agent_id: "ultravox_agent_id",
    ultravox_voice_id: "ultravox_voice_id",
    ghl_calendar_id: "ghl_calendar_id",
    business_hours: "business_hours",
    scenario_a_script: "scenario_a_script",
    scenario_b_script: "scenario_b_script",
    transfer_connecting_msg: "transfer_connecting_msg",
    transfer_retry_msg: "transfer_retry_msg",
    scenario_a_opener: "scenario_a_opener",
    transfer_error_msg: "transfer_error_msg",
    inactivity_1_seconds: "inactivity_1_seconds",
    inactivity_1_message: "inactivity_1_message",
    inactivity_2_seconds: "inactivity_2_seconds",
    inactivity_2_message: "inactivity_2_message",
    vad_sensitivity: "vad_sensitivity",
  };

  for (const [key, col] of Object.entries(fields)) {
    if (key in body) {
      const val = body[key];
      // Skip masked credential values
      if (typeof val === "string" && val.startsWith("****")) continue;

      if (key === "closers" || key === "business_hours") {
        updates.push(`${col} = $${++idx}::jsonb`);
        values.push(JSON.stringify(val));
      } else if (key === "transfer_enabled") {
        updates.push(`${col} = $${++idx}`);
        values.push(Boolean(val));
      } else {
        updates.push(`${col} = $${++idx}`);
        values.push(val);
      }
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ ok: true });
  }

  updates.push(`updated_at = NOW()`);

  // Use raw query since we need dynamic updates
  const query = `UPDATE settings SET ${updates.join(", ")} WHERE id = 1`;

  // neon() tagged template doesn't support dynamic queries easily,
  // so we'll do individual field updates
  // Actually, let's just update all provided fields at once using the neon sql
  const current = await sql`SELECT * FROM settings WHERE id = 1`;
  if (current.length === 0) {
    return NextResponse.json({ error: "No settings found" }, { status: 404 });
  }

  const row = current[0];

  const newSystemPrompt =
    "system_prompt" in body ? body.system_prompt : row.system_prompt;
  const newOpener =
    "opener" in body ? body.opener : (row.opener || "hey there");
  const newOpenerSpeaksFirst =
    "opener_speaks_first" in body
      ? Boolean(body.opener_speaks_first)
      : row.opener_speaks_first !== false;
  const newTransferEnabled =
    "transfer_enabled" in body
      ? Boolean(body.transfer_enabled)
      : row.transfer_enabled;
  const newClosers =
    "closers" in body ? JSON.stringify(body.closers) : JSON.stringify(row.closers);
  const newTwilioSid =
    "twilio_sid" in body && !String(body.twilio_sid).startsWith("****")
      ? body.twilio_sid
      : row.twilio_sid;
  const newTwilioAuth =
    "twilio_auth_token" in body &&
    !String(body.twilio_auth_token).startsWith("****")
      ? body.twilio_auth_token
      : row.twilio_auth_token;
  const newTwilioPhone =
    "twilio_phone" in body ? body.twilio_phone : row.twilio_phone;
  const newUltravoxKey =
    "ultravox_api_key" in body &&
    !String(body.ultravox_api_key).startsWith("****")
      ? body.ultravox_api_key
      : row.ultravox_api_key;
  const newUltravoxAgentId =
    "ultravox_agent_id" in body
      ? body.ultravox_agent_id
      : row.ultravox_agent_id;
  const newUltravoxVoiceId =
    "ultravox_voice_id" in body
      ? body.ultravox_voice_id
      : row.ultravox_voice_id;
  const newGhlCalendarId =
    "ghl_calendar_id" in body ? body.ghl_calendar_id : row.ghl_calendar_id;
  const newBusinessHours =
    "business_hours" in body
      ? JSON.stringify(body.business_hours)
      : JSON.stringify(row.business_hours || {});
  const newScenarioAScript =
    "scenario_a_script" in body ? body.scenario_a_script : (row.scenario_a_script || "");
  const newScenarioBScript =
    "scenario_b_script" in body ? body.scenario_b_script : (row.scenario_b_script || "");
  const newTransferConnectingMsg =
    "transfer_connecting_msg" in body ? body.transfer_connecting_msg : (row.transfer_connecting_msg || "Connecting you now.");
  const newTransferRetryMsg =
    "transfer_retry_msg" in body ? body.transfer_retry_msg : (row.transfer_retry_msg || "Let me try another consultant for you.");
  const newScenarioAOpener =
    "scenario_a_opener" in body ? body.scenario_a_opener : (row.scenario_a_opener || "");
  const newTransferErrorMsg =
    "transfer_error_msg" in body ? body.transfer_error_msg : (row.transfer_error_msg || "Our consultant is unavailable right now. We will have someone call you back shortly.");
  const newInactivity1Seconds =
    "inactivity_1_seconds" in body ? Number(body.inactivity_1_seconds) : (row.inactivity_1_seconds ?? 8);
  const newInactivity1Message =
    "inactivity_1_message" in body ? body.inactivity_1_message : (row.inactivity_1_message || "Hey, are you still there?");
  const newInactivity2Seconds =
    "inactivity_2_seconds" in body ? Number(body.inactivity_2_seconds) : (row.inactivity_2_seconds ?? 10);
  const newInactivity2Message =
    "inactivity_2_message" in body ? body.inactivity_2_message : (row.inactivity_2_message || "I'm having a little trouble hearing you... are you there?");
  const newVadSensitivity =
    "vad_sensitivity" in body ? Number(body.vad_sensitivity) : (row.vad_sensitivity ?? 0.15);

  await sql`
    UPDATE settings SET
      system_prompt = ${newSystemPrompt},
      opener = ${newOpener},
      opener_speaks_first = ${newOpenerSpeaksFirst},
      transfer_enabled = ${newTransferEnabled},
      closers = ${newClosers}::jsonb,
      twilio_sid = ${newTwilioSid},
      twilio_auth_token = ${newTwilioAuth},
      twilio_phone = ${newTwilioPhone},
      ultravox_api_key = ${newUltravoxKey},
      ultravox_agent_id = ${newUltravoxAgentId},
      ultravox_voice_id = ${newUltravoxVoiceId},
      ghl_calendar_id = ${newGhlCalendarId},
      business_hours = ${newBusinessHours}::jsonb,
      scenario_a_script = ${newScenarioAScript},
      scenario_b_script = ${newScenarioBScript},
      transfer_connecting_msg = ${newTransferConnectingMsg},
      transfer_retry_msg = ${newTransferRetryMsg},
      scenario_a_opener = ${newScenarioAOpener},
      transfer_error_msg = ${newTransferErrorMsg},
      inactivity_1_seconds = ${newInactivity1Seconds},
      inactivity_1_message = ${newInactivity1Message},
      inactivity_2_seconds = ${newInactivity2Seconds},
      inactivity_2_message = ${newInactivity2Message},
      vad_sensitivity = ${newVadSensitivity},
      updated_at = NOW()
    WHERE id = 1
  `;

  return NextResponse.json({ ok: true });
}
