export default function ChannelsLoading() {
  return (
    <div className="skeleton-fade-in">
      <div className="page-header">
        <div className="page-tag">Number Management</div>
        <h2>Channels</h2>
      </div>
      <div className="skeleton-stats">
        {[90, 70, 60, 90].map((w, i) => (
          <div key={i} className="skeleton-stat">
            <div className="skeleton" style={{ width: 32, height: 28 }} />
            <div className="skeleton" style={{ width: w, height: 10 }} />
          </div>
        ))}
      </div>
      <div className="skeleton-card">
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", opacity: 1 - (i - 1) * 0.2, borderBottom: i < 3 ? "1px solid var(--line)" : "none" }}>
            <div className="skeleton" style={{ width: 8, height: 8, borderRadius: "50%" }} />
            <div className="skeleton" style={{ width: 100, height: 14 }} />
            <div className="skeleton" style={{ width: 120, height: 12 }} />
            <div style={{ flex: 1 }} />
            <div className="skeleton" style={{ width: 36, height: 12 }} />
            <div className="skeleton" style={{ width: 36, height: 12 }} />
            <div className="skeleton" style={{ width: 50, height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
