import { getDb } from "@/lib/db";
import { CallLog } from "./call-log";

export const dynamic = "force-dynamic";

export default async function CallLogPage() {
  const sql = getDb();

  const [calls, channels] = await Promise.all([
    sql`SELECT id, lead_name, phone, outcome, outcome_sub, oneliner, ghl_contact_url, duration_seconds, recording_url, short_summary, created_at, channel_phone, call_details FROM calls ORDER BY created_at DESC LIMIT 200`,
    sql`SELECT id, name, phone, color FROM channels ORDER BY created_at ASC`,
  ]);

  return <CallLog calls={calls as any} channels={channels as any} />;
}
