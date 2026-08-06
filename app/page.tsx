"use client";

import { useEffect, useState } from "react";
import { CallLog } from "./call-log";

interface CallRow {
  id: number;
  lead_name: string;
  phone: string;
  outcome: string;
  outcome_sub: string;
  oneliner: string;
  ghl_contact_url: string;
  duration_seconds: number;
  recording_url: string;
  short_summary: string;
  created_at: string;
  channel_phone?: string;
}

interface ChannelInfo {
  id: number;
  name: string;
  phone: string;
  color: string;
}

export default function CallLogPage() {
  const [calls, setCalls] = useState<CallRow[] | null>(null);
  const [channels, setChannels] = useState<ChannelInfo[]>([]);

  useEffect(() => {
    fetch("/api/calls")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCalls(data))
      .catch(() => setCalls([]));

    fetch("/api/channels")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setChannels(data))
      .catch(() => setChannels([]));
  }, []);

  if (!calls) {
    return (
      <div>
        <div className="page-header">
          <div className="page-tag">Inbound Voice</div>
          <h2>Call Log</h2>
        </div>
        <div style={{ opacity: 0.4, padding: "40px 0", textAlign: "center", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Loading...
        </div>
      </div>
    );
  }

  return <CallLog calls={calls} channels={channels} />;
}
