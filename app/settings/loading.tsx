export default function SettingsLoading() {
  return (
    <div className="skeleton-fade-in">
      <div className="page-header">
        <div className="page-tag">Configuration</div>
        <h2>Settings</h2>
      </div>
      {/* Toggle card skeleton */}
      <div className="skeleton-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="skeleton" style={{ width: 140, height: 16 }} />
            <div className="skeleton" style={{ width: 220, height: 10 }} />
          </div>
          <div className="skeleton" style={{ width: 48, height: 26, borderRadius: 13 }} />
        </div>
      </div>
      {/* Closer numbers skeleton */}
      <div className="skeleton-card" style={{ opacity: 0.85 }}>
        <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 16 }} />
        {[1, 2].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div className="skeleton" style={{ width: 24, height: 14 }} />
            <div className="skeleton" style={{ width: 100, height: 14 }} />
            <div className="skeleton" style={{ width: 130, height: 14 }} />
          </div>
        ))}
      </div>
      {/* Prompt skeleton */}
      <div className="skeleton-card" style={{ opacity: 0.7 }}>
        <div className="skeleton" style={{ width: 110, height: 14, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: "100%", height: 120, borderRadius: 8 }} />
      </div>
    </div>
  );
}
