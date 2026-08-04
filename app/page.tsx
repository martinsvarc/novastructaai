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
}

export default function CallLogPage() {
  const [calls, setCalls] = useState<CallRow[] | null>(null);

  useEffect(() => {
    fetch("/api/calls")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCalls(data))
      .catch(() => setCalls([]));
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

  return <CallLog calls={calls} />;
}
