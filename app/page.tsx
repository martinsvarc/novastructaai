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
      <div className="skeleton-fade-in">
        <div className="page-header">
          <div className="page-tag">Inbound Voice</div>
          <h2>Call Log</h2>
        </div>
        <div className="skeleton-stats">
          {[80, 40, 40, 40, 50, 50, 40].map((w, i) => (
            <div key={i} className="skeleton-stat">
              <div className="skeleton" style={{ width: 32, height: 28 }} />
              <div className="skeleton" style={{ width: w, height: 10 }} />
            </div>
          ))}
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-row" style={{ opacity: 1 - i * 0.15 }}>
            <div className="skeleton" style={{ width: 8, height: 8, borderRadius: "50%" }} />
            <div className="skeleton" style={{ width: 80, height: 18 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="skeleton" style={{ width: "40%", height: 14 }} />
              <div className="skeleton" style={{ width: "65%", height: 10 }} />
            </div>
            <div className="skeleton" style={{ width: 90, height: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  return <CallLog calls={calls} channels={channels} />;
}
