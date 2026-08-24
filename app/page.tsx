import { getDb } from "@/lib/db";
import { CallLog } from "./call-log";

export const dynamic = "force-dynamic";

export default async function CallLogPage() {
  const sql = getDb();

  const [calls, channels] = await Promise.all([
    sql`SELECT * FROM calls ORDER BY created_at DESC`,
    sql`SELECT id, name, phone, color FROM channels ORDER BY created_at ASC`,
  ]);

  return <CallLog calls={calls as any} channels={channels as any} />;
}
