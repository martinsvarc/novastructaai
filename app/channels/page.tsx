import { getDb } from "@/lib/db";
import { ChannelsClient } from "./channels-client";

export const revalidate = 15;

export default async function ChannelsPage() {
  const sql = getDb();

  const channels = await sql`SELECT * FROM channels ORDER BY created_at ASC`;

  const stats = await sql`
    SELECT
      channel_phone,
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE outcome = 'transferred') as transferred,
      COUNT(*) FILTER (WHERE outcome = 'callback') as callbacks,
      COUNT(*) FILTER (WHERE outcome = 'booked') as booked,
      COUNT(*) FILTER (WHERE outcome = 'after_hours') as after_hours,
      COUNT(*) FILTER (WHERE outcome = 'disqualified') as disqualified,
      COUNT(*) FILTER (WHERE outcome = 'dropped') as dropped
    FROM calls
    WHERE created_at >= NOW() - INTERVAL '30 days'
      AND channel_phone IS NOT NULL
    GROUP BY channel_phone
  `;

  const statsMap = new Map(stats.map((s: Record<string, unknown>) => [s.channel_phone, s]));
  const merged = channels.map((ch: Record<string, unknown>) => {
    const s = statsMap.get(ch.phone) || {
      total_calls: 0, transferred: 0, callbacks: 0, booked: 0,
      after_hours: 0, disqualified: 0, dropped: 0,
    };
    const total = Number(s.total_calls) || 0;
    const connected = Number(s.transferred) + Number(s.callbacks) + Number(s.booked) + Number(s.after_hours);
    return {
      ...ch,
      system_prompt: ch.system_prompt || "",
      close_mode: ch.close_mode || "transfer",
      ghl_calendar_id: ch.ghl_calendar_id || "",
      total_calls: total,
      transferred: Number(s.transferred) || 0,
      callbacks: Number(s.callbacks) || 0,
      booked: Number(s.booked) || 0,
      after_hours: Number(s.after_hours) || 0,
      disqualified: Number(s.disqualified) || 0,
      dropped: Number(s.dropped) || 0,
      connected_pct: total > 0 ? Math.round((connected / total) * 100) : 0,
    };
  });

  return <ChannelsClient initialChannels={merged as any} />;
}
